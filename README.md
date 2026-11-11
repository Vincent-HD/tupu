<img src="public/icon.svg" width="64" height="64" alt="">

# Tupu

A logic puzzle of numbers and colors. Each tile takes a number and a color: rows and columns never repeat either, and every number and color pair appears exactly once on the board (a Graeco-Latin square). Players sign in with a code sent to their email or with a passkey, never a password; games are played offline-first on the device and sync to the account.

<p>
  <img src="docs/screenshots/phone-home.png" width="200" alt="Home on a phone">
  <img src="docs/screenshots/phone-offline-expert.png" width="200" alt="Expert board played offline">
  <img src="docs/screenshots/phone-dark.png" width="200" alt="Dark theme with a check result">
  <img src="docs/screenshots/phone-solved-offline.png" width="200" alt="Solved screen">
</p>
<img src="docs/screenshots/desktop-play.png" width="820" alt="Desktop board with an explained hint">

## Features

- **Modes:** a daily puzzle whose difficulty follows the weekday, unlimited quick play in five difficulties (Easy 4×4 to Expert 7×7), and custom puzzles with any supported size (3, 4, 5, 7, 8, 9), logic level, clue density and a shareable seed.
- **Archive:** every past daily is playable from a calendar.
- **Fair puzzles:** a logical solver grades every puzzle by the hardest deduction it needs (line logic, pair logic, pair hunting, deep logic) and guarantees a unique solution reachable without guessing.
- **Help that teaches:** hints explain the next deduction and highlight the tiles that justify it; checks cross out wrong values; a pair tracker shows which combinations are on the board; rule breaks can be outlined live.
- **Accounts and a shared leaderboard:** sign in with a 6-digit code sent by email, then optionally save a passkey to skip the email next time ([better-auth](https://www.better-auth.com) with its email OTP and passkey plugins). There are no passwords. Every account is ranked per board by time plus hint and check penalties. The server replays each solve before ranking it: the puzzle must be the generator's own for that seed and the recorded moves must solve it within the reported time.
- **Stats, streaks and replays** of every solve, a guided tutorial, keyboard controls, synthesized paper sounds, dark mode and color-vision shapes.
- **Offline-first sync:** games live in SQLite on the device (wa-sqlite on OPFS, in a worker) and sync with the server through Effect RPC. See [Sync](#sync).
- **Installable PWA that works offline:** a service worker precaches the whole build (app, SQLite WebAssembly, worker, fonts, icons). After signing in once, puzzles, including the daily, play without a network. Phone layouts keep the board, keypad and actions on one screen.

## Stack

Vite, React and Tailwind CSS for the UI, with TanStack Router, Query, Form, Table, Charts, Hotkeys, Pacer and Store; Effect 4 for services, layers and schemas; Kysely as the query builder and migrator, executed through the Effect `SqlClient`. Lint and format with Oxlint and Oxfmt; Effect diagnostics come from `@effect/tsgo` on TypeScript 7.

| Path           | Role                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| `src/domain`   | Square construction, logical solver, generator, game session reducer.             |
| `src/api`      | Effect RPC contract shared by the browser and the server.                         |
| `src/db`       | Kysely dialect over the Effect `SqlClient`, migrations, SQLite worker.            |
| `src/services` | Browser services: games, account, sign-in, sync, settings, stats.                 |
| `src/ui`       | Runtime, components and pages.                                                    |
| `server`       | better-auth, RPC handlers, sync, solve checks, rankings; Node and Worker entries. |
| `test`         | Vitest suites against real `node:sqlite` databases and the RPC server.            |

## Development

With Nix, run `direnv allow` once (or `nix develop path:./nix`). Otherwise use Node 24 and pnpm 12.

```sh
pnpm install
pnpm dev          # http://localhost:5173, API server on :8787 behind the Vite proxy
pnpm check        # tests, lint, typecheck, Effect diagnostics, formatting
pnpm build
pnpm preview      # production build with the service worker, http://localhost:4173
```

The service worker and OPFS storage need a secure context: `localhost` or HTTPS. To play on a phone, serve `dist/` from any static HTTPS host, or open the preview through an HTTPS tunnel. A plain `http://<lan-ip>` address will not work.

## Sync

Each device keeps its own SQLite copy of the account's games and marks local changes as pending. A sync sends the pending games, then receives every game changed since the last sync. It runs after local changes, on reconnecting, when the tab comes back, and every two minutes.

When two devices changed the same game, one rule decides, on the server and on the device alike ([`src/domain/reconcile.ts`](src/domain/reconcile.ts)):

1. a solved game beats an unfinished one;
2. otherwise the most recent change wins;
3. on an exact tie, the server's copy stays.

Each account has one game per daily date (its id is `daily-<date>`), so the same daily started on two devices is one game. Deleted games are kept as tombstones so they cannot come back from another device. A daily dated after the current date in UTC+14 is never ranked.

## Deploy

The same server code runs on Node with a SQLite file, or in a Cloudflare Worker with D1. Sign-in is [better-auth](https://www.better-auth.com), served under `/api/auth`, with its tables in the same database.

- **Secret:** `BETTER_AUTH_SECRET` signs the session cookies. Production refuses to start without it; generate one with `openssl rand -base64 32`.
- **Origin:** passkeys and cookies are bound to the site's hostname. Set `TUPU_ORIGIN` (for example `https://tupu.example.com`), or leave it empty to use the request's host, which works behind a reverse proxy that sets `X-Forwarded-Host` and `X-Forwarded-Proto`.
- **Email:** sign-in codes go out through [Cloudflare Email Sending](https://developers.cloudflare.com/email-service/), which needs the Workers Paid plan and a sending domain onboarded to Email Sending, with its SPF, DKIM and DMARC records. The Cloudflare stack onboards it for you when it has a custom domain; otherwise onboard it in the dashboard (Email Service, then Sending). `MAIL_FROM` is the sender, an address on that domain such as `code@tupu.example.com`. Without a provider (local development), the code is written to the server log.

### Cloudflare (Alchemy)

[`alchemy.run.ts`](alchemy.run.ts) defines a `Tupu` stack: a D1 database and `Cloudflare.Website.StaticSite`, which runs `pnpm build`, serves `dist/` as static assets and routes `/rpc`, `/api/auth/*` and `/healthz` to the Worker in [`server/worker.ts`](server/worker.ts). The Worker sends email through a `send_email` binding. With `TUPU_DOMAIN`, the stack also onboards the domain of `MAIL_FROM` to Email Sending (by default `noreply@` that domain), which creates its DNS records in the zone. The Worker runs the Kysely migrations on D1 at its first request. Cache headers come from [`public/_headers`](public/_headers). Alchemy keeps its state in your Cloudflare account.

Checking a solve regenerates its puzzle once (the result is cached in D1). An expert or 9×9 board takes 80–400 ms of CPU, more than the Workers free plan allows per request.

```sh
pnpm cf:login                          # once: connect a Cloudflare account to the Alchemy profile
export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
TUPU_DOMAIN=tupu.example.com pnpm deploy   # custom domain, onboarded for email (the zone must be on Cloudflare)
MAIL_FROM=code@onboarded.example pnpm deploy  # workers.dev only: the sender's domain must already be onboarded
pnpm destroy                           # remove the stack
```

In CI, set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` instead of using a profile.

### Docker

The image builds the app, then runs an Effect HTTP server on Node ([`server/main.ts`](server/main.ts), bundled into one file by `pnpm build:server`). It serves `dist/` with SPA fallback, ETags, the right MIME types for WebAssembly and the manifest, and per-path cache headers, answers RPC calls on `POST /rpc` and serves better-auth under `/api/auth`. It sends email through the Cloudflare Email Sending REST API. Accounts and games are stored in a SQLite file under `/app/data`, a volume in [`compose.yaml`](compose.yaml). It listens on plain HTTP port 8080 as the unprivileged `node` user; put your own reverse proxy in front for HTTPS, which passkeys, the PWA and OPFS storage require outside `localhost`. `GET /healthz` answers `ok`.

```sh
export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
docker compose up -d --build        # http://localhost:8080
PORT=3000 docker compose up -d --build
```

| Variable                     | Default                    | Purpose                                          |
| ---------------------------- | -------------------------- | ------------------------------------------------ |
| `PORT`                       | `8080`                     | Port the server listens on.                      |
| `HOST`                       | `0.0.0.0`                  | Interface the server binds to.                   |
| `STATIC_ROOT`                | `/app/dist`                | Directory with the built app.                    |
| `DATABASE_PATH`              | `/app/data/tupu.sqlite`    | Server SQLite file.                              |
| `TUPU_ORIGIN`                | from the request           | Origin passkeys are bound to.                    |
| `BETTER_AUTH_SECRET`         | required in production     | Signs session cookies.                           |
| `MAIL_FROM`                  | none                       | Sender of sign-in codes, on an onboarded domain. |
| `CLOUDFLARE_ACCOUNT_ID`      | none                       | Account that sends the email.                    |
| `CLOUDFLARE_EMAIL_API_TOKEN` | none (codes go to the log) | API token with the Email Sending permission.     |

Without Docker: `pnpm build && pnpm build:server && pnpm start`, or `pnpm serve` to run the server from source.
