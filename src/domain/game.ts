import { Schema } from "effect";
import type { Puzzle } from "./puzzle.ts";
import type { Layer } from "./solver.ts";

export const Progress = Schema.Struct({
  numbers: Schema.Array(Schema.NullOr(Schema.Int)),
  colors: Schema.Array(Schema.NullOr(Schema.Int)),
});
export type Progress = typeof Progress.Type;
export const ProgressJson = Schema.fromJsonString(Progress);

export const Move = Schema.Struct({
  at: Schema.Int,
  cell: Schema.Int,
  layer: Schema.Literals(["number", "color"]),
  value: Schema.NullOr(Schema.Int),
});
export type Move = typeof Move.Type;
export const MovesJson = Schema.fromJsonString(Schema.Array(Move));

export interface Change {
  readonly cell: number;
  readonly layer: Layer;
  readonly before: number | null;
  readonly after: number | null;
}

export interface Board {
  readonly size: number;
  readonly numbers: ReadonlyArray<number | null>;
  readonly colors: ReadonlyArray<number | null>;
}

export const startingProgress = (puzzle: Puzzle): Progress => ({
  numbers: puzzle.solutionNumbers.map((value, cell) => (puzzle.givenNumbers[cell] ? value : null)),
  colors: puzzle.solutionColors.map((value, cell) => (puzzle.givenColors[cell] ? value : null)),
});

export const isGiven = (puzzle: Puzzle, cell: number, layer: Layer) =>
  Boolean(layer === "number" ? puzzle.givenNumbers[cell] : puzzle.givenColors[cell]);

export const valueAt = (board: Board, cell: number, layer: Layer) =>
  (layer === "number" ? board.numbers[cell] : board.colors[cell]) ?? null;

export const withValue = <B extends Board>(
  board: B,
  change: { cell: number; layer: Layer; value: number | null },
): B => {
  const key = change.layer === "number" ? "numbers" : "colors";
  const next = [...board[key]];
  next[change.cell] = change.value;
  return { ...board, [key]: next };
};

export const isFilled = (board: Board) =>
  board.numbers.every((value) => value !== null) && board.colors.every((value) => value !== null);

export const isSolved = (board: Board, puzzle: Puzzle) =>
  board.numbers.every((value, cell) => value === puzzle.solutionNumbers[cell]) &&
  board.colors.every((value, cell) => value === puzzle.solutionColors[cell]);

export interface WrongValue {
  readonly cell: number;
  readonly layer: Layer;
}

export const wrongValues = (board: Board, puzzle: Puzzle): ReadonlyArray<WrongValue> => [
  ...board.numbers.flatMap((value, cell) =>
    value !== null && value !== puzzle.solutionNumbers[cell]
      ? [{ cell, layer: "number" as const }]
      : [],
  ),
  ...board.colors.flatMap((value, cell) =>
    value !== null && value !== puzzle.solutionColors[cell]
      ? [{ cell, layer: "color" as const }]
      : [],
  ),
];
