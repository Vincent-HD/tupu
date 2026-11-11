import type { Migration } from "kysely/migration";
import { createTables } from "./0001-create-tables.ts";
import { indexGames } from "./0002-index-games.ts";
import { accounts } from "./0003-accounts.ts";

export const migrations: Readonly<Record<string, Migration>> = {
  "0001-create-tables": createTables,
  "0002-index-games": indexGames,
  "0003-accounts": accounts,
};
