import { SqliteClient } from "@effect/sql-sqlite-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { TestClock } from "effect/testing";
import { ServerDatabase } from "../server/db/server-database.ts";
import { GameSync } from "../server/services/game-sync.ts";
import { Rankings } from "../server/services/rankings.ts";
import { Solves } from "../server/services/solves.ts";
import type { SyncGame } from "../src/api/rpc.ts";
import { weekdayOf } from "../src/domain/calendar.ts";
import { dailyDifficulty, presets, type Difficulty } from "../src/domain/difficulty.ts";
import { dailyGameId, MovesJson, ProgressJson, startingProgress } from "../src/domain/game.ts";
import { generatePuzzle } from "../src/domain/generator.ts";
import { Puzzle, PuzzleJson } from "../src/domain/puzzle.ts";
import { replacesServerVersion } from "../src/domain/reconcile.ts";

const ServerLayer = Layer.mergeAll(GameSync.layer, Rankings.layer).pipe(
  Layer.provideMerge(Solves.layer),
  Layer.provideMerge(ServerDatabase.layer),
  Layer.provide(SqliteClient.layer({ filename: ":memory:" })),
);

const at = (minute: number) => `2026-11-11T10:${String(minute).padStart(2, "0")}:00.000Z`;

const addUser = (id: string) =>
  Effect.gen(function* () {
    const database = yield* ServerDatabase;
    yield* database.run(
      database.query.insertInto("user").values({
        id,
        email: `${id}@example.com`,
        name: id,
        emailVerified: 1,
        image: null,
        createdAt: at(0),
        updatedAt: at(0),
      }),
    );
  });

const makeGame = Effect.fn("makeGame")(function* (input: {
  readonly id?: string;
  readonly daily?: string;
  readonly difficulty?: Difficulty;
  readonly seed?: string;
  readonly status: "playing" | "solved";
  readonly updatedAt: string;
  readonly elapsedMs?: number;
  readonly tamper?: "givens" | "moves";
}) {
  const difficulty =
    input.difficulty ?? (input.daily ? dailyDifficulty(weekdayOf(input.daily)) : "easy");
  const seed = input.daily ? `daily:${input.daily}` : (input.seed ?? "seed-1");
  const puzzle = yield* generatePuzzle({ ...presets[difficulty], seed });
  const cells = puzzle.size * puzzle.size;
  const moves =
    input.status === "solved"
      ? Array.from({ length: cells }, (_, cell) => cell).flatMap((cell) => [
          ...(puzzle.givenNumbers[cell]
            ? []
            : [
                {
                  at: cell * 1000,
                  cell,
                  layer: "number" as const,
                  value: puzzle.solutionNumbers[cell] ?? 0,
                },
              ]),
          ...(puzzle.givenColors[cell]
            ? []
            : [
                {
                  at: cell * 1000 + 500,
                  cell,
                  layer: "color" as const,
                  value: puzzle.solutionColors[cell] ?? 0,
                },
              ]),
        ])
      : [];
  const reported =
    input.tamper === "givens"
      ? yield* Schema.decodeEffect(Puzzle)({
          ...(yield* Schema.encodeEffect(Puzzle)(puzzle)),
          givenNumbers: puzzle.givenNumbers.map(() => true),
        })
      : puzzle;
  const game: SyncGame = {
    id: input.daily ? dailyGameId(input.daily) : (input.id ?? "game-1"),
    mode: input.daily ? "daily" : "quick",
    daily_date: input.daily ?? null,
    difficulty,
    size: puzzle.size,
    level: puzzle.level,
    density: puzzle.density,
    seed,
    puzzle: yield* Schema.encodeEffect(PuzzleJson)(reported),
    progress: yield* Schema.encodeEffect(ProgressJson)(startingProgress(puzzle)),
    moves: yield* Schema.encodeEffect(MovesJson)(input.tamper === "moves" ? moves.slice(1) : moves),
    elapsed_ms: input.elapsedMs ?? 60_000,
    hints: 0,
    checks: 0,
    status: input.status,
    score_ms: input.status === "solved" ? 1 : null,
    started_at: at(0),
    updated_at: input.updatedAt,
    completed_at: input.status === "solved" ? input.updatedAt : null,
    deleted_at: null,
  };
  return game;
});

