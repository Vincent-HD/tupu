import type { Migration } from "kysely/migration";
import { createTables } from "./0001-create-tables.ts";

export const serverMigrations: Readonly<Record<string, Migration>> = {
  "0001-create-tables": createTables,
};
