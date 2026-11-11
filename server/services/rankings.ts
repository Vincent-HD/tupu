import { Context, Effect, Layer, Option } from "effect";
import type { SelectQueryBuilder } from "kysely";
import type { LeaderboardCategory, LeaderboardEntry, Standing } from "../../src/api/rpc.ts";
import { asDifficulty } from "../../src/domain/difficulty.ts";
import { ServerDatabase } from "../db/server-database.ts";
import type { ServerTables } from "../db/schema.ts";

type GamesQuery<O> = SelectQueryBuilder<ServerTables, "games", O>;

const ranked = <O>(query: GamesQuery<O>) =>
  query
    .where("games.status", "=", "solved")
    .where("games.verified", "=", 1)
    .where("games.deleted_at", "is", null)
    .where("games.score_ms", "is not", null);

const inCategory = <O>(query: GamesQuery<O>, category: LeaderboardCategory) => {
  switch (category.kind) {
    case "difficulty":
      return query
        .where("games.mode", "!=", "custom")
        .where("games.difficulty", "=", category.difficulty);
    case "daily":
      return query.where("games.mode", "=", "daily").where("games.daily_date", "=", category.date);
    case "custom":
      return query
        .where("games.mode", "=", "custom")
        .where("games.size", "=", category.size)
        .where("games.level", "=", category.level);
  }
};

export class Rankings extends Context.Service<
  Rankings,
  {
    readonly top: (input: {
      readonly category: LeaderboardCategory;
      readonly limit: number;
    }) => Effect.Effect<ReadonlyArray<LeaderboardEntry>>;
    readonly customBoards: Effect.Effect<
      ReadonlyArray<{ readonly size: number; readonly level: number }>
    >;
    readonly standing: (input: {
      readonly accountId: string;
      readonly gameId: string;
    }) => Effect.Effect<Standing | null>;
  }
>()("tupu/server/Rankings") {
  static readonly layer = Layer.effect(
    Rankings,
    Effect.gen(function* () {
      const database = yield* ServerDatabase;

      const top = Effect.fn("Rankings.top")(function* (input: {
        readonly category: LeaderboardCategory;
        readonly limit: number;
      }) {
        const rows = yield* database.rows(
          inCategory(
            ranked(
              database.query
                .selectFrom("games")
                .innerJoin("user", "user.id", "games.user_id")
                .select([
                  "games.id as gameId",
                  "user.id as accountId",
                  "user.name as name",
                  "games.score_ms as scoreMs",
                  "games.elapsed_ms as elapsedMs",
                  "games.hints as hints",
                  "games.checks as checks",
                  "games.completed_at as completedAt",
                  "games.mode as mode",
                ]),
            ),
            input.category,
          )
            .orderBy("games.score_ms")
            .orderBy("games.completed_at")
            .limit(Math.min(Math.max(input.limit, 1), 50)),
        );
        return rows.map((row): LeaderboardEntry => ({
          ...row,
          scoreMs: row.scoreMs ?? row.elapsedMs,
          completedAt: row.completedAt ?? "",
        }));
      }, Effect.orDie);

      const customBoards = database
        .rows(
          ranked(database.query.selectFrom("games").select(["games.size", "games.level"]))
            .where("games.mode", "=", "custom")
            .groupBy(["games.size", "games.level"])
            .orderBy("games.size")
            .orderBy("games.level"),
        )
        .pipe(Effect.orDie, Effect.withSpan("Rankings.customBoards"));

      const standing = Effect.fn("Rankings.standing")(function* (input: {
        readonly accountId: string;
        readonly gameId: string;
      }) {
        const game = yield* database.first(
          ranked(database.query.selectFrom("games").selectAll())
            .where("games.user_id", "=", input.accountId)
            .where("games.id", "=", input.gameId),
        );
        if (Option.isNone(game) || game.value.score_ms === null) return null;
        const scoreMs = game.value.score_ms;
        const difficulty = asDifficulty(game.value.difficulty);
        const category: LeaderboardCategory =
          game.value.mode === "custom" || difficulty === null
            ? { kind: "custom", size: game.value.size, level: game.value.level }
            : { kind: "difficulty", difficulty };
        const board = yield* database.rows(
          inCategory(
            ranked(
              database.query
                .selectFrom("games")
                .select(["games.id", "games.user_id", "games.score_ms"]),
            ),
            category,
          ),
        );
        const better = board.filter((entry) => (entry.score_ms ?? Infinity) < scoreMs).length;
        const personalBest = !board.some(
          (entry) =>
            entry.id !== input.gameId &&
            entry.user_id === input.accountId &&
            (entry.score_ms ?? Infinity) <= scoreMs,
        );
        return {
          scoreMs,
          rank: better + 1,
          entries: board.length,
          personalBest,
        } satisfies Standing;
      }, Effect.orDie);

      return Rankings.of({ top, customBoards, standing });
    }),
  );
}
