import { Schema } from "effect";
import { clueDensities } from "./difficulty.ts";
import { supportedSizes } from "./square.ts";
import type { Knowledge } from "./solver.ts";

export const LogicLevelSchema = Schema.Literals([1, 2, 3, 4]);

export class Puzzle extends Schema.Class<Puzzle, { readonly brand: unique symbol }>("Puzzle")({
  size: Schema.Literals(supportedSizes),
  level: LogicLevelSchema,
  density: Schema.Literals(clueDensities),
  seed: Schema.String,
  solutionNumbers: Schema.Array(Schema.Int),
  solutionColors: Schema.Array(Schema.Int),
  givenNumbers: Schema.Array(Schema.Boolean),
  givenColors: Schema.Array(Schema.Boolean),
  hardestLevel: LogicLevelSchema,
  logicSteps: Schema.Int,
}) {}

export const PuzzleJson = Schema.fromJsonString(Puzzle);

export const givenKnowledge = (puzzle: Puzzle): Knowledge => ({
  size: puzzle.size,
  numbers: puzzle.solutionNumbers.map((value, cell) => (puzzle.givenNumbers[cell] ? value : null)),
  colors: puzzle.solutionColors.map((value, cell) => (puzzle.givenColors[cell] ? value : null)),
});

export const givenCount = (puzzle: Puzzle) =>
  puzzle.givenNumbers.filter(Boolean).length + puzzle.givenColors.filter(Boolean).length;

export const minimumMoves = (puzzle: Puzzle) => puzzle.size * puzzle.size * 2 - givenCount(puzzle);
