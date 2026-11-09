import {
  isFilled,
  isGiven,
  isSolved,
  valueAt,
  withValue,
  wrongValues,
  type Board,
  type Change,
  type Move,
  type Progress,
  type WrongValue,
} from "./game.ts";
import type { Puzzle } from "./puzzle.ts";
import { nextDeduction, type Deduction, type Layer } from "./solver.ts";

export interface HintState {
  readonly kind: "deduction" | "mistakes" | "stuck";
  readonly deduction?: Deduction;
  readonly mistakes?: ReadonlyArray<WrongValue>;
}

export interface Session {
  readonly puzzle: Puzzle;
  readonly board: Board;
  readonly selected: number | null;
  readonly undoStack: ReadonlyArray<ReadonlyArray<Change>>;
  readonly redoStack: ReadonlyArray<ReadonlyArray<Change>>;
  readonly moves: ReadonlyArray<Move>;
  readonly hints: number;
  readonly checks: number;
  readonly marked: ReadonlyArray<WrongValue>;
  readonly hint: HintState | null;
  readonly checkResult: "pass" | "fail" | null;
  readonly solved: boolean;
  readonly lastChange: { readonly cell: number; readonly layer: Layer; readonly id: number } | null;
}

export type Action =
  | { readonly type: "select"; readonly cell: number }
  | { readonly type: "deselect" }
  | { readonly type: "move"; readonly rows: number; readonly columns: number }
  | { readonly type: "place"; readonly layer: Layer; readonly value: number; readonly at: number }
  | { readonly type: "clear"; readonly at: number }
  | { readonly type: "undo"; readonly at: number }
  | { readonly type: "redo"; readonly at: number }
  | { readonly type: "check" }
  | { readonly type: "hint" }
  | { readonly type: "apply-hint"; readonly at: number }
  | { readonly type: "dismiss-hint" }
  | { readonly type: "restart"; readonly at: number };

export const createSession = (input: {
  readonly puzzle: Puzzle;
  readonly progress: Progress;
  readonly moves: ReadonlyArray<Move>;
  readonly hints: number;
  readonly checks: number;
}): Session => {
  const board = {
    size: input.puzzle.size,
    numbers: input.progress.numbers,
    colors: input.progress.colors,
  };
  const firstOpen = board.numbers.findIndex(
    (value, cell) => value === null || board.colors[cell] === null,
  );
  return {
    puzzle: input.puzzle,
    board,
    selected: Math.max(0, firstOpen),
    undoStack: [],
    redoStack: [],
    moves: input.moves,
    hints: input.hints,
    checks: input.checks,
    marked: [],
    hint: null,
    checkResult: null,
    solved: isFilled(board) && isSolved(board, input.puzzle),
    lastChange: null,
  };
};

const applyChanges = (
  session: Session,
  changes: ReadonlyArray<Change>,
  at: number,
  direction: "after" | "before",
) => {
  const board = changes.reduce(
    (current, change) =>
      withValue(current, { cell: change.cell, layer: change.layer, value: change[direction] }),
    session.board,
  );
  const moves = [
    ...session.moves,
    ...changes.map((change) => ({
      at: Math.round(at),
      cell: change.cell,
      layer: change.layer,
      value: change[direction],
    })),
  ];
  const touched = new Set(changes.map((change) => `${change.cell}:${change.layer}`));
  const last = changes.at(-1);
  return {
    ...session,
    board,
    moves,
    marked: session.marked.filter((mark) => !touched.has(`${mark.cell}:${mark.layer}`)),
    checkResult: null,
    solved: isFilled(board) && isSolved(board, session.puzzle),
    lastChange: last
      ? { cell: last.cell, layer: last.layer, id: moves.length }
      : session.lastChange,
  };
};

const commit = (session: Session, changes: ReadonlyArray<Change>, at: number): Session => {
  const effective = changes.filter((change) => change.before !== change.after);
  if (effective.length === 0) return session;
  return {
    ...applyChanges(session, effective, at, "after"),
    undoStack: [...session.undoStack, effective],
    redoStack: [],
    hint: null,
  };
};

const editable = (session: Session, cell: number, layer: Layer) =>
  !isGiven(session.puzzle, cell, layer);

