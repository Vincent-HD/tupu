import { Context, Schema } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/rpc";
import { difficulties } from "../domain/difficulty.ts";

export const Email = Schema.String.check(
  Schema.isMaxLength(254),
  Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: "Enter a valid email address." }),
);

export const DisplayName = Schema.String.check(
  Schema.isMinLength(1, { message: "Pick a name." }),
  Schema.isMaxLength(24, { message: "24 characters at most." }),
);

export const Account = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
});
export type Account = typeof Account.Type;

export const SyncGame = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  mode: Schema.Literals(["daily", "quick", "custom"]),
  daily_date: Schema.NullOr(Schema.String),
  difficulty: Schema.NullOr(Schema.Literals(difficulties)),
  size: Schema.Int,
  level: Schema.Int,
  density: Schema.String,
  seed: Schema.String,
  puzzle: Schema.String,
  progress: Schema.String,
  moves: Schema.String,
  elapsed_ms: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  hints: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  checks: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  status: Schema.Literals(["playing", "solved"]),
  score_ms: Schema.NullOr(Schema.Int),
  started_at: Schema.String,
  updated_at: Schema.String,
  completed_at: Schema.NullOr(Schema.String),
  deleted_at: Schema.NullOr(Schema.String),
});
export type SyncGame = typeof SyncGame.Type;

export const SyncResult = Schema.Struct({
  games: Schema.Array(SyncGame),
  cursor: Schema.Int,
});
export type SyncResult = typeof SyncResult.Type;

export const LeaderboardCategory = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("difficulty"), difficulty: Schema.Literals(difficulties) }),
  Schema.Struct({ kind: Schema.Literal("daily"), date: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("custom"), size: Schema.Int, level: Schema.Int }),
]);
export type LeaderboardCategory = typeof LeaderboardCategory.Type;

export const LeaderboardEntry = Schema.Struct({
  gameId: Schema.String,
  accountId: Schema.String,
  name: Schema.String,
  scoreMs: Schema.Int,
  elapsedMs: Schema.Int,
  hints: Schema.Int,
  checks: Schema.Int,
  completedAt: Schema.String,
  mode: Schema.String,
  // Which puzzle was solved: the daily of this date, or a random one when null.
  dailyDate: Schema.NullOr(Schema.String),
  difficulty: Schema.NullOr(Schema.String),
});
export type LeaderboardEntry = typeof LeaderboardEntry.Type;

export const CustomBoard = Schema.Struct({ size: Schema.Int, level: Schema.Int });

export const Standing = Schema.Struct({
  scoreMs: Schema.Int,
  rank: Schema.Int,
  entries: Schema.Int,
  personalBest: Schema.Boolean,
});
export type Standing = typeof Standing.Type;

export class Unauthorized extends Schema.TaggedError<
  Unauthorized,
  { readonly brand: unique symbol }
>()("Unauthorized", {}) {}

export class CurrentAccount extends Context.Service<CurrentAccount, Account>()(
  "tupu/api/CurrentAccount",
) {}

export class Authentication extends RpcMiddleware.Service<
  Authentication,
  { provides: CurrentAccount }
>()("tupu/api/Authentication", { error: Unauthorized }) {}

export const TupuRpcs = RpcGroup.make(
  Rpc.make("Rename", { payload: Schema.Struct({ name: DisplayName }), success: Account }),
  Rpc.make("Sync", {
    payload: Schema.Struct({ changes: Schema.Array(SyncGame), since: Schema.Int }),
    success: SyncResult,
  }),
  Rpc.make("Leaderboard", {
    payload: Schema.Struct({ category: LeaderboardCategory, limit: Schema.Int }),
    success: Schema.Array(LeaderboardEntry),
  }),
  Rpc.make("CustomBoards", { success: Schema.Array(CustomBoard) }),
  Rpc.make("Standing", {
    payload: Schema.Struct({ gameId: Schema.String }),
    success: Schema.NullOr(Standing),
  }),
).middleware(Authentication);
