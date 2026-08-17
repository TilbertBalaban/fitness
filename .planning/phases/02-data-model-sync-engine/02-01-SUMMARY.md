---
phase: 02-data-model-sync-engine
plan: 01
subsystem: sync-engine
tags: [powersync, drizzle-orm, nestjs, expo-router, sqlite, postgres, offline-first]

requires:
  - phase: 01-cross-platform-foundation
    provides: "apiFetch's transport-vs-rejection AuthOutcome split, MinClientVersionGuard, DRIZZLE DI symbol, the app.module.ts seam reserved for SyncModule"
provides:
  - "PowerSync adopted as the project's local-first sync engine (Task 1 decision, human-approved)"
  - "The push wire contract (packages/api-contracts/src/sync.ts), additive-only from this commit"
  - "workout_session Postgres table with a client-UUID primary key and a sync_seq-backed server_seq column"
  - "SyncModule/SyncController/SyncService — the sole mutating ingress for synced rows (D-01)"
  - "The mobile PowerSync database factories (native + web) and SyncConnector, the sole caller of the push endpoint"
  - "Confirmation that PowerSync's beta React Native Web target bundles cleanly under this exact Expo SDK 57 / RN Web stack"
affects: [02-02, 02-03, 02-04, 02-05, 02-06, 02-07, 02-08]

actuals:
  tokens: 6164
  tasks: 3
  commits: 5

tech-stack:
  added:
    - "@powersync/react-native 2.1.0"
    - "@powersync/web 2.2.0"
    - "@op-engineering/op-sqlite 18.0.0"
    - "@powersync/drizzle-driver 0.8.0"
    - "@powersync/common 2.1.0 (direct dep, for pnpm strict type resolution)"
  patterns:
    - "PowerSyncBackendConnector as the sole D-01 enforcement point: uploadData never calls fetch directly, only apiFetch, and branches on the existing AuthOutcome union"
    - "Ownership re-verified from the authenticated session on every op (insert and update alike), never from client-supplied data"
    - "server_seq assigned from a Postgres sequence on every applied op, bumped explicitly in both the INSERT and the ON CONFLICT UPDATE branches of an upsert"
    - "Platform-split PowerSync database factory (powersync.ts / powersync.web.ts), matching Phase 1's .web.tsx escape-hatch convention"
    - "A side-effect-only top-level import (app/_layout.tsx) used solely to force Metro to resolve a beta package's web export map, with no functional call site yet"

key-files:
  created:
    - packages/api-contracts/src/sync.ts
    - apps/api/src/db/schema/session.ts
    - apps/api/src/sync/sync.module.ts
    - apps/api/src/sync/sync.controller.ts
    - apps/api/src/sync/sync.service.ts
    - apps/api/test/sync-push.e2e-spec.ts
    - apps/mobile/lib/db/schema.ts
    - apps/mobile/lib/db/powersync.ts
    - apps/mobile/lib/db/powersync.web.ts
    - apps/mobile/lib/db/connector.ts
    - apps/mobile/__tests__/offline-write.test.ts
    - .planning/phases/02-data-model-sync-engine/02-01-DECISION.md
    - .planning/phases/02-data-model-sync-engine/02-01-TASK2-VERIFICATION.md
  modified:
    - apps/api/src/db/schema.ts
    - apps/api/src/app.module.ts
    - apps/api/src/auth/auth.module.ts
    - apps/mobile/metro.config.js
    - apps/mobile/package.json
    - apps/mobile/app/_layout.tsx
    - packages/api-contracts/src/index.ts
    - .gitignore

key-decisions:
  - "Task 1 (checkpoint:decision, resolved by human): adopt PowerSync over the WatermelonDB fallback"
  - "Task 2 (checkpoint:human-verify, gate=blocking-human, resolved by human): all four SUS-verdict packages approved after registry evidence review, with two caveats recorded for audit (PowerSync packages' download counts ~20% under the plan's estimate; op-sqlite maintained under an individual npm account)"
  - "Raised the auth module's JSON body-parser limit to 2mb (apps/api/src/auth/auth.module.ts) — Express's un-configured 100kb default silently 413'd a near-SYNC_MAX_BATCH_OPS batch with realistic per-op payloads before it ever reached the app-level batch-size check"
  - "app/_layout.tsx carries a side-effect-only import of lib/db/powersync so the web export gate actually proves PowerSync's beta web bundling, rather than silently passing because nothing imported it yet"

