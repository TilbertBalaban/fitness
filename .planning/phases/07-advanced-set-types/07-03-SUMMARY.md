---
phase: 07-advanced-set-types
plan: 03
subsystem: ui
tags: [react-native, session-logging, auto-advance, set-types]

requires:
  - phase: 07-advanced-set-types
    plan: 01
    provides: "LoggedSetRow/ResolvedSetRow carry parentSetId through the read path; countsTowardWorkingVolume published in @fitness/api-contracts"
provides:
  - "shouldAutoAdvance filtered to parent rows (parentSetId === null) before its existing working-set-type filter — D-19"
  - "countCompletedWorkingSets filtered to parent rows and routed through the shared countsTowardWorkingVolume predicate instead of an inline '!== warmup' comparison — D-10/R13"
  - "All workout.tsx and EditingWorkoutScreen.tsx call sites thread the row's real parentSetId into both functions' required input fields"
affects: [08-progression-engine, 09-analytics, 10-records, 07-04, 07-05, 07-06, 07-08]

actuals:
  tokens: 3147
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Required (not optional) new interface field forces every call site to a typecheck error rather than a silent undercount — caught a fourth call site (EditingWorkoutScreen.tsx) the plan's own file list did not name"

key-files:
  created: []
  modified:
    - apps/mobile/lib/session/auto-advance.ts
    - apps/mobile/lib/session/__tests__/auto-advance.test.ts
    - apps/mobile/components/ExerciseStrip.tsx
    - apps/mobile/components/__tests__/ExerciseStrip.test.tsx
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/components/EditingWorkoutScreen.tsx

key-decisions:
  - "Added parentSetId as a REQUIRED field on both AutoAdvanceSetInput and ExerciseChipSet rather than optional, per the plan's own threat mitigation (T-7-09) — the clean pnpm -w typecheck run is the completeness proof, and it caught a real fourth call site."
  - "Fixed EditingWorkoutScreen.tsx's identical countCompletedWorkingSets call site under Rule 3 (blocking typecheck failure) even though it was outside this plan's files_modified list — the required-field change reaches every existing caller by construction, and leaving it broken would have blocked the plan's own acceptance criterion (pnpm -w typecheck exits 0)."

requirements-completed: [SETS-02, SETS-06]

coverage:
  - id: D1
    description: "shouldAutoAdvance returns null for one completed parent plus three completed children against a 4-set target — the group counts as 1 of 4, not 4 of 4"
    requirement: "SETS-02"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/auto-advance.test.ts#is null when a drop set of one parent and three children has only satisfied 1 of 4 prescribed sets"
        status: pass
    human_judgment: false
  - id: D2
    description: "shouldAutoAdvance still returns currentIndex + 1 for four completed parent working sets against a 4-set target, unchanged from before this plan"
    requirement: "SETS-02"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/auto-advance.test.ts#still returns the next index once four completed parent working sets satisfy a 4-set prescription"
        status: pass
    human_judgment: false
  - id: D3
    description: "countCompletedWorkingSets counts a completed parent as 1 and its completed children as 0"
    requirement: "SETS-02"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/ExerciseStrip.test.tsx#counts a completed parent working set as 1 and its completed children as 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "countCompletedWorkingSets excludes only warmup — a completed drop/myorep/failure/amrap PARENT row still counts as 1"
    requirement: "SETS-06"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/ExerciseStrip.test.tsx#counts a completed drop/myorep/failure/amrap PARENT row (no parent of its own) as 1 — the exclusion is warm-up-only"
        status: pass
    human_judgment: false
  - id: D5
    description: "The warm-up exclusion in ExerciseStrip.tsx routes through the shared countsTowardWorkingVolume predicate, not an inline string comparison — the fifth pre-existing copy of the rule is gone"
    requirement: "SETS-06"
    verification:
      - kind: unit
        ref: "grep -v '^\\s*//' apps/mobile/components/ExerciseStrip.tsx | grep -c \"!== 'warmup'\" == 0; grep -c countsTowardWorkingVolume apps/mobile/components/ExerciseStrip.tsx == 3"
        status: pass
    human_judgment: false
  - id: D6
    description: "Every workout.tsx and EditingWorkoutScreen.tsx call site supplies the row's real parentSetId to both functions, enforced by a clean workspace typecheck"
    requirement: "SETS-02"
    verification:
      - kind: unit
        ref: "pnpm -w typecheck exits 0; pnpm --filter mobile test -- workout exits 0 (94 tests, 4 suites)"
        status: pass
    human_judgment: true
    rationale: "The plan's own deferred human-check — adding a drop-set child to set 1 of a 4-set exercise on the web target and confirming the strip still reads 1/4 and the pager does not jump — is deferred to the end-of-phase sweep per human_verify_mode: end-of-phase, not exercised by this plan's unit suite alone."

duration: 32min
completed: 2026-08-28
status: complete
---

# Phase 7 Plan 3: Auto-Advance and Strip Fraction Count Parent Rows Only Summary

