---
phase: 05-in-gym-session-logging
plan: 11
subsystem: database
tags: [drizzle, postgres, powersync, sqlite, sync, nestjs, write-back]

# Dependency graph
requires:
  - phase: 05-in-gym-session-logging
    provides: 05-02's schema-change pattern (four-surface: Postgres schema, SQLite mirror, sync.service.ts apply path, schema-parity gate) and 05-06/05-07's TargetsSheet/resolveWriteBackTarget contract
provides:
  - "workout_session.cycle_id column (Postgres schema + PowerSync SQLite mirror), stamped once in startSession, read back through LiveSessionRow, and threaded to TargetsSheet at both screen call sites — the write-side prerequisite for LOG-15/D-15's override-vs-base write-back resolution"
affects: [05-12, resolveWriteBackTarget, TargetsSheet, session-lifecycle]

# Actuals (#2632)
actuals:
  tokens: 7634
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "cycle_id follows the existing traceability-pointer pattern (routine_day_id, session_exercise.routine_exercise_id): no FK, no index, stamped once at insert, never rewritten by a read path."

key-files:
  created: []
  modified:
    - apps/api/src/db/schema/session.ts
    - apps/mobile/lib/db/schema.ts
    - apps/api/src/sync/sync.service.ts
    - apps/api/src/sync/patch-update-set.ts
    - apps/api/test/schema-parity.e2e-spec.ts
    - apps/api/test/session-annotations-sync.e2e-spec.ts
    - apps/mobile/lib/db/log-set.ts
    - apps/mobile/lib/db/history-mutations.ts
    - apps/mobile/lib/db/session-query.ts
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/components/EditingWorkoutScreen.tsx

key-decisions:
  - "Task 1's one-way schema addition was approved by the user (checkpoint answer relayed by the orchestrator: 'approve') before this worktree's executor started; no work was re-litigated."
  - "cycleId was added to patch-update-set.ts's WorkoutSessionValues interface and WORKOUT_SESSION_PATCH_FIELDS map, and mapped to the wire name 'cycle_id' (not null) — the same classification as routineDayId, since cycle_id is a normal client-authored field, not a server-derived one."
  - "Task 3 ran in the main working tree (not a worktree) specifically because the required .env is gitignored and only exists there — the prior halt's root cause. Resolving it needed a shell with real DATABASE_URL, not a workaround."
  - "Resolving Task 3 surfaced a second, pre-existing, plan-independent defect: every e2e durability spec failed at Playwright's test-collection step ('No tests found') because test-support.ts (imported only for the DURABILITY_HARNESS_GLOBAL string constant) transitively pulls in log-set.ts's bare './powersync' import, which Node's ESM resolver sends to the native powersync.ts / @powersync/react-native instead of the .web variant. Fixed by extracting the constant into a dependency-free leaf module, durability-harness-key.ts, and repointing all 10 specs at it. Recorded as WINDOWS #133."

patterns-established:
  - "A session's program-cycle identity is a stored, stamped-once column read back on every load, never re-derived from routine position or history (the promote decision in the plan's assumption-delta section)."

requirements-completed: [LOG-15]

coverage:
  - id: D1
    description: "workout_session.cycle_id column added to Postgres schema and PowerSync SQLite mirror; stamped once inside startSession; startWorkoutFromProgram and duplicateSession both feed it; LiveSessionRow reads it back; both screen call sites (workout.tsx, EditingWorkoutScreen.tsx) thread the real value instead of a hardcoded null."
    requirement: "LOG-15"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/log-set.test.ts#startSession — stamps cycle_id (LOG-15)"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/log-set.test.ts#startWorkoutFromProgram — threads cycleId to the session and every exercise (LOG-15)"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/history-mutations.test.ts#duplicateSession — copies the prescription, not the performance (LOG-20)"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/session-query.test.ts#loadSessionTree — returns the stored cycleId on the session row"
        status: pass
      - kind: unit
        ref: "pnpm --filter mobile typecheck"
        status: pass
      - kind: unit
        ref: "pnpm --filter api typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "Server apply path (sync.service.ts) accepts and validates cycle_id on workout_session ops: WorkoutSessionOpData.cycle_id, toWorkoutSessionValues' cycleId mapping, hasInvalidField's isValidOptionalStringOrNull(d.cycle_id) rejection, and WORKOUT_SESSION_PATCH_FIELDS' cycle_id wire mapping."
    requirement: "LOG-15"
    verification:
      - kind: unit
        ref: "apps/api/src/sync/__tests__/patch-update-set.spec.ts#a PATCH naming every mutable workout_session column returns every key"
        status: pass
      - kind: e2e
        ref: "apps/api/test/session-annotations-sync.e2e-spec.ts#LOG-15: workout_session.cycle_id (both new cases: PUT-stores-value and PATCH-rejects-non-string)"
        status: pass
      - kind: unit
        ref: "pnpm --filter api typecheck"
        status: pass
    human_judgment: false
  - id: D3
    description: "Live Postgres database physically carries workout_session.cycle_id (drizzle-kit push), schema-parity's db:verify confirms it via the REQUIRED_COLUMNS gate, and a real browser proves the PowerSync client SQLite mirror redefines cleanly with the added column (e2e/schema-redefinition.spec.ts)."
    requirement: "LOG-15"
    verification:
      - kind: e2e
        ref: "pnpm --filter api db:push"
        status: pass
      - kind: e2e
        ref: "pnpm --filter api db:verify (schema-parity.e2e-spec.ts, 32/32)"
        status: pass
      - kind: e2e
        ref: "pnpm --filter mobile test:e2e:durability -- e2e/schema-redefinition.spec.ts (4/4)"
        status: pass
    human_judgment: false

