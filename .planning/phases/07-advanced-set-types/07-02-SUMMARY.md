---
phase: 07-advanced-set-types
plan: 02
subsystem: database
tags: [drizzle, powersync, pr-rules, session-logging, set-types]

requires:
  - phase: 07-advanced-set-types
    provides: "07-01 published countsTowardWorkingVolume/countsTowardRecords and their derived SQL-exclusion tuples in @fitness/api-contracts, plus the tracer's parentSetId/side read-path widening this plan's summary-query select builds on"
provides:
  - "Every remaining query-layer working-volume filter (session-query.ts's two ne() call sites, history-query.ts's completedWorkingSet) now reads WORKING_VOLUME_EXCLUDED_SET_TYPES from @fitness/api-contracts instead of a locally re-derived warm-up literal"
  - "summary-query.ts filters completed rows through countsTowardWorkingVolume and exposes ExerciseBreakdown.completedWorkingSetCount — a parent-only set count (D-10) kept deliberately distinct from the child-inclusive completedSetCount/totalReps/volumeKg (D-17)"
  - "packages/pr-rules/src/personal-records.ts guards foldPriorBest and detectPrs with countsTowardRecords, so a completed partial set can never set heaviest_weight or best_e1rm while drop/myorep/failure/amrap sets stay fully PR-eligible (D-18)"
affects: [07-03, 07-04, 07-05, 07-06, 07-07, 07-08, 07-09, 08-progression-engine, 09-analytics, 10-records]

actuals:
  tokens: 4524
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "SQL-layer exclusion via notInArray(column, DERIVED_EXCLUDED_TUPLE) instead of a locally re-derived ne()/literal comparison — the tuple is computed FROM the named predicate in @fitness/api-contracts so the rule still lives in exactly one place"
    - "A per-exercise breakdown row carries two deliberately different aggregate filters side by side (parent-only set count vs child-inclusive volume/reps), documented in the interface's own doc comment so a later reader does not collapse them into one"

key-files:
  created: []
  modified:
    - apps/mobile/lib/db/session-query.ts
    - apps/mobile/lib/db/history-query.ts
    - apps/mobile/lib/db/summary-query.ts
    - apps/mobile/lib/db/__tests__/summary-query.test.ts
    - apps/mobile/lib/db/__tests__/session-query.test.ts
    - apps/mobile/components/__tests__/WorkoutSummary.test.tsx
    - packages/pr-rules/src/personal-records.ts
    - packages/pr-rules/src/__tests__/personal-records.test.ts

key-decisions:
  - "Kept ExerciseBreakdown.completedSetCount unchanged (child-inclusive) and added completedWorkingSetCount as a new, additive, parent-only field rather than repurposing the existing field's semantics — matches the plan's literal 'add a separate field' instruction and the codebase's standing additive-only-props discipline, and avoids touching WorkoutSummary.tsx's consuming behavior, which is out of this plan's file scope."
  - "Extended session-query.test.ts's hand-rolled WHERE-condition evaluator to interpret notInArray's ' not in ' operator text (alongside the existing =/<>/in), rather than reworking previousSetReference's query shape to fit the evaluator's prior vocabulary — the evaluator is a test-only SQL interpreter, and drizzle's notInArray was the shape D-17 explicitly required at this call site."

patterns-established:
  - "Deliberately-divergent aggregate fields on one row get a mutual doc comment cross-reference ('Do not simplify this back down to X; the two rules diverge on purpose') rather than relying on the call site to keep them straight."

requirements-completed: [SETS-06]

coverage:
  - id: D1
    description: "session-query.ts's previousSetReference and previousSetReferencesForSession both exclude working-volume-excluded set types via the shared @fitness/api-contracts predicate, not a local literal"
    requirement: "SETS-06"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/session-query.test.ts#excludes a warm-up row from its own source set, even at the exact matching set_index"
        status: pass
    human_judgment: false
  - id: D2
    description: "history-query.ts's completedWorkingSet filter routes through WORKING_VOLUME_EXCLUDED_SET_TYPES instead of a bare ne(setType, WARMUP_SET_TYPE)"
    requirement: "SETS-06"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/history-query.test.ts (existing warm-up-exclusion coverage, unchanged assertions, re-verified green after the call-site migration)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A drop set's parent plus two children report a completedWorkingSetCount of 1 while totalReps/volumeKg include all three rows"
    requirement: "SETS-06"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/summary-query.test.ts#counts a drop set's parent and two children as one completed working set, while reps and volume sums include all three rows"
        status: pass
    human_judgment: false
  - id: D4
    description: "An exercise whose only completed rows are warm-ups is omitted from the session summary breakdown entirely (edge SETS-06/empty)"
    requirement: "SETS-06"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/summary-query.test.ts#omits an exercise whose only completed rows are warm-ups from the breakdown entirely (edge SETS-06/empty)"
        status: pass
    human_judgment: false
  - id: D5
    description: "foldPriorBest and detectPrs both guard on countsTowardRecords: a completed partial set contributes to no prior-best field and detects no PR even when heavier than every prior set, while drop/myorep/failure/amrap stay fully PR-eligible"
    requirement: "SETS-06"
    verification:
      - kind: unit
        ref: "packages/pr-rules/src/__tests__/personal-records.test.ts#a heavier partial does not consume the heaviest-weight record — a subsequent full set at that weight still yields heaviest_weight (D-18)"
        status: pass
      - kind: unit
        ref: "packages/pr-rules/src/__tests__/personal-records.test.ts#skips a completed partial set with a real weight — it contributes to no prior-best field (D-18)"
        status: pass
      - kind: unit
        ref: "packages/pr-rules/src/__tests__/personal-records.test.ts#folds a completed %s-typed set into prior best (D-18) [drop, myorep, failure, amrap]"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-08-28
