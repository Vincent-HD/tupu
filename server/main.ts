import { createServer } from "node:http";
import { dirname } from "node:path";
import { NodeFileSystem, NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Config, Effect, FileSystem, Layer } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse, HttpStaticServer } from "effect/http";
import { ApiRoutes } from "./api.ts";
import { Mailer } from "./mailer.ts";

const cacheControlFor = (pathname: string) =>
  pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";

const SecurityAndCacheHeaders = HttpRouter.middleware(
  (httpEffect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const response = yield* httpEffect;
      const pathname = new URL(request.url, "http://localhost").pathname;
      return HttpServerResponse.setHeaders(response, {
        "Cache-Control": response.status < 400 ? cacheControlFor(pathname) : "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      });
    }),
  { global: true },
);

const StaticFiles = Layer.unwrap(
  Effect.map(Config.String("STATIC_ROOT").pipe(Config.withDefault("dist")), (root) =>
    HttpStaticServer.layer({
      root,
      spa: true,
      mimeTypes: { webmanifest: "application/manifest+json", wasm: "application/wasm" },
    }),
  ),
);

const SqliteFile = Layer.unwrap(
  Effect.gen(function* () {
    const filename = yield* Config.String("DATABASE_PATH").pipe(
      Config.withDefault("data/tupu.sqlite"),
    );
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(dirname(filename), { recursive: true });
    return SqliteClient.layer({ filename });
  }),
).pipe(Layer.provide(NodeFileSystem.layer));

const Routes = Layer.mergeAll(
  StaticFiles,
  ApiRoutes.pipe(Layer.provide(Layer.mergeAll(SqliteFile, Mailer.layerFromConfig))),
  HttpRouter.add("GET", "/_headers", HttpServerResponse.empty({ status: 404 })),
  SecurityAndCacheHeaders,
);

const NodeServer = Layer.unwrap(
  Effect.map(
    Config.all({
      port: Config.Port("PORT").pipe(Config.withDefault(8080)),
      host: Config.String("HOST").pipe(Config.withDefault("0.0.0.0")),
    }),
    (options) => NodeHttpServer.layer(createServer, options),
  ),
);

Layer.launch(HttpRouter.serve(Routes).pipe(Layer.provide(NodeServer))).pipe(NodeRuntime.runMain);
