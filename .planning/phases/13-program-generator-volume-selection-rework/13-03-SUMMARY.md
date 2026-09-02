---
phase: 13-program-generator-volume-selection-rework
plan: 03
subsystem: program-generator
tags: [typescript, program-generation, exercise-selection, tiered-scoring, week-level-variety]

# Dependency graph
requires:
  - phase: 13-program-generator-volume-selection-rework
    provides: "13-01's PLAN/FIT/PICK/PER-CYCLE day loop, DaySlotPlan.groupExerciseIndex, splitSessionSets"
provides:
  - "pickSlotExercise(pool, slotDef, context: SlotPickContext): a filter-chain-then-tiered-sort replacement for the single weighted-sum score"
  - "compoundnessOf and isLoadable — the two new D-07 tier helpers, individually exported and tested"
  - "week-scoped pickedByMuscleGroup threaded across generateProgram's day loop, fixing 'both full-body days pick the same exercises'"
affects: [apps/mobile generation-wizard, apps/api generation consumers — signature-compatible, no call-site changes needed outside this package]

# Actuals (#2632)
actuals:
  tokens: 6755
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pickSlotExercise takes a single SlotPickContext object instead of positional params — every call site (generate.ts, tests) rewritten this plan"
    - "Filter chain (alreadyPicked -> score>0 -> D-08 primary gate -> D-06 week gate) runs before the comparator sort, so both gates are conditional on a non-empty survivor set and never return null when a degraded fallback exists"

key-files:
  created: []
  modified:
    - packages/program-generator/src/slot-fill.ts
    - packages/program-generator/src/generate.ts
    - packages/program-generator/src/__tests__/slot-fill.test.ts
    - packages/program-generator/src/__tests__/generate.test.ts

key-decisions:
  - "compoundnessOf excludes the slot's own muscleGroupId from the secondary-mapping count it returns, using the slotMuscleGroupId parameter defensively (a malformed catalog row listing the same group as both primary and secondary can never inflate a candidate's compoundness) — the plan's prose didn't require this exclusion explicitly but it's the only reading that makes the parameter meaningful and matches D-07's intent ('distinct secondary muscle groups' the exercise ALSO trains)."
  - "D-06's week gate and D-08's primary gate are implemented as hard filters before the sort (drop-if-any-survivor-exists), not as scoring tiers with a bonus/penalty — this is what the plan's <action> literally specifies and what makes the 'used exercise never outscores an unused one, no matter how good its earlier tiers' behavior unconditionally true rather than merely likely."
  - "Task 2's compound-first assertion in generate.test.ts uses sessionLengthMinutes: 180 (the input ceiling) rather than the scenario's default 60 — at 60 minutes the fit's overflow-removal phase (13-01's D-04 amendment) removes chest's second exercise before this assertion could ever observe two chest slots in a day, making the assertion vacuously true. Verified this empirically with a scratch script before finalizing the test."

patterns-established:
  - "compoundnessOf/isLoadable as small, independently-exported, independently-tested tier helpers rather than inlined comparator logic — future tiers (if any) should follow the same shape"

requirements-completed: [GEN-SEL-01, GEN-SEL-02]

