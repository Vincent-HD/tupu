import { useAtomValue } from "@effect/atom-react";
import { useEffect, useMemo, useState } from "react";
import { startingProgress, withValue, type Board as BoardState } from "../../domain/game.ts";
import { formatDuration } from "../../domain/score.ts";
import type { GameRecord } from "../../services/games.ts";
import { gameAtom } from "../atoms.ts";
import { Board } from "../components/board.tsx";
import type { TileMark } from "../components/tile.tsx";
import { Card, IconButton, Loaded, Segmented, SectionTitle } from "../components/ui.tsx";
import { useSettings } from "../hooks/use-settings.ts";
import { useSound } from "../hooks/use-sound.ts";
import { navigate } from "../router.ts";
import { modeTitle } from "./play-page.tsx";

export const ReplayPage = ({ id }: { id: string }) => (
  <div className="mx-auto w-full max-w-4xl">
    <div className="mb-6 flex items-center gap-3">
      <IconButton
        icon="back"
        label="Back to the puzzle"
        onClick={() => navigate({ page: "play", id })}
      />
      <SectionTitle kicker="Rewind">Replay</SectionTitle>
    </div>
    <Loaded result={useAtomValue(gameAtom(id))} label="Rewinding">
      {(game) => <Replay game={game} />}
    </Loaded>
  </div>
);

const Replay = ({ game }: { game: GameRecord }) => {
  const settings = useSettings();
  const play = useSound();
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(4);
  const moves = game.moves;
  const boards = useMemo(() => {
    const start = startingProgress(game.puzzle);
    const frames: Array<BoardState> = [
      { size: game.puzzle.size, numbers: start.numbers, colors: start.colors },
    ];
    for (const move of moves) {
      const previous = frames.at(-1);
      if (previous) frames.push(withValue(previous, move));
    }
    return frames;
  }, [game, moves]);

  useEffect(() => {
    if (!playing || position >= moves.length) return;
    const current = moves[position - 1]?.at ?? 0;
    const next = moves[position]?.at ?? current;
    const delay = Math.min(1200, Math.max(60, (next - current) / speed));
    const timer = window.setTimeout(() => {
      const move = moves[position];
      if (move?.value === null) play("erase");
      else if (move) play(move.layer, move.value);
      setPosition((value) => value + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playing, position, moves, speed, play]);

  const board = boards[position] ?? boards[0];
  const lastMove = moves[position - 1];
  const marks = new Map<number, ReadonlySet<TileMark>>();
  if (lastMove) marks.set(lastMove.cell, new Set<TileMark>(["selected"]));
  if (!board) return null;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_280px] md:items-start">
      <Card className="dotted mx-auto w-full max-w-[540px] p-[3.5%]">
        <Board
          puzzle={game.puzzle}
          board={board}
          marks={marks}
          shapes={settings.colorblindShapes}
          animate={settings.animations}
          popCell={lastMove ? { cell: lastMove.cell, id: position } : null}
        />
      </Card>
      <Card className="flex flex-col gap-4 p-5">
        <div>
          <p className="font-display text-xl font-extrabold">{modeTitle(game)}</p>
          <p className="text-sm text-ink-soft">
            {moves.length} moves · solved in {formatDuration(game.elapsedMs)}
          </p>
        </div>
        <p className="font-display text-4xl font-extrabold tabular-nums">
          {formatDuration(lastMove?.at ?? 0)}
        </p>
        <input
          type="range"
          min={0}
          max={moves.length}
          value={position}
          aria-label="Replay position"
          onChange={(event) => {
            setPlaying(false);
            setPosition(Number(event.target.value));
          }}
          className="accent-[var(--ink)]"
        />
        <div className="flex items-center gap-2">
          <IconButton
            icon={playing && position < moves.length ? "pause" : "play"}
            label={playing ? "Pause" : "Play"}
            tone="marker"
            onClick={() => {
              if (position >= moves.length) setPosition(0);
              setPlaying(!(playing && position < moves.length));
            }}
          />
          <IconButton icon="refresh" label="From the start" onClick={() => setPosition(0)} />
          <span className="ml-auto text-sm font-bold tabular-nums">
            {position}/{moves.length}
          </span>
        </div>
        <Segmented
          label="Speed"
          value={speed}
          onChange={setSpeed}
          options={[1, 2, 4, 8, 16].map((value) => ({ value, label: `${value}×` }))}
        />
      </Card>
    </div>
  );
};
