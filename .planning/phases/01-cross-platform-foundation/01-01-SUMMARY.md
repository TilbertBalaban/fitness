---
phase: 01-cross-platform-foundation
plan: 01
subsystem: infra
tags: [pnpm, turborepo, nestjs, drizzle, postgres, better-auth, expo, expo-router, jest, supertest]

requires: []
provides:
  - "pnpm/Turborepo workspace with apps/api, apps/mobile, packages/api-contracts, packages/progression-engine"
  - "NestJS 11 API with URI versioning enabled from the first request (defaultVersion '1')"
  - "Drizzle Postgres schema holding Better Auth's user, session, account and verification tables"
  - "Self-hosted Better Auth (D-05) mounted at /v1/auth with the expo() server plugin"
  - "Better Auth Expo client bound to expo-secure-store, one call site across native and web"
  - "Expo Router sign-up and sign-in screens and a session-backed home screen"
  - "API e2e suite driving the built artifact over real HTTP against a live Postgres"
  - "Schema-parity gate proving the live database matches schema.ts"
affects: [01-02, 01-03, 01-04, 01-05, 01-06, 01-07, 01-08, phase-02-sync]

actuals:
  tokens: 41000
  tasks: 4
  commits: 2

tech-stack:
  added:
    - "pnpm 11.9.0 workspaces + turbo 2.10.9"
    - "@nestjs/core 11.1.29, @nestjs/platform-express"
    - "better-auth 1.6.26, @better-auth/expo 1.6.26, @thallesp/nestjs-better-auth 2.7.0"
    - "drizzle-orm 0.45.2, drizzle-kit 0.31.10, pg"
    - "expo 57.0.12, expo-router 57.0.12, expo-secure-store 57.0.1, react-native 0.86.2"
    - "jest 30, supertest 7, dotenv 17"
  patterns:
    - "Versioned auth surface via betterAuth({ basePath: '/v1/auth' })"
    - "Env loaded in the module that reads it, not the entrypoint"
    - "e2e drives the built artifact over HTTP rather than an in-process Nest testing module"

key-files:
  created:
    - apps/api/src/main.ts
    - apps/api/src/auth/auth.ts
    - apps/api/src/db/schema.ts
    - apps/api/src/db/drizzle.module.ts
    - apps/mobile/lib/auth-client.ts
    - apps/mobile/app/_layout.tsx
    - apps/mobile/app/(auth)/sign-up.tsx
    - apps/api/test/auth.e2e-spec.ts
    - apps/api/test/schema-parity.e2e-spec.ts
    - pnpm-workspace.yaml
    - turbo.json
  modified:
    - README.md

key-decisions:
  - "Auth mounts at /v1/auth via betterAuth({ basePath }), not NestJS versioning — enableVersioning only routes controllers, and Better Auth is mounted as middleware, so without this the auth surface would have been the one unversioned part of the API"
  - "trustedOrigins reads WEB_ORIGINS from the environment — the web build is a browser client on a real origin and needs it trusted or Better Auth omits Access-Control-Allow-Credentials"
  - "Better Auth's hardcoded 3-per-10s limit on /sign-in and /sign-up is kept as the production default; only an explicit env override (used by the e2e suite) loosens it"
  - "react/react-dom pinned to 19.2.3 workspace-wide via pnpm overrides so better-auth resolves to one peer-variant instance"
  - "TypeScript incremental compilation disabled in apps/api — combined with nest-cli deleteOutDir it silently emits nothing"

patterns-established:
  - "Versioned-from-the-first-request API: nothing is reachable without an explicit /v1 segment, asserted in auth.e2e-spec.ts"
  - "Schema-parity gate: build and typecheck cannot go green against an unmigrated database"
  - "Platform-branched session storage behind one authClient.useSession() call site"
  - "No REST CRUD surface for per-user mutable domain data (ARCHITECTURE.md §3 Anti-Pattern 1) — apps/api ships zero controllers"

requirements-completed: [PLAT-01, PLAT-05]

