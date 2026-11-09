import { sql, type Kysely } from "kysely";
import type { Migration } from "kysely/migration";

export const createTables: Migration = {
  up: async (db: Kysely<unknown>) => {
    await db.schema
      .createTable("players")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("name", "text", (column) => column.notNull().unique())
      .addColumn("created_at", "text", (column) => column.notNull())
      .execute();
    await db.schema
      .createTable("settings")
      .addColumn("key", "text", (column) => column.primaryKey())
      .addColumn("value", "text", (column) => column.notNull())
      .execute();
    await db.schema
      .createTable("games")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("player_id", "text", (column) =>
        column.notNull().references("players.id").onDelete("cascade"),
      )
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
      .execute();
  },
  down: async (db: Kysely<unknown>) => {
    await db.schema.dropTable("games").execute();
    await db.schema.dropTable("settings").execute();
    await db.schema.dropTable("players").execute();
  },
};
