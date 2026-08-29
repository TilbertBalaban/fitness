---
phase: 11-program-generation
plan: 01
subsystem: programs
tags: [program-generation, periodization, powersync, drizzle, expo-router, jest]

# Dependency graph
requires:
  - phase: 04-program-builder
    provides: routine/routine_cycle/routine_day/routine_exercise/routine_exercise_cycle_target tables, ResolvedTarget/TargetOverride/resolveTarget/isEmptyOverride, CYCLE_KINDS
  - phase: 06-gym-profiles-plate-math
    provides: ResolvedInventory, resolveInventory, the equipment-loadability shape
  - phase: 08-progression-engine
    provides: the shared-pure-package precedent (@fitness/progression-engine) this plan's package structure mirrors
provides:
  - "@fitness/program-generator: a new pure workspace package that turns a GenerationInput into a plain GeneratedProgramTree (candidate pool, split templates, volume/RIR landmarks, emphasis, session-length trim, deload placement, degradation reporting)"
  - "canEquip/MODEL_EQUIPMENT_TYPES/NON_MODEL_EQUIPMENT_TYPES promoted from apps/mobile into packages/plate-math, now the workspace's single equipment-loadability predicate"
  - "Five closed generation vocabularies in packages/api-contracts/src/generation.ts (training goal, experience level, split preference, deload placement, emphasis level)"
  - "materializeGeneratedProgram: a bulk-transaction writer turning a generated tree into ordinary draft routine rows"
  - "A generate-preview-confirm screen at apps/mobile/app/programs/generate.tsx"
  - "Documented provenance for every periodization constant (docs/volume-rir-landmarks.md) and the five generation vocabularies (docs/program-generation-vocabularies.md)"
affects: [11-02-excluded-exercise-table, 11-03-exclusion-ui, 11-04-split-templates, 11-05-generation-wizard, 11-06-parity-and-durability]

# Actuals (#2632)
actuals:
  tokens: 31000
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A pure shared package (@fitness/program-generator) mirrors @fitness/progression-engine's scaffold, barrel and no-I/O discipline exactly — package.json/tsconfig.json/jest.config.js copied structurally"
    - "A whole aggregate tree (routine -> cycles -> days -> slots -> per-cycle overrides) is emitted as plain data by a pure function, then bulk-written by a thin caller inside one db.transaction — the same structural shape duplicateRoutine already established"
    - "Emphasis multiplier and landmark clamp are one atomic expression (Math.min(Math.max(Math.round(...), mev), mav)) so a stored unclamped intermediate can never overreach the band"
    - "Session-length trimming removes whole slots, never touches a surviving slot's own set count — a day that cannot fit reports the shortfall instead of shrinking prescriptions"
    - "Deload is expressed purely as sparse per-cycle overrides against the same days/slots, never a structural fork of the program tree"

key-files:
  created:
    - packages/api-contracts/src/generation.ts
    - packages/plate-math/src/equippable.ts
    - packages/program-generator/src/result.ts
    - packages/program-generator/src/candidate-pool.ts
    - packages/program-generator/src/split-templates.ts
    - packages/program-generator/src/volume-landmarks.ts
    - packages/program-generator/src/slot-fill.ts
    - packages/program-generator/src/emphasis.ts
    - packages/program-generator/src/session-length.ts
    - packages/program-generator/src/degradation.ts
    - packages/program-generator/src/deload.ts
    - packages/program-generator/src/generate.ts
    - apps/mobile/lib/db/programs/materialize-generated-program.ts
    - apps/mobile/app/programs/generate.tsx
    - docs/program-generation-vocabularies.md
    - docs/volume-rir-landmarks.md
  modified:
    - apps/mobile/lib/db/session-equipment.ts
    - apps/mobile/app/programs/_layout.tsx
    - apps/mobile/lib/navigation/__tests__/route-guard.test.ts
    - packages/api-contracts/src/index.ts
    - packages/plate-math/src/index.ts
    - apps/mobile/package.json
    - apps/api/package.json

