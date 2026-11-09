import { Effect, Random } from "effect";

export const supportedSizes = [3, 4, 5, 7, 8, 9] as const;
export type BoardSize = (typeof supportedSizes)[number];

export interface Square {
  readonly size: number;
  readonly numbers: ReadonlyArray<number>;
  readonly colors: ReadonlyArray<number>;
}

const fieldPolynomials: Readonly<Record<number, number>> = { 4: 0b111, 8: 0b1011 };

const multiplyInField = ({ left, right, size }: { left: number; right: number; size: number }) => {
  const polynomial = fieldPolynomials[size] ?? 0;
  let product = 0;
  let a = left;
  let b = right;
  while (b > 0) {
    if (b & 1) product ^= a;
    b >>= 1;
    a <<= 1;
    if (a & size) a ^= polynomial;
  }
  return product;
};

const baseSquare = (size: BoardSize): Square => {
  const cells = Array.from({ length: size * size }, (_, index) => ({
    row: Math.floor(index / size),
    column: index % size,
  }));
  if (size % 2 === 1)
    return {
      size,
      numbers: cells.map((cell) => (cell.row + cell.column) % size),
      colors: cells.map((cell) => (2 * cell.row + cell.column) % size),
    };
  return {
    size,
    numbers: cells.map((cell) => cell.row ^ cell.column),
    colors: cells.map((cell) => multiplyInField({ left: 2, right: cell.row, size }) ^ cell.column),
  };
};

const permutation = (size: number) =>
  Random.shuffle(Array.from({ length: size }, (_, index) => index));

export const randomSquare = Effect.fn("randomSquare")(function* (size: BoardSize) {
  const base = baseSquare(size);
  const rows = yield* permutation(size);
  const columns = yield* permutation(size);
  const numberSymbols = yield* permutation(size);
  const colorSymbols = yield* permutation(size);
  const transpose = yield* Random.nextBoolean;
  const swapLayers = yield* Random.nextBoolean;
  const at = (layer: ReadonlyArray<number>, row: number, column: number) => {
    const sourceRow = rows[row] ?? 0;
    const sourceColumn = columns[column] ?? 0;
    return transpose
      ? (layer[sourceColumn * size + sourceRow] ?? 0)
      : (layer[sourceRow * size + sourceColumn] ?? 0);
  };
  const numbers: Array<number> = [];
  const colors: Array<number> = [];
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const number = numberSymbols[at(swapLayers ? base.colors : base.numbers, row, column)] ?? 0;
      const color = colorSymbols[at(swapLayers ? base.numbers : base.colors, row, column)] ?? 0;
      numbers.push(number);
      colors.push(color);
    }
  }
  return { size, numbers, colors } satisfies Square;
});

export const isEulerSquare = (square: Square) => {
  const { size } = square;
  const pairs = new Set<number>();
  for (let line = 0; line < size; line++) {
    const rowNumbers = new Set<number>();
    const rowColors = new Set<number>();
    const columnNumbers = new Set<number>();
    const columnColors = new Set<number>();
    for (let offset = 0; offset < size; offset++) {
      rowNumbers.add(square.numbers[line * size + offset] ?? -1);
      rowColors.add(square.colors[line * size + offset] ?? -1);
      columnNumbers.add(square.numbers[offset * size + line] ?? -1);
      columnColors.add(square.colors[offset * size + line] ?? -1);
    }
    if (
      [rowNumbers, rowColors, columnNumbers, columnColors].some(
        (set) => set.size !== size || set.has(-1),
      )
    )
      return false;
  }
  for (let cell = 0; cell < size * size; cell++)
    pairs.add((square.numbers[cell] ?? 0) * size + (square.colors[cell] ?? 0));
  return pairs.size === size * size;
};