**Filters `shouldAutoAdvance` and `countCompletedWorkingSets` to parent rows (`parentSetId === null`) before their existing working-set-type filters, and routes the strip's warm-up exclusion through the shared `countsTowardWorkingVolume` predicate instead of an inline string comparison, so a drop set or per-side pair reads and advances as one prescribed set rather than inflating the count with its sub-entries.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-08-28T10:09:00Z (approx.)
- **Completed:** 2026-08-28T10:41:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Closed D-19: `shouldAutoAdvance`'s `AutoAdvanceSetInput` gained a required `parentSetId` field and a parent-row filter inserted immediately before the existing `WORKING_SET_TYPE` filter, leaving the `requiredCount` fallback, the `allWorkingComplete` comparison, and both early-outs (warm-up completion, last exercise) untouched.
- Closed D-10/R13 at `ExerciseStrip.tsx`'s `countCompletedWorkingSets` — the fifth, previously undocumented copy of the warm-up exclusion — by filtering to parent rows first, then delegating to `countsTowardWorkingVolume` imported from `@fitness/api-contracts` rather than re-deriving `!== 'warmup'` inline.
- Threaded `parentSetId` through all three `workout.tsx` mapping expressions that build these functions' inputs: the `exercises` map, the draft-completion branch's `setsAfter` (synthetic entry is always a parent, per the plan's own rule that a sub-entry is only ever created by the picker or the group's add control), and the existing-row toggle branch.
- Discovered and fixed a fourth call site outside this plan's declared file list — `EditingWorkoutScreen.tsx` has the identical `countCompletedWorkingSets` pattern as `workout.tsx`'s `exercises` map, and making `parentSetId` a required field turned the omission into a `pnpm -w typecheck` failure exactly as the plan's own threat mitigation (T-7-09) intended.
- `shouldAutoAdvance` still exports as the only function in `auto-advance.ts` — the superset-internal advance predicate D-14/07-06 will add is not folded into it.

## Task Commits

1. **Task 1: Auto-advance and the strip fraction count parent rows only** - `c3791d7` (feat)
2. **Task 2: Supply parentSetId at both workout.tsx call sites** - `d98389a` (feat)

## Files Created/Modified

- `apps/mobile/lib/session/auto-advance.ts` - `AutoAdvanceSetInput.parentSetId`, parent-row filter in `shouldAutoAdvance`
- `apps/mobile/lib/session/__tests__/auto-advance.test.ts` - `parentSetId: null` on every fixture, two new behavior cases for the counting rule
- `apps/mobile/components/ExerciseStrip.tsx` - `ExerciseChipSet.parentSetId`, `countCompletedWorkingSets` rewritten to filter-then-delegate
- `apps/mobile/components/__tests__/ExerciseStrip.test.tsx` - `parentSetId: null` on every fixture, two new behavior cases
- `apps/mobile/app/(tabs)/workout.tsx` - `parentSetId` threaded at the `exercises` map, the draft-completion `setsAfter`, and the existing-row toggle `setsAfter`
- `apps/mobile/components/EditingWorkoutScreen.tsx` - `parentSetId` threaded at its own `countCompletedWorkingSets` call site (Rule 3 fix, out-of-scope file)

## Decisions Made

- Kept `parentSetId` a required field (not optional) on both widened interfaces, matching the plan's explicit instruction and threat mitigation T-7-09: a required field turns a missed call site into a compile error, and this run's own `EditingWorkoutScreen.tsx` discovery is direct evidence the mechanism works as designed.
- Did not fold D-14's future superset-internal advance predicate into `shouldAutoAdvance` — confirmed the file still exports exactly one function after the edit (`grep -c "^export function"` == 1).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `EditingWorkoutScreen.tsx` also calls `countCompletedWorkingSets` without `parentSetId`**
- **Found during:** Task 2's `pnpm -w typecheck` run
- **Issue:** `EditingWorkoutScreen.tsx` has an `exercises` map at line ~294 structurally identical to `workout.tsx`'s, calling `countCompletedWorkingSets` with a row shape missing the new required `parentSetId` field. This file was not in the plan's `files_modified` list.
- **Fix:** Added `parentSetId: row.parentSetId ?? null` to the mapped object, mirroring the exact fix applied to `workout.tsx`.
- **Files modified:** `apps/mobile/components/EditingWorkoutScreen.tsx`
- **Commit:** `d98389a`

## Issues Encountered

None beyond the deviation above. The fresh-worktree bootstrap (`pnpm install`, `pnpm -w build`) completed cleanly and satisfied Task 1's precondition (`packages/api-contracts/dist` exporting `countsTowardWorkingVolume`) before any task work began.

## Next Phase Readiness

- D-10's counting rule now holds at every call site this repository currently has for both functions — `workout.tsx`, `EditingWorkoutScreen.tsx`, and the two pure functions' own test suites.
- 07-06 (superset) can add its narrower D-14 advance predicate beside `shouldAutoAdvance` without touching this plan's filter.
- The plan's own deferred human-check (visually confirming a drop-set child on a 4-set exercise reads 1/4 and does not advance the pager, on the web target) remains open per `human_verify_mode: end-of-phase`.

## Self-Check: PASSED

- FOUND: apps/mobile/lib/session/auto-advance.ts
- FOUND: apps/mobile/components/ExerciseStrip.tsx
- FOUND: apps/mobile/app/(tabs)/workout.tsx
- FOUND: apps/mobile/components/EditingWorkoutScreen.tsx
- FOUND commit c3791d7
- FOUND commit d98389a

---
*Phase: 07-advanced-set-types*
*Completed: 2026-08-28*