key-decisions:
  - "isGenerationInput (T-11-05) is called at the top of generateProgram itself, not left as an unused type guard — the whole malformed input is rejected before any candidate-pool or slot-filling work runs"
  - "DEGRADATION_KINDS/DegradationKind are declared in result.ts alongside DegradationEntry (not degradation.ts) so result.ts's type surface is self-contained at the end of Task 1; degradation.ts imports them for collectDegradations rather than redeclaring, avoiding an ambiguous export-* collision in the barrel"
  - "candidate-pool.ts treats a NON_MODEL_EQUIPMENT_TYPES member (kettlebell, bodyweight, band, medicine_ball, exercise_ball, foam_roller, other) as always-equippable by never calling canEquip on it, rather than changing canEquip's own behavior — canEquip's promoted implementation is unchanged from apps/mobile"

patterns-established:
  - "New closed vocabularies that are pure-function parameters (never a synced column) get only the tuple + docs layers, not the full four-layer Postgres-CHECK/sync.service.ts pattern — documented explicitly in docs/program-generation-vocabularies.md as a deliberate asymmetry"
  - "A source-level purity gate (determinism.test.ts) reads every file under a package's src/ at test time via node:fs, so a clock/random call added to any future module in that package is caught without anyone updating a hardcoded file list"

requirements-completed: [GEN-01, GEN-02, GEN-05, GEN-06, GEN-07]

coverage:
  - id: D1
    description: "generateProgram is a pure function returning a plain GeneratedProgramTree for the tracer's answers (hypertrophy/intermediate/3 days/60 min/full body/no emphasis/no deload), reading no clock and no random source"
    requirement: "GEN-01"
    verification:
      - kind: unit
        ref: "packages/program-generator/src/__tests__/generate.test.ts#produces 4 training cycles, 3 days, filled slots and 8-12 rep targets for the tracer input"
        status: pass
      - kind: unit
        ref: "packages/program-generator/src/__tests__/determinism.test.ts#contains no clock or random source anywhere under src (excluding __tests__)"
        status: pass
    human_judgment: false
  - id: D2
    description: "An exercise whose equipment cannot be produced by the active gym's inventory is absent from the candidate pool"
    requirement: "GEN-02"
    verification:
      - kind: unit
        ref: "packages/program-generator/src/__tests__/candidate-pool.test.ts#excludes a dumbbell-requiring exercise from a pool built against a dumbbell-free inventory"
        status: pass
    human_judgment: false
  - id: D3
    description: "Weekly sets ramp per experience-level landmark band, RIR descends across training cycles, rep bands come from goal — three independent axes, each re-clamped by emphasis without crossing its band"
    requirement: "GEN-05"
    verification:
      - kind: unit
        ref: "packages/program-generator/src/__tests__/emphasis.test.ts#clamps an emphasized value to the band mav rather than the raw multiplied value"
        status: pass
      - kind: unit
        ref: "packages/program-generator/src/__tests__/generate.test.ts#never allocates an emphasized muscle group more weekly sets than its EXPERIENCE_VOLUME_BAND mav"
        status: pass
    human_judgment: false
  - id: D4
    description: "Deload cycles are placed at computed order-index positions and expressed only as per-cycle overrides against the same days/exercises, using the existing CYCLE_KINDS vocabulary"
    requirement: "GEN-06"
    verification:
      - kind: unit
        ref: "packages/program-generator/src/__tests__/deload.test.ts#places a deload every N cycles, with strictly increasing orderIndex"
        status: pass
      - kind: unit
        ref: "packages/program-generator/src/__tests__/generate.test.ts#expresses a deload cycle only as overrides on the same days and slots, never a structural change"
        status: pass
    human_judgment: false
  - id: D5
    description: "materializeGeneratedProgram writes a generated tree into ordinary routine/routine_cycle/routine_day/routine_exercise/routine_exercise_cycle_target rows inside one transaction, indistinguishable (status draft, source user, no new column/vocabulary) from a hand-built program; the screen previews before any write"
    requirement: "GEN-07"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/materialize-generated-program.test.ts#inserts exactly one routine row, one row per cycle, one per day, one per slot, and one per non-empty override, in a single transaction"
        status: pass
      - kind: unit
        ref: "apps/mobile/app/programs/__tests__/generate-screen.test.ts#never calls the writer during generation alone, and calls it exactly once on confirm"
        status: pass
    human_judgment: false

duration: ~45min
completed: 2026-08-29
status: complete
---

# Phase 11 Plan 01: Program Generation Tracer Summary

