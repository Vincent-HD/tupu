import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useHotkey, useHotkeys, type UseHotkeyDefinition } from "@tanstack/react-hotkeys";
import { useDebouncer } from "@tanstack/react-pacer";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { difficultyLabels, levelLabels } from "../../domain/difficulty.ts";
import { isGiven } from "../../domain/game.ts";
import { explain } from "../../domain/hints.ts";
import { colorAt } from "../../domain/palette.ts";
import { minimumMoves } from "../../domain/puzzle.ts";
import {
  checkPenaltyMs,
  formatDuration,
  hintPenaltyMs,
  isPerfect,
  scoreOf,
} from "../../domain/score.ts";
import { shareGrid } from "../../domain/share.ts";
import {
  createSession,
  lineComplete,
  reduce,
  type Action,
  type Session,
} from "../../domain/session.ts";
import { findConflicts, type Layer } from "../../domain/solver.ts";
import { lensView, noFocus, placedCount, type LensFocus } from "../../domain/lens.ts";
import type { GameRecord, GameSnapshot, StartGame } from "../../services/games.ts";
import { actions, gameQuery, standingQuery } from "../queries.ts";
import { Board } from "../components/board.tsx";
import { Confetti } from "../components/confetti.tsx";
import { Icon } from "../components/icons.tsx";
import { Keypad } from "../components/keypad.tsx";
import { PairMatrix } from "../components/pair-matrix.tsx";
import type { TileMark } from "../components/tile.tsx";
import { Button, Card, Chip, IconButton, Modal } from "../components/ui.tsx";
import { useSettings } from "../hooks/use-settings.ts";
import { useSound } from "../hooks/use-sound.ts";
import { usePageVisible, useStopwatch } from "../hooks/use-stopwatch.ts";
import { useWakeLock } from "../hooks/use-wake-lock.ts";
import { colorKeyCodes, digitKeyCodes, numpadKeyCodes, useColorKeyLabels } from "../keyboard.ts";
import { detach } from "../detach.ts";

export const PlayPage = ({ id }: { id: string }) => {
  const game = useSuspenseQuery(gameQuery(id)).data;
  return <GameView key={game.id} game={game} />;
};

export const modeTitle = (game: Pick<GameRecord, "mode" | "dailyDate">) =>
  game.mode === "daily" ? "Daily puzzle" : game.mode === "quick" ? "Quick play" : "Custom puzzle";

const movesSummary = (game: GameRecord, session: Session) =>
  `${session.moves.length} moves (minimum ${minimumMoves(game.puzzle)})`;

