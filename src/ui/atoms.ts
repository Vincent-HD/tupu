import { Effect } from "effect";
import { Atom } from "effect/reactivity";
import { today } from "../domain/calendar.ts";
import { dailyDifficulty } from "../domain/difficulty.ts";
import { weekdayOf } from "../domain/calendar.ts";
import { generatePuzzle } from "../domain/generator.ts";
import { Backup } from "../services/backup.ts";
import { Games, gamesReactivityKey, type GameSnapshot, type StartGame } from "../services/games.ts";
import {
  Leaderboard,
  leaderboardReactivityKey,
  type LeaderboardCategory,
} from "../services/leaderboard.ts";
import { Players, playersReactivityKey } from "../services/players.ts";
import { SettingsStore, settingsReactivityKey, type Settings } from "../services/settings.ts";
import { Sound, type PlayInput } from "../services/sound.ts";
import { Stats } from "../services/stats.ts";
import { runtime } from "./runtime.ts";

export const settingsAtom = runtime
  .atom(Effect.flatMap(SettingsStore, (store) => store.get))
  .pipe(Atom.withReactivity([settingsReactivityKey]), Atom.keepAlive);

export const updateSettingsAtom = runtime.fn((patch: Partial<Settings>) =>
  Effect.gen(function* () {
    const store = yield* SettingsStore;
    const sound = yield* Sound;
    const next = yield* store.update(patch);
    yield* sound.configure({ enabled: next.sound, volume: next.volume });
    return next;
  }),
);

export const configureSoundAtom = runtime.fn(
  (input: { readonly enabled: boolean; readonly volume: number }) =>
    Effect.flatMap(Sound, (sound) => sound.configure(input)),
);

export const playAtom = runtime.fn(
  (input: PlayInput) => Effect.flatMap(Sound, (sound) => sound.play(input)),
  {
    concurrent: true,
  },
);

export const currentPlayerAtom = runtime
  .atom(Effect.flatMap(Players, (players) => players.current))
  .pipe(Atom.withReactivity([playersReactivityKey, settingsReactivityKey]));

export const playersAtom = runtime
  .atom(Effect.flatMap(Players, (players) => players.list))
  .pipe(Atom.withReactivity([playersReactivityKey]));

export const createPlayerAtom = runtime.fn((name: string) =>
  Effect.gen(function* () {
    const players = yield* Players;
    const player = yield* players.create(name);
    yield* players.select(player.id);
    return player;
  }),
);

export const selectPlayerAtom = runtime.fn((id: string) =>
  Effect.flatMap(Players, (players) => players.select(id)),
);

export const renamePlayerAtom = runtime.fn(
  (input: { readonly id: string; readonly name: string }) =>
    Effect.flatMap(Players, (players) => players.rename(input)),
);

export const todayAtom = runtime.atom(
  Effect.map(today, (date) => ({ date, difficulty: dailyDifficulty(weekdayOf(date)) })),
);

export const inProgressAtom = runtime
  .atom(Effect.flatMap(Games, (games) => games.inProgress))
  .pipe(Atom.withReactivity([gamesReactivityKey, playersReactivityKey]));

export const gameAtom = Atom.family((id: string) =>
  runtime.atom(Effect.flatMap(Games, (games) => games.get(id))),
);

export const dailiesAtom = Atom.family((range: string) => {
  const [from = "", to = ""] = range.split("|");
  return runtime
    .atom(Effect.flatMap(Games, (games) => games.dailies({ from, to })))
    .pipe(Atom.withReactivity([gamesReactivityKey, playersReactivityKey]));
});

export const startGameAtom = runtime.fn((input: StartGame) =>
  Effect.flatMap(Games, (games) => games.start(input)),
);

export const saveGameAtom = runtime.fn((snapshot: GameSnapshot) =>
  Effect.sleep("350 millis").pipe(
    Effect.andThen(Effect.flatMap(Games, (games) => games.save(snapshot))),
  ),
);

export const completeGameAtom = runtime.fn((snapshot: GameSnapshot) =>
  Effect.flatMap(Games, (games) => games.complete(snapshot)),
);

export const removeGameAtom = runtime.fn((id: string) =>
  Effect.flatMap(Games, (games) => games.remove(id)),
);

export const statsAtom = runtime
  .atom(Effect.flatMap(Stats, (stats) => stats.current))
  .pipe(Atom.withReactivity([gamesReactivityKey, playersReactivityKey, "stats"]));

export const leaderboardAtom = Atom.family((key: string) => {
  const category = parseCategory(key);
  return runtime
    .atom(Effect.flatMap(Leaderboard, (board) => board.top({ category, limit: 10 })))
    .pipe(
      Atom.withReactivity([leaderboardReactivityKey, gamesReactivityKey, playersReactivityKey]),
    );
});

export const customCategoriesAtom = runtime
  .atom(Effect.flatMap(Leaderboard, (board) => board.customCategories))
  .pipe(Atom.withReactivity([leaderboardReactivityKey, gamesReactivityKey]));

export const categoryKey = (category: LeaderboardCategory) => {
  switch (category.kind) {
    case "difficulty":
      return `difficulty:${category.difficulty}`;
    case "daily":
      return `daily:${category.date}`;
    case "custom":
      return `custom:${category.size}:${category.level}`;
  }
};

const parseCategory = (key: string): LeaderboardCategory => {
  const [kind, first = "", second = ""] = key.split(":");
  if (kind === "daily") return { kind: "daily", date: first };
  if (kind === "custom") return { kind: "custom", size: Number(first), level: Number(second) };
  const difficulty = (["easy", "medium", "tricky", "hard", "expert"] as const).find(
    (value) => value === first,
  );
  return { kind: "difficulty", difficulty: difficulty ?? "easy" };
};

export const exportBackupAtom = runtime.fn(() =>
  Effect.flatMap(Backup, (backup) => backup.snapshot),
);

export const restoreBackupAtom = runtime.fn((bytes: Uint8Array) =>
  Effect.flatMap(Backup, (backup) => backup.restore(bytes)),
);

export const tutorialAtom = runtime.atom(
  generatePuzzle({ size: 4, level: 2, density: "balanced", seed: "tupu-tutorial" }),
);
