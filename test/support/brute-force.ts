import type { Knowledge } from "../../src/domain/solver.ts";

export interface Completion {
  readonly numbers: ReadonlyArray<number>;
  readonly colors: ReadonlyArray<number>;
}

// Exhaustive search over every way to finish the board, independent of the
// logic solver: it only knows the three rules. Stops once `limit` completions
// are found, so "is this unique" costs at most two.
export const completions = (input: {
  readonly knowledge: Knowledge;
  readonly limit: number;
}): ReadonlyArray<Completion> => {
  const { size } = input.knowledge;
  const cellCount = size * size;
  const numbers = input.knowledge.numbers.map((value) => value ?? -1);
  const colors = input.knowledge.colors.map((value) => value ?? -1);
  const found: Array<Completion> = [];

  const fits = (cell: number, number: number, color: number) => {
    const row = Math.floor(cell / size);
    const column = cell % size;
    for (let other = 0; other < cellCount; other++) {
      if (other === cell) continue;
      const sameLine = Math.floor(other / size) === row || other % size === column;
      if (sameLine && (numbers[other] === number || colors[other] === color)) return false;
      if (numbers[other] === number && colors[other] === color) return false;
    }
    return true;
  };

  const options = (cell: number) => {
    const result: Array<readonly [number, number]> = [];
    const knownNumber = numbers[cell] ?? -1;
    const knownColor = colors[cell] ?? -1;
    for (let number = 0; number < size; number++) {
      if (knownNumber >= 0 && knownNumber !== number) continue;
      for (let color = 0; color < size; color++) {
        if (knownColor >= 0 && knownColor !== color) continue;
        if (fits(cell, number, color)) result.push([number, color]);
      }
    }
    return result;
  };

  const open = Array.from({ length: cellCount }, (_, cell) => cell);
  const filled = new Uint8Array(cellCount);

  const search = (): void => {
    if (found.length >= input.limit) return;
    let best = -1;
    let bestOptions: ReadonlyArray<readonly [number, number]> = [];
    for (const cell of open) {
      if (filled[cell]) continue;
      const cellOptions = options(cell);
      if (best < 0 || cellOptions.length < bestOptions.length) {
        best = cell;
        bestOptions = cellOptions;
        if (cellOptions.length <= 1) break;
      }
    }
    if (best < 0) {
      found.push({ numbers: [...numbers], colors: [...colors] });
      return;
    }
    const savedNumber = numbers[best] ?? -1;
    const savedColor = colors[best] ?? -1;
    filled[best] = 1;
    for (const [number, color] of bestOptions) {
      numbers[best] = number;
      colors[best] = color;
      search();
      if (found.length >= input.limit) break;
    }
    numbers[best] = savedNumber;
    colors[best] = savedColor;
    filled[best] = 0;
  };

  // A given value might already break a rule; then nothing completes it.
  for (let cell = 0; cell < cellCount; cell++) {
    const number = numbers[cell] ?? -1;
    const color = colors[cell] ?? -1;
    const row = Math.floor(cell / size);
    const column = cell % size;
    for (let other = cell + 1; other < cellCount; other++) {
      const sameLine = Math.floor(other / size) === row || other % size === column;
      if (sameLine && number >= 0 && numbers[other] === number) return [];
      if (sameLine && color >= 0 && colors[other] === color) return [];
      if (number >= 0 && color >= 0 && numbers[other] === number && colors[other] === color)
        return [];
    }
  }
  search();
  return found;
};