export const reduce = (session: Session, action: Action): Session => {
  if (
    session.solved &&
    action.type !== "select" &&
    action.type !== "deselect" &&
    action.type !== "move"
  )
    return session;
  const { size } = session.puzzle;
  switch (action.type) {
    case "select":
      return { ...session, selected: session.selected === action.cell ? null : action.cell };
    case "deselect":
      return session.selected === null ? session : { ...session, selected: null };
    case "move": {
      if (session.selected === null) return { ...session, selected: 0 };
      const row = (Math.floor(session.selected / size) + action.rows + size) % size;
      const column = ((session.selected % size) + action.columns + size) % size;
      return { ...session, selected: row * size + column };
    }
    case "place": {
      const cell = session.selected;
      if (cell === null || !editable(session, cell, action.layer)) return session;
      const before = valueAt(session.board, cell, action.layer);
      const after = before === action.value ? null : action.value;
      return commit(session, [{ cell, layer: action.layer, before, after }], action.at);
    }
    case "clear": {
      const cell = session.selected;
      if (cell === null) return session;
      const changes = (["number", "color"] as const)
        .filter((layer) => editable(session, cell, layer))
        .map((layer) => ({
          cell,
          layer,
          before: valueAt(session.board, cell, layer),
          after: null,
        }));
      return commit(session, changes, action.at);
    }
    case "undo": {
      const changes = session.undoStack.at(-1);
      if (!changes) return session;
      return {
        ...applyChanges(session, [...changes].reverse(), action.at, "before"),
        undoStack: session.undoStack.slice(0, -1),
        redoStack: [...session.redoStack, changes],
        selected: changes[0]?.cell ?? session.selected,
        hint: null,
      };
    }
    case "redo": {
      const changes = session.redoStack.at(-1);
      if (!changes) return session;
      return {
        ...applyChanges(session, changes, action.at, "after"),
        undoStack: [...session.undoStack, changes],
        redoStack: session.redoStack.slice(0, -1),
        selected: changes[0]?.cell ?? session.selected,
        hint: null,
      };
    }
    case "check": {
      const marked = wrongValues(session.board, session.puzzle);
      return {
        ...session,
        checks: session.checks + 1,
        marked,
        checkResult: marked.length ? "fail" : "pass",
        hint: null,
      };
    }
    case "hint": {
      if (session.hint) return session;
      const mistakes = wrongValues(session.board, session.puzzle);
      const hints = session.hints + 1;
      if (mistakes.length)
        return { ...session, hints, hint: { kind: "mistakes", mistakes }, marked: mistakes };
      const deduction = nextDeduction(session.board);
      if (!deduction) return { ...session, hints, hint: { kind: "stuck" } };
      return {
        ...session,
        hints,
        hint: { kind: "deduction", deduction },
        selected: deduction.cell,
      };
    }
    case "apply-hint": {
      const hint = session.hint;
      if (!hint) return session;
      if (hint.kind === "mistakes")
        return {
          ...commit(
            session,
            (hint.mistakes ?? []).map((mistake) => ({
              cell: mistake.cell,
              layer: mistake.layer,
              before: valueAt(session.board, mistake.cell, mistake.layer),
              after: null,
            })),
            action.at,
          ),
          marked: [],
        };
      const deduction = hint.deduction;
      if (!deduction) return { ...session, hint: null };
      const changes: Array<Change> = [
        {
          cell: deduction.cell,
          layer: deduction.layer,
          before: valueAt(session.board, deduction.cell, deduction.layer),
          after: deduction.value,
        },
      ];
      if (deduction.partner !== undefined) {
        const layer: Layer = deduction.layer === "number" ? "color" : "number";
        changes.push({
          cell: deduction.cell,
          layer,
          before: valueAt(session.board, deduction.cell, layer),
          after: deduction.partner,
        });
      }
      return commit(session, changes, action.at);
    }
    case "dismiss-hint":
      return { ...session, hint: null, checkResult: null };
    case "restart": {
      const changes = (["number", "color"] as const).flatMap((layer) =>
        Array.from({ length: size * size }, (_, cell) => cell)
          .filter((cell) => editable(session, cell, layer))
          .map((cell) => ({
            cell,
            layer,
            before: valueAt(session.board, cell, layer),
            after: null,
          })),
      );
      return { ...commit(session, changes, action.at), marked: [] };
    }
  }
};

export const lineComplete = (board: Board, cell: number) => {
  const { size } = board;
  const row = Math.floor(cell / size);
  const column = cell % size;
  const lines = [
    Array.from({ length: size }, (_, offset) => row * size + offset),
    Array.from({ length: size }, (_, offset) => offset * size + column),
  ];
  return lines.some((line) => {
    const numbers = new Set(line.map((index) => board.numbers[index]));
    const colors = new Set(line.map((index) => board.colors[index]));
    return !numbers.has(null) && !colors.has(null) && numbers.size === size && colors.size === size;
  });
};
