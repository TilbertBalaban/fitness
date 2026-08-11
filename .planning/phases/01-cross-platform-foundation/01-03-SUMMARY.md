---
phase: 01-cross-platform-foundation
plan: 03
subsystem: api
tags: [nestjs, versioning, better-auth, guard, middleware, expo]

requires:
  - phase: 01-cross-platform-foundation
    provides: "NestJS API with URI versioning enabled from the first request; Better Auth mounted at /v1/auth"
provides:
  - "MinClientVersionGuard: a global CanActivate returning 426 for a below-floor X-Client-Version, VERSION_NEUTRAL-aware"
  - "minClientVersionMiddleware: the same floor check applied ahead of Better Auth's middleware-mounted routes"
  - "GET /health — a version-neutral, unauthenticated liveness route reachable at any client version"
  - "apps/mobile/lib/client-version.ts — CLIENT_VERSION (from Expo app config) and CLIENT_VERSION_HEADER for the client side"
affects: [01-05, phase-02-sync]

actuals:
  tokens: 3161
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Global CanActivate guard reads NestJS's own VERSION_METADATA via Reflector to recognise VERSION_NEUTRAL routes, avoiding a second marker decorator"
    - "Middleware-mounted library routes (Better Auth) are outside Nest's router/guard pipeline — cross-cutting HTTP-level concerns for them need an app.use() middleware registered before the library's own, not a guard"

key-files:
  created:
    - apps/api/src/common/client-version.constants.ts
    - apps/api/src/common/min-client-version.guard.ts
    - apps/api/src/health/health.controller.ts
    - apps/api/src/health/health.module.ts
    - apps/api/test/version-guard.e2e-spec.ts
    - apps/mobile/lib/client-version.ts
  modified:
    - apps/api/src/app.module.ts
    - apps/api/src/main.ts
    - .env.example
    - README.md

key-decisions:
  - "Guard (CanActivate), not a custom versioning extractor, per 01-RESEARCH.md Open Question 1 — a distinguishable 426 rather than a generic 404"
  - "Floor defaults to 0.0.0 (blocks nothing) and is raised via one environment variable — resolves Assumption A3 without stranding any build in the field"
  - "A malformed X-Client-Version value is treated as absent, not below the floor — compareSemver throws on invalid input and both call sites (guard, middleware) catch it and allow"
  - "Better Auth's routes are mounted as raw middleware (httpAdapter.use), never reaching Nest's router or any CanActivate guard — a second enforcement point (minClientVersionMiddleware, registered in main.ts before app.listen()) covers that surface; the guard alone was insufficient for 'every route the client calls'"

patterns-established:
  - "Two-layer version-floor enforcement: CanActivate guard for Nest-routed controllers, Express middleware for middleware-mounted library routes — both share one evaluateClientVersion() check"

requirements-completed: [PLAT-01]

coverage:
  - id: D1
    description: "A request below the configured client-version floor receives 426 with a machine-readable reason code on a Nest-routed controller"
    requirement: PLAT-01
    verification:
      - kind: e2e
        ref: "apps/api/test/version-guard.e2e-spec.ts#rejects a versioned route with 426 and the reason code when the client version is below the floor"
        status: pass
    human_judgment: false
  - id: D2
    description: "A request at/above the floor, with no version header, or with a malformed version header is always served normally"
    requirement: PLAT-01
    verification:
      - kind: e2e
        ref: "apps/api/test/version-guard.e2e-spec.ts#serves a versioned route normally when the client version is above the floor"
        status: pass
      - kind: e2e
        ref: "apps/api/test/version-guard.e2e-spec.ts#serves the route normally when no client version header is sent"
        status: pass
      - kind: e2e
        ref: "apps/api/test/version-guard.e2e-spec.ts#serves the route normally when the client version header is malformed"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /health stays reachable at any client version, including one the floor blocks"
    requirement: PLAT-01
    verification:
      - kind: e2e
        ref: "apps/api/test/version-guard.e2e-spec.ts#keeps GET /health reachable even when the client version is below the floor"
        status: pass
    human_judgment: false
  - id: D4
    description: "A path with no version segment does not reach a versioned controller"
    verification:
      - kind: e2e
        ref: "apps/api/test/version-guard.e2e-spec.ts#does not route a request with no version segment to a versioned controller"
        status: pass
    human_judgment: false
  - id: D5
    description: "The floor also gates Better Auth's middleware-mounted routes, not only Nest-routed controllers — the guard alone does not reach them"
    requirement: PLAT-01
    verification:
      - kind: e2e
        ref: "apps/api/test/version-guard.e2e-spec.ts#rejects a versioned route with 426 and the reason code when the client version is below the floor (exercised against /v1/auth/get-session)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The mobile client exports its own version and the shared header name for a future request layer to send"
    verification:
      - kind: other
        ref: "pnpm --filter mobile exec tsc --noEmit -> 0; grep -c 'X-Client-Version' apps/mobile/lib/client-version.ts apps/api/src/common/client-version.constants.ts -> 1, 1"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-08-11
