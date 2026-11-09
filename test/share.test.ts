import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { generatePuzzle } from "../src/domain/generator.ts";
import { givenCount, givenKnowledge, minimumMoves } from "../src/domain/puzzle.ts";
import { shareGrid } from "../src/domain/share.ts";
import { solveLogically } from "../src/domain/solver.ts";

describe("share", () => {
  it.effect("maps every solved tile to its own color and counts the minimum moves", () =>
    Effect.gen(function* () {
      const puzzle = yield* generatePuzzle({ size: 5, level: 2, density: "sparse", seed: "share" });
      const solved = solveLogically(givenKnowledge(puzzle));
      const grid = shareGrid({ size: 5, numbers: solved.numbers, colors: solved.colors });
      expect(grid).toHaveLength(5);
      for (const row of grid) expect(new Set(Array.from(row)).size).toBe(5);
      expect(grid.join("")).not.toMatch(/[⬛⬜]/u);
      expect(minimumMoves(puzzle)).toBe(50 - givenCount(puzzle));
    }),
  );

  it("marks an empty tile as blank", () => {
    expect(shareGrid({ size: 1, numbers: [null], colors: [null] })).toEqual(["⬜"]);
  });
});
