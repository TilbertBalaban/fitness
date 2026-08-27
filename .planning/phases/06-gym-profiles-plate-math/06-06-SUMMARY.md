---
phase: 06-gym-profiles-plate-math
plan: 06
subsystem: ui
tags: [equipment, gym-profiles, swap, react-native, powersync, drizzle, playwright]

# Dependency graph
requires:
  - phase: 06-gym-profiles-plate-math
    provides: "06-02's resolveInventory/EquipmentProfileRow, 06-05's per-exercise equipment-type map and resolved-inventory wiring in workout.tsx, 05's smart-swap.ts scoring and SwapSuggestionList"
provides:
  - "workout_session.unavailable_equipment column (Postgres + SQLite mirror), pushed through drizzle patch-aware sync and validated server-side"
  - "session-equipment.ts's markEquipmentUnavailable/clearEquipmentUnavailable/removeEquipmentFromProfile/loadSessionInventory/equipmentSwapConstraints — the D-21/D-22 subtraction and swap-constraint seam"
  - "SessionActionSheet's Equipment row, gated by the shared hasResolvableEquipment predicate (R11)"
  - "EquipmentAvailabilitySheet — mark-unavailable vs. profile write-through, both transitioning to a real swap-alternatives list"
  - "SwapSuggestionList's optional onSelect callback for non-navigating swap flows"
  - "e2e/equipment-availability.spec.ts — real-browser proof of the full GYM-07 flow"
affects: [06-07, any future plan touching apps/mobile/app/__durability.web.tsx or apps/mobile/lib/db/test-support.ts]

# Actuals (#2632)
actuals:
  tokens: 24962
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Session-scoped equipment unavailability as a UnavailableEquipmentRef[] JSON column, resolved through the single resolveInventory(profile, unavailable) function (D-21) — every consumer (band, rounder, swap constraints) reads the one subtracted view."
    - "View/stateful-wrapper split for a new sheet (EquipmentAvailabilitySheetView + EquipmentAvailabilitySheet), matching WarmupSheet/TargetsSheet's established test-seam convention."
    - "Optional onSelect callback added to an existing presentational list (SwapSuggestionList) so a second caller can reuse it for a session-only action instead of navigation, with zero behavior change for existing callers."

key-files:
  created:
    - apps/mobile/components/EquipmentAvailabilitySheet.tsx
    - apps/mobile/components/__tests__/EquipmentAvailabilitySheet.test.tsx
    - apps/mobile/e2e/equipment-availability.spec.ts
  modified:
    - apps/api/src/db/schema/session.ts
    - apps/mobile/lib/db/schema.ts
    - apps/api/src/sync/patch-update-set.ts
    - apps/api/src/sync/sync.service.ts
    - apps/mobile/lib/db/session-equipment.ts
    - apps/mobile/components/SessionActionSheet.tsx
    - apps/mobile/components/SwapSuggestionList.tsx
    - apps/mobile/components/ExercisePage.tsx
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/lib/db/test-support.ts

key-decisions:
  - "Dumbbell equipment marked unavailable as the whole equipment_type (D-22), not a single weight — no reliable 'currently active weight' exists at the moment the overflow opens; resolveInventory/resolveEquipmentBand already handle unavailableEquipmentTypes correctly, only the display name is coarser (\"Dumbbells\" vs \"10kg Dumbbells\")."
  - "equipmentType/resolvedInventory/equipmentProfileId threaded from workout.tsx into ExercisePage (undeclared in Task 3's <files> list but established by 06-05's own SUMMARY as the intended integration point) — documented as a Rule 2/3 deviation, matching this phase's existing precedent (WINDOWS #134/#135/#137/#138)."
  - "WINDOWS #138 (ExercisePage.tsx's handleSwapPick sharing the getPowerSync()-default gap) fixed in Task 2 rather than left open, since Task 2's own swap-constraint work made the swap write path load-bearing for GYM-07."

requirements-completed: [GYM-07]

