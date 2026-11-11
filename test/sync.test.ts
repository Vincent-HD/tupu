import { describe, expect, it } from "@effect/vitest";
import { Context, Effect, Layer, Option } from "effect";
import { Database } from "../src/db/database.ts";
import { dailyGameId } from "../src/domain/game.ts";
import { AccountStore } from "../src/services/account-store.ts";
import { Api } from "../src/services/api.ts";
import { Games } from "../src/services/games.ts";
import { Stats } from "../src/services/stats.ts";
import { Sync } from "../src/services/sync.ts";
import {
  deviceLayer,
  makeServer,
  signInWithCode,
  signUp,
  solve,
  tick,
  type Device,
} from "./support/harness.ts";

const email = "ada@example.com";

// One account signed in on two devices. Devices only talk to the server when a
// test calls `sync`, so everything in between is offline.
const withTwoDevices = <A, E>(
  program: (devices: {
    readonly a: Context.Context<Device>;
    readonly b: Context.Context<Device>;
    readonly fresh: Effect.Effect<Context.Context<Device>>;
  }) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const server = yield* makeServer;
    const scope = yield* Effect.scope;
    const fresh = Layer.buildWithScope(deviceLayer(server), scope).pipe(Effect.orDie);
    const a = yield* fresh;
    const b = yield* fresh;
    yield* signUp({ server, email, name: "Ada" }).pipe(Effect.provide(a), Effect.orDie);
    yield* signInWithCode({ server, email }).pipe(Effect.provide(b), Effect.orDie);
    return yield* program({
      a,
      b,
      fresh: Effect.tap(fresh, (device) =>
        signInWithCode({ server, email }).pipe(Effect.provide(device), Effect.orDie),
      ),
    });
  }).pipe(Effect.scoped);

const sync = Effect.flatMap(Sync, (service) => service.run);
const pending = Effect.flatMap(Sync, (service) => service.pending);
const local = (id: string) => Effect.option(Effect.flatMap(Games, (games) => games.get(id)));

const play = (id: string, elapsedMs: number) =>
  Effect.flatMap(Games, (games) =>
    Effect.gen(function* () {
      const game = yield* games.get(id);
      yield* games.save({
        id,
        progress: game.progress,
        moves: [...game.moves, { at: elapsedMs, cell: 0, layer: "number", value: null }],
        elapsedMs,
        hints: 0,
        checks: 0,
      });
    }),
  );

