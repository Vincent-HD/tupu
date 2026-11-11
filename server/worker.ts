import { D1Client } from "@effect/sql-d1";
import { ConfigProvider, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { ApiRoutes } from "./api.ts";
import { Mailer, type EmailBinding } from "./mailer.ts";

export interface WorkerEnv {
  readonly DB: Parameters<typeof D1Client.layer>[0]["db"];
  readonly BETTER_AUTH_SECRET: string;
  readonly EMAIL?: EmailBinding;
  readonly MAIL_FROM?: string;
  readonly TUPU_ORIGIN?: string;
}

type Handler = (request: Request) => Promise<Response>;

let handler: Handler | undefined;

const configFrom = (env: WorkerEnv) =>
  ConfigProvider.layer(
    ConfigProvider.fromEnv({
      env: {
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
        ...(env.TUPU_ORIGIN === undefined ? {} : { TUPU_ORIGIN: env.TUPU_ORIGIN }),
        ...(env.MAIL_FROM === undefined ? {} : { MAIL_FROM: env.MAIL_FROM }),
      },
    }),
  );

const handlerFor = (env: WorkerEnv): Handler => {
  if (handler) return handler;
  const web = HttpRouter.toWebHandler(
    ApiRoutes.pipe(
      Layer.provide(
        Layer.mergeAll(
          D1Client.layer({ db: env.DB }),
          env.EMAIL === undefined ? Mailer.layerLog : Mailer.layerBinding(env.EMAIL),
        ),
      ),
      Layer.provide(configFrom(env)),
    ),
  );
  handler = web.handler;
  return web.handler;
};

// Static assets are served by Cloudflare before this Worker runs; only the
// RPC endpoint, the auth routes and the health check reach it.
export default {
  fetch: (request: Request, env: WorkerEnv) => {
    const headers = new Headers(request.headers);
    headers.set("x-forwarded-proto", new URL(request.url).protocol.replace(":", ""));
    return handlerFor(env)(new Request(request, { headers }));
  },
};