coverage:
  - id: D1
    description: "A user can mark the equipment an exercise needs as unavailable for this workout only, and is immediately offered substitute exercises the gym can still equip."
    requirement: GYM-07
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/equipment-availability.spec.ts#marking the only machine unavailable offers a real substitute and swaps the session exercise only"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/session-equipment.test.ts#equipmentSwapConstraints"
        status: pass
    human_judgment: false
  - id: D2
    description: "A separate, explicitly-labelled action writes the unavailability through to the gym profile, behind its own confirmation — the default action never edits the profile."
    requirement: GYM-07
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/equipment-availability.spec.ts#the profile write-through marks the profile machine unavailable while the session marks stay unchanged"
        status: pass
    human_judgment: false
  - id: D3
    description: "Equipment marked unavailable is subtracted from the session's resolved inventory once, and the band, the achievability rounder and the substitute candidates all read that same subtracted view."
    requirement: GYM-07
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/session-equipment.test.ts#loadSessionInventory"
        status: pass
    human_judgment: false
  - id: D4
    description: "Choosing a substitute replaces the exercise for this session only, carrying the original's target sets/rep range/RIR across; the program row is untouched."
    requirement: GYM-07
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/equipment-availability.spec.ts#marking the only machine unavailable offers a real substitute and swaps the session exercise only"
        status: pass
    human_judgment: false
  - id: D5
    description: "The Equipment overflow row is a structural exclusion (absent, not disabled) for exercises with no resolvable equipment band, e.g. bodyweight."
    requirement: GYM-07
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/equipment-availability.spec.ts#a bodyweight exercise never shows the Equipment row"
        status: pass
      - kind: unit
        ref: "apps/mobile/components/__tests__/SessionActionSheet.test.tsx#renders four rows, Equipment absent, when hasEquipment is false"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-08-27
status: complete
---

# Phase 6 Plan 6: Equipment Availability Sheet Summary

**Session-scoped "mark unavailable" with immediate equipment-aware swap suggestions, plus a separate confirmed gym-profile write-through — closing GYM-07.**

## Performance

- **Duration:** ~55 min (across a compacted session)
- **Started:** 2026-08-27T16:01:11Z (Task 1 commit)
- **Completed:** 2026-08-27T16:38:34Z (last task-scope commit; WINDOWS/docs work followed)
- **Tasks:** 3
- **Files modified:** 23 (across 4 commits)

## Accomplishments

