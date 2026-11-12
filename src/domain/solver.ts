export type Layer = "number" | "color";

export type LogicLevel = 1 | 2 | 3 | 4;

export type Technique =
  | "last-in-line"
  | "hidden-single"
  | "naked-single"
  | "pair-exclusion"
  | "pair-hidden-single"
  | "only-place-for-pair"
  | "deep-candidates";

export const techniqueLevel: Readonly<Record<Technique, LogicLevel>> = {
  "last-in-line": 1,
  "hidden-single": 1,
  "naked-single": 1,
  "pair-exclusion": 2,
  "pair-hidden-single": 2,
  "only-place-for-pair": 3,
  "deep-candidates": 4,
};

export interface Line {
  readonly kind: "row" | "column";
  readonly index: number;
}

export interface Deduction {
  readonly cell: number;
  readonly layer: Layer;
  readonly value: number;
  readonly technique: Technique;
  readonly level: LogicLevel;
  readonly line?: Line;
  // Filled in along with `value`: the other half of the pair.
  readonly partner?: number;
  // What the tile already held in the other layer when the deduction ran.
  readonly holding?: number;
  readonly reasons: ReadonlyArray<number>;
}

export interface Knowledge {
  readonly size: number;
  readonly numbers: ReadonlyArray<number | null>;
  readonly colors: ReadonlyArray<number | null>;
}

interface State {
  readonly size: number;
  readonly values: Record<Layer, Int8Array>;
}

const layers: ReadonlyArray<Layer> = ["number", "color"];
const otherLayer = (layer: Layer): Layer => (layer === "number" ? "color" : "number");

const bitCount = (mask: number) => {
  let count = 0;
  let rest = mask;
  while (rest) {
    rest &= rest - 1;
    count++;
  }
  return count;
};

const singleBit = (mask: number) => 31 - Math.clz32(mask);

const fromKnowledge = (knowledge: Knowledge): State => ({
  size: knowledge.size,
  values: {
    number: Int8Array.from(knowledge.numbers, (value) => value ?? -1),
    color: Int8Array.from(knowledge.colors, (value) => value ?? -1),
  },
});

const lineCells = (size: number, line: Line) =>
  Array.from({ length: size }, (_, offset) =>
    line.kind === "row" ? line.index * size + offset : offset * size + line.index,
  );

const allLines = (size: number): ReadonlyArray<Line> => [
  ...Array.from({ length: size }, (_, index) => ({ kind: "row" as const, index })),
  ...Array.from({ length: size }, (_, index) => ({ kind: "column" as const, index })),
];

const crossLine = (size: number, line: Line, cell: number): Line =>
  line.kind === "row"
    ? { kind: "column", index: cell % size }
    : { kind: "row", index: Math.floor(cell / size) };

const pairIndex = ({
  size,
  layer,
  value,
  partner,
}: {
  size: number;
  layer: Layer;
  value: number;
  partner: number;
}) => (layer === "number" ? value * size + partner : partner * size + value);

class Analysis {
  readonly size: number;
  readonly full: number;
  readonly state: State;
  readonly rowMask: Record<Layer, Int32Array>;
  readonly columnMask: Record<Layer, Int32Array>;
  readonly pairCell: Int16Array;

  constructor(state: State) {
    const { size } = state;
    this.size = size;
    this.full = (1 << size) - 1;
    this.state = state;
    this.rowMask = { number: new Int32Array(size), color: new Int32Array(size) };
    this.columnMask = { number: new Int32Array(size), color: new Int32Array(size) };
    this.pairCell = new Int16Array(size * size).fill(-1);
    for (let cell = 0; cell < size * size; cell++) {
      const row = Math.floor(cell / size);
      const column = cell % size;
      for (const layer of layers) {
        const value = state.values[layer][cell] ?? -1;
        if (value < 0) continue;
        this.rowMask[layer][row] = (this.rowMask[layer][row] ?? 0) | (1 << value);
        this.columnMask[layer][column] = (this.columnMask[layer][column] ?? 0) | (1 << value);
      }
      const number = state.values.number[cell] ?? -1;
      const color = state.values.color[cell] ?? -1;
      if (number >= 0 && color >= 0) this.pairCell[number * size + color] = cell;
    }
  }