coverage:
  - id: D1
    description: "A person can create an account from the app and land on a screen showing the email their new session returned"
    requirement: PLAT-05
    verification:
      - kind: e2e
        ref: "apps/api/test/auth.e2e-spec.ts#signs a new account up and reads the same email back from get-session"
        status: pass
      - kind: automated_ui
        ref: "chrome-devtools: sign-up form at localhost:4300 -> landed on '/' showing browser-tracer@example.com"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every API route carries an explicit /v1 version segment; nothing is served unversioned"
    verification:
      - kind: e2e
        ref: "apps/api/test/auth.e2e-spec.ts#serves every auth route under an explicit version segment"
        status: pass
    human_judgment: false
  - id: D3
    description: "Duplicate sign-up creates exactly one row and never overwrites the first account's password hash"
    requirement: PLAT-05
    verification:
      - kind: e2e
        ref: "apps/api/test/auth.e2e-spec.ts#rejects a second sign-up for the same email without creating a second row"
        status: pass
    human_judgment: false
  - id: D4
    description: "Two concurrent sign-ups for one email resolve to exactly one persisted user"
    verification:
      - kind: e2e
        ref: "apps/api/test/auth.e2e-spec.ts#resolves two concurrent sign-ups for one email to exactly one persisted user"
        status: pass
    human_judgment: false
  - id: D5
    description: "Better Auth owns every credential operation; no project-authored crypto exists"
    verification:
      - kind: other
        ref: "grep -rn 'createHash|pbkdf2|bcrypt|scrypt' apps/api/src -> no match"
        status: pass
      - kind: e2e
        ref: "apps/api/test/auth.e2e-spec.ts#never echoes the submitted password in any auth response body"
        status: pass
    human_judgment: false
  - id: D6
    description: "The Drizzle schema is provably applied to the live database"
    verification:
      - kind: e2e
        ref: "apps/api/test/schema-parity.e2e-spec.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "The same account is usable on iOS, Android, and a desktop browser from one codebase"
    requirement: PLAT-01
    verification:
      - kind: automated_ui
        ref: "chrome-devtools: account created in one browser context signed in from a second isolated context"
        status: pass
    human_judgment: true
    rationale: "The web target and the shared-server claim are proven automatically, but iOS and Android were not exercised — no simulator was launched in this session. The three-platform pass needs a human running pnpm dev against a simulator and emulator."
  - id: D8
    description: "The packages/progression-engine slot exists and holds no progression logic"
    verification:
      - kind: other
        ref: "packages/progression-engine/src/index.ts exports only a placeholder constant"
        status: pass
    human_judgment: false

duration: 78min
completed: 2026-08-11
---

# Phase 01 Plan 01: Walking Skeleton Summary

Stood up the pnpm/Turborepo workspace and drove one tracer through every layer Phase 1 touches —
NestJS 11 with URI versioning, Drizzle/Postgres, self-hosted Better Auth, the Better Auth Expo
client, and Expo Router auth screens — proven end to end by creating an account through the web
build's real sign-up form and landing on a session-backed screen.

**Duration:** 78 min | **Tasks:** 4 | **Files:** 38 | **Commits:** 2

## Accomplishments

- One workspace linking `mobile`, `api`, `@fitness/api-contracts`, `@fitness/progression-engine`
- NestJS API with `enableVersioning({ type: URI, defaultVersion: '1' })` and **zero** controllers —
  the per-user-mutable-data ingress stays reserved for Phase 2's `SyncModule`
- Better Auth self-hosted against the project's own Postgres via `drizzleAdapter`, with the `expo()`
  server plugin, a 180-day session floor, and rate limiting on
- Expo Router root layout gating on `authClient.useSession()` with no network on the launch path
- 9 passing e2e assertions across two suites, run against a live Postgres

## Task Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | Package legitimacy gate | (checkpoint — no code) |
| 2 | Self-hosted identity confirmation | (checkpoint — no code) |
| 3 | End-to-end tracer | `1ebc115` |
| 4 | Schema push gate | `6fc64cb` |

## Auto-Resolved Checkpoints

| Gate | Type | Resolution | Basis |
|---|---|---|---|
| Task 1 — package legitimacy | `checkpoint:human-verify`, `blocking-human` | **approved** | Resolved by the actual human through the AskUserQuestion permission surface, not auto-approved. Supporting evidence gathered first: `@thallesp/nestjs-better-auth` v2.7.0, repo `ThallesP/nestjs-better-auth`, maintainer `thallesp`, not deprecated, published 2026-07-04, 596 stars, MIT, last push 2026-07-04; peer deps `better-auth >=1.5.0 <2.0.0` and `express ^5.1.0`; `@better-auth/expo` shares the sole maintainer `bekacru` with `better-auth` core. |
| Task 2 — self-hosted identity | `checkpoint:decision`, `blocking` | **proceed-as-decided** | Auto-resolved under the user's "auto-resolve all non-human gates" selection. D-05 is already locked upstream (Clerk raised and rejected during discussion); this gate reconfirms rather than re-opens. |

## Deviations from Plan

**[Rule 2 — missing critical] `apps/mobile/app/(auth)/_layout.tsx` was not in the plan's file list**
Found during: Task 3. The root layout's `Stack.Protected guard` references `name="(auth)"`, but an
Expo Router group is only addressable as a route when it has its own layout. Without it the build
warned `No route named "(auth)" exists` on every render and the group leaked into web URLs
(`/(auth)/sign-in` alongside `/sign-in`). Added a 5-line group layout. Plan 01-06 lists this same
file and will expand it. Verified: warning gone, routes clean. Commit `1ebc115`.

