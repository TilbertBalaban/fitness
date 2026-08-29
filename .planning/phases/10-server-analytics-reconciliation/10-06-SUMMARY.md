---
phase: 10-server-analytics-reconciliation
plan: 06
subsystem: ui
tags: [react-native, expo-router, analytics-engine, accessibility]

requires:
  - phase: 10-03
    provides: loadMuscleDrilldown (the bounded, local-only, rankMuscleContributions-ordered read this sheet consumes), MuscleContribution
  - phase: 10-05
    provides: muscle-map.tsx's five-state screen, its selectedMuscleGroupId seam, and MuscleVolumeRow's already-shipped press target/accessible name
provides:
  - apps/mobile/components/MuscleDrilldownSheet.tsx — deriveMuscleDrilldownState (error/empty/populated, no loading branch), muscleDrilldownRowLabel, MuscleDrilldownSheetView, MuscleDrilldownSheet
  - apps/mobile/app/muscle-map.tsx — the drill-down wired into 10-05's named seam: resolveMuscleDrilldownSheetProps, exercisePerformanceHref, selectedWindowId (window captured at press time)
affects: [10-07-durability-evidence]

actuals:
  tokens: 8076
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "The drill-down's Modal wrapper is self-contained inside MuscleDrilldownSheet.tsx rather than left to the host to wrap (the existing sheet family's own idiom), since 10-06's seam conditionally mounts this one component wholesale"
    - "A hook-using screen's orchestration decisions are extracted into a pure, exported function (resolveMuscleDrilldownSheetProps) precisely so the screen-level behavior stays testable without a renderer — the same discipline deriveMuscleMapScreenState/deriveRecordsScreenState already established for screen state, extended here to the seam's mount decision"
    - "renderMuscleDrilldownRow is a called function, not a JSX-tag custom component, so a direct-invocation test can see inside a row rather than the row staying an opaque, unexpanded node"

key-files:
  created:
    - apps/mobile/components/MuscleDrilldownSheet.tsx
    - apps/mobile/components/__tests__/MuscleDrilldownSheet.test.tsx
  modified:
    - apps/mobile/app/muscle-map.tsx
    - apps/mobile/app/__tests__/muscle-map.test.ts

key-decisions:
  - "MuscleDrilldownSheetView takes weightUnit and formats each contributing-exercise row's volume label internally (via the existing formatMuscleVolumeLabel), while the header/subheader's volumeLabel is passed in pre-formatted, reused directly from the same row viewmodel MuscleVolumeRow already renders for that muscle — this keeps the sheet's own header in permanent agreement with the row the lifter just pressed (D-06) without a second formatting path."
  - "selectedWindowId is a separate piece of state from the screen's live windowId, captured only at press time inside handleMusclePress. This is what makes 'the drill-down always reads the window that was selected when the row was tapped' true structurally rather than by convention — resolveMuscleDrilldownSheetProps has no notion of a 'current' window at all, only the one it was given."
  - "The screen's orchestration decision (whether to mount the sheet, and with which exact props) was extracted into the pure, exported resolveMuscleDrilldownSheetProps rather than left inline in the hooked MuscleMapScreen component, because this codebase's own test convention (deriveRecordsScreenState/RecordsScreenView, deriveMuscleMapScreenState/MuscleMapScreenView) never invokes a hook-using screen component directly in a test with no renderer — extracting the decision was required to give the plan's own behavior list real test coverage rather than grep-only coverage."

patterns-established:
  - "resolveMuscleDrilldownSheetProps(...) -> MuscleDrilldownSheetResolvedProps | null is the shape any future seam that conditionally mounts a sheet from a hooked screen should follow: null while unresolved, one function computing exactly the child's props once settled."

requirements-completed: [ANLY-05]

coverage:
  - id: D1
    description: "MuscleDrilldownSheet renders all four UI-SPEC states (error, empty, populated, and the untrained-muscle subheader) for one muscle group, is always dismissable through a 48px text Close control, preserves the order rankMuscleContributions already fixed (no .sort of its own), and takes no line clamp anywhere"
    requirement: "ANLY-05"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/MuscleDrilldownSheet.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "Tapping any muscle row (trained or untrained) on the Muscle Map opens the drill-down for that muscle and the window selected at tap time; the sheet is presented only once the bounded local read settles; a failed read still presents the sheet in its error branch; a contributing-exercise press dismisses the sheet and pushes /exercise-performance with the exercise id only"
    requirement: "ANLY-05"
    verification:
      - kind: unit
        ref: "apps/mobile/app/__tests__/muscle-map.test.ts"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-08-29
status: complete
---

# Phase 10 Plan 06: Muscle Drill-Down Sheet Summary

**A bottom-sheet drill-down (four states, no loading spinner) mounted into 10-05's named seam, reading 10-03's local-only `loadMuscleDrilldown` and reusing Phase 9's exercise-performance route with no new metric parameter.**

## Performance

