---
phase: 13-program-generator-volume-selection-rework
plan: 01
subsystem: program-generator
tags: [typescript, program-generation, volume-periodization, rir-ladder, session-fit]

# Dependency graph
requires:
  - phase: 11-program-generation
    provides: generateProgram, the split-template day loop, weeklySetTarget/applyEmphasis, deloadOverrideFor
provides:
  - "MAX_SETS_PER_EXERCISE-capped, hardest-cycle-stable exercise count per muscle group per day (volume-split.ts)"
  - "session-length fit that reduces sets before removing exercises, evaluated against the hardest training cycle (session-fit.ts)"
  - "daysPerWeek-keyed RIR ladder (RIR_LADDER_BY_DAYS_PER_WEEK, rirForCycle(cycleIndex, daysPerWeek))"
affects: [13-02, 13-03, program-generator consumers in apps/api and apps/mobile]

# Actuals (#2632)
actuals:
  tokens: 13294
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PLAN/FIT/PICK/PER-CYCLE staged day loop inside generateProgram, replacing the old pick-then-trim-then-fan-out sequence"
    - "Split decisions and session fits operate on plan descriptors (DaySlotPlan), never on picked GeneratedSlot objects, so a removed plan never consumes a candidate exercise"

key-files:
  created:
    - packages/program-generator/src/volume-split.ts
    - packages/program-generator/src/session-fit.ts
    - packages/program-generator/src/__tests__/volume-split.test.ts
    - packages/program-generator/src/__tests__/session-fit.test.ts
  modified:
    - packages/program-generator/src/generate.ts
    - packages/program-generator/src/session-length.ts
    - packages/program-generator/src/volume-landmarks.ts
    - packages/program-generator/src/__fixtures__/parity.ts
    - packages/program-generator/src/__tests__/generate.test.ts
    - packages/program-generator/src/__tests__/determinism.test.ts
    - packages/program-generator/src/__tests__/volume-landmarks.test.ts
    - packages/program-generator/src/__tests__/session-length.test.ts

key-decisions:
  - "rirForCycle imports GENERATION_INPUT_LIMITS from ./result (no cycle exists) rather than inlining the 2/6 bounds, per the plan's discretion clause"
  - "day_trimmed detail wording is authored freely (D-05 leaves exact text to discretion) but always names the day, budget, both concession counts, and the rounded post-fit estimate"
  - "Dropped a self-authored 'no day_trimmed when already fits' generate.test.ts case once the widened 2-day/60-minute scenario proved that catalog structurally always needs trimming even at the 180-minute input ceiling — the same behavior is proven at the unit level in session-fit.test.ts instead"

patterns-established:
  - "Session-fit and volume-split operate on plan descriptors, not picked slots — a pattern generate.ts's Stage 2 (FIT) depends on and future plans in this phase should preserve"

requirements-completed: [GEN-VOL-01, GEN-VOL-02, GEN-RIR-01]

coverage:
  - id: D1
    description: "A muscle group whose hardest-cycle per-session target exceeds MAX_SETS_PER_EXERCISE (5) gets a second exercise, computed against the hardest training cycle so exercise count is stable across cycles"
    requirement: GEN-VOL-01
    verification:
      - kind: unit
        ref: "packages/program-generator/src/__tests__/volume-split.test.ts#splitSessionSets matches the worked examples exactly"
        status: pass
      - kind: unit
        ref: "packages/program-generator/src/__tests__/volume-split.test.ts#caps every entry at 5, keeps entries non-increasing, and sums to n for every n from 1 to 30"
        status: pass
      - kind: unit
        ref: "packages/program-generator/src/__tests__/generate.test.ts#caps every slot at 5 sets in every cycle, gives each day more than 2 slots, and fits the hardest-cycle estimate inside the session budget"
        status: pass
    human_judgment: false
  - id: D2
    description: "Session-length fit evaluates against the hardest training cycle and reduces sets before removing exercises, by documented victim priority"
    requirement: GEN-VOL-02
    verification:
      - kind: unit
        ref: "packages/program-generator/src/__tests__/session-fit.test.ts#reduces sets before removing exercises: a day of four 4-set/120s-rest plans fitted to 20 minutes ends with every survivor at 2 sets"
        status: pass
      - kind: unit
        ref: "packages/program-generator/src/__tests__/session-fit.test.ts#removes a second exercise of a group before a first exercise of another group, regardless of volume class"
        status: pass
      - kind: unit
        ref: "packages/program-generator/src/__tests__/session-fit.test.ts#removes a small volume-class group before medium before large when no group has a second exercise"
        status: pass
    human_judgment: false
  - id: D3
    description: "rirForCycle is keyed by daysPerWeek — a 2-day week reaches RIR 0 by its last training cycle, a 6-day week never goes below RIR 1"
    requirement: GEN-RIR-01
    verification:
      - kind: unit
        ref: "packages/program-generator/src/__tests__/volume-landmarks.test.ts#is 0 at cycle 3 for a 2-day week — fewer sessions ramp nearer failure"
        status: pass
      - kind: unit
        ref: "packages/program-generator/src/__tests__/volume-landmarks.test.ts#is 1 at cycle 3 for a 6-day week — never below 1"
        status: pass
    human_judgment: false

