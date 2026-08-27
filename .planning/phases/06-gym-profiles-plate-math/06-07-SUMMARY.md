---
phase: 06-gym-profiles-plate-math
plan: 07
subsystem: ui
tags: [gym-profiles, plate-math, react-native, playwright, session-menu]

# Dependency graph
requires:
  - phase: 06-gym-profiles-plate-math
    provides: "loadEquipmentProfiles (06-03) and loadSessionInventory/restampSessionGym (06-05's session-equipment.ts) — the read/write seams this plan wires into the UI"
provides:
  - "SwitchGymSheetView / SwitchGymSheet — the session menu's fourth row and its picker sheet"
  - "workout.tsx's Switch Gym menu row (Pause/Resume, Session Note, Switch Gym, Discard) and the restamp-then-reload wiring"
  - "switch-gym.spec.ts — real-browser proof that a mid-session gym switch moves forward-looking resolution while a logged set stays exactly as logged"
affects: [08-progression-engine (any future phase reading workout_session.equipment_profile_id inherits the guarantee that a restamp never rewrites history)]

# Actuals (#2632)
actuals:
  tokens: 7615
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SwitchGymSheetView filters archived gyms itself (not trusted from the caller) and decides select-vs-dismiss by comparing the tapped row's id to activeGymId — a pure, prop-driven comparison, not a read or piece of state, so the view stays hook-free while still implementing 'tapping the active row is a no-op'"
    - "SwitchGymSheet (the wrapper) self-loads its own gym list via loadEquipmentProfiles(userId, db) on mount; the restamp write itself stays in workout.tsx's onSelectGym handler, one function away from the session it mutates, rather than being buried inside the sheet component"

key-files:
  created:
    - apps/mobile/components/SwitchGymSheet.tsx
    - apps/mobile/components/__tests__/SwitchGymSheet.test.tsx
    - apps/mobile/e2e/switch-gym.spec.ts
  modified:
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/app/(tabs)/__tests__/workout.test.tsx

key-decisions:
  - "WorkoutScreenViewProps gained two new top-level fields, userId and activeGymId, sourced directly from useWorkoutScreen's own hook option and the live session's equipmentProfileId column — no existing prop carried either at the screen level (only per-exercise ExercisePageData.userId existed), and SwitchGymSheet needs both to self-load its list and to mark the correct row active."
  - "The restamp write (restampSessionGym) and the post-switch reload live in workout.tsx's handleSelectGym, not inside SwitchGymSheet — the sheet's own job is picking a gym and reporting the choice; the plan's action text places 'on selection, call restampSessionGym... then re-run the existing session read' in the workout.tsx wiring paragraph, not the component-build paragraph, and this keeps the write one function away from the session state it mutates."
  - "SwitchGymSheetView decides select-vs-dismiss for the active row itself (comparing the tapped gym's id to activeGymId) rather than pushing that branch into the caller — this keeps 'tapping the already-active row performs no write' directly assertable against the view alone, matching the acceptance criteria's 'sheet test file contains a case asserting the already-active row performs no write.'"

requirements-completed: [GYM-04]

coverage:
  - id: D1
    description: "The session menu gains a fourth row, Switch Gym, between Session Note and Discard; Discard stays last and destructively styled; selecting Switch Gym closes the menu and opens the sheet with no confirmation step."
    requirement: GYM-04
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/workout.test.tsx ('the menu carries Switch Gym between Session Note and Discard...', 'selecting Switch Gym from the menu opens the sheet with no confirmation step')"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/switch-gym.spec.ts (session menu -> Switch Gym -> sheet)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Switch Gym sheet lists every non-archived gym ordered as the gym list orders them, accent-tints and labels the session's current gym, excludes archived gyms entirely, and its Manage Gyms link routes to the gym profiles list."
    requirement: GYM-04
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/SwitchGymSheet.test.tsx (all describe cases: active-tint, archived-exclusion, Manage Gyms, Cancel, single-gym)"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/switch-gym.spec.ts ('the sheet lists both gyms and marks the currently stamped one')"
        status: pass
    human_judgment: false
  - id: D3
    description: "Tapping a non-active row restamps the session's gym column immediately and dismisses the sheet; tapping the already-active row dismisses without a write; no logged set's stored weight is recomputed against the newly active profile."
    requirement: GYM-04
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/SwitchGymSheet.test.tsx ('tapping a non-active row calls onSelect...', 'tapping the already-active row dismisses without a write...')"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/switch-gym.spec.ts (raw session's equipment_profile_id changes; the same typed weight resolves against the new gym; the previously logged set's displayed weight is unchanged)"
        status: pass
    human_judgment: true
    rationale: "The plan's own <verification> carries a <human-check> for the full interactive click-through (session menu row order and colors, live visual accent confirmation on switching gyms) — not something the automated suite asserts. Recorded as WINDOWS.md entry #140 (unrun-verify); no browser/simulator UI session was available for interactive confirmation in this executor pass beyond the automated Playwright run, which passed."

duration: ~18 min commit span (18:52-19:10 UTC+3, 2026-08-27); excludes the preceding read/investigation pass
completed: 2026-08-27
status: complete
---

