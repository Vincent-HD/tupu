import { DateTime, Effect, Layer, Option } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";
import { Authentication, CurrentAccount, TupuRpcs, Unauthorized } from "../src/api/rpc.ts";
import { Auth, authPath } from "./auth.ts";
import { ServerDatabase } from "./db/server-database.ts";
import { GameSync } from "./services/game-sync.ts";
import { Rankings } from "./services/rankings.ts";
import { Solves } from "./services/solves.ts";

const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const auth = yield* Auth;
    return Authentication.of((effect, options) =>
      Effect.gen(function* () {
        const account = yield* auth.account(options.headers);
        if (Option.isNone(account)) return yield* new Unauthorized();
        return yield* Effect.provideService(effect, CurrentAccount, account.value);
      }),
    );
  }),
);

const HandlersLive = TupuRpcs.toLayer(
  Effect.gen(function* () {
    const database = yield* ServerDatabase;
    const games = yield* GameSync;
    const rankings = yield* Rankings;
    return TupuRpcs.of({
      Rename: (payload) =>
        Effect.gen(function* () {
          const account = yield* CurrentAccount;
          const now = yield* DateTime.now;
          yield* database
            .run(
              database.query
                .updateTable("user")
                .set({ name: payload.name, updatedAt: DateTime.formatIso(now) })
                .where("id", "=", account.id),
            )
            .pipe(Effect.orDie);
          return { ...account, name: payload.name };
        }),
      Sync: (payload) =>
        Effect.flatMap(CurrentAccount, (account) =>
          games.sync({ accountId: account.id, changes: payload.changes, since: payload.since }),
        ),
      Leaderboard: (payload) => rankings.top(payload),
      CustomBoards: () => rankings.customBoards,
      Standing: (payload) =>
        Effect.flatMap(CurrentAccount, (account) =>
          rankings.standing({ accountId: account.id, gameId: payload.gameId }),
        ),
    });
  }),
);

const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const auth = yield* Auth;
    return HttpRouter.add(
      "*",
      `${authPath}/*`,
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const web = yield* HttpServerRequest.toWeb(request);
        return HttpServerResponse.fromWeb(yield* auth.handle(web));
      }),
    );
  }),
);

const ServicesLive = Layer.mergeAll(GameSync.layer, Rankings.layer, Auth.layer).pipe(
  Layer.provideMerge(Solves.layer),
  Layer.provideMerge(ServerDatabase.layer),
);

export const rpcPath = "/rpc";

// Routes shared by the Node server and the Cloudflare Worker. Both provide the
// SqlClient (SQLite on disk for Docker, D1 on Cloudflare) and the Mailer.
export const ApiRoutes = Layer.mergeAll(
  RpcServer.layerHttp({ group: TupuRpcs, path: rpcPath, protocol: "http" }).pipe(
    Layer.provide(Layer.mergeAll(HandlersLive, AuthenticationLive)),
    Layer.provide(RpcSerialization.layerJson),
  ),
  AuthRoutes,
  HttpRouter.add("GET", "/healthz", HttpServerResponse.text("ok")),
).pipe(Layer.provide(ServicesLive));
