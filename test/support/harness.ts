import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect, Layer, Option, Schema } from "effect";
import { FetchHttpClient, HttpRouter } from "effect/http";
import { Reactivity } from "effect/reactivity";
import { ApiRoutes } from "../../server/api.ts";
import { Mailer, type Mail } from "../../server/mailer.ts";
import { Database } from "../../src/db/database.ts";
import { givenKnowledge } from "../../src/domain/puzzle.ts";
import { solveLogically } from "../../src/domain/solver.ts";
import { AccountStore } from "../../src/services/account-store.ts";
import { Api } from "../../src/services/api.ts";
import { AuthClient } from "../../src/services/auth-client.ts";
import { Games } from "../../src/services/games.ts";
import { Stats } from "../../src/services/stats.ts";
import { Sync } from "../../src/services/sync.ts";
import { makeAuthenticator } from "./authenticator.ts";

export const origin = "http://localhost";
export const rpId = "localhost";

// One in-memory server, reached through its web handler exactly like the
// Worker and the Node server are. Its emails land in `outbox`.
export const makeServer = Effect.acquireRelease(
  Effect.sync(() => {
    const outbox: Array<Mail> = [];
    const mailer = Layer.succeed(
      Mailer,
      Mailer.of({ send: (mail) => Effect.sync(() => void outbox.push(mail)) }),
    );
    const web = HttpRouter.toWebHandler(
      ApiRoutes.pipe(
        Layer.provide(Layer.mergeAll(SqliteClient.layer({ filename: ":memory:" }), mailer)),
      ),
    );
    return { handler: web.handler, dispose: web.dispose, outbox };
  }),
  (server) => Effect.promise(() => server.dispose()),
);

export type Server = Effect.Success<typeof makeServer>;

export const latestCode = (server: Server, email: string) => {
  const mail = server.outbox.findLast((sent) => sent.to === email.toLowerCase());
  return Option.fromNullishOr(mail?.text.match(/\b(\d{6})\b/)?.[1]);
};

// A browser tab: same-origin requests carry the Origin header and the cookies
// the server set earlier.
const browserFetch = (server: Server): typeof fetch => {
  const cookies = new Map<string, string>();
  return async (input, init) => {
    const request = new Request(input, init);
    request.headers.set("origin", origin);
    if (cookies.size > 0)
      request.headers.set(
        "cookie",
        [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      );
    const response = await server.handler(request);
    for (const header of response.headers.getSetCookie()) {
      const [pair = "", ...attributes] = header.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      const expired = attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute));
      if (expired || value === "") cookies.delete(name);
      else cookies.set(name, value);
    }
    return response;
  };
};

// A browser with its own local database and cookies, talking to the server.
export const deviceLayer = (server: Server) =>
  Layer.mergeAll(
    Games.layer,
    Sync.layer,
    AuthClient.layer(`${origin}/api/auth`),
    Stats.layer.pipe(Layer.provide(Games.layer)),
  ).pipe(
    Layer.provideMerge(Api.layer(`${origin}/rpc`)),
    Layer.provideMerge(AccountStore.layer),
    Layer.provideMerge(Database.layer),
    Layer.provide(SqliteClient.layer({ filename: ":memory:" })),
    Layer.provideMerge(Reactivity.layer),
    Layer.provideMerge(Layer.succeed(FetchHttpClient.Fetch, browserFetch(server))),
  );

export type Authenticator = Awaited<ReturnType<typeof makeAuthenticator>>;

export const newAuthenticator = Effect.promise(makeAuthenticator);

export const signInWithCode = Effect.fn("signInWithCode")(function* (input: {
  readonly server: Server;
  readonly email: string;
}) {
  const auth = yield* AuthClient;
  yield* auth.sendCode(input.email);
  const code = latestCode(input.server, input.email);
  if (Option.isNone(code)) return yield* Effect.die("No code was emailed");
  return yield* auth.verifyCode({ email: input.email, code: code.value });
});

export const signUp = Effect.fn("signUp")(function* (input: {
  readonly server: Server;
  readonly email: string;
  readonly name: string;
}) {
  yield* signInWithCode(input);
  const account = yield* (yield* Api).Rename({ name: input.name });
  yield* (yield* AccountStore).rename(account);
  return account;
});

// The two passkey ceremonies, run against better-auth's endpoints the way the
// browser plugin does, with a software authenticator.
const authJson = Effect.fn("authJson")(function* (path: string, body?: unknown) {
  const fetch = yield* FetchHttpClient.Fetch;
  const response = yield* Effect.promise(() =>
    fetch(
      `${origin}/api/auth${path}`,
      body === undefined
        ? { method: "GET" }
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
    ),
  );
  const json: unknown = yield* Effect.promise(() => response.json());
  return { ok: response.ok, json };
});

const challengeOf = (json: unknown) =>
  Schema.decodeUnknownEffect(Schema.Struct({ challenge: Schema.String }))(json).pipe(
    Effect.map((options) => options.challenge),
    Effect.orDie,
  );

export const registerPasskey = Effect.fn("registerPasskey")(function* (
  authenticator: Authenticator,
) {
  const options = yield* authJson("/passkey/generate-register-options");
  if (!options.ok) return options;
  const challenge = yield* challengeOf(options.json);
  const response = yield* Effect.promise(() => authenticator.register({ challenge, rpId, origin }));
  return yield* authJson("/passkey/verify-registration", { response, name: "Test device" });
});

export const signInWithPasskey = Effect.fn("signInWithPasskey")(function* (input: {
  readonly authenticator: Authenticator;
  readonly origin?: string;
}) {
  const options = yield* authJson("/passkey/generate-authenticate-options");
  const challenge = yield* challengeOf(options.json);
  const response = yield* Effect.promise(() =>
    input.authenticator.login({
      challenge,
      rpId,
      origin: input.origin ?? origin,
    }),
  );
  return yield* authJson("/passkey/verify-authentication", { response });
});

// Fills every open cell with the solution, one move per cell, the way a player
// would, so the server's replay check accepts it.
export const solve = Effect.fn("solve")(function* (id: string) {
  const games = yield* Games;
  const game = yield* games.get(id);
  const report = solveLogically(givenKnowledge(game.puzzle));
  const moves = game.puzzle.solutionNumbers.flatMap((number, cell) => [
    ...(game.puzzle.givenNumbers[cell]
      ? []
      : [{ at: 1000 + cell * 100, cell, layer: "number" as const, value: number }]),
    ...(game.puzzle.givenColors[cell]
      ? []
      : [
          {
            at: 1050 + cell * 100,
            cell,
            layer: "color" as const,
            value: game.puzzle.solutionColors[cell] ?? 0,
          },
        ]),
  ]);
  yield* games.complete({
    id,
    progress: { numbers: report.numbers, colors: report.colors },
    moves,
    // Browsers measure time with performance.now(), which has a fraction.
    elapsedMs: 1000 + game.puzzle.size * game.puzzle.size * 100 + 0.37,
    hints: 0,
    checks: 0,
  });
});

// Timestamps have millisecond precision; this keeps "later" strictly later.
export const tick = Effect.sleep("5 millis");

export type Device = Layer.Success<ReturnType<typeof deviceLayer>>;

// Runs a program on a fresh device connected to a fresh server.
export const onDevice = <A, E>(program: (server: Server) => Effect.Effect<A, E, Device>) =>
  Effect.gen(function* () {
    const server = yield* makeServer;
    return yield* program(server).pipe(Effect.provide(deviceLayer(server)));
  }).pipe(Effect.scoped);
