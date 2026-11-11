import { sql, type Kysely } from "kysely";
import type { Migration } from "kysely/migration";

// Accounts replace local players: games now belong to the signed-in account
// and sync with the server, so data from the local-only era is dropped.
export const accounts: Migration = {
  up: async (db: Kysely<unknown>) => {
    await db.schema.dropTable("games").execute();
    await db.schema.dropTable("players").execute();
    await db.schema
      .createTable("games")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("mode", "text", (column) => column.notNull())
      .addColumn("daily_date", "text")
      .addColumn("difficulty", "text")
      .addColumn("size", "integer", (column) => column.notNull())
      .addColumn("level", "integer", (column) => column.notNull())
      .addColumn("density", "text", (column) => column.notNull())
      .addColumn("seed", "text", (column) => column.notNull())
      .addColumn("puzzle", "text", (column) => column.notNull())
      .addColumn("progress", "text", (column) => column.notNull())
      .addColumn("moves", "text", (column) => column.notNull().defaultTo("[]"))
      .addColumn("elapsed_ms", "integer", (column) => column.notNull().defaultTo(0))
      .addColumn("hints", "integer", (column) => column.notNull().defaultTo(0))
      .addColumn("checks", "integer", (column) => column.notNull().defaultTo(0))
      .addColumn("status", "text", (column) => column.notNull().defaultTo(sql`'playing'`))
      .addColumn("score_ms", "integer")
      .addColumn("started_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .addColumn("completed_at", "text")
      .addColumn("deleted_at", "text")
      .addColumn("dirty", "integer", (column) => column.notNull().defaultTo(1))
      .execute();
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
    await db.schema.createIndex("games_dirty").on("games").column("dirty").execute();
  },
};
