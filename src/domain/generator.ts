import { Effect, Random } from "effect";
import { densityKeepRatio, type PuzzleSpec } from "./difficulty.ts";
import { Puzzle } from "./puzzle.ts";
import { solveLogically, type SolveReport } from "./solver.ts";
import { randomSquare } from "./square.ts";

const maxAttempts = 10;

interface Candidate {
  readonly numbers: ReadonlyArray<number>;
  readonly colors: ReadonlyArray<number>;
  readonly givenNumbers: ReadonlyArray<boolean>;
  readonly givenColors: ReadonlyArray<boolean>;
  readonly report: SolveReport;
  readonly givens: number;
}

const knowledgeOf = (candidate: {
  readonly size: number;
  readonly numbers: ReadonlyArray<number>;
  readonly colors: ReadonlyArray<number>;
  readonly givenNumbers: ReadonlyArray<boolean>;
  readonly givenColors: ReadonlyArray<boolean>;
}) => ({
  size: candidate.size,
  numbers: candidate.numbers.map((value, cell) => (candidate.givenNumbers[cell] ? value : null)),
  colors: candidate.colors.map((value, cell) => (candidate.givenColors[cell] ? value : null)),
});

const attempt = Effect.fnUntraced(function* (spec: PuzzleSpec) {
  const square = yield* randomSquare(spec.size);
  const cellCount = spec.size * spec.size;
  const order = yield* Random.shuffle(Array.from({ length: cellCount * 2 }, (_, item) => item));
  const givenNumbers = Array.from({ length: cellCount }, () => true);
  const givenColors = Array.from({ length: cellCount }, () => true);
  const keep = Math.round(densityKeepRatio[spec.density] * cellCount * 2);
  let givens = cellCount * 2;
  for (const item of order) {
    if (givens <= keep) break;
    const layer = item < cellCount ? givenNumbers : givenColors;
    const cell = item % cellCount;
    layer[cell] = false;
    const report = solveLogically(
      knowledgeOf({
        size: spec.size,
        numbers: square.numbers,
        colors: square.colors,
        givenNumbers,
        givenColors,
      }),
      spec.level,
    );
    if (report.solved) givens--;
    else layer[cell] = true;
  }
  const report = solveLogically(
    knowledgeOf({
      size: spec.size,
      numbers: square.numbers,
      colors: square.colors,
      givenNumbers,
      givenColors,
    }),
    spec.level,
  );
  return {
    numbers: square.numbers,
    colors: square.colors,
    givenNumbers,
    givenColors,
    report,
    givens,
  } satisfies Candidate;
});

const isBetter = (candidate: Candidate, best: Candidate | undefined) =>
  best === undefined ||
  candidate.report.hardestLevel > best.report.hardestLevel ||
  (candidate.report.hardestLevel === best.report.hardestLevel &&
    candidate.report.levelCounts[candidate.report.hardestLevel] >
      best.report.levelCounts[best.report.hardestLevel]);

export const generatePuzzle = Effect.fn("generatePuzzle")(function* (
  spec: PuzzleSpec & { readonly seed: string },
) {
  const best = yield* Effect.gen(function* () {
    let best: Candidate | undefined;
    for (let index = 0; index < maxAttempts; index++) {
      const candidate = yield* attempt(spec);
      if (isBetter(candidate, best)) best = candidate;
      if (best && best.report.hardestLevel >= spec.level) break;
    }
    return best;
  }).pipe(Random.withSeed(`${spec.seed}:${spec.size}:${spec.level}:${spec.density}`));
  if (!best) return yield* Effect.die("Puzzle generation produced no candidate");
  return new Puzzle({
    size: spec.size,
    level: spec.level,
    density: spec.density,
    seed: spec.seed,
    solutionNumbers: best.numbers,
    solutionColors: best.colors,
    givenNumbers: best.givenNumbers,
    givenColors: best.givenColors,
    hardestLevel: best.report.hardestLevel,
    logicSteps: best.report.steps.length,
  });
});