# Phase 6 Plan 7: Switch Gym Sheet Summary

**A four-row session menu (Pause/Resume, Session Note, Switch Gym, Discard) lets a user restamp the live session's gym mid-workout in two taps — the plate band follows immediately, and a real-browser test proves a previously logged set's weight is never touched.**

## Performance

- **Duration:** ~18 min (commit span)
- **Started:** 2026-08-27T18:52:32+03:00 (base commit)
- **Completed:** 2026-08-27T19:10:10+03:00 (last task commit)
- **Tasks:** 2/2 completed
- **Files modified:** 5 total (3 created, 2 modified)

## Accomplishments

- `SwitchGymSheetView` (hook-free, prop-driven) renders every non-archived gym, accent-tints and labels the session's currently stamped one with a trailing "Active now", and carries a "Manage Gyms" link — copying the row-list-in-a-sheet shape `SessionActionSheet` already established (same overlay, same `ScrollView`, same `max-w-[400px]`, same 48px row floor).
- Tapping the already-active row calls `onDismiss`, never `onSelect` — a pure, prop-driven comparison inside the view itself, so "no write on the active row" is directly assertable against the view without a renderer.
- `SwitchGymSheet` (the thin stateful wrapper) self-loads the caller's gym list via `loadEquipmentProfiles(userId, db)` on mount.
- `workout.tsx`'s session menu gains the Switch Gym row between Session Note and Discard; Discard stays last and destructive. Selecting the row closes the menu and opens the sheet with no confirmation step (D-18).
- On selection, `handleSelectGym` calls `restampSessionGym` (writing only `workout_session.equipment_profile_id`) and then re-runs the existing session read, so the band's resolved inventory follows the newly-stamped gym on the very next read — no logged set is touched, and no historical weight is re-derived.
- `switch-gym.spec.ts` proves this end-to-end against a real `@powersync/web` database: with two gyms whose plate inventories deliberately diverge (a fine 10kg-pair gym vs. a coarse 20kg-pair gym), the same typed 40kg resolves to a loadable breakdown at the first and a not-loadable neighbour pair at the second after switching; the raw session row's `equipment_profile_id` changes to the second gym's id; and a set logged before the switch still displays exactly the weight it was logged with.

## Task Commits

1. **Task 1: The Switch Gym sheet and the session menu row** — `27f8e25` feat(06-07): Switch Gym sheet and session menu row (D-18)
2. **Task 2: Browser proof that a restamp moves the future and not the past** — `3ef92b8` test(06-07): browser proof that a gym switch moves the future, not the past

**Plan metadata:** pending (final `docs(06-07): complete...` commit, made immediately after this SUMMARY commit)

## Files Created/Modified

- `apps/mobile/components/SwitchGymSheet.tsx` - `SwitchGymSheetView` (pure) + `SwitchGymSheet` (thin, self-loading wrapper)
- `apps/mobile/components/__tests__/SwitchGymSheet.test.tsx` - one case per behaviour row: active-tint, archived-exclusion, select/dismiss branching, Manage Gyms, Cancel, single-gym
- `apps/mobile/app/(tabs)/workout.tsx` - the Switch Gym menu row; `userId`/`activeGymId` view props; `handleOpenSwitchGym`/`handleSelectGym`/`handleManageGyms`/`handleCancelSwitchGym`
- `apps/mobile/app/(tabs)/__tests__/workout.test.tsx` - menu-order case (Switch Gym between Session Note and Discard, Discard still last), open-sheet case, sheet-render case
- `apps/mobile/e2e/switch-gym.spec.ts` - the real-browser restamp-moves-the-future-not-the-past proof

## Decisions Made

See `key-decisions` in frontmatter — summarized: `userId`/`activeGymId` were added as new top-level `WorkoutScreenViewProps` fields since nothing existing carried either at the screen level; the restamp write and reload stay in `workout.tsx`'s own handler (matching the plan's own wiring-paragraph placement) rather than inside the sheet component; and the sheet view itself owns the active-row select-vs-dismiss branch so "no write on the active row" is a directly assertable view-level fact.

## Deviations from Plan

None - plan executed as written. No bugs found, no missing critical functionality, no architectural changes.

## Issues Encountered

None. `pnpm --filter mobile test` (1473/1473), `pnpm --filter mobile typecheck`, and `pnpm --filter mobile test:e2e:durability switch-gym.spec.ts` (1/1, real Chromium against a real `@powersync/web` database) are all green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

GYM-04 is now fully satisfied: 06-01's stamp-at-start covers "switch gyms mid-program" (the next session simply starts under whichever gym is active), and this plan covers the real in-gym case — you arrived, and it's not the gym you assumed. `restampSessionGym` (06-05) now has its one production consumer. No blockers for the remaining plans in this phase.

The plan's `<verification>` `<human-check>` (interactive session-menu row order/color confirmation) was not run interactively — no browser/simulator UI session was available in this executor pass beyond the automated Playwright run, which passed. Recorded as WINDOWS.md entry #140 (`unrun-verify`, open).

## Self-Check: PASSED
