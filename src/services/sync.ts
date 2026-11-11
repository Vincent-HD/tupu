import { Context, DateTime, Effect, Layer, Option, Ref, Schema, Semaphore } from "effect";
import { Reactivity } from "effect/reactivity";
import { SyncGame, type SyncResult } from "../api/rpc.ts";
import { Database } from "../db/database.ts";
import type { GameRow } from "../db/schema.ts";
import { asDifficulty } from "../domain/difficulty.ts";
import { replacesServerVersion } from "../domain/reconcile.ts";
import { AccountStore } from "./account-store.ts";
import { Api } from "./api.ts";
import { gamesReactivityKey } from "./games.ts";

export type SyncStatus = "idle" | "syncing" | "offline" | "expired" | "signed-out";

export interface SyncState {
  readonly status: SyncStatus;
  readonly lastSyncedAt: string | null;
}

export const syncReactivityKey = "sync";

const isSyncGame = Schema.is(SyncGame);

const toSyncGame = (row: GameRow): SyncGame => ({
  id: row.id,
  mode: row.mode,
  daily_date: row.daily_date,
  difficulty: asDifficulty(row.difficulty),
  size: row.size,
  level: row.level,
  density: row.density,
  seed: row.seed,
  puzzle: row.puzzle,
  progress: row.progress,
  moves: row.moves,
  elapsed_ms: row.elapsed_ms,
  hints: row.hints,
  checks: row.checks,
  status: row.status,
  score_ms: row.score_ms,
  started_at: row.started_at,
  updated_at: row.updated_at,
  completed_at: row.completed_at,
  deleted_at: row.deleted_at,
});

export class Sync extends Context.Service<
  Sync,
  {
    readonly run: Effect.Effect<void>;
    readonly state: Effect.Effect<SyncState>;
    readonly pending: Effect.Effect<number>;
  }
>()("tupu/services/Sync") {
  static readonly layer = Layer.effect(
    Sync,
    Effect.gen(function* () {
      const database = yield* Database;
      const accounts = yield* AccountStore;
      const api = yield* Api;
      const reactivity = yield* Reactivity.Reactivity;
      const lock = yield* Semaphore.make(1);
      const state = yield* Ref.make<SyncState>({ status: "idle", lastSyncedAt: null });

      const setStatus = (status: SyncStatus) =>
        Effect.gen(function* () {
          const lastSyncedAt =
            status === "idle" ? DateTime.formatIso(yield* DateTime.now) : undefined;
          yield* Ref.update(state, (current) => ({
            status,
            lastSyncedAt: lastSyncedAt ?? current.lastSyncedAt,
          }));
          yield* reactivity.invalidate([syncReactivityKey]);
        });

      // Server versions win unless the local copy changed since and beats them
      // under the same rule the server applies.
      const apply = (result: SyncResult) =>
        database.transaction(
          Effect.forEach(
            result.games,
            (game) =>
              Effect.gen(function* () {
                const local = yield* database.first(
                  database.query.selectFrom("games").selectAll().where("id", "=", game.id),
                );
                if (
                  Option.isSome(local) &&
                  local.value.dirty === 1 &&
                  replacesServerVersion({
                    server: { status: game.status, updatedAt: game.updated_at },
                    client: { status: local.value.status, updatedAt: local.value.updated_at },
                  })
                )
                  return;
                if (game.deleted_at !== null) {
                  yield* database.run(database.query.deleteFrom("games").where("id", "=", game.id));
                  return;
                }
                const values = { ...game, dirty: 0 };
                yield* database.run(
                  database.query
                    .insertInto("games")
                    .values(values)
                    .onConflict((conflict) => conflict.column("id").doUpdateSet(values)),
                );
              }),
            { discard: true },
          ),
        );

      const exchange = Effect.gen(function* () {
        const account = yield* accounts.account;
        if (Option.isNone(account)) return yield* setStatus("signed-out");
        yield* setStatus("syncing");
        const dirty = yield* database.rows(
          database.query.selectFrom("games").selectAll().where("dirty", "=", 1),
        );
        const checked = dirty.map(toSyncGame).map((game) => ({ game, valid: isSyncGame(game) }));
        const sendable = checked.filter((entry) => entry.valid).map((entry) => entry.game);
        const skipped = checked.filter((entry) => !entry.valid).map((entry) => entry.game.id);
        if (skipped.length > 0)
          yield* Effect.logWarning("Skipped local games that do not match the sync schema", {
            ids: skipped,
          });
        const result = yield* api.Sync({
          changes: sendable,
          since: yield* accounts.cursor,
        });
        yield* apply(result);
        yield* accounts.setCursor(result.cursor);
        if (result.games.length > 0) yield* reactivity.invalidate([gamesReactivityKey, "stats"]);
        yield* setStatus("idle");
      });

      const run = exchange.pipe(
        Effect.catchTags({
          Unauthorized: () => setStatus("expired"),
          RpcClientError: () => setStatus("offline"),
        }),
        Effect.catchCause((cause) =>
          Effect.logWarning("Sync failed", cause).pipe(Effect.andThen(setStatus("offline"))),
        ),
        lock.withPermits(1),
        Effect.withSpan("Sync.run"),
      );

      const pending = database
        .first(
          database.query
            .selectFrom("games")
            .select((eb) => eb.fn.countAll<number>().as("count"))
            .where("dirty", "=", 1),
        )
        .pipe(
          Effect.map(Option.match({ onNone: () => 0, onSome: (row) => row.count })),
          Effect.orDie,
          Effect.withSpan("Sync.pending"),
        );

      return Sync.of({ run, state: Ref.get(state), pending });
    }),
  );
}
