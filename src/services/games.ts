import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Reactivity } from "effect/reactivity";
import { Database } from "../db/database.ts";
import type { GameMode, GameRow, GameStatus } from "../db/schema.ts";
import { today, weekdayOf } from "../domain/calendar.ts";
import {
  asDifficulty,
  dailyDifficulty,
  presets,
  type Difficulty,
  type PuzzleSpec,
} from "../domain/difficulty.ts";
import {
  dailyGameId,
  MovesJson,
  ProgressJson,
  startingProgress,
  type Move,
  type Progress,
} from "../domain/game.ts";
import { generatePuzzle } from "../domain/generator.ts";
import { PuzzleJson, type Puzzle } from "../domain/puzzle.ts";
import { scoreOf } from "../domain/score.ts";

export class GameNotFound extends Schema.TaggedError<
  GameNotFound,
  { readonly brand: unique symbol }
>()("GameNotFound", {
  gameId: Schema.String,
}) {}

export type StartGame =
  | { readonly mode: "daily"; readonly date: string }
  | { readonly mode: "quick"; readonly difficulty: Difficulty }
  | { readonly mode: "custom"; readonly spec: PuzzleSpec; readonly seed?: string | undefined };

export interface GameRecord {
  readonly id: string;
  readonly mode: GameMode;
  readonly dailyDate: string | null;
  readonly difficulty: Difficulty | null;
  readonly puzzle: Puzzle;
  readonly progress: Progress;
  readonly moves: ReadonlyArray<Move>;
  readonly elapsedMs: number;
  readonly hints: number;
  readonly checks: number;
  readonly status: GameStatus;
  readonly scoreMs: number | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
}

export interface GameSnapshot {
  readonly id: string;
  readonly progress: Progress;
  readonly moves: ReadonlyArray<Move>;
  readonly elapsedMs: number;
  readonly hints: number;
  readonly checks: number;
}

const summaryColumns = [
  "id",
  "mode",
  "daily_date",
  "difficulty",
  "size",
  "level",
  "density",
  "seed",
  "elapsed_ms",
  "hints",
  "checks",
  "status",
  "score_ms",
  "started_at",
  "updated_at",
  "completed_at",
] as const;

export type GameSummary = Pick<GameRow, (typeof summaryColumns)[number]>;

export const gamesReactivityKey = "games";
// Invalidated after every local write; the sync service listens to it.
export const localWritesReactivityKey = "local-writes";

const decodeRow = Effect.fnUntraced(function* (row: GameRow) {
  return {
    id: row.id,
    mode: row.mode,
    dailyDate: row.daily_date,
    difficulty: asDifficulty(row.difficulty),
    puzzle: yield* Schema.decodeEffect(PuzzleJson)(row.puzzle),
    progress: yield* Schema.decodeEffect(ProgressJson)(row.progress),
    moves: yield* Schema.decodeEffect(MovesJson)(row.moves),
    elapsedMs: row.elapsed_ms,
    hints: row.hints,
    checks: row.checks,
    status: row.status,
    scoreMs: row.score_ms,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  } satisfies GameRecord;
});

const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

export class Games extends Context.Service<
  Games,
  {
    readonly start: (input: StartGame) => Effect.Effect<string>;
    readonly get: (id: string) => Effect.Effect<GameRecord, GameNotFound>;
    readonly save: (snapshot: GameSnapshot) => Effect.Effect<void>;
    readonly complete: (snapshot: GameSnapshot) => Effect.Effect<void, GameNotFound>;
    readonly remove: (id: string) => Effect.Effect<void>;
    readonly inProgress: Effect.Effect<ReadonlyArray<GameSummary>>;
    readonly solved: Effect.Effect<ReadonlyArray<GameSummary>>;
    readonly dailies: (range: {
      readonly from: string;
      readonly to: string;
    }) => Effect.Effect<ReadonlyArray<GameSummary>>;
  }
