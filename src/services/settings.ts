import { Context, Effect, Layer, Option, Schema } from "effect";
import { Reactivity } from "effect/reactivity";
import { Database } from "../db/database.ts";

export const keyboardLayouts = ["auto", "qwerty", "azerty", "qwertz"] as const;
export type KeyboardLayout = (typeof keyboardLayouts)[number];

const flag = (value: boolean) =>
  Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(value)));

export const Settings = Schema.Struct({
  theme: Schema.Literals(["system", "light", "dark"]).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed("system")),
  ),
  sound: flag(true),
  volume: Schema.Finite.pipe(Schema.withDecodingDefaultKey(Effect.succeed(0.7))),
  highlightRelated: flag(true),
  colorblindShapes: flag(false),
  animations: flag(true),
  showConflicts: flag(true),
  pairMatrix: flag(true),
  keepAwake: flag(false),
  keyboardLayout: Schema.Literals(keyboardLayouts).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed("auto")),
  ),
  playerId: Schema.NullOr(Schema.String).pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
});
export type Settings = typeof Settings.Type;

const SettingsJson = Schema.fromJsonString(Settings);
const settingsKey = "settings";
export const settingsReactivityKey = "settings";

export class SettingsStore extends Context.Service<
  SettingsStore,
  {
    readonly get: Effect.Effect<Settings>;
    readonly update: (patch: Partial<Settings>) => Effect.Effect<Settings>;
  }
>()("tupu/services/SettingsStore") {
  static readonly layer = Layer.effect(
    SettingsStore,
    Effect.gen(function* () {
      const database = yield* Database;
      const reactivity = yield* Reactivity.Reactivity;

      const get = Effect.gen(function* () {
        const row = yield* database.first(
          database.query.selectFrom("settings").select("value").where("key", "=", settingsKey),
        );
        return yield* Schema.decodeEffect(SettingsJson)(
          Option.match(row, {
            onNone: () => "{}",
            onSome: (found) => found.value,
          }),
        );
      }).pipe(
        Effect.orElseSucceed(() => Schema.decodeSync(SettingsJson)("{}")),
        Effect.withSpan("SettingsStore.get"),
      );

      const update = Effect.fn("SettingsStore.update")(function* (patch: Partial<Settings>) {
        const current = yield* get;
        const next: Settings = { ...current, ...patch };
        const value = yield* Schema.encodeEffect(SettingsJson)(next);
        yield* database.run(
          database.query
            .insertInto("settings")
            .values({ key: settingsKey, value })
            .onConflict((conflict) => conflict.column("key").doUpdateSet({ value })),
        );
        yield* reactivity.invalidate([settingsReactivityKey]);
        return next;
      }, Effect.orDie);

      return SettingsStore.of({ get, update });
    }),
  );
}
