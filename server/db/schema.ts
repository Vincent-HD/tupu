import type { Selectable } from "kysely";
import type { GameMode, GameStatus } from "../../src/db/schema.ts";

// better-auth owns this table and names its columns in camelCase.
export interface UserTable {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly emailVerified: number;
  readonly image: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ServerGamesTable {
  readonly user_id: string;
  readonly id: string;
  readonly mode: GameMode;
  readonly daily_date: string | null;
  readonly difficulty: string | null;
  readonly size: number;
  readonly level: number;
  readonly density: string;
  readonly seed: string;
  readonly puzzle: string;
  readonly progress: string;
  readonly moves: string;
  readonly elapsed_ms: number;
  readonly hints: number;
  readonly checks: number;
  readonly status: GameStatus;
  readonly score_ms: number | null;
  readonly started_at: string;
  readonly updated_at: string;
  readonly completed_at: string | null;
  readonly deleted_at: string | null;
  readonly verified: number;
  readonly seq: number;
}

export interface PuzzlesTable {
  readonly key: string;
  readonly puzzle: string;
}

export interface ServerTables {
  readonly user: UserTable;
  readonly games: ServerGamesTable;
  readonly puzzles: PuzzlesTable;
}

export type ServerGameRow = Selectable<ServerGamesTable>;
