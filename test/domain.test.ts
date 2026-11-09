import { describe, expect, it } from "@effect/vitest";
import { Effect, Random } from "effect";
import { presets } from "../src/domain/difficulty.ts";
import { generatePuzzle } from "../src/domain/generator.ts";
import { givenKnowledge } from "../src/domain/puzzle.ts";
import { findConflicts, solveLogically } from "../src/domain/solver.ts";
import { isEulerSquare, randomSquare, supportedSizes } from "../src/domain/square.ts";

describe("squares", () => {
  it.effect.each([...supportedSizes])("builds an Euler square of size %i", (size) =>
    Effect.gen(function* () {
      for (let index = 0; index < 5; index++) {
        const square = yield* randomSquare(size);
        expect(isEulerSquare(square)).toBe(true);
      }
    }).pipe(Random.withSeed(`square-${size}`)),
  );
});

describe("generator", () => {
  it.effect.each(Object.entries(presets))("generates a uniquely solvable %s puzzle", ([, spec]) =>
    Effect.gen(function* () {
      const startedAt = performance.now();
      const puzzle = yield* generatePuzzle({ ...spec, seed: "fixed" });
      const report = solveLogically(givenKnowledge(puzzle), spec.level);
      console.log(
        spec,
        Math.round(performance.now() - startedAt),
        "ms",
        report.levelCounts,
        report.steps.length,
      );
      expect(report.solved).toBe(true);
      expect(report.numbers).toEqual(puzzle.solutionNumbers);
      expect(report.colors).toEqual(puzzle.solutionColors);
      expect(findConflicts(givenKnowledge(puzzle))).toEqual([]);
    }),
  );

  it.effect("is deterministic for a seed", () =>
    Effect.gen(function* () {
      const first = yield* generatePuzzle({ ...presets.tricky, seed: "same" });
      const second = yield* generatePuzzle({ ...presets.tricky, seed: "same" });
      expect(second).toEqual(first);
    }),
  );
});