- `workout_session.unavailable_equipment` shipped end to end: Postgres column, SQLite mirror, drizzle patch-aware sync field, server-side `UnavailableEquipmentRef[]` validation, and e2e schema-parity/sync coverage.
- `session-equipment.ts` gained the D-21/D-22 seam: `markEquipmentUnavailable`/`clearEquipmentUnavailable` (session-scoped), `removeEquipmentFromProfile` (profile write-through), `loadSessionInventory` (the one subtracted-inventory read every consumer shares), and `equipmentSwapConstraints` (turns that inventory into the swap scorer's allow/exclude shape).
- `SessionActionSheet` gained a fifth, caller-gated Equipment row; `EquipmentAvailabilitySheet` (new) implements the full mark-unavailable / write-through / alternatives flow per the UI-SPEC's Copywriting Contract; `SwapSuggestionList` gained an optional `onSelect` callback with zero behavior change for existing (navigating) callers.
- Real-browser proof (`e2e/equipment-availability.spec.ts`, 3 cases) against a live `@powersync/web` database: marking a named machine unavailable offers and applies a real substitute (targets intact, program row untouched); a bodyweight exercise never shows the row; the profile write-through updates the gym profile while leaving the session's own marks untouched.
- Fixed a real, previously-undetected bug in `workout.tsx`: the per-exercise `equipmentType` prop was keyed by the session_exercise row id instead of the catalog exercise id (a copy-paste mismatch against the correct pattern two lines above), so the Equipment row could never appear for any exercise regardless of equipment type — caught by the new e2e spec, not by any pre-existing unit test.
- WINDOWS #138 (ExercisePage.tsx's `handleSwapPick` sharing the `getPowerSync()`-default gap) fixed as part of Task 2 and marked `fixed` in the ledger.

## Task Commits

Each task was committed atomically:

1. **Task 1: `unavailable_equipment` column, pushed live (D-20/D-21)** - `b66a1a5` (feat)
2. **Task 2: subtraction, equipment-aware swap filter, and the swap write-path fix (D-21/D-22)** - `f87eeb8` (feat)
3. **Task 3: the Equipment row, the availability sheet, and the browser proof** - `9bc0e27` (feat)

**Post-task fix:** `3d7427f` (fix) — the workspace-wide `pnpm -w test` run surfaced a stale test fixture in `apps/api/src/sync/__tests__/patch-update-set.spec.ts` that Task 1's own e2e-scoped verification (`schema-parity`, `session-annotations-sync`) did not exercise.

**Plan metadata:** pending (this commit, made after this SUMMARY)

## Files Created/Modified

- `apps/api/src/db/schema/session.ts` - `unavailableEquipment` jsonb column on workout_session
- `apps/mobile/lib/db/schema.ts` - SQLite mirror (`text('unavailable_equipment')`)
- `apps/api/src/sync/patch-update-set.ts` - PATCH field map entry for the new column
- `apps/api/src/sync/sync.service.ts` - server-side `UnavailableEquipmentRef[]` validation gate
- `apps/api/test/schema-parity.e2e-spec.ts`, `apps/api/test/session-annotations-sync.e2e-spec.ts` - schema/sync coverage for the new column
- `apps/api/src/sync/__tests__/patch-update-set.spec.ts` - full-PATCH fixture now covers the new column
- `apps/mobile/lib/db/session-equipment.ts` - `loadSessionUnavailable`, `markEquipmentUnavailable`, `clearEquipmentUnavailable`, `removeEquipmentFromProfile`, `loadSessionInventory`, `equipmentSwapConstraints`
- `apps/mobile/lib/db/__tests__/session-equipment.test.ts` - unit coverage for the above
- `apps/mobile/lib/catalog/smart-swap.ts` - doc-comment update only (D-22 ownership note)
- `apps/mobile/components/ExercisePage.tsx` - active-sheet wiring for `EquipmentAvailabilitySheet`, `hasEquipment` predicate (R11), and the WINDOWS #138 swap write-path fix
- `apps/mobile/components/EditingWorkoutScreen.tsx` - threaded the 3 new `ExercisePage` props (always-null for historical editing, D-11)
- `apps/mobile/components/SessionActionSheet.tsx` - Equipment row, `hasEquipment` gating
- `apps/mobile/components/SwapSuggestionList.tsx` - optional `onSelect` callback
- `apps/mobile/components/EquipmentAvailabilitySheet.tsx` (new) - the sheet itself, View/wrapper split
- `apps/mobile/components/__tests__/*.test.tsx` - unit coverage for all three components above
- `apps/mobile/app/(tabs)/workout.tsx` - threaded `equipmentTypeByExerciseId`/`resolvedInventory`/`equipmentProfileId` into `ExercisePage`, fixed the exercise-id key mismatch bug
- `apps/mobile/app/__durability.web.tsx`, `apps/mobile/lib/db/test-support.ts` - `seedSwapCandidate` harness seed (additive, appended per shared_file_seam), `readWorkoutSessionRaw`'s SELECT extended to include `unavailable_equipment`
- `apps/mobile/e2e/equipment-availability.spec.ts` (new) - the real-browser proof

## Decisions Made

- Dumbbell unavailability is recorded as the whole `equipment_type`, not a specific weight (no reliable "currently focused weight" exists at overflow-open time); the sheet's display name is coarser ("Dumbbells") but the resolution logic is unaffected.
- `equipmentType`/`resolvedInventory`/`equipmentProfileId` threaded from `workout.tsx` into `ExercisePage` even though Task 3's `<files>` list didn't name `workout.tsx` — 06-05's own SUMMARY explicitly flagged this as the intended integration point for 06-06/06-07, so this is documented as a Rule 2/3 deviation rather than scope creep.
- WINDOWS #138 was fixed (not left open) in Task 2, since Task 2's swap-constraint work made the swap write path load-bearing for this plan's own `<done>` criterion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `nest build` failure after Task 1's schema change**
- **Found during:** Task 1
- **Issue:** `patch-update-set.spec.ts`'s `workoutSessionValues()` test helper was missing the new required `unavailableEquipment` field, breaking the type build.
- **Fix:** Added `unavailableEquipment: null,` to the helper.
- **Files modified:** `apps/api/src/sync/__tests__/patch-update-set.spec.ts`
- **Verification:** `nest build` clean.
- **Committed in:** `b66a1a5` (Task 1 commit)

**2. [Rule 1 - Bug] `equipmentSwapConstraints`'s `allowEquipment` correctness bug (self-caught before any test run)**
- **Found during:** Task 2
- **Issue:** The initial implementation's `allowEquipment` branch listed only the still-usable MODEL_EQUIPMENT_TYPES, omitting the 7 non-model types (kettlebell, bodyweight, band, medicine_ball, exercise_ball, foam_roller, other) — since `scoreAlternatives`' `allowEquipment` is a positive allow-list, this would have wrongly excluded every bodyweight/kettlebell/etc. candidate whenever the allow-branch fired.
- **Fix:** Derived `NON_MODEL_EQUIPMENT_TYPES` from `EQUIPMENT_TYPES` at module scope and folded it into the returned `allowEquipment` list.
- **Files modified:** `apps/mobile/lib/db/session-equipment.ts`
- **Verification:** `apps/mobile/lib/db/__tests__/session-equipment.test.ts`'s `equipmentSwapConstraints` cases.
- **Committed in:** `f87eeb8` (Task 2 commit)

**3. [Rule 1 - Bug] WINDOWS #138: `ExercisePage.tsx`'s `handleSwapPick` used the production `getPowerSync()` default instead of the caller-supplied `db`**
- **Found during:** Task 2
- **Issue:** A pre-existing, previously-flagged latent defect (WINDOWS #138) — the swap write always resolved the production singleton rather than the harness's isolated per-test database, which would have made any future browser-tested swap silently land in the wrong SQLite file.
- **Fix:** `await swapSessionExercise({ sessionExerciseId, newExerciseId: picked.id }, db ?? getPowerSync());`
- **Files modified:** `apps/mobile/components/ExercisePage.tsx`
- **Verification:** `e2e/equipment-availability.spec.ts`'s swap case (Task 3) exercises this exact path and passes.
- **Committed in:** `f87eeb8` (Task 2 commit); ledger updated to `fixed` after Task 3.

**4. [Rule 2/3 - Undeclared but required] Threading `equipmentType`/`resolvedInventory`/`equipmentProfileId` through `workout.tsx` and `EditingWorkoutScreen.tsx`**
- **Found during:** Task 3
- **Issue:** Neither file was in Task 3's `<files>` list, but `ExercisePage`'s new required props have no other data source — 06-05's own SUMMARY names this as the intended 06-06 integration point.
- **Fix:** Threaded the 3 values through both call sites (`EditingWorkoutScreen.tsx`'s historical-editing call site passes `null` for all three, per D-11).
- **Files modified:** `apps/mobile/app/(tabs)/workout.tsx`, `apps/mobile/components/EditingWorkoutScreen.tsx`, plus their existing test suites' `baseProps`/`baseViewProps` helpers.
- **Verification:** `pnpm --filter mobile typecheck`, full unit suite.
- **Committed in:** `9bc0e27` (Task 3 commit)

**5. [Rule 1 - Bug] `equipmentType` prop mis-keyed by session_exercise row id instead of catalog exercise id**
- **Found during:** Task 3, while investigating the e2e spec's "Equipment row never appears" failure
- **Issue:** `equipmentType={equipmentTypeByExerciseId.get(exercise.id) ?? null}` used the strip array's `.id` (the session_exercise row id), but `equipmentTypeByExerciseId` is keyed by the catalog exercise id — the correct key (`pageData.exerciseId`) was already used two lines away for `exerciseId` itself, and the correct pattern (`exercise.exerciseId`) already existed for the PlateStrip band's own lookup a few lines above. The mismatch meant the map lookup always missed, so `hasEquipment` was always false and the Equipment row never rendered for any exercise, regardless of equipment type.
- **Fix:** `equipmentType={equipmentTypeByExerciseId.get(pageData.exerciseId) ?? null}`
- **Files modified:** `apps/mobile/app/(tabs)/workout.tsx`
- **Verification:** `e2e/equipment-availability.spec.ts`'s all 3 cases now pass; full unit suite (1509 tests) unaffected.
- **Committed in:** `9bc0e27` (Task 3 commit)

**6. [Rule 1 - Bug] Stale full-PATCH test fixture missing the new column**
- **Found during:** post-Task-3 verification (`pnpm -w test`, not part of any single task's own `<verify>`)
- **Issue:** `patch-update-set.spec.ts`'s "a PATCH naming every mutable workout_session column returns every key" test's `data` payload didn't include `unavailable_equipment`, so its result diverged from `workoutSessionValues()`'s key set the moment Task 1 added the column. Task 1's own e2e-scoped verification (`schema-parity`, `session-annotations-sync`) didn't exercise this unit-level fixture.
- **Fix:** Added `unavailable_equipment: '[{"kind":"equipment_type","equipmentType":"barbell"}]'` to the PATCH data fixture.
- **Files modified:** `apps/api/src/sync/__tests__/patch-update-set.spec.ts`
- **Verification:** `pnpm -w test` — all 8 turbo tasks green (api, mobile, all packages).
- **Committed in:** `3d7427f` (separate fix commit)

---

**Total deviations:** 6 auto-fixed (1 blocking, 3 bugs, 1 undeclared-but-required plumbing, 1 pre-existing ledger fix)
**Impact on plan:** All fixes were necessary for correctness (two were real bugs that would have shipped a broken Equipment row and a wrong-database swap write); no scope creep beyond what 06-05's own SUMMARY had already flagged as this plan's integration point.

## Issues Encountered

- The e2e spec's first run failed on "Equipment row never appears" for both machine-exercise cases — root-caused via a debug read of the raw session/profile rows (confirming the DB state was correct) followed by tracing `workout.tsx`'s prop-threading, which surfaced deviation #5 above. Debug `console.log` calls were added temporarily to the spec and removed once the root cause was fixed.
- `scoreAlternatives`' scoring threshold (0.3) requires a real muscle-overlap or movement-pattern signal — neither of which any existing seed helper provides for `seedProgrammedSessionWithEquipment`'s bare exercises — so a new, additive `seedSwapCandidate` harness helper was written (candidate exercise + a synthetic shared-muscle-group mapping row) rather than relying on equipment-match bonus alone, which the scorer's own threshold deliberately makes insufficient by itself.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- GYM-07 is fully closed: session-scoped mark-unavailable, profile write-through, and equipment-aware swap suggestions are all live and proven against a real browser database.
- The `<human-check>` line in this plan's `<verification>` block (manual web-target confirmation of the same flow) is covered by `e2e/equipment-availability.spec.ts`'s equivalent automated assertions; no separate manual UAT step is expected to surface new information.
- `apps/mobile/app/__durability.web.tsx` and `apps/mobile/lib/db/test-support.ts` both gained one new, additively-appended entry (`seedSwapCandidate`) — 06-07, which edits the same files concurrently, should find no conflicting edits since nothing existing was reordered or renamed.

---
*Phase: 06-gym-profiles-plate-math*
*Completed: 2026-08-27*

## Self-Check: PASSED

All 14 files listed under "Files Created/Modified" confirmed tracked via `git ls-files`. All 4 commit hashes (`b66a1a5`, `f87eeb8`, `9bc0e27`, `3d7427f`) confirmed present via `git log --oneline --all`.
