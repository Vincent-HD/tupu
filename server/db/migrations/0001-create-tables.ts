import { sql, type Kysely } from "kysely";
import type { Migration } from "kysely/migration";

// The user, session, account, verification and passkey tables follow the
// schema better-auth expects for the emailOTP and passkey plugins.
export const createTables: Migration = {
  up: async (db: Kysely<unknown>) => {
    await db.schema
      .createTable("user")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("name", "text", (column) => column.notNull())
      .addColumn("email", "text", (column) => column.notNull().unique())
      .addColumn("emailVerified", "integer", (column) => column.notNull())
      .addColumn("image", "text")
      .addColumn("createdAt", "date", (column) => column.notNull())
      .addColumn("updatedAt", "date", (column) => column.notNull())
      .execute();
    await db.schema
      .createTable("session")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("expiresAt", "date", (column) => column.notNull())
      .addColumn("token", "text", (column) => column.notNull().unique())
      .addColumn("createdAt", "date", (column) => column.notNull())
      .addColumn("updatedAt", "date", (column) => column.notNull())
      .addColumn("ipAddress", "text")
      .addColumn("userAgent", "text")
      .addColumn("userId", "text", (column) =>
        column.notNull().references("user.id").onDelete("cascade"),
      )
      .execute();
    await db.schema
      .createTable("account")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("accountId", "text", (column) => column.notNull())
      .addColumn("providerId", "text", (column) => column.notNull())
      .addColumn("userId", "text", (column) =>
        column.notNull().references("user.id").onDelete("cascade"),
      )
      .addColumn("accessToken", "text")
      .addColumn("refreshToken", "text")
      .addColumn("idToken", "text")
      .addColumn("accessTokenExpiresAt", "date")
      .addColumn("refreshTokenExpiresAt", "date")
      .addColumn("scope", "text")
      .addColumn("password", "text")
      .addColumn("createdAt", "date", (column) => column.notNull())
      .addColumn("updatedAt", "date", (column) => column.notNull())
      .execute();
    await db.schema
      .createTable("verification")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("identifier", "text", (column) => column.notNull())
      .addColumn("value", "text", (column) => column.notNull())
      .addColumn("expiresAt", "date", (column) => column.notNull())
      .addColumn("createdAt", "date", (column) => column.notNull())
      .addColumn("updatedAt", "date", (column) => column.notNull())
      .execute();
    await db.schema
      .createTable("passkey")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("name", "text")
      .addColumn("publicKey", "text", (column) => column.notNull())
      .addColumn("userId", "text", (column) =>
        column.notNull().references("user.id").onDelete("cascade"),
      )
      .addColumn("credentialID", "text", (column) => column.notNull())
      .addColumn("counter", "integer", (column) => column.notNull())
      .addColumn("deviceType", "text", (column) => column.notNull())
      .addColumn("backedUp", "integer", (column) => column.notNull())
      .addColumn("transports", "text")
      .addColumn("createdAt", "date")
      .addColumn("aaguid", "text")
      .execute();
    await db.schema.createIndex("session_userId_idx").on("session").column("userId").execute();
    await db.schema.createIndex("account_userId_idx").on("account").column("userId").execute();
    await db.schema
      .createIndex("verification_identifier_idx")
      .on("verification")
      .column("identifier")
      .execute();
    await db.schema.createIndex("passkey_userId_idx").on("passkey").column("userId").execute();
    await db.schema
      .createIndex("passkey_credentialID_idx")
      .on("passkey")
      .column("credentialID")
      .execute();
    await db.schema
      .createTable("games")
      .addColumn("user_id", "text", (column) =>
        column.notNull().references("user.id").onDelete("cascade"),
      )
      .addColumn("id", "text", (column) => column.notNull())
      .addColumn("mode", "text", (column) => column.notNull())
      .addColumn("daily_date", "text")
      .addColumn("difficulty", "text")
      .addColumn("size", "integer", (column) => column.notNull())
      .addColumn("level", "integer", (column) => column.notNull())
      .addColumn("density", "text", (column) => column.notNull())
      .addColumn("seed", "text", (column) => column.notNull())
      .addColumn("puzzle", "text", (column) => column.notNull())
      .addColumn("progress", "text", (column) => column.notNull())
      .addColumn("moves", "text", (column) => column.notNull())
      .addColumn("elapsed_ms", "integer", (column) => column.notNull())
      .addColumn("hints", "integer", (column) => column.notNull())
      .addColumn("checks", "integer", (column) => column.notNull())
      .addColumn("status", "text", (column) => column.notNull().defaultTo(sql`'playing'`))
      .addColumn("score_ms", "integer")
      .addColumn("started_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .addColumn("completed_at", "text")
      .addColumn("deleted_at", "text")
      .addColumn("verified", "integer", (column) => column.notNull().defaultTo(0))
      .addColumn("seq", "integer", (column) => column.notNull())
      .addPrimaryKeyConstraint("games_pk", ["user_id", "id"])
      .execute();
    await db.schema.createIndex("games_user_seq").on("games").columns(["user_id", "seq"]).execute();
    await db.schema.createIndex("games_seq").on("games").column("seq").execute();
    await db.schema
      .createIndex("games_leaderboard")
      .on("games")
      .columns(["status", "verified", "mode", "difficulty", "size", "level", "score_ms"])
      .execute();
    await db.schema
      .createTable("puzzles")
      .addColumn("key", "text", (column) => column.primaryKey())
      .addColumn("puzzle", "text", (column) => column.notNull())
      .execute();
  },
};
