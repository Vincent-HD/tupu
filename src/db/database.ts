import { Context, Effect, Layer } from "effect";
import { migrations } from "./migrations/index.ts";
import type { Tables } from "./schema.ts";
import { DatabaseError, makeSqlDatabase, type SqlDatabase } from "./sql-database.ts";

export class Database extends Context.Service<
  Database,
  SqlDatabase<Tables> & {
    readonly transaction: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | DatabaseError, R>;
  }
>()("tupu/db/Database") {
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function* () {
      const { client, database } = yield* makeSqlDatabase<Tables>(migrations);
      return Database.of({
        ...database,
        transaction: (effect) =>
          client
            .withTransaction(effect)
            .pipe(
              Effect.catchTag("SqlError", (cause) => Effect.fail(new DatabaseError({ cause }))),
            ),
      });
    }),
  );
}
