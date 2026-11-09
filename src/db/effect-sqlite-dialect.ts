import type { Effect } from "effect";
import type { SqlClient } from "effect/sql/SqlClient";
import type { SqlError } from "effect/sql/SqlError";
import {
  CompiledQuery,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type QueryResult,
} from "kysely";

type Runner = <A>(effect: Effect.Effect<A, SqlError>) => Promise<A>;

const makeConnection = ({
  client,
  run,
}: {
  client: SqlClient;
  run: Runner;
}): DatabaseConnection => ({
  executeQuery: async <Row>(compiled: CompiledQuery): Promise<QueryResult<Row>> => {
    const rows = await run(client.unsafe<Row & object>(compiled.sql, compiled.parameters));
    return { rows: [...rows] };
  },
  // oxlint-disable-next-line require-yield
  streamQuery: async function* () {
    throw new Error("Streaming is not supported by the Effect SQLite dialect");
  },
});

const makeDriver = (connection: DatabaseConnection): Driver => ({
  init: async () => {},
  acquireConnection: async () => connection,
  beginTransaction: async (active) => {
    await active.executeQuery(CompiledQuery.raw("begin"));
  },
  commitTransaction: async (active) => {
    await active.executeQuery(CompiledQuery.raw("commit"));
  },
  rollbackTransaction: async (active) => {
    await active.executeQuery(CompiledQuery.raw("rollback"));
  },
  releaseConnection: async () => {},
  destroy: async () => {},
});

export const effectSqliteDialect = (options: { client: SqlClient; run: Runner }): Dialect => ({
  createAdapter: () => new SqliteAdapter(),
  createDriver: () => makeDriver(makeConnection(options)),
  createIntrospector: (db) => new SqliteIntrospector(db),
  createQueryCompiler: () => new SqliteQueryCompiler(),
});