const shareText = (game: GameRecord, session: Session, elapsedMs: number) => {
  const { size } = game.puzzle;
  const label = game.difficulty
    ? difficultyLabels[game.difficulty]
    : `${size}×${size} ${levelLabels[game.puzzle.level]}`;
  return [
    `Tupu · ${modeTitle(game)}${game.dailyDate ? ` ${game.dailyDate}` : ""} · ${label}`,
    `⏱ ${formatDuration(elapsedMs)} · ${movesSummary(game, session)}`,
    isPerfect(session) ? "✨ clean solve" : `💡${session.hints} 🔎${session.checks}`,
    ...shareGrid(session.board),
    game.mode === "custom" ? `seed ${game.puzzle.seed}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

const GameView = ({ game }: { game: GameRecord }) => {
  const settings = useSettings();
  const colorKeys = useColorKeyLabels(settings.keyboardLayout);
  const play = useSound();
  const navigate = useNavigate();
  const saveDebouncer = useDebouncer(
    (snapshot: GameSnapshot) => {
      void actions.saveGame(snapshot);
    },
    { wait: 350, onUnmount: (debouncer) => debouncer.flush() },
  );
  const save = saveDebouncer.maybeExecute;
  const complete = useMutation({
    mutationFn: actions.completeGame,
    onSettled: () => setShowResult(true),
  });
  const startNext = useMutation({
    mutationFn: actions.startGame,
    onSuccess: (gameId) => navigate({ to: "/play/$gameId", params: { gameId } }),
  });
  const [session, dispatch] = useReducer(reduce, game, (record) => createSession(record));
  const standing =
    useQuery({ ...standingQuery(game.id), enabled: session.solved || game.status === "solved" })
      .data ?? null;
  const [paused, setPaused] = useState(false);
  const [lens, setLens] = useState(false);
  const [lensFocus, setLensFocus] = useState<LensFocus>(noFocus);
  const [focusPair, setFocusPair] = useState<{
    readonly number: number;
    readonly color: number;
  } | null>(null);
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
    const flush = () => {
      saveDebouncer.cancel();
      void actions.saveGame(snapshot(sessionRef.current));
    };
    const interval = window.setInterval(flush, 15_000);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", flush);
    };
  }, [alreadySolved, session.solved, saveDebouncer, snapshot]);

  useEffect(() => {
    if (!session.solved || alreadySolved) return;
    play("win");
    saveDebouncer.cancel();
    complete.mutate(snapshot(session));
    // oxlint-disable-next-line react/exhaustive-deps
  }, [session.solved]);

  const act = useCallback(
    (action: Action) => {
      const current = sessionRef.current;
      const next = reduce(current, action);
      dispatch(action);
      if (next === current) {
        if ((action.type === "place" || action.type === "clear") && current.selected !== null)
          play("error");
        return;
      }
      switch (action.type) {
        case "select":
        case "move":
        case "deselect":
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
          const target = current.selected;
          if (target === null) return;
          const conflicts = findConflicts(next.board).filter((conflict) =>
            conflict.cells.includes(target),
          );
          if (!cleared && settings.showConflicts && conflicts.length > 0)
            window.setTimeout(() => play("error"), 120);
          else if (!cleared && lineComplete(next.board, target) && !next.solved)
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

  const values = Array.from({ length: game.puzzle.size }, (_, value) => value);
  const playing = !session.solved && !alreadySolved;
  const lensOn = lens && playing;
  const lensState = useMemo(
    () => lensView(session.board, lensOn ? lensFocus : noFocus),
    [session.board, lensOn, lensFocus],
  );
  const toggleLens = () => {
    play("tap");
    setLens((on) => !on);
    setLensFocus(noFocus);
  };
  const focusValue = (layer: Layer, value: number) => {
    play("select");
    setLensFocus((current) =>
      layer === "number"
        ? { ...current, number: current.number === value ? null : value }
        : { ...current, color: current.color === value ? null : value },
    );
  };
  const place = (layer: Layer, value: number) =>
    lensOn ? focusValue(layer, value) : act({ type: "place", layer, value, at: now() });
  const escape = () => {
    if (lensOn) {
      if (lensState.active) setLensFocus(noFocus);
      else setLens(false);
      return;
    }
    const current = sessionRef.current;
    act(current.hint || current.checkResult ? { type: "dismiss-hint" } : { type: "deselect" });
  };
  const shortcuts: Array<UseHotkeyDefinition> = [
    { hotkey: "ArrowUp", callback: () => act({ type: "move", rows: -1, columns: 0 }) },
    { hotkey: "ArrowDown", callback: () => act({ type: "move", rows: 1, columns: 0 }) },
    { hotkey: "ArrowLeft", callback: () => act({ type: "move", rows: 0, columns: -1 }) },
    { hotkey: "ArrowRight", callback: () => act({ type: "move", rows: 0, columns: 1 }) },
    ...values.flatMap((value): Array<UseHotkeyDefinition> => {
      const placeNumber = () => place("number", value);
      const digit = digitKeyCodes[value] ?? "Digit1";
      return [
        { hotkey: `[${digit}]`, callback: placeNumber },
        { hotkey: `Shift+[${digit}]`, callback: placeNumber },
        { hotkey: `[${numpadKeyCodes[value] ?? "Numpad1"}]`, callback: placeNumber },
        {
          hotkey: `[${colorKeyCodes[value] ?? "KeyQ"}]`,
          callback: () => place("color", value),
        },
      ];
    }),
    { hotkey: "Backspace", callback: () => act({ type: "clear", at: now() }) },
    { hotkey: "Delete", callback: () => act({ type: "clear", at: now() }) },
    { hotkey: "[Digit0]", callback: () => act({ type: "clear", at: now() }) },
    { hotkey: "Mod+Z", callback: () => act({ type: "undo", at: now() }) },
    { hotkey: "Mod+Shift+Z", callback: () => act({ type: "redo", at: now() }) },
    { hotkey: "Mod+Y", callback: () => act({ type: "redo", at: now() }) },
    { hotkey: "H", callback: () => act({ type: "hint" }) },
    { hotkey: "Escape", callback: escape },
    { hotkey: "L", callback: toggleLens, options: { enabled: playing } },
  ];
  useHotkeys(shortcuts, { enabled: !paused });
  useHotkey("P", () => setPaused((value) => !value), { enabled: playing, requireReset: true });

  const marks = useMemo(() => {
    const map = new Map<number, Set<TileMark>>();
    const add = (cell: number, mark: TileMark) => {
      const set = map.get(cell) ?? new Set<TileMark>();
      set.add(mark);
      map.set(cell, set);
    };
    const { size } = game.puzzle;
    const { board, selected } = session;
    if (lensState.active)
      for (let cell = 0; cell < size * size; cell++)
        add(
          cell,
          lensState.matches.has(cell)
            ? "lens-hit"
            : lensState.possible.has(cell)
              ? "lens-maybe"
              : "lens-dim",
        );
    if (settings.highlightRelated && !session.solved && selected !== null && !lensState.active) {
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
    if (!session.solved && selected !== null && !lensState.active) add(selected, "selected");
    return map;
  }, [
    session,
    settings.highlightRelated,
    settings.showConflicts,
    focusPair,
    game.puzzle,
    lensState,
  ]);

  const lockedNumber =
    session.selected === null || isGiven(game.puzzle, session.selected, "number");
  const lockedColor = session.selected === null || isGiven(game.puzzle, session.selected, "color");

  const nextGame: StartGame =
    game.mode === "quick" && game.difficulty
      ? { mode: "quick", difficulty: game.difficulty }
      : {
          mode: "custom",
          spec: { size: game.puzzle.size, level: game.puzzle.level, density: game.puzzle.density },
        };
  const playNext = () => {
    if (game.mode === "daily") return void navigate({ to: "/" });
    startNext.mutate(nextGame);
  };

  const share = async () => {
    const text = shareText(game, session, alreadySolved ? game.elapsedMs : elapsed());
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
  const scoreMs =
    game.scoreMs ??
    scoreOf({ elapsedMs: finalElapsed, hints: session.hints, checks: session.checks });
  const hintView = session.hint;
  const explanation = hintView?.deduction ? explain(hintView.deduction) : null;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-3 flex items-center gap-2 sm:mb-5 sm:gap-3">
        <IconButton icon="back" label="Back home" onClick={() => void navigate({ to: "/" })} />
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
                onSelect={(cell) =>
                  lensState.active ? setLensFocus(noFocus) : act({ type: "select", cell })
                }
                gutters={
                  lensOn ? { rows: lensState.missingRows, columns: lensState.missingColumns } : null
                }
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
              {lensOn ? (
                <LensPanel
                  focus={lensFocus}
                  placed={lensState}
                  size={game.puzzle.size}
                  onClose={toggleLens}
                />
              ) : (
                <SelectedSummary session={session} />
              )}
              <Keypad
                size={game.puzzle.size}
                number={
                  lensOn
                    ? lensFocus.number
                    : session.selected === null
                      ? null
                      : (session.board.numbers[session.selected] ?? null)
                }
                color={
                  lensOn
                    ? lensFocus.color
                    : session.selected === null
                      ? null
                      : (session.board.colors[session.selected] ?? null)
                }
                lockedNumber={!lensOn && lockedNumber}
                lockedColor={!lensOn && lockedColor}
                counts={{
                  numbers: values.map((value) => placedCount(session.board, "number", value)),
                  colors: values.map((value) => placedCount(session.board, "color", value)),
                }}
                shapes={settings.colorblindShapes}
                colorKeys={colorKeys}
                onNumber={(value) => place("number", value)}
                onColor={(value) => place("color", value)}
              />
            </Card>
          )}
          {!session.solved && !alreadySolved && (
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
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
                icon="scan"
                label={lensOn ? "Close the highlighter (L)" : "Highlight a number or color (L)"}
                tone={lensOn ? "ink" : "paper"}
                aria-pressed={lensOn}
                className="w-full"
                onClick={toggleLens}
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
              <p className="mt-1">
                Solved in {formatDuration(finalElapsed)} · score{" "}
                <strong className="tabular-nums">{formatDuration(scoreMs)}</strong>
              </p>
              <p className="text-sm text-ink-soft">{movesSummary(game, session)}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  tone="ink"
                  icon="play"
                  className="col-span-2"
                  disabled={startNext.isPending}
                  onClick={playNext}
                >
                  {game.mode === "daily" ? "Back home" : "Next puzzle"}
                </Button>
                <Button
                  icon="film"
                  onClick={() =>
                    void navigate({ to: "/replay/$gameId", params: { gameId: game.id } })
                  }
                >
                  Replay
                </Button>
                <Button icon="share" onClick={detach(share)}>
                  {copied ? "Copied!" : "Share"}
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
            numbers · {colorKeys.slice(0, game.puzzle.size).join(" ")} colors · ⌫ erase · L
            highlight · H hint · P pause
          </p>
        </aside>
      </div>

      {showResult && settings.animations && <Confetti />}
      <Modal open={showResult} onClose={() => setShowResult(false)} label="Puzzle solved">
        <Card className="ruled overflow-hidden p-5 sm:p-6">
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
            <Stat label="Score" value={formatDuration(scoreMs)} detail="lower is better" />
          </dl>
          <p className="mt-4 font-bold">
            {movesSummary(game, session)}
            {standing &&
              ` · #${standing.rank} of ${standing.entries} on this board${standing.personalBest ? " · new personal best!" : ""}`}
          </p>
          <div className="mt-6 grid grid-cols-3 gap-2">
            <Button
              tone="ink"
              icon="play"
              className="col-span-3"
              disabled={startNext.isPending}
              onClick={playNext}
            >
              {game.mode === "daily" ? "Back home" : "Next puzzle"}
            </Button>
            <Button size="compact" icon="share" onClick={detach(share)}>
              {copied ? "Copied!" : "Share"}
            </Button>
            <Button
              size="compact"
              icon="film"
              onClick={() => void navigate({ to: "/replay/$gameId", params: { gameId: game.id } })}
            >
              Replay
            </Button>
            <Button
              size="compact"
              icon="trophy"
              onClick={() => void navigate({ to: "/leaderboard" })}
            >
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

const LensPanel = ({
  focus,
  placed,
  size,
  onClose,
}: {
  focus: LensFocus;
  placed: {
    readonly placed: number;
    readonly missingRows: ReadonlySet<number>;
    readonly missingColumns: ReadonlySet<number>;
    readonly possible: ReadonlySet<number>;
  };
  size: number;
  onClose: () => void;
}) => {
  const name = [
    focus.color === null ? null : colorAt(focus.color).name,
    focus.number === null ? null : `${focus.color === null ? "Number " : ""}${focus.number + 1}`,
  ]
    .filter(Boolean)
    .join(" ");
  const list = (prefix: string, values: ReadonlySet<number>) =>
    [...values].map((value) => `${prefix}${value + 1}`).join(", ");
  const status =
    focus.number === null && focus.color === null
      ? "Pick a number, a color, or both."
      : focus.number !== null && focus.color !== null
        ? placed.placed > 0
          ? `${name} is already on the board.`
          : `${name} is not placed yet. Dashed tiles can still take it.`
        : placed.missingRows.size === 0
          ? `${name}: ${placed.placed}/${size} placed, complete.`
          : `${name}: ${placed.placed}/${size} placed. Missing in ${list("L", placed.missingRows)} · ${list("C", placed.missingColumns)}.`;
  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 rounded-xl bg-ink px-3 py-2 text-sm font-bold text-paper">
        <span className="flex items-center gap-2">
          <Icon name="scan" className="shrink-0 text-lg" /> Highlighter: the keypad finds instead of
          placing
        </span>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 cursor-pointer rounded-lg border-2 border-paper px-2 py-0.5 text-xs font-extrabold"
        >
          Close
        </button>
      </div>
      <p className="rounded-lg bg-ink/6 px-3 py-2 text-sm font-bold" role="status">
        {status}
      </p>
    </div>
  );
};

const SelectedSummary = ({ session }: { session: Session }) => {
  const { size } = session.puzzle;
  const { selected } = session;
  if (selected === null)
    return (
      <p className="mb-3 text-sm font-bold text-ink-soft">
        No tile selected. Tap one to fill it in.
      </p>
    );
  const number = session.board.numbers[selected];
  const color = session.board.colors[selected];
  return (
    <p className="mb-3 hidden text-sm font-bold text-ink-soft sm:block">
      Row {Math.floor(selected / size) + 1}, column {(selected % size) + 1}
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
