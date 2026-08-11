# Walking Skeleton — Fitness (MacroFactor Workouts Clone)

**Phase:** 1
**Generated:** 2026-08-11
**Delivered by:** `01-01-PLAN.md` Task 2 (`type="tracer"`)

## Capability Proven End-to-End

A person with no account opens the Expo app — on an iOS simulator, an Android emulator, or a desktop
browser — submits an email and a password, and lands on a screen showing the email their new session
returned. That single path crosses the pnpm/Turborepo workspace, an Expo Router screen, a version-prefixed
NestJS route, Better Auth, Drizzle, and PostgreSQL, and comes back.

This is the thinnest capability that exercises every layer Phase 1 modifies. It is production code, not a
prototype: plans 01-02 through 01-08 expand outward from it and none of them replaces it.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Monorepo | pnpm 11 workspaces + Turborepo 2.10.9, `apps/*` and `packages/*` | Settled by STACK.md; the layout must be able to host the shared pure `progression-engine` package ARCHITECTURE.md §4 locks in, so that slot is created empty in Phase 1 rather than retrofitted in Phase 8. |
| Client framework | Expo SDK 57 / React Native 0.86, Expo Router 57 | Locked by PROJECT.md. New Architecture is mandatory from SDK 55 and cannot be disabled, which removes bare React Native's traditional advantage. Expo Router gives web real, deep-linkable URLs from the same route tree that drives native screens. |
| Native tabs vs. web tabs | `expo-router/native-tabs` on native, `expo-router/ui` resolved through `_layout.web.tsx` on web | The documented pattern for this exact requirement, not a workaround. One route tree, five route names, two chromes. |
| Platform escape hatch | Build-time `.web.tsx` filename resolution, never a runtime branch at the call site | Roadmap success criterion 3. Two real instances ship in Phase 1: the tab layout pair and the web-only `/reset-password` route. Documented in `docs/platform-modules.md`. |
| API framework | NestJS 11.1.29 on Node 22 | Locked by PROJECT.md. NestJS 12 is unreleased; the v11→v12 jump is tooling, not API-breaking for this shape. |
| API versioning | `VersioningType.URI` with `defaultVersion: '1'`, plus a separate `MinClientVersionGuard` returning 426 | Two orthogonal mechanisms. Versioning routes; the guard decides whether a client is still supported at all. Implemented as a guard rather than a custom version extractor so the response is a distinguishable status the client can act on, not a generic 404. |
| Data layer | PostgreSQL 17+ with Drizzle ORM 0.45 and `drizzle-kit push` | Locked by PROJECT.md. Drizzle is a query builder rather than a runtime ORM, which keeps NestJS wiring thin. Schema is applied by an explicit push gate because build and typecheck pass whether or not the live database was ever migrated. |
| Auth | Better Auth 1.6.26 self-hosted, `@better-auth/expo` on the client, `@thallesp/nestjs-better-auth` 2.7.0 as the NestJS module | CONTEXT.md D-05. Clerk was raised and rejected: it owns token lifetime and cannot express D-01, its offline path throws after a failed refresh, and identity outside this project's Postgres would still require mirroring user ids into the database for Phase 2's synced tables. |
| Session storage | `expo-secure-store` on native via the Expo plugin's own cache; the browser cookie jar on web | The plugin's cache path is native-only and returns early on web. This is a real structural divergence, not a shared code path, and the web cold-start reasoning is separate and simpler by construction. |
| Offline session policy | A cached session is honoured indefinitely; only an explicit sign-out or a completed 401/403 carrying a revocation reason ends it | CONTEXT.md D-01 and D-03. Implemented as a four-arm classification (`ok`, `offline`, `revoked`, `rejected`) in `lib/session-guard.ts`, not as a server session-lifetime setting. |
| Cold start | Never blocks on the network; native renders from the cached session on the first frame, web renders chrome immediately and bounds its one round trip at ~3s | CONTEXT.md D-02. The structural defence against the 10–15 second offline black screen research flagged as disqualifying. |
| Styling | NativeWind v4 with class-based dark mode and a token contract for colour, spacing, and type | CONTEXT.md left this to discretion and flagged it as high-leverage. NativeWind carries no native code, so the whole phase stays inside Expo Go — Unistyles would have forced an EAS dev-client build one phase before PowerSync actually requires one. |
| Appearance | Persisted three-state override (`system`/`light`/`dark`) via AsyncStorage, applied before first paint | PLAT-09's wording requires a person-selectable control, not OS-follow-only. NativeWind's colour-scheme state is in-memory, so persistence is this project's responsibility. |
| Email | A `MailerPort` interface in NestJS with one SMTP adapter serving a local catcher in development and a real provider in deployment, selected by environment variable | CONTEXT.md D-08. Cloning the repository must never require an external email account to run the app. |
| Password reset | Completes on a web page at this project's own origin; the emailed link always opens a browser | CONTEXT.md D-07. No associated-domains file, no intent filter, no dev-client rebuild, and identical behaviour from all three platforms because it never leaves the browser. |
| Build tooling | Expo Go for all of Phase 1; no EAS dev-client build | Nothing in this phase requires native code. The first structural dev-client trigger is Phase 2's PowerSync SQLite module. |
| Test runner | Jest on both sides; supertest for API end-to-end against a live Postgres | Ships with the Expo template and is NestJS 11's default. Vitest is a NestJS-12-era migration. |
| Directory layout | `apps/mobile`, `apps/api`, `packages/api-contracts`, `packages/progression-engine` | Routes live under `apps/mobile/app/`, shared client logic under `apps/mobile/lib/`, shared components under `apps/mobile/components/`; API modules are feature folders under `apps/api/src/`. |

