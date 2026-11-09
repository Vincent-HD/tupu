import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Schema } from "effect";
import { useMemo, useState } from "react";
import { asLevel, difficulties, difficultyLabels, levelLabels } from "../../domain/difficulty.ts";
import { checkPenaltyMs, formatDuration, hintPenaltyMs } from "../../domain/score.ts";
import type { LeaderboardEntry } from "../../services/leaderboard.ts";
import { Button, Card, Chip, IconButton, Modal, SectionTitle, Spinner } from "../components/ui.tsx";
import { useSound } from "../hooks/use-sound.ts";
import {
  actions,
  categoryKey,
  currentPlayerQuery,
  customCategoriesQuery,
  leaderboardQuery,
  playersQuery,
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
        <SectionTitle kicker="Same device, friendly rivals">Leaderboard</SectionTitle>
      </div>
      <PlayersBar />
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
        {formatDuration(checkPenaltyMs)} per check. Lower is better.
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
  column.accessor("playerName", {
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
  const current = useQuery(currentPlayerQuery).data;
  const data = useMemo(() => [...(entries.data ?? [])], [entries.data]);
  const table = useTable({ features, columns, data });
  if (entries.isPending) return <Spinner label="Reading the board" />;
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
                className={`border-b-2 border-dashed border-ink/20 last:border-0 ${row.original.playerId === current?.id ? "bg-marker/25" : ""}`}
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

const PlayerName = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1, { message: "Give the player a name." })),
  Schema.check(Schema.isMaxLength(24, { message: "24 characters at most." })),
);

export const PlayersBar = () => {
  const players = useQuery(playersQuery).data ?? [];
  const current = useQuery(currentPlayerQuery).data;
  const select = useMutation({ mutationFn: actions.selectPlayer });
  const create = useMutation({ mutationFn: actions.createPlayer });
  const [adding, setAdding] = useState(false);
  const play = useSound();
  const form = useForm({
    defaultValues: { name: "" },
    validators: { onChange: Schema.toStandardSchemaV1(Schema.Struct({ name: PlayerName })) },
    onSubmit: async ({ value, formApi }) => {
      await create.mutateAsync(value.name.trim());
      formApi.reset();
      setAdding(false);
    },
  });
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
            select.mutate(player.id);
          }}
          className={`press cursor-pointer rounded-full border-[2.5px] border-ink px-3 py-1 font-bold shadow-hard-sm ${player.id === current?.id ? "bg-ink text-paper" : "bg-card"}`}
        >
          {player.name}
        </button>
      ))}
      <Button size="sm" icon="plus" onClick={() => setAdding(true)}>
        Player
      </Button>
      <Modal
        open={adding}
        onClose={() => {
          create.reset();
          setAdding(false);
        }}
        label="Add a player"
      >
        <Card className="p-6">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <p className="font-display text-2xl font-extrabold">Who's playing?</p>
            <form.Field name="name">
              {(field) => (
                <>
                  <input
                    autoFocus
                    value={field.state.value}
                    maxLength={24}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="Name"
                    aria-label="Player name"
                    className="mt-4 h-12 w-full rounded-xl border-[2.5px] border-ink bg-card px-3 text-lg font-bold shadow-hard-sm outline-none"
                  />
                  {field.state.meta.isTouched && field.state.meta.errors[0] && (
                    <p className="mt-2 font-bold text-danger">
                      {String(field.state.meta.errors[0].message)}
                    </p>
                  )}
                </>
              )}
            </form.Field>
            {create.isError && (
              <p className="mt-2 font-bold text-danger">That name is already on the board.</p>
            )}
            <div className="mt-5 flex gap-2">
              <form.Subscribe selector={(state) => state.canSubmit && !state.isSubmitting}>
                {(canSubmit) => (
                  <Button type="submit" tone="ink" disabled={!canSubmit}>
                    Add and switch
                  </Button>
                )}
              </form.Subscribe>
              <Button onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      </Modal>
    </div>
  );
};
