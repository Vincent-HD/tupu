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