- **Duration:** ~16 min (commit span)
- **Started:** 2026-08-29T19:31:22+03:00
- **Completed:** 2026-08-29T19:46:50+03:00
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `MuscleDrilldownSheet.tsx` — `deriveMuscleDrilldownState`'s three-state classifier (error/empty/populated, no loading branch by design), `muscleDrilldownRowLabel`'s composed accessible name, the hook-free `MuscleDrilldownSheetView` presented via the shipped `<Modal transparent animationType="fade" onRequestClose>` idiom, self-contained rather than left to the host
- Contributing-exercise rows render in exactly the order `rankMuscleContributions` already fixed (no re-sort), each a single 48px `Pressable` with no line clamp on either line; the dismiss control is the word "Close" as a text button, never an icon
- `muscle-map.tsx` — the seam filled: `selectedMuscleGroupId`'s press handler now also captures the window selected at tap time (`selectedWindowId`), a new effect reads `loadMuscleDrilldown` bounded to that one muscle group and window, and `resolveMuscleDrilldownSheetProps` decides whether/how to mount the sheet — null until the read has settled (never mid-load), a value once resolved or failed
- An untrained muscle row opens the sheet on the identical code path as a trained one (its row viewmodel's `valueLabel` is simply `null`); a failed drill-down read still presents the sheet in its error branch so an explicit tap always gets a response
- A contributing-exercise press dismisses the sheet, then pushes the shipped `/exercise-performance` route carrying only the exercise id — no `metric` parameter, so Phase 9's own default applies

## Task Commits

1. **Task 1: The drill-down sheet — four states, one dismiss control, no spinner** - `2d0af8d` (feat)
2. **Task 2: Mount the sheet into the screen's seam and route a contributing exercise onward** - `3cd46b8` (feat)

_No TDD RED/GREEN gate applies — each task's own tests and implementation landed together in one atomic commit per the plan's task boundaries, matching 10-03/10-05's precedent for this phase._

## Files Created/Modified
- `apps/mobile/components/MuscleDrilldownSheet.tsx` - the drill-down sheet, its state classifier, row label composer and themed wrapper
- `apps/mobile/components/__tests__/MuscleDrilldownSheet.test.tsx` - state/label/row/Close-control tests, all by direct invocation with no renderer
- `apps/mobile/app/muscle-map.tsx` - the drill-down effect, `selectedWindowId`, `resolveMuscleDrilldownSheetProps`, `exercisePerformanceHref`, and the sheet mounted into 10-05's seam
- `apps/mobile/app/__tests__/muscle-map.test.ts` - appended (no existing line removed) cases for `resolveMuscleDrilldownSheetProps` and `exercisePerformanceHref`

## Decisions Made
- `MuscleDrilldownSheetView` receives `weightUnit` and formats each row's contributed volume internally via the existing `formatMuscleVolumeLabel`, while the header/subheader's own volume label is passed in pre-formatted — reused directly from the row viewmodel `MuscleVolumeRow` already renders for that muscle, so the sheet's header can never disagree with the row the lifter just pressed (D-06).
- `selectedWindowId` is tracked as its own piece of state, set only inside the row-press handler alongside `selectedMuscleGroupId`, rather than read live from the screen's `windowId` at render time — this is what makes "the drill-down always reads the window selected when the row was tapped" true by construction, not by convention.
- The screen's mount-and-props decision was extracted into the pure, exported `resolveMuscleDrilldownSheetProps` rather than left inline inside the hooked `MuscleMapScreen` component. This codebase's established test convention (`deriveRecordsScreenState`/`RecordsScreenView`, `deriveMuscleMapScreenState`/`MuscleMapScreenView`) never invokes a hook-using screen component directly in a test with no renderer; extracting the decision was necessary to give the plan's own `<behavior>` list (untrained-same-path, never-mid-load, failed-still-presents, window-captured-at-tap) real unit coverage instead of grep-only coverage.

## Deviations from Plan

None — plan executed exactly as written. The extraction of `resolveMuscleDrilldownSheetProps`/`exercisePerformanceHref` is an implementation detail within Task 2's own instructions ("Extend `apps/mobile/app/__tests__/muscle-map.test.ts` with direct-invocation cases for every behaviour above"), not a deviation from scope: the plan does not name these function signatures itself, but achieving direct-invocation testability for a hooked screen component requires exactly this shape, matching precedent already shipped in 10-05/09-XX.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `apps/mobile/components/MuscleDrilldownSheet.tsx` is this plan's sole-owner file — 10-07 imports it for durability evidence but edits neither it nor `muscle-map.tsx`.
- `apps/mobile/components/MuscleVolumeRow.tsx`, `MuscleHeatmap.tsx`, `apps/mobile/lib/db/muscle-volume-query.ts`, `apps/mobile/app/exercise-performance.tsx`, `apps/mobile/lib/theme-colors.ts` and `apps/mobile/package.json` are all untouched, confirmed via `git diff --name-only` against the plan's full forbidden-file list.
- `apps/mobile/app/__durability.web.tsx`, `playwright.config.ts` and `lib/db/test-support.ts` are untouched — 10-07 owns all three.
- No `apps/api` file and no Drizzle schema file was modified, so no `drizzle-kit push` step is needed anywhere in this plan.
- Full mobile test suite (115 suites, 2036 tests) passes with zero skipped tests; `npx turbo run typecheck lint` exits 0 across every workspace package.
- No blockers for 10-07.

## Self-Check: PASSED

All 4 created/modified files verified present on disk; both task commit hashes (`2d0af8d`, `3cd46b8`) verified present in git log.

---
*Phase: 10-server-analytics-reconciliation*
*Completed: 2026-08-29*
