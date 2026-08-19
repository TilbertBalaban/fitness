---
phase: 03-exercise-catalog
plan: 12
subsystem: database
tags: [powersync, sqlite, drizzle-orm, playwright, exercise-catalog, sync]

# Dependency graph
requires:
  - phase: 03-exercise-catalog
    provides: 03-11's CORS fix, which unblocked the browser session that surfaced G-03-2
provides:
  - "A real-browser Playwright case (e2e/catalog-load.spec.ts) that drives the production catalog loader against a real @powersync/web engine"
  - "A catalog write path (applyCatalogSnapshot) built only from plain INSERT / condition-scoped UPDATE statement shapes a PowerSync view can prepare"
  - "A Jest fake (load-snapshot.test.ts, refresh-catalog.test.ts) that fails in seconds if the upsert-clause grammar is reintroduced"
  - "refreshCatalog's never-throws contract made real (whole body wrapped, not just the transaction)"
  - "The exercises screen's mount-effect catch now logs the caught error instead of discarding it"
affects: [exercise-catalog UAT, any future plan touching lib/catalog/load-snapshot.ts or lib/db/test-support.ts]

# Actuals (#2632)
actuals:
  tokens: 6850
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Read-existing-ids-then-branch write pattern for PowerSync-managed tables: read a Set of existing ids before the loop, INSERT when absent / UPDATE ... WHERE id = ? when present, mutating the Set as inserts happen so within-artifact duplicate ids resolve last-write-wins instead of raising a uniqueness failure"
    - "test-support.ts 'app' schema variant: opens the exact production AppSchema (imported from './powersync.web', not a bare './powersync', to avoid Node ESM resolving to the native @powersync/react-native package under Playwright's runner) so a real-engine test can assert a real zero-upload-queue property against localOnly tables"

key-files:
  created:
    - apps/mobile/e2e/catalog-load.spec.ts
  modified:
    - apps/mobile/lib/catalog/load-snapshot.ts
    - apps/mobile/lib/catalog/refresh-catalog.ts
    - apps/mobile/lib/catalog/__tests__/load-snapshot.test.ts
    - apps/mobile/lib/catalog/__tests__/refresh-catalog.test.ts
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/app/exercises/index.tsx
    - apps/mobile/playwright.config.ts

key-decisions:
  - "Read-then-branch chosen over INSERT OR REPLACE per the plan's fix_direction_decided section — REPLACE is DELETE-then-INSERT and would reset the omitted archivedAt column to NULL, silently un-archiving every archived exercise on every refresh."
  - "Imported AppSchema from './powersync.web' explicitly rather than the plan's literal './powersync' — the bare import resolves under Node's ESM loader (Playwright's runner) to the native powersync.ts, whose @powersync/react-native dist re-exports omit file extensions and fail strict Node ESM resolution there. '.web' is the exact module the harness needs regardless, since this suite only ever runs against the web build."
  - "Killed a stale Expo dev server (PID 52431) that was bound to :8081 but serving the main repo checkout, not this worktree's edits — reusing it would have run the durability suite against stale code, defeating the point of a real-engine test. Playwright's own webServer then started a fresh instance rooted in this worktree."
  - "Built packages/api-contracts (pnpm build inside the package) before the first typecheck — a pre-existing environment gap (empty dist/) unrelated to this plan's file scope, blocking typecheck for the whole apps/mobile workspace."

requirements-completed: [EXER-01, EXER-02, EXER-03]

