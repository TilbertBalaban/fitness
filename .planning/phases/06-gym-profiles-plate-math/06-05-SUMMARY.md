---
phase: 06-gym-profiles-plate-math
plan: 05
subsystem: ui
tags: [plate-math, equipment-band, react-native, playwright, rounding]

# Dependency graph
requires:
  - phase: 06-gym-profiles-plate-math
    provides: "achievability.ts/band.ts (roundToAchievable, resolveEquipmentBand, achievableXLoads) from 06-02"
provides:
  - "session-equipment.ts — loadSessionInventory/restampSessionGym, the session's resolved-inventory snapshot seam"
  - "The complete PlateStripView — every EquipmentBandState kind rendered per the UI-SPEC Copywriting Contract"
  - "The workout screen's live band wiring — resolveEquipmentBand memoised on (inventory, in-flight target), never in the render path"
  - "Achievable tap-to-autofill and achievable warm-up generation, closing D-09's typed-vs-app-generated asymmetry"
affects: [06-gym-profiles-plate-math (06-06/06-07 build on session-equipment.ts's restampSessionGym and this plan's equipment-type map), 08-progression-engine]

# Actuals (#2632)
actuals:
  tokens: 19663
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PlateStripView takes an already-resolved EquipmentBandState, never a raw inventory+target pair — all solver/band-resolver calls live in the caller (the workout screen's useMemo), keeping the component itself provably free of any solve/resolve call (grep-enforced by the plan's own acceptance criteria)"
    - "Per-exercise equipment_type is read through a local, additive helper (loadExerciseEquipmentTypeMap) inside workout.tsx rather than a change to session-query.ts/load-program.ts, since this plan's declared file scope is band/rounding wiring, not those shared read modules"
    - "Machine/cable achievable-load selection is deliberately NOT duplicated at the tap-to-autofill call site — band.ts's name-then-id machine ordering (06-02's GYM-03 decision) stays its one observable point; the autofill path falls through to 'write the logged value unchanged' for machine/cable, the same null-rounder behaviour D-09 already specifies for 'nothing achievable'"

key-files:
  created: []
  modified:
    - apps/mobile/components/PlateStrip.tsx
    - apps/mobile/components/__tests__/PlateStrip.test.tsx
    - apps/mobile/components/NumericKeypad.tsx
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/app/(tabs)/__tests__/workout.test.tsx
    - apps/mobile/lib/db/session-mutations.ts
    - apps/mobile/lib/db/__tests__/session-mutations.test.ts
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/e2e/plate-strip.spec.ts

key-decisions:
  - "NumericKeypad.tsx's PlateStripBandData was changed from a raw {inventory, targetKg, unit} pass-through to {state: EquipmentBandState, unit, onNeighbourPress, onRecoveryPress} — required by Task 2's own no-solve-in-PlateStrip.tsx constraint, and NumericKeypad.tsx is not in either task's declared <files> but is the one file that type-aliases PlateStripProps, so leaving it unmodified would have broken the build (Rule 3)."
  - "Per-exercise equipment_type is resolved through a new local helper in workout.tsx (querying exercise/seededExercise directly) rather than extending loadExerciseNameMap/loadSessionTree — no existing read in the codebase carried EquipmentType per exercise, and extending session-query.ts/load-program.ts was outside this plan's declared file scope (Rule 2 — missing critical functionality, minimally scoped)."
  - "The e2e harness gained seedProgrammedSessionWithEquipment/seedGymProfile — the existing seedProgrammedSession deliberately seeds bare exercise ids with no catalog row (every other e2e spec's 'Unknown exercise' assertion depends on that), so a NEW, additive seed path was required rather than modifying the shared one (Rule 2/3, scoped to plate-strip.spec.ts's own needs)."
  - "Tap-to-autofill's achievable rounding covers barbell/ez_bar and dumbbell directly (single-argument achievable-set builders); machine/cable falls through to the unchanged-value path rather than duplicating band.ts's machine-selection ordering at a second call site."

requirements-completed: [GYM-03, GYM-05, GYM-06]

