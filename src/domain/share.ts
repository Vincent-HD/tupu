import type { Board } from "./game.ts";
import { colorAt } from "./palette.ts";

export const shareGrid = (board: Board) =>
  Array.from({ length: board.size }, (_, row) =>
    board.colors
      .slice(row * board.size, (row + 1) * board.size)
      .map((color) => (color === null ? "⬜" : colorAt(color).emoji))
      .join(""),
  );