coverage:
  - id: D1
    description: "The production catalog loader (loadCatalogSnapshot/applyCatalogSnapshot) completes against a real @powersync/web engine in a real browser: 19 muscle groups, 870 seeded exercises, 3134 unique mappings, 1 catalog_meta row, upload queue at 0"
    requirement: "EXER-01"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/catalog-load.spec.ts#the production catalog loader accepts every statement it issues against a real @powersync/web engine, and re-applying the same snapshot changes no row count"
        status: pass
    human_judgment: false
  - id: D2
    description: "Re-applying the same snapshot over an already-populated database is accepted and changes no row count — proves the update branch and the artifact's 43 duplicate mapping ids are handled"
    requirement: "EXER-02"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/catalog-load.spec.ts (phase two, same test)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Jest suite fails within seconds, without a browser, if the upsert-clause grammar (onConflictDoUpdate/onConflictDoNothing) is reintroduced into the catalog write path"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/load-snapshot.test.ts#fakeDb — engine-shape assertions (regression gate for the upsert-against-a-view defect)"
        status: pass
    human_judgment: false
  - id: D4
    description: "refreshCatalog resolves to an outcome (never rejects) for every failure mode, including a local write throw; the exercises screen's mount-effect catch now logs the caught error instead of discarding it"
    requirement: "EXER-03"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/refresh-catalog.test.ts#resolves to write-failed rather than rejecting when the local write throws"
        status: pass
    human_judgment: false
  - id: D5
    description: "UAT tests 2, 3 and 5 (previously blocked on this defect) are structurally reachable again — they still need the human browser/device UAT pass, not claimed passed by this plan"
    verification: []
    human_judgment: true
    rationale: "UAT tests 2/3/5 require a human to actually walk the /exercises screen; this plan only removes the structural blocker (the catalog load succeeding), it does not itself constitute the UAT pass."

duration: ~25min
completed: 2026-08-19
status: complete
---

# Phase 03 Plan 12: Real-engine catalog write path Summary

**Rebuilt the catalog write path from plain INSERT/UPDATE statement shapes a PowerSync view can prepare, proven green against a real @powersync/web engine in a real browser — closing G-03-2, WINDOWS #33, and UAT test 4.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments

- **Task 1 (tracer):** Stood up `e2e/catalog-load.spec.ts`, a two-phase Playwright durability case driving the production `loadCatalogSnapshot` against a real `@powersync/web` engine, and observed the first true end-to-end RED on the real engine — closing the prior debug session's explicitly stated blind spot ("not executed against the real @powersync/web engine").
- **Task 2:** Rebuilt `applyCatalogSnapshot` for all four catalog tables (`muscle_group`, `seeded_exercise`, `exercise_muscle_mapping`, `catalog_meta`) using a read-existing-ids-then-branch pattern — plain `INSERT` when the id is new, condition-scoped `UPDATE ... WHERE id = ?` when it already exists — replacing every `.onConflictDoUpdate()` call. Gave the Jest fakes teeth: `values()` is now a thenable that performs the insert only when awaited and raises a uniqueness failure on a duplicate id; the conflict-clause methods still exist on the fake but now reject with the engine's own refusal text.
- **Task 3:** Made `refreshCatalog`'s "never throws" docblock claim structurally true (whole function body wrapped in try/catch, not only the transaction) and added a distinct `'write-failed'` outcome. The exercises screen's mount-effect catch now binds and logs the caught error before setting the failure state, so a future defect of this shape leaves a console diagnostic instead of costing a full debug session again.

## Task Commits

