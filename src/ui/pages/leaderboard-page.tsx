import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";
import { asLevel, difficulties, difficultyLabels, levelLabels } from "../../domain/difficulty.ts";
import { checkPenaltyMs, formatDuration, hintPenaltyMs } from "../../domain/score.ts";
import {
  categoryKey,
  createPlayerAtom,
  currentPlayerAtom,
  customCategoriesAtom,
  leaderboardAtom,
  playersAtom,
  selectPlayerAtom,
  todayAtom,
} from "../atoms.ts";
import { Button, Card, Chip, IconButton, Loaded, Modal, SectionTitle } from "../components/ui.tsx";
import { useSound } from "../hooks/use-sound.ts";
import { navigate } from "../router.ts";
import { detach } from "../detach.ts";

const medals = ["bg-marker", "bg-paper-deep", "bg-tangerine"];

export const LeaderboardPage = () => {
  const today = AsyncResult.getOrElse(useAtomValue(todayAtom), () => undefined);
  const custom = AsyncResult.getOrElse(useAtomValue(customCategoriesAtom), () => []);
  const [selected, setSelected] = useState("difficulty:easy");
  const play = useSound();
  const tabs = [
    ...(today ? [{ key: `daily:${today.date}`, label: "Today's daily" }] : []),
    ...difficulties.map((difficulty) => ({
      key: categoryKey({ kind: "difficulty", difficulty }),
      label: difficultyLabels[difficulty],
    })),
    ...custom.map((category) => ({
      key: categoryKey({ kind: "custom", size: category.size, level: category.level }),
      label: `${category.size}×${category.size} ${levelLabels[asLevel(category.level)]}`,
    })),
  ];
  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <IconButton icon="back" label="Back home" onClick={() => navigate({ page: "home" })} />
        <SectionTitle kicker="Same device, friendly rivals">Leaderboard</SectionTitle>
      </div>
      <PlayersBar />
      <div className="my-5 flex gap-2 overflow-x-auto pt-1 pb-3 pl-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            data-pressed={tab.key === selected}
            onClick={() => {
              play("tap");
              setSelected(tab.key);
            }}
            className={`press shrink-0 cursor-pointer rounded-xl border-[2.5px] border-ink px-3 py-2 font-bold whitespace-nowrap shadow-hard-sm ${tab.key === selected ? "bg-marker" : "bg-card"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <Board categoryKeyValue={selected} />
      <p className="mt-4 text-sm text-ink-soft">
        Score = solve time + {formatDuration(hintPenaltyMs)} per hint +{" "}
        {formatDuration(checkPenaltyMs)} per check. Lower is better.
      </p>
    </div>
  );
};

const Board = ({ categoryKeyValue }: { categoryKeyValue: string }) => {
  const current = AsyncResult.getOrElse(useAtomValue(currentPlayerAtom), () => undefined);
  return (
    <Card className="ruled overflow-hidden">
      <Loaded result={useAtomValue(leaderboardAtom(categoryKeyValue))} label="Reading the board">
        {(entries) =>
          entries.length === 0 ? (
            <p className="p-10 text-center font-display text-xl font-extrabold">
              No solves yet. Be the first name here.
            </p>
          ) : (
            <ol>
              {entries.map((entry, index) => (
                <li
                  key={entry.gameId}
                  className={`flex items-center gap-3 border-b-2 border-dashed border-ink/20 px-4 py-3 last:border-0 ${entry.playerId === current?.id ? "bg-marker/25" : ""}`}
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-full border-[2.5px] border-ink font-display text-lg font-extrabold ${medals[index] ?? "bg-card"}`}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg font-extrabold">
                      {entry.playerName}
                    </p>
                    <p className="text-xs font-bold text-ink-soft">
                      {new Date(entry.completedAt).toLocaleDateString()} ·{" "}
                      {formatDuration(entry.elapsedMs)} raw
                      {entry.hints ? ` · ${entry.hints} hint${entry.hints > 1 ? "s" : ""}` : ""}
                      {entry.checks ? ` · ${entry.checks} check${entry.checks > 1 ? "s" : ""}` : ""}
                    </p>
                  </div>
                  {entry.hints === 0 && entry.checks === 0 && <Chip tone="mint">clean</Chip>}
                  <span className="font-display text-2xl font-extrabold tabular-nums">
                    {formatDuration(entry.scoreMs)}
                  </span>
                </li>
              ))}
            </ol>
          )
        }
      </Loaded>
    </Card>
  );
};

export const PlayersBar = () => {
  const players = AsyncResult.getOrElse(useAtomValue(playersAtom), () => []);
  const current = AsyncResult.getOrElse(useAtomValue(currentPlayerAtom), () => undefined);
  const select = useAtomSet(selectPlayerAtom);
  const create = useAtomSet(createPlayerAtom, { mode: "promiseExit" });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const play = useSound();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm font-bold tracking-wide text-ink-soft uppercase">
        Playing as
      </span>
      {players.map((player) => (
        <button
          key={player.id}
          type="button"
          data-pressed={player.id === current?.id}
          onClick={() => {
            play("tap");
            select(player.id);
          }}
          className={`press cursor-pointer rounded-full border-[2.5px] border-ink px-3 py-1 font-bold shadow-hard-sm ${player.id === current?.id ? "bg-ink text-paper" : "bg-card"}`}
        >
          {player.name}
        </button>
      ))}
      <Button size="sm" icon="plus" onClick={() => setAdding(true)}>
        Player
      </Button>
      <Modal open={adding} onClose={() => setAdding(false)} label="Add a player">
        <Card className="p-6">
          <form
            onSubmit={detach(async (event) => {
              event.preventDefault();
              const exit = await create(name);
              if (exit._tag === "Success") {
                setAdding(false);
                setName("");
                setError(null);
              } else setError("That name is already on the board.");
            })}
          >
            <p className="font-display text-2xl font-extrabold">Who's playing?</p>
            <input
              autoFocus
              value={name}
              maxLength={24}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              aria-label="Player name"
              className="mt-4 h-12 w-full rounded-xl border-[2.5px] border-ink bg-card px-3 text-lg font-bold shadow-hard-sm outline-none"
            />
            {error && <p className="mt-2 font-bold text-danger">{error}</p>}
            <div className="mt-5 flex gap-2">
              <Button type="submit" tone="ink" disabled={!name.trim()}>
                Add and switch
              </Button>
              <Button onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      </Modal>
    </div>
  );
};
