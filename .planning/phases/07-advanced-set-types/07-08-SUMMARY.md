---
phase: 07-advanced-set-types
plan: 08
subsystem: session-logging
tags: [react-native, session-logging, per-side, drop-sets, grouping]

requires:
  - phase: 07-advanced-set-types
    plan: 05
    provides: "addSubEntry (set-groups.ts), the parent_set_id grouping mechanism, and set-row-builders.ts's badge/indent contract this plan's L/R pair reuses verbatim"
  - phase: 07-advanced-set-types
    plan: 07
    provides: "SessionActionSheet's perSideEnabled/perSideAvailable props (left undefined at the call site, this plan's own next-phase-readiness note), the ExercisePage Superset/Detach wiring pattern this plan's per-side wiring mirrors"
provides:
  - "per-side.ts: SIDE_LEFT/SIDE_RIGHT constants, isPerSideMode (D-21's derived-from-data mode with an ephemeral D-22 override), sideForNewSet, parentsAwaitingRightSide — the three pure, tested decisions behind per-side logging"
  - "workout.tsx: perSideOverrideByExercise screen state; the draft branch stamps side left on a new set when the mode is on; both completion call sites (draft branch and existing-row toggle) automatically create the right-side child exactly once, idempotently, via parentsAwaitingRightSide + addSubEntry"
  - "ExercisePage.tsx: perSideEnabled derived once via isPerSideMode over the page's own rows and passed into SessionActionSheet; enable-per-side/disable-per-side dispatched explicitly, immediate, no confirmation, no database write"
affects: [07-09, 08-progression-engine, 09-analytics, 10-records]

actuals:
  tokens: 7080
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "The same 'pure predicate module + composition test against fixtures' shape 07-06/07-07 established for superset.ts is reused verbatim for per-side.ts — handleCheckmarkPress is still not exported, so workout.test.tsx tests the exact sideForNewSet/parentsAwaitingRightSide composition the handler performs, not the handler itself"
    - "The automatic right-side child's idempotency lives entirely in the pure predicate (parentsAwaitingRightSide returns nothing once a right child exists) rather than a flag at either completion call site, so the draft branch and the toggle branch both call the same two-line grow-the-pair block with no shared mutable state between them"

key-files:
  created:
    - apps/mobile/lib/session/per-side.ts
    - apps/mobile/lib/session/__tests__/per-side.test.ts
  modified:
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/app/(tabs)/__tests__/workout.test.tsx
    - apps/mobile/components/ExercisePage.tsx
    - apps/mobile/components/EditingWorkoutScreen.tsx

key-decisions:
  - "isPerSideMode takes the override as an explicit boolean | undefined second argument, never ambient state — when defined it wins outright over the derived value in either direction, which is what makes D-22's 'turn per-side off while paired sets exist' expressible at all with no new column (D-21)."
  - "parentsAwaitingRightSide is the single trigger source for the automatic right child, called identically from both handleCheckmarkPress completion sites (the draft branch's logSet and the toggle branch's updateLoggedSet) — the two call sites never diverge in how they decide whether a right child is owed, only in how they build the PerSideRowInput[] they pass in."
  - "perSideRowsFor (workout.tsx) is the one place LoggedSetRow[]+RowOverride merge into PerSideRowInput[] — extracted as a named helper rather than inlined at each of the three call sites (draft branch, toggle branch, and the side-stamping call itself) that need it."
  - "EditingWorkoutScreen.tsx's own ExercisePage call site (outside this plan's declared files) needed perSideOverride/onSetPerSideOverride once those became required ExercisePageProps fields — supplied undefined and a no-op setter rather than threading real state through a correction subtree that has none: isPerSideMode still derives the mode correctly from each row's already-logged side with no override, so only the ability to proactively toggle it is unavailable there, not the read side."

patterns-established: []

requirements-completed: [SETS-09]

