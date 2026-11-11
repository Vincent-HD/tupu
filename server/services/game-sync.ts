import { Context, Effect, Layer, Option, Schema } from "effect";
import { sql } from "kysely";
import type { SyncGame, SyncResult } from "../../src/api/rpc.ts";
import { asDifficulty } from "../../src/domain/difficulty.ts";
import { MovesJson, ProgressJson } from "../../src/domain/game.ts";
import { PuzzleJson } from "../../src/domain/puzzle.ts";
import { replacesServerVersion } from "../../src/domain/reconcile.ts";
import { scoreOf } from "../../src/domain/score.ts";
import { ServerDatabase } from "../db/server-database.ts";
import type { ServerGameRow } from "../db/schema.ts";
import { isWellFormed, Solves, type ReportedGame } from "./solves.ts";

const nextSeq = sql<number>`(select coalesce(max(seq), 0) + 1 from games)`;

// SQL twin of `replacesServerVersion`, evaluated inside the upsert so two
// concurrent syncs can never overwrite a better version. It needs no
// transaction, which D1 does not offer.
const clientVersionWins = sql<boolean>`(case excluded.status when 'solved' then 1 else 0 end) > (case games.status when 'solved' then 1 else 0 end) or (excluded.status = games.status and excluded.updated_at > games.updated_at)`;

const toSyncGame = (row: ServerGameRow): SyncGame => ({
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

const decodeReported = (change: SyncGame) =>
  Effect.all({
    puzzle: Schema.decodeEffect(PuzzleJson)(change.puzzle),
    moves: Schema.decodeEffect(MovesJson)(change.moves),
    progress: Schema.decodeEffect(ProgressJson)(change.progress),
  }).pipe(
    Effect.map((decoded): ReportedGame => ({
      id: change.id,
      mode: change.mode,
      dailyDate: change.daily_date,
      difficulty: change.difficulty,
      puzzle: decoded.puzzle,
      moves: decoded.moves,
      elapsedMs: change.elapsed_ms,
    })),
    Effect.option,
  );

export class GameSync extends Context.Service<
  GameSync,
  {
    readonly sync: (input: {
      readonly accountId: string;
      readonly changes: ReadonlyArray<SyncGame>;
      readonly since: number;
    }) => Effect.Effect<SyncResult>;
  }
>()("tupu/server/GameSync") {
  static readonly layer = Layer.effect(
    GameSync,
    Effect.gen(function* () {
      const database = yield* ServerDatabase;
      const solves = yield* Solves;

      const current = (accountId: string, id: string) =>
        database.first(
          database.query
            .selectFrom("games")
            .selectAll()
            .where("user_id", "=", accountId)
            .where("id", "=", id),
        );

      const store = Effect.fn("GameSync.store")(function* (input: {
        readonly accountId: string;
        readonly change: SyncGame;
      }) {
        const { change } = input;
        const reported = yield* decodeReported(change);
        if (Option.isNone(reported) || !isWellFormed(reported.value)) return Option.none();
        const existing = yield* current(input.accountId, change.id);
        if (
          Option.isSome(existing) &&
          !replacesServerVersion({
            server: { status: existing.value.status, updatedAt: existing.value.updated_at },
            client: { status: change.status, updatedAt: change.updated_at },
          })
        )
          return existing;
        const solved = change.status === "solved" && change.deleted_at === null;
        const verified = solved ? yield* solves.isVerified(reported.value) : false;
        const { puzzle } = reported.value;
        const values = {
          mode: change.mode,
          daily_date: change.daily_date,
          difficulty: change.difficulty,
          size: puzzle.size,
          level: puzzle.level,
          density: puzzle.density,
          seed: puzzle.seed,
          puzzle: change.puzzle,
          progress: change.progress,
          moves: change.moves,
          elapsed_ms: change.elapsed_ms,
          hints: change.hints,
          checks: change.checks,
          status: change.status,
          score_ms:
            change.status === "solved"
              ? scoreOf({
                  elapsedMs: change.elapsed_ms,
                  hints: change.hints,
                  checks: change.checks,
                })
              : null,
          started_at: change.started_at,
          updated_at: change.updated_at,
          completed_at: change.completed_at,
          deleted_at: change.deleted_at,
          verified: verified ? 1 : 0,
          seq: nextSeq,
        };
        yield* database.run(
          database.query
            .insertInto("games")
            .values({ user_id: input.accountId, id: change.id, ...values })
            .onConflict((conflict) =>
              conflict.columns(["user_id", "id"]).doUpdateSet(values).where(clientVersionWins),
            ),
        );
        return Option.none();
      }, Effect.orDie);

      const sync = Effect.fn("GameSync.sync")(function* (input: {
        readonly accountId: string;
        readonly changes: ReadonlyArray<SyncGame>;
        readonly since: number;
      }) {
        const kept = new Map<string, ServerGameRow>();
        for (const change of input.changes) {
          const winner = yield* store({ accountId: input.accountId, change });
          if (Option.isSome(winner)) kept.set(winner.value.id, winner.value);
        }
        const changed = yield* database
          .rows(
            database.query
              .selectFrom("games")
              .selectAll()
              .where("user_id", "=", input.accountId)
              .where("seq", ">", input.since)
              .orderBy("seq"),
          )
          .pipe(Effect.orDie);
        for (const row of changed) kept.set(row.id, row);
        const rows = [...kept.values()];
        return {
          games: rows.map(toSyncGame),
          cursor: Math.max(input.since, ...changed.map((row) => row.seq)),
        } satisfies SyncResult;
      });

      return GameSync.of({ sync });
    }),
  );
}