status: complete
---

# Phase 01 Plan 03: API Version Floor Summary

**A global `MinClientVersionGuard` plus a matching Express middleware give the API a working 426 force-update floor across both Nest-routed controllers and Better Auth's middleware-mounted routes, proven end-to-end and defaulting to blocking nothing.**

## Performance

- **Duration:** ~20 min (includes `pnpm install` into a fresh worktree)
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- `MinClientVersionGuard` (`CanActivate`) reads `X-Client-Version`, compares against an env-sourced floor (`resolveMinClientVersion()`, default `0.0.0`), and throws `426` with `{ reason: "client_version_below_minimum", minimum }` — skipping any `VERSION_NEUTRAL` route via NestJS's own `VERSION_METADATA` reflected through `Reflector`
- `GET /health` (`@Controller({ version: VERSION_NEUTRAL })`, `@AllowAnonymous()`) is reachable at any client version and without a session
- Discovered and fixed a real gap: Better Auth's routes are mounted as raw Express middleware ahead of Nest's router, so the guard alone never saw them. Added `minClientVersionMiddleware`, registered in `main.ts` via `app.use()` before `app.listen()`, sharing the same `evaluateClientVersion()` check as the guard
- `apps/mobile/lib/client-version.ts` exports `CLIENT_VERSION` (from Expo's app config) and the same `CLIENT_VERSION_HEADER` literal, ready for plan 01-05's request layer
- 6 new e2e assertions in `version-guard.e2e-spec.ts`; the existing `auth.e2e-spec.ts` (6 tests) and `schema-parity.e2e-spec.ts` (3 tests) still pass — 15/15 total across the suite

## Task Commits

1. **Task 1: Minimum-supported-client-version floor as a global guard returning 426** — `52f0045` (feat)
2. **Task 2: Prove the floor end-to-end and make the mobile client send its version** — `ec99e67` (test, RED), `24a7f5e` (fix, GREEN), `c164874` (feat, mobile client)

## Files Created/Modified

- `apps/api/src/common/client-version.constants.ts` — `CLIENT_VERSION_HEADER`, `MIN_CLIENT_VERSION_REASON`, `compareSemver`, `resolveMinClientVersion`
- `apps/api/src/common/min-client-version.guard.ts` — `MinClientVersionGuard` (CanActivate) + shared `evaluateClientVersion()` + `minClientVersionMiddleware()`
- `apps/api/src/health/health.controller.ts`, `health.module.ts` — version-neutral, anonymous `GET /health`
- `apps/api/src/app.module.ts` — registers `MinClientVersionGuard` via `APP_GUARD`, imports `HealthModule`
- `apps/api/src/main.ts` — registers `minClientVersionMiddleware(AUTH_BASE_PATH)` before `app.listen()`
- `apps/api/test/version-guard.e2e-spec.ts` — 6 e2e cases covering the full behaviour block
- `apps/mobile/lib/client-version.ts` — `CLIENT_VERSION`, `CLIENT_VERSION_HEADER`
- `.env.example` — `MIN_CLIENT_VERSION=0.0.0`
- `README.md` — expanded "API versioning" section documenting the floor, the 426 shape, and the health-route exemption

## Decisions Made

- Guard over extractor, per 01-RESEARCH.md Open Question 1 — a distinguishable 426 instead of a generic 404
- Floor defaults to `0.0.0` (blocks nothing today); raising it is a single env var — resolves Assumption A3 without stranding any build
- Malformed client version treated as absent (allowed), not below the floor — `compareSemver` throws on invalid input, both call sites catch and allow
- Extended enforcement to Better Auth's middleware-mounted routes via a second, shared-logic middleware — the guard alone does not cover them (see deviation below)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `MinClientVersionGuard` alone did not gate Better Auth's routes**
- **Found during:** Task 2, running `version-guard.e2e-spec.ts` for the first time (RED)
- **Issue:** Better Auth mounts its routes via `httpAdapter.use(...)` directly inside `AuthModule.configure()` (`@thallesp/nestjs-better-auth`), not as Nest controllers. Requests to `/v1/auth/*` never reach Nest's router or any `CanActivate` guard, so a below-floor request to `/v1/auth/get-session` returned `200` instead of `426` — the guard's own must-have ("every route the client calls resolves through an explicit `/v1/` path segment" and is subject to the floor) was not actually true for the auth surface, exactly the risk `01-01-SUMMARY.md`'s inherited-context note flagged for this plan to verify.
- **Fix:** Extracted the floor check into a shared `evaluateClientVersion()` function in `min-client-version.guard.ts`, used by both the existing `MinClientVersionGuard` and a new `minClientVersionMiddleware(pathPrefix)`. Registered the middleware in `main.ts` via `app.use(minClientVersionMiddleware(AUTH_BASE_PATH))` **before** `app.listen()` — this places it earlier in the underlying Express middleware stack than `AuthModule`'s own handler, which is attached later during `app.init()` (inside `listen()`).
- **Files modified:** `apps/api/src/common/min-client-version.guard.ts`, `apps/api/src/main.ts`
- **Verification:** `version-guard.e2e-spec.ts` below-floor case on `/v1/auth/get-session` now returns `426` with `client_version_below_minimum`; `auth.e2e-spec.ts` (6 tests) still passes unchanged, proving the new middleware does not interfere with the tracer's auth path.
- **Committed in:** `24a7f5e` (fix commit, following the `ec99e67` RED test commit)

**2. `main.ts` modified outside the plan's declared `files_modified` list**
- The plan's Task 2 `files` list covers only `version-guard.e2e-spec.ts` and `apps/mobile/lib/client-version.ts`; `main.ts` was not listed for either task. Modifying it was necessary to close the gap in deviation #1 above (the middleware has to be registered somewhere before `app.listen()`, and `main.ts` is the only place that call exists). Scope is minimal — two lines (an import and one `app.use()` call) plus a comment explaining the ordering.

---

**Total deviations:** 2 (1 Rule 1 bug fix with a real behavioral gap closed, 1 file-list note). **Impact:** the bug fix was necessary for the plan's own must-have ("A request carrying a client version below the configured floor receives HTTP 426... every route the client calls") to actually hold — without it, the auth surface would have been silently exempt from the floor.

## Issues Encountered

- This worktree had no `node_modules` (worktrees don't inherit untracked/hoisted `node_modules`) and no `.env` (gitignored). Ran `pnpm install --frozen-lockfile` and created a local `.env` from `.env.example`'s values (pointing at the existing local Postgres `fitness` database) to run typecheck and the e2e suites. Neither is a plan deviation — both are environment setup, not committed.

## Next Phase Readiness

Ready for 01-05, which will build the mobile request layer importing `apps/mobile/lib/client-version.ts` for `CLIENT_VERSION_HEADER`. The version floor is proven end-to-end on both the Nest-routed and Better-Auth-mounted surfaces; a future `SyncModule` controller in Phase 2 is automatically covered by the existing guard without further changes.

## Self-Check: PASSED

---
*Phase: 01-cross-platform-foundation*
*Completed: 2026-08-11*
