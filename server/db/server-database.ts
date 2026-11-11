import { Context, Effect, Layer } from "effect";
import { makeSqlDatabase, type SqlDatabase } from "../../src/db/sql-database.ts";
import { serverMigrations } from "./migrations/index.ts";
import type { ServerTables } from "./schema.ts";

export class ServerDatabase extends Context.Service<ServerDatabase, SqlDatabase<ServerTables>>()(
  "tupu/server/ServerDatabase",
) {
  static readonly layer = Layer.effect(
    ServerDatabase,
    Effect.map(makeSqlDatabase<ServerTables>(serverMigrations), (made) => made.database),
  );
}
