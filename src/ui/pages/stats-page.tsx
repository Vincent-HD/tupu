import { barY, defineChart } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { difficultyLabels, type Difficulty } from "../../domain/difficulty.ts";
import { formatDuration } from "../../domain/score.ts";
import type { DifficultyStats, PlayerStats } from "../../services/stats.ts";
import { Card, IconButton, Segmented, SectionTitle } from "../components/ui.tsx";
import { statsQuery } from "../queries.ts";

export const StatsPage = ({ difficulty }: { difficulty: Difficulty }) => {
  const stats = useSuspenseQuery(statsQuery).data;
  const navigate = useNavigate();
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex items-center gap-3">
        <IconButton icon="back" label="Back home" onClick={() => void navigate({ to: "/" })} />
        <SectionTitle kicker="Your notebook">Stats</SectionTitle>
      </div>
      <StatsView stats={stats} difficulty={difficulty} />
    </div>
  );
};

const features = tableFeatures({});
const column = createColumnHelper<typeof features, DifficultyStats>();
const durationOrDash = (value: number | null) => (value === null ? "—" : formatDuration(value));
const difficultyColumns = column.columns([
  column.accessor("difficulty", {
    header: "Difficulty",
    cell: (info) => difficultyLabels[info.getValue()],
  }),
  column.accessor("solved", { header: "Solved" }),
  column.accessor("perfect", { header: "Clean" }),
  column.accessor("bestMs", { header: "Best", cell: (info) => durationOrDash(info.getValue()) }),
  column.accessor("averageMs", {
    header: "Average",
    cell: (info) => durationOrDash(info.getValue()),
  }),
]);

const DifficultyTable = ({ rows }: { rows: ReadonlyArray<DifficultyStats> }) => {
  const data = useMemo(() => [...rows], [rows]);
  const table = useTable({ features, columns: difficultyColumns, data });
  return (
    <table className="w-full min-w-md text-left">
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr
            key={group.id}
            className="border-b-[2.5px] border-ink text-xs tracking-wide uppercase"
          >
            {group.headers.map((header) => (
              <th key={header.id} className="py-2">
                {header.isPlaceholder ? null : <table.FlexRender header={header} />}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr
            key={row.id}
            className="border-b-2 border-dashed border-ink/20 font-bold tabular-nums"
          >
            {row.getAllCells().map((cell, index) => (
              <td key={cell.id} className={index === 0 ? "py-2.5 font-display text-lg" : ""}>
                <table.FlexRender cell={cell} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const wholeNumber = (value: number) => (Number.isInteger(value) ? String(value) : "");

const shortDate = (isoDate: string) => isoDate.slice(5).replace("-", "/");

const LastFourWeeksChart = ({ days }: { days: PlayerStats["lastFourWeeks"] }) => {
  const definition = useMemo(() => {
    const rows = days.map((day) => ({ ...day, label: shortDate(day.date) }));
    return defineChart({
      marks: [
        barY(rows, {
          x: "label",
          y: "solved",
          fill: (row) => (row.daily ? "#ffd23f" : "#4ea8ff"),
          inset: 1,
        }),
      ],
      scales: {
        x: {
          scale: () => scaleBand<string>().padding(0.2),
          axis: {
            ticks: {
              format: (value: string) =>
                value.endsWith("/01") || value.endsWith("/15") ? value : "",
            },
          },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: { label: "Solved", ticks: { count: 4, format: wholeNumber } },
        },
      },
    });
  }, [days]);
  return (
    <Chart
      definition={definition}
      height={200}
      initialWidth={640}
      ariaLabel="Puzzles solved per day over the last four weeks"
      ariaDescription="Yellow bars mark days with a solved daily puzzle."
      className="text-ink"
    />
  );
};

const SolveTimesChart = ({ times }: { times: ReadonlyArray<number> }) => {
  const definition = useMemo(() => {
    const bucketCount = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(times.length))));
    const min = Math.min(...times);
    const max = Math.max(...times);
    const width = Math.max(1000, (max - min) / bucketCount);
    const rows = Array.from({ length: bucketCount }, (_, index) => {
      const from = min + index * width;
      const last = index === bucketCount - 1;
      return {
        label: formatDuration(from),
        count: times.filter((time) => time >= from && (last || time < from + width)).length,
      };
    });
    return defineChart({
      marks: [barY(rows, { x: "label", y: "count", fill: "#ff9f43", inset: 2 })],
      scales: {
        x: { scale: () => scaleBand<string>().padding(0.15), axis: { label: "Solve time from" } },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: { label: "Solves", ticks: { count: 4, format: wholeNumber } },
        },
      },
    });
  }, [times]);
  return (
    <Chart
      definition={definition}
      height={220}
      initialWidth={640}
      ariaLabel="Distribution of solve times"
      className="text-ink"
    />
  );
};

const StatsView = ({ stats, difficulty }: { stats: PlayerStats; difficulty: Difficulty }) => {
  const navigate = useNavigate();
  const selected = stats.byDifficulty.find((entry) => entry.difficulty === difficulty);
  const hero: ReadonlyArray<readonly [string, string, string]> = [
    ["Solved", `${stats.solved}`, "bg-mint"],
    ["Clean solves", `${stats.perfect}`, "bg-marker"],
    ["Daily streak", `${stats.currentStreak}`, "bg-tangerine"],
    ["Best streak", `${stats.bestStreak}`, "bg-rose"],
    ["Time played", formatDuration(stats.totalTimeMs), "bg-sky"],
    ["In progress", `${stats.inProgress}`, "bg-lilac"],
  ];
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
        <p className="mb-3 text-sm text-ink-soft">
          Puzzles solved per day. Yellow days include a solved daily.
        </p>
        <LastFourWeeksChart days={stats.lastFourWeeks} />
      </Card>

      <Card className="overflow-x-auto p-5">
        <p className="mb-3 font-display text-xl font-extrabold">By difficulty</p>
        <DifficultyTable rows={stats.byDifficulty} />
        <p className="mt-4 text-sm text-ink-soft">
          {stats.custom} custom puzzle{stats.custom === 1 ? "" : "s"} solved, ranked per size and
          logic on the leaderboard. On average {stats.averageHints.toFixed(1)} hints and{" "}
          {stats.averageChecks.toFixed(1)} checks per solve.
        </p>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="font-display text-xl font-extrabold">Solve times</p>
          <Segmented
            label="Difficulty"
            value={difficulty}
            onChange={(next) =>
              void navigate({ to: "/stats", search: { difficulty: next }, replace: true })
            }
            options={stats.byDifficulty.map((entry) => ({
              value: entry.difficulty,
              label: difficultyLabels[entry.difficulty],
            }))}
          />
        </div>
        {selected && selected.times.length > 0 ? (
          <SolveTimesChart times={selected.times} />
        ) : (
          <p className="py-8 text-center font-bold text-ink-soft">No solves here yet.</p>
        )}
      </Card>
    </div>
  );
};
