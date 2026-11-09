import { useAtomValue } from "@effect/atom-react";
import { useState } from "react";
import { difficultyLabels, type Difficulty } from "../../domain/difficulty.ts";
import { formatDuration } from "../../domain/score.ts";
import type { PlayerStats } from "../../services/stats.ts";
import { statsAtom } from "../atoms.ts";
import { Card, IconButton, Loaded, Segmented, SectionTitle } from "../components/ui.tsx";
import { navigate } from "../router.ts";

export const StatsPage = () => (
  <div className="mx-auto w-full max-w-5xl">
    <div className="mb-6 flex items-center gap-3">
      <IconButton icon="back" label="Back home" onClick={() => navigate({ page: "home" })} />
      <SectionTitle kicker="Your notebook">Stats</SectionTitle>
    </div>
    <Loaded result={useAtomValue(statsAtom)} label="Counting solves">
      {(stats) => <StatsView stats={stats} />}
    </Loaded>
  </div>
);

const StatsView = ({ stats }: { stats: PlayerStats }) => {
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const selected = stats.byDifficulty.find((entry) => entry.difficulty === difficulty);
  const hero: ReadonlyArray<readonly [string, string, string]> = [
    ["Solved", `${stats.solved}`, "bg-mint"],
    ["Clean solves", `${stats.perfect}`, "bg-marker"],
    ["Daily streak", `${stats.currentStreak}`, "bg-tangerine"],
    ["Best streak", `${stats.bestStreak}`, "bg-rose"],
    ["Time played", formatDuration(stats.totalTimeMs), "bg-sky"],
    ["In progress", `${stats.inProgress}`, "bg-lilac"],
  ];
  const maxDay = Math.max(1, ...stats.lastFourWeeks.map((day) => day.solved));
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {hero.map(([label, value, tone], index) => (
          <div
            key={label}
            className={`rounded-2xl border-[2.5px] border-ink p-4 shadow-hard ${tone} ${index % 2 ? "rotate-[0.7deg]" : "-rotate-[0.7deg]"}`}
          >
            <p className="text-xs font-bold tracking-widest uppercase">{label}</p>
            <p className="font-display text-3xl font-extrabold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <Card className="p-5">
        <p className="font-display text-xl font-extrabold">Last four weeks</p>
        <p className="text-sm text-ink-soft">
          Puzzles solved per day. Days with a daily solve get a star.
        </p>
        <div className="mt-4 flex h-40 items-end gap-1">
          {stats.lastFourWeeks.map((day) => (
            <div
              key={day.date}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
              title={`${day.date}: ${day.solved}`}
            >
              {day.daily && <span className="text-xs leading-none">★</span>}
              <div
                className={`w-full rounded-t-md border-2 border-ink ${day.solved ? "bg-sky" : "bg-paper-deep"}`}
                style={{ height: `${Math.max(4, (day.solved / maxDay) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs font-bold text-ink-soft">
          <span>{stats.lastFourWeeks[0]?.date}</span>
          <span>today</span>
        </div>
      </Card>

      <Card className="overflow-x-auto p-5">
        <p className="mb-3 font-display text-xl font-extrabold">By difficulty</p>
        <table className="w-full min-w-md text-left">
          <thead>
            <tr className="border-b-[2.5px] border-ink text-xs tracking-wide uppercase">
              <th className="py-2">Difficulty</th>
              <th>Solved</th>
              <th>Clean</th>
              <th>Best</th>
              <th>Average</th>
            </tr>
          </thead>
          <tbody>
            {stats.byDifficulty.map((entry) => (
              <tr
                key={entry.difficulty}
                className="border-b-2 border-dashed border-ink/20 font-bold tabular-nums"
              >
                <td className="py-2.5 font-display text-lg">
                  {difficultyLabels[entry.difficulty]}
                </td>
                <td>{entry.solved}</td>
                <td>{entry.perfect}</td>
                <td>{entry.bestMs === null ? "—" : formatDuration(entry.bestMs)}</td>
                <td>{entry.averageMs === null ? "—" : formatDuration(entry.averageMs)}</td>
              </tr>
            ))}
            <tr className="font-bold tabular-nums">
              <td className="py-2.5 font-display text-lg">Custom</td>
              <td>{stats.custom}</td>
              <td colSpan={3} className="text-sm text-ink-soft">
                ranked per size and logic on the leaderboard
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-4 text-sm text-ink-soft">
          On average {stats.averageHints.toFixed(1)} hints and {stats.averageChecks.toFixed(1)}{" "}
          checks per solve.
        </p>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="font-display text-xl font-extrabold">Solve times</p>
          <Segmented
            label="Difficulty"
            value={difficulty}
            onChange={setDifficulty}
            options={stats.byDifficulty.map((entry) => ({
              value: entry.difficulty,
              label: difficultyLabels[entry.difficulty],
            }))}
          />
        </div>
        <Histogram times={selected?.times ?? []} />
      </Card>
    </div>
  );
};

const Histogram = ({ times }: { times: ReadonlyArray<number> }) => {
  if (times.length === 0)
    return <p className="py-8 text-center font-bold text-ink-soft">No solves here yet.</p>;
  const bucketCount = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(times.length))));
  const min = Math.min(...times);
  const max = Math.max(...times);
  const width = Math.max(1000, (max - min) / bucketCount);
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    from: min + index * width,
    count: times.filter(
      (time) =>
        time >= min + index * width &&
        (index === bucketCount - 1 || time < min + (index + 1) * width),
    ).length,
  }));
  const peak = Math.max(...buckets.map((bucket) => bucket.count));
  return (
    <div className="flex flex-col gap-2">
      {buckets.map((bucket) => (
        <div key={bucket.from} className="flex items-center gap-3">
          <span className="w-14 text-right text-sm font-bold tabular-nums">
            {formatDuration(bucket.from)}
          </span>
          <div className="h-7 flex-1">
            <div
              className="flex h-full items-center rounded-md border-2 border-ink bg-tangerine px-2 text-sm font-bold"
              style={{ width: `${Math.max(6, (bucket.count / peak) * 100)}%` }}
            >
              {bucket.count}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
