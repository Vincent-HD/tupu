import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { monthDays, parseIsoDate, weekdayOf } from "../../domain/calendar.ts";
import { dailyDifficulty, difficultyLabels } from "../../domain/difficulty.ts";
import { formatDuration } from "../../domain/score.ts";
import { Card, IconButton, SectionTitle } from "../components/ui.tsx";
import { useSound } from "../hooks/use-sound.ts";
import { actions, dailiesQuery, todayQuery } from "../queries.ts";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const monthKey = (cursor: { readonly year: number; readonly month: number }) =>
  `${cursor.year}-${String(cursor.month).padStart(2, "0")}`;

const parseMonth = (
  value: string | undefined,
  fallback: { readonly year: number; readonly month: number },
) => {
  const match = value ? /^(\d{4})-(\d{2})$/.exec(value) : null;
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  return match && month >= 1 && month <= 12 ? { year, month } : fallback;
};

export const ArchivePage = ({ month }: { month: string | undefined }) => {
  const today = useSuspenseQuery(todayQuery).data.date;
  const navigate = useNavigate();
  const play = useSound();
  const current = parseIsoDate(today);
  const latest = { year: current.year, month: current.month };
  const parsed = parseMonth(month, latest);
  const cursor = monthKey(parsed) > monthKey(latest) ? latest : parsed;
  const days = monthDays(cursor.year, cursor.month);
  const first = days[0] ?? today;
  const last = days.at(-1) ?? today;
  const games = useQuery(dailiesQuery({ from: first, to: last })).data ?? [];
  const start = useMutation({
    mutationFn: actions.startGame,
    onMutate: () => play("page"),
    onSuccess: (gameId) => navigate({ to: "/play/$gameId", params: { gameId } }),
  });
  const offset = (weekdayOf(first) + 6) % 7;
  const shift = (delta: number) => {
    play("page");
    const index = cursor.year * 12 + (cursor.month - 1) + delta;
    void navigate({
      to: "/archive",
      search: { month: monthKey({ year: Math.floor(index / 12), month: (index % 12) + 1 }) },
      replace: true,
    });
  };
  const isCurrentMonth = cursor.year === current.year && cursor.month === current.month;
  const monthName = new Date(Date.UTC(cursor.year, cursor.month - 1, 15)).toLocaleDateString(
    undefined,
    {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  );
  const solvedCount = new Set(
    games.filter((game) => game.status === "solved").map((game) => game.daily_date),
  ).size;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <IconButton icon="back" label="Back home" onClick={() => void navigate({ to: "/" })} />
        <SectionTitle kicker="Every day unlocked">Daily archive</SectionTitle>
      </div>
      <Card className="p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <IconButton icon="chevronLeft" label="Previous month" onClick={() => shift(-1)} />
          <div className="text-center">
            <p className="font-display text-2xl font-extrabold capitalize">{monthName}</p>
            <p className="text-sm font-bold text-ink-soft">{solvedCount} solved this month</p>
          </div>
          <IconButton
            icon="chevronRight"
            label="Next month"
            disabled={isCurrentMonth}
            onClick={() => shift(1)}
          />
        </div>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
          {weekdays.map((day) => (
            <p
              key={day}
              className="text-center text-xs font-bold tracking-wide text-ink-soft uppercase"
            >
              {day}
            </p>
          ))}
          {Array.from({ length: offset }, (_, index) => (
            <span key={`blank-${index}`} />
          ))}
          {days.map((date) => {
            const entries = games.filter((game) => game.daily_date === date);
            const solved = entries.filter((game) => game.status === "solved");
            const best = solved.length ? Math.min(...solved.map((game) => game.elapsed_ms)) : null;
            const playing = entries.some((game) => game.status === "playing");
            const difficulty = dailyDifficulty(weekdayOf(date));
            return (
              <button
                key={date}
                type="button"
                disabled={date > today || start.isPending}
                onClick={() => start.mutate({ mode: "daily", date })}
                className={`press relative flex aspect-square cursor-pointer flex-col items-start justify-between rounded-xl border-[2.5px] border-ink p-1.5 text-left shadow-hard-sm disabled:cursor-not-allowed disabled:opacity-35 sm:p-2 ${
                  best !== null ? "bg-mint" : playing ? "bg-marker" : "bg-card"
                } ${date === today ? "outline-[3px] outline-offset-2 outline-ink" : ""}`}
              >
                <span className="font-display text-lg leading-none font-extrabold sm:text-2xl">
                  {parseIsoDate(date).day}
                </span>
                <span className="hidden text-[11px] leading-tight font-bold sm:block">
                  {best !== null
                    ? formatDuration(best)
                    : playing
                      ? "in progress"
                      : difficultyLabels[difficulty]}
                </span>
                {best !== null && (
                  <span className="absolute top-1 right-1.5 text-sm font-extrabold">✓</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-5 text-sm text-ink-soft">
          Difficulty follows the week: Monday easy, Tuesday and Wednesday medium, Thursday and
          Friday tricky, Saturday hard, Sunday expert.
        </p>
      </Card>
    </div>
  );
};