  value(layer: Layer, cell: number) {
    return this.state.values[layer][cell] ?? -1;
  }

  lineMask(layer: Layer, line: Line) {
    return (line.kind === "row" ? this.rowMask : this.columnMask)[layer][line.index] ?? 0;
  }

  allowed(layer: Layer, cell: number) {
    const row = Math.floor(cell / this.size);
    const column = cell % this.size;
    return this.full & ~(this.rowMask[layer][row] ?? 0) & ~(this.columnMask[layer][column] ?? 0);
  }

  isPlaced(layer: Layer, value: number, partner: number) {
    return (this.pairCell[pairIndex({ size: this.size, layer, value, partner })] ?? -1) >= 0;
  }

  pairAllowed(layer: Layer, cell: number, value: number) {
    const other = otherLayer(layer);
    const known = this.value(other, cell);
    if (known >= 0) return !this.isPlaced(layer, value, known);
    const partners = this.allowed(other, cell);
    for (let partner = 0; partner < this.size; partner++)
      if (partners & (1 << partner) && !this.isPlaced(layer, value, partner)) return true;
    return false;
  }

  peersWithValue(layer: Layer, cell: number) {
    const row = Math.floor(cell / this.size);
    const column = cell % this.size;
    return [
      ...lineCells(this.size, { kind: "row", index: row }),
      ...lineCells(this.size, { kind: "column", index: column }),
    ].filter((peer) => peer !== cell && this.value(layer, peer) >= 0);
  }

  blockerFor(layer: Layer, line: Line, value: number) {
    return lineCells(this.size, line).find((cell) => this.value(layer, cell) === value);
  }

  // The tiles holding the pairs that keep `value` out of `cell`: the pair with
  // the tile's own partner when it has one, else one per partner it could take.
  pairBlockers(layer: Layer, cell: number, value: number) {
    const known = this.value(otherLayer(layer), cell);
    const partners = known >= 0 ? 1 << known : this.allowed(otherLayer(layer), cell);
    const blockers: Array<number> = [];
    for (let partner = 0; partner < this.size; partner++) {
      if (!(partners & (1 << partner))) continue;
      const holder = this.pairCell[pairIndex({ size: this.size, layer, value, partner })] ?? -1;
      if (holder >= 0) blockers.push(holder);
    }
    return blockers;
  }
}

type Finder = (analysis: Analysis) => Deduction | undefined;

const deduction = (fields: Omit<Deduction, "level">): Deduction => ({
  ...fields,
  level: techniqueLevel[fields.technique],
});

const lastInLine: Finder = (analysis) => {
  for (const layer of layers)
    for (const line of allLines(analysis.size)) {
      const cells = lineCells(analysis.size, line);
      const open = cells.filter((cell) => analysis.value(layer, cell) < 0);
      const [cell] = open;
      if (open.length !== 1 || cell === undefined) continue;
      const missing = analysis.full & ~analysis.lineMask(layer, line);
      if (bitCount(missing) !== 1) continue;
      return deduction({
        cell,
        layer,
        value: singleBit(missing),
        technique: "last-in-line",
        line,
        reasons: cells.filter((other) => other !== cell),
      });
    }
  return undefined;
};

const hiddenSingleWith =
  (technique: "hidden-single" | "pair-hidden-single"): Finder =>
  (analysis) => {
    for (const layer of layers)
      for (const line of allLines(analysis.size)) {
        const cells = lineCells(analysis.size, line);
        const missing = analysis.full & ~analysis.lineMask(layer, line);
        for (let value = 0; value < analysis.size; value++) {
          if (!(missing & (1 << value))) continue;
          const open = cells.filter((cell) => analysis.value(layer, cell) < 0);
          const eligible = open.filter((cell) => {
            if (!(analysis.allowed(layer, cell) & (1 << value))) return false;
            return technique === "hidden-single" || analysis.pairAllowed(layer, cell, value);
          });
          const [cell] = eligible;
          if (eligible.length !== 1 || cell === undefined) continue;
          const reasons = open
            .filter((other) => other !== cell)
            .flatMap((other) => {
              const blocker = analysis.blockerFor(
                layer,
                crossLine(analysis.size, line, other),
                value,
              );
              return blocker === undefined ? analysis.pairBlockers(layer, other, value) : [blocker];
            });
          return deduction({ cell, layer, value, technique, line, reasons });
        }
      }
    return undefined;
  };

