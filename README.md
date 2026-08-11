# Fitness

A cross-platform strength-training app — one Expo codebase targeting iOS, Android, and the desktop
browser, backed by a NestJS API and Postgres.

**Core value:** walk into a gym with no signal, log every set without friction, and the app tells you
what to lift next time.

## Layout

```
apps/
  api/                  NestJS 11 API — Better Auth, Drizzle, Postgres
  mobile/               Expo SDK 57 app — iOS, Android, and web from one route tree
packages/
  api-contracts/        Request/response types shared by client and server
  progression-engine/   Reserved slot for the shared pure progression package
```

## Prerequisites

- Node.js >= 20
- pnpm 11.9.0 (`corepack enable`)
- PostgreSQL 15+

## Running Postgres

Two supported paths — use whichever you have.

**Docker (reproducible, recommended for a fresh clone):**

```bash
docker compose -f docker-compose.dev.yml up -d
```

This brings up Postgres on 5432 and Mailpit on 1025 (SMTP) / 8025 (web UI).

**Local Postgres (no Docker):**

```bash
createdb fitness
```

Then point `DATABASE_URL` at your local server. Mailpit can be run directly from its Homebrew
formula (`brew install mailpit && mailpit`) instead of via Docker.

## Setup

```bash
pnpm install
cp .env.example .env          # then fill in BETTER_AUTH_SECRET
pnpm --filter api db:push     # apply the Drizzle schema to the database
pnpm dev
```

`pnpm dev` runs the API and the Expo dev server together. Press `w` in the Expo output for the web
build, or `i` / `a` for the iOS simulator / Android emulator.

## Database

`drizzle-kit push` is this project's schema application command. The Drizzle schema in
`apps/api/src/db/schema.ts` is the source of truth; the live database is brought to match it with:

```bash
pnpm --filter api db:push
```

**Run it after any edit to `schema.ts`, and before any verification run.** Typecheck and build pass
whether or not the database was ever migrated — the TypeScript types come from `schema.ts`, not from
the live server — so an unmigrated database will otherwise show up as a false-positive green.

`pnpm --filter api db:verify` pushes and then asserts the live database actually contains the four
Better Auth tables, so that gap cannot pass silently.

## Environment

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | api | Postgres connection string |
| `API_BASE_URL` | api | Public origin Better Auth issues links against |
| `BETTER_AUTH_SECRET` | api | Signing secret — must be a long random string |
| `EXPO_PUBLIC_API_URL` | mobile | Origin the client calls |
| `MAIL_TRANSPORT` | api | Outbound-mail adapter selector — only `smtp` exists today |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | api | SMTP connection — leave user/password empty for the local catcher |
| `MAIL_FROM` | api | From address on outbound mail |
| `WEB_APP_ORIGIN` | api | The deployed web build's own origin — where `reset-password.web.tsx` is served, and the origin Better Auth's `originCheck` trusts for a reset-password `redirectTo` |

Only `.env.example` is committed. Never commit a real `.env`.

## Email in development

Password reset is the only feature that sends mail. In development it never leaves the machine:
Mailpit catches everything sent to `127.0.0.1:1025` and shows it in a web inbox at
`localhost:8025` — no external email account, real provider, or owned domain is needed to exercise
the flow end to end.

Either supported Postgres path also starts Mailpit:

```bash
docker compose -f docker-compose.dev.yml up -d mailpit   # Docker path
brew install mailpit && mailpit                            # Homebrew path, no Docker
```

Request a password reset from the app, then open `localhost:8025` to read the mail and click the
reset link — it always opens a browser at `reset-password.web.tsx` on the web build's own origin,
never a native app scheme (D-07).

Switching to a real provider in a deployed environment is an environment-variable change only —
`MAIL_TRANSPORT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM` — against
the one mailer port in `apps/api/src/mailer/`. Neither the Better Auth wiring in `auth.ts` nor the
reset route changes.

## API versioning

Every route is served under an explicit version segment (`/v1/...`); `main.ts` enables
`VersioningType.URI` with `defaultVersion: '1'`, so nothing can be served unversioned.

Separately, `MIN_CLIENT_VERSION` (`.env`) sets a minimum-supported-client-version floor, enforced by
a global guard reading the `X-Client-Version` request header. A request below the floor gets
`426 Upgrade Required` with `{ reason: "client_version_below_minimum", minimum }`; a request with no
version header, or a malformed one, is always let through — it is never treated as hostile. The
default `0.0.0` blocks nothing; raising it once a real breaking change ships is a single environment
variable change. `GET /health` stays reachable regardless of the floor, so a blocked client can still
reach a route that tells it why.

## Tests

```bash
pnpm typecheck
pnpm lint
pnpm --filter api test:e2e
```

The API end-to-end suite requires a running Postgres and an applied schema.