>()("tupu/services/Games") {
  static readonly layer = Layer.effect(
    Games,
    Effect.gen(function* () {
      const database = yield* Database;
      const reactivity = yield* Reactivity.Reactivity;

      const changed = (keys: ReadonlyArray<string>) =>
        reactivity.invalidate([...keys, localWritesReactivityKey]);

      const live = database.query.selectFrom("games").where("deleted_at", "is", null);

      const start = Effect.fn("Games.start")(function* (input: StartGame) {
        const id = input.mode === "daily" ? dailyGameId(input.date) : crypto.randomUUID();
        if (input.mode === "daily") {
          const existing = yield* database
            .first(live.select("id").where("id", "=", id))
            .pipe(Effect.orDie);
          if (Option.isSome(existing)) return id;
        }
        const difficulty =
          input.mode === "daily"
            ? dailyDifficulty(weekdayOf(input.date))
            : input.mode === "quick"
              ? input.difficulty
              : null;
        const spec = input.mode === "custom" ? input.spec : presets[difficulty ?? "easy"];
        const seed =
          input.mode === "daily"
            ? `daily:${input.date}`
            : input.mode === "custom" && input.seed
              ? input.seed
              : crypto.randomUUID().slice(0, 8);
        const puzzle = yield* generatePuzzle({ ...spec, seed });
        const now = yield* nowIso;
        const values = {
          mode: input.mode,
          daily_date: input.mode === "daily" ? input.date : null,
          difficulty,
          size: puzzle.size,
          level: puzzle.level,
          density: puzzle.density,
          seed,
          puzzle: yield* Schema.encodeEffect(PuzzleJson)(puzzle),
          progress: yield* Schema.encodeEffect(ProgressJson)(startingProgress(puzzle)),
          moves: "[]",
          elapsed_ms: 0,
          hints: 0,
          checks: 0,
          status: "playing" as const,
          score_ms: null,
          started_at: now,
          updated_at: now,
          completed_at: null,
          deleted_at: null,
          dirty: 1,
        };
        // A deleted daily keeps its row until the deletion syncs, so starting
        // it again revives that row.
        yield* database.run(
          database.query
            .insertInto("games")
            .values({ id, ...values })
            .onConflict((conflict) => conflict.column("id").doUpdateSet(values)),
        );
        yield* changed([gamesReactivityKey]);
        return id;
      }, Effect.orDie);

      const get = Effect.fn("Games.get")(function* (id: string) {
        const row = yield* database.first(live.selectAll().where("id", "=", id)).pipe(Effect.orDie);
        if (Option.isNone(row)) return yield* new GameNotFound({ gameId: id });
        return yield* decodeRow(row.value).pipe(Effect.orDie);
      });

      const encodeSnapshot = Effect.fnUntraced(function* (snapshot: GameSnapshot) {
        return {
          progress: yield* Schema.encodeEffect(ProgressJson)(snapshot.progress),
          moves: yield* Schema.encodeEffect(MovesJson)(snapshot.moves),
          elapsed_ms: Math.round(snapshot.elapsedMs),
          hints: snapshot.hints,
          checks: snapshot.checks,
          updated_at: yield* nowIso,
          dirty: 1,
        };
      }, Effect.orDie);

      const save = Effect.fn("Games.save")(function* (snapshot: GameSnapshot) {
        const values = yield* encodeSnapshot(snapshot);
        yield* database
          .run(
            database.query
              .updateTable("games")
              .set(values)
              .where("id", "=", snapshot.id)
              .where("status", "=", "playing")
              .where("deleted_at", "is", null),
          )
          .pipe(Effect.orDie);
        yield* changed([gamesReactivityKey]);
      });

      const complete = Effect.fn("Games.complete")(function* (snapshot: GameSnapshot) {
        const game = yield* get(snapshot.id);
        if (game.status === "solved") return;
        const values = yield* encodeSnapshot(snapshot);
        yield* database
          .run(
            database.query
              .updateTable("games")
              .set({
                ...values,
                status: "solved",
                score_ms: scoreOf({ ...snapshot, elapsedMs: values.elapsed_ms }),
                completed_at: values.updated_at,
              })
              .where("id", "=", snapshot.id),
          )
          .pipe(Effect.orDie);
        yield* changed([gamesReactivityKey, "stats"]);
      });

      const remove = Effect.fn("Games.remove")(function* (id: string) {
        const now = yield* nowIso;
        yield* database
          .run(
            database.query
              .updateTable("games")
              .set({ deleted_at: now, updated_at: now, dirty: 1 })
              .where("id", "=", id),
          )
          .pipe(Effect.orDie);
        yield* changed([gamesReactivityKey, "stats"]);
      });

      const byStatus = (status: GameStatus) =>
        database
          .rows(
            live.select(summaryColumns).where("status", "=", status).orderBy("updated_at", "desc"),
          )
          .pipe(Effect.orDie);

      const dailies = Effect.fn("Games.dailies")(function* (range: {
        readonly from: string;
        readonly to: string;
      }) {
        return yield* database
          .rows(
            live
              .select(summaryColumns)
              .where("mode", "=", "daily")
              .where("daily_date", ">=", range.from)
              .where("daily_date", "<=", range.to),
          )
          .pipe(Effect.orDie);
      });

      return Games.of({
        start,
        get,
        save,
        complete,
        remove,
        inProgress: byStatus("playing").pipe(Effect.withSpan("Games.inProgress")),
        solved: byStatus("solved").pipe(Effect.withSpan("Games.solved")),
        dailies,
      });
    }),
  );
}

export const todayDaily = Effect.map(today, (date) => ({
  date,
  difficulty: dailyDifficulty(weekdayOf(date)),
}));
