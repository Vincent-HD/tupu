import { Tile, type TileMark } from "./tile.tsx";

export interface MiniTile {
  readonly number: number | null;
  readonly color: number | null;
  readonly givenNumber?: boolean;
  readonly givenColor?: boolean;
  readonly marks?: ReadonlyArray<TileMark>;
}

export const MiniBoard = ({
  tiles,
  columns,
  className = "max-w-64",
}: {
  tiles: ReadonlyArray<MiniTile>;
  columns: number;
  className?: string;
}) => (
  <div
    className={`board grid w-full gap-[2cqw] ${className}`}
    style={{
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      ["--size" as string]: columns,
    }}
  >
    {tiles.map((tile, index) => (
      <Tile
        key={index}
        number={tile.number}
        color={tile.color}
        givenNumber={tile.givenNumber ?? false}
        givenColor={tile.givenColor ?? false}
        marks={new Set(tile.marks ?? [])}
        shapes={false}
        animate={false}
        label={`Example tile ${index + 1}`}
      />
    ))}
  </div>
);
