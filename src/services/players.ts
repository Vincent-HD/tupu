import { Context, Effect, Layer, Schema, Semaphore } from "effect";
import { Reactivity } from "effect/reactivity";
import { Database } from "../db/database.ts";
import type { PlayerRow } from "../db/schema.ts";
import { SettingsStore } from "./settings.ts";

export class PlayerNameTaken extends Schema.TaggedError<
  PlayerNameTaken,
  { readonly brand: unique symbol }
>()("PlayerNameTaken", {
  playerName: Schema.String,
}) {}

export const playersReactivityKey = "players";

export class Players extends Context.Service<
  Players,
  {
    readonly list: Effect.Effect<ReadonlyArray<PlayerRow>>;
    readonly current: Effect.Effect<PlayerRow>;
    readonly create: (name: string) => Effect.Effect<PlayerRow, PlayerNameTaken>;
    readonly rename: (input: {
      readonly id: string;
      readonly name: string;
    }) => Effect.Effect<void, PlayerNameTaken>;
    readonly select: (id: string) => Effect.Effect<void>;
  }
>()("tupu/services/Players") {
  static readonly layer = Layer.effect(
    Players,
    Effect.gen(function* () {
      const database = yield* Database;
      const settings = yield* SettingsStore;
      const reactivity = yield* Reactivity.Reactivity;
      const lock = yield* Semaphore.make(1);

      const list = database
        .rows(database.query.selectFrom("players").selectAll().orderBy("created_at"))
        .pipe(Effect.orDie, Effect.withSpan("Players.list"));

      const isTaken = (name: string, exceptId?: string) =>
        database
          .first(
            database.query
              .selectFrom("players")
              .select("id")
              .where((eb) =>
                eb.and([
                  eb(eb.fn("lower", ["name"]), "=", name.toLowerCase()),
                  eb("id", "!=", exceptId ?? ""),
                ]),
              ),
          )
          .pipe(
            Effect.map((found) => found._tag === "Some"),
            Effect.orDie,
          );

      const create = Effect.fn("Players.create")(function* (name: string) {
        const trimmed = name.trim().slice(0, 24) || "Player";
        if (yield* isTaken(trimmed)) return yield* new PlayerNameTaken({ playerName: trimmed });
        const player: PlayerRow = {
          id: crypto.randomUUID(),
          name: trimmed,
          created_at: new Date().toISOString(),
        };
        yield* database.run(database.query.insertInto("players").values(player)).pipe(Effect.orDie);
        yield* reactivity.invalidate([playersReactivityKey]);
        return player;
      });

      const current = Effect.gen(function* () {
        const { playerId } = yield* settings.get;
        const players = yield* list;
        const found = players.find((player) => player.id === playerId) ?? players[0];
        if (found) {
          if (found.id !== playerId) yield* settings.update({ playerId: found.id });
          return found;
        }
        const created = yield* create("Player 1").pipe(Effect.orDie);
        yield* settings.update({ playerId: created.id });
        return created;
      }).pipe(lock.withPermits(1), Effect.withSpan("Players.current"));

      const rename = Effect.fn("Players.rename")(function* (input: {
        readonly id: string;
        readonly name: string;
      }) {
        const trimmed = input.name.trim().slice(0, 24);
        if (!trimmed) return;
        if (yield* isTaken(trimmed, input.id))
          return yield* new PlayerNameTaken({ playerName: trimmed });
        yield* database
          .run(
            database.query.updateTable("players").set({ name: trimmed }).where("id", "=", input.id),
          )
          .pipe(Effect.orDie);
        yield* reactivity.invalidate([playersReactivityKey, "leaderboard"]);
      });

      const select = Effect.fn("Players.select")(function* (id: string) {
        yield* settings.update({ playerId: id });
        yield* reactivity.invalidate([playersReactivityKey, "games", "stats"]);
      });

      return Players.of({ list, current, create, rename, select });
    }),
  );
}
