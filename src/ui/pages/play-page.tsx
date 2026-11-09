import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { difficultyLabels, levelLabels } from "../../domain/difficulty.ts";
import { isGiven } from "../../domain/game.ts";
import { explain } from "../../domain/hints.ts";
import { colorAt, tileColors } from "../../domain/palette.ts";
import { checkPenaltyMs, formatDuration, hintPenaltyMs, isPerfect } from "../../domain/score.ts";
import {
  createSession,
  lineComplete,
  reduce,
  type Action,
  type Session,
} from "../../domain/session.ts";
import { findConflicts, type Layer } from "../../domain/solver.ts";
import type { CompletionResult, GameRecord } from "../../services/games.ts";
import { completeGameAtom, gameAtom, saveGameAtom, startGameAtom } from "../atoms.ts";
import { Board } from "../components/board.tsx";
import { Confetti } from "../components/confetti.tsx";
import { Icon } from "../components/icons.tsx";
import { Keypad } from "../components/keypad.tsx";
import { PairMatrix } from "../components/pair-matrix.tsx";
import type { TileMark } from "../components/tile.tsx";
import { Button, Card, Chip, IconButton, Loaded, Modal } from "../components/ui.tsx";
import { useSettings } from "../hooks/use-settings.ts";
import { useSound } from "../hooks/use-sound.ts";
import { usePageVisible, useStopwatch } from "../hooks/use-stopwatch.ts";
import { useWakeLock } from "../hooks/use-wake-lock.ts";
import { navigate } from "../router.ts";
import { detach } from "../detach.ts";

export const PlayPage = ({ id }: { id: string }) => {
  const result = useAtomValue(gameAtom(id));
  return (
    <Loaded result={result} label="Preparing the puzzle">
      {(game) => <GameView key={game.id} game={game} />}
    </Loaded>
  );
};

export const modeTitle = (game: Pick<GameRecord, "mode" | "dailyDate">) =>
  game.mode === "daily" ? "Daily puzzle" : game.mode === "quick" ? "Quick play" : "Custom puzzle";