const push = (accountId: string, changes: ReadonlyArray<SyncGame>, since = 0) =>
  Effect.flatMap(GameSync, (sync) => sync.sync({ accountId, changes, since }));

const stored = (accountId: string, id: string) =>
  Effect.gen(function* () {
    const database = yield* ServerDatabase;
    return yield* database.first(
      database.query
        .selectFrom("games")
        .selectAll()
        .where("user_id", "=", accountId)
        .where("id", "=", id),
    );
  });

const atNoon = TestClock.setTime(Date.parse("2026-11-11T12:00:00Z"));

describe("server reconciliation", () => {
  it.effect("applies the same rule as the shared reconcile function, in SQL", () =>
    Effect.gen(function* () {
      yield* atNoon;
      yield* addUser("ada");
      const statuses = ["playing", "solved"] as const;
      let index = 0;
      for (const serverStatus of statuses)
        for (const clientStatus of statuses)
          for (const [serverMinute, clientMinute] of [
            [10, 20],
            [20, 10],
            [15, 15],
          ] as const) {
            index++;
            const id = `case-${index}`;
            const server = yield* makeGame({
              id,
              status: serverStatus,
              updatedAt: at(serverMinute),
            });
            const client = yield* makeGame({
              id,
              status: clientStatus,
              updatedAt: at(clientMinute),
              elapsedMs: 99_000,
            });
            yield* push("ada", [server]);
            yield* push("ada", [client]);
            const row = yield* stored("ada", id);
            const clientWon = row._tag === "Some" && row.value.elapsed_ms === 99_000;
            expect({ serverStatus, clientStatus, serverMinute, clientMinute, clientWon }).toEqual({
              serverStatus,
              clientStatus,
              serverMinute,
              clientMinute,
              clientWon: replacesServerVersion({
                server: { status: serverStatus, updatedAt: at(serverMinute) },
                client: { status: clientStatus, updatedAt: at(clientMinute) },
              }),
            });
          }
    }).pipe(Effect.provide(ServerLayer)),
  );

  it.effect("returns the server's winning version when it rejects a push", () =>
    Effect.gen(function* () {
      yield* atNoon;
      yield* addUser("ada");
      const solved = yield* makeGame({ status: "solved", updatedAt: at(10) });
      const first = yield* push("ada", [solved]);
      const stale = yield* makeGame({ status: "playing", updatedAt: at(40) });
      const result = yield* push("ada", [stale], first.cursor);
      expect(result.games.map((game) => game.status)).toEqual(["solved"]);
      expect(result.cursor).toBe(first.cursor);
    }).pipe(Effect.provide(ServerLayer)),
  );

  it.effect("keeps deletions as tombstones that sync to other devices", () =>
    Effect.gen(function* () {
      yield* atNoon;
      yield* addUser("ada");
      const game = yield* makeGame({ status: "playing", updatedAt: at(10) });
      const first = yield* push("ada", [game]);
      yield* push("ada", [{ ...game, updated_at: at(20), deleted_at: at(20) }]);
      const later = yield* push("ada", [], first.cursor);
      expect(later.games.map((row) => row.deleted_at)).toEqual([at(20)]);
      const revived = yield* push("ada", [{ ...game, updated_at: at(15) }]);
      expect(revived.games.at(-1)?.deleted_at).toBe(at(20));
    }).pipe(Effect.provide(ServerLayer)),
  );

  it.effect("keeps each account's games apart", () =>
    Effect.gen(function* () {
      yield* atNoon;
      yield* addUser("ada");
      yield* addUser("bob");
      const daily = yield* makeGame({ daily: "2026-11-09", status: "playing", updatedAt: at(10) });
      yield* push("ada", [daily]);
      yield* push("bob", [{ ...daily, updated_at: at(20) }]);
      expect((yield* push("ada", [])).games.map((game) => game.updated_at)).toEqual([at(10)]);
      expect((yield* push("bob", [])).games.map((game) => game.updated_at)).toEqual([at(20)]);
    }).pipe(Effect.provide(ServerLayer)),
  );

  it.effect("refuses dailies whose id does not match their date", () =>
    Effect.gen(function* () {
      yield* atNoon;
      yield* addUser("ada");
      const daily = yield* makeGame({ daily: "2026-11-09", status: "playing", updatedAt: at(10) });
      const result = yield* push("ada", [{ ...daily, id: "another-daily" }]);
      expect(result.games).toEqual([]);
    }).pipe(Effect.provide(ServerLayer)),
  );
});

