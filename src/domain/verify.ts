import { Schema } from "effect";
import { isGiven, isSolved, startingProgress, withValue, type Board, type Move } from "./game.ts";
import { PuzzleJson, type Puzzle } from "./puzzle.ts";

export type SolveRejection = "puzzle-mismatch" | "given-edited" | "bad-timeline" | "unsolved";

const timelineSlackMs = 1000;

const encodePuzzle = Schema.encodeSync(PuzzleJson);

export const replayBoard = (puzzle: Puzzle, moves: ReadonlyArray<Move>): Board => {
  const start = startingProgress(puzzle);
  return moves.reduce<Board>((board, move) => withValue(board, move), {
    size: puzzle.size,
    numbers: start.numbers,
    colors: start.colors,
  });
};

// Checks a solve reported by a client: the board must be the generator's own
// puzzle for that seed, and replaying the recorded moves must solve it within
// the reported time.
export const checkSolve = (input: {
  readonly puzzle: Puzzle;
  readonly canonical: Puzzle;
  readonly moves: ReadonlyArray<Move>;
  readonly elapsedMs: number;
}): SolveRejection | null => {
  if (encodePuzzle(input.puzzle) !== encodePuzzle(input.canonical)) return "puzzle-mismatch";
  if (input.moves.some((move) => isGiven(input.puzzle, move.cell, move.layer)))
    return "given-edited";
  let previous = 0;
  for (const move of input.moves) {
    if (move.at < previous || move.at > input.elapsedMs + timelineSlackMs) return "bad-timeline";
    previous = move.at;
  }
  return isSolved(replayBoard(input.puzzle, input.moves), input.puzzle) ? null : "unsolved";
};