const shareText = (game: GameRecord, session: Session, elapsedMs: number) => {
  const { size } = game.puzzle;
  const rows = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => {
      const cell = row * size + column;
      const given =
        Number(isGiven(game.puzzle, cell, "number")) + Number(isGiven(game.puzzle, cell, "color"));
      return given === 2 ? "⬛" : given === 1 ? "🟨" : "🟩";
    }).join(""),
  );
  const label = game.difficulty
    ? difficultyLabels[game.difficulty]
    : `${size}×${size} ${levelLabels[game.puzzle.level]}`;
  return [
    `Tupu · ${modeTitle(game)}${game.dailyDate ? ` ${game.dailyDate}` : ""} · ${label}`,
    `⏱ ${formatDuration(elapsedMs)}${isPerfect(session) ? " · ✨ clean solve" : ` · 💡${session.hints} 🔎${session.checks}`}`,
    ...rows,
    game.mode === "custom" ? `seed ${game.puzzle.seed}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

const GameView = ({ game }: { game: GameRecord }) => {
  const settings = useSettings();
  const play = useSound();
  const save = useAtomSet(saveGameAtom);
  const complete = useAtomSet(completeGameAtom, { mode: "promise" });
  const startGame = useAtomSet(startGameAtom, { mode: "promise" });
  const [session, dispatch] = useReducer(reduce, game, (record) => createSession(record));
  const [paused, setPaused] = useState(false);
  const [focusPair, setFocusPair] = useState<{
    readonly number: number;
    readonly color: number;
  } | null>(null);
  const [completion, setCompletion] = useState<CompletionResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [copied, setCopied] = useState(false);
  const visible = usePageVisible();
  const alreadySolved = game.status === "solved";
  const running = !paused && visible && !session.solved && !alreadySolved;
  const elapsed = useStopwatch({ initialMs: game.elapsedMs, running });
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useWakeLock(settings.keepAwake && running);

  const snapshot = useCallback(
    (current: Session) => ({
      id: game.id,
      progress: { numbers: current.board.numbers, colors: current.board.colors },
      moves: current.moves,
      elapsedMs: elapsed(),
      hints: current.hints,
      checks: current.checks,
    }),
    [elapsed, game.id],
  );

  useEffect(() => {
    if (alreadySolved || session.solved) return;
    save(snapshot(session));
  }, [session.moves, session.hints, session.checks, alreadySolved, save, snapshot, session]);

  useEffect(() => {
    if (alreadySolved || session.solved) return;
    const flush = () => save(snapshot(sessionRef.current));
    const interval = window.setInterval(flush, 15_000);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", flush);
    };
  }, [alreadySolved, session.solved, save, snapshot]);

  useEffect(() => {
    if (!session.solved || alreadySolved) return;
    play("win");
    complete(snapshot(session)).then(
      (result) => {
        setCompletion(result);
        setShowResult(true);
      },
      () => setShowResult(true),
    );
    // oxlint-disable-next-line react/exhaustive-deps
  }, [session.solved]);

  const act = useCallback(
    (action: Action) => {
      const current = sessionRef.current;
      const next = reduce(current, action);
      dispatch(action);
      if (next === current) {
        if (action.type === "place" || action.type === "clear") play("error");
        return;
      }
      switch (action.type) {
        case "select":
        case "move":
          play("select");
          return;
        case "place": {
          const placed = next.lastChange;
          const cleared =
            placed &&
            (placed.layer === "number" ? next.board.numbers : next.board.colors)[placed.cell] ===
              null;
          if (cleared) play("erase");
          else play(action.layer, action.value);
          const conflicts = findConflicts(next.board).filter((conflict) =>
            conflict.cells.includes(current.selected),
          );
          if (!cleared && settings.showConflicts && conflicts.length > 0)
            window.setTimeout(() => play("error"), 120);
          else if (!cleared && lineComplete(next.board, current.selected) && !next.solved)
            window.setTimeout(() => play("line"), 140);
          return;
        }
        case "clear":
          play("erase");
          return;
        case "undo":
          play("undo");
          return;
        case "redo":
          play("redo");
          return;
        case "check":
          play(next.checkResult === "pass" ? "check-pass" : "check-fail");
          return;
        case "hint":
          play("hint");
          return;
        case "apply-hint":
          play("number", next.lastChange?.cell ?? 0);
          return;
        case "restart":
          play("page");
          return;
        case "dismiss-hint":
          play("tap");
          return;
      }
    },
    [play, settings.showConflicts],
  );

  const now = () => elapsed();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      if (paused && event.key !== "p") return;
      const size = game.puzzle.size;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        act({ type: event.shiftKey ? "redo" : "undo", at: now() });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "y") {
        event.preventDefault();
        act({ type: "redo", at: now() });
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const moves: Record<string, readonly [number, number]> = {
        arrowup: [-1, 0],
        arrowdown: [1, 0],
        arrowleft: [0, -1],
        arrowright: [0, 1],
      };
      const move = moves[key];
      if (move) {
        event.preventDefault();
        act({ type: "move", rows: move[0], columns: move[1] });
        return;
      }
      const digit = Number(key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= size) {
        act({ type: "place", layer: "number", value: digit - 1, at: now() });
        return;
      }
      const colorIndex = tileColors.slice(0, size).findIndex((color) => color.key === key);
      if (colorIndex >= 0) {
        act({ type: "place", layer: "color", value: colorIndex, at: now() });
        return;
      }
      if (key === "backspace" || key === "delete" || key === "0") {
        event.preventDefault();
        act({ type: "clear", at: now() });
        return;
      }
      if (key === "h") act({ type: "hint" });
      if (key === "escape") act({ type: "dismiss-hint" });
      if (key === "p") setPaused((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const marks = useMemo(() => {
    const map = new Map<number, Set<TileMark>>();
    const add = (cell: number, mark: TileMark) => {
      const set = map.get(cell) ?? new Set<TileMark>();
      set.add(mark);
      map.set(cell, set);
    };
    const { size } = game.puzzle;
    const { board, selected } = session;
    if (settings.highlightRelated && !session.solved) {
      const row = Math.floor(selected / size);
      const column = selected % size;
      const number = board.numbers[selected];
      const color = board.colors[selected];
      for (let cell = 0; cell < size * size; cell++) {
        if (cell === selected) continue;
        const sameLine = Math.floor(cell / size) === row || cell % size === column;
        const sameValue =
          (number !== null && board.numbers[cell] === number) ||
          (color !== null && board.colors[cell] === color);
        if (sameLine || sameValue) add(cell, "related");
      }
    }
    if (focusPair)
      for (let cell = 0; cell < size * size; cell++) {
        if (board.numbers[cell] === focusPair.number && board.colors[cell] === focusPair.color)
          add(cell, "pair");
        else if (board.numbers[cell] === focusPair.number || board.colors[cell] === focusPair.color)
          add(cell, "related");
      }
    if (settings.showConflicts)
      for (const conflict of findConflicts(board))
        for (const cell of conflict.cells) add(cell, "conflict");
    for (const mark of session.marked) add(mark.cell, "wrong");
    if (session.hint?.deduction) {
      add(session.hint.deduction.cell, "hint");
      for (const reason of session.hint.deduction.reasons) add(reason, "reason");
    }
    if (!session.solved) add(selected, "selected");
    return map;
  }, [session, settings.highlightRelated, settings.showConflicts, focusPair, game.puzzle]);

  const lockedNumber = isGiven(game.puzzle, session.selected, "number");
  const lockedColor = isGiven(game.puzzle, session.selected, "color");
  const place = (layer: Layer, value: number) => act({ type: "place", layer, value, at: now() });

  const playNext = async () => {
    if (game.mode === "daily") return navigate({ page: "home" });
    const id = await startGame(
      game.mode === "quick" && game.difficulty
        ? { mode: "quick", difficulty: game.difficulty }
        : {
            mode: "custom",
            spec: {
              size: game.puzzle.size,
              level: game.puzzle.level,
              density: game.puzzle.density,
            },
          },
    );
    navigate({ page: "play", id });
  };

  const share = async () => {
    const text = shareText(game, session, completion ? elapsed() : elapsed());
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      await navigator.clipboard.writeText(text).then(
        () => setCopied(true),
        () => setCopied(false),
      );
    }
  };

  const finalElapsed = alreadySolved ? game.elapsedMs : elapsed();
  const hintView = session.hint;
  const explanation = hintView?.deduction ? explain(hintView.deduction) : null;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-3 flex items-center gap-2 sm:mb-5 sm:gap-3">
        <IconButton icon="back" label="Back home" onClick={() => navigate({ page: "home" })} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl leading-tight font-extrabold sm:text-3xl">
            {modeTitle(game)}
          </h1>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {game.difficulty && <Chip tone="marker">{difficultyLabels[game.difficulty]}</Chip>}
            <Chip>
              {game.puzzle.size}×{game.puzzle.size}
            </Chip>
            <span className="hidden sm:contents">
              <Chip tone="lilac">{levelLabels[game.puzzle.level]}</Chip>
            </span>
            {game.dailyDate && (
              <span className="hidden sm:contents">
                <Chip tone="sky">{game.dailyDate}</Chip>
              </span>
            )}
          </div>
        </div>
        <Timer read={elapsed} running={running} frozenMs={alreadySolved ? game.elapsedMs : null} />
        {!session.solved && !alreadySolved && (
          <IconButton
            icon={paused ? "play" : "pause"}
            label={paused ? "Resume (P)" : "Pause (P)"}
            tone={paused ? "marker" : "paper"}
            onClick={() => setPaused((value) => !value)}
          />
        )}
      </header>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="mx-auto w-full" style={{ maxWidth: game.puzzle.size >= 7 ? 640 : 540 }}>
          <div className="relative">
            <Card className="dotted p-[3%] sm:p-[3.5%]">
              <Board
                puzzle={game.puzzle}
                board={session.board}
                marks={marks}
                shapes={settings.colorblindShapes}
                animate={settings.animations}
                popCell={session.lastChange}
                onSelect={(cell) => act({ type: "select", cell })}
              />
            </Card>
            {paused && (
              <button
                type="button"
                onClick={() => setPaused(false)}
                className="ruled absolute inset-0 z-20 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-[2.5px] border-ink bg-card"
              >
                <span className="font-display text-4xl font-extrabold">Paused</span>
                <span className="font-bold text-ink-soft">Tap to keep going</span>
              </button>
            )}
            {(session.solved || alreadySolved) && !showResult && (
              <button
                type="button"
                onClick={() => setShowResult(true)}
                className="absolute -top-4 -right-2 z-20 animate-stamp cursor-pointer rounded-xl border-[3px] border-ink bg-marker px-4 py-1.5 font-display text-2xl font-extrabold shadow-hard"
              >
                SOLVED
              </button>
            )}
          </div>

          {hintView && (
            <Card tone="marker" className="mt-4 animate-float-in p-4 sm:mt-5">
              <div className="flex items-start gap-3">
                <Icon name="bulb" className="mt-1 shrink-0 text-2xl" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-extrabold">
                    {hintView.kind === "mistakes"
                      ? "Something on the board is off"
                      : hintView.kind === "stuck"
                        ? "No clean deduction found"
                        : explanation?.title}
                  </p>
                  <p className="mt-1 leading-snug">
                    {hintView.kind === "mistakes"
                      ? `${hintView.mistakes?.length ?? 0} value${hintView.mistakes?.length === 1 ? "" : "s"} don't match the solution. They are crossed out.`
                      : hintView.kind === "stuck"
                        ? "Try checking the board for mistakes."
                        : explanation?.body}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {hintView.kind !== "stuck" && (
                      <Button
                        size="sm"
                        tone="ink"
                        onClick={() => act({ type: "apply-hint", at: now() })}
                      >
                        {hintView.kind === "mistakes" ? "Clear them" : "Fill it in"}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => act({ type: "dismiss-hint" })}>
                      Got it
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}
          {session.checkResult && !hintView && (
            <Card
              tone={session.checkResult === "pass" ? "mint" : "rose"}
              className="mt-4 flex animate-float-in items-center gap-3 p-3 sm:mt-5 sm:p-4"
            >
              <Icon name={session.checkResult === "pass" ? "check" : "x"} className="text-2xl" />
              <p className="flex-1 font-bold">
                {session.checkResult === "pass"
                  ? "Clean so far. Everything placed matches the solution."
                  : `${session.marked.length} value${session.marked.length === 1 ? "" : "s"} need another look.`}
              </p>
              <IconButton icon="x" label="Dismiss" onClick={() => act({ type: "dismiss-hint" })} />
            </Card>
          )}
        </div>

        <aside className="flex flex-col gap-4 sm:gap-5">
          {!session.solved && !alreadySolved && (
            <Card className="p-3 sm:p-4">
              <SelectedSummary session={session} />
              <Keypad
                size={game.puzzle.size}
                number={session.board.numbers[session.selected] ?? null}
                color={session.board.colors[session.selected] ?? null}
                lockedNumber={lockedNumber}
                lockedColor={lockedColor}
                shapes={settings.colorblindShapes}
                onNumber={(value) => place("number", value)}
                onColor={(value) => place("color", value)}
              />
            </Card>
          )}
          {!session.solved && !alreadySolved && (
            <div className="grid grid-cols-6 gap-2">
              <IconButton
                icon="undo"
                label="Undo (Ctrl+Z)"
                className="w-full"
                disabled={session.undoStack.length === 0}
                onClick={() => act({ type: "undo", at: now() })}
              />
              <IconButton
                icon="redo"
                label="Redo (Ctrl+Shift+Z)"
                className="w-full"
                disabled={session.redoStack.length === 0}
                onClick={() => act({ type: "redo", at: now() })}
              />
              <IconButton
                icon="eraser"
                label="Erase tile (Backspace)"
                className="w-full"
                disabled={lockedNumber && lockedColor}
                onClick={() => act({ type: "clear", at: now() })}
              />
              <IconButton
                icon="check"
                label="Check for mistakes"
                tone="mint"
                className="w-full"
                onClick={() => act({ type: "check" })}
              />
              <IconButton
                icon="bulb"
                label="Hint (H)"
                tone="marker"
                className="w-full"
                onClick={() => act({ type: "hint" })}
              />
              <IconButton
                icon="refresh"
                label="Restart"
                className="w-full"
                onClick={() => setConfirmRestart(true)}
              />
            </div>
          )}
          {(session.solved || alreadySolved) && (
            <Card tone="mint" className="p-5">
              <p className="font-display text-2xl font-extrabold">Board complete.</p>
              <p className="mt-1">Solved in {formatDuration(finalElapsed)}.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button icon="film" onClick={() => navigate({ page: "replay", id: game.id })}>
                  Replay
                </Button>
                <Button icon="share" onClick={detach(share)}>
                  {copied ? "Copied!" : "Share"}
                </Button>
                <Button tone="ink" icon="play" onClick={detach(playNext)}>
                  {game.mode === "daily" ? "Home" : "Next"}
                </Button>
              </div>
            </Card>
          )}
          {settings.pairMatrix && (
            <Card className="p-4">
              <PairMatrix board={session.board} focus={focusPair} onFocus={setFocusPair} />
            </Card>
          )}
          <p className="hidden text-sm text-ink-soft lg:block">
            <Icon name="keyboard" className="mr-1 inline" /> Arrows move · 1–{game.puzzle.size}{" "}
            numbers ·{" "}
            {tileColors
              .slice(0, game.puzzle.size)
              .map((color) => color.key.toUpperCase())
              .join(" ")}{" "}
            colors · ⌫ erase · H hint · P pause
          </p>
        </aside>
      </div>

      {showResult && settings.animations && <Confetti />}
      <Modal open={showResult} onClose={() => setShowResult(false)} label="Puzzle solved">
        <Card className="ruled overflow-hidden p-6">
          <span className="tape -top-2 left-1/2 -translate-x-1/2" />
          <p className="mt-2 inline-block animate-stamp rounded-lg border-[3px] border-danger px-3 py-1 font-display text-3xl font-extrabold text-danger">
            {isPerfect(session) ? "CLEAN SOLVE" : "SOLVED"}
          </p>
          <p className="mt-4 font-display text-6xl font-extrabold tabular-nums">
            {formatDuration(finalElapsed)}
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat
              label="Hints"
              value={`${session.hints}`}
              detail={session.hints ? `+${formatDuration(session.hints * hintPenaltyMs)}` : "—"}
            />
            <Stat
              label="Checks"
              value={`${session.checks}`}
              detail={session.checks ? `+${formatDuration(session.checks * checkPenaltyMs)}` : "—"}
            />
            <Stat
              label="Score"
              value={completion ? formatDuration(completion.scoreMs) : "…"}
              detail="lower is better"
            />
          </dl>
          {completion && (
            <p className="mt-4 font-bold">
              #{completion.rank} of {completion.entries} on this board
              {completion.personalBest ? " · new personal best!" : ""}
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button tone="ink" icon="play" onClick={detach(playNext)}>
              {game.mode === "daily" ? "Back home" : "Next puzzle"}
            </Button>
            <Button icon="share" onClick={detach(share)}>
              {copied ? "Copied!" : "Share"}
            </Button>
            <Button icon="film" onClick={() => navigate({ page: "replay", id: game.id })}>
              Replay
            </Button>
            <Button icon="trophy" onClick={() => navigate({ page: "leaderboard" })}>
              Board
            </Button>
          </div>
        </Card>
      </Modal>
      <Modal open={confirmRestart} onClose={() => setConfirmRestart(false)} label="Restart puzzle">
        <Card className="p-6">
          <p className="font-display text-2xl font-extrabold">Start this sheet over?</p>
          <p className="mt-2">
            Everything you placed is erased. The clock keeps running, and you can still undo it.
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              tone="danger"
              icon="refresh"
              onClick={() => {
                act({ type: "restart", at: now() });
                setConfirmRestart(false);
              }}
            >
              Restart
            </Button>
            <Button onClick={() => setConfirmRestart(false)}>Keep going</Button>
          </div>
        </Card>
      </Modal>
    </div>
  );
};

