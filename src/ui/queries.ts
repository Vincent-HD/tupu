import { queryOptions } from "@tanstack/react-query";
import { Effect, Option } from "effect";
import { today, weekdayOf } from "../domain/calendar.ts";
import { dailyDifficulty, difficulties } from "../domain/difficulty.ts";
import { generatePuzzle } from "../domain/generator.ts";
import { Backup } from "../services/backup.ts";
import { Games, type GameSnapshot, type StartGame } from "../services/games.ts";
import { Leaderboard, type LeaderboardCategory } from "../services/leaderboard.ts";
import { Players } from "../services/players.ts";
import { SettingsStore, type Settings } from "../services/settings.ts";
import { Sound, type PlayInput } from "../services/sound.ts";
import { Stats } from "../services/stats.ts";
import { runtime } from "./runtime.ts";

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: () => runtime.runPromise(Effect.flatMap(SettingsStore, (store) => store.get)),
});

export const currentPlayerQuery = queryOptions({
  queryKey: ["players", "current"],
  queryFn: () => runtime.runPromise(Effect.flatMap(Players, (players) => players.current)),
});

export const playersQuery = queryOptions({
  queryKey: ["players", "list"],
  queryFn: () => runtime.runPromise(Effect.flatMap(Players, (players) => players.list)),
});

export const todayQuery = queryOptions({
  queryKey: ["today"],
  queryFn: () =>
    runtime.runPromise(
      Effect.map(today, (date) => ({ date, difficulty: dailyDifficulty(weekdayOf(date)) })),
    ),
});

export const inProgressQuery = queryOptions({
  queryKey: ["games", "in-progress"],
  queryFn: () => runtime.runPromise(Effect.flatMap(Games, (games) => games.inProgress)),
});

export const gameQuery = (id: string) =>
  queryOptions({
    queryKey: ["games", "record", id],
    queryFn: () => runtime.runPromise(Effect.flatMap(Games, (games) => games.get(id))),
  });

export const standingQuery = (id: string) =>
  queryOptions({
    queryKey: ["games", "standing", id],
    queryFn: () =>
      runtime.runPromise(
        Effect.flatMap(Games, (games) => games.standing(id)).pipe(Effect.map(Option.getOrNull)),
      ),
  });

export const dailiesQuery = (range: { readonly from: string; readonly to: string }) =>
  queryOptions({
    queryKey: ["games", "dailies", range.from, range.to],
    queryFn: () => runtime.runPromise(Effect.flatMap(Games, (games) => games.dailies(range))),
  });

export const statsQuery = queryOptions({
  queryKey: ["stats"],
  queryFn: () => runtime.runPromise(Effect.flatMap(Stats, (stats) => stats.current)),
});

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

export const parseCategory = (key: string): LeaderboardCategory => {
  const [kind, first = "", second = ""] = key.split(":");
  if (kind === "daily") return { kind: "daily", date: first };
  if (kind === "custom") return { kind: "custom", size: Number(first), level: Number(second) };
  return {
    kind: "difficulty",
    difficulty: difficulties.find((value) => value === first) ?? "easy",
  };
};

export const leaderboardQuery = (key: string) =>
  queryOptions({
    queryKey: ["leaderboard", "top", key],
    queryFn: () =>
      runtime.runPromise(
        Effect.flatMap(Leaderboard, (board) =>
          board.top({ category: parseCategory(key), limit: 10 }),
        ),
      ),
  });

export const customCategoriesQuery = queryOptions({
  queryKey: ["leaderboard", "custom-categories"],
  queryFn: () => runtime.runPromise(Effect.flatMap(Leaderboard, (board) => board.customCategories)),
});

export const tutorialQuery = queryOptions({
  queryKey: ["tutorial"],
  queryFn: () =>
    runtime.runPromise(
      generatePuzzle({ size: 4, level: 2, density: "balanced", seed: "tupu-tutorial" }),
    ),
});

const pendingWrites = new Set<Promise<unknown>>();

const tracked = <A>(promise: Promise<A>): Promise<A> => {
  pendingWrites.add(promise);
  const forget = () => pendingWrites.delete(promise);
  promise.then(forget, forget);
  return promise;
};

export const settleWrites = () => Promise.allSettled(pendingWrites);

export const actions = {
  updateSettings: (patch: Partial<Settings>) =>
    tracked(
      runtime.runPromise(
        Effect.gen(function* () {
          const next = yield* (yield* SettingsStore).update(patch);
          yield* (yield* Sound).configure({ enabled: next.sound, volume: next.volume });
          return next;
        }),
      ),
    ),
  configureSound: (input: { readonly enabled: boolean; readonly volume: number }) =>
    runtime.runFork(Effect.flatMap(Sound, (sound) => sound.configure(input))),
  play: (input: PlayInput) => runtime.runFork(Effect.flatMap(Sound, (sound) => sound.play(input))),
  startGame: (input: StartGame) =>
    tracked(runtime.runPromise(Effect.flatMap(Games, (games) => games.start(input)))),
  saveGame: (snapshot: GameSnapshot) =>
    tracked(runtime.runPromise(Effect.flatMap(Games, (games) => games.save(snapshot)))),
  completeGame: (snapshot: GameSnapshot) =>
    tracked(runtime.runPromise(Effect.flatMap(Games, (games) => games.complete(snapshot)))),
  removeGame: (id: string) =>
    tracked(runtime.runPromise(Effect.flatMap(Games, (games) => games.remove(id)))),
  createPlayer: (name: string) =>
    tracked(
      runtime.runPromise(
        Effect.gen(function* () {
          const players = yield* Players;
          const player = yield* players.create(name);
          yield* players.select(player.id);
          return player;
        }),
      ),
    ),
  selectPlayer: (id: string) =>
    tracked(runtime.runPromise(Effect.flatMap(Players, (players) => players.select(id)))),
  renamePlayer: (input: { readonly id: string; readonly name: string }) =>
    tracked(runtime.runPromise(Effect.flatMap(Players, (players) => players.rename(input)))),
  exportBackup: () => runtime.runPromise(Effect.flatMap(Backup, (backup) => backup.snapshot)),
  restoreBackup: (bytes: Uint8Array) =>
    tracked(runtime.runPromise(Effect.flatMap(Backup, (backup) => backup.restore(bytes)))),
};
