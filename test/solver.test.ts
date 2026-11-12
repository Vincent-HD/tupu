import { describe, expect, it } from "@effect/vitest";
import { Effect, Random } from "effect";
import { presets } from "../src/domain/difficulty.ts";
import { generatePuzzle } from "../src/domain/generator.ts";
import { givenKnowledge } from "../src/domain/puzzle.ts";
import {
  nextDeduction,
  solveLogically,
  type Deduction,
  type Knowledge,
  type LogicLevel,
} from "../src/domain/solver.ts";
import { randomSquare, type BoardSize, type Square } from "../src/domain/square.ts";
import { completions } from "./support/brute-force.ts";

// Hides each value of the square with the given probability.
const hide = Effect.fnUntraced(function* (square: Square, probability: number) {
  const numbers: Array<number | null> = [];
  const colors: Array<number | null> = [];
  for (let cell = 0; cell < square.size * square.size; cell++) {
    numbers.push((yield* Random.next) < probability ? null : (square.numbers[cell] ?? null));
    colors.push((yield* Random.next) < probability ? null : (square.colors[cell] ?? null));
  }
  return { size: square.size, numbers, colors } satisfies Knowledge;
});

const valueIn =
  (completion: { numbers: ReadonlyArray<number>; colors: ReadonlyArray<number> }) =>
  (step: Pick<Deduction, "cell" | "layer">) =>
    (step.layer === "number" ? completion.numbers : completion.colors)[step.cell];

const levels: ReadonlyArray<LogicLevel> = [1, 2, 3, 4];

describe("logic solver", () => {
  // A deduction must hold in every way to finish the board, not only in the
  // square the clues came from.
  it.effect.each([3, 4, 5] as const)(
    "only deduces what every completion agrees on (%i×%i)",
    (size) =>
      Effect.gen(function* () {
        let checked = 0;
        for (let round = 0; round < 150; round++) {
          const square = yield* randomSquare(size);
          const knowledge = yield* hide(square, 0.45 + (round % 5) * 0.1);
          const all = completions({ knowledge, limit: 50 });
          if (all.length === 0 || all.length >= 50) continue;
          for (const level of levels) {
            const step = nextDeduction(knowledge, level);
            if (!step) continue;
            checked++;
            expect(step.level).toBeLessThanOrEqual(level);
            for (const completion of all) {
              expect(valueIn(completion)(step), step.technique).toBe(step.value);
              if (step.partner !== undefined)
                expect(
                  valueIn(completion)({
                    cell: step.cell,
                    layer: step.layer === "number" ? "color" : "number",
                  }),
                ).toBe(step.partner);
            }
          }
        }
        expect(checked).toBeGreaterThan(100);
      }).pipe(Random.withSeed(`sound-${size}`)),
  );

  it.effect.each([4, 5, 7, 8, 9] as const)(
    "every step of a full solve matches the square (%i×%i)",
    (size: BoardSize) =>
      Effect.gen(function* () {
        for (let round = 0; round < 30; round++) {
          const square = yield* randomSquare(size);
          const report = solveLogically(yield* hide(square, 0.5 + (round % 4) * 0.1));
          for (const step of report.steps) {
            expect(valueIn(square)(step), step.technique).toBe(step.value);
          }
          report.numbers.forEach((value, cell) => {
            if (value >= 0) expect(value).toBe(square.numbers[cell]);
          });
          report.colors.forEach((value, cell) => {
            if (value >= 0) expect(value).toBe(square.colors[cell]);
          });
        }
      }).pipe(Random.withSeed(`steps-${size}`)),
  );
});

describe("generated puzzles", () => {
  // The player is told a value is wrong when it differs from the stored
  // solution, so a second valid answer would be marked as a mistake.
  it.effect.each(Object.entries(presets).filter(([, spec]) => spec.size <= 5))(
    "have exactly one solution (%s)",
    ([name, spec]) =>
      Effect.gen(function* () {
        for (let index = 0; index < 12; index++) {
          const puzzle = yield* generatePuzzle({ ...spec, seed: `${name}-${index}` });
          const all = completions({ knowledge: givenKnowledge(puzzle), limit: 2 });
          expect(all).toEqual([{ numbers: puzzle.solutionNumbers, colors: puzzle.solutionColors }]);
        }
      }),
  );

  it.effect.each(Object.entries(presets))(
    "solve within their level from the clues (%s)",
    ([name, spec]) =>
      Effect.gen(function* () {
        for (let index = 0; index < 6; index++) {
          const puzzle = yield* generatePuzzle({ ...spec, seed: `${name}-level-${index}` });
          const report = solveLogically(givenKnowledge(puzzle), puzzle.level);
          expect(report.solved).toBe(true);
          expect(report.hardestLevel).toBe(puzzle.hardestLevel);
          expect(report.hardestLevel).toBeLessThanOrEqual(puzzle.level);
        }
      }),
  );
});
