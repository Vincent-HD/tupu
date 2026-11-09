import { describe, expect, it } from "@effect/vitest";
import { lensView, placedCount } from "../src/domain/lens.ts";

const _ = null;
const board = {
  size: 3,
  numbers: [0, 1, _, _, 2, 0, 2, _, _],
  colors: [0, _, 2, 1, _, _, _, 0, _],
};

describe("lens", () => {
  it("is inactive without a focus", () => {
    expect(lensView(board, { number: null, color: null }).active).toBe(false);
  });

  it("highlights a number, where it can still go and the lines that miss it", () => {
    const view = lensView(board, { number: 1, color: null });
    expect([...view.matches]).toEqual([1]);
    expect([...view.possible].sort((a, b) => a - b)).toEqual([3, 8]);
    expect([...view.missingRows].sort((a, b) => a - b)).toEqual([1, 2]);
    expect([...view.missingColumns].sort((a, b) => a - b)).toEqual([0, 2]);
    expect(placedCount(board, "number", 1)).toBe(1);
  });

  it("narrows to a pair when a number and a color are both chosen", () => {
    const view = lensView(board, { number: 0, color: 0 });
    expect([...view.matches]).toEqual([0]);
    expect(view.missingRows.size).toBe(0);
  });

  it("counts colors", () => {
    expect(placedCount(board, "color", 0)).toBe(2);
  });
});