coverage:
  - id: D1
    description: "isPerSideMode, sideForNewSet and parentsAwaitingRightSide are three pure, tested decisions with no new column behind them: the mode is derived from any row carrying a non-null side, an explicit override wins in either direction (including turning the mode off while a paired set already exists), and the automatic right child is owed only by a COMPLETED left parent with no right child yet — never by an incomplete parent, a null-side parent, or a drop-set parent (the two grouping mechanisms share parent_set_id but never each other's triggers)"
    requirement: "SETS-09"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/per-side.test.ts — all 11 cases, including 'turning the mode off while paired sets already exist' and the drop-set-never-triggers-per-side case"
        status: pass
    human_judgment: false
  - id: D2
    description: "A set logged while per-side mode is on becomes a left-side parent (side left, parent_set_id null); completing it (via the draft branch or the existing-row toggle) creates exactly one right-side child (side right, the parent's own set_type, blank fields) — re-ticking an already-paired parent creates no second child, and un-ticking a left parent never removes its already-logged right child (CF-08)"
    requirement: "SETS-09"
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/workout.test.tsx#'handleCheckmarkPress — per-side stamping and the automatic right child (D-20, D-21, D-22)' — all 6 cases, including the named re-ticking and un-ticking cases"
        status: pass
      - kind: unit
        ref: "grep-based acceptance criteria: sideForNewSet/parentsAwaitingRightSide/SIDE_RIGHT reference counts in workout.tsx, zero bare 'right' string literal outside per-side.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "A completed per-side pair contributes exactly 1 to the strip fraction and shouldAutoAdvance's count, not 2 — the right child is filtered out by its own non-null parentSetId, the same D-10/D-19 parent-row filter drop/myorep/partial already rely on"
    requirement: "SETS-09"
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/workout.test.tsx#'a completed per-side pair contributes exactly 1 to shouldAutoAdvance's count'"
        status: pass
    human_judgment: false
  - id: D4
    description: "Per-side mode is switched on and off from the exercise's own action sheet (Log Left/Right Separately / Log as One Side), immediately, with no confirmation and no database write, and exactly one of the two rows is visible at a time — the toggle only affects future sets, never rewriting an already-logged single-sided or paired set (D-22)"
    requirement: "SETS-09"
    verification:
      - kind: unit
        ref: "grep-based acceptance criteria: isPerSideMode/enable-per-side/disable-per-side/onSetPerSideOverride reference counts in ExercisePage.tsx; no `await` in either per-side branch (confirmed no write)"
        status: pass
      - kind: unit
        ref: "apps/mobile/components/__tests__/SessionActionSheet.test.tsx (unchanged suite, still green — the sheet's own perSideEnabled/perSideAvailable row-visibility contract this plan threads real values into)"
        status: pass
    human_judgment: true
    rationale: "ExercisePage has no dedicated render-level test suite in this codebase (07-01/07-05/07-07's documented, inherited gap) — the wiring is verified structurally (grep counts, typecheck) and by the full targeted suite passing, not by a rendered end-to-end assertion. This plan's own deferred human-check (on the web target, enable Log Left/Right Separately, log a set, tick it, confirm an indented R-badged row appears beneath the L-badged parent with blank fields, and that the strip fraction moved by one, not two; and confirm the overflow sheet shows exactly one of the two per-side rows depending on state) is deferred to the end-of-phase sweep per human_verify_mode: end-of-phase, matching every sibling plan in this phase."
  - id: D5
    description: "Zero regression: the full workspace unit suite stays green now that per-side stamping and the automatic right child are wired into the two live completion call sites"
    verification:
      - kind: unit
        ref: "pnpm -w test — 92 suites, 1721 tests (mobile), all pass; pnpm -w typecheck exits 0"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-08-28
status: complete
---

# Phase 7 Plan 8: Per-Side Logging — the Derived Mode, the Automatic Right Child, and the Two Action Rows Summary

**A unilateral exercise can now be logged as separate left/right sides — SIDE_LEFT/SIDE_RIGHT constants and three pure predicates (isPerSideMode, sideForNewSet, parentsAwaitingRightSide) in a new per-side.ts, wired into workout.tsx's two completion call sites so a left-side parent grows exactly one right-side child on completion, and into ExercisePage.tsx's action sheet so the mode toggles on/off with no confirmation and no rewrite of already-logged sets — closing SETS-09 and completing the phase's set-type/grouping feature set.**

## Performance

