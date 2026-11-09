import { SqliteClient } from "@effect/sql-sqlite-wasm";
import { Effect, Layer } from "effect";
import { Atom } from "effect/reactivity";
import { Database } from "../db/database.ts";
import { Backup } from "../services/backup.ts";
import { Games } from "../services/games.ts";
import { Leaderboard } from "../services/leaderboard.ts";
import { Players } from "../services/players.ts";
import { SettingsStore } from "../services/settings.ts";
import { Sound } from "../services/sound.ts";
import { Stats } from "../services/stats.ts";

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

const AppLive = Layer.mergeAll(Stats.layer, Leaderboard.layer, Backup.layer).pipe(
  Layer.provideMerge(GamesLive),
  Layer.provideMerge(SettingsStore.layer),
  Layer.provideMerge(Database.layer),
  Layer.provideMerge(SqlLive),
  Layer.merge(Sound.layer),
);

export const runtime = Atom.runtime(AppLive);
