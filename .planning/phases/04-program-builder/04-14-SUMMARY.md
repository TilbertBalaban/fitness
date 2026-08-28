---
phase: 04-program-builder
plan: 14
subsystem: ui
tags: [react-native, jest, drizzle]

# Dependency graph
requires:
  - phase: 04-program-builder
    provides: routine_day.archived_at, archiveDay/restoreDay, loadProgramTree filtered to live days (04-12)
provides:
  - "Mark Ready action in the library's routine action sheet, wired to markRoutineReady"
  - "A regression proving loadNextUp inherits loadProgramTree's archived-day filter rather than owning a second one"
  - "A regression proving archiving a day never rewrites already-logged session_exercise history"
affects: [04-15, 04-program-builder]

# Actuals (#2632)
actuals:
  tokens: 3400
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mark Ready follows the exact hidden-not-disabled precedent Activate already set: an action that cannot change anything is omitted rather than shown inert"
    - "resolveNextUp's archived-day cases are literal mirrors of its deleted-day cases — the pure function cannot distinguish the two, so the test suite doesn't pretend to either"

key-files:
  created: []
  modified:
    - apps/mobile/app/programs/library.tsx
    - apps/mobile/app/programs/__tests__/library-screen.test.ts
    - apps/mobile/lib/db/__tests__/next-up-query.test.ts
    - apps/mobile/lib/programs/__tests__/next-up.test.ts
    - apps/mobile/lib/db/__tests__/log-set.test.ts
    - .planning/WINDOWS.md

key-decisions:
  - "D-31 (pre-resolved): Mark Ready is an explicit action, never implicit on activation. Guard is `!archived && row.status !== 'ready'`, independent of isActive — pinned by a dedicated test on the active draft row."
  - "The plan's 'routine_day_id' claim for Task 3 refers to workout_session.routine_day_id, not session_exercise (which carries no such column, only routine_exercise_id) — seeded a workoutSession row in the two cases that assert it rather than misreading it onto the snapshot."

patterns-established: []

requirements-completed: [PROG-07]

coverage:
  - id: D1
    description: "A program can be marked ready from the library action sheet by an explicit act, and the action is absent (not disabled) on already-ready and archived rows"
    requirement: "PROG-07"
    verification:
      - kind: unit
        ref: "apps/mobile/app/programs/__tests__/library-screen.test.ts#actionsForRow offers Mark Ready on a draft row, between Activate and Duplicate"
        status: pass
      - kind: unit
        ref: "apps/mobile/app/programs/__tests__/library-screen.test.ts#actionsForRow omits Mark Ready once a program is already ready"
        status: pass
      - kind: unit
        ref: "apps/mobile/app/programs/__tests__/library-screen.test.ts#actionsForRow omits Mark Ready on an archived row"
        status: pass
      - kind: unit
        ref: "apps/mobile/app/programs/__tests__/library-screen.test.ts#actionsForRow still offers Mark Ready on the active draft row"
        status: pass
      - kind: other
        ref: "grep -rl markRoutineReady apps/mobile/app apps/mobile/components --include=*.tsx | grep -v __tests__ names library.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Home rotation's day list is inherited from loadProgramTree's archived-day filter, with no second query added in next-up-query.ts"
    requirement: "PROG-07"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/next-up-query.test.ts#loadNextUp — a bounded number of queries carries a where clause on the day select it inherits from loadProgramTree"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/next-up-query.test.ts#loadNextUp — a bounded number of queries issues no day select of its own — the select count for a full load stays at the shipped bound"
        status: pass
      - kind: other
        ref: "git diff --quiet -- apps/mobile/lib/db/programs/next-up-query.ts apps/mobile/lib/programs/next-up.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Archiving a day rewinds resolveNextUp's rotation the same way deleting one already does, mirrored across countableHistory, lastLoggedDayIndex and resolveNextUp"
    requirement: "PROG-07"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/programs/__tests__/next-up.test.ts#resolveNextUp — an archived day (D-29 mirror of the deleted-day path)"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/programs/__tests__/next-up.test.ts#countableHistory excludes a session logged against a day that has since been archived"
        status: pass
    human_judgment: false
  - id: D4
    description: "Archiving a day never changes what an already-logged workout shows: session_exercise's five snapshot columns, workout_session.routine_day_id and the surviving routine_exercise/routine_exercise_cycle_target children all stay untouched"
    requirement: "PROG-07"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/log-set.test.ts#PROG-11 leaves the snapshot untouched when the day it was logged against is archived"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/log-set.test.ts#PROG-11 does not cascade: an archived day keeps its routine_exercise and routine_exercise_cycle_target children"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/log-set.test.ts#PROG-11 leaves the snapshot untouched by an archive-then-restore round trip"
        status: pass
      - kind: other
        ref: "git diff --quiet -- apps/mobile/lib/db/log-set.ts apps/mobile/lib/db/programs/days.ts"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-08-28
status: complete
---

# Phase 04 Plan 14: Mark Ready wiring, Home-rotation and history-safety regressions Summary

**`markRoutineReady` gets its first non-test call site — a Mark Ready action in the library's routine action sheet — plus two pinning regressions proving 04-12's archived-day filter is correctly inherited by the Home rotation and never touches already-logged history.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-28T15:00Z (approx, worktree base)
- **Completed:** 2026-08-28T15:31:21Z
- **Tasks:** 3
- **Files modified:** 6 (5 source/test + WINDOWS.md ledger)