- **Duration:** ~25 min (approx.)
- **Started:** 2026-08-28T (approx., see task commit timestamps)
- **Completed:** 2026-08-28T (approx.)
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- Created `apps/mobile/lib/session/per-side.ts` (no React, no database — mirrors `superset.ts`'s shape exactly): `SIDE_LEFT`/`SIDE_RIGHT` named constants so no consumer writes either string inline, `isPerSideMode` (D-21's derived-from-data mode with D-22's ephemeral override), `sideForNewSet`, and `parentsAwaitingRightSide` (the automatic right-child trigger, idempotent by construction). All 11 test cases pass, including turning the mode off while paired sets already exist and a drop-set group never triggering a phantom right row.
- Wired both of `handleCheckmarkPress`'s completion call sites in `workout.tsx`: the draft branch stamps `side: sideForNewSet(...)` on a new logged_set and, immediately after, grows the pair's right child if one is owed; the existing-row toggle branch does the same on a transition into `completed`, and never on an un-tick (CF-08 — the un-tick path is byte-for-byte unchanged from before this plan). `perSideOverrideByExercise` screen state survives a `reload()` and is deliberately never persisted (D-21).
- Wired `ExercisePage.tsx`'s action sheet: `perSideEnabled` derives once via `isPerSideMode` over the page's own already-loaded `rows` (never re-derived inside `SessionActionSheet`), and `enable-per-side`/`disable-per-side` are dispatched explicitly — each closes the sheet and calls the setter, with no database write and no confirmation, since D-22 already guarantees no logged set is ever rewritten by the toggle.
- Confirmed by test that a completed per-side pair contributes exactly 1 to `shouldAutoAdvance`'s count and to the strip fraction, for free — the right child's non-null `parentSetId` is already filtered by D-10/D-19's existing parent-row rule, the same mechanism drop/myorep/partial rely on.
- Full workspace regression: `pnpm -w test` (92 mobile suites, 1721 tests) and `pnpm -w typecheck` both pass with no changes needed elsewhere. No Drizzle schema file was touched (CF-01/D-21's "no new column, no migration" held exactly as planned).

## Task Commits

1. **Task 1: The derived per-side mode and the pair it owes** - `1a052d0` (feat)
2. **Task 2: Stamp the left side on new sets and create the right side on completion** - `984d110` (feat)
3. **Task 3: The two per-side action rows, wired** - `5f534cb` (feat)

## Files Created/Modified

- `apps/mobile/lib/session/per-side.ts` - `SIDE_LEFT`/`SIDE_RIGHT`, `isPerSideMode`, `sideForNewSet`, `parentsAwaitingRightSide`
- `apps/mobile/lib/session/__tests__/per-side.test.ts` - all seven behaviors plus the drop-set-never-triggers case
- `apps/mobile/app/(tabs)/workout.tsx` - `perSideOverrideByExercise` state, `perSideRowsFor` helper, side-stamping and automatic right-child growth at both completion call sites, `perSideOverride`/`onSetPerSideOverride` threaded into the `ExercisePage` render call
- `apps/mobile/app/(tabs)/__tests__/workout.test.tsx` - the six D-20/D-21/D-22 composition tests, including the named re-ticking and un-ticking cases, plus the shouldAutoAdvance-count case
- `apps/mobile/components/ExercisePage.tsx` - `perSideOverride`/`onSetPerSideOverride` on `ExercisePageProps`, `perSideEnabled` derivation, `handleEnablePerSide`/`handleDisablePerSide`, explicit `handleSessionAction` branches, `perSideEnabled`/`perSideAvailable` threaded into `SessionActionSheet`
- `apps/mobile/components/EditingWorkoutScreen.tsx` - `perSideOverride={undefined}`/`onSetPerSideOverride={() => {}}` at its own pre-existing `ExercisePage` call site (Rule 3 fix, out-of-scope file)

## Decisions Made

- `isPerSideMode`'s override is an explicit `boolean | undefined` argument, never ambient state — this is the only way D-22's "turn per-side off while paired sets exist" is expressible without a new column, since a purely derived value can never become false once a paired set has been logged.
- `parentsAwaitingRightSide` is the single trigger source for the automatic right child at both of `handleCheckmarkPress`'s completion call sites — idempotency lives entirely in the predicate (it returns nothing once a right child exists), so neither call site needs its own flag or guard against double-firing.
- Extracted `perSideRowsFor(existingSets, rowOverrides)` in `workout.tsx` as the one place `LoggedSetRow[]` + `RowOverride` merge into the `PerSideRowInput[]` shape `per-side.ts`'s functions need — used identically by the side-stamping call and both completion sites rather than three independently-inlined merges.
- `EditingWorkoutScreen.tsx`'s pre-existing `ExercisePage` call site needed `perSideOverride`/`onSetPerSideOverride` once those became required props — supplied `undefined`/a no-op setter rather than adding real screen state to a correction subtree that has none: `isPerSideMode` still derives correctly from each row's already-logged `side` with no override, so only the ability to proactively toggle the mode is unavailable there (the read side is fully correct), matching this file's own existing `EMPTY_SUPERSET_MEMBERS`/D-32 precedent exactly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `EditingWorkoutScreen.tsx`'s own `ExercisePage` call site needed the two new required props**
- **Found during:** Task 3's `pnpm -w typecheck` run
- **Issue:** `EditingWorkoutScreen.tsx` (outside this plan's `files_modified` list) renders `ExercisePage` for the past-session editing subtree. Making `perSideOverride`/`onSetPerSideOverride` required fields on `ExercisePageProps` turned this pre-existing call site into a compile error — the same mechanism 07-07 documented for its own superset props.
- **Fix:** Supplied `perSideOverride={undefined}` and `onSetPerSideOverride={() => {}}`. This is the semantically correct answer, not a stopgap: `isPerSideMode` already falls back to its derived-from-data default when the override is `undefined`, so the mode still reads correctly from each row's already-logged `side` in this subtree — only the ability to proactively flip the mode (which this correction screen has no screen state to hold) is unavailable, mirroring the exact reasoning this file's own `EMPTY_SUPERSET_MEMBERS` constant already established for supersets.
- **Files modified:** `apps/mobile/components/EditingWorkoutScreen.tsx`
- **Commit:** `5f534cb` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope change — the fix satisfies a pre-existing, unrelated call site that this plan's required-field choice reached by construction, matching the identical pattern 07-07 already established one plan earlier in this phase.

## Issues Encountered

None. The fresh-worktree bootstrap (`pnpm install`, `pnpm -w build`) completed cleanly. Every targeted test run passed on the first attempt after implementation, aside from two expected typecheck errors (a `LoggedSetRow[]` vs `PerSideRowInput[]` mismatch at the side-stamping call site, and the `WorkoutScreenViewProps` test fixture missing the two new required fields) — both fixed inline before the Task 2 commit, well within Rule 1 (bug) / Rule 3 (blocking) territory and not a distinct deviation worth its own entry since they were caught and closed within the same task, before any commit landed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SETS-09 is observable end to end: per-side stamping, the automatic right-side child, and the enable/disable action rows all exist and are wired to the same shared predicate (`isPerSideMode`) and grouping mutation (`addSubEntry`) 07-05 published.
- This is the phase's last new user-facing behavior (per the plan's own objective) — SETS-01 through SETS-09 are all now implemented. The plan's own deferred human-check (visually confirming the L/R badge pair and strip-fraction behavior, and the mutually-exclusive action-sheet rows, on the web target) remains open per `human_verify_mode: end-of-phase`, consistent with every sibling plan in this phase — not blocking this plan's completion.
- The known open gap 07-07 recorded (`SessionActionSheet` has no `errorMessage` prop to render a rejected `formSuperset`/`detachSuperset` write) is untouched by this plan and remains open for a future pass; this plan's own per-side write-failure path reuses the identical `setTypeError` state mechanism, so it inherits the same gap rather than introducing a new one.

## Self-Check: PASSED

- FOUND: apps/mobile/lib/session/per-side.ts
- FOUND: apps/mobile/lib/session/__tests__/per-side.test.ts
- FOUND: apps/mobile/app/(tabs)/workout.tsx (perSideOverrideByExercise, perSideRowsFor, sideForNewSet, parentsAwaitingRightSide)
- FOUND: apps/mobile/components/ExercisePage.tsx (isPerSideMode, enable-per-side, disable-per-side)
- FOUND: apps/mobile/components/EditingWorkoutScreen.tsx (perSideOverride, onSetPerSideOverride)
- FOUND commit 1a052d0
- FOUND commit 984d110
- FOUND commit 5f534cb

---
*Phase: 07-advanced-set-types*
*Completed: 2026-08-28*
