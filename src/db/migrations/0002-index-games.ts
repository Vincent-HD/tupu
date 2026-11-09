import type { Kysely } from "kysely";
import type { Migration } from "kysely/migration";

export const indexGames: Migration = {
  up: async (db: Kysely<unknown>) => {
    await db.schema
      .createIndex("games_status_updated")
      .on("games")
      .columns(["status", "updated_at"])
      .execute();
    await db.schema
      .createIndex("games_daily")
      .on("games")
      .columns(["mode", "daily_date"])
      .execute();
    await db.schema
      .createIndex("games_leaderboard")
      .on("games")
      .columns(["status", "mode", "difficulty", "size", "score_ms"])
      .execute();
  },
  down: async (db: Kysely<unknown>) => {
    await db.schema.dropIndex("games_leaderboard").execute();
    await db.schema.dropIndex("games_daily").execute();
    await db.schema.dropIndex("games_status_updated").execute();
  },
};
