---
phase: 07-advanced-set-types
plan: 01
subsystem: ui
tags: [react-native, drizzle, powersync, session-logging, set-types]

requires:
  - phase: 05-in-gym-session-logging
    provides: SetRow/ExercisePage/session-query/set-row-builders shipped surface this plan extends in place
  - phase: 06-gym-profiles-plate-math
    provides: platform-divergence and canonical-kg conventions this plan inherits unchanged
provides:
  - "Widened read path: loadSessionTree selects parent_set_id/side; LoggedSetRow, ResolvedSetRow, ExercisePageSetRow all carry parentSetId/side through to the UI"
  - "orderForDisplay tree-flatten: parent-then-children ordering composed with the warmup-first bucket rule, closing the Pitfall 2 out-of-order-child defect"
  - "D-23 derived parent display numbering (displaySetIndex) computed at render time, never written back to storage"
  - "SetRow badge generalization: SET_TYPE_BADGE_GLYPH map, badgeGlyphFor (side-wins-over-type), child-row indent and blank set-number column, onSetNumberPress wiring"
  - "SetTypePickerSheet: the seven-row D-01 bottom sheet, setTypePickerEffect's per-row dispatch table, wired into ExercisePage for the Drop Set insert-child path"
  - "countsTowardWorkingVolume/countsTowardRecords predicates and their derived exclusion tuples published in @fitness/api-contracts"
affects: [08-progression-engine, 09-analytics, 10-records, 07-02, 07-03, 07-04, 07-05, 07-06, 07-07, 07-08, 07-09]

actuals:
  tokens: 12741
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Parent-then-children tree-flatten composed with an existing bucket rule (warmup-first), rather than replacing it"
    - "Derived display-only fields (displaySetIndex) computed in the same render pass as the row map, never persisted"
    - "Per-row dispatch table (setTypePickerEffect) instead of a generic 'set field to value' handler for a picker whose rows have materially different effects"

key-files:
  created:
    - apps/mobile/components/SetTypePickerSheet.tsx
    - apps/mobile/components/__tests__/SetTypePickerSheet.test.tsx
    - apps/mobile/lib/session/__tests__/set-row-builders.test.ts
  modified:
    - apps/mobile/lib/db/session-query.ts
    - apps/mobile/lib/session/set-row-builders.ts
    - apps/mobile/components/SetRow.tsx
    - apps/mobile/components/ExercisePage.tsx
    - apps/mobile/components/__tests__/SetRow.test.tsx
    - apps/mobile/app/(tabs)/__tests__/workout.test.tsx
    - packages/api-contracts/src/session.ts
    - packages/api-contracts/src/__tests__/session.test.ts
    - apps/mobile/lib/db/__tests__/session-query.test.ts

key-decisions:
  - "Followed the plan's specified layering order exactly: read path first, then the ordering transform, then the row, then the sheet, then the host wiring — per Pitfall 1's warning against wiring UI before the plumbing carries the data."
  - "handleSetTypeSelect in ExercisePage wires only the two tracer-scoped branches (childless insert-child, and the already-active no-op close); every retype path is an explicit no-op close, documented as 07-04's ChangeSetTypeDialog territory rather than a silent gap."

patterns-established:
  - "Badge slot generalization: one exported glyph map (SET_TYPE_BADGE_GLYPH) plus one pure resolver function (badgeGlyphFor) implementing the side-wins-over-type priority rule (R14), called from inside SetRowView rather than by its callers."
  - "Derived SQL-exclusion tuples computed FROM a named predicate (WORKING_VOLUME_EXCLUDED_SET_TYPES = SET_TYPES.filter(!countsTowardWorkingVolume)) so the rule lives in exactly one place even when a Drizzle where-clause needs it as a literal array."

requirements-completed: [SETS-01, SETS-02]