duration: 27min (worktree, Task 2) + resolution session (Task 3, main tree)
completed: 2026-08-25
status: complete
---

# Phase 05 Plan 11: Session Cycle ID Persistence Summary

**Persisted `workout_session.cycle_id` end to end (Postgres + PowerSync SQLite schemas, sync apply path, client write funnel, client read, both screen call sites) so write-back resolves against the cycle a session actually started in — proven against the live Postgres database and a real browser SQLite mirror in this session.**

## Performance

- **Duration:** 27 min (worktree portion, Task 2) + this resolution session (Task 3, run in the main working tree)
- **Started:** 2026-08-25T16:15:00Z (approx, first file read in the worktree)
- **Completed:** 2026-08-25 (Task 3 resolved in the main tree, same day)
- **Tasks:** 3 of 3 tasks complete (Task 1 checkpoint approved, Task 2 executed and committed, Task 3 executed and verified against the live database)
- **Files modified:** 16 (Task 2) + 12 (this session's loader-fix deviation, see below)

## Accomplishments
- Added `cycle_id` (text, nullable, no FK) to both the Postgres `workout_session` pgTable and the PowerSync SQLite mirror, following the existing traceability-pointer pattern used by `routine_day_id`.
- `startSession` stamps `cycle_id` exactly once at insert (the column's only writer); `startWorkoutFromProgram` and `duplicateSession` both feed it through that single funnel — no second insert path.
- `LiveSessionRow.cycleId` reads the stored value back through `loadSessionTree`; both `workout.tsx` and `EditingWorkoutScreen.tsx` now hand the real stored `cycleId` to `TargetsSheet` instead of a hardcoded `null` — the override branch of `resolveWriteBackTarget` is no longer dead code in production call sites.
- Server apply path (`sync.service.ts`) accepts, validates (`isValidOptionalStringOrNull`), and patch-classifies `cycle_id` on `workout_session` ops; `schema-parity.e2e-spec.ts`'s `REQUIRED_COLUMNS` gate now names it.
- **Task 3 (this session):** `pnpm --filter api db:push` applied the column to the live Postgres database; `pnpm --filter api db:verify` passed 32/32 (schema-parity, including the new `cycle_id` requirement); `pnpm --filter api test:e2e -- session-annotations-sync` passed 13/13, including both new LOG-15 cases (stores `cycle_id`, rejects a non-string/non-null value); `pnpm --filter mobile test:e2e:durability -- e2e/schema-redefinition.spec.ts` passed 4/4 against a real browser and a real `@powersync/web` database.
- **Deviation fixed en route (this session):** every e2e durability spec (all 10, not just schema-redefinition) had been failing Playwright's test-collection step with "No tests found" since before this plan existed — a pre-existing, plan-independent module-resolution defect. Fixed by extracting `DURABILITY_HARNESS_GLOBAL` into a dependency-free leaf module. See Deviations below and WINDOWS #133.

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm the one-way schema addition** — checkpoint, no commit (answered `approve` by the user via the orchestrator before this worktree started).
2. **Task 2: Stamp and thread the session's cycle id through every layer** — `c62d9b8` (feat, tdd)
3. **Task 3: Push the schema to the live database and prove both mirrors** — no commit (Task 3 only reads `apps/api/drizzle.config.ts` and `apps/api/test/schema-parity.e2e-spec.ts`, per its own `<files>` list; its "done" criterion is the three commands passing against the live database, not a file change). Verified in this session with real exit codes — see Next Phase Readiness.
4. **Deviation: extract the durability harness key to a dependency-free leaf module** — `107dae9` (fix), not part of the plan's task list — see Deviations below.

_Task 2 was a `tdd="true"` tracer task; its own `<verify>` (four mobile jest files plus both `mobile`/`api` typecheck) ran and passed as part of the single commit above — no separate RED/GREEN split was applicable since the plan's `<behavior>` cases were authored directly as passing unit tests against the real implementation._

## Files Created/Modified
- `apps/api/src/db/schema/session.ts` — added `cycleId: text('cycle_id')` to `workoutSession`
- `apps/mobile/lib/db/schema.ts` — added `cycleId: text('cycle_id')` to the SQLite mirror
- `apps/api/src/sync/sync.service.ts` — `WorkoutSessionOpData.cycle_id`, `toWorkoutSessionValues`, `hasInvalidField`
- `apps/api/src/sync/patch-update-set.ts` — `WorkoutSessionValues.cycleId`, `WORKOUT_SESSION_PATCH_FIELDS.cycleId` (deviation, see below)
- `apps/api/test/schema-parity.e2e-spec.ts` — `cycle_id` added to `REQUIRED_COLUMNS.workout_session`
- `apps/api/test/session-annotations-sync.e2e-spec.ts` — new `LOG-15: workout_session.cycle_id` describe block (two cases), `WorkoutSessionRow`/`readWorkoutSession` extended
- `apps/mobile/lib/db/log-set.ts` — `StartSessionInput.cycleId`, `startSession`'s insert, `startWorkoutFromProgram`'s funnel call
- `apps/mobile/lib/db/history-mutations.ts` — `duplicateSession`'s source select and `startSession` call
- `apps/mobile/lib/db/session-query.ts` — `LiveSessionRow.cycleId`, `loadSessionTree`'s session select
- `apps/mobile/app/(tabs)/workout.tsx` — `pageDataByExercise` reads `sessionRow?.cycleId ?? null`
- `apps/mobile/components/EditingWorkoutScreen.tsx` — `pageDataByExercise` reads `session?.session.cycleId ?? null`
- `apps/mobile/app/(tabs)/__tests__/workout.test.tsx` — fixture updated for `LiveSessionRow`'s new required field (deviation)
- `apps/api/src/sync/__tests__/patch-update-set.spec.ts` — fixture and exhaustive-PATCH test updated for the new column (deviation)
- Test files extended per plan: `apps/mobile/lib/db/__tests__/log-set.test.ts`, `session-query.test.ts`, `history-mutations.test.ts`
- `apps/mobile/lib/db/durability-harness-key.ts` — new, dependency-free leaf module holding `DURABILITY_HARNESS_GLOBAL` (deviation, this session, see below)
- `apps/mobile/lib/db/test-support.ts` — re-exports `DURABILITY_HARNESS_GLOBAL` from the new leaf module instead of defining it inline (deviation, this session)
- `apps/mobile/e2e/*.spec.ts` (all 10 durability specs) — import `DURABILITY_HARNESS_GLOBAL` from the new leaf module instead of `test-support.ts` (deviation, this session)

## Decisions Made
- Task 1's approval was relayed by the orchestrator as `approve` before this worktree's executor began; not re-litigated (per the dispatch's explicit instruction).
- `cycleId` was classified in `WORKOUT_SESSION_PATCH_FIELDS` as `'cycle_id'` (write-when-named), matching `routineDayId`'s precedent — not `null` (which would mean unconditionally written on every PATCH). This is correct because `cycle_id` is client-authored data, not server-derived.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `cycleId` to `patch-update-set.ts`'s `WorkoutSessionValues` interface and `WORKOUT_SESSION_PATCH_FIELDS` map**
- **Found during:** Task 2, `pnpm --filter api typecheck`
- **Issue:** `patch-update-set.ts` is not in the plan's `files_modified` list, but `toWorkoutSessionValues` returns `WorkoutSessionValues` (defined there), and that interface backs `PatchFieldMap`'s exhaustiveness gate. Adding `cycleId` to the return object without classifying it in the map would not compile — the file's own design deliberately makes this a compile error, not a silent hole.
- **Fix:** Added `cycleId: string | null` to `WorkoutSessionValues` and `cycleId: 'cycle_id'` to `WORKOUT_SESSION_PATCH_FIELDS`.
- **Files modified:** `apps/api/src/sync/patch-update-set.ts`
- **Verification:** `pnpm --filter api typecheck` exits 0; `patch-update-set.spec.ts` passes.
- **Committed in:** `c62d9b8` (Task 2 commit)

**2. [Rule 3 - Blocking] Updated two pre-existing test fixtures that construct full `WorkoutSessionValues`/`LiveSessionRow` objects**
- **Found during:** Task 2, `pnpm --filter api typecheck` and `pnpm --filter mobile typecheck`
- **Issue:** `apps/api/src/sync/__tests__/patch-update-set.spec.ts`'s `workoutSessionValues()` fixture and its "every mutable workout_session column" exhaustive-PATCH test, plus `apps/mobile/app/(tabs)/__tests__/workout.test.tsx`'s inline `LiveSessionRow` fixture, both predate this plan and construct full objects of the now-widened types. Both failed to typecheck with `cycleId` missing.
- **Fix:** Added `cycleId: null` to the `patch-update-set.spec.ts` fixture and `cycle_id: 'cycle-2'` to its exhaustive-PATCH op data (so the test's own claim — "every mutable column" — stays true); added `cycleId: null` to the `workout.test.tsx` fixture.
- **Files modified:** `apps/api/src/sync/__tests__/patch-update-set.spec.ts`, `apps/mobile/app/(tabs)/__tests__/workout.test.tsx`
- **Verification:** Both typechecks exit 0; both test files pass in full.
- **Committed in:** `c62d9b8` (Task 2 commit)

**3. [Rule 3 - Blocking] Extracted `DURABILITY_HARNESS_GLOBAL` into a dependency-free leaf module**
- **Found during:** Resolving this plan's halt, running Task 3's third command (`pnpm --filter mobile test:e2e:durability -- e2e/schema-redefinition.spec.ts`)
- **Issue:** The command failed at Playwright's test-collection step with "No tests found" — not a test failure, a module-load crash affecting all 10 durability specs. Every spec imports `test-support.ts` for the single `DURABILITY_HARNESS_GLOBAL` string constant. `test-support.ts` also re-exports `startWorkoutFromProgram` from `log-set.ts`, which imports the bare `'./powersync'`. Node's ESM resolver (Playwright runs specs under Node, not Metro) has no platform-extension awareness, so it resolves that to the native `powersync.ts`, whose `@powersync/react-native` import chain fails under strict Node ESM (the package's dist re-exports omit file extensions). This defect predates this plan entirely — it is why 05-VERIFICATION.md carries 2 `behavior_unverified` truths and why all 12 durability specs were "written but never executed."
- **Fix:** Created `apps/mobile/lib/db/durability-harness-key.ts`, a new leaf module holding only the `DURABILITY_HARNESS_GLOBAL` constant with zero imports. `test-support.ts` now re-exports it (so `__durability.web.tsx`'s existing import keeps working unchanged — that file is bundled by Metro, not run under Node, so platform-extension resolution was never its problem). All 10 e2e spec files now import the constant directly from the leaf module instead of from `test-support.ts`.
- **Files modified:** `apps/mobile/lib/db/durability-harness-key.ts` (new), `apps/mobile/lib/db/test-support.ts`, and all 10 files in `apps/mobile/e2e/*.spec.ts`.
- **Verification:** `pnpm --filter mobile typecheck` exits 0. `pnpm --filter mobile test:e2e:durability -- e2e/schema-redefinition.spec.ts` collects and runs 4/4 passing (previously: 0 tests found, hard crash). The existing four jest suites (`log-set.test.ts`, `session-query.test.ts`, `history-mutations.test.ts`, `session-mutations.test.ts`, 95 tests) still pass unaffected.
- **Committed in:** `107dae9` (fix, this session)
- **Recorded:** WINDOWS #133 (`deviation`) — not caused by any plan; discovered and fixed while resolving this plan's halt.

---

**Total deviations:** 3 auto-fixed (2 Rule 3 compile fixes from Task 2's original worktree, 1 Rule 3 blocking-defect fix from this session)
**Impact on plan:** All three were necessary, mechanical, and stayed within the blast radius of the change that surfaced them. No scope creep.

## Issues Encountered

**Workspace packages were unbuilt in this fresh worktree (Task 2, prior session).** `pnpm --filter mobile test` initially failed with `Cannot find module '@fitness/api-contracts'` (and, after that, `@fitness/pr-rules`) — the workspace symlinks were present but `packages/api-contracts/dist` and `packages/pr-rules/dist` did not exist yet (fresh worktree, never built). Ran `pnpm build` in `packages/api-contracts`, `packages/pr-rules`, and `packages/progression-engine` (same class of issue) to unblock. This is an environment-setup issue, not a plan deviation — no source was changed.

**Task 3 was blocked on a missing `.env` (prior session, now resolved).** Task 3 requires `DATABASE_URL` to run `drizzle-kit push`, `db:verify`, and the client `schema-redefinition.spec.ts` browser e2e against a live Postgres. The prior worktree had no `.env` file (gitignored, not copied by `git worktree add`), and the harness's permission settings refused to write one into the worktree. Filed as WINDOWS #132 (`unrun-verify`). Resolved in this session by running Task 3 directly in the main working tree, where `.env` already exists — no workaround, no guessed credential.

**The live database is native Homebrew Postgres, not the Docker container.** `fitness-postgres-1`'s published port is shadowed by a native Postgres already listening on `127.0.0.1:5432`; `psql "postgresql://localhost:5432/fitness"` reaches the real target database. Not touched or "fixed" — noted for whoever next wonders why the Docker container looks unused.

**A stale Expo dev server was occupying port 8081.** Killed before running the durability e2e suite so Playwright's own `webServer` block could start a harness-enabled instance (`EXPO_PUBLIC_DURABILITY_HARNESS=1`).

**`apps/mobile/public/` was empty — the PowerSync web worker assets had never been generated.** The first full run of the durability project (all 10 specs, `pnpm --filter mobile test:e2e:durability`) failed all 23 collected tests with a runtime `[PowerSync]: Error in database or sync worker` banner and `page.evaluate` timeouts — a real browser page loaded and rendered the harness "ready" state, but every PowerSync database call hung. Root cause: `postinstall`'s `powersync-web copy-assets -o public` had never run (or its output was cleared), so `getPowerSync()`'s configured worker path `/@powersync/worker.js` 404'd and the shared worker never initialized. Ran `npx powersync-web copy-assets -o public` inside `apps/mobile` to regenerate the gitignored, generated asset directory (`.gitignore` line 13 covers `apps/mobile/public/`) — no source change, no commit needed. After regenerating, `schema-redefinition.spec.ts` run in isolation passed 4/4. This is an environment-setup gap (the equivalent of an unbuilt workspace package, not a code defect) and is not recorded in WINDOWS.

## User Setup Required

None. Everything needed to close this plan out was resolvable from the main working tree with the repository's existing `.env` and a workspace `pnpm install`/`postinstall` step that had not yet run in this environment.

## Next Phase Readiness

**This plan is complete.** All three tasks are done: Task 1 was approved by the user, Task 2 is committed (`c62d9b8`) and fully verified, and Task 3's three commands all ran with real exit code 0 against the live database and a real browser:

- `pnpm --filter api db:push` — exit 0, applied (idempotent on re-run; the column was already present from a prior push).
- `pnpm --filter api db:verify` — exit 0, `schema-parity.e2e-spec.ts` 32/32 passed, including "has every required column on workout_session" (which now names `cycle_id`).
- `pnpm --filter api test:e2e -- session-annotations-sync` — exit 0, 13/13 passed, including both new LOG-15 cases (stores `cycle_id`; rejects a non-string/non-null `cycle_id` as `invalid_field`).
- `pnpm --filter mobile test:e2e:durability -- e2e/schema-redefinition.spec.ts` — exit 0, 4/4 passed against a real `@powersync/web` database in a real Chromium browser.

05-12 (the browser-real end-to-end proof plan) can now build on this plan's schema in the live database. No blockers remain for this plan. The pre-existing test-collection defect that blocked all 10 durability specs is fixed at its root (`durability-harness-key.ts`) and should not recur for any future spec added to that suite, since the same leaf-module import pattern now applies uniformly.

---
*Phase: 05-in-gym-session-logging*
*Completed: 2026-08-25*

## Self-Check: PASSED
- FOUND: `apps/mobile/lib/db/durability-harness-key.ts`
- FOUND: commit `c62d9b8` (Task 2)
- FOUND: commit `107dae9` (loader-fix deviation)
- `grep -c "cycle_id" apps/api/src/db/schema/session.ts` == 1
- `grep -c "cycle_id" apps/mobile/lib/db/schema.ts` == 2
