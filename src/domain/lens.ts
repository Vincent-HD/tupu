import type { Board } from "./game.ts";
import type { Layer } from "./solver.ts";

export interface LensFocus {
  readonly number: number | null;
  readonly color: number | null;
}

export const noFocus: LensFocus = { number: null, color: null };

export interface LensView {
  readonly active: boolean;
  readonly matches: ReadonlySet<number>;
  readonly possible: ReadonlySet<number>;
  readonly missingRows: ReadonlySet<number>;
  readonly missingColumns: ReadonlySet<number>;
  readonly placed: number;
}

const layerValues = (board: Board, layer: Layer) =>
  layer === "number" ? board.numbers : board.colors;

const lineHas = (
  board: Board,
  input: { kind: "row" | "column"; index: number; layer: Layer; value: number },
) =>
  layerValues(board, input.layer).some(
    (value, cell) =>
      value === input.value &&
      (input.kind === "row" ? Math.floor(cell / board.size) : cell % board.size) === input.index,
  );

const canStillTake = (board: Board, cell: number, layer: Layer, value: number) =>
  layerValues(board, layer)[cell] === null &&
  !lineHas(board, { kind: "row", index: Math.floor(cell / board.size), layer, value }) &&
  !lineHas(board, { kind: "column", index: cell % board.size, layer, value });

export const placedCount = (board: Board, layer: Layer, value: number) =>
  layerValues(board, layer).filter((candidate) => candidate === value).length;

export const lensView = (board: Board, focus: LensFocus): LensView => {
  const active = focus.number !== null || focus.color !== null;
  const matches = new Set<number>();
  const possible = new Set<number>();
  const missingRows = new Set<number>();
  const missingColumns = new Set<number>();
  if (!active) return { active, matches, possible, missingRows, missingColumns, placed: 0 };
  const fits = (cell: number, layer: Layer, value: number | null) =>
    value === null || layerValues(board, layer)[cell] === value;
  const reachable = (cell: number, layer: Layer, value: number | null) =>
    value === null ||
    layerValues(board, layer)[cell] === value ||
    canStillTake(board, cell, layer, value);
  for (let cell = 0; cell < board.size * board.size; cell++) {
    if (fits(cell, "number", focus.number) && fits(cell, "color", focus.color)) matches.add(cell);
    else if (reachable(cell, "number", focus.number) && reachable(cell, "color", focus.color))
      possible.add(cell);
  }
  const single =
    focus.number !== null && focus.color === null
      ? { layer: "number" as const, value: focus.number }
      : focus.color !== null && focus.number === null
        ? { layer: "color" as const, value: focus.color }
        : null;
  if (single)
    for (let index = 0; index < board.size; index++) {
      if (!lineHas(board, { kind: "row", index, ...single })) missingRows.add(index);
      if (!lineHas(board, { kind: "column", index, ...single })) missingColumns.add(index);
    }
  return { active, matches, possible, missingRows, missingColumns, placed: matches.size };
};
