import { Context, Effect, Layer, Option, Schema } from "effect";
import { Reactivity } from "effect/reactivity";
import { Database } from "../db/database.ts";
import type { GameMode, GameRow, GameStatus } from "../db/schema.ts";
import { today, weekdayOf } from "../domain/calendar.ts";
import {
  dailyDifficulty,
  difficulties,
  presets,
  type Difficulty,
  type PuzzleSpec,
} from "../domain/difficulty.ts";
import {
  MovesJson,
  ProgressJson,
  startingProgress,
  type Move,
  type Progress,
} from "../domain/game.ts";
import { generatePuzzle } from "../domain/generator.ts";
import { PuzzleJson, type Puzzle } from "../domain/puzzle.ts";
import { scoreOf } from "../domain/score.ts";
import { Players } from "./players.ts";

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
  readonly playerId: string;
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

export interface CompletionResult {
  readonly scoreMs: number;
  readonly rank: number;
  readonly entries: number;
  readonly personalBest: boolean;
}

export type GameSummary = Omit<GameRow, "puzzle" | "progress" | "moves">;

export const gamesReactivityKey = "games";

const DifficultySchema = Schema.Literals(difficulties);

const decodeRow = Effect.fnUntraced(function* (row: GameRow) {
  return {
    id: row.id,
    playerId: row.player_id,
    mode: row.mode,
    dailyDate: row.daily_date,
    difficulty:
      row.difficulty === null
        ? null
        : yield* Schema.decodeUnknownEffect(DifficultySchema)(row.difficulty),
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

const summaryColumns = [
  "id",
  "player_id",
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

export class Games extends Context.Service<
  Games,
  {
    readonly start: (input: StartGame) => Effect.Effect<string>;
    readonly get: (id: string) => Effect.Effect<GameRecord, GameNotFound>;
    readonly save: (snapshot: GameSnapshot) => Effect.Effect<void>;
    readonly complete: (snapshot: GameSnapshot) => Effect.Effect<CompletionResult, GameNotFound>;
    readonly standing: (id: string) => Effect.Effect<Option.Option<CompletionResult>, GameNotFound>;
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
      const players = yield* Players;
      const reactivity = yield* Reactivity.Reactivity;
      const nowIso = Effect.sync(() => new Date().toISOString());

      const findPlaying = (playerId: string, date: string) =>
        database
          .first(
            database.query
              .selectFrom("games")
              .select("id")
              .where("player_id", "=", playerId)
              .where("mode", "=", "daily")
              .where("daily_date", "=", date)
              .where("status", "=", "playing"),
          )
          .pipe(Effect.orDie);

      const start = Effect.fn("Games.start")(function* (input: StartGame) {
        const player = yield* players.current;
        if (input.mode === "daily") {
          const existing = yield* findPlaying(player.id, input.date);
          if (Option.isSome(existing)) return existing.value.id;
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
        const id = crypto.randomUUID();
        const now = yield* nowIso;
        yield* database.run(
          database.query.insertInto("games").values({
            id,
            player_id: player.id,
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
            status: "playing",
            score_ms: null,
            started_at: now,
            updated_at: now,
            completed_at: null,
          }),
        );
        yield* reactivity.invalidate([gamesReactivityKey]);
        return id;
      }, Effect.orDie);

      const get = Effect.fn("Games.get")(function* (id: string) {
        const row = yield* database
          .first(database.query.selectFrom("games").selectAll().where("id", "=", id))
          .pipe(Effect.orDie);
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
              .where("status", "=", "playing"),
          )
          .pipe(Effect.orDie);
        yield* reactivity.invalidate([gamesReactivityKey]);
      });

      const rank = Effect.fnUntraced(function* (game: GameRecord, scoreMs: number) {
        const board = yield* database
          .rows(
            database.query
              .selectFrom("games")
              .select(["id", "player_id", "score_ms"])
              .where("status", "=", "solved")
              .$if(game.mode === "custom", (query) =>
                query
                  .where("mode", "=", "custom")
                  .where("size", "=", game.puzzle.size)
                  .where("level", "=", game.puzzle.level),
              )
              .$if(game.mode !== "custom", (query) =>
                query.where("mode", "!=", "custom").where("difficulty", "=", game.difficulty ?? ""),
              ),
          )
          .pipe(Effect.orDie);
        const better = board.filter((entry) => (entry.score_ms ?? Infinity) < scoreMs).length;
        const personalBest = !board.some(
          (entry) =>
            entry.id !== game.id &&
            entry.player_id === game.playerId &&
            (entry.score_ms ?? Infinity) <= scoreMs,
        );
        return {
          scoreMs,
          rank: better + 1,
          entries: board.length,
          personalBest,
        } satisfies CompletionResult;
      });

      const standing = Effect.fn("Games.standing")(function* (id: string) {
        const game = yield* get(id);
        if (game.status !== "solved" || game.scoreMs === null) return Option.none();
        return Option.some(yield* rank(game, game.scoreMs));
      });

      const complete = Effect.fn("Games.complete")(function* (snapshot: GameSnapshot) {
        const game = yield* get(snapshot.id);
        const scoreMs = scoreOf(snapshot);
        if (game.status !== "solved") {
          const values = yield* encodeSnapshot(snapshot);
          yield* database
            .run(
              database.query
                .updateTable("games")
                .set({
                  ...values,
                  status: "solved",
                  score_ms: scoreMs,
                  completed_at: values.updated_at,
                })
                .where("id", "=", snapshot.id),
            )
            .pipe(Effect.orDie);
        }
        const result = yield* rank(game, game.scoreMs ?? scoreMs);
        yield* reactivity.invalidate([gamesReactivityKey, "stats", "leaderboard"]);
        return result;
      });

      const remove = Effect.fn("Games.remove")(function* (id: string) {
        yield* database
          .run(database.query.deleteFrom("games").where("id", "=", id))
          .pipe(Effect.orDie);
        yield* reactivity.invalidate([gamesReactivityKey, "stats", "leaderboard"]);
      });

      const byStatus = (status: GameStatus) =>
        Effect.gen(function* () {
          const player = yield* players.current;
          return yield* database
            .rows(
              database.query
                .selectFrom("games")
                .select(summaryColumns)
                .where("player_id", "=", player.id)
                .where("status", "=", status)
                .orderBy("updated_at", "desc"),
            )
            .pipe(Effect.orDie);
        });

      const dailies = Effect.fn("Games.dailies")(function* (range: {
        readonly from: string;
        readonly to: string;
      }) {
        const player = yield* players.current;
        return yield* database
          .rows(
            database.query
              .selectFrom("games")
              .select(summaryColumns)
              .where("player_id", "=", player.id)
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
        standing,
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
