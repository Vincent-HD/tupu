import { SqliteClient } from "@effect/sql-sqlite-wasm";
import { QueryClient } from "@tanstack/react-query";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { Reactivity } from "effect/reactivity";
import { Database } from "../db/database.ts";
import { Backup } from "../services/backup.ts";
import { Games } from "../services/games.ts";
import { Leaderboard } from "../services/leaderboard.ts";
import { Players } from "../services/players.ts";
import { SettingsStore } from "../services/settings.ts";
import { Sound } from "../services/sound.ts";
import { Stats } from "../services/stats.ts";

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

const GamesLive = Games.layer.pipe(Layer.provideMerge(Players.layer));

const ServicesLive = Layer.mergeAll(Stats.layer, Leaderboard.layer, Backup.layer).pipe(
  Layer.provideMerge(GamesLive),
  Layer.provideMerge(SettingsStore.layer),
  Layer.provideMerge(Database.layer),
  Layer.provideMerge(SqlLive),
  Layer.merge(Sound.layer),
);

const queryKeysByReactivityKey: Readonly<Record<string, ReadonlyArray<ReadonlyArray<string>>>> = {
  settings: [["settings"], ["players"]],
  players: [["players"], ["games"], ["stats"], ["leaderboard"]],
  games: [["games"], ["stats"], ["leaderboard"]],
  stats: [["stats"]],
  leaderboard: [["leaderboard"]],
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
