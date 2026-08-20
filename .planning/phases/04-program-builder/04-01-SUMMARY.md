---
phase: 04-program-builder
plan: 01
subsystem: sync
tags: [nestjs, drizzle, powersync, react-native, jest, sync-protocol]

# Dependency graph
requires:
  - phase: 02-data-model-sync-engine
    provides: SyncService.applyBatch's workout_session aggregate-root pattern, TABLE_MAP/AGGREGATE_RANK/HARD_DELETE_FORBIDDEN scaffolding, the client database-injection seam (WriteDb = getPowerSync())
  - phase: 03-exercise-catalog
    provides: the exercise/user_exercise_preference singleton-root precedent hasInvalidField and toRoutineValues copy the shape of, and the screen-state derivation pattern (deriveExerciseListScreenState) programs.tsx mirrors
provides:
  - A server-side push apply path for the routine aggregate root (ownership, ROUTINE_STATUSES/name validation, archive-only DELETE rejection)
  - applyBatch generalized from one hardcoded workout_session aggregate root to AGGREGATE_ROOT_TYPES / ROOT_TABLE_BY_TYPE / rootFamilyOf, supporting two aggregate-root families with per-family orphan healing
  - A real Programs tab: createRoutine/loadRoutines write helpers and a screen with all four render states
affects: [04-02-routine-day-and-exercise-tree, 04-04-routine-status-lifecycle, 04-11-programs-library]

# Actuals (#2632)
actuals:
  tokens: 6703
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AGGREGATE_ROOT_TYPES / ROOT_TABLE_BY_TYPE / rootFamilyOf: the seam every later aggregate-root table in this phase (routine_day, routine_exercise via 04-02) plugs into instead of adding another hardcoded op.type comparison"
    - "Server-forced ownership: toXValues always takes userId from the authenticated session argument, never from data.user_id — mirrored from toWorkoutSessionValues/toExerciseValues"

key-files:
  created:
    - packages/api-contracts/src/program.ts
    - apps/api/test/program-sync.e2e-spec.ts
    - apps/mobile/lib/db/programs/create-routine.ts
  modified:
    - apps/api/src/sync/sync.service.ts
    - apps/api/src/sync/patch-update-set.ts
    - packages/api-contracts/src/sync.ts
    - apps/mobile/app/(tabs)/programs.tsx

key-decisions:
  - "ROUTINE_STATUSES = ['draft', 'ready'] only — active lives on user_preference.active_routine_id (D-14) and archive on archived_at (D-05), so status never grows a third value here"
  - "routine.source is server-forced to 'user' on every client-authored push, exactly like exercise.isCustom/source — the seed script's 'seed' rows are written by direct SQL, never through this path"
  - "archivedAt IS a client-patchable field on routine (unlike exercise, where archive lives in a separate preference table) — archiving a routine is a user action that must sync per D-05"
  - "Program name is required and non-empty at both the client write boundary (createRoutine throws) and the server (hasInvalidField rejects invalid_field) — a half-built program is still a named program, never an untitled draft"
  - "PROG-01 is NOT marked complete in REQUIREMENTS.md by this plan: the requirement text is 'named training days', and this plan only creates the routine shell (no routine_day yet — that lands in 04-02). Marking it complete here would be a false claim; left as [ ] intentionally."

patterns-established:
  - "Pattern: applyBatch's aggregate-root generalization (AGGREGATE_ROOT_TYPES/ROOT_TABLE_BY_TYPE/rootFamilyOf) is the load-bearing seam for every later table this phase's remaining ten plans add"
  - "Pattern: a program write helper always takes db: WriteDb = getPowerSync() as its last parameter, matching log-set.ts's established database-injection seam (WINDOWS #23)"

requirements-completed: []

