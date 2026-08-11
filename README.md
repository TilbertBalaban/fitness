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

## Environment

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | api | Postgres connection string |
| `API_BASE_URL` | api | Public origin Better Auth issues links against |
| `BETTER_AUTH_SECRET` | api | Signing secret — must be a long random string |
| `EXPO_PUBLIC_API_URL` | mobile | Origin the client calls |

Only `.env.example` is committed. Never commit a real `.env`.

## API versioning

Every route is served under an explicit version segment (`/v1/...`); `main.ts` enables
`VersioningType.URI` with `defaultVersion: '1'`, so nothing can be served unversioned.

## Tests

```bash
pnpm typecheck
pnpm lint
pnpm --filter api test:e2e
```

The API end-to-end suite requires a running Postgres and an applied schema.