patterns-established:
  - "Sync wire contract lives in packages/api-contracts/src/sync.ts, additive-only from this commit forward — later plans append rejection reasons and synced tables, never change existing ones"
  - "SyncService's per-op ownership check re-reads the target row's owner inside the same transaction on every PUT/PATCH/DELETE, never trusting that an id accepted once stays owned"

requirements-completed: [PLAT-02, PLAT-03]

coverage:
  - id: D1
    description: "Sync engine selection: PowerSync adopted over the WatermelonDB fallback, a one-way architectural commitment"
    requirement: ""
    verification: []
    human_judgment: true
    rationale: "checkpoint:decision — the plan requires an explicit human selection between two architecturally divergent paths; not a fact automation can establish."
  - id: D2
    description: "Package legitimacy gate: all four SUS-verdict PowerSync/op-sqlite packages cleared for install"
    requirement: ""
    verification: []
    human_judgment: true
    rationale: "gate=blocking-human — package-legitimacy verification is never auto-approvable per the deviation rules, even when the executor's own registry evidence looks clean."
  - id: D3
    description: "A workout session created offline is written to local SQLite with a client-generated UUID and reaches Postgres with that same id once a single push succeeds, idempotently, with ownership enforced per op"
    requirement: "PLAT-02, PLAT-03"
    verification:
      - kind: e2e
        ref: "apps/api/test/sync-push.e2e-spec.ts — 7 cases (401 gate, insert-with-client-id, idempotent replay, cross-user not_owner rejection, unknown_table rejection, batch_too_large rejection, empty-batch no-op)"
        status: pass
      - kind: unit
        ref: "apps/mobile/__tests__/offline-write.test.ts — 9 cases (local schema shape, client-side id generation with no network call, SyncConnector crud-op mapping and all four AuthOutcome branches)"
        status: pass
    human_judgment: false
  - id: D4
    description: "PowerSync's beta React Native Web target bundles cleanly on this exact Expo SDK 57 / RN Web stack and its worker/wasm assets resolve at the path the web factory expects"
    requirement: ""
    verification:
      - kind: other
        ref: "pnpm --filter mobile exec expo export --platform web (exit 0; output bundle includes wa-sqlite/VFS/worker chunks; dist/@powersync/worker.js present)"
        status: pass
    human_judgment: false

duration: ~55min
completed: 2026-08-17
status: complete
---

# Phase 2 Plan 1: Sync Engine Selection and Offline-First Workout Session Tracer Summary

**PowerSync adopted as the sync engine; one `workout_session` row now travels local SQLite -> crud queue -> `SyncConnector` -> `POST /v1/sync/push` -> Postgres, idempotently and ownership-checked, with the beta RN-Web target proven to bundle on this exact stack.**

## Performance

- **Duration:** ~55 min (this continuation session; Task 1/2 checkpoints spanned a prior session)
- **Tasks:** 3/3 completed
- **Files modified:** 22 (8 created source files, 8 modified, 2 test files, 2 planning decision records, 2 config/lockfile)

## Accomplishments

- Resolved the phase's architectural go/no-go: PowerSync selected over WatermelonDB, and the four SUS-verdict packages it requires were cleared by a human against live npm registry evidence.
- Built the full offline-first tracer slice end to end — local write, crud queue, connector, NestJS `SyncModule`, Drizzle transaction, Postgres — with real, passing tests on both sides (7 API e2e cases, 9 mobile unit cases).
- Proved the one genuinely open technical risk this plan existed to resolve: PowerSync's beta React Native Web support bundles correctly under Metro on this exact Expo SDK 57 / RN Web 0.21 stack, with its WASM/worker assets resolving at the expected static path.
- Found and fixed a real production bug in the process: Express's un-configured 100kb JSON body limit would have silently 413'd any push batch anywhere near `SYNC_MAX_BATCH_OPS` with realistic payloads, never reaching the app's own size-ceiling check.

## Task Commits

Each task was committed atomically:

1. **Task 1: The sync engine, and the wire shape that follows from it** (checkpoint:decision, resolved = PowerSync) - `8cd570a` (docs)
2. **Task 2: Package legitimacy gate before any sync package is installed** (checkpoint:human-verify, resolved = approved) - `138738e` (docs)
3. **Task 3: One workout, started offline, arriving in Postgres** (tracer, tdd=true) - three commits:
   - `1fd61ef` (chore) — install the four cleared packages, Metro config, worker-asset postinstall
   - `a933f70` (test — RED) — wire contract, sync-push.e2e-spec.ts, offline-write.test.ts (fail without the API/mobile implementation)
   - `45d4721` (feat — GREEN) — workout_session schema, SyncModule/Controller/Service, mobile db layer, connector, body-limit fix