const Stat = ({ label, value, detail }: { label: string; value: string; detail: string }) => (
  <div className="rounded-xl border-2 border-ink bg-paper p-2">
    <dt className="text-xs font-bold tracking-wide text-ink-soft uppercase">{label}</dt>
    <dd className="font-display text-2xl font-extrabold tabular-nums">{value}</dd>
    <dd className="text-xs text-ink-soft">{detail}</dd>
  </div>
);

const SelectedSummary = ({ session }: { session: Session }) => {
  const { size } = session.puzzle;
  const number = session.board.numbers[session.selected];
  const color = session.board.colors[session.selected];
  return (
    <p className="mb-3 hidden text-sm font-bold text-ink-soft sm:block">
      Row {Math.floor(session.selected / size) + 1}, column {(session.selected % size) + 1}
      {" · "}
      {number === null || number === undefined ? "no number" : `number ${number + 1}`}
      {", "}
      {color === null || color === undefined ? "no color" : colorAt(color).name.toLowerCase()}
    </p>
  );
};

const Timer = ({
  read,
  running,
  frozenMs,
}: {
  read: () => number;
  running: boolean;
  frozenMs: number | null;
}) => (
  <div
    className={`rounded-xl border-[2.5px] border-ink px-3 py-1.5 font-display text-2xl font-extrabold tabular-nums shadow-hard-sm ${running ? "bg-card" : "bg-paper-deep"}`}
    aria-label="Time elapsed"
  >
    {formatDuration(frozenMs ?? read())}
  </div>
);
