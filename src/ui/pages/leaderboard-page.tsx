import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { asLevel, difficulties, difficultyLabels, levelLabels } from "../../domain/difficulty.ts";
import { checkPenaltyMs, formatDuration, hintPenaltyMs } from "../../domain/score.ts";
import type { LeaderboardEntry } from "../../api/rpc.ts";
import { Card, Chip, IconButton, SectionTitle, Spinner } from "../components/ui.tsx";
import { useSound } from "../hooks/use-sound.ts";
import {
  accountQuery,
  categoryKey,
  customCategoriesQuery,
  leaderboardQuery,
  todayQuery,
} from "../queries.ts";

const medals = ["bg-marker", "bg-paper-deep", "bg-tangerine"];

export const LeaderboardPage = ({ board }: { board: string }) => {
  const today = useSuspenseQuery(todayQuery).data;
  const custom = useSuspenseQuery(customCategoriesQuery).data;
  const navigate = useNavigate();
  const play = useSound();
  const tabs = [
    { key: `daily:${today.date}`, label: "Today's daily" },
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
        <SectionTitle kicker="Everyone, same puzzles">Leaderboard</SectionTitle>
      </div>
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
              void navigate({ to: "/leaderboard", search: { board: tab.key }, replace: true });
            }}
            className={`press shrink-0 cursor-pointer rounded-xl border-[2.5px] border-ink px-3 py-2 font-bold whitespace-nowrap shadow-hard-sm ${tab.key === board ? "bg-marker" : "bg-card"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <Board board={board} />
      <p className="mt-4 text-sm text-ink-soft">
        Score = solve time + {formatDuration(hintPenaltyMs)} per hint +{" "}
        {formatDuration(checkPenaltyMs)} per check. Lower is better. Solves count once the server
        has replayed and checked them.
      </p>
    </div>
  );
};

const features = tableFeatures({});
const column = createColumnHelper<typeof features, LeaderboardEntry>();
const details = (entry: LeaderboardEntry) =>
  [
    new Date(entry.completedAt).toLocaleDateString(),
    `${formatDuration(entry.elapsedMs)} raw`,
    entry.hints ? `${entry.hints} hint${entry.hints > 1 ? "s" : ""}` : "",
    entry.checks ? `${entry.checks} check${entry.checks > 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

const columns = column.columns([
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
        <span className="block text-xs font-bold text-ink-soft">{details(info.row.original)}</span>
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

const Board = ({ board }: { board: string }) => {
  const entries = useQuery(leaderboardQuery(board));
  const account = useQuery(accountQuery).data;
  const data = useMemo(() => [...(entries.data ?? [])], [entries.data]);
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
