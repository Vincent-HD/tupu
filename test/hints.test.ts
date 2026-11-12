import { describe, expect, it } from "@effect/vitest";
import { Effect, Random } from "effect";
import { presets } from "../src/domain/difficulty.ts";
import { startingProgress, type Board, type Progress } from "../src/domain/game.ts";
import { generatePuzzle } from "../src/domain/generator.ts";
import { explain } from "../src/domain/hints.ts";
import { createSession, reduce, type Session } from "../src/domain/session.ts";
import {
  nextDeduction,
  type Deduction,
  type Knowledge,
  type Layer,
  type Technique,
} from "../src/domain/solver.ts";
import { randomSquare, type Square } from "../src/domain/square.ts";

const other = (layer: Layer): Layer => (layer === "number" ? "color" : "number");

const read = (board: Knowledge, layer: Layer, cell: number) =>
  (layer === "number" ? board.numbers : board.colors)[cell] ?? null;

const row = (size: number, cell: number) => Math.floor(cell / size);
const column = (size: number, cell: number) => cell % size;
const sameLine = (size: number, first: number, second: number) =>
  row(size, first) === row(size, second) || column(size, first) === column(size, second);

const cellsOf = (size: number, line: NonNullable<Deduction["line"]>) =>
  Array.from({ length: size }, (_, offset) =>
    line.kind === "row" ? line.index * size + offset : offset * size + line.index,
  );

// Whether the outlined tiles alone prove the hint, checked from the rules
// rather than from the solver's own bookkeeping.
const justified = (board: Knowledge, step: Deduction): boolean => {
  const { size } = board;
  // The hinted tile is on screen too, so what it already holds counts.
  const reasons = [...step.reasons, step.cell];
  const layer = step.layer;
  const values = Array.from({ length: size }, (_, value) => value);
  // `value` is kept out of `cell` by an outlined tile in its row or column.
  const seen = (cell: number, target: Layer, value: number) =>
    reasons.some(
      (reason) =>
        reason !== cell && sameLine(size, reason, cell) && read(board, target, reason) === value,
    );
  // `value` in `cell` would repeat an outlined pair, whatever partner the tile
  // can still take. Those partners are plain to see from its row and column.
  const paired = (cell: number, value: number) => {
    const known = read(board, other(layer), cell);
    const open = (partner: number) =>
      !Array.from({ length: size * size }, (_, peer) => peer).some(
        (peer) =>
          peer !== cell &&
          sameLine(size, peer, cell) &&
          read(board, other(layer), peer) === partner,
      );
    const partners = known === null ? values.filter(open) : [known];
    return partners.every((partner) =>
      reasons.some(
        (reason) =>
          read(board, layer, reason) === value && read(board, other(layer), reason) === partner,
      ),
    );
  };
  switch (step.technique) {
    case "last-in-line": {
      if (!step.line) return false;
      const rest = cellsOf(size, step.line).filter((cell) => cell !== step.cell);
      return (
        rest.every((cell) => reasons.includes(cell) && read(board, layer, cell) !== null) &&
        rest.every((cell) => read(board, layer, cell) !== step.value)
      );
    }
    case "hidden-single":
    case "pair-hidden-single": {
      if (!step.line) return false;
      const cells = cellsOf(size, step.line);
      if (cells.some((cell) => read(board, layer, cell) === step.value)) return false;
      return cells
        .filter((cell) => cell !== step.cell && read(board, layer, cell) === null)
        .every(
          (cell) =>
            seen(cell, layer, step.value) ||
            (step.technique === "pair-hidden-single" && paired(cell, step.value)),
        );
    }
    case "naked-single":
      return values
        .filter((value) => value !== step.value)
        .every((value) => seen(step.cell, layer, value));
    case "pair-exclusion":
      return values
        .filter((value) => value !== step.value)
        .every((value) => seen(step.cell, layer, value) || paired(step.cell, value));
    case "only-place-for-pair": {
      const number = layer === "number" ? step.value : (step.partner ?? -1);
      const color = layer === "color" ? step.value : (step.partner ?? -1);
      const ruledOut = (cell: number) => {
        const knownNumber = read(board, "number", cell);
        const knownColor = read(board, "color", cell);
        if (knownNumber !== null && knownNumber !== number) return true;
        if (knownColor !== null && knownColor !== color) return true;
        return (
          (knownNumber === null && seen(cell, "number", number)) ||
          (knownColor === null && seen(cell, "color", color))
        );
      };
      return Array.from({ length: size * size }, (_, cell) => cell)
        .filter((cell) => cell !== step.cell)
        .every(ruledOut);
    }
    case "deep-candidates":
      return true;
  }
};

