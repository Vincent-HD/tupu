import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { Kysely, type Compilable } from "kysely";
import { Migrator } from "kysely/migration";
import { effectSqliteDialect } from "./effect-sqlite-dialect.ts";
import { migrations } from "./migrations/index.ts";
import type { Tables } from "./schema.ts";

export class DatabaseError extends Schema.TaggedError<
  DatabaseError,
  { readonly brand: unique symbol }
>()("DatabaseError", {
  cause: Schema.Defect(),
}) {}

export class MigrationError extends Schema.TaggedError<
  MigrationError,
  { readonly brand: unique symbol }
>()("MigrationError", {
  migration: Schema.String,
  cause: Schema.Defect(),
}) {}

export class Database extends Context.Service<
  Database,
  {
    readonly query: Kysely<Tables>;
    readonly rows: <Row>(
      query: Compilable<Row>,
    ) => Effect.Effect<ReadonlyArray<Row>, DatabaseError>;
    readonly first: <Row>(
      query: Compilable<Row>,
    ) => Effect.Effect<Option.Option<Row>, DatabaseError>;
    readonly run: (query: Compilable<unknown>) => Effect.Effect<void, DatabaseError>;
    readonly transaction: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | DatabaseError, R>;
  }
>()("tupu/db/Database") {
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function* () {
      const client = yield* SqlClient.SqlClient;
      const context = yield* Effect.context<never>();
      const query = new Kysely<Tables>({
        dialect: effectSqliteDialect({
          client,
          run: (effect) => Effect.runPromiseWith(context)(effect),
        }),
      });
      yield* migrate(query);

      const rows = <Row>(compilable: Compilable<Row>) => {
        const compiled = compilable.compile();
        return client.unsafe<Row & object>(compiled.sql, compiled.parameters).pipe(
          Effect.map((result): ReadonlyArray<Row> => result),
          Effect.mapError((cause) => new DatabaseError({ cause })),
          Effect.withSpan("Database.rows"),
        );
      };

      return Database.of({
        query,
        rows,
        first: (compilable) =>
          rows(compilable).pipe(Effect.map((result) => Option.fromNullishOr(result[0]))),
        run: (compilable) => Effect.asVoid(rows(compilable)),
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

const migrate = Effect.fn("Database.migrate")(function* (query: Kysely<Tables>) {
  const migrator = new Migrator({
    db: query,
    provider: { getMigrations: async () => migrations },
  });
  const resultSet = yield* Effect.tryPromise({
    try: () => migrator.migrateToLatest(),
    catch: (cause) => new MigrationError({ migration: "unknown", cause }),
  });
  if (resultSet.error === undefined) return resultSet.results ?? [];
  const failed = resultSet.results?.find((result) => result.status === "Error");
  return yield* new MigrationError({
    migration: failed?.migrationName ?? "unknown",
    cause: resultSet.error,
  });
});
