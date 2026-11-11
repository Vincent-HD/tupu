import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpIncomingMessage } from "effect/http";

export interface Mail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export class MailError extends Schema.TaggedError<MailError, { readonly brand: unique symbol }>()(
  "MailError",
  { cause: Schema.Defect() },
) {}

// The `send_email` Worker binding, reduced to the call Tupu makes.
export interface EmailBinding {
  readonly send: (message: {
    readonly from: string;
    readonly to: string;
    readonly subject: string;
    readonly text: string;
    readonly html: string;
  }) => Promise<unknown>;
}

const SendResult = Schema.Struct({
  success: Schema.Boolean,
  errors: Schema.Array(Schema.Struct({ code: Schema.Finite, message: Schema.String })),
});

// Cloudflare documents only a bare address for the sender; a stray quote or a
// display name from the environment fails at startup instead of on each send.
const SenderAddress = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/, {
    message: "MAIL_FROM must be a bare address, such as noreply@tupu.example.com",
  }),
);
const fromAddress = Config.schema(SenderAddress, "MAIL_FROM");

export class Mailer extends Context.Service<
  Mailer,
  { readonly send: (mail: Mail) => Effect.Effect<void, MailError> }
>()("tupu/server/Mailer") {
  // Without an email provider the message only reaches the server log, which
  // is enough to sign in during development.
  static readonly layerLog = Layer.succeed(
    Mailer,
    Mailer.of({
      send: (mail) =>
        Effect.logWarning("No email provider is configured; the email was not sent", {
          to: mail.to,
          subject: mail.subject,
          text: mail.text,
        }),
    }),
  );

  // Cloudflare Email Sending through the Worker's `send_email` binding.
  static readonly layerBinding = (binding: EmailBinding) =>
    Layer.effect(
      Mailer,
      Effect.map(fromAddress, (from) =>
        Mailer.of({
          send: (mail) =>
            Effect.tryPromise({
              try: () => binding.send({ from, ...mail }),
              catch: (cause) => new MailError({ cause }),
            }).pipe(Effect.asVoid, Effect.withSpan("Mailer.send")),
        }),
      ),
    );

  // Cloudflare Email Sending through its REST API, for the Node server. Error responses
  // carry the reason in their body, so the status is not checked first.
  static readonly layerApi = Layer.effect(
    Mailer,
    Effect.gen(function* () {
      const from = yield* fromAddress;
      const accountId = yield* Config.String("CLOUDFLARE_ACCOUNT_ID");
      const token = yield* Config.Redacted("CLOUDFLARE_EMAIL_API_TOKEN");
      const client = yield* HttpClient.HttpClient;
      const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`;

      const send = Effect.fn("Mailer.send")(
        function* (mail: Mail) {
          const response = yield* client.execute(
            HttpClientRequest.post(url).pipe(
              HttpClientRequest.bearerToken(Redacted.value(token)),
              HttpClientRequest.bodyJsonUnsafe({ from, ...mail }),
            ),
          );
          const result = yield* HttpIncomingMessage.schemaBodyJson(SendResult)(response);
          if (!result.success)
            return yield* new MailError({ cause: { errors: result.errors, from, to: mail.to } });
        },
        Effect.mapError((cause) => (cause instanceof MailError ? cause : new MailError({ cause }))),
      );

      return Mailer.of({ send });
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));

  // The REST API when its settings are present, the log otherwise.
  static readonly layerFromConfig = Layer.unwrap(
    Effect.gen(function* () {
      const configured = yield* Config.option(Config.String("CLOUDFLARE_EMAIL_API_TOKEN"));
      if (Option.isSome(configured)) return Mailer.layerApi;
      yield* Effect.logWarning(
        "CLOUDFLARE_EMAIL_API_TOKEN is not set: sign-in codes are written to this log instead of emailed",
      );
      return Mailer.layerLog;
    }),
  );
}