describe("solve verification", () => {
  const verified = (id: string) =>
    Effect.map(stored("ada", id), (row) => (row._tag === "Some" ? row.value.verified : null));

  it.effect("ranks a solve once its moves replay to the solution", () =>
    Effect.gen(function* () {
      yield* atNoon;
      yield* addUser("ada");
      yield* push("ada", [yield* makeGame({ status: "solved", updatedAt: at(10) })]);
      expect(yield* verified("game-1")).toBe(1);
      const top = yield* (yield* Rankings).top({
        category: { kind: "difficulty", difficulty: "easy" },
        limit: 10,
      });
      expect(
        top.map((entry) => [entry.gameId, entry.name, entry.scoreMs, entry.dailyDate]),
      ).toEqual([["game-1", "ada", 60_000, null]]);
      expect(yield* (yield* Rankings).standing({ accountId: "ada", gameId: "game-1" })).toEqual({
        scoreMs: 60_000,
        rank: 1,
        entries: 1,
        personalBest: true,
      });
    }).pipe(Effect.provide(ServerLayer)),
  );

  it.effect("keeps tampered solves off the leaderboard", () =>
    Effect.gen(function* () {
      yield* atNoon;
      yield* addUser("ada");
      yield* push("ada", [
        yield* makeGame({ id: "easier", status: "solved", updatedAt: at(10), tamper: "givens" }),
        yield* makeGame({ id: "unsolved", status: "solved", updatedAt: at(10), tamper: "moves" }),
        yield* makeGame({ id: "too-fast", status: "solved", updatedAt: at(10), elapsedMs: 50 }),
      ]);
      expect(yield* verified("easier")).toBe(0);
      expect(yield* verified("unsolved")).toBe(0);
      expect(yield* verified("too-fast")).toBe(0);
      const top = yield* (yield* Rankings).top({
        category: { kind: "difficulty", difficulty: "easy" },
        limit: 10,
      });
      expect(top).toEqual([]);
    }).pipe(Effect.provide(ServerLayer)),
  );

  it.effect("accepts tomorrow's daily only once it has started somewhere on Earth", () =>
    Effect.gen(function* () {
      yield* addUser("ada");
      const tomorrow = yield* makeGame({
        daily: "2026-11-12",
        status: "solved",
        updatedAt: at(10),
      });
      yield* TestClock.setTime(Date.parse("2026-11-11T09:59:00Z"));
      yield* push("ada", [tomorrow]);
      expect(yield* verified(dailyGameId("2026-11-12"))).toBe(0);
      yield* TestClock.setTime(Date.parse("2026-11-11T10:01:00Z"));
      yield* push("ada", [{ ...tomorrow, updated_at: at(20), completed_at: at(20) }]);
      expect(yield* verified(dailyGameId("2026-11-12"))).toBe(1);
      // The board says which day the puzzle belongs to, whenever it was solved.
      const top = yield* (yield* Rankings).top({
        category: { kind: "daily", date: "2026-11-12" },
        limit: 10,
      });
      expect(top.map((entry) => [entry.gameId, entry.dailyDate])).toEqual([
        [dailyGameId("2026-11-12"), "2026-11-12"],
      ]);
    }).pipe(Effect.provide(ServerLayer)),
  );

  it.effect("checks a daily against the difficulty of its weekday", () =>
    Effect.gen(function* () {
      yield* atNoon;
      yield* addUser("ada");
      const wrong = yield* makeGame({
        daily: "2026-11-09",
        difficulty: "medium",
        status: "solved",
        updatedAt: at(10),
      });
      yield* push("ada", [wrong]);
      expect(yield* verified(dailyGameId("2026-11-09"))).toBe(0);
    }).pipe(Effect.provide(ServerLayer)),
  );
});