## Accomplishments
- `MARK_READY` action added to `actionsForRow`, hidden (not disabled) once already `ready` or archived, not gated on `isActive` — pins D-31's rejection of implicit advancement on activation
- `handleSelectAction`'s `MARK_READY` case wired to `markRoutineReady`, closing WINDOWS #89 (the `04-VERIFICATION.md` gap-3 failed truth)
- `next-up-query.test.ts` gains structural assertions (where-clause presence, unchanged select count) proving `loadNextUp` inherits the archived-day filter through `loadProgramTree` rather than owning a second query
- `next-up.test.ts` gains an archived-day describe block that mirrors the existing deleted-day cases exactly — `countableHistory` drops the session, `resolveNextUp` rewinds via `w2` rather than skipping ahead, `lastLoggedDayIndex` falls back to day 0 (Pitfall-5), and an all-archived routine resolves to `no-days`
- `log-set.test.ts`'s PROG-11 describe block gains archive/restore cases: the five snapshot columns stay frozen, `workout_session.routine_day_id` and the `routine_day` row survive, `routine_exercise`/`routine_exercise_cycle_target` children survive (no cascade), and an archive-then-restore round trip is inert
- WINDOWS #89 marked `fixed` via `gsd-tools windows fixed 89`

## Task Commits

1. **Task 1: Mark Ready in the routine action sheet** - `e4e7745` (feat)
2. **Task 2: Archived days are out of the Home rotation** - `2a4691b` (test)
3. **Task 3: Archiving a day never changes what a logged workout shows** - `832da21` (test)

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `apps/mobile/app/programs/library.tsx` - `MARK_READY` constant, `actionsForRow` branch, `handleSelectAction` case, `markRoutineReady` import
- `apps/mobile/app/programs/__tests__/library-screen.test.ts` - `markRoutineReady` mock export; four new `actionsForRow` cases
- `apps/mobile/lib/db/__tests__/next-up-query.test.ts` - structural where-clause and select-count assertions for the inherited day filter
- `apps/mobile/lib/programs/__tests__/next-up.test.ts` - archived-day mirror of `countableHistory`/`lastLoggedDayIndex`/`resolveNextUp`'s deleted-day cases
- `apps/mobile/lib/db/__tests__/log-set.test.ts` - `archiveDay`/`restoreDay` imports; four new PROG-11 cases
- `.planning/WINDOWS.md` - entry 89 marked `fixed`

## Decisions Made
- **D-31 (pre-resolved):** Mark Ready is an explicit action wired to the orphaned `markRoutineReady`, guarded by `!archived && row.status !== 'ready'` with no dependence on `isActive` — a program can be both the one being trained and one not yet finished being authored.
- Task 2's structural claim (where-clause presence on `routineDay`) is explicitly documented as structural only in both the test comments and this SUMMARY: the fake db in `next-up-query.test.ts` ignores `where` conditions and returns fixed rows regardless, so it cannot prove archived rows are actually excluded — that behavioural proof lives in `programs.test.ts`'s condition-resolving store (04-12) and the browser suite (04-15).
- Task 3's "routine_day_id" claim, read literally against the plan text, resolves to `workout_session.routine_day_id` — `session_exercise` carries no such column (only `routine_exercise_id`, per `apps/mobile/lib/db/schema.ts`). Seeded a `workoutSession` row in the two cases asserting this rather than misreading it onto the snapshot row.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected Task 3's routine_day_id assertion to the row that actually carries it**
- **Found during:** Task 3, first test run (RED confirmed the wrong assumption rather than the intended production gap)
- **Issue:** The plan's `<behavior>` says "archiveDay leaves the session's routine_day_id pointing at the same id" and the first draft of the test read this as `session_exercise.routineDayId`, which does not exist on that table — `session_exercise` carries `routine_exercise_id`, not `routine_day_id`; `workout_session` carries `routine_day_id`.
- **Fix:** Seeded a `workoutSession` row (`{ id: 's-1', routineDayId: 'd-1', status: 'completed' }`) in the two affected test cases and asserted `store.rowsOf(workoutSession)[0].routineDayId` instead.
- **Files modified:** `apps/mobile/lib/db/__tests__/log-set.test.ts` (test-only, no production file touched)
- **Verification:** `pnpm --filter mobile test -- log-set` — both cases green after the fix
- **Committed in:** `832da21` (Task 3 commit; the fix landed before the commit, not as a follow-up)

---

**Total deviations:** 1 auto-fixed (1 bug, test-authoring error caught by RED before commit)
**Impact on plan:** No scope creep, no production code touched. The correction was necessary for the test to assert what the plan actually intends.

## Issues Encountered

**Fresh-worktree bootstrap:** the worktree had no `node_modules` and no built workspace packages. Ran `pnpm install` and `npx turbo run build` before any test/typecheck/build command — no source files were touched to work around this, consistent with 04-12's own note on the same friction.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 04-15 (the browser/Playwright suite), which is the plan named as owning the behavioural (not structural) proof that `loadNextUp`'s inherited day query actually excludes archived rows in a live PowerSync database.

No blockers. Sibling plan 04-13 (which owns `apps/mobile/app/(tabs)/programs.tsx` and `apps/mobile/components/ArchiveDialog.tsx`) was not touched by this plan.

---
*Phase: 04-program-builder*
*Completed: 2026-08-28*

## Self-Check: PASSED
