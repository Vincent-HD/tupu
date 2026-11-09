import type { BoardSize } from "./square.ts";
import type { LogicLevel } from "./solver.ts";

export const difficulties = ["easy", "medium", "tricky", "hard", "expert"] as const;
export type Difficulty = (typeof difficulties)[number];

export const clueDensities = ["generous", "balanced", "sparse"] as const;
export type ClueDensity = (typeof clueDensities)[number];

export interface PuzzleSpec {
  readonly size: BoardSize;
  readonly level: LogicLevel;
  readonly density: ClueDensity;
}

export const presets: Readonly<Record<Difficulty, PuzzleSpec>> = {
  easy: { size: 4, level: 1, density: "generous" },
  medium: { size: 4, level: 1, density: "sparse" },
  tricky: { size: 5, level: 2, density: "sparse" },
  hard: { size: 5, level: 3, density: "sparse" },
  expert: { size: 7, level: 3, density: "sparse" },
};

export const difficultyLabels: Readonly<Record<Difficulty, string>> = {
  easy: "Easy",
  medium: "Medium",
  tricky: "Tricky",
  hard: "Hard",
  expert: "Expert",
};

export const levelLabels: Readonly<Record<LogicLevel, string>> = {
  1: "Line logic",
  2: "Pair logic",
  3: "Pair hunting",
  4: "Deep logic",
};

export const levelDescriptions: Readonly<Record<LogicLevel, string>> = {
  1: "Each layer on its own, like a mini sudoku.",
  2: "Combine numbers and colors through used pairs.",
  3: "Find the one tile a missing pair can still reach.",
  4: "Chains of eliminations across the whole board.",
};

export const densityKeepRatio: Readonly<Record<ClueDensity, number>> = {
  generous: 0.5,
  balanced: 0.32,
  sparse: 0,
};

const weekdayDifficulty: ReadonlyArray<Difficulty> = [
  "expert",
  "easy",
  "medium",
  "medium",
  "tricky",
  "tricky",
  "hard",
];

export const dailyDifficulty = (weekday: number): Difficulty =>
  weekdayDifficulty[weekday] ?? "easy";

export const asDifficulty = (value: string | null): Difficulty | null =>
  difficulties.find((difficulty) => difficulty === value) ?? null;

export const asLevel = (value: number): LogicLevel =>
  value <= 1 ? 1 : value === 2 ? 2 : value === 3 ? 3 : 4;
