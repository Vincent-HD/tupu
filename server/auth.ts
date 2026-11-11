import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins/email-otp";
import { Cache, Config, Context, Effect, Layer, Option, Redacted } from "effect";
import { Headers } from "effect/http";
import type { Kysely } from "kysely";
import type { Account } from "../src/api/rpc.ts";
import type { ServerTables } from "./db/schema.ts";
import { ServerDatabase } from "./db/server-database.ts";
import { Mailer } from "./mailer.ts";
import { partyFor, type Party } from "./relying-party.ts";

export const authPath = "/api/auth";

const developmentSecret = "tupu-development-secret-do-not-use-in-production";
const year = 60 * 60 * 24 * 365;

const codeMail = (input: { readonly email: string; readonly otp: string }) => ({
  to: input.email,
  subject: `${input.otp} is your Tupu code`,
  text: `Your Tupu sign-in code is ${input.otp}. It expires in 10 minutes. If you did not ask for it, ignore this email.`,
  html: `<p>Your Tupu sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${input.otp}</p><p>It expires in 10 minutes. If you did not ask for it, ignore this email.</p>`,
});

const makeAuth = (input: {
  readonly party: Party;
  readonly secret: string;
  readonly database: Kysely<ServerTables>;
  readonly sendCode: (mail: { readonly email: string; readonly otp: string }) => Promise<void>;
}) =>
  betterAuth({
    appName: "Tupu",
    baseURL: input.party.origin,
    basePath: authPath,
    secret: input.secret,
    // D1 has no interactive transactions, so better-auth never opens one.
    database: { db: input.database, type: "sqlite", transaction: false },
    session: { expiresIn: year, updateAge: 60 * 60 * 24 },
    telemetry: { enabled: false },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: "hashed",
        sendVerificationOTP: (mail) => input.sendCode(mail),
      }),
      passkey({ rpID: input.party.rpId, rpName: "Tupu", origin: input.party.origin }),
    ],
  });

type BetterAuth = ReturnType<typeof makeAuth>;

const toWebHeaders = (headers: Headers.Headers) => new globalThis.Headers(Object.entries(headers));

export class Auth extends Context.Service<
  Auth,
  {
    readonly handle: (request: Request) => Effect.Effect<Response>;
    readonly account: (headers: Headers.Headers) => Effect.Effect<Option.Option<Account>>;
  }
>()("tupu/server/Auth") {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* () {
      const database = yield* ServerDatabase;
      const mailer = yield* Mailer;
      const context = yield* Effect.context<never>();
      const configuredOrigin = yield* Config.option(Config.String("TUPU_ORIGIN")).pipe(
        Effect.map(Option.filter((origin) => origin.trim() !== "")),
      );
      // Production refuses to start without a real secret; development and
      // tests fall back to a fixed one.
      const production =
        (yield* Config.String("NODE_ENV").pipe(Config.withDefault("development"))) === "production";
      const secret = yield* production
        ? Config.Redacted("BETTER_AUTH_SECRET")
        : Config.Redacted("BETTER_AUTH_SECRET").pipe(
            Config.withDefault(Redacted.make(developmentSecret)),
          );

      const sendCode = (mail: { readonly email: string; readonly otp: string }) =>
        Effect.runPromiseWith(context)(mailer.send(codeMail(mail)));

      // Passkeys are bound to the host the browser used, so each origin gets
      // its own instance. The cache keeps a forged Host header from growing it.
      const instances = yield* Cache.make({
        capacity: 8,
        lookup: (origin: string) =>
          Effect.sync(() =>
            makeAuth({
              party: { origin, rpId: new URL(origin).hostname },
              secret: Redacted.value(secret),
              database: database.query,
              sendCode,
            }),
          ),
      });

      const instanceFor = (headers: Headers.Headers): Effect.Effect<BetterAuth> =>
        Cache.get(instances, partyFor({ headers, configured: configuredOrigin }).origin);

      const handle = Effect.fn("Auth.handle")(function* (request: Request) {
        const auth = yield* instanceFor(Headers.fromInput(request.headers));
        return yield* Effect.promise(() => auth.handler(request));
      });

      const account = Effect.fn("Auth.account")(function* (headers: Headers.Headers) {
        const auth = yield* instanceFor(headers);
        const session = yield* Effect.promise(() =>
          auth.api.getSession({ headers: toWebHeaders(headers) }),
        );
        return Option.map(Option.fromNullishOr(session), (found): Account => ({
          id: found.user.id,
          email: found.user.email,
          name: found.user.name,
        }));
      });

      return Auth.of({ handle, account });
    }),
  );
}