coverage:
  - id: D1
    description: "Server-side push apply path for routine: ownership resolved from session, status/name validated, DELETE rejected, PATCH only touches named fields"
    requirement: "PROG-01"
    verification:
      - kind: e2e
        ref: "apps/api/test/program-sync.e2e-spec.ts#program (routine) sync (e2e)"
        status: pass
      - kind: e2e
        ref: "apps/api/test/sync-push.e2e-spec.ts, apps/api/test/sync-aggregate.e2e-spec.ts, apps/api/test/exercise-sync.e2e-spec.ts (regression)"
        status: pass
    human_judgment: false
  - id: D2
    description: "applyBatch generalized to two aggregate-root families (workout_session, routine) via AGGREGATE_ROOT_TYPES/ROOT_TABLE_BY_TYPE/rootFamilyOf with per-family orphan healing"
    verification:
      - kind: e2e
        ref: "apps/api/test/program-sync.e2e-spec.ts#applies a batch containing one workout_session PUT and one routine PUT"
        status: pass
      - kind: unit
        ref: "grep AGGREGATE_ROOT_TYPES / ROOT_TABLE_BY_TYPE in apps/api/src/sync/sync.service.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Programs tab creates a draft program from a name field and lists non-archived programs from local SQLite, with loading/empty/error/populated states"
    requirement: "PROG-01"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/programs.test.ts#createRoutine, #loadRoutines"
        status: pass
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts#deriveProgramsScreenState"
        status: pass
      - kind: other
        ref: "pnpm --filter mobile build (expo export --platform web) — /programs route bundles"
        status: pass
    human_judgment: true
    rationale: "No simulator/emulator/device available in this worktree (no Xcode, no Android SDK) — the screen's actual on-device rendering and touch behavior have not been observed. Recorded as WINDOWS unrun-verify entry; native observation deferred to ROADMAP Phase 999.1."

duration: 32min
completed: 2026-08-20
status: complete
---

# Phase 4 Plan 01: Program Builder Tracer Summary

**Routine aggregate root gets a real server-side push apply path, `applyBatch` generalizes from one hardcoded aggregate root to a named two-family seam, and the Programs tab creates/lists draft programs from local SQLite.**

## Performance

- **Duration:** ~32 min (including a paused checkpoint for tracer-slice human review between tasks)
- **Started:** 2026-08-20T15:06:12Z
- **Completed:** 2026-08-20T15:37:54Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- `routine` left `PUSH_DEFERRED_TABLES` for `PUSH_APPLIED_TABLES` — a routine op pushed over HTTP now produces a real Postgres row, with ownership resolved from the authenticated session (never `data.user_id`), `status`/`name` validated server-side, and `DELETE` rejected (archive-only, D-05)
- `applyBatch`'s single hardcoded `workout_session` aggregate root became an explicit `AGGREGATE_ROOT_TYPES` set backed by `ROOT_TABLE_BY_TYPE` and `rootFamilyOf`, with per-family orphan healing (`healRootByFamily`) replacing the old single `healRoot` — the seam the phase's remaining ten plans plug `routine_day`/`routine_exercise` into
- `apps/mobile/lib/db/programs/create-routine.ts` ships `createRoutine`/`loadRoutines`, both behind the established `db: WriteDb = getPowerSync()` injection seam
- The Programs tab is a real screen: name field + Create Program button, a `FlashList` of non-archived programs, and all four screen states (`error`/`loading`/`empty`/`populated`) driven by a pure `deriveProgramsScreenState`

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end — a routine op pushed by a client becomes a Postgres row** - `a3f405a` (feat)
2. **Task 2: Create a program on the Programs tab and see it listed** - `dabc251` (feat)

_Note: both tasks carried `tdd="true"`; consistent with this repo's established commit history (single `feat` commits per task, not split RED/GREEN commits — see e.g. `530adbc`, `45d4721`), tests and implementation were committed together after being verified green together, not split into separate `test`/`feat` commits._

## Files Created/Modified
- `packages/api-contracts/src/program.ts` - `ROUTINE_STATUSES = ['draft', 'ready']`
- `packages/api-contracts/src/index.ts` - re-exports `./program`
- `packages/api-contracts/src/sync.ts` - `routine` moved from `PUSH_DEFERRED_TABLES` to `PUSH_APPLIED_TABLES`
- `packages/api-contracts/src/__tests__/program.test.ts` - new: `ROUTINE_STATUSES` order, applied/deferred classification, `isTerminalRejection` tripwire
- `packages/api-contracts/src/__tests__/sync.test.ts` - updated two assertions that depended on `routine` still being deferred
- `apps/api/src/sync/patch-update-set.ts` - `RoutineValues` + `ROUTINE_PATCH_FIELDS`
- `apps/api/src/sync/sync.service.ts` - `toRoutineValues`, `hasInvalidField`'s routine branch, `AGGREGATE_ROOT_TYPES`/`ROOT_TABLE_BY_TYPE`/`rootFamilyOf`, generalized root resolution/heal/ownership/`capturedRootSeq`, routine insert branch
- `apps/api/test/program-sync.e2e-spec.ts` - new: 9 e2e cases covering every `<behavior>` bullet
- `apps/mobile/lib/db/programs/create-routine.ts` - new: `createRoutine`, `loadRoutines`, `CreateRoutineInput`, `RoutineSummary`
- `apps/mobile/lib/db/__tests__/programs.test.ts` - new: insert shape, trim, blank-name rejection, db-injection seam pair, sorted/filtered load
- `apps/mobile/app/(tabs)/programs.tsx` - replaces `PlaceholderScreen` with the real screen
- `apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts` - new: all four `deriveProgramsScreenState` branches

