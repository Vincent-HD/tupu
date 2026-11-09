import { OpfsWorker } from "@effect/sql-sqlite-wasm";
import { Effect } from "effect";

Effect.runFork(OpfsWorker.run({ port: self, dbName: "tupu.sqlite" }));