coverage:
  - id: D1
    description: "The session's resolved inventory is read through loadSessionInventory (D-17 snapshot) — a session started at one gym never re-resolves against a later-switched active gym"
    requirement: GYM-03
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/session-equipment.test.ts (prior executor, Task 1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "PlateStripView renders every EquipmentBandState kind (plates, pair, stack, not_loadable, no_plates, collapsed) per the UI-SPEC Copywriting Contract, grows past the 40px reservation only for a real tap target, and collapses defensively on a thrown computation"
    requirement: GYM-05
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/PlateStrip.test.tsx (all describe blocks)"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/plate-strip.spec.ts (7 cases: barbell breakdown, auto-seed, not-loadable+tap, zero-plate recovery link, dumbbell pair, bodyweight collapse, achievable autofill)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The band is live on the workout screen for the currently focused weight field only, memoised on (inventory, target), and both tap-to-autofill and generated warm-ups produce loads the active gym can actually make"
    requirement: GYM-06
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/workout.test.tsx ('threads the already-resolved band state and callbacks...'); apps/mobile/lib/db/__tests__/session-mutations.test.ts ('rounds each step down to the nearest achievable barbell load...')"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/plate-strip.spec.ts ('a not-loadable weight shows both neighbours...'; 'tap-to-autofill lands on an achievable load...')"
        status: pass
    human_judgment: false

duration: unknown — resumed from a quota-killed prior run; this executor's own wall-clock time was not separately timestamped
completed: 2026-08-27
status: complete
---

# Phase 6 Plan 5: The Complete Equipment/Plate Band Summary

**PlateStripView renders every EquipmentBandState kind against the UI-SPEC's exact Copywriting Contract, the workout screen resolves and memoises the band per-keystroke off a session-snapshotted inventory, and both tap-to-autofill and generated warm-ups round to what the active gym can actually load.**

## Performance

- **Tasks:** 3/3 completed (Task 1 by a prior, quota-killed executor; Tasks 2–3 by this run)
- **Files modified:** 13 total (3 from Task 1, 10 from Tasks 2–3)
- **Commits:** 3

## Accomplishments

- `session-equipment.ts` (Task 1, prior executor): `loadSessionInventory`/`restampSessionGym`, the session's resolved-inventory snapshot seam (D-17/D-18).
- `PlateStripView` now renders all six `EquipmentBandState` kinds: the loadable barbell/ez_bar plate breakdown, the loadable dumbbell pair, the loadable machine/cable stack (with optional base-resistance clause), the not-loadable state's two independently tappable accent neighbours, the zero-plates recovery link, and the collapsed (zero-height) state — with a defensive try/catch that collapses the band on any thrown computation rather than surfacing a partial or garbled render.
- `PlateStrip.tsx` makes zero calls to `solve`/`resolve` at any call site (grep-enforced) — it is a pure, hook-free, props-driven view over an already-resolved `EquipmentBandState`.
- The workout screen loads the session's resolved inventory through `loadSessionInventory` (replacing the tracer's direct `loadEquipmentProfile`+`resolveInventory` call) and a new per-exercise equipment-type map, then computes the band state via `resolveEquipmentBand`, memoised on `(inventory, activeEquipmentType, resolvedInventory, weightUnit)` — the band is `collapsed` outside the weight field and recomputes only when its own inputs actually change.
- Tap-to-autofill now rounds the reference weight to nearest achievable (`roundToAchievable(..., 'nearest')`) against the session's inventory before writing it into the field, for both the trailing draft row and an existing logged set; the reference row's own displayed figure is read from `referenceMap` and is never touched by this write. When nothing is achievable, the logged value is written through unchanged.
- `generateWarmupSets` resolves the session's inventory (via the session_exercise → session_id lookup) and, when one resolves, passes `warmupSets` a `roundWeight` closure that rounds each step down (`roundToAchievable(..., 'down')`) against the achievable barbell loads — never up, closing the "a warm-up rounded up is heavier than intended" hazard. When no inventory resolves, the plain increment path runs unchanged (byte-identical to every pre-existing caller).
- The e2e durability harness gained `seedProgrammedSessionWithEquipment` (two exercises with real, resolvable `equipmentRequired` catalog rows) and `seedGymProfile` (delegates to the real `createEquipmentProfile`), extending `plate-strip.spec.ts` to 7 real-browser cases covering every must-have truth in the plan.

## Task Commits

1. **Task 1: The session's resolved inventory** — `c36ad7b` feat(06-05): session-equipment — the session's resolved inventory (D-17/D-18) *(prior, quota-killed executor)*
2. **Task 2: The complete band** — `edfaa9d` feat(06-05): the complete equipment/plate band — every EquipmentBandState kind (D-09/D-13)
3. **Task 3: Wire the band, and make every app-generated load achievable** — `65117eb` feat(06-05): wire the band into the workout screen, and make every app-generated load achievable (D-09/D-10/D-17)

**Plan metadata:** pending (final `docs(06-05): complete...` commit, made immediately after this SUMMARY commit)

## Files Created/Modified

