# Project instructions

## Effect

- Before implementing or changing any behavior in Effect code, check whether Effect or its platform packages already provide an appropriate API or pattern for the task. Consult the installed package source and types, the official documentation, or the Effect reference repository; do not rely on memory alone. This applies to validation, errors, configuration, persistence, concurrency, resource management, reactivity, testing, and other capabilities.
- Use the shared reference clone at `~/.references/effect`, especially `packages/effect/src`, its tests, and the relevant platform packages. Read its `AGENTS.md` and `LLMS.md` before writing Effect code. Treat the clone as read-only reference material; import Effect from the project's dependencies. If the clone is unavailable, consult the [official Effect repository](https://github.com/Effect-TS/effect) or its documentation.
- Check examples against the version pinned in `package.json`. The installed version is authoritative when the reference clone or online documentation differs; Effect 4 unstable APIs can change between releases.
- Prefer the existing Effect abstraction when it fits the requirements. Use `Effect.gen` and named `Effect.fn` operations for readable workflows, typed errors and schemas at boundaries, and scoped layers for resource lifetimes. Use `pipe` when it improves readability, not by default for every operation.
- Persistence goes through the `Database` service (`src/db/database.ts`): build queries with Kysely and run them with `Database.rows`, `first`, `run` and `transaction`, which execute on the Effect `SqlClient`. Add schema changes as a new Kysely migration in `src/db/migrations` and register it in `migrations/index.ts`; never edit a migration that has shipped.
- UI state that comes from services is exposed as atoms built on the runtime in `src/ui/runtime.ts`. Writes invalidate `Reactivity` keys so dependent atoms refresh; do not refetch manually.

# TypeScript diagnostics

Run `pnpm effect:check` for Effect diagnostics across the three TypeScript projects (`tsconfig.app.json`, `tsconfig.worker.json`, `tsconfig.node.json`); `pnpm typecheck` separately checks TypeScript errors. The Effect check invokes the TS 7-compatible `@effect/tsgo` diagnostics CLI and fails if no files are checked or a file lacks the plugin configuration. `pnpm lint` runs Oxlint with the type-aware Effect rules; `pnpm install` runs `effect-tsgo patch` so editors using the workspace TypeScript get the Effect language service.