status: complete
---

# Phase 7 Plan 2: Working-Volume and PR-Eligibility Predicates Summary

**Migrated all four remaining bare `!== 'warmup'`/`ne(setType, WARMUP_SET_TYPE)` call sites onto the D-17/D-18 named predicates published in `@fitness/api-contracts`, and added the parent-only completed-set count that keeps a drop set from reading as three sets on the workout summary.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-08-28T10:30:00Z (approx.)
- **Completed:** 2026-08-28T11:25:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- `apps/mobile/lib/db/session-query.ts` no longer carries a module-local `WORKING_SET_TYPE_EXCLUSION` constant — both `previousSetReference` and `previousSetReferencesForSession` filter via `notInArray(loggedSet.setType, WORKING_VOLUME_EXCLUDED_SET_TYPES)` imported from `@fitness/api-contracts`.
- `apps/mobile/lib/db/history-query.ts`'s `completedWorkingSet` filter routes through the same shared exclusion tuple instead of `ne(loggedSet.setType, WARMUP_SET_TYPE)`.
- `apps/mobile/lib/db/summary-query.ts` filters completed rows through `countsTowardWorkingVolume` and adds `ExerciseBreakdown.completedWorkingSetCount` — a parent-only count (D-10) that sits alongside the existing child-inclusive `completedSetCount`/`totalReps`/`volumeKg` (D-17), each with a doc comment explaining why the two diverge.
- `packages/pr-rules/src/personal-records.ts`'s `foldPriorBest` and `detectPrs` both swapped their `setType === WARMUP_SET_TYPE` guard for a negated `countsTowardRecords` call, so a completed `partial` set can add working volume but can never set `heaviest_weight` or `best_e1rm` (D-18), while `drop`/`myorep`/`failure`/`amrap` sets remain fully PR-eligible.
- Extended `session-query.test.ts`'s hand-rolled WHERE-condition evaluator to interpret drizzle's `notInArray` (" not in " operator text), which the two `previousSetReference*` call sites now generate — without this the existing warm-up-exclusion test would have silently matched everything.
- Added test coverage for the split (drop-set parent+children count-vs-volume divergence, warm-up-only omission edge case, partial-set PR ineligibility, the four remaining types' continued PR eligibility, and the "heavier partial doesn't burn the record for a later full set" case).

## Task Commits

1. **Task 1: Route every query-layer working-volume filter through the one named predicate** - `ad1bb69` (feat)
2. **Task 2: A partial rep can never set a max-based record** - `9c1e7be` (feat)

## Files Created/Modified

- `apps/mobile/lib/db/session-query.ts` - drops `WORKING_SET_TYPE_EXCLUSION`, both `previousSetReference*` where-clauses now use `notInArray(...WORKING_VOLUME_EXCLUDED_SET_TYPES)`
- `apps/mobile/lib/db/history-query.ts` - `completedWorkingSet` routes through `WORKING_VOLUME_EXCLUDED_SET_TYPES`
- `apps/mobile/lib/db/summary-query.ts` - selects `parentSetId`, filters via `countsTowardWorkingVolume`, adds `completedWorkingSetCount`
- `apps/mobile/lib/db/__tests__/summary-query.test.ts` - new tests for the count/volume split and the warm-up-only omission edge case
- `apps/mobile/lib/db/__tests__/session-query.test.ts` - `buildPredicate` evaluator extended to interpret `notInArray`'s `not in` operator
- `apps/mobile/components/__tests__/WorkoutSummary.test.tsx` - `breakdownRow` fixture default gains the new required `completedWorkingSetCount` field
- `packages/pr-rules/src/personal-records.ts` - `foldPriorBest`/`detectPrs` guard on `countsTowardRecords` instead of `WARMUP_SET_TYPE`
- `packages/pr-rules/src/__tests__/personal-records.test.ts` - new partial-ineligibility, four-type-eligibility, and heavier-partial-doesn't-burn-the-record cases

## Decisions Made

- Kept `ExerciseBreakdown.completedSetCount` semantically unchanged (still child-inclusive) and added `completedWorkingSetCount` as a new additive field, per the plan's literal "add a separate field" instruction — this avoids touching `WorkoutSummary.tsx`'s display logic, which is outside this plan's declared file scope, while still exposing the D-10 parent-only count for future callers (Phase 8/9/10).
- Extended the test-only WHERE-condition evaluator in `session-query.test.ts` to recognize `notInArray`'s SQL shape rather than restructuring the query to fit the evaluator's pre-existing vocabulary — the evaluator exists to interpret whatever real drizzle-orm SQL the code under test emits, and `notInArray` is exactly what D-17 requires at this call site.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Extended session-query.test.ts's WHERE evaluator to interpret `notInArray`**
- **Found during:** Task 1 verification (`pnpm --filter mobile test`)
- **Issue:** `session-query.test.ts`'s own hand-rolled `buildPredicate` function only recognized `=`, `<>`, and `in` operator text. Switching `previousSetReference`/`previousSetReferencesForSession` to `notInArray(...)` (per the plan's own required shape) produces `" not in "` operator text, which the evaluator's `if (!column || !operator) return () => true;` fallback would treat as "match everything" — silently breaking the existing warm-up-exclusion test (it would stop excluding the warm-up row instead of asserting `null`).
- **Fix:** Added `'not in'` to the recognized-operator set and `!values.includes(rowValue)` to the predicate's return branch, mirroring the existing `'in'` handling exactly.
- **Files modified:** `apps/mobile/lib/db/__tests__/session-query.test.ts`
- **Verification:** `pnpm --filter mobile test -- "session-query"` — 1 pre-existing warm-up-exclusion test plus all others in the file pass.
- **Committed in:** `ad1bb69` (Task 1 commit)