duration: ~50min
completed: 2026-09-02
status: complete
---

# Phase 13 Plan 01: Volume Split, Session Fit & Frequency-Aware RIR Summary

**Hardest-cycle exercise-count split (volume-split.ts), a reduce-then-remove session fit evaluated against that same hardest cycle (session-fit.ts, replacing trimToSessionLength), and a daysPerWeek-keyed RIR ladder wired through generateProgram's rewritten PLAN/FIT/PICK/PER-CYCLE day loop.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 3
- **Files modified:** 12 (2 new source modules, 2 new test files, 8 modified)

## Accomplishments
- `volume-split.ts`: `MAX_SETS_PER_EXERCISE`/`MIN_SETS_PER_EXERCISE` constants, `exerciseCountForSessionSets`, `distributeSets`, and `splitSessionSets` — a muscle group whose hardest-cycle target exceeds the 5-set cap now gets a second (or third...) exercise instead of one exercise absorbing the whole target.
- `session-fit.ts`: `fitDayToSessionLength` replaces `trimToSessionLength`, evaluating the estimate against the hardest training cycle (not cycle 1) and conceding by reducing sets to a floor before removing whole exercises, by a documented victim priority (second-exercise-of-a-group, then volume class, then day position, with the day's first slot and the last remaining large-class slot both protected).
- `volume-landmarks.ts`: `RIR_LADDER_BY_DAYS_PER_WEEK` replaces the fixed `RIR_PROGRESSION` tuple; `rirForCycle(cycleIndex, daysPerWeek)` clamps `daysPerWeek` into the generation-input range and falls back to the 4-day ladder before indexing (T-13-01).
- `generate.ts`'s day loop rewritten as four ordered stages (PLAN → FIT → PICK → PER-CYCLE): exercise count and per-exercise set ceiling are now decided once against the hardest cycle before any exercise is picked, and per-cycle targets are recomputed per cycle from `weeklySetTarget` and clamped to that ceiling — never scaled linearly down from the hardest cycle, which would distort emphasized/deprioritized groups.
- Shared parity fixture (`__fixtures__/parity.ts`) and every test catalog helper in the package updated for the new RIR ladder and widened to 3+ exercises per muscle group with a deterministic equipment/movement-pattern spread, so the split's second-exercise path is exercised by tests instead of starved by a single-candidate catalog.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire the hardest-cycle split and fit end-to-end through generateProgram** - `9414938` (feat)
2. **Task 2: Unit-test the split and fit modules and retire the replaced trim suite** - `10426be` (test)
3. **Task 3: Recompute the shared parity RIR values and widen the shared catalog fixtures** - `7409c55` (fix)

_Note: this plan carried no `tdd="true"` tasks requiring a separate RED/GREEN gate sequence — verification ran per-task as tests-alongside-implementation._

## Files Created/Modified
- `packages/program-generator/src/volume-split.ts` - `MAX_SETS_PER_EXERCISE`, `MIN_SETS_PER_EXERCISE`, `exerciseCountForSessionSets`, `distributeSets`, `splitSessionSets`
- `packages/program-generator/src/session-fit.ts` - `DaySlotPlan`, `SessionFitResult`, `fitDayToSessionLength`
- `packages/program-generator/src/session-length.ts` - trimmed to the time model alone (`estimateSlotMinutes`, `WORK_SECONDS_PER_SET`, `SESSION_OVERHEAD_MINUTES`); `trimToSessionLength` and `TrimToSessionLengthResult` removed
- `packages/program-generator/src/volume-landmarks.ts` - `RIR_LADDER_BY_DAYS_PER_WEEK`, `rirForCycle(cycleIndex, daysPerWeek)`
- `packages/program-generator/src/generate.ts` - day loop rewritten as PLAN/FIT/PICK/PER-CYCLE stages
- `packages/program-generator/src/__fixtures__/parity.ts` - six `handBuilt(...)` RIR values recomputed for the 3-day ladder; `catalogCovering` widened to 3 exercises/group with deterministic equipment/movement spread
- `packages/program-generator/src/__tests__/generate.test.ts` - widened `fullCatalog`, updated the `ex-chest` literal-id assertions to prefix matching, added the reported-2-day-scenario describe block
- `packages/program-generator/src/__tests__/determinism.test.ts` - widened `fullCatalog` to match generate.test.ts's spread
- `packages/program-generator/src/__tests__/volume-landmarks.test.ts` - `rirForCycle` call sites updated to the two-argument signature with concrete D-09 values
- `packages/program-generator/src/__tests__/session-length.test.ts` - `trimToSessionLength` describe block retired; `estimateSlotMinutes` block extended to pin the surviving constants
- `packages/program-generator/src/__tests__/volume-split.test.ts` - new; covers `distributeSets`/`exerciseCountForSessionSets`/`splitSessionSets` including the 1..30 property sweep
- `packages/program-generator/src/__tests__/session-fit.test.ts` - new; covers the reduce-then-remove order of concessions, victim priority, and the never-mutate contract

## Decisions Made
- `rirForCycle` imports `GENERATION_INPUT_LIMITS` from `./result` rather than inlining the 2/6 bounds — confirmed no import cycle exists (result.ts has no dependency back on volume-landmarks.ts) before choosing the import over the plan's inline-with-comment fallback.
- Dropped a self-authored `generate.test.ts` case asserting "no `day_trimmed` when the day already fits its budget" for the widened 2-day/60-minute scenario: that catalog's structure (a `full_body_2` template with several frequency-1 muscle groups at intermediate `mav`) genuinely exceeds even the 180-minute input ceiling before any fit runs, so the assertion could never hold for that scenario. The same "already-fits" behavior is proven directly at the unit level in `session-fit.test.ts`, which is the correct place for it — the plan's `<behavior>` list scoped this assertion to Task 2, not Task 1's integration test.

## Deviations from Plan

None — plan executed exactly as written. (The dropped test above was an executor-added assertion beyond the plan's required acceptance criteria, not a deviation from a plan-specified behavior.)

## Issues Encountered
- First run of the added `generate.test.ts` "already fits" case failed because the widened 2-day scenario's catalog produces a genuinely large day (16 slots on Full Body A at frequency-1 groups' full `mav`) that exceeds even the 180-minute session-length ceiling before any fit runs — not a bug in the fit, just an infeasible assertion for that specific scenario. Resolved by removing the redundant test (see Decisions Made); the required first test in that describe block (5-set cap, >2 slots/day, hardest-cycle estimate ≤60 minutes) passed on the first run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 13-02 (week-level exercise variety, GEN-SEL-01) and 13-03 (tiered selection scoring, GEN-SEL-02) can build directly on this plan's `pickSlotExercise` call sites in `generate.ts`'s Stage 3 (PICK), which are untouched signature-wise per the plan's own instruction.
- The widened catalog helpers (`fullCatalog`, `catalogCovering`) across `generate.test.ts`, `determinism.test.ts`, and `parity.ts` now give 13-02/13-03 real multi-candidate pools to exercise week-level variety and tiered scoring against, rather than the single-candidate-per-group shape that starved those paths before this plan.
- No blockers. `pnpm -w run typecheck` and `pnpm -w run test` both green across all 8 workspace packages, including the two external consumers of the shared parity fixture (`apps/api/src/generation/__tests__/parity.spec.ts`, `apps/mobile/lib/db/__tests__/generation-parity.test.ts`).

---
*Phase: 13-program-generator-volume-selection-rework*
*Completed: 2026-09-02*

## Self-Check: PASSED

All 8 key files (`volume-split.ts`, `session-fit.ts`, both new test files, `generate.ts`,
`session-length.ts`, `volume-landmarks.ts`, `__fixtures__/parity.ts`) confirmed present on disk,
and all 3 task commit hashes (`9414938`, `10426be`, `7409c55`) confirmed present in `git log`.