const hide = Effect.fnUntraced(function* (square: Square, probability: number) {
  const numbers: Array<number | null> = [];
  const colors: Array<number | null> = [];
  for (let cell = 0; cell < square.size * square.size; cell++) {
    numbers.push((yield* Random.next) < probability ? null : (square.numbers[cell] ?? null));
    colors.push((yield* Random.next) < probability ? null : (square.colors[cell] ?? null));
  }
  return { size: square.size, numbers, colors } satisfies Knowledge;
});

const fill = (board: Knowledge, step: Deduction): Knowledge => {
  const write = (layer: Layer, values: ReadonlyArray<number | null>) =>
    values.map((current, cell) => {
      if (cell !== step.cell) return current;
      if (layer === step.layer) return step.value;
      return step.partner ?? current;
    });
  return {
    size: board.size,
    numbers: write("number", board.numbers),
    colors: write("color", board.colors),
  };
};

describe("hint explanations", () => {
  it.effect.each([4, 5, 7] as const)(
    "outline the tiles that prove each deduction (size %i)",
    (size) =>
      Effect.gen(function* () {
        const seen = new Set<Technique>();
        for (let round = 0; round < 120; round++) {
          let board: Knowledge = yield* hide(yield* randomSquare(size), 0.55 + (round % 4) * 0.1);
          for (let step = nextDeduction(board); step; step = nextDeduction(board)) {
            seen.add(step.technique);
            expect(step.reasons, step.technique).not.toContain(step.cell);
            expect(justified(board, step), `${step.technique} at ${step.cell}`).toBe(true);
            board = fill(board, step);
          }
        }
        expect([...seen]).toEqual(
          expect.arrayContaining(["last-in-line", "hidden-single", "pair-exclusion"]),
        );
      }).pipe(Random.withSeed(`explain-${size}`)),
  );

  it("names the line, the value and the tiles to look at", () => {
    const { body } = explain({
      cell: 16,
      layer: "number",
      value: 0,
      technique: "hidden-single",
      level: 1,
      line: { kind: "row", index: 3 },
      reasons: [5],
    });
    expect(body).toBe(
      "Row 4 still needs a 1. Every other tile in row 4 without a number already has a 1 in its column (outlined), so it can only go here.",
    );
  });

  it("does not claim the tile holds a partner it does not have", () => {
    const step = {
      cell: 0,
      layer: "number",
      value: 2,
      technique: "pair-exclusion",
      level: 2,
      reasons: [],
    } as const;
    expect(explain(step).body).not.toContain("This tile");
    expect(explain({ ...step, holding: 1 }).body).toContain("This tile is already yellow.");
    expect(explain({ ...step, layer: "color", holding: 1 }).body).toContain(
      "This tile already holds a 2.",
    );
  });
});

const play = (input: { readonly session: Session; readonly limit: number }) => {
  let session = input.session;
  const fills: Array<Deduction> = [];
  for (let turn = 0; turn < input.limit && !session.solved; turn++) {
    session = reduce(session, { type: "hint" });
    const hint = session.hint;
    if (hint?.kind !== "deduction" || !hint.deduction) return { session, fills, stuck: hint };
    fills.push(hint.deduction);
    session = reduce(session, { type: "apply-hint", at: turn });
  }
  return { session, fills, stuck: null };
};

const sessionFor = (puzzle: Parameters<typeof startingProgress>[0], progress?: Progress) =>
  createSession({
    puzzle,
    progress: progress ?? startingProgress(puzzle),
    moves: [],
    hints: 0,
    checks: 0,
  });

const valueOf = (board: Board, layer: Layer, cell: number) =>
  (layer === "number" ? board.numbers : board.colors)[cell];

