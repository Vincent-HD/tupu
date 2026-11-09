import { colorAt } from "../../domain/palette.ts";
import type { Board as BoardState } from "../../domain/game.ts";
import type { Puzzle } from "../../domain/puzzle.ts";
import { Tile, type TileMark } from "./tile.tsx";

export const Board = ({
  puzzle,
  board,
  marks,
  shapes,
  animate,
  popCell,
  onSelect,
}: {
  puzzle: Puzzle;
  board: BoardState;
  marks: ReadonlyMap<number, ReadonlySet<TileMark>>;
  shapes: boolean;
  animate: boolean;
  popCell?: { readonly cell: number; readonly id: number } | null;
  onSelect?: (cell: number) => void;
}) => {
  const { size } = puzzle;
  const empty: ReadonlySet<TileMark> = new Set();
  return (
    <div
      className="board grid w-full gap-[1.6cqw] select-none"
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, ["--size" as string]: size }}
      role="grid"
      aria-label={`${size} by ${size} board`}
    >
      {Array.from({ length: size * size }, (_, cell) => {
        const number = board.numbers[cell] ?? null;
        const color = board.colors[cell] ?? null;
        const row = Math.floor(cell / size) + 1;
        const column = (cell % size) + 1;
        const label = `Row ${row}, column ${column}: ${number === null ? "no number" : number + 1}, ${color === null ? "no color" : colorAt(color).name}`;
        return (
          <Tile
            key={cell}
            number={number}
            color={color}
            givenNumber={Boolean(puzzle.givenNumbers[cell])}
            givenColor={Boolean(puzzle.givenColors[cell])}
            marks={marks.get(cell) ?? empty}
            shapes={shapes}
            animate={animate}
            popKey={popCell?.cell === cell ? popCell.id : undefined}
            label={label}
            onSelect={onSelect ? () => onSelect(cell) : undefined}
          />
        );
      })}
    </div>
  );
};
