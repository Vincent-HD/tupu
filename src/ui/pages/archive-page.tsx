import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";
import { monthDays, parseIsoDate, weekdayOf } from "../../domain/calendar.ts";
import { dailyDifficulty, difficultyLabels } from "../../domain/difficulty.ts";
import { formatDuration } from "../../domain/score.ts";
import { dailiesAtom, startGameAtom, todayAtom } from "../atoms.ts";
import { Card, IconButton, Loaded, SectionTitle } from "../components/ui.tsx";
import { useSound } from "../hooks/use-sound.ts";
import { navigate } from "../router.ts";
import { detach } from "../detach.ts";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const ArchivePage = () => {
  const today = useAtomValue(todayAtom);
  return <Loaded result={today}>{(value) => <Calendar today={value.date} />}</Loaded>;
};

const Calendar = ({ today }: { today: string }) => {
  const current = parseIsoDate(today);
  const [cursor, setCursor] = useState({ year: current.year, month: current.month });
  const days = monthDays(cursor.year, cursor.month);
  const first = days[0] ?? today;
  const last = days.at(-1) ?? today;
  const games = AsyncResult.getOrElse(useAtomValue(dailiesAtom(`${first}|${last}`)), () => []);
  const start = useAtomSet(startGameAtom, { mode: "promise" });
  const play = useSound();
  const offset = (weekdayOf(first) + 6) % 7;
  const shift = (delta: number) => {
    play("page");
    setCursor((value) => {
      const month = value.month + delta;
      return month < 1
        ? { year: value.year - 1, month: 12 }
        : month > 12
          ? { year: value.year + 1, month: 1 }
          : { year: value.year, month };
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
        <IconButton icon="back" label="Back home" onClick={() => navigate({ page: "home" })} />
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
            const future = date > today;
            return (
              <button
                key={date}
                type="button"
                disabled={future}
                onClick={detach(async () => {
                  play("page");
                  navigate({ page: "play", id: await start({ mode: "daily", date }) });
                })}
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