**2. [Rule 3 - Blocking] Added the new required interface field to WorkoutSummary.test.tsx's fixture default**
- **Found during:** Task 1 verification (`pnpm -w typecheck`)
- **Issue:** Adding the required `completedWorkingSetCount: number` field to `ExerciseBreakdown` made `WorkoutSummary.test.tsx`'s `breakdownRow` fixture object (which spreads a fixed base object before `overrides`) fail to typecheck — the base object was missing the new required field.
- **Fix:** Added `completedWorkingSetCount: 3` to the fixture's base object (matching its `completedSetCount: 3` default, since this fixture has no grouped rows and the two numbers coincide), with a comment noting the split and that tests caring about it should override explicitly.
- **Files modified:** `apps/mobile/components/__tests__/WorkoutSummary.test.tsx`
- **Verification:** `pnpm -w typecheck` exits 0; `pnpm --filter mobile test -- "WorkoutSummary"` — 17/17 pass.
- **Committed in:** `ad1bb69` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking) — both necessary consequences of the plan's own required interface/query changes surfacing in test files outside the plan's declared file list, fixed inline rather than left broken.
**Impact on plan:** No scope creep — both fixes are the minimum change needed to keep `pnpm -w typecheck`/`pnpm -w test` green after the plan's own required source changes, with no functional change to either test file's actual assertions.

## Issues Encountered

None beyond the two auto-fixed items above. Full workspace verification (`pnpm -w typecheck`, `pnpm -w build`, `pnpm -w test`) ran clean: 88 mobile test suites / 1554 tests, plus api-contracts (150), pr-rules (52), plate-math (70), and api (67) — all green.

## Next Phase Readiness

- All five of D-17/D-18's known bare-literal call sites are now migrated except `ExerciseStrip.tsx`, which is explicitly 07-03's territory per this phase's CONTEXT.md.
- `ExerciseBreakdown.completedWorkingSetCount` is available for any later plan (Phase 8/9/10 or a later 07-xx) that needs the parent-only set count on the workout summary; `WorkoutSummary.tsx` itself has not yet been wired to display it, since that UI change was out of this plan's scope.
- `packages/pr-rules/src/personal-records.ts` is now D-18-compliant ahead of 07-05, which is the plan that will first write real `partial`-typed rows — no PR-detection code remains that could let a partial rep silently become a durable record.

## Self-Check: PASSED

- FOUND: apps/mobile/lib/db/session-query.ts (notInArray/WORKING_VOLUME_EXCLUDED_SET_TYPES)
- FOUND: apps/mobile/lib/db/history-query.ts (WORKING_VOLUME_EXCLUDED_SET_TYPES)
- FOUND: apps/mobile/lib/db/summary-query.ts (completedWorkingSetCount)
- FOUND: packages/pr-rules/src/personal-records.ts (countsTowardRecords)
- FOUND commit ad1bb69
- FOUND commit 9c1e7be

---
*Phase: 07-advanced-set-types*
*Completed: 2026-08-28*