const nakedSingle: Finder = (analysis) => {
  for (const layer of layers)
    for (let cell = 0; cell < analysis.size * analysis.size; cell++) {
      if (analysis.value(layer, cell) >= 0) continue;
      const allowed = analysis.allowed(layer, cell);
      if (bitCount(allowed) !== 1) continue;
      return deduction({
        cell,
        layer,
        value: singleBit(allowed),
        technique: "naked-single",
        reasons: analysis.peersWithValue(layer, cell),
      });
    }
  return undefined;
};

const pairExclusion: Finder = (analysis) => {
  for (const layer of layers)
    for (let cell = 0; cell < analysis.size * analysis.size; cell++) {
      if (analysis.value(layer, cell) >= 0) continue;
      const allowed = analysis.allowed(layer, cell);
      let remaining = 0;
      for (let value = 0; value < analysis.size; value++)
        if (allowed & (1 << value) && analysis.pairAllowed(layer, cell, value))
          remaining |= 1 << value;
      if (bitCount(remaining) !== 1) continue;
      const holding = analysis.value(otherLayer(layer), cell);
      const pairReasons: Array<number> = [];
      for (let value = 0; value < analysis.size; value++)
        if (allowed & (1 << value) && !(remaining & (1 << value)))
          pairReasons.push(...analysis.pairBlockers(layer, cell, value));
      return deduction({
        cell,
        layer,
        value: singleBit(remaining),
        ...(holding >= 0 ? { holding } : {}),
        technique: "pair-exclusion",
        reasons: [...analysis.peersWithValue(layer, cell), ...pairReasons],
      });
    }
  return undefined;
};

const onlyPlaceForPair: Finder = (analysis) => {
  const { size } = analysis;
  for (let number = 0; number < size; number++)
    for (let color = 0; color < size; color++) {
      if (analysis.isPlaced("number", number, color)) continue;
      const fits = (layer: Layer, cell: number, value: number) => {
        const known = analysis.value(layer, cell);
        return known >= 0 ? known === value : Boolean(analysis.allowed(layer, cell) & (1 << value));
      };
      const candidates: Array<number> = [];
      for (let cell = 0; cell < size * size && candidates.length < 2; cell++)
        if (fits("number", cell, number) && fits("color", cell, color)) candidates.push(cell);
      const [cell] = candidates;
      if (candidates.length !== 1 || cell === undefined) continue;
      const numberKnown = analysis.value("number", cell) >= 0;
      return deduction({
        cell,
        layer: numberKnown ? "color" : "number",
        value: numberKnown ? color : number,
        partner: numberKnown ? number : color,
        technique: "only-place-for-pair",
        // Every other tile holds another number or color, or shares a line
        // with this number or this color.
        reasons: Array.from({ length: size * size }, (_, other) => other).filter(
          (other) =>
            other !== cell &&
            (analysis.value("number", other) === number ||
              analysis.value("color", other) === color),
        ),
      });
    }
  return undefined;
};

