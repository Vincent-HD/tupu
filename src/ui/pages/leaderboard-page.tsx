import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { formatShortDate, shiftDate, weekdayOf } from "../../domain/calendar.ts";
import {
  asLevel,
  dailyDifficulty,
  difficulties,
  difficultyLabels,
  levelLabels,
} from "../../domain/difficulty.ts";
import { checkPenaltyMs, formatDuration, hintPenaltyMs } from "../../domain/score.ts";
import type { LeaderboardEntry } from "../../api/rpc.ts";
import { Button, Card, Chip, IconButton, SectionTitle, Spinner } from "../components/ui.tsx";
import { useSound } from "../hooks/use-sound.ts";
import {
  accountQuery,
  categoryKey,
  customCategoriesQuery,
  leaderboardQuery,
  todayQuery,
} from "../queries.ts";

const medals = ["bg-marker", "bg-paper-deep", "bg-tangerine"];

const dailyPrefix = "daily:";

export const LeaderboardPage = (props: { readonly board: string | undefined }) => {
  const today = useSuspenseQuery(todayQuery).data;
  const custom = useSuspenseQuery(customCategoriesQuery).data;
  const account = useQuery(accountQuery).data;
  const navigate = useNavigate();
  const play = useSound();
  const board = props.board ?? `${dailyPrefix}${today.date}`;
  const dailyDate = board.startsWith(dailyPrefix) ? board.slice(dailyPrefix.length) : null;
  const show = (key: string) =>
    void navigate({ to: "/leaderboard", search: { board: key }, replace: true });
  const tabs = [
    { key: `${dailyPrefix}${dailyDate ?? today.date}`, label: "Daily" },
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
        <IconButton icon="back" label="Back home" onClick={() => void navigate({ to: "/" })} />
        <SectionTitle kicker="Best times">Leaderboard</SectionTitle>
      </div>
      {account === null ? (
        <Card className="ruled p-10 text-center">
          <p className="font-display text-xl font-extrabold">Leaderboards need an account.</p>
          <p className="mt-2 text-ink-soft">
            Sign in and the games you already played on this device count too.
          </p>
          <Button
            tone="marker"
            icon="user"
            className="mt-5"
            onClick={() => void navigate({ to: "/login" })}
          >
            Sign in
          </Button>
        </Card>
      ) : (
        <>
          <div
            className="my-5 flex gap-2 overflow-x-auto pt-1 pb-3 pl-1"
            role="tablist"
            aria-label="Boards"
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={tab.key === board}
                data-pressed={tab.key === board}
                onClick={() => {
                  play("tap");
                  show(tab.key);
                }}
                className={`press shrink-0 cursor-pointer rounded-xl border-[2.5px] border-ink px-3 py-2 font-bold whitespace-nowrap shadow-hard-sm ${tab.key === board ? "bg-marker" : "bg-card"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {dailyDate !== null && (
            <DayPicker
              date={dailyDate}
              today={today.date}
              onChange={(date) => show(`${dailyPrefix}${date}`)}
            />
          )}
          <Board board={board} daily={dailyDate !== null} />
          <p className="mt-4 text-sm text-ink-soft">
            {dailyDate === null
              ? "Every solve at this difficulty: the daily puzzles of each day and random puzzles alike. "
              : "Everyone played the same puzzle that day. "}
            Score = solve time + {formatDuration(hintPenaltyMs)} per hint +{" "}
            {formatDuration(checkPenaltyMs)} per check. Lower is better. Solves count once the
            server has replayed and checked them.
          </p>
        </>
      )}
    </div>
  );
};

// Picks which day's daily puzzle the board shows; days after today have none yet.
const DayPicker = (props: {
  readonly date: string;
  readonly today: string;
  readonly onChange: (date: string) => void;
}) => {
  const difficulty = dailyDifficulty(weekdayOf(props.date));
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <IconButton
        icon="chevronLeft"
        label="Previous day"
        onClick={() => props.onChange(shiftDate(props.date, -1))}
      />
      <input
        type="date"
        aria-label="Puzzle day"
        value={props.date}
        max={props.today}
        onChange={(event) => {
          const date = event.target.value;
          if (date !== "" && date <= props.today) props.onChange(date);
        }}
        className="h-11 rounded-xl border-[2.5px] border-ink bg-card px-3 font-bold shadow-hard-sm outline-none focus-visible:ring-4 focus-visible:ring-marker"
      />
      <IconButton
        icon="chevronRight"
        label="Next day"
        disabled={props.date >= props.today}
        onClick={() => props.onChange(shiftDate(props.date, 1))}
      />
      {props.date !== props.today && (
        <Button size="sm" onClick={() => props.onChange(props.today)}>
          Today
        </Button>
      )}
      <Chip tone="marker">{difficultyLabels[difficulty]}</Chip>
    </div>
  );
};

// Which puzzle a solve was: on a daily board they are all the same, elsewhere
// the daily of a given day or a random puzzle.
const puzzleLabel = (entry: LeaderboardEntry) => {
  if (entry.dailyDate !== null) return `Daily of ${formatShortDate(entry.dailyDate)}`;
  return entry.mode === "custom" ? "Custom puzzle" : "Random puzzle";
};

const features = tableFeatures({});
const column = createColumnHelper<typeof features, LeaderboardEntry>();
const details = (entry: LeaderboardEntry, daily: boolean) =>
  [
    daily ? "" : puzzleLabel(entry),
    `solved ${new Date(entry.completedAt).toLocaleDateString()}`,
    `${formatDuration(entry.elapsedMs)} raw`,
    entry.hints ? `${entry.hints} hint${entry.hints > 1 ? "s" : ""}` : "",
    entry.checks ? `${entry.checks} check${entry.checks > 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

const columnsFor = (daily: boolean) =>
  column.columns([
    column.display({
      id: "rank",
      header: "#",
      cell: (info) => (
        <span
          className={`flex size-10 items-center justify-center rounded-full border-[2.5px] border-ink font-display text-lg font-extrabold ${medals[info.row.index] ?? "bg-card"}`}
        >
          {info.row.index + 1}
        </span>
      ),
    }),
    column.accessor("name", {
      header: "Player",
      cell: (info) => (
        <span className="block min-w-0">
          <span className="block truncate font-display text-lg font-extrabold">
            {info.getValue()}
          </span>
          <span className="block text-xs font-bold text-ink-soft">
            {details(info.row.original, daily)}
          </span>
        </span>
      ),
    }),
    column.display({
      id: "clean",
      header: "",
      cell: (info) =>
        info.row.original.hints === 0 && info.row.original.checks === 0 ? (
          <Chip tone="mint">clean</Chip>
        ) : null,
    }),
    column.accessor("scoreMs", {
      header: "Score",
      cell: (info) => (
        <span className="font-display text-2xl font-extrabold tabular-nums">
          {formatDuration(info.getValue())}
        </span>
      ),
    }),
  ]);

const Board = ({ board, daily }: { board: string; daily: boolean }) => {
  const entries = useQuery(leaderboardQuery(board));
  const account = useQuery(accountQuery).data;
  const data = useMemo(() => [...(entries.data ?? [])], [entries.data]);
  const columns = useMemo(() => columnsFor(daily), [daily]);
  const table = useTable({ features, columns, data });
  if (entries.isPending) return <Spinner label="Reading the board" />;
  if (entries.isError)
    return (
      <Card className="ruled p-10 text-center">
        <p className="font-display text-xl font-extrabold">The leaderboard needs a connection.</p>
        <p className="mt-2 text-ink-soft">Your solves sync and show up here once you are online.</p>
      </Card>
    );
  return (
    <Card className="ruled overflow-hidden">
      {data.length === 0 ? (
        <p className="p-10 text-center font-display text-xl font-extrabold">
          No solves yet. Be the first name here.
        </p>
      ) : (
        <table className="w-full">
          <thead className="sr-only">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id}>
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
                className={`border-b-2 border-dashed border-ink/20 last:border-0 ${row.original.accountId === account?.id ? "bg-marker/25" : ""}`}
              >
                {row.getAllCells().map((cell, index) => (
                  <td
                    key={cell.id}
                    className={`px-2 py-3 first:pl-4 last:pr-4 ${index === 1 ? "w-full max-w-0" : "whitespace-nowrap"}`}
                  >
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
};
