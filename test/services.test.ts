import { SqliteClient } from "@effect/sql-sqlite-node";
import { describe, expect, it, layer } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { Reactivity } from "effect/reactivity";
import { Database } from "../src/db/database.ts";
import { solveLogically } from "../src/domain/solver.ts";
import { givenKnowledge } from "../src/domain/puzzle.ts";
import { Games } from "../src/services/games.ts";
import { Leaderboard } from "../src/services/leaderboard.ts";
import { Players } from "../src/services/players.ts";
import { SettingsStore } from "../src/services/settings.ts";
import { Stats } from "../src/services/stats.ts";

const TestLayer = Layer.mergeAll(
  Games.layer,
  Leaderboard.layer,
  Stats.layer.pipe(Layer.provide(Games.layer)),
).pipe(
  Layer.provideMerge(Players.layer),
  Layer.provideMerge(SettingsStore.layer),
  Layer.provideMerge(Database.layer),
  Layer.provide(SqliteClient.layer({ filename: ":memory:" })),
  Layer.provideMerge(Reactivity.layer),
);

const solveGame = (id: string) =>
  Effect.gen(function* () {
    const games = yield* Games;
    const game = yield* games.get(id);
    const report = solveLogically(givenKnowledge(game.puzzle));
    return yield* games.complete({
      id,
      progress: { numbers: report.numbers, colors: report.colors },
      moves: [],
      elapsedMs: 60_000,
      hints: 0,
      checks: 0,
    });
  });

layer(TestLayer)("services", (it) => {
  it.effect("runs Kysely migrations and creates a default player", () =>
    Effect.gen(function* () {
      const database = yield* Database;
      const tables = yield* Effect.promise(() => database.query.introspection.getTables());
      expect(tables.map((table) => table.name).sort()).toEqual(["games", "players", "settings"]);
      const player = yield* (yield* Players).current;
      expect(player.name).toBe("Player 1");
      expect((yield* (yield* SettingsStore).get).playerId).toBe(player.id);
    }),
  );

  it.effect("persists progress, completes games and ranks them", () =>
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
      expect((yield* games.inProgress).length).toBe(2);

      const result = yield* solveGame(second);
      expect(result.rank).toBe(1);
      expect(result.personalBest).toBe(true);
      expect(yield* games.standing(second)).toEqual(Option.some(result));
      expect(Option.isNone(yield* games.standing(first))).toBe(true);

      const top = yield* (yield* Leaderboard).top({
        category: { kind: "difficulty", difficulty: "easy" },
        limit: 10,
      });
      expect(top.map((entry) => entry.gameId)).toEqual([second]);

      const stats = yield* (yield* Stats).current;
      expect(stats.solved).toBe(1);
      expect(stats.perfect).toBe(1);
      expect(stats.inProgress).toBe(1);
    }),
  );

  it.effect("resumes the same daily game instead of starting another", () =>
    Effect.gen(function* () {
      const games = yield* Games;
      const first = yield* games.start({ mode: "daily", date: "2026-11-09" });
      const again = yield* games.start({ mode: "daily", date: "2026-11-09" });
      expect(again).toBe(first);
      const game = yield* games.get(first);
      expect(game.difficulty).toBe("easy");
      expect(game.puzzle.seed).toBe("daily:2026-11-09");
    }),
  );
});

describe("players", () => {
  it.effect("resolves the default player once under concurrent access", () =>
    Effect.gen(function* () {
      const players = yield* Players;
      const resolved = yield* Effect.all(
        Array.from({ length: 6 }, () => players.current),
        { concurrency: "unbounded" },
      );
      expect(new Set(resolved.map((player) => player.id)).size).toBe(1);
      expect(yield* players.list).toHaveLength(1);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("rejects duplicate names", () =>
    Effect.gen(function* () {
      const players = yield* Players;
      yield* players.create("Ada");
      const error = yield* Effect.flip(players.create("ada"));
      expect(error._tag).toBe("PlayerNameTaken");
    }).pipe(Effect.provide(TestLayer)),
  );
});
