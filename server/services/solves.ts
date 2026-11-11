import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { latestDailyDate, weekdayOf } from "../../src/domain/calendar.ts";
import { asDifficulty, dailyDifficulty, presets } from "../../src/domain/difficulty.ts";
import { dailyGameId, type Move } from "../../src/domain/game.ts";
import { generatePuzzle } from "../../src/domain/generator.ts";
import { PuzzleJson, type Puzzle } from "../../src/domain/puzzle.ts";
import { checkSolve } from "../../src/domain/verify.ts";
import { ServerDatabase } from "../db/server-database.ts";

export interface ReportedGame {
  readonly id: string;
  readonly mode: "daily" | "quick" | "custom";
  readonly dailyDate: string | null;
  readonly difficulty: string | null;
  readonly puzzle: Puzzle;
  readonly moves: ReadonlyArray<Move>;
  readonly elapsedMs: number;
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

// Rules that keep the one-daily-per-day invariant on the server. A game that
// breaks them is not stored at all.
export const isWellFormed = (game: ReportedGame) => {
  if (game.mode !== "daily") return game.dailyDate === null;
  const date = game.dailyDate;
  return (
    date !== null &&
    isoDatePattern.test(date) &&
    game.id === dailyGameId(date) &&
    game.puzzle.seed === `daily:${date}`
  );
};

const expectedSpec = (game: ReportedGame, today: string) => {
  if (game.mode === "custom") return Option.some(game.puzzle);
  if (game.mode === "quick")
    return Option.map(
      Option.fromNullishOr(asDifficulty(game.difficulty)),
      (found) => presets[found],
    );
  const date = game.dailyDate ?? "";
  if (date > today) return Option.none();
  const difficulty = dailyDifficulty(weekdayOf(date));
  return game.difficulty === difficulty ? Option.some(presets[difficulty]) : Option.none();
};

export class Solves extends Context.Service<
  Solves,
  { readonly isVerified: (game: ReportedGame) => Effect.Effect<boolean> }
>()("tupu/server/Solves") {
  static readonly layer = Layer.effect(
    Solves,
    Effect.gen(function* () {
      const database = yield* ServerDatabase;

      const canonical = Effect.fn("Solves.canonical")(function* (puzzle: Puzzle) {
        const key = `${puzzle.seed}|${puzzle.size}|${puzzle.level}|${puzzle.density}`;
        const cached = yield* database.first(
          database.query.selectFrom("puzzles").select("puzzle").where("key", "=", key),
        );
        if (Option.isSome(cached))
          return yield* Schema.decodeEffect(PuzzleJson)(cached.value.puzzle);
        const generated = yield* generatePuzzle({
          size: puzzle.size,
          level: puzzle.level,
          density: puzzle.density,
          seed: puzzle.seed,
        });
        yield* database.run(
          database.query
            .insertInto("puzzles")
            .values({ key, puzzle: yield* Schema.encodeEffect(PuzzleJson)(generated) })
            .onConflict((conflict) => conflict.column("key").doNothing()),
        );
        return generated;
      }, Effect.orDie);

      const isVerified = Effect.fn("Solves.isVerified")(function* (game: ReportedGame) {
        const today = latestDailyDate(yield* DateTime.now);
        const spec = expectedSpec(game, today);
        if (Option.isNone(spec)) return false;
        const matchesSpec =
          spec.value.size === game.puzzle.size &&
          spec.value.level === game.puzzle.level &&
          spec.value.density === game.puzzle.density;
        if (!matchesSpec) return false;
        const reference = yield* canonical(game.puzzle);
        return (
          checkSolve({
            puzzle: game.puzzle,
            canonical: reference,
            moves: game.moves,
            elapsedMs: game.elapsedMs,
          }) === null
        );
      });

      return Solves.of({ isVerified });
    }),
  );
}