describe("hints while playing", () => {
  it.effect.each(Object.entries(presets))("walk a %s puzzle to the end", ([name, spec]) =>
    Effect.gen(function* () {
      for (let index = 0; index < 4; index++) {
        const puzzle = yield* generatePuzzle({ ...spec, seed: `hints-${name}-${index}` });
        const result = play({ session: sessionFor(puzzle), limit: puzzle.size ** 2 * 2 });
        expect(result.stuck).toBeNull();
        expect(result.session.solved).toBe(true);
        expect(result.session.hints).toBe(result.fills.length);
        expect(result.session.moves.length).toBeGreaterThanOrEqual(result.fills.length);
        for (const step of result.fills) {
          const solution = step.layer === "number" ? puzzle.solutionNumbers : puzzle.solutionColors;
          expect(solution[step.cell]).toBe(step.value);
        }
      }
    }),
  );

  // Players fill tiles in any order, so a hint must work from any correct board.
  it.effect("never get stuck on a correct board", () =>
    Effect.gen(function* () {
      for (let index = 0; index < 40; index++) {
        const spec = Object.values(presets)[index % 5] ?? presets.easy;
        const puzzle = yield* generatePuzzle({ ...spec, seed: `partial-${index}` });
        const reveal = (yield* Random.next) * 0.8;
        const progress: Progress = {
          numbers: yield* Effect.forEach(puzzle.solutionNumbers, (value, cell) =>
            Effect.map(Random.next, (roll) =>
              puzzle.givenNumbers[cell] || roll < reveal ? value : null,
            ),
          ),
          colors: yield* Effect.forEach(puzzle.solutionColors, (value, cell) =>
            Effect.map(Random.next, (roll) =>
              puzzle.givenColors[cell] || roll < reveal ? value : null,
            ),
          ),
        };
        const result = play({ session: sessionFor(puzzle, progress), limit: puzzle.size ** 2 * 2 });
        expect(result.stuck).toBeNull();
        expect(result.session.solved).toBe(true);
      }
    }).pipe(Random.withSeed("partial")),
  );

  it.effect("point out mistakes before anything else, and clear them", () =>
    Effect.gen(function* () {
      const puzzle = yield* generatePuzzle({ ...presets.tricky, seed: "mistakes" });
      const open = puzzle.givenNumbers.findIndex((given) => !given);
      const wrong = ((puzzle.solutionNumbers[open] ?? 0) + 1) % puzzle.size;
      let session = reduce(sessionFor(puzzle), { type: "select", cell: open });
      if (session.selected !== open) session = reduce(session, { type: "select", cell: open });
      session = reduce(session, { type: "place", layer: "number", value: wrong, at: 1 });

      const hinted = reduce(session, { type: "hint" });
      expect(hinted.hint).toEqual({
        kind: "mistakes",
        mistakes: [{ cell: open, layer: "number" }],
      });
      expect(hinted.marked).toEqual([{ cell: open, layer: "number" }]);
      expect(reduce(hinted, { type: "hint" })).toBe(hinted);

      const cleared = reduce(hinted, { type: "apply-hint", at: 2 });
      expect(valueOf(cleared.board, "number", open)).toBeNull();
      expect(cleared.marked).toEqual([]);
      expect(reduce(cleared, { type: "hint" }).hint?.kind).toBe("deduction");
    }),
  );

  it.effect("fills both halves of a missing pair in one undoable step", () =>
    Effect.gen(function* () {
      for (let index = 0; index < 20; index++) {
        const puzzle = yield* generatePuzzle({ ...presets.hard, seed: `pair-${index}` });
        let session = sessionFor(puzzle);
        for (let turn = 0; turn < 100 && !session.solved; turn++) {
          session = reduce(session, { type: "hint" });
          const step = session.hint?.deduction;
          if (!step) break;
          const filled = reduce(session, { type: "apply-hint", at: turn });
          if (step.partner === undefined) {
            session = filled;
            continue;
          }
          const partnerLayer = other(step.layer);
          expect(valueOf(filled.board, step.layer, step.cell)).toBe(step.value);
          expect(valueOf(filled.board, partnerLayer, step.cell)).toBe(step.partner);
          const undone = reduce(filled, { type: "undo", at: turn });
          expect(undone.board).toEqual(session.board);
          return;
        }
      }
      expect.fail("no puzzle needed a pair hunt");
    }),
  );

  // The hint from the 2026-11-12 daily that looked suspicious: it is right,
  // and the 1 in column 1 is the tile it points at.
  it.effect("explains the 2026-11-12 daily hint with the tile that proves it", () =>
    Effect.gen(function* () {
      const puzzle = yield* generatePuzzle({ ...presets.tricky, seed: "daily:2026-11-12" });
      const progress = startingProgress(puzzle);
      const numbers = [...progress.numbers];
      const colors = [...progress.colors];
      for (const cell of [5, 6, 10]) numbers[cell] = puzzle.solutionNumbers[cell] ?? null;
      for (const cell of [0, 20]) colors[cell] = puzzle.solutionColors[cell] ?? null;
      const session = reduce(sessionFor(puzzle, { numbers, colors }), { type: "hint" });
      const step = session.hint?.deduction;
      expect(step).toMatchObject({
        cell: 16,
        layer: "number",
        value: 0,
        technique: "hidden-single",
        reasons: [5],
      });
      expect(puzzle.solutionNumbers[16]).toBe(0);
      expect(session.selected).toBe(16);
    }),
  );
});
