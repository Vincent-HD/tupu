import { queryOptions } from "@tanstack/react-query";
import { Effect, Option } from "effect";
import type { LeaderboardCategory } from "../api/rpc.ts";
import { today, weekdayOf } from "../domain/calendar.ts";
import { dailyDifficulty, difficulties } from "../domain/difficulty.ts";
import { generatePuzzle } from "../domain/generator.ts";
import { AccountStore } from "../services/account-store.ts";
import { Api } from "../services/api.ts";
import { AuthClient } from "../services/auth-client.ts";
import { Games, type GameSnapshot, type StartGame } from "../services/games.ts";
import { SettingsStore, type Settings } from "../services/settings.ts";
import { Sound, type PlayInput } from "../services/sound.ts";
import { Stats } from "../services/stats.ts";
import { Sync } from "../services/sync.ts";
import { runtime } from "./runtime.ts";

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: () => runtime.runPromise(Effect.flatMap(SettingsStore, (store) => store.get)),
});

export const accountQuery = queryOptions({
  queryKey: ["account"],
  queryFn: () =>
    runtime.runPromise(
      Effect.flatMap(AccountStore, (accounts) => accounts.account).pipe(
        Effect.map(Option.getOrNull),
      ),
    ),
});

export const syncQuery = queryOptions({
  queryKey: ["sync"],
  queryFn: () =>
    runtime.runPromise(
      Effect.flatMap(Sync, (sync) => Effect.all({ state: sync.state, pending: sync.pending })),
    ),
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
    queryKey: ["leaderboard", "standing", id],
    queryFn: () =>
      runtime.runPromise(
        Effect.gen(function* () {
          yield* (yield* Sync).run;
          return yield* (yield* Api).Standing({ gameId: id });
        }).pipe(Effect.orElseSucceed(() => null)),
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
        Effect.flatMap(Api, (api) => api.Leaderboard({ category: parseCategory(key), limit: 10 })),
      ),
  });

export const customCategoriesQuery = queryOptions({
  queryKey: ["leaderboard", "custom-categories"],
  queryFn: () =>
    runtime.runPromise(
      Effect.flatMap(Api, (api) => api.CustomBoards()).pipe(Effect.orElseSucceed(() => [])),
    ),
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
  sendCode: (email: string) =>
    runtime.runPromise(Effect.flatMap(AuthClient, (auth) => auth.sendCode(email))),
  verifyCode: (input: { readonly email: string; readonly code: string }) =>
    tracked(runtime.runPromise(Effect.flatMap(AuthClient, (auth) => auth.verifyCode(input)))),
  signInWithPasskey: () =>
    tracked(runtime.runPromise(Effect.flatMap(AuthClient, (auth) => auth.signInWithPasskey))),
  addPasskey: () => runtime.runPromise(Effect.flatMap(AuthClient, (auth) => auth.addPasskey)),
  rename: (name: string) =>
    tracked(
      runtime.runPromise(
        Effect.gen(function* () {
          const account = yield* (yield* Api).Rename({ name });
          yield* (yield* AccountStore).rename(account);
        }),
      ),
    ),
  syncNow: () => runtime.runPromise(Effect.flatMap(Sync, (sync) => sync.run)),
  signOut: () =>
    tracked(
      runtime.runPromise(
        Effect.gen(function* () {
          yield* (yield* Sync).run;
          yield* (yield* AuthClient).signOut;
        }),
      ),
    ),
};
