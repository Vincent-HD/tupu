import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { Context, Effect, Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import type { Account } from "../api/rpc.ts";
import { AccountStore } from "./account-store.ts";

export class AuthFailed extends Schema.TaggedError<AuthFailed, { readonly brand: unique symbol }>()(
  "AuthFailed",
  { code: Schema.String, message: Schema.String },
) {}

interface AuthResult<A> {
  readonly data: A | null;
  readonly error: {
    readonly code?: string | undefined;
    readonly message?: string | undefined;
  } | null;
}

interface SignedInUser {
  readonly user: { readonly id: string; readonly email: string; readonly name: string };
}

const toAccount = (signedIn: SignedInUser): Account => ({
  id: signedIn.user.id,
  email: signedIn.user.email,
  name: signedIn.user.name,
});

// The browser's fetch must not be called as a method of another object.
const makeClient = (input: {
  readonly baseURL: string;
  readonly fetch: typeof globalThis.fetch;
}) => {
  const fetch = input.fetch;
  return createAuthClient({
    baseURL: input.baseURL,
    plugins: [emailOTPClient(), passkeyClient()],
    fetchOptions: { customFetchImpl: (url, init) => fetch(url, init) },
  });
};

// Signing in needs the network; once signed in, the account is kept locally
// so the app works offline.
export class AuthClient extends Context.Service<
  AuthClient,
  {
    readonly sendCode: (email: string) => Effect.Effect<void, AuthFailed>;
    readonly verifyCode: (input: {
      readonly email: string;
      readonly code: string;
    }) => Effect.Effect<Account, AuthFailed>;
    readonly signInWithPasskey: Effect.Effect<Account, AuthFailed>;
    readonly addPasskey: Effect.Effect<void, AuthFailed>;
    readonly signOut: Effect.Effect<void>;
  }
>()("tupu/services/AuthClient") {
  static readonly layer = (baseURL: string) =>
    Layer.effect(
      AuthClient,
      Effect.gen(function* () {
        const accounts = yield* AccountStore;
        const client = makeClient({ baseURL, fetch: yield* FetchHttpClient.Fetch });

        const call = <A>(run: () => Promise<AuthResult<A>>) =>
          Effect.tryPromise({
            try: run,
            catch: () =>
              new AuthFailed({ code: "NETWORK", message: "Could not reach Tupu. Try again." }),
          }).pipe(
            Effect.flatMap((result) =>
              result.data === null || result.error !== null
                ? Effect.fail(
                    new AuthFailed({
                      code: result.error?.code ?? "UNKNOWN",
                      message: result.error?.message ?? "Something went wrong. Try again.",
                    }),
                  )
                : Effect.succeed(result.data),
            ),
          );

        const signedIn = (result: SignedInUser) =>
          Effect.as(accounts.signIn(toAccount(result)), toAccount(result));

        const sendCode = Effect.fn("AuthClient.sendCode")(function* (email: string) {
          yield* call(() => client.emailOtp.sendVerificationOtp({ email, type: "sign-in" }));
        });

        const verifyCode = Effect.fn("AuthClient.verifyCode")(function* (input: {
          readonly email: string;
          readonly code: string;
        }) {
          const result = yield* call(() =>
            client.signIn.emailOtp({ email: input.email, otp: input.code }),
          );
          return yield* signedIn(result);
        });

        const signInWithPasskey = call(() => client.signIn.passkey()).pipe(
          Effect.flatMap(signedIn),
          Effect.withSpan("AuthClient.signInWithPasskey"),
        );

        const addPasskey = call(() => client.passkey.addPasskey({ name: "Tupu" })).pipe(
          Effect.asVoid,
          Effect.withSpan("AuthClient.addPasskey"),
        );

        // Local data goes even when the server cannot be reached.
        const signOut = call(() => client.signOut()).pipe(
          Effect.ignore,
          Effect.andThen(accounts.signOut),
          Effect.withSpan("AuthClient.signOut"),
        );

        return AuthClient.of({ sendCode, verifyCode, signInWithPasskey, addPasskey, signOut });
      }),
    );
}