const deepCandidates: Finder = (analysis) => {
  const { size } = analysis;
  const cellCount = size * size;
  const candidates = Array.from({ length: cellCount }, (_, cell) => {
    const set = new Uint8Array(cellCount);
    for (let number = 0; number < size; number++) {
      const knownNumber = analysis.value("number", cell);
      if (
        knownNumber >= 0
          ? knownNumber !== number
          : !(analysis.allowed("number", cell) & (1 << number))
      )
        continue;
      for (let color = 0; color < size; color++) {
        const knownColor = analysis.value("color", cell);
        if (
          knownColor >= 0 ? knownColor !== color : !(analysis.allowed("color", cell) & (1 << color))
        )
          continue;
        const owner = analysis.pairCell[number * size + color] ?? -1;
        if (owner >= 0 && owner !== cell) continue;
        set[number * size + color] = 1;
      }
    }
    return set;
  });
  const projection = (layer: Layer, cell: number) => {
    let mask = 0;
    const set = candidates[cell];
    if (!set) return 0;
    for (let pair = 0; pair < cellCount; pair++)
      if (set[pair]) mask |= 1 << (layer === "number" ? Math.floor(pair / size) : pair % size);
    return mask;
  };
  const layerOf = (layer: Layer, pair: number) =>
    layer === "number" ? Math.floor(pair / size) : pair % size;
  const removeWhere = (cell: number, predicate: (pair: number) => boolean) => {
    const set = candidates[cell];
    if (!set) return false;
    let changed = false;
    for (let pair = 0; pair < cellCount; pair++)
      if (set[pair] && predicate(pair)) {
        set[pair] = 0;
        changed = true;
      }
    return changed;
  };
  const lines = allLines(size);
  let changed = true;
  let rounds = 0;
  while (changed && rounds < 64) {
    changed = false;
    rounds++;
    for (const layer of layers) {
      for (let cell = 0; cell < cellCount; cell++) {
        const mask = projection(layer, cell);
        if (bitCount(mask) !== 1) continue;
        const value = singleBit(mask);
        const row = Math.floor(cell / size);
        const column = cell % size;
        for (const peer of [
          ...lineCells(size, { kind: "row", index: row }),
          ...lineCells(size, { kind: "column", index: column }),
        ])
          if (peer !== cell && removeWhere(peer, (pair) => layerOf(layer, pair) === value))
            changed = true;
      }
      for (const line of lines) {
        const cells = lineCells(size, line);
        for (let value = 0; value < size; value++) {
          const holders = cells.filter((cell) => projection(layer, cell) & (1 << value));
          const [holder] = holders;
          if (holders.length === 1 && holder !== undefined)
            if (removeWhere(holder, (pair) => layerOf(layer, pair) !== value)) changed = true;
        }
        const masks = cells.map((cell) => projection(layer, cell));
        for (let first = 0; first < size; first++)
          for (let second = first + 1; second < size; second++) {
            const union = (masks[first] ?? 0) | (masks[second] ?? 0);
            if (
              bitCount(union) === 2 &&
              bitCount(masks[first] ?? 0) > 0 &&
              bitCount(masks[second] ?? 0) > 0
            )
              cells.forEach((cell, offset) => {
                if (offset !== first && offset !== second)
                  if (removeWhere(cell, (pair) => Boolean(union & (1 << layerOf(layer, pair)))))
                    changed = true;
              });
            for (let third = second + 1; third < size; third++) {
              const triple = union | (masks[third] ?? 0);
              if (bitCount(triple) !== 3) continue;
              cells.forEach((cell, offset) => {
                if (offset !== first && offset !== second && offset !== third)
                  if (removeWhere(cell, (pair) => Boolean(triple & (1 << layerOf(layer, pair)))))
                    changed = true;
              });
            }
          }
      }
    }
    for (let pair = 0; pair < cellCount; pair++) {
      const holders: Array<number> = [];
      for (let cell = 0; cell < cellCount; cell++) if (candidates[cell]?.[pair]) holders.push(cell);
      const [holder] = holders;
      if (
        holders.length === 1 &&
        holder !== undefined &&
        removeWhere(holder, (other) => other !== pair)
      )
        changed = true;
    }
    for (let cell = 0; cell < cellCount; cell++) {
      const set = candidates[cell];
      if (!set) continue;
      let count = 0;
      let only = -1;
      for (let pair = 0; pair < cellCount; pair++)
        if (set[pair]) {
          count++;
          only = pair;
        }
      if (count !== 1) continue;
      for (let peer = 0; peer < cellCount; peer++)
        if (peer !== cell && removeWhere(peer, (pair) => pair === only)) changed = true;
    }
  }
  for (const layer of layers)
    for (let cell = 0; cell < cellCount; cell++) {
      if (analysis.value(layer, cell) >= 0) continue;
      const mask = projection(layer, cell);
      if (bitCount(mask) !== 1) continue;
      return deduction({
        cell,
        layer,
        value: singleBit(mask),
        technique: "deep-candidates",
        reasons: analysis.peersWithValue(layer, cell),
      });
    }
  return undefined;
};