coverage:
  - id: D1
    description: "pickSlotExercise ranks candidates by D-07's tiered sort key (score, compoundness when preferCompound, loadability via MODEL_EQUIPMENT_TYPES, movement-pattern coverage, week-level novelty, seededRank/id) behind D-08's primary-mapping gate and D-06's week-level variety gate"
    requirement: GEN-SEL-02
    verification:
      - kind: unit
        ref: "packages/program-generator/src/__tests__/slot-fill.test.ts#pickSlotExercise — 15 cases covering every tier and both gates"
        status: pass
    human_judgment: false
  - id: D2
    description: "generateProgram threads a week-level pickedByMuscleGroup map across days, ranking an already-used exercise for a muscle group below any unused alternative, falling back to reuse only when the pool is exhausted for that group"
    requirement: GEN-SEL-01
    verification:
      - kind: unit
        ref: "packages/program-generator/src/__tests__/generate.test.ts#'does not reuse an exercise for the same muscle group on two days of the week while an alternative exists'"
        status: pass
      - kind: unit
        ref: "packages/program-generator/src/__tests__/generate.test.ts#'lets the same exercise appear on both days for a muscle group with exactly one eligible exercise'"
        status: pass
      - kind: integration
        ref: "node scratchpad repro against the real seeded catalog (2 days / 60 min / intermediate / hypertrophy, auto split) — Full Body A and Full Body B share zero exercises"
        status: pass
    human_judgment: false
  - id: D3
    description: "The first exercise picked for a muscle group in a day (groupExerciseIndex 0) prefers the most compound available candidate; the second is free to be an isolation movement"
    requirement: GEN-SEL-02
    verification:
      - kind: unit
        ref: "packages/program-generator/src/__tests__/generate.test.ts#'gives the first slot of a group a distinct-secondary-muscle count at least as high as the second slot's'"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-09-02
status: complete
---

# Phase 13 Plan 03: Tiered Selection Scoring & Week-Level Variety Summary