1. **Task 1: One catalog load, through the real engine, in a real browser — and make it fail first** - `95f938f` (test)
2. **Task 2: Rebuild the catalog write path from statement shapes a view supports, and give the Jest fake teeth** - `895ff7f` (fix)
3. **Task 3: Make the never-throws contract real, and stop discarding the catalog error** - `de0a2c2` (fix)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/mobile/e2e/catalog-load.spec.ts` - New two-phase Playwright durability case: fresh load, then re-apply over a populated database via a version sentinel
- `apps/mobile/lib/catalog/load-snapshot.ts` - `applyCatalogSnapshot` rebuilt with read-then-branch inserts/updates for all four catalog tables
- `apps/mobile/lib/catalog/refresh-catalog.ts` - Whole function body wrapped in try/catch; new `'write-failed'` `RefreshOutcome` variant
- `apps/mobile/lib/catalog/__tests__/load-snapshot.test.ts` - `fakeDb()` rebuilt: thenable insert with uniqueness check, conflict-clause methods reject with the engine's refusal text; new regression-gate tests
- `apps/mobile/lib/catalog/__tests__/refresh-catalog.test.ts` - Matching fake rebuild; new "resolves to write-failed" case
- `apps/mobile/lib/db/test-support.ts` - New `'app'` schema variant on `openTestPowerSync`/`reopenTestPowerSync`; `readCatalogTableCounts`/`readCatalogVersionRaw`/`writeCatalogVersionSentinel` raw-SQL helpers
- `apps/mobile/app/__durability.web.tsx` - New harness methods (`openCatalogDb`, `loadCatalog`, and three pass-throughs) inside the existing `EXPO_PUBLIC_DURABILITY_HARNESS`-guarded branch
- `apps/mobile/app/exercises/index.tsx` - Mount-effect catch now binds and logs the caught error
- `apps/mobile/playwright.config.ts` - Registered `catalog-load.spec.ts` in the `durability` project's `testMatch`

## Decisions Made

- **Read-then-branch over INSERT OR REPLACE** (plan-mandated direction, confirmed correct in execution): REPLACE would reset the deliberately-omitted `archivedAt` column to NULL on every re-seed, silently un-archiving previously archived exercises.
- **`AppSchema` imported from `./powersync.web` explicitly, not a bare `./powersync`** — deviation from the plan's literal instruction, required because Node's ESM resolver (which Playwright's test runner uses) has no platform-extension awareness. A bare `./powersync` resolved to the native `powersync.ts`, whose `@powersync/react-native` dist output omits file extensions in its own relative re-exports (invalid under strict Node ESM), breaking module load for every spec in the `durability` project, not just the new one. The `.web` module is the exact object `powersync.web.ts`'s `getPowerSync()` uses on the platform this suite exercises, so this is a correctness-neutral fix, not a scope change.
- **Killed a stale Expo dev server bound to :8081** that was rooted in the main repo checkout (not this worktree). Reusing it via Playwright's `reuseExistingServer` would have run the durability suite against code that didn't include this plan's changes at all, silently invalidating both the RED and GREEN observations. Playwright's own `webServer` step then started a correctly-rooted instance for every subsequent run.
- **Built `packages/api-contracts`'s `dist/`** before the first typecheck (`pnpm build` inside that package) — the worktree's fresh checkout had a workspace symlink to an empty `dist/`, failing typecheck across the whole `apps/mobile` workspace with `Cannot find module '@fitness/api-contracts'`. Pre-existing environment gap, not caused by this plan; Rule 3 auto-fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `packages/api-contracts` had no built `dist/`, failing typecheck workspace-wide**
- **Found during:** Pre-Task-1 baseline typecheck
- **Issue:** Fresh worktree checkout — `packages/api-contracts/dist/` did not exist, so every file importing `@fitness/api-contracts` (including `lib/catalog/load-snapshot.ts`, in this plan's own file scope) failed `tsc --noEmit` with `Cannot find module`.
- **Fix:** Ran `pnpm build` inside `packages/api-contracts` (plain `tsc`, no dependency changes).
- **Files modified:** None tracked by git (build output only; `dist/` is gitignored).
- **Verification:** `pnpm typecheck` clean afterward.
- **Committed in:** N/A (build artifact, not a source change)

**2. [Rule 3 - Blocking] Bare `./powersync` import broke Playwright's Node-based test runner**
- **Found during:** Task 1, first `--list` gate attempt
- **Issue:** Following the plan's literal instruction to import `AppSchema` from `./powersync` caused all three durability specs (not just the new one) to fail with `Cannot find module '.../lib/db/PowerSyncDatabase'` — Node's ESM loader resolved the bare import to the native `powersync.ts`, whose `@powersync/react-native` package ships an ESM `index.js` that re-exports `./db/PowerSyncDatabase` without a file extension, invalid under strict Node ESM resolution (a quirk in that package's build output, not something Metro's bundler-level resolver would ever hit).
- **Fix:** Imported `AppSchema` from `./powersync.web` explicitly instead — the exact module `powersync.web.ts`'s `getPowerSync()` already uses, and the only platform this harness ever runs against.
- **Files modified:** `apps/mobile/lib/db/test-support.ts`
- **Verification:** `pnpm typecheck` clean; `--list` gate collects all 6 specs (was 0 before the fix); full `durability` project run 6/6 green.
- **Committed in:** `95f938f` (Task 1 commit)

**3. [Rule 3 - Blocking] Stale dev server on :8081 was serving the wrong checkout**
- **Found during:** Pre-Task-1 environment check
- **Issue:** A leftover `npx expo start --web` process (PID 52431) was already bound to `:8081`, rooted at the main repo checkout (`/Users/tilbertbalaban/work/fitness/apps/mobile`), not this worktree. Playwright's `reuseExistingServer: !process.env.CI` would have silently reused it, running every durability spec against code that never included this plan's edits.
- **Fix:** Killed PID 52431, freeing the port so Playwright's own `webServer` step spawns a fresh instance rooted correctly in this worktree.
- **Files modified:** None (process management only).
- **Verification:** Subsequent Playwright runs confirmed serving this worktree's code (RED failure text matched the diagnosis exactly; GREEN after Task 2's fix).
- **Committed in:** N/A (not a code change)

---

**Total deviations:** 3 auto-fixed (all Rule 3 — blocking issues in the execution environment, none in the plan's own logic or scope)
**Impact on plan:** All three were necessary to run the plan's own verification steps at all. No scope creep — the write-path rebuild (Task 2) and the never-throws fix (Task 3) match the plan exactly, including all five documented traps.

## Real-engine evidence

**RED (Task 1, before any write-path change):**

```
Error: page.evaluate: Error: cannot UPSERT a view
    at p (http://localhost:8081/@powersync/worker.js:6:14048)
    at async Mt.cachedStatements (http://localhost:8081/@powersync/worker.js:6:26254)
    at async Mt.executeRaw (http://localhost:8081/@powersync/worker.js:6:25495)
    at async Mt.executeSingleStatementRaw (http://localhost:8081/@powersync/worker.js:6:25347)
    at async Mt.execute (http://localhost:8081/@powersync/worker.js:6:24792)
    at async Zt.runExclusive (http://localhost:8081/@powersync/worker.js:6:37778)
    at async Object.execute (http://localhost:8081/@powersync/worker.js:6:9174)
    at /apps/mobile/e2e/catalog-load.spec.ts:57:34
```

This is the first end-to-end observation of the defect on the real engine — closing the prior debug session's own stated blind spot ("Not executed against the real @powersync/web engine in a browser").

**Measured wall-clock fresh catalog load (real browser, real engine), across independent runs:** 690ms, 1446ms, 1121ms, 1107ms. All comfortably under a second in the common case; well under the 4-minute test timeout budgeted for ~4,000 statements crossing the Worker boundary.

**Task 2 revert check:** Temporarily restored one `.onConflictDoUpdate()` call in `applyCatalogSnapshot`'s muscle-group loop. `pnpm test -- lib/catalog/__tests__/load-snapshot.test.ts` immediately went red (4 failing tests) with the exact text `cannot UPSERT a view`, raised from the fake's `onConflictDoUpdate` method. Reverted; full suite (286/286) confirmed green again afterward.

**Pre-existing durability specs:** `durability.spec.ts` and `schema-redefinition.spec.ts` (4 test cases) stayed green through every `test-support.ts` change — confirmed with a full `--project=durability` run (6/6 passing) after Task 2 and again after Task 3.

## Issues Encountered

See "Deviations from Plan" above — all three issues were environmental (build artifact, module resolution under a different runtime than the plan anticipated, and a stray process from an earlier session), not defects in the plan's own design.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-03-2 is closed. UAT tests 2, 3 and 5 are structurally reachable again (the catalog screen's entry point no longer fails on every load) — **not thereby passed**; they still need the human browser/device UAT pass, and test 1's scroll-performance half (WINDOWS #37) remains open. Not marked passed in `03-UAT.md` by this plan, per its own success criteria.
- WINDOWS #33 marked `fixed`.
- No package.json in the repo gained a dependency across this plan's 3 commits.

---
*Phase: 03-exercise-catalog*
*Completed: 2026-08-19*