**A new pure `@fitness/program-generator` package turns a wizard-shaped `GenerationInput` into a plain `GeneratedProgramTree` — candidate pool, full-body split templates, emphasis-clamped volume/RIR landmarks, session-length trimming, deload placement and a structured degradation report — which a bulk-transaction writer then materializes into ordinary draft `routine` rows from a preview-then-confirm screen.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 3
- **Files modified:** 29 (Task 1) + 10 (Task 2) + 3 (Task 3) + 1 (route-guard fix) = 33 distinct files touched across 4 commits

## Accomplishments

- Promoted `canEquip`/`MODEL_EQUIPMENT_TYPES`/`NON_MODEL_EQUIPMENT_TYPES` out of `apps/mobile` into `packages/plate-math`, so `@fitness/program-generator` (importable by `apps/api` too) can depend on the one workspace-wide equipment-loadability predicate instead of re-deriving it.
- Declared five closed generation vocabularies in `packages/api-contracts/src/generation.ts`, documented in `docs/program-generation-vocabularies.md` alongside the deliberate asymmetry with the four-layer enforcement pattern (no Postgres CHECK, no `sync.service.ts` branch — these are pure-function parameters, never synced columns).
- Built the full `@fitness/program-generator` composition: `buildCandidatePool` (equipment + exclusion filtering, exclusion always last per D-09), `resolveSplitTemplate` (declarative full-body templates for 2/3/4 days, `upper_lower`/`push_pull_legs` shaped-but-empty for 11-04), `pickSlotExercise`/`seededRank` (deterministic seeded slot filling), `weeklySetTarget`/`rirForCycle` (project-authored volume/RIR landmarks), `applyEmphasis` (one-expression multiply-and-clamp), `trimToSessionLength` (whole-slot trimming, never touches a surviving slot's own sets), `placeCycles`/`deloadOverrideFor` (deload as pure overrides), `collectDegradations` (deterministic, deduped reduction report), composed by `generateProgram`.
- Wrote `materializeGeneratedProgram`, structurally identical to `duplicateRoutine`'s bulk-transaction shape, and a real generate-preview-confirm screen (`apps/mobile/app/programs/generate.tsx`) where generation and saving are two separate, independently-testable actions.
- Recorded provenance for every periodization constant in `docs/volume-rir-landmarks.md`, closing the Phase 11 research flag (D-15), and added a source-level purity gate (`determinism.test.ts`) that scans the whole package for a clock or random call at test time.

## Task Commits

1. **Task 1: One set of answers becomes real program rows** - `9b7b1a1` (feat)
2. **Task 2: The periodization dials — emphasis, session fit, deloads, degradation** - `9021b04` (feat)
3. **Task 3: Record the numbers and gate the purity** - `55e9a49` (docs)

**Deviation fix:** `f3a5788` (test — route-hoisting regression update for the new `generate` route)

_Note: this plan's tasks are `type="tracer"` (TDD) and `type="auto"` (TDD)/`type="auto"` — each task's tests and implementation landed in a single commit per task rather than separate RED/GREEN commits, since the plan's own acceptance criteria are evaluated at the task boundary, not the individual test-file boundary._

## Files Created/Modified

- `packages/api-contracts/src/generation.ts` - Five closed generation vocabularies (TRAINING_GOALS, EXPERIENCE_LEVELS, SPLIT_PREFERENCES, DELOAD_PLACEMENTS, EMPHASIS_LEVELS)
- `packages/plate-math/src/equippable.ts` - Promoted `canEquip`/`MODEL_EQUIPMENT_TYPES`/`NON_MODEL_EQUIPMENT_TYPES`
- `packages/program-generator/src/result.ts` - The generator's whole type surface: `GenerationInput`, `GenerationCatalog`, `GeneratedProgramTree`, `DegradationEntry`, `isGenerationInput`
- `packages/program-generator/src/candidate-pool.ts` - Equipment + exclusion filtering (D-08/D-09)
- `packages/program-generator/src/split-templates.ts` - Declarative split table + resolution (D-12/D-13)
- `packages/program-generator/src/volume-landmarks.ts` - Volume/RIR/rep-band project-authored constants (D-15/D-16/D-17)
- `packages/program-generator/src/slot-fill.ts` - Deterministic seeded candidate scoring/picking
- `packages/program-generator/src/emphasis.ts` - Emphasis multiplier + atomic landmark clamp (D-18)
- `packages/program-generator/src/session-length.ts` - Session-length slot trimming (D-14)
- `packages/program-generator/src/degradation.ts` - Deterministic, deduped reduction report (D-21)
- `packages/program-generator/src/deload.ts` - Deload cycle placement + override shaping (D-19/D-20)
- `packages/program-generator/src/generate.ts` - The single exported `generateProgram` composition entry point
- `apps/mobile/lib/db/programs/materialize-generated-program.ts` - Bulk-transaction writer (GEN-07)
- `apps/mobile/app/programs/generate.tsx` - Generate-preview-confirm screen
- `docs/program-generation-vocabularies.md` / `docs/volume-rir-landmarks.md` - Provenance documentation
- `apps/mobile/lib/db/session-equipment.ts` - Now imports the promoted predicate instead of declaring it
- `apps/mobile/app/programs/_layout.tsx` - Registers the `generate` route
- `apps/mobile/lib/navigation/__tests__/route-guard.test.ts` - Updated route-hoisting assertions for the new route

## Decisions Made

- `isGenerationInput` (T-11-05's mitigation) is invoked at the very top of `generateProgram` itself rather than left as an unused exported guard, so the DoS mitigation is structurally load-bearing, not aspirational.
- `DEGRADATION_KINDS`/`DegradationKind` live in `result.ts` (declared alongside `DegradationEntry` in Task 1) rather than in `degradation.ts` (Task 2) — `degradation.ts` imports them for `collectDegradations` rather than redeclaring, which also avoids an ambiguous `export *` collision in the package barrel. `degradation.ts` still owns the ordering/dedup logic the plan's action text describes.
- `candidate-pool.ts` treats every `NON_MODEL_EQUIPMENT_TYPES` member as always-equippable by never calling `canEquip` on it (rather than special-casing inside `canEquip` itself), preserving `canEquip`'s exact promoted behavior from `apps/mobile`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated a stale route-hoisting regression assertion**
- **Found during:** Post-Task-3 full `pnpm --filter mobile test` run (plan-level `<verification>`)
- **Issue:** `apps/mobile/lib/navigation/__tests__/route-guard.test.ts`'s "T-04-52 regression" suite hard-coded the exact list of routes nested under `programs/` (`['library', 'new']`). Adding `app/programs/generate.tsx` (an explicit, plan-mandated file) made this a real, expected route addition, but the test's fixed expectation turned it red.
- **Fix:** Updated both assertions (nested-route list and hoisted-sibling list) to include `generate`.
- **Files modified:** `apps/mobile/lib/navigation/__tests__/route-guard.test.ts`
- **Verification:** Full `pnpm --filter mobile test` run: 117/117 suites, 2045/2045 tests passing.
- **Committed in:** `f3a5788`

---

**Total deviations:** 1 auto-fixed (1 bug — stale test assertion)
**Impact on plan:** No scope creep; a pre-existing regression test's hardcoded expectation needed updating to reflect the plan's own mandated new route.

## Issues Encountered

- The `seededRank` tie-break test initially used exercise ids differing by a single adjacent character (`'a'`/`'b'`), which produced a hash difference that never changed sign across 50 sequential seeds (the hash function is close to linear for short, near-identical strings). Fixed by using more distinct exercise ids (`'bench-press'`/`'overhead-press'`) and widening the seed range to 200, which reliably exercises both tie-break outcomes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The vertical slice is proven: closed vocabularies, promoted equipment predicate, pure generator, plain tree, bulk writer, and preview-then-confirm all land unchanged in shape for 11-02 through 11-06 to build on.
- `split-templates.ts` carries the full table shape with `full_body` populated; 11-04 adds `upper_lower`/`push_pull_legs` rows without touching `resolveSplitTemplate`'s signature.
- `generate.tsx` renders the tracer's fixed answers only; 11-05 grows it into the full wizard.
- Exclusions are wired as an empty array with a comment naming 11-03 as the plan that supplies real ids — the candidate-pool exclusion filter itself is already implemented and tested.
- No blockers. `apps/api`'s own test suite (e2e, requires a live Postgres) was not run in this worktree — out of scope for this plan's `<verification>` block, which names only `program-generator`/`plate-math`/`mobile` test runs and `pnpm -w typecheck` (which does exercise `apps/api`'s type surface, including its now-present `@fitness/program-generator` devDependency).

---
*Phase: 11-program-generation*
*Completed: 2026-08-29*
