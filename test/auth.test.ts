import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { AccountStore } from "../src/services/account-store.ts";
import { Api } from "../src/services/api.ts";
import { AuthClient } from "../src/services/auth-client.ts";
import {
  deviceLayer,
  latestCode,
  makeServer,
  newAuthenticator,
  onDevice,
  registerPasskey,
  signInWithCode,
  signInWithPasskey,
  signUp,
} from "./support/harness.ts";

const email = "ada@example.com";

const syncError = Effect.flatMap(Api, (api) =>
  Effect.flip(api.Sync({ changes: [], since: 0 })).pipe(Effect.map((error) => error._tag)),
);

describe("email code sign-in", () => {
  it.live("signs up with an emailed code, signs out and signs back in", () =>
    onDevice((server) =>
      Effect.gen(function* () {
        const created = yield* signUp({ server, email: "Ada@Example.com", name: "Ada" });
        expect(created).toMatchObject({ email, name: "Ada" });
        expect(server.outbox.at(-1)?.subject).toMatch(/^\d{6} is your Tupu code$/);
        const stored = yield* (yield* AccountStore).account;
        expect(Option.map(stored, (account) => account.name)).toEqual(Option.some("Ada"));

        yield* (yield* AuthClient).signOut;
        expect(Option.isNone(yield* (yield* AccountStore).account)).toBe(true);
        expect(yield* syncError).toBe("Unauthorized");

        const again = yield* signInWithCode({ server, email });
        expect(again).toEqual(created);
        expect((yield* (yield* Api).Sync({ changes: [], since: 0 })).games).toEqual([]);
      }),
    ),
  );

  it.live("rejects a wrong code and locks the code after too many tries", () =>
    onDevice((server) =>
      Effect.gen(function* () {
        const auth = yield* AuthClient;
        yield* auth.sendCode(email);
        const code = Option.getOrThrow(latestCode(server, email));
        const wrong = code === "000000" ? "111111" : "000000";
        const first = yield* Effect.flip(auth.verifyCode({ email, code: wrong }));
        expect(first.code).toBe("INVALID_OTP");
        for (const _ of [2, 3, 4, 5]) yield* Effect.flip(auth.verifyCode({ email, code: wrong }));
        const locked = yield* Effect.flip(auth.verifyCode({ email, code }));
        expect(locked.code).toBe("TOO_MANY_ATTEMPTS");
        expect(Option.isNone(yield* (yield* AccountStore).account)).toBe(true);
      }),
    ),
  );

  it.live("refuses account calls without a session", () =>
    onDevice(() =>
      Effect.gen(function* () {
        expect(yield* syncError).toBe("Unauthorized");
      }),
    ),
  );
});

describe("passkeys", () => {
  it.live("a passkey saved on one device signs in on another", () =>
    Effect.gen(function* () {
      const server = yield* makeServer;
      const scope = yield* Effect.scope;
      const device = Layer.buildWithScope(deviceLayer(server), scope).pipe(Effect.orDie);
      const a = yield* device;
      const b = yield* device;
      const authenticator = yield* newAuthenticator;

      const created = yield* signUp({ server, email, name: "Ada" }).pipe(Effect.provide(a));
      const saved = yield* registerPasskey(authenticator).pipe(Effect.provide(a));
      expect(saved.ok).toBe(true);

      const signedIn = yield* signInWithPasskey({ authenticator }).pipe(Effect.provide(b));
      expect(signedIn.ok).toBe(true);
      expect(signedIn.json).toMatchObject({ user: { id: created.id, name: "Ada" } });
      const games = yield* Effect.flatMap(Api, (api) => api.Sync({ changes: [], since: 0 })).pipe(
        Effect.provide(b),
      );
      expect(games.games).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live("rejects an unknown passkey, a foreign origin and registration without a session", () =>
    onDevice((server) =>
      Effect.gen(function* () {
        const ada = yield* newAuthenticator;
        const stranger = yield* newAuthenticator;
        expect((yield* registerPasskey(ada)).ok).toBe(false);

        yield* signUp({ server, email, name: "Ada" });
        expect((yield* registerPasskey(ada)).ok).toBe(true);
        yield* (yield* AuthClient).signOut;

        expect((yield* signInWithPasskey({ authenticator: stranger })).ok).toBe(false);
        const phished = yield* signInWithPasskey({
          authenticator: ada,
          origin: "https://evil.example",
        });
        expect(phished.ok).toBe(false);
        expect(yield* syncError).toBe("Unauthorized");

        expect((yield* signInWithPasskey({ authenticator: ada })).ok).toBe(true);
      }),
    ),
  );
});