**[Rule 1 — bug] `@better-auth/cli` lags `better-auth` core (1.4.21 vs 1.6.26)**
The plan called for generating `schema.ts` with `npx @better-auth/cli generate`. The CLI's latest
published version is two minors behind core. Ran it anyway as a cross-check: its output matched the
hand-written columns exactly and additionally supplied DB-level defaults, `$onUpdate`, indexes on
`user_id`/`identifier`, and relations. Adopted the generated output. The schema is additionally
proven correct empirically — sign-up, sign-in and get-session all round-trip against it.

**[Rule 1 — bug] `incremental: true` + nest-cli `deleteOutDir: true` silently emits nothing**
Found during: Task 3. `nest build` wiped `dist/`, then tsc consulted a stale `tsconfig.tsbuildinfo`,
concluded nothing had changed, and emitted nothing — exiting 0 with no output and no error. Disabled
`incremental` in `apps/api/tsconfig.json` and gitignored `*.tsbuildinfo`.

**[Rule 1 — bug] Web target was broken by missing CORS trusted origin**
Found during: Task 3 browser verification. `trustedOrigins` listed only the app scheme and the Expo
dev origin, so Better Auth omitted `Access-Control-Allow-Credentials` and every credentialed request
from the served web build failed preflight. This is precisely the "RN Web divergence discovered
late" pitfall the phase exists to surface, and no server-side test would have caught it. Replaced the
hardcoded origin with `WEB_ORIGINS` (comma-separated, env-sourced), documented in `.env.example`.
Verified: preflight now returns `Access-Control-Allow-Credentials: true`.

**[Rule 1 — bug] Two peer-variant `better-auth` instances broke client typing**
`better-auth` takes `react`/`react-dom` as optional peers; the API side resolved react 19.2.8 while
Expo pins 19.2.3, so pnpm built two instances. Pinned `react`/`react-dom` to 19.2.3 workspace-wide
via `overrides`. One React across an Expo workspace is correct independently.

**[Rule 3 — blocker] Jest cannot load the ESM-only auth stack in-process**
`@thallesp/nestjs-better-auth` and `better-auth` ship ESM only. Node 22 loads them fine via
`require(esm)` — which is why the built app runs — but Jest's CommonJS module runtime cannot.
Rather than transform a deep ESM dependency chain, the e2e suite spawns the built `dist/main.js` on
an ephemeral port and drives it over real HTTP. This is a stronger end-to-end test than an in-process
Nest testing module, and `test:e2e` now builds first.

**Total deviations:** 6 auto-fixed (1 missing-critical, 4 bugs, 1 blocker). **Impact:** two of them
(CORS, silent empty build) were live defects that would have blocked later plans; the rest are
contained and documented.

## Known Issues

- **`@better-auth/expo` 1.6.26 type variance.** Its `getActions($fetch)` is declared more narrowly
  than `BetterAuthClientPlugin` requires, which `strictFunctionTypes` rejects. Suppressed with a
  single `@ts-expect-error` in `apps/mobile/lib/auth-client.ts` rather than a cast, because a cast
  collapses `createAuthClient`'s inference and `useSession()` degrades to `never`. The suppression
  will fail loudly once upstream fixes the signature. Runtime is unaffected — this is the exact
  composition the Better Auth docs prescribe.
- **`react-native-worklets` peer warning.** `expo-modules-core` wants `<=0.10`; 0.11.3 resolves as an
  optional peer of `@expo/ui`, which this project does not use. `expo install --check` reports
  dependencies up to date.
- **Port 3000 default.** The committed default is 3000, which was occupied by an unrelated vite
  server on this machine during verification; the tracer was exercised on 3200 instead. No code
  change needed — `PORT` is env-driven.

## Verification

| Check | Result |
|---|---|
| `pnpm typecheck` (5 workspace tasks) | pass |
| `pnpm --filter api test:e2e` (2 suites, 9 tests) | pass |
| `pnpm --filter api db:push` | pass |
| Schema gate has teeth (drop `session` → spec fails) | verified by hand, then restored |
| Browser sign-up → session-backed screen | pass |
| Second isolated browser client signs into the same account | pass |
| Duplicate-email UI copy matches UI-SPEC | pass |
| iOS / Android simulators | **not run** — deferred to human UAT |

## Next Phase Readiness

Ready for 01-02 (NativeWind styling foundation) and 01-03 (version floor guard), which are wave 2 and
run in parallel. Both build on this scaffold without restructuring it. The one open item a later plan
inherits is the three-platform manual pass for PLAT-01.

## Self-Check: PASSED