## Decisions Made
- Kept `ROUTINE_STATUSES` to exactly `['draft', 'ready']` per D-14/D-15/D-16 — active and freeze live elsewhere, so status never needs a third value
- `routine.source` is server-forced to `'user'` on every push, matching the `exercise` table's `isCustom`/`source` precedent
- `archivedAt` is client-patchable on `routine` (unlike `exercise`), because D-05 requires archive to sync as a normal field on this table
- The create flow requires a non-empty name up front (client throws before any write, server rejects `invalid_field`) rather than allowing an untitled draft — this was confirmed via the tracer checkpoint review before Task 2 began
- **PROG-01 intentionally left unchecked in REQUIREMENTS.md.** The requirement text is "named training days" — this plan only creates the routine shell; `routine_day` creation is 04-02's work. Checking PROG-01 off now would misrepresent phase progress.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated two pre-existing assertions in `packages/api-contracts/src/__tests__/sync.test.ts` that broke because of this task's own change**
- **Found during:** Task 1 (moving `routine` from `PUSH_DEFERRED_TABLES` to `PUSH_APPLIED_TABLES`)
- **Issue:** `sync.test.ts` had two assertions written against the pre-plan classification: `PUSH_APPLIED_TABLES` was asserted to be exactly 5 tables (no `routine`), and `isTerminalRejection('unknown_table', 'routine')` was asserted `true` (deferred-table terminality). Both would fail once `routine` moved.
- **Fix:** Updated the first assertion to include `routine`; retargeted the second to `routine_day` (a table still genuinely deferred), preserving the assertion's original intent.
- **Files modified:** `packages/api-contracts/src/__tests__/sync.test.ts`
- **Verification:** `pnpm --filter @fitness/api-contracts test` — 69/69 passed
- **Committed in:** `a3f405a` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — pre-existing test assertions invalidated by this plan's own intentional change)
**Impact on plan:** No scope creep; a direct, necessary consequence of the plan's own `PUSH_APPLIED_TABLES` move.

## Issues Encountered
- **Missing `.env` in this worktree.** The worktree had no `.env` (gitignored, not carried over on worktree creation), so the e2e suites (which spawn the built API against a real local Postgres) could not run. Copied the existing dev `.env` from the main repo checkout (`/Users/tilbertbalaban/work/fitness/.env`) into this worktree to run verification; it remains untracked and was not committed.
- **Tracer feedback gate paused execution between tasks.** Per the executor protocol, since `workflow.auto_advance`/`workflow._auto_chain_active` were both `false` at Task 1's completion, execution stopped for human review of the tracer slice before Task 2 began. The coordinator resumed with "approved" and authorized auto-approval of remaining technical checkpoints for this plan, with UI/UX decisions still requiring a halt. No UI/UX checkpoint was needed for Task 2 — the plan's own action text fully specified the screen's structure, copy, and states.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The `routine` aggregate root's server-side apply path and the `AGGREGATE_ROOT_TYPES`/`ROOT_TABLE_BY_TYPE`/`rootFamilyOf` seam are ready for 04-02 to extend with `routine_day`/`routine_exercise` as a four-level chain.
- The Programs tab exists and creates real, synced draft programs — 04-02's day/exercise builder has a concrete screen and a `routine.id` to build against.
- **Blocker/concern:** No Xcode/Android SDK on this machine — the Programs tab's native rendering and touch behavior remain unverified. Recorded in `.planning/WINDOWS.md` as an `unrun-verify` entry; deferred to ROADMAP Phase 999.1 per standing project policy.

---
*Phase: 04-program-builder*
*Completed: 2026-08-20*

## Self-Check: PASSED

All created files verified present on disk (`packages/api-contracts/src/program.ts`, `apps/api/test/program-sync.e2e-spec.ts`, `apps/mobile/lib/db/programs/create-routine.ts`, `apps/mobile/app/(tabs)/programs.tsx`, this SUMMARY). All three commits (`a3f405a`, `dabc251`, `f9a3e42`) verified present in `git log`.