describe("offline play and reconciliation", () => {
  it.live("an offline solve beats a newer unfinished copy from another device", () =>
    withTwoDevices(({ a, b }) =>
      Effect.gen(function* () {
        const daily = dailyGameId("2026-11-09");
        yield* Effect.flatMap(Games, (games) =>
          games.start({ mode: "daily", date: "2026-11-09" }),
        ).pipe(Effect.provide(a));
        yield* Effect.flatMap(Games, (games) =>
          games.start({ mode: "daily", date: "2026-11-09" }),
        ).pipe(Effect.provide(b));
        yield* solve(daily).pipe(Effect.provide(a));
        yield* tick;
        yield* play(daily, 5000).pipe(Effect.provide(b));

        yield* sync.pipe(Effect.provide(b));
        yield* sync.pipe(Effect.provide(a));
        yield* sync.pipe(Effect.provide(b));

        for (const device of [a, b]) {
          const game = yield* local(daily).pipe(Effect.provide(device));
          expect(Option.map(game, (found) => found.status)).toEqual(Option.some("solved"));
          expect(yield* pending.pipe(Effect.provide(device))).toBe(0);
        }
        const standing = yield* Effect.flatMap(Api, (api) => api.Standing({ gameId: daily })).pipe(
          Effect.provide(b),
        );
        expect(standing).toMatchObject({ rank: 1, entries: 1 });
      }),
    ),
  );

  it.live("the most recent unfinished version wins, whichever device syncs first", () =>
    withTwoDevices(({ a, b }) =>
      Effect.gen(function* () {
        const id = yield* Effect.flatMap(Games, (games) =>
          games.start({ mode: "quick", difficulty: "easy" }),
        ).pipe(Effect.provide(a));
        yield* sync.pipe(Effect.provide(a));
        yield* sync.pipe(Effect.provide(b));

        yield* play(id, 1000).pipe(Effect.provide(a));
        yield* tick;
        yield* play(id, 2000).pipe(Effect.provide(b));

        yield* sync.pipe(Effect.provide(b));
        yield* sync.pipe(Effect.provide(a));

        for (const device of [a, b]) {
          const game = yield* local(id).pipe(Effect.provide(device));
          expect(Option.map(game, (found) => found.elapsedMs)).toEqual(Option.some(2000));
          expect(yield* pending.pipe(Effect.provide(device))).toBe(0);
        }
      }),
    ),
  );

  it.live("a deleted game disappears everywhere and does not come back", () =>
    withTwoDevices(({ a, b }) =>
      Effect.gen(function* () {
        const id = yield* Effect.flatMap(Games, (games) =>
          games.start({ mode: "quick", difficulty: "easy" }),
        ).pipe(Effect.provide(a));
        yield* sync.pipe(Effect.provide(a));
        yield* sync.pipe(Effect.provide(b));
        expect(Option.isSome(yield* local(id).pipe(Effect.provide(b)))).toBe(true);

        yield* tick;
        yield* Effect.flatMap(Games, (games) => games.remove(id)).pipe(Effect.provide(a));
        yield* sync.pipe(Effect.provide(a));
        yield* sync.pipe(Effect.provide(b));
        yield* sync.pipe(Effect.provide(a));

        for (const device of [a, b]) {
          expect(Option.isNone(yield* local(id).pipe(Effect.provide(device)))).toBe(true);
          const inProgress = yield* Effect.flatMap(Games, (games) => games.inProgress).pipe(
            Effect.provide(device),
          );
          expect(inProgress).toEqual([]);
        }
      }),
    ),
  );

  it.live("deleting an unfinished game loses to a solve made on another device", () =>
    withTwoDevices(({ a, b }) =>
      Effect.gen(function* () {
        const id = yield* Effect.flatMap(Games, (games) =>
          games.start({ mode: "quick", difficulty: "easy" }),
        ).pipe(Effect.provide(a));
        yield* sync.pipe(Effect.provide(a));
        yield* sync.pipe(Effect.provide(b));

        yield* solve(id).pipe(Effect.provide(b));
        yield* tick;
        yield* Effect.flatMap(Games, (games) => games.remove(id)).pipe(Effect.provide(a));

        yield* sync.pipe(Effect.provide(a));
        yield* sync.pipe(Effect.provide(b));
        yield* sync.pipe(Effect.provide(a));

        for (const device of [a, b]) {
          const game = yield* local(id).pipe(Effect.provide(device));
          expect(Option.map(game, (found) => found.status)).toEqual(Option.some("solved"));
        }
      }),
    ),
  );

  it.live("a new device downloads everything and signing out wipes it", () =>
    withTwoDevices(({ a, fresh }) =>
      Effect.gen(function* () {
        for (const _ of [1, 2]) {
          const id = yield* Effect.flatMap(Games, (games) =>
            games.start({ mode: "quick", difficulty: "easy" }),
          ).pipe(Effect.provide(a));
          yield* solve(id).pipe(Effect.provide(a));
        }
        yield* sync.pipe(Effect.provide(a));

        const c = yield* fresh;
        yield* sync.pipe(Effect.provide(c));
        const stats = yield* Effect.flatMap(Stats, (service) => service.current).pipe(
          Effect.provide(c),
        );
        expect(stats.solved).toBe(2);

        yield* Effect.flatMap(AccountStore, (accounts) => accounts.signOut).pipe(Effect.provide(c));
        const solved = yield* Effect.flatMap(Games, (games) => games.solved).pipe(
          Effect.provide(c),
        );
        expect(solved).toEqual([]);
        const session = yield* Effect.flatMap(AccountStore, (accounts) => accounts.account).pipe(
          Effect.provide(c),
        );
        expect(Option.isNone(session)).toBe(true);
      }),
    ),
  );

  it.live("a broken local row does not hold back the other games", () =>
    withTwoDevices(({ a }) =>
      Effect.gen(function* () {
        const games = yield* Games;
        const broken = yield* games.start({ mode: "quick", difficulty: "easy" });
        const fine = yield* games.start({ mode: "quick", difficulty: "easy" });
        const database = yield* Database;
        yield* database.run(
          database.query.updateTable("games").set({ score_ms: 0.5 }).where("id", "=", broken),
        );
        yield* sync;
        const server = yield* Effect.flatMap(Api, (api) => api.Sync({ changes: [], since: 0 }));
        expect(server.games.map((game) => game.id)).toEqual([fine]);
        expect(yield* pending).toBe(1);
      }).pipe(Effect.provide(a)),
    ),
  );

  it.live("starting the same daily twice on one device reuses it", () =>
    withTwoDevices(({ a }) =>
      Effect.gen(function* () {
        const games = yield* Games;
        const first = yield* games.start({ mode: "daily", date: "2026-11-09" });
        yield* solve(first);
        const again = yield* games.start({ mode: "daily", date: "2026-11-09" });
        expect(again).toBe(first);
        expect((yield* games.get(again)).status).toBe("solved");
      }).pipe(Effect.provide(a)),
    ),
  );
});
