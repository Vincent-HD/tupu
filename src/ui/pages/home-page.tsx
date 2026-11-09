import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { formatLongDate } from "../../domain/calendar.ts";
import {
  asDifficulty,
  asLevel,
  difficulties,
  difficultyLabels,
  levelLabels,
  presets,
  type Difficulty,
} from "../../domain/difficulty.ts";
import { formatDuration } from "../../domain/score.ts";
import type { GameSummary, StartGame } from "../../services/games.ts";
import { actions, dailiesQuery, inProgressQuery, statsQuery, todayQuery } from "../queries.ts";
import { Icon, type IconName } from "../components/icons.tsx";
import {
  Button,
  Card,
  Chip,
  IconButton,
  SectionTitle,
  toneClasses,
  type Tone,
} from "../components/ui.tsx";
import { useSound } from "../hooks/use-sound.ts";

const difficultyTone: Readonly<Record<Difficulty, Tone>> = {
  easy: "mint",
  medium: "sky",
  tricky: "tangerine",
  hard: "rose",
  expert: "lilac",
};

const difficultyBlurb: Readonly<Record<Difficulty, string>> = {
  easy: "Plenty of clues, one layer at a time.",
  medium: "Same logic, far fewer clues.",
  tricky: "Numbers and colors start talking.",
  hard: "Hunt down the last unplaced pairs.",
  expert: "A 7×7 sheet for long coffees.",
};