const finders: ReadonlyArray<readonly [LogicLevel, Finder]> = [
  [1, lastInLine],
  [1, hiddenSingleWith("hidden-single")],
  [1, nakedSingle],
  [2, pairExclusion],
  [2, hiddenSingleWith("pair-hidden-single")],
  [3, onlyPlaceForPair],
  [4, deepCandidates],
];

const findNext = (state: State, maxLevel: LogicLevel) => {
  const analysis = new Analysis(state);
  for (const [level, finder] of finders) {
    if (level > maxLevel) break;
    const found = finder(analysis);
    if (found) return found;
  }
  return undefined;
};

export const nextDeduction = (knowledge: Knowledge, maxLevel: LogicLevel = 4) =>
  findNext(fromKnowledge(knowledge), maxLevel);

const isComplete = (state: State) =>
  state.values.number.every((value) => value >= 0) &&
  state.values.color.every((value) => value >= 0);

export interface SolveReport {
  readonly solved: boolean;
  readonly steps: ReadonlyArray<Deduction>;
  readonly hardestLevel: LogicLevel;
  readonly levelCounts: Readonly<Record<LogicLevel, number>>;
  readonly numbers: ReadonlyArray<number>;
  readonly colors: ReadonlyArray<number>;
}

export const solveLogically = (knowledge: Knowledge, maxLevel: LogicLevel = 4): SolveReport => {
  const state = fromKnowledge(knowledge);
  const steps: Array<Deduction> = [];
  const levelCounts: Record<LogicLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let hardestLevel: LogicLevel = 1;
  while (!isComplete(state)) {
    const next = findNext(state, maxLevel);
    if (!next) break;
    state.values[next.layer][next.cell] = next.value;
    if (next.partner !== undefined) state.values[otherLayer(next.layer)][next.cell] = next.partner;
    steps.push(next);
    levelCounts[next.level]++;
    if (next.level > hardestLevel) hardestLevel = next.level;
  }
  return {
    solved: isComplete(state),
    steps,
    hardestLevel,
    levelCounts,
    numbers: Array.from(state.values.number),
    colors: Array.from(state.values.color),
  };
};

export interface Conflict {
  readonly cells: ReadonlyArray<number>;
  readonly rule: "number-line" | "color-line" | "pair";
}

export const findConflicts = (knowledge: Knowledge): ReadonlyArray<Conflict> => {
  const { size } = knowledge;
  const conflicts: Array<Conflict> = [];
  for (const line of allLines(size)) {
    const cells = lineCells(size, line);
    for (const layer of layers) {
      const values = layer === "number" ? knowledge.numbers : knowledge.colors;
      const byValue = new Map<number, Array<number>>();
      for (const cell of cells) {
        const value = values[cell];
        if (value === null || value === undefined) continue;
        byValue.set(value, [...(byValue.get(value) ?? []), cell]);
      }
      for (const group of byValue.values())
        if (group.length > 1)
          conflicts.push({ cells: group, rule: layer === "number" ? "number-line" : "color-line" });
    }
  }
  const byPair = new Map<number, Array<number>>();
  for (let cell = 0; cell < size * size; cell++) {
    const number = knowledge.numbers[cell];
    const color = knowledge.colors[cell];
    if (number === null || number === undefined || color === null || color === undefined) continue;
    const pair = number * size + color;
    byPair.set(pair, [...(byPair.get(pair) ?? []), cell]);
  }
  for (const group of byPair.values())
    if (group.length > 1) conflicts.push({ cells: group, rule: "pair" });
  return conflicts;
};