coverage:
  - id: D1
    description: "loadSessionTree carries parent_set_id and side from Postgres/SQLite through to LoggedSetRow"
    requirement: "SETS-02"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/session-query.test.ts#carries parentSetId and side on LoggedSetRow — non-null for a seeded grouped row, null for a plain one"
        status: pass
    human_judgment: false
  - id: D2
    description: "orderForDisplay renders a child directly beneath its parent even when the child's raw set_index is higher than an intervening plain set (Pitfall 2 regression closed)"
    requirement: "SETS-02"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/set-row-builders.test.ts#renders a child inserted onto set 1 directly beneath it, not after a later unrelated set (the out-of-order-child regression)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Warm-up rows render ahead of every working row regardless of raw set_index, and the parent-then-children flatten applies only to the non-warm-up remainder"
    requirement: "SETS-06"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/set-row-builders.test.ts#renders every warm-up row ahead of every non-warm-up row, and the parent-then-children flatten applies only to the remainder"
        status: pass
    human_judgment: false
  - id: D4
    description: "A parent row's set-number column shows its position among parent rows (D-23 displaySetIndex), never the raw set_index; a child row's column is blank"
    requirement: "SETS-02"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/set-row-builders.test.ts#numbers parent rows 1, 2, 3… by position among parents only, leaves children undefined, and never mutates the raw setIndex"
        status: pass
      - kind: unit
        ref: "apps/mobile/components/__tests__/SetRow.test.tsx#renders no digit in the set-number column for a child row, and indents the row"
        status: pass
    human_judgment: false
  - id: D5
    description: "The Set-Type Picker lists exactly the seven SET_TYPES values in declared order"
    requirement: "SETS-01"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/SetTypePickerSheet.test.tsx#deep-equals the seven SET_TYPES ids in declared order"
        status: pass
    human_judgment: false
  - id: D6
    description: "setTypePickerEffect dispatches Drop Set/Partial to insert-child and every other row to retype — never a generic 'set field to value' handler"
    requirement: "SETS-01"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/SetTypePickerSheet.test.tsx#setTypePickerEffect describe block"
        status: pass
    human_judgment: false
  - id: D7
    description: "Selecting Drop Set on a childless row writes one logSet call with parentSetId set to the tapped row, and leaves the parent's own set_type unchanged"
    requirement: "SETS-02"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/SetTypePickerSheet.test.tsx (dispatch coverage) + manual trace of ExercisePage.handleSetTypeSelect"
        status: pass
    human_judgment: true
    rationale: "The write path itself (handleSetTypeSelect calling logSet with parentSetId) has no dedicated ExercisePage-level test in this plan — it is covered indirectly by SetTypePickerSheet's dispatch-table tests plus the full pnpm -w test suite passing with no regression, but the end-to-end tap-to-write flow through ExercisePage's wrapper is the plan's own deferred human-check item (see UI-SPEC end-of-phase sweep)."
  - id: D8
    description: "countsTowardWorkingVolume and countsTowardRecords are published and totally pinned over all seven SET_TYPES values"
    requirement: "SETS-06"
    verification:
      - kind: unit
        ref: "packages/api-contracts/src/__tests__/session.test.ts#countsTowardWorkingVolume / countsTowardRecords describe blocks"
        status: pass
    human_judgment: false
  - id: D9
    description: "A plain normal, non-grouped, non-per-side set row renders pixel-identical to its Phase 5 self — no badge, no indent, no new control"
    requirement: "SETS-02"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/SetRow.test.tsx#renders with no onLongPress, no accessibilityActions and no badges when none of the new props are supplied (WorkoutSummary.tsx call site)"
        status: pass
    human_judgment: true
    rationale: "This is the plan's own explicit human-check, deferred to the end-of-phase sweep per config.json's human_verify_mode: end-of-phase — a real browser render of the plain-row case is not exercised by this plan's unit suite alone."

duration: 40min
completed: 2026-08-28
status: complete
---

# Phase 7 Plan 1: End-to-End Drop-Set Tracer Summary

**Widens the session read path to carry `parent_set_id`/`side`, replaces the two-bucket warmup sort with a genuine parent-then-children tree-flatten, and wires a new seven-row `SetTypePickerSheet` into `SetRow`'s already-built set-number tap target so a Drop Set writes and renders as an indented child beneath its parent.**

## Performance

- **Duration:** 40 min
- **Started:** 2026-08-28T09:45:00Z (approx.)
- **Completed:** 2026-08-28T10:25:00Z
- **Tasks:** 3
- **Files modified:** 12 (3 created, 9 modified)

## Accomplishments

- Closed 07-RESEARCH.md's two load-bearing findings on the tracer path: the read-path type shapes now carry `parentSetId`/`side` end to end, and `orderForDisplay` now tree-flattens parent-then-children instead of silently mis-ordering a group added out of raw-index order.
- Shipped `SetTypePickerSheet` — the D-01 bottom sheet with its fixed seven-row `SET_TYPES`-ordered constant and `setTypePickerEffect`'s per-row dispatch table (insert-child for Drop Set/Partial, retype for the other five) — wired to `ExercisePage`'s set-number tap via `handleSetNumberPress`/`handleSetTypeSelect`.
- Generalized `SetRow`'s single badge slot to the full glyph map (`SET_TYPE_BADGE_GLYPH`, `badgeGlyphFor`) with the side-wins-over-type priority rule (R14), plus child-row indentation and a blank set-number column.
- Published `countsTowardWorkingVolume`/`countsTowardRecords` and their derived SQL-exclusion tuples in `@fitness/api-contracts`, pinned by a total-partition test over all seven `SET_TYPES` values.
- Added the Wave 0 test suites that did not exist before: `set-row-builders.test.ts` (11 tests covering the ordering regression, warmup composition, D-23 numbering, `isBlankSubEntry`, orphan-child visibility, and the stable-tie backstop) and `SetTypePickerSheet.test.tsx` (10 tests).

