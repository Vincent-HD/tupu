import { Schema, type Effect } from "effect";
import type { SqlClient } from "effect/sql/SqlClient";
import type { SqlError } from "effect/sql/SqlError";
import {
  CompiledQuery,
  DeleteQueryNode,
  InsertQueryNode,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  UpdateQueryNode,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type QueryResult,
} from "kysely";

type Runner = <A>(effect: Effect.Effect<A, SqlError>) => Promise<A>;

// Drivers report the rows a write touched differently: node:sqlite returns
// `changes`, D1 returns `meta.changes`. Kysely needs the count for updates and
// deletes, and better-auth relies on it.
const WriteResult = Schema.Union([
  Schema.Struct({ changes: Schema.Union([Schema.Finite, Schema.BigInt]) }),
  Schema.Struct({ meta: Schema.Struct({ changes: Schema.Finite }) }),
]);
const isWriteResult = Schema.is(WriteResult);

const affectedRows = (result: unknown) => {
  if (!isWriteResult(result)) return undefined;
  return BigInt("changes" in result ? result.changes : result.meta.changes);
};

const isWriteWithoutReturning = (compiled: CompiledQuery) => {
  const node = compiled.query;
  if (!InsertQueryNode.is(node) && !UpdateQueryNode.is(node) && !DeleteQueryNode.is(node))
    return false;
  return node.returning === undefined;
};

const makeConnection = ({
  client,
  run,
}: {
  client: SqlClient;
  run: Runner;
}): DatabaseConnection => ({
  executeQuery: async <Row>(compiled: CompiledQuery): Promise<QueryResult<Row>> => {
    if (isWriteWithoutReturning(compiled)) {
      const result = await run(client.unsafe(compiled.sql, compiled.parameters).raw);
      const numAffectedRows = affectedRows(result);
      return numAffectedRows === undefined ? { rows: [] } : { rows: [], numAffectedRows };
    }
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
