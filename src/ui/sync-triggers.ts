import { Effect, Layer, Schedule, Stream } from "effect";
import { Reactivity } from "effect/reactivity";
import { accountReactivityKey } from "../services/account-store.ts";
import { localWritesReactivityKey } from "../services/games.ts";
import { Sync } from "../services/sync.ts";

// Runs a sync after local writes (debounced), when the browser reconnects,
// when the tab comes back, after signing in, and on a slow heartbeat that
// picks up games played on other devices.
export const SyncTriggers = Layer.effectDiscard(
  Effect.gen(function* () {
    const sync = yield* Sync;
    const runOn = <A, R>(stream: Stream.Stream<A, never, R>) =>
      stream.pipe(
        Stream.runForEach(() => sync.run),
        Effect.forkScoped,
      );
    yield* runOn(
      Reactivity.stream(Effect.void, [localWritesReactivityKey]).pipe(
        Stream.drop(1),
        Stream.debounce("2 seconds"),
      ),
    );
    yield* runOn(Reactivity.stream(Effect.void, [accountReactivityKey]).pipe(Stream.drop(1)));
    yield* runOn(Stream.fromEventListener(window, "online"));
    yield* runOn(
      Stream.fromEventListener(document, "visibilitychange").pipe(
        Stream.filter(() => document.visibilityState === "visible"),
      ),
    );
    yield* sync.run.pipe(Effect.repeat(Schedule.spaced("2 minutes")), Effect.forkScoped);
  }),
);