## Task Commits

1. **Task 1: End-to-end drop-set slice — one path from the set-number tap to an indented child row** - `62346e7` (feat)
2. **Task 2: The Wave 0 suites that did not exist — ordering, badge anatomy, and the picker's dispatch table** - `8fdcfc7` (test)
3. **Task 3: Publish the two counting predicates beside the closed vocabulary** - `dbbdfd2` (feat)

## Files Created/Modified

- `apps/mobile/lib/db/session-query.ts` - `LoggedSetRow` gains `parentSetId`/`side`; `loadSessionTree`'s select names both columns
- `apps/mobile/lib/session/set-row-builders.ts` - `orderForDisplay` tree-flatten, `isBlankSubEntry`, `displaySetIndex` (D-23) in `buildSetRows`
- `apps/mobile/components/SetRow.tsx` - `SET_TYPE_BADGE_GLYPH`, `badgeGlyphFor`, child-row anatomy, `onSetNumberPress`
- `apps/mobile/components/SetTypePickerSheet.tsx` (new) - the D-01 sheet, `SET_TYPE_PICKER_ROWS`, `setTypePickerEffect`
- `apps/mobile/components/ExercisePage.tsx` - `handleSetNumberPress`/`handleSetTypeSelect`, `'set-type'` sheet wiring
- `packages/api-contracts/src/session.ts` - `countsTowardWorkingVolume`, `countsTowardRecords`, derived exclusion tuples
- Test files: `apps/mobile/lib/session/__tests__/set-row-builders.test.ts` (new), `apps/mobile/components/__tests__/SetTypePickerSheet.test.tsx` (new), plus extensions to `SetRow.test.tsx`, `workout.test.tsx`, `session-query.test.ts`, and `packages/api-contracts/src/__tests__/session.test.ts`

## Decisions Made

- Followed the plan's mandated layering order (read path → transform → row → sheet → host) exactly, per Pitfall 1's warning against wiring UI before the plumbing carries real data.
- `ExercisePage.handleSetTypeSelect` wires only the two tracer-scoped branches this plan owns (childless insert-child write, and the already-active-type no-op close); every retype path is an explicit no-op close annotated as 07-04's `ChangeSetTypeDialog` territory, not a silent gap.
- Treated a freshly-inserted, not-yet-filled sub-entry (`isBlankSubEntry`) as a three-field agreement (`parentSetId` non-null, `completed` false, `reps` 0, `weightKg` null) rather than any positional inference, matching the codebase's standing Pitfall 2 discipline.

## Deviations from Plan

None — plan executed exactly as written. The `07-PATTERNS.md` file referenced in the plan's context list does not exist in this phase directory (only `07-RESEARCH.md`, `07-CONTEXT.md`, `07-UI-SPEC.md`, `07-VALIDATION.md`); `07-RESEARCH.md`'s Architecture Patterns section covers the identical material (verified code excerpts, the illustrative tree-flatten shape, the badge/picker patterns) and was used in its place with no gap.

## Issues Encountered

None. The fresh-worktree bootstrap (corepack enable, `pnpm install`, `pnpm -w build`) completed cleanly, and every targeted and full-suite test run passed on the first attempt after each task's implementation.

## Next Phase Readiness

- The read-path widening, tree-flatten ordering, badge generalization, and picker dispatch table are all in place for 07-04 (`ChangeSetTypeDialog`), 07-05 (`set-groups.ts`/myorep), 07-06 (superset), and 07-08 (per-side) to build on directly — none of them need to re-touch `session-query.ts`'s select or `orderForDisplay`'s core flatten logic.
- `countsTowardWorkingVolume`/`countsTowardRecords` are published and ready for the remaining four bare-literal call sites (`history-query.ts`, `summary-query.ts`, `ExerciseStrip.tsx`, `personal-records.ts`) that later plans in this phase must migrate.
- The plan's own deferred human-check (visually confirming a plain working set renders identically to its Phase 5 self on the web target) remains open, per `human_verify_mode: end-of-phase` — to be swept at phase end, not blocking this plan's completion.

## Self-Check: PASSED

- FOUND: apps/mobile/components/SetTypePickerSheet.tsx
- FOUND: apps/mobile/lib/session/__tests__/set-row-builders.test.ts
- FOUND: apps/mobile/components/__tests__/SetTypePickerSheet.test.tsx
- FOUND commit 62346e7
- FOUND commit 8fdcfc7
- FOUND commit dbbdfd2

---
*Phase: 07-advanced-set-types*
*Completed: 2026-08-28*
