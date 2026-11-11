import { SqliteClient } from "@effect/sql-sqlite-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { Kysely } from "kysely";
import { effectSqliteDialect } from "../src/db/effect-sqlite-dialect.ts";

interface Tables {
  readonly items: { readonly id: number; readonly label: string };
}

describe("Effect SQLite dialect", () => {
  it.effect("reports how many rows a write touched", () =>
    Effect.gen(function* () {
      const client = yield* SqlClient.SqlClient;
      const context = yield* Effect.context<never>();
      const db = new Kysely<Tables>({
        dialect: effectSqliteDialect({ client, run: Effect.runPromiseWith(context) }),
      });
      const run = <A>(query: () => Promise<A>) => Effect.promise(query);
      yield* run(() =>
        db.schema
          .createTable("items")
          .addColumn("id", "integer", (column) => column.primaryKey())
          .addColumn("label", "text", (column) => column.notNull())
          .execute(),
      );
      const inserted = yield* run(() =>
        db
          .insertInto("items")
          .values([
            { id: 1, label: "a" },
            { id: 2, label: "a" },
            { id: 3, label: "b" },
          ])
          .executeTakeFirst(),
      );
      expect(inserted.numInsertedOrUpdatedRows).toBe(3n);
      const updated = yield* run(() =>
        db.updateTable("items").set({ label: "c" }).where("label", "=", "a").executeTakeFirst(),
      );
      expect(updated.numUpdatedRows).toBe(2n);
      const deleted = yield* run(() =>
        db.deleteFrom("items").where("label", "=", "nothing").executeTakeFirst(),
      );
      expect(deleted.numDeletedRows).toBe(0n);
      const returned = yield* run(() =>
        db.deleteFrom("items").where("id", "=", 3).returningAll().execute(),
      );
      expect(returned).toEqual([{ id: 3, label: "b" }]);
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:" }))),
  );
});