## Stack Touched in Phase 1

- [ ] Project scaffold — pnpm workspace, Turborepo task graph, TypeScript, lint, Jest on both sides
- [ ] Routing — Expo Router with an `(auth)` group, a `(tabs)` group, and a web-only `/reset-password` route
- [ ] Database — a real write (a `user` row created by sign-up) and a real read (that session read back), with the schema provably applied to the live instance
- [ ] UI — a real sign-up form wired to the API, and a working appearance control and sign-out on Profile
- [ ] Deployment — `docker-compose.dev.yml` for PostgreSQL and the mail catcher, plus a documented local full-stack run in `README.md`; CI runs the same suite against a provisioned Postgres on every push

## Out of Scope (Deferred to Later Slices)

Nothing below is in Phase 1. This list exists so later phases do not re-litigate Phase 1's minimalism.

- All data sync — PowerSync, local SQLite, the outbox, the pull cursor (Phase 2, PLAT-02/03/04/07/08/10)
- Every domain entity — exercises, programs, workouts, sets (Phases 3 onward)
- Email verification on sign-up (cut by D-06)
- OAuth and social sign-in (cut by D-06)
- Account deletion (cut by D-06)
- An offline or sync status indicator in the UI (Phase 2, where there is sync state to report)
- Native deep links for password reset via Universal Links or App Links (D-07 takes the browser route; deep links are purely additive later)
- Any EAS dev-client or EAS Build job (first required by Phase 2's native SQLite module)
- Any REST CRUD surface for per-user mutable domain data — ARCHITECTURE.md §3 reserves that ingress for Phase 2's `SyncModule`, and creating one now is its named Anti-Pattern 1
- A custom font family (the UI-SPEC defers it until there is a real typography need)
- A brand accent colour (flagged in the UI-SPEC; blue-600/500 is a neutral default and a one-variable swap)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural
decisions:

- **Phase 2** — anything written succeeds offline and converges across devices, on a schema that can express real training data
- **Phase 3** — the exercise catalog a person can search, filter, and extend
- **Phase 4** — a program a person authors, with the targets the progression engine will later read
- **Phase 5** — the in-gym logging loop, offline, start to finish *(dogfooding starts here)*
- **Phase 6** — gym profiles and equipment-aware plate math
- **Phase 7** — advanced set types without slowing the common case
- **Phase 8** — the progression engine, in `packages/progression-engine`, the slot this skeleton reserved
- **Phase 9** — records and on-device analytics
- **Phase 10** — server analytics, rollups, and recompute-on-edit
- **Phase 11** — program generation
- **Phase 12** — body metrics and the customizable dashboard
