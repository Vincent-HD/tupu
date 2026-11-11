import { SqliteClient } from "@effect/sql-sqlite-node";
import { expect, layer } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { Reactivity } from "effect/reactivity";
import { Database } from "../src/db/database.ts";
import { givenKnowledge } from "../src/domain/puzzle.ts";
import { solveLogically } from "../src/domain/solver.ts";
import { Games } from "../src/services/games.ts";
import { SettingsStore } from "../src/services/settings.ts";
import { Stats } from "../src/services/stats.ts";

const TestLayer = Layer.mergeAll(Games.layer, Stats.layer.pipe(Layer.provide(Games.layer))).pipe(
  Layer.provideMerge(SettingsStore.layer),
  Layer.provideMerge(Database.layer),
  Layer.provide(SqliteClient.layer({ filename: ":memory:" })),
  Layer.provideMerge(Reactivity.layer),
);

const dirtyFlag = (id: string) =>
  Effect.gen(function* () {
    const database = yield* Database;
    const row = yield* database.first(
      database.query.selectFrom("games").select(["dirty", "deleted_at"]).where("id", "=", id),
    );
    return Option.getOrNull(row);
  });

layer(TestLayer)("local games", (it) => {
  it.effect("runs the Kysely migrations up to the account schema", () =>
    Effect.gen(function* () {
      const database = yield* Database;
      const tables = yield* Effect.promise(() => database.query.introspection.getTables());
      expect(tables.map((table) => table.name).sort()).toEqual(["games", "settings"]);
      expect((yield* (yield* SettingsStore).get).theme).toBe("system");
    }),
  );

  it.effect("saves progress and completes games, marking them for sync", () =>
    Effect.gen(function* () {
      const games = yield* Games;
      const first = yield* games.start({ mode: "quick", difficulty: "easy" });
      const second = yield* games.start({ mode: "quick", difficulty: "easy" });
      yield* games.save({
        id: first,
        progress: { numbers: [], colors: [] },
        moves: [{ at: 10, cell: 0, layer: "number", value: 1 }],
        elapsedMs: 1234,
        hints: 1,
        checks: 0,
      });
      const saved = yield* games.get(first);
      expect(saved.moves).toHaveLength(1);
      expect(saved.elapsedMs).toBe(1234);
      expect(yield* dirtyFlag(first)).toEqual({ dirty: 1, deleted_at: null });

      const game = yield* games.get(second);
      const report = solveLogically(givenKnowledge(game.puzzle));
      yield* games.complete({
        id: second,
        progress: { numbers: report.numbers, colors: report.colors },
        moves: [],
        elapsedMs: 60_000.4,
        hints: 1,
        checks: 0,
      });
      const solved = yield* games.get(second);
      expect(solved.elapsedMs).toBe(60_000);
      expect(solved.scoreMs).toBe(90_000);

      const stats = yield* (yield* Stats).current;
      expect(stats.solved).toBe(1);
      expect(stats.perfect).toBe(0);
      expect(stats.inProgress).toBe(1);
    }),
  );

  it.effect("keeps deleted games as hidden tombstones until they sync", () =>
    Effect.gen(function* () {
      const games = yield* Games;
      const id = yield* games.start({ mode: "quick", difficulty: "easy" });
      yield* games.remove(id);
      expect((yield* games.inProgress).map((game) => game.id)).not.toContain(id);
      expect((yield* Effect.flip(games.get(id)))._tag).toBe("GameNotFound");
      const tombstone = yield* dirtyFlag(id);
      expect(tombstone?.dirty).toBe(1);
      expect(tombstone?.deleted_at).not.toBeNull();
    }),
  );

  it.effect("names dailies after their date and revives a deleted one", () =>
    Effect.gen(function* () {
      const games = yield* Games;
      const id = yield* games.start({ mode: "daily", date: "2026-11-09" });
      expect(id).toBe("daily-2026-11-09");
      const game = yield* games.get(id);
      expect(game.difficulty).toBe("easy");
      expect(game.puzzle.seed).toBe("daily:2026-11-09");
      yield* games.remove(id);
      expect(yield* games.start({ mode: "daily", date: "2026-11-09" })).toBe(id);
      expect((yield* games.get(id)).status).toBe("playing");
    }),
  );
});