- `apps/mobile/lib/db/session-equipment.ts` - `loadSessionInventory`, `restampSessionGym` (Task 1, prior executor)
- `apps/mobile/components/PlateStrip.tsx` - `PlateStripView` renders every `EquipmentBandState` kind; `PlateStrip` wrapper resolves theme colors only
- `apps/mobile/components/__tests__/PlateStrip.test.tsx` - one describe block per band kind, plus a collapsed-kind case per equipment type routed through the real `resolveEquipmentBand`, plus a defensive-error case
- `apps/mobile/components/NumericKeypad.tsx` - `PlateStripBandData` now carries `{state, unit, onNeighbourPress, onRecoveryPress}` instead of `{inventory, targetKg, unit}`
- `apps/mobile/app/(tabs)/workout.tsx` - `loadSessionInventory`/`loadExerciseEquipmentTypeMap`/`achievableLoadsForEquipmentType`, the memoised `bandState`, `handleBandNeighbourPress`/`handleBandRecoveryPress`, achievable-rounded `handleReferenceTap`
- `apps/mobile/app/(tabs)/__tests__/workout.test.tsx` - `baseViewProps` carries `bandState`/`onBandNeighbourPress`/`onBandRecoveryPress`; a new case asserts the band prop threads through only for the weight field
- `apps/mobile/lib/db/session-mutations.ts` - `generateWarmupSets` resolves the session's inventory and rounds each warm-up step down via `roundToAchievable`
- `apps/mobile/lib/db/__tests__/session-mutations.test.ts` - two new cases (achievable rounding, and the no-inventory fallback), plus a bare-`select()` fix to the file's own in-memory DB fake
- `apps/mobile/app/__durability.web.tsx` - `seedWorkoutSessionWithEquipment`, `seedGymProfile` harness globals
- `apps/mobile/lib/db/test-support.ts` - `seedProgrammedSessionWithEquipment`, `seedGymProfile`
- `apps/mobile/e2e/plate-strip.spec.ts` - 7 cases total (2 preserved from the tracer, 5 new: not-loadable+tap, zero-plate recovery link, dumbbell pair, bodyweight collapse, achievable autofill with reference-figure-unchanged proof)

## Decisions Made