**Rewrote `pickSlotExercise` as a filter-chain-then-six-tier-comparator (D-07/D-08) and threaded a week-scoped `pickedByMuscleGroup` map across `generateProgram`'s day loop (D-06), fixing both the coin-flip selection among tied primary mappings and the "Full Body A and Full Body B pick the same exercises" bug.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `slot-fill.ts`: `pickSlotExercise` now takes a `SlotPickContext` object (`variantSeed`, `alreadyPickedIds`, `weekPickedIdsForGroup`, `coveredMovementPatterns`, `preferCompound`) and runs a filter chain — drop already-picked, drop zero-score, D-08's primary-mapping gate, D-06's week-variety gate — followed by a six-tier comparator sort (score, compoundness, loadability, movement-pattern novelty, week-level novelty, `seededRank`/id). `scoreCandidateForSlot`, `scoreSlotCandidates`, and `seededRank` are unchanged.
- Two new exported helpers, individually tested: `compoundnessOf(candidate, slotMuscleGroupId)` (distinct secondary muscle groups, excluding the slot's own group) and `isLoadable(exercise)` (reads `MODEL_EQUIPMENT_TYPES` from `@fitness/plate-math`, so `ez_bar` counts as loadable without a hand-typed list).
- `generate.ts`: a week-scoped `pickedByMuscleGroup: Map<MuscleGroupId, Set<string>>` is declared before `template.dayPatterns.forEach` and updated after every successful pick; a day-scoped `coveredMovementPatterns: Set<MovementPattern>` sits alongside the existing `alreadyPicked` set. The PICK stage builds a `SlotPickContext` per plan, with `preferCompound` set to `plan.groupExerciseIndex === 0`.
- `slot-fill.test.ts` rewritten with an extended `candidate`/`context` helper pair covering every tier and gate in isolation (15 cases); `generate.test.ts` gained an integration describe block proving cross-day variety, per-day duplicate prohibition, exhaustion fallback, compound-first ordering, and byte-determinism against a real multi-candidate catalog.
- Verified against the real seeded catalog via the provided repro script: Full Body A and Full Body B now share zero exercises for hypertrophy/intermediate, hypertrophy/beginner, and strength/intermediate at 2 days/60 min, and quads picks a real compound movement ("Barbell Step Ups"), not a stretch.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite slot scoring as a tiered sort key behind two hard gates** - `bff0072` (feat)
2. **Task 2: Thread week-level and day-level selection state through generateProgram** - `5f0acfd` (feat)

_Note: both tasks carried `tdd="true"` in the plan frontmatter but their `<action>` text described tests-alongside-implementation (a full rewrite of an existing test file / an extension of an existing describe block against a signature change), not a RED/GREEN cycle against wholly new production behavior — matching how 13-01 and 13-02 handled their non-RED/GREEN tasks. Each task's test file was written and verified in the same commit as its implementation._

## Files Created/Modified
- `packages/program-generator/src/slot-fill.ts` - `SlotPickContext`, `compoundnessOf`, `isLoadable`; `pickSlotExercise` rewritten as filter-chain-then-tiered-sort
- `packages/program-generator/src/generate.ts` - week-scoped `pickedByMuscleGroup` map, day-scoped `coveredMovementPatterns` set, `SlotPickContext` construction in the PICK stage
- `packages/program-generator/src/__tests__/slot-fill.test.ts` - rewritten with extended `candidate`/`context` helpers; 15 cases covering every D-07 tier and both gates
- `packages/program-generator/src/__tests__/generate.test.ts` - new describe-block cases: cross-day variety, per-day dedup, exhaustion fallback, compound-first ordering, byte-determinism for the wide-catalog scenario

## Decisions Made
- `compoundnessOf` excludes the slot's own target muscle group from its secondary-mapping count — a defensive reading of the `slotMuscleGroupId` parameter that guards against a malformed catalog row (same group listed as both primary and secondary) inflating compoundness, and is the only interpretation that gives the parameter a purpose.
- D-06's week gate and D-08's primary gate are implemented as unconditional filters ahead of the sort (not scoring bonuses), exactly per the plan's `<action>` text — this makes "a used/secondary-only candidate never outscores an unused/primary candidate, however good its other tiers" a structural guarantee rather than a likely outcome of weighting.
- Task 2's compound-first regression test uses `sessionLengthMinutes: 180` rather than the scenario's default 60. At 60 minutes, the fit's overflow-removal phase (13-01's amended D-04) removes a muscle group's second exercise before there are ever two chest slots in a day to compare — verified empirically with a scratch jest run before finalizing the test, to avoid shipping a vacuously-true assertion.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- One scratch run of `pnpm --filter @fitness/program-generator test` reported a `determinism.test.ts` suite failure with `SIGSEGV` from a jest worker process — a transient worker crash unrelated to this plan's changes. Re-running `determinism.test.ts` alone passed immediately (3/3), and the subsequent full-suite run (150/150) and full-workspace `pnpm -w run test` (14/14 tasks, 2331 mobile tests) both passed cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- This was the last plan in Phase 13's D-01..D-09 rework. `pnpm -w run typecheck` and `pnpm -w run test` are both green across all 8 workspace packages, including the two external consumers of the shared parity fixture.
- `docs/volume-rir-landmarks.md`'s `MAX_SETS_PER_EXERCISE`/`MIN_SETS_PER_EXERCISE` section and the `WORK_SECONDS_PER_SET`/`SESSION_OVERHEAD_MINUTES` "If wrong" paragraph still describe the pre-amendment `MIN_SETS_PER_EXERCISE = 2` / reduce-then-remove fit order (flagged as an open follow-up in 13-02-SUMMARY.md's "Next Phase Readiness", predating this plan and out of this plan's file scope — `slot-fill.ts`/`generate.ts` only). Whoever next touches provenance docs should reconcile that section against 13-01's amendment (`MIN_SETS_PER_EXERCISE = 3`, remove-overflow-first fit order, commit `484ddbd`).
- No blockers for the phase's own scope. D-01 through D-09 are all implemented and covered by unit tests; the D-11 regression fixture requirement was satisfied by 13-01's widened `generate.test.ts` describe block plus this plan's additions to the same block, rather than a separate `__fixtures__/catalog-2day-regression.ts` file — the existing in-file `wideCatalog()` helper already gives every requirement (>=4 exercises/day, no cross-day muscle-group overlap, 5-set cap, budget fit, RIR 0 at cycle 4) real assertions without a second fixture module.

---
*Phase: 13-program-generator-volume-selection-rework*
*Completed: 2026-09-02*

## Self-Check: PASSED

All 4 modified source files (`slot-fill.ts`, `generate.ts`, both test files) confirmed present on
disk, and both task commit hashes (`bff0072`, `5f0acfd`) confirmed present in `git log`.
