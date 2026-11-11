import { Context, Effect, Layer, Option, Schema } from "effect";
import { Reactivity } from "effect/reactivity";
import { Account } from "../api/rpc.ts";
import { Database } from "../db/database.ts";

const AccountJson = Schema.fromJsonString(Account);
const CursorJson = Schema.fromJsonString(Schema.Int);

const accountKey = "account";
const cursorKey = "sync-cursor";

export const accountReactivityKey = "account";

// The signed-in account lives in the local database so the app can start and
// be played without a network connection.
export class AccountStore extends Context.Service<
  AccountStore,
  {
    readonly account: Effect.Effect<Option.Option<Account>>;
    readonly signIn: (account: Account) => Effect.Effect<void>;
    readonly rename: (account: Account) => Effect.Effect<void>;
    readonly signOut: Effect.Effect<void>;
    readonly cursor: Effect.Effect<number>;
    readonly setCursor: (cursor: number) => Effect.Effect<void>;
  }
>()("tupu/services/AccountStore") {
  static readonly layer = Layer.effect(
    AccountStore,
    Effect.gen(function* () {
      const database = yield* Database;
      const reactivity = yield* Reactivity.Reactivity;

      const read = (key: string) =>
        database
          .first(database.query.selectFrom("settings").select("value").where("key", "=", key))
          .pipe(Effect.map(Option.map((row) => row.value)), Effect.orDie);

      const write = (key: string, value: string) =>
        database
          .run(
            database.query
              .insertInto("settings")
              .values({ key, value })
              .onConflict((conflict) => conflict.column("key").doUpdateSet({ value })),
          )
          .pipe(Effect.orDie);

      const account = read(accountKey).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.succeedNone,
            onSome: (value) => Schema.decodeEffect(AccountJson)(value).pipe(Effect.option),
          }),
        ),
        Effect.withSpan("AccountStore.account"),
      );

      const forgetData = database
        .transaction(
          Effect.gen(function* () {
            yield* database.run(database.query.deleteFrom("games"));
            yield* database.run(
              database.query.deleteFrom("settings").where("key", "in", [accountKey, cursorKey]),
            );
          }),
        )
        .pipe(Effect.orDie);

      const store = Effect.fnUntraced(function* (value: Account) {
        yield* write(accountKey, yield* Schema.encodeEffect(AccountJson)(value));
      }, Effect.orDie);

      const signIn = Effect.fn("AccountStore.signIn")(function* (signedIn: Account) {
        const previous = yield* account;
        if (Option.isSome(previous) && previous.value.id !== signedIn.id) yield* forgetData;
        yield* store(signedIn);
        yield* reactivity.invalidate([accountReactivityKey, "games"]);
      });

      const rename = Effect.fn("AccountStore.rename")(function* (renamed: Account) {
        const current = yield* account;
        if (Option.isNone(current) || current.value.id !== renamed.id) return;
        yield* store(renamed);
        yield* reactivity.invalidate([accountReactivityKey]);
      });

      const signOut = Effect.gen(function* () {
        yield* forgetData;
        yield* reactivity.invalidate([accountReactivityKey, "games"]);
      }).pipe(Effect.withSpan("AccountStore.signOut"));

      const cursor = read(cursorKey).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.succeed(0),
            onSome: (value) =>
              Schema.decodeEffect(CursorJson)(value).pipe(Effect.orElseSucceed(() => 0)),
          }),
        ),
      );

      const setCursor = Effect.fn("AccountStore.setCursor")(function* (value: number) {
        yield* write(cursorKey, yield* Schema.encodeEffect(CursorJson)(value).pipe(Effect.orDie));
      });

      return AccountStore.of({ account, signIn, rename, signOut, cursor, setCursor });
    }),
  );
}
