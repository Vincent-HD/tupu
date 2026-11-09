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
  gutters,
}: {
  puzzle: Puzzle;
  board: BoardState;
  marks: ReadonlyMap<number, ReadonlySet<TileMark>>;
  shapes: boolean;
  animate: boolean;
  popCell?: { readonly cell: number; readonly id: number } | null;
  onSelect?: (cell: number) => void;
  gutters?: { readonly rows: ReadonlySet<number>; readonly columns: ReadonlySet<number> } | null;
}) => {
  const { size } = puzzle;
  const empty: ReadonlySet<TileMark> = new Set();
  const gutterClass = (missing: boolean) =>
    `flex items-center justify-center rounded-md text-[0.65rem] font-extrabold transition-colors ${
      missing ? "bg-marker text-ink outline-2 outline-ink" : "text-ink-soft"
    }`;
  return (
    <div
      className="board grid w-full gap-[1.6cqw] select-none"
      style={{
        gridTemplateColumns: gutters
          ? `1.15rem repeat(${size}, minmax(0, 1fr))`
          : `repeat(${size}, minmax(0, 1fr))`,
        ["--size" as string]: size,
      }}
      role="grid"
      aria-label={`${size} by ${size} board`}
    >
      {gutters && <span aria-hidden="true" />}
      {gutters &&
        Array.from({ length: size }, (_, column) => (
          <span
            key={`column-${column}`}
            className={`${gutterClass(gutters.columns.has(column))} h-4`}
            aria-label={
              gutters.columns.has(column) ? `Column ${column + 1} still misses it` : undefined
            }
          >
            C{column + 1}
          </span>
        ))}
      {Array.from({ length: size * size }, (_, cell) => {
        const number = board.numbers[cell] ?? null;
        const color = board.colors[cell] ?? null;
        const row = Math.floor(cell / size) + 1;
        const column = (cell % size) + 1;
        const label = `Row ${row}, column ${column}: ${number === null ? "no number" : number + 1}, ${color === null ? "no color" : colorAt(color).name}`;
        const rowGutter =
          gutters && cell % size === 0 ? (
            <span
              key={`row-${row}`}
              className={gutterClass(gutters.rows.has(row - 1))}
              aria-label={gutters.rows.has(row - 1) ? `Row ${row} still misses it` : undefined}
            >
              L{row}
            </span>
          ) : null;
        return [
          rowGutter,
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
          />,
        ];
      })}
    </div>
  );
};
