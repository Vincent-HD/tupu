import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { presets } from "../src/domain/difficulty.ts";
import { startingProgress } from "../src/domain/game.ts";
import { generatePuzzle } from "../src/domain/generator.ts";
import { createSession, reduce } from "../src/domain/session.ts";

const newSession = Effect.map(generatePuzzle({ ...presets.easy, seed: "session" }), (puzzle) =>
  createSession({ puzzle, progress: startingProgress(puzzle), moves: [], hints: 0, checks: 0 }),
);

describe("session selection", () => {
  it.effect("selecting the selected tile again deselects it", () =>
    Effect.gen(function* () {
      const session = yield* newSession;
      const selected = reduce(session, { type: "select", cell: 5 });
      expect(selected.selected).toBe(5);
      expect(reduce(selected, { type: "select", cell: 5 }).selected).toBeNull();
      expect(reduce(selected, { type: "deselect" }).selected).toBeNull();
    }),
  );

  it.effect("ignores values and erasing when nothing is selected", () =>
    Effect.gen(function* () {
      const session = reduce(yield* newSession, { type: "deselect" });
      expect(reduce(session, { type: "place", layer: "number", value: 0, at: 0 })).toBe(session);
      expect(reduce(session, { type: "clear", at: 0 })).toBe(session);
    }),
  );

  it.effect("arrow keys pick the first tile again after a deselect", () =>
    Effect.gen(function* () {
      const session = reduce(yield* newSession, { type: "deselect" });
      expect(reduce(session, { type: "move", rows: 0, columns: 1 }).selected).toBe(0);
    }),
  );
});

describe("check results", () => {
  const withMistake = Effect.map(newSession, (session) => {
    const cell = session.puzzle.givenNumbers.findIndex((given) => !given);
    const wrong = ((session.puzzle.solutionNumbers[cell] ?? 0) + 1) % session.puzzle.size;
    const selected = { ...session, selected: cell };
    const placed = reduce(selected, { type: "place", layer: "number", value: wrong, at: 1 });
    return { checked: reduce(placed, { type: "check" }), cell };
  });

  it.effect("closing a failed check takes the crosses off the board", () =>
    Effect.gen(function* () {
      const { checked, cell } = yield* withMistake;
      expect(checked.marked).toEqual([{ cell, layer: "number" }]);
      const closed = reduce(checked, { type: "dismiss-hint" });
      expect(closed.marked).toEqual([]);
      expect(closed.checkResult).toBeNull();
      expect(closed.board).toEqual(checked.board);
    }),
  );

  it.effect("erasing a failed check clears the wrong values in one undoable step", () =>
    Effect.gen(function* () {
      const { checked, cell } = yield* withMistake;
      const erased = reduce(checked, { type: "erase-marked", at: 2 });
      expect(erased.board.numbers[cell]).toBeNull();
      expect(erased.marked).toEqual([]);
      expect(erased.checkResult).toBeNull();
      expect(reduce(erased, { type: "undo", at: 3 }).board).toEqual(checked.board);
    }),
  );
});