export const HomePage = () => {
  const today = useSuspenseQuery(todayQuery).data;
  const play = useSound();
  const navigate = useNavigate();
  const start = useMutation({
    mutationFn: (input: { readonly key: string; readonly game: StartGame }) =>
      actions.startGame(input.game),
    onMutate: () => play("page"),
    onSuccess: (gameId) => navigate({ to: "/play/$gameId", params: { gameId } }),
  });
  const starting = start.isPending ? start.variables.key : null;
  const launch = (key: string, game: StartGame) => start.mutate({ key, game });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <section className="grid gap-6 md:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col justify-center">
          <p className="text-sm font-bold tracking-[0.25em] text-ink-soft uppercase">
            A two-layer logic puzzle
          </p>
          <h1 className="mt-2 font-display text-4xl leading-[0.95] font-extrabold tracking-tight sm:text-6xl">
            Every number.
            <br />
            Every color.
            <br />
            <span className="relative inline-block">
              <span className="absolute inset-x-0 bottom-1 h-4 -rotate-1 bg-marker" />
              <span className="relative">Every pair once.</span>
            </span>
          </h1>
          <p className="mt-4 max-w-md text-base text-ink-soft sm:text-lg">
            Fill each tile with a number and a color. Rows and columns never repeat either, and no
            two tiles share the same combination. Play as much as you like: it all lives on this
            device.
          </p>
        </div>
        <DailyCard
          date={today.date}
          difficulty={today.difficulty}
          busy={starting === "daily"}
          onPlay={() => launch("daily", { mode: "daily", date: today.date })}
        />
      </section>

      <ContinueSection />

      <section>
        <SectionTitle kicker="Unlimited">Quick play</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {difficulties.map((difficulty, index) => (
            <button
              key={difficulty}
              type="button"
              disabled={starting !== null}
              onClick={() => launch(difficulty, { mode: "quick", difficulty })}
              className={`press group relative flex cursor-pointer flex-col items-start rounded-2xl border-[2.5px] border-ink p-4 text-left shadow-hard ${toneClasses[difficultyTone[difficulty]]} ${index % 2 ? "rotate-[0.5deg]" : "-rotate-[0.5deg]"}`}
            >
              <span className="flex w-full items-center justify-between">
                <span className="font-display text-2xl font-extrabold">
                  {difficultyLabels[difficulty]}
                </span>
                <span className="rounded-md border-2 border-ink bg-card px-1.5 text-sm font-bold">
                  {presets[difficulty].size}×{presets[difficulty].size}
                </span>
              </span>
              <span className="mt-2 text-sm leading-snug">{difficultyBlurb[difficulty]}</span>
              <span className="mt-3 text-xs font-bold tracking-wide uppercase opacity-70">
                {levelLabels[presets[difficulty].level]}
              </span>
              {starting === difficulty && (
                <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-card/80 font-bold">
                  Shuffling…
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NavCard
          to="/custom"
          icon="sliders"
          tone="marker"
          title="Custom puzzle"
          text="Pick the size, the logic and the clue density. Share a seed with friends."
        />
        <NavCard
          to="/archive"
          icon="calendar"
          tone="sky"
          title="Daily archive"
          text="Every past daily, unlocked. Fill in the gaps of your calendar."
        />
        <NavCard
          to="/tutorial"
          icon="sparkle"
          tone="mint"
          title="Guided tutorial"
          text="Solve a small board step by step with explanations."
        />
        <NavCard
          to="/stats"
          icon="chart"
          tone="lilac"
          title="Your stats"
          text="Streaks, best times and how you solve."
        />
        <NavCard
          to="/leaderboard"
          icon="trophy"
          tone="tangerine"
          title="Leaderboard"
          text="Local players race on the same boards."
        />
        <NavCard
          to="/rules"
          icon="book"
          tone="rose"
          title="How to play"
          text="Three rules and four kinds of deduction."
        />
      </section>

      <StatsStrip />
    </div>
  );
};

const DailyCard = ({
  date,
  difficulty,
  busy,
  onPlay,
}: {
  date: string;
  difficulty: Difficulty;
  busy: boolean;
  onPlay: () => void;
}) => {
  const entries = useQuery(dailiesQuery({ from: date, to: date })).data ?? [];
  const solved = entries.filter((game) => game.status === "solved");
  const best = solved.reduce<GameSummary | undefined>(
    (current, game) =>
      current === undefined || game.elapsed_ms < current.elapsed_ms ? game : current,
    undefined,
  );
  const playing = entries.find((game) => game.status === "playing");
  return (
    <Card tone="paper" tilt="right" className="ruled flex flex-col p-6">
      <span className="tape -top-3 right-8" />
      <p className="text-sm font-bold tracking-[0.2em] text-ink-soft uppercase">Today's puzzle</p>
      <p className="mt-1 font-display text-3xl font-extrabold">{formatLongDate(date)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip tone={difficultyTone[difficulty]}>{difficultyLabels[difficulty]}</Chip>
        <Chip>
          {presets[difficulty].size}×{presets[difficulty].size}
        </Chip>
        {best && <Chip tone="mint">Solved · {formatDuration(best.elapsed_ms)}</Chip>}
      </div>
      <div className="mt-auto pt-6">
        <Button
          tone="ink"
          size="lg"
          icon="play"
          disabled={busy}
          onClick={onPlay}
          className="w-full"
        >
          {busy ? "Shuffling…" : playing ? "Continue" : best ? "Play again" : "Play today's puzzle"}
        </Button>
      </div>
    </Card>
  );
};

const ContinueSection = () => {
  const games = useSuspenseQuery(inProgressQuery).data;
  const remove = useMutation({ mutationFn: actions.removeGame });
  if (games.length === 0) return null;
  return (
    <section>
      <SectionTitle kicker="Unfinished">Pick up where you left off</SectionTitle>
      <div className="flex gap-4 overflow-x-auto pt-1 pr-2 pb-3 pl-1">
        {games.slice(0, 8).map((game) => (
          <Card key={game.id} className="flex w-60 shrink-0 flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-lg font-extrabold">
                  {game.mode === "daily"
                    ? `Daily ${game.daily_date}`
                    : game.mode === "quick"
                      ? "Quick play"
                      : "Custom"}
                </p>
                <p className="text-sm text-ink-soft">
                  {`${labelFor(game)} · ${game.size}×${game.size} · ${formatDuration(game.elapsed_ms)}`}
                </p>
              </div>
              <IconButton
                icon="trash"
                label="Discard"
                className="size-9 text-base"
                onClick={() => remove.mutate(game.id)}
              />
            </div>
            <Link
              to="/play/$gameId"
              params={{ gameId: game.id }}
              className="press inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border-[2.5px] border-ink bg-marker px-3 text-sm font-bold shadow-hard"
            >
              <Icon name="play" /> Continue
            </Link>
          </Card>
        ))}
      </div>
    </section>
  );
};

type NavPath = "/custom" | "/archive" | "/tutorial" | "/stats" | "/leaderboard" | "/rules";

const NavCard = ({
  to,
  icon,
  tone,
  title,
  text,
}: {
  to: NavPath;
  icon: IconName;
  tone: Tone;
  title: string;
  text: string;
}) => (
  <Link
    to={to}
    className="press flex items-start gap-4 rounded-2xl border-[2.5px] border-ink bg-card p-4 shadow-hard"
  >
    <span
      className={`flex size-12 shrink-0 items-center justify-center rounded-xl border-[2.5px] border-ink text-2xl ${toneClasses[tone]}`}
    >
      <Icon name={icon} />
    </span>
    <span>
      <span className="block font-display text-xl font-extrabold">{title}</span>
      <span className="block text-sm text-ink-soft">{text}</span>
    </span>
  </Link>
);

const StatsStrip = () => {
  const stats = useQuery(statsQuery).data;
  if (!stats || stats.solved === 0) return null;
  return (
    <Link
      to="/stats"
      className="press grid grid-cols-2 gap-3 rounded-2xl border-[2.5px] border-ink bg-ink p-4 text-paper shadow-hard sm:grid-cols-4"
    >
      {[
        ["Solved", `${stats.solved}`],
        ["Clean solves", `${stats.perfect}`],
        ["Daily streak", `${stats.currentStreak}`],
        ["Time played", formatDuration(stats.totalTimeMs)],
      ].map(([label, value]) => (
        <div key={label}>
          <p className="text-xs font-bold tracking-widest uppercase opacity-70">{label}</p>
          <p className="font-display text-3xl font-extrabold tabular-nums">{value}</p>
        </div>
      ))}
    </Link>
  );
};

const labelFor = (game: GameSummary) => {
  const difficulty = asDifficulty(game.difficulty);
  return difficulty ? difficultyLabels[difficulty] : levelLabels[asLevel(game.level)];
};
