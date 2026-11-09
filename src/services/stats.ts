import { Context, Effect, Layer } from "effect";
import { shiftDate, today } from "../domain/calendar.ts";
import { difficulties, type Difficulty } from "../domain/difficulty.ts";
import { isPerfect } from "../domain/score.ts";
import { Games, type GameSummary } from "./games.ts";

export interface DifficultyStats {
  readonly difficulty: Difficulty;
  readonly solved: number;
  readonly perfect: number;
  readonly bestMs: number | null;
  readonly averageMs: number | null;
  readonly times: ReadonlyArray<number>;
}

export interface PlayerStats {
  readonly solved: number;
  readonly perfect: number;
  readonly inProgress: number;
  readonly totalTimeMs: number;
  readonly averageHints: number;
  readonly averageChecks: number;
  readonly currentStreak: number;
  readonly bestStreak: number;
  readonly byDifficulty: ReadonlyArray<DifficultyStats>;
  readonly custom: number;
  readonly lastFourWeeks: ReadonlyArray<{
    readonly date: string;
    readonly solved: number;
    readonly daily: boolean;
  }>;
}

const average = (values: ReadonlyArray<number>) =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

const streaks = (dailyDates: ReadonlySet<string>, todayDate: string) => {
  let best = 0;
  let run = 0;
  const sorted = [...dailyDates].sort();
  let previous: string | undefined;
  for (const date of sorted) {
    run = previous !== undefined && shiftDate(previous, 1) === date ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  let current = 0;
  let cursor = dailyDates.has(todayDate) ? todayDate : shiftDate(todayDate, -1);
  while (dailyDates.has(cursor)) {
    current++;
    cursor = shiftDate(cursor, -1);
  }
  return { current, best };
};

export const computeStats = (input: {
  readonly solved: ReadonlyArray<GameSummary>;
  readonly inProgress: number;
  readonly today: string;
}): PlayerStats => {
  const { solved } = input;
  const dailyDates = new Set(
    solved.flatMap((game) => (game.mode === "daily" && game.daily_date ? [game.daily_date] : [])),
  );
  const { current, best } = streaks(dailyDates, input.today);
  const localDate = (iso: string | null) => {
    if (!iso) return "";
    const date = new Date(iso);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  return {
    solved: solved.length,
    perfect: solved.filter(isPerfect).length,
    inProgress: input.inProgress,
    totalTimeMs: solved.reduce((sum, game) => sum + game.elapsed_ms, 0),
    averageHints: average(solved.map((game) => game.hints)) ?? 0,
    averageChecks: average(solved.map((game) => game.checks)) ?? 0,
    currentStreak: current,
    bestStreak: best,
    custom: solved.filter((game) => game.mode === "custom").length,
    byDifficulty: difficulties.map((difficulty) => {
      const games = solved.filter(
        (game) => game.mode !== "custom" && game.difficulty === difficulty,
      );
      const times = games.map((game) => game.elapsed_ms);
      return {
        difficulty,
        solved: games.length,
        perfect: games.filter(isPerfect).length,
        bestMs: times.length ? Math.min(...times) : null,
        averageMs: average(times),
        times,
      };
    }),
    lastFourWeeks: Array.from({ length: 28 }, (_, index) => {
      const date = shiftDate(input.today, index - 27);
      return {
        date,
        solved: solved.filter((game) => localDate(game.completed_at) === date).length,
        daily: dailyDates.has(date),
      };
    }),
  };
};

export class Stats extends Context.Service<
  Stats,
  { readonly current: Effect.Effect<PlayerStats> }
>()("tupu/services/Stats") {
  static readonly layer = Layer.effect(
    Stats,
    Effect.gen(function* () {
      const games = yield* Games;
      const current = Effect.gen(function* () {
        const [solved, playing, date] = yield* Effect.all([games.solved, games.inProgress, today]);
        return computeStats({ solved, inProgress: playing.length, today: date });
      }).pipe(Effect.withSpan("Stats.current"));
      return Stats.of({ current });
    }),
  );
}
