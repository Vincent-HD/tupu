import { Context, Effect, Layer } from "effect";
import { Database } from "../db/database.ts";
import type { Difficulty } from "../domain/difficulty.ts";

export type LeaderboardCategory =
  | { readonly kind: "difficulty"; readonly difficulty: Difficulty }
  | { readonly kind: "daily"; readonly date: string }
  | { readonly kind: "custom"; readonly size: number; readonly level: number };

export interface LeaderboardEntry {
  readonly gameId: string;
  readonly playerId: string;
  readonly playerName: string;
  readonly scoreMs: number;
  readonly elapsedMs: number;
  readonly hints: number;
  readonly checks: number;
  readonly completedAt: string;
  readonly mode: string;
}

export const leaderboardReactivityKey = "leaderboard";

export class Leaderboard extends Context.Service<
  Leaderboard,
  {
    readonly top: (input: {
      readonly category: LeaderboardCategory;
      readonly limit: number;
    }) => Effect.Effect<ReadonlyArray<LeaderboardEntry>>;
    readonly customCategories: Effect.Effect<
      ReadonlyArray<{ readonly size: number; readonly level: number }>
    >;
  }
>()("tupu/services/Leaderboard") {
  static readonly layer = Layer.effect(
    Leaderboard,
    Effect.gen(function* () {
      const database = yield* Database;

      const top = Effect.fn("Leaderboard.top")(function* (input: {
        readonly category: LeaderboardCategory;
        readonly limit: number;
      }) {
        const { category } = input;
        const rows = yield* database
          .rows(
            database.query
              .selectFrom("games")
              .innerJoin("players", "players.id", "games.player_id")
              .select([
                "games.id as gameId",
                "players.id as playerId",
                "players.name as playerName",
                "games.score_ms as scoreMs",
                "games.elapsed_ms as elapsedMs",
                "games.hints as hints",
                "games.checks as checks",
                "games.completed_at as completedAt",
                "games.mode as mode",
              ])
              .where("games.status", "=", "solved")
              .$if(category.kind === "difficulty", (query) =>
                query
                  .where("games.mode", "!=", "custom")
                  .where(
                    "games.difficulty",
                    "=",
                    category.kind === "difficulty" ? category.difficulty : "",
                  ),
              )
              .$if(category.kind === "daily", (query) =>
                query
                  .where("games.mode", "=", "daily")
                  .where("games.daily_date", "=", category.kind === "daily" ? category.date : ""),
              )
              .$if(category.kind === "custom", (query) =>
                query
                  .where("games.mode", "=", "custom")
                  .where("games.size", "=", category.kind === "custom" ? category.size : 0)
                  .where("games.level", "=", category.kind === "custom" ? category.level : 0),
              )
              .orderBy("games.score_ms")
              .orderBy("games.completed_at")
              .limit(input.limit),
          )
          .pipe(Effect.orDie);
        return rows.map((row) => ({
          ...row,
          scoreMs: row.scoreMs ?? row.elapsedMs,
          completedAt: row.completedAt ?? "",
        }));
      });

      const customCategories = database
        .rows(
          database.query
            .selectFrom("games")
            .select(["size", "level"])
            .where("status", "=", "solved")
            .where("mode", "=", "custom")
            .groupBy(["size", "level"])
            .orderBy("size")
            .orderBy("level"),
        )
        .pipe(Effect.orDie, Effect.withSpan("Leaderboard.customCategories"));

      return Leaderboard.of({ top, customCategories });
    }),
  );
}
