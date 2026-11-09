import { SqliteClient } from "@effect/sql-sqlite-wasm";
import { Context, Effect, Layer, Schema } from "effect";
import { Reactivity } from "effect/reactivity";
import { Database } from "../db/database.ts";
import type { GameRow, PlayerRow } from "../db/schema.ts";

export class BackupError extends Schema.TaggedError<
  BackupError,
  { readonly brand: unique symbol }
>()("BackupError", {
  cause: Schema.Defect(),
}) {}

const toBackupError = (cause: unknown) => new BackupError({ cause });

export class Backup extends Context.Service<
  Backup,
  {
    readonly snapshot: Effect.Effect<Uint8Array, BackupError>;
    readonly restore: (bytes: Uint8Array) => Effect.Effect<void, BackupError>;
  }
>()("tupu/services/Backup") {
  static readonly layer = Layer.effect(
    Backup,
    Effect.gen(function* () {
      const client = yield* SqliteClient.SqliteClient;
      const database = yield* Database;
      const reactivity = yield* Reactivity.Reactivity;

      const readBackup = Effect.fn("Backup.readBackup")(function* (bytes: Uint8Array) {
        const memory = yield* SqliteClient.makeMemory({});
        yield* memory.import(bytes);
        return {
          players: yield* memory.unsafe<PlayerRow>("select id, name, created_at from players"),
          settings: yield* memory.unsafe<{ key: string; value: string }>(
            "select key, value from settings",
          ),
          games: yield* memory.unsafe<GameRow>("select * from games"),
        };
      }, Effect.scoped);

      const restore = Effect.fn("Backup.restore")(function* (bytes: Uint8Array) {
        const header = new TextDecoder().decode(bytes.slice(0, 15));
        if (header !== "SQLite format 3")
          return yield* new BackupError({ cause: "Not a SQLite database file" });
        const backup = yield* readBackup(bytes).pipe(
          Effect.provideService(Reactivity.Reactivity, reactivity),
          Effect.mapError(toBackupError),
        );
        yield* database
          .transaction(
            Effect.gen(function* () {
              yield* database.run(database.query.deleteFrom("games"));
              yield* database.run(database.query.deleteFrom("players"));
              yield* database.run(database.query.deleteFrom("settings"));
              for (const player of backup.players)
                yield* database.run(database.query.insertInto("players").values(player));
              for (const setting of backup.settings)
                yield* database.run(database.query.insertInto("settings").values(setting));
              for (const game of backup.games)
                yield* database.run(database.query.insertInto("games").values(game));
            }),
          )
          .pipe(Effect.mapError(toBackupError));
        yield* reactivity.invalidate(["settings", "players", "games", "stats", "leaderboard"]);
      });

      return Backup.of({
        snapshot: client.export.pipe(
          Effect.mapError(toBackupError),
          Effect.withSpan("Backup.snapshot"),
        ),
        restore,
      });
    }),
  );
}
