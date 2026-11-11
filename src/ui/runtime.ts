import { SqliteClient } from "@effect/sql-sqlite-wasm";
import { QueryClient } from "@tanstack/react-query";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { Reactivity } from "effect/reactivity";
import { Database } from "../db/database.ts";
import { AccountStore } from "../services/account-store.ts";
import { Api } from "../services/api.ts";
import { Games } from "../services/games.ts";
import { AuthClient } from "../services/auth-client.ts";
import { SettingsStore } from "../services/settings.ts";
import { Sound } from "../services/sound.ts";
import { Stats } from "../services/stats.ts";
import { Sync } from "../services/sync.ts";
import { SyncTriggers } from "./sync-triggers.ts";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
      staleTime: Infinity,
      retry: false,
      refetchOnWindowFocus: false,
    },
    mutations: { networkMode: "always" },
  },
});

const SqlLive = SqliteClient.layer({
  worker: Effect.acquireRelease(
    Effect.sync(
      () =>
        new Worker(new URL("../db/sqlite.worker.ts", import.meta.url), {
          type: "module",
          name: "tupu-sqlite",
        }),
    ),
    (worker) => Effect.sync(() => worker.terminate()),
  ),
});

const LocalLive = Layer.mergeAll(Games.layer, SettingsStore.layer, AccountStore.layer).pipe(
  Layer.provideMerge(Database.layer),
  Layer.provideMerge(SqlLive),
);

const RemoteLive = Layer.mergeAll(Sync.layer, AuthClient.layer(`${location.origin}/api/auth`)).pipe(
  Layer.provideMerge(Api.layer("/rpc")),
);

const ServicesLive = Layer.mergeAll(Stats.layer, SyncTriggers).pipe(
  Layer.provideMerge(RemoteLive),
  Layer.provideMerge(LocalLive),
  Layer.merge(Sound.layer),
);

const queryKeysByReactivityKey: Readonly<Record<string, ReadonlyArray<ReadonlyArray<string>>>> = {
  settings: [["settings"]],
  account: [["account"], ["games"], ["stats"], ["leaderboard"]],
  games: [["games"], ["stats"], ["leaderboard"]],
  stats: [["stats"]],
  sync: [["sync"]],
  "local-writes": [["sync"]],
};

const QueryInvalidationLive = Layer.effectDiscard(
  Effect.forEach(
    Object.entries(queryKeysByReactivityKey),
    ([reactivityKey, queryKeys]) =>
      Reactivity.stream(Effect.void, [reactivityKey]).pipe(
        Stream.drop(1),
        Stream.runForEach(() =>
          Effect.sync(() => {
            for (const queryKey of queryKeys) void queryClient.invalidateQueries({ queryKey });
          }),
        ),
        Effect.forkScoped,
      ),
    { discard: true },
  ),
);

export const runtime = ManagedRuntime.make(
  Layer.mergeAll(ServicesLive, QueryInvalidationLive).pipe(Layer.provideMerge(Reactivity.layer)),
);
