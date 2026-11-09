import type { ColumnType, Insertable, Selectable } from "kysely";

export type GameMode = "daily" | "quick" | "custom";
export type GameStatus = "playing" | "solved";

export interface PlayersTable {
  readonly id: string;
  readonly name: string;
  readonly created_at: string;
}

export interface SettingsTable {
  readonly key: string;
  readonly value: string;
}

export interface GamesTable {
  readonly id: string;
  readonly player_id: string;
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
  readonly hints: ColumnType<number, number | undefined, number>;
  readonly checks: ColumnType<number, number | undefined, number>;
  readonly status: GameStatus;
  readonly score_ms: number | null;
  readonly started_at: string;
  readonly updated_at: string;
  readonly completed_at: string | null;
}

export interface Tables {
  readonly players: PlayersTable;
  readonly settings: SettingsTable;
  readonly games: GamesTable;
}

export type GameRow = Selectable<GamesTable>;
export type NewGameRow = Insertable<GamesTable>;
export type PlayerRow = Selectable<PlayersTable>;