See `key-decisions` in frontmatter — summarized: NumericKeypad.tsx's band-prop type had to change alongside PlateStrip.tsx's (tightly coupled, unlisted file); per-exercise equipment type needed a new local read since nothing in the codebase carried it yet; the e2e harness needed an additive equipment-aware seed path rather than a change to the shared bare-exercise-id one; and machine/cable tap-to-autofill deliberately doesn't duplicate band.ts's machine-ordering rule.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `NumericKeypad.tsx`'s `PlateStripBandData` type had to change alongside `PlateStrip.tsx`'s new props**
- **Found during:** Task 2, after rewriting `PlateStripProps`/`PlateStripView` to take an already-resolved `EquipmentBandState`
- **Issue:** `NumericKeypad.tsx` (not in either task's declared `<files>`) type-aliases `PlateStripBandData = PlateStripProps` and constructs the old `{inventory, targetKg, unit}` shape — Task 2's change broke it, a genuine typecheck blocker.
- **Fix:** Replaced the type alias with an explicit `PlateStripBandData` interface carrying `{state, unit, onNeighbourPress, onRecoveryPress}`, and updated the one JSX call site that constructs `<PlateStrip>`.
- **Files modified:** `apps/mobile/components/NumericKeypad.tsx`
- **Verification:** `pnpm --filter mobile test -- NumericKeypad` and `pnpm -w typecheck` both exit 0.
- **Committed in:** `edfaa9d` (Task 2 commit)

**2. [Rule 2 - Missing Critical] No existing read carried per-exercise `equipment_type`**
- **Found during:** Task 3, wiring the band's `equipmentType` input
- **Issue:** `resolveEquipmentBand` requires the exercise's `EquipmentType`, but neither `loadSessionTree`/`loadLiveSession` (session-query.ts) nor `loadExerciseNameMap` (load-program.ts) reads `equipment_required` — the field exists on `exercise`/`seeded_exercise` but nothing in the mobile app surfaced it yet.
- **Fix:** Added a local, additive `loadExerciseEquipmentTypeMap` helper directly in `workout.tsx` (unions seeded/custom exactly like `loadExerciseNameMap` does), rather than extending the two shared read modules, which are outside this plan's declared file scope.
- **Files modified:** `apps/mobile/app/(tabs)/workout.tsx`
- **Verification:** `pnpm --filter mobile test -- workout` and `pnpm -w typecheck` both exit 0; the e2e suite's dumbbell/bodyweight cases prove real equipment-type resolution end-to-end.
- **Committed in:** `65117eb` (Task 3 commit)

**3. [Rule 2/3 - Missing Critical / Blocking] The e2e harness's shared seed helper couldn't carry a real equipment type**
- **Found during:** Task 3, extending `plate-strip.spec.ts` with the dumbbell/bodyweight/not-loadable/zero-plate/autofill cases the plan's action text names
- **Issue:** `seedProgrammedSession` (test-support.ts) deliberately seeds bare exercise ids with no catalog row — five other e2e specs (`reorder-exercises`, `target-write-back`, `session-notes`, `workout-screen`, `workout-summary`) assert "Unknown exercise" against that exact behaviour, so it could not be changed to carry equipment types without breaking them.
- **Fix:** Added a new, additive `seedProgrammedSessionWithEquipment` (real `seeded_exercise` rows with a real `equipmentRequired` per exercise, distinct exercise-id prefix so it never collides with the existing fixture) and a `seedGymProfile` helper (delegates to the real `createEquipmentProfile`), exposed through two new `__durability.web.tsx` harness globals. `plate-strip.spec.ts`'s two pre-existing cases were migrated to the new seed call (same assertions, unchanged); five new cases use it plus `seedGymProfile`/`setActiveGym`/`seedPriorHeaviestSet` for the not-loadable, zero-plate, dumbbell, bodyweight, and achievable-autofill scenarios.
- **Files modified:** `apps/mobile/lib/db/test-support.ts`, `apps/mobile/app/__durability.web.tsx`, `apps/mobile/e2e/plate-strip.spec.ts`
- **Verification:** `pnpm --filter mobile test:e2e:durability plate-strip.spec.ts` — 7/7 pass against a real `@powersync/web` database.
- **Committed in:** `65117eb` (Task 3 commit)

**4. [Rule 1 - Bug] `session-mutations.test.ts`'s in-memory DB fake couldn't answer a bare (unprojected) `select()`**
- **Found during:** Task 3, adding the achievable-warmup-rounding test, which exercises `loadSessionInventory` → `loadEquipmentProfile`'s bare `db.select().from(equipmentProfile).where(...)` call
- **Issue:** The file's own `inMemoryDb()` fixture's `select` implementation assumed a projection object was always passed and threw (`Object.entries(undefined)`) on a bare call — the exact fix `session-equipment.test.ts` (Task 1) already had to make for the same reason.
- **Fix:** Extended the fixture's `select` to accept an optional projection and return whole rows when none is given, mirroring `session-equipment.test.ts`'s own precedent.
- **Files modified:** `apps/mobile/lib/db/__tests__/session-mutations.test.ts`
- **Verification:** `pnpm --filter mobile test -- session-mutations` exits 0, including the new achievable-rounding case.
- **Committed in:** `65117eb` (Task 3 commit)

---

**Total deviations:** 4 auto-fixed (1 Rule 1, 1 Rule 3, 2 Rule 2/3)
**Impact on plan:** All four were direct, necessary consequences of completing the plan's own stated scope against files the plan's `<files>` lists didn't (and couldn't, without breaking other specs) name. No scope creep beyond what each task's own behaviour list required.

## Issues Encountered

None beyond the deviations above. `pnpm -w typecheck` and `pnpm --filter mobile test` (1447 tests) are green; `pnpm --filter mobile test:e2e:durability plate-strip.spec.ts` is 7/7 green against a real browser and a real `@powersync/web` database. A full `--project=durability` run additionally showed 3 pre-existing, unrelated `ERR_CONNECTION_REFUSED`/`ERR_EMPTY_RESPONSE` failures in `workout-screen.spec.ts`/`workout-summary.spec.ts` — both files are explicitly commented `WRITTEN BUT NOT EXECUTED per this project's browser-testing-only-on-request rule ... recorded in .planning/WINDOWS.md as an unrun-verify ledger entry`, i.e. a pre-existing, already-documented environment limitation (dev-server instability under a long sequential run), not a regression from this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The band is fully live end-to-end: every equipment type this phase supports renders the correct band content, the not-loadable state offers real corrections by tap rather than rewrite, and no weight the app itself puts into a field (tap-to-autofill, generated warm-ups) is one the active gym cannot load. `session-equipment.ts`'s `restampSessionGym` (Task 1) is ready for 06-07's mid-session gym-switch consumer. No blockers for the remaining plans in this phase.

## Self-Check: PASSED

All 11 files confirmed tracked via `git ls-files`; all 3 task commit hashes (`c36ad7b`, `edfaa9d`, `65117eb`) confirmed present via `git log --oneline --all`.