**Plan metadata:** *(this commit, docs)*

_Note: Task 3 used the RED/GREEN TDD structure per its `tdd="true"` attribute — no REFACTOR commit was needed._

## TDD Gate Compliance

Task 3's gate sequence is present in git log: `test(02-01): add failing tests...` (`a933f70`) precedes `feat(02-01): wire offline-first workout session push...` (`45d4721`). No REFACTOR commit — none was needed after GREEN.

## Files Created/Modified

- `packages/api-contracts/src/sync.ts` - The additive-only push wire contract: `SyncCrudOp`, `SyncPushRequest`, `SyncPushResponse`, `SyncRejectionReason`, `SYNC_PUSH_PATH`, `SYNC_MAX_BATCH_OPS`, `SYNCED_TABLES`
- `apps/api/src/db/schema/session.ts` - `workoutSession` table (text client-UUID PK, `user_id` ownership column, `server_seq` bigint backed by the new `sync_seq` sequence)
- `apps/api/src/db/schema.ts` - Barrel updated to include `workoutSession`; `userRelations` extended with `workoutSessions`
- `apps/api/src/sync/sync.module.ts` / `sync.controller.ts` / `sync.service.ts` - The sole mutating ingress for synced rows (D-01); ownership re-verified per op, per-op upsert idempotent on the client UUID, `batch_too_large` rejects the whole request
- `apps/api/src/app.module.ts` - `SyncModule` registered in `imports`, filling the seam Phase 1 reserved
- `apps/api/src/auth/auth.module.ts` - JSON body-parser limit raised to `2mb` (see Deviations)
- `apps/api/test/sync-push.e2e-spec.ts` - 7 e2e cases against a spawned build and live Postgres
- `apps/mobile/lib/db/schema.ts` - Local Drizzle SQLite mirror of `workout_session`, snake_case columns matching the server
- `apps/mobile/lib/db/powersync.ts` / `powersync.web.ts` - Platform-split `PowerSyncDatabase` factories, both local-only (no `connect()` yet — plan 02-08's job)
- `apps/mobile/lib/db/connector.ts` - `SyncConnector`, the only caller of `/v1/sync/push`; branches on `AuthOutcome`, never a second offline concept
- `apps/mobile/app/_layout.tsx` - Side-effect-only import of `lib/db/powersync` so the web bundling gate actually exercises PowerSync's export resolution
- `apps/mobile/metro.config.js` - `unstable_enablePackageExports = true`, set before `withNativeWind` wraps the config
- `apps/mobile/package.json` - Four PowerSync packages + `@powersync/common`; `postinstall` copies web worker assets via the official `powersync-web copy-assets` CLI
- `apps/mobile/__tests__/offline-write.test.ts` - 9 unit cases: local schema shape, client-side id generation, and full `SyncConnector.uploadData` branch coverage
- `.gitignore` - `apps/mobile/public/` (generated PowerSync worker/wasm assets, never committed by hand)

## Decisions Made

- **PowerSync over WatermelonDB** (Task 1, human-resolved) — see `.planning/phases/02-data-model-sync-engine/02-01-DECISION.md` for the full options table and reasoning carried from the plan.
- **All four SUS-verdict packages approved** (Task 2, human-resolved) — see `.planning/phases/02-data-model-sync-engine/02-01-TASK2-VERIFICATION.md`, including the two caveats the human reviewed before approving (download-count shortfall on the PowerSync packages, op-sqlite's individual-account maintainer).
- **`@powersync/common` added as a direct mobile dependency** rather than relying on pnpm's transitive hoisting — its types are imported directly in `connector.ts` and the test file, and pnpm's strict `node_modules` layout does not expose transitive-only packages to direct imports. This also happened to resolve the peer-version mismatch flagged during install (see Known Caveats below).
- **`app/_layout.tsx` carries a side-effect-only import**, not a functional one — deliberately chosen over eagerly calling `getPowerSync()`, to avoid opening any database connection this plan does not yet need, while still forcing Metro to resolve PowerSync's web package exports so the bundling gate proves something real.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Express's default JSON body limit silently 413'd a near-ceiling sync push batch**
- **Found during:** Task 3, writing the `batch_too_large` e2e case
- **Issue:** Express's `body-parser` default JSON limit (100kb) rejected a 1001-op batch (~239KB with realistic per-op data) with an uncontrolled `PayloadTooLargeError`/413 before the request ever reached `SyncController`'s own `SYNC_MAX_BATCH_OPS` check. In production this would mean any client batch anywhere near the documented ceiling gets a raw transport error instead of the structured `batch_too_large` response the wire contract promises.
- **Fix:** Raised the JSON body-parser limit to `2mb` via `BetterAuthModule.forRoot({ ..., bodyParser: { json: { limit: '2mb' } } })` — the one seam in this codebase that configures the parser running in front of every non-auth route (Better Auth's own routes skip it and need the raw body directly).
- **Files modified:** `apps/api/src/auth/auth.module.ts`
- **Verification:** `sync-push.e2e-spec.ts`'s `batch_too_large` case passes with the plan's original (realistic per-op) payload shape, no test-side workaround needed.
- **Committed in:** `45d4721` (part of the Task 3 GREEN commit)

**2. [Rule 3 - Blocking issue] `expo export --platform web` could not actually prove PowerSync bundles, since nothing imported it**
- **Found during:** Task 3, running the web export verification gate
- **Issue:** None of Task 3's files are reachable from the app's Metro entry point — `powersync.ts`/`powersync.web.ts`/`connector.ts` are all leaf modules nothing imports yet. Running `expo export --platform web` against that state produced a green exit code that proved nothing about PowerSync's beta web-target bundling — the entire risk this tracer plan exists to surface.
- **Fix:** Added a side-effect-only `import '@/lib/db/powersync';` to `apps/mobile/app/_layout.tsx`, forcing Metro to resolve the module graph (and therefore PowerSync's conditional package exports) on every build, without calling `getPowerSync()` itself — only the pure `DrizzleAppSchema` construction runs at import time, so no database connection opens and no existing screen's behavior changes.
- **Files modified:** `apps/mobile/app/_layout.tsx`
- **Verification:** Web bundle grew from 3 assets to 16, including `wa-sqlite`/VFS/`worker-*.js` chunks; `dist/@powersync/worker.js` is present in the static export output at the exact path `powersync.web.ts`'s `WORKER_PATH` constant expects.
- **Committed in:** `45d4721` (part of the Task 3 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 3)
**Impact on plan:** Both fixes were necessary for the plan's own acceptance criteria to mean what they say — neither is scope creep. The body-limit fix is a genuine production correctness fix (Task 2's SUS-package caveats already primed close reading of this exact class of "looks fine until you push it near a real ceiling" issue). The `_layout.tsx` import is the minimum change that makes the web bundling gate load-bearing rather than a green light for an untested code path.

## Known Stubs / Verification Gaps

Recorded in `.planning/WINDOWS.md` (entries 16–17), following Phase 1's precedent for native-toolchain gaps:

- **`@op-engineering/op-sqlite` New Architecture compatibility** — unverified; no Xcode/Android SDK on this machine. This is `02-RESEARCH.md`'s own Open Question 2, carried forward unresolved as the plan anticipated.
- **PowerSync's real local-write and crud-queue population** — cannot run inside this Jest process (no native runtime, no browser with IndexedDB/Worker/WASM support). `offline-write.test.ts` proves the id-generation contract and `SyncConnector`'s mapping/branching logic against test doubles standing in for the local engine, not the real `@powersync/react-native`/`@powersync/web` SQLite round trip. The `expo export --platform web` bundling/asset-resolution proof is the closest this environment gets to a genuine web-target check.

Neither gap blocks this plan's own done criterion — both are pre-existing environment constraints Phase 1 already established the precedent for deferring to human/device UAT, not new stubs introduced by this plan's code.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## User Setup Required

None — no external service configuration required. `pull` (a running PowerSync Service) is explicitly out of scope for this plan; plan 02-08 stands that up.

## Next Phase Readiness

- The architectural go/no-go this whole phase's remaining plans (02-02 through 02-08) depend on is resolved: PowerSync is confirmed to work on this stack's web target, and the push wire contract is locked in as additive-only.
- `SYNCED_TABLES` currently contains only `workout_session` — later plans append to it as they add synced entities (`SessionExercise`, `LoggedSet`, etc.), never modifying the existing shape.
- `sync_seq`/`server_seq` is in place as the merge-ordering primitive Decision 2's per-entity conflict policy will read from plan 02-03 onward.
- No blockers. The two WINDOWS.md entries are environment-constrained verification gaps, not defects, and follow the same disposition Phase 1's equivalent native gaps received.

---
*Phase: 02-data-model-sync-engine*
*Completed: 2026-08-17*
