import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { Mailer } from "../server/mailer.ts";

const mail = { to: "ada@example.com", subject: "123456 is your Tupu code", text: "t", html: "h" };

// Answers like Cloudflare's Email Sending REST API and keeps what it received.
const cloudflare = (reply: { readonly status: number; readonly body: unknown }) => {
  const received: Array<Request> = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    received.push(new Request(input, init));
    return Response.json(reply.body, { status: reply.status });
  };
  return { received, fetch };
};

const layerWith = (fetch: typeof globalThis.fetch) =>
  Mailer.layerFromConfig.pipe(
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromEnv({
          env: {
            MAIL_FROM: "code@tupu.example.com",
            CLOUDFLARE_ACCOUNT_ID: "account-1",
            CLOUDFLARE_EMAIL_API_TOKEN: "secret-token",
          },
        }),
      ),
    ),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
  );

const send = Effect.flatMap(Mailer, (mailer) => mailer.send(mail));

describe("Cloudflare Email Sending", () => {
  it.effect("posts the message to the account's send endpoint", () =>
    Effect.gen(function* () {
      const api = cloudflare({
        status: 200,
        body: { success: true, errors: [], messages: [], result: { delivered: [mail.to] } },
      });
      yield* send.pipe(Effect.provide(layerWith(api.fetch)));
      const request = api.received[0];
      expect(request?.method).toBe("POST");
      expect(request?.url).toBe(
        "https://api.cloudflare.com/client/v4/accounts/account-1/email/sending/send",
      );
      expect(request?.headers.get("authorization")).toBe("Bearer secret-token");
      expect(yield* Effect.promise(() => request?.json() ?? Promise.resolve(null))).toEqual({
        from: "code@tupu.example.com",
        ...mail,
      });
    }),
  );

  it.effect("fails when Cloudflare refuses the message", () =>
    Effect.gen(function* () {
      const api = cloudflare({
        status: 429,
        body: {
          success: false,
          errors: [{ code: 10004, message: "email.sending.error.rate_limited" }],
          messages: [],
          result: null,
        },
      });
      const error = yield* Effect.flip(send.pipe(Effect.provide(layerWith(api.fetch))));
      expect(error._tag).toBe("MailError");
    }),
  );
});
