---
phase: 10-server-analytics-reconciliation
plan: 05
subsystem: ui
tags: [react-native, react-native-svg, accessibility, analytics-engine, expo-router]

requires:
  - phase: 10-03
    provides: MUSCLE_MAP_WINDOWS/MUSCLE_MAP_WINDOW_DAYS/MUSCLE_MAP_WINDOW_CHIP_LABELS/MUSCLE_MAP_WINDOW_LABELS, MUSCLE_GROUP_FIGURE_SIDE, MUSCLE_MAP_ROW_ORDER, topTrainedPoint, and loadMuscleMapWindow (the local + rollup-plus-overlay read this screen consumes)
provides:
  - apps/mobile/components/MuscleHeatmap.tsx — resolveMuscleMapFigureWidth, fillForMusclePoint (R22 categorical fill), muscleMapFigureSummary (R23 announcement), the phase's only new react-native-svg consumer
  - apps/mobile/components/MuscleVolumeRow.tsx — muscleVolumeRowLabel (three-branch accessible name), MuscleVolumeRowView/MuscleVolumeRow
  - apps/mobile/lib/analytics/muscle-map-labels.ts — formatMuscleVolumeLabel, staleRollupCaption, MUSCLE_MAP_VOLUME_CAPTION
  - apps/mobile/app/muscle-map.tsx — the S5 route, deriveMuscleMapScreenState, MuscleMapScreenView, and the named 10-06 drill-down seam
  - History tab header + empty-state "Muscle Map" entry point
affects: [10-06-muscle-drilldown-sheet, 10-07-durability-evidence]

actuals:
  tokens: 14600
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Two <Svg> blocks written out literally rather than shared through one sub-component, so each carries its own independently-testable accessibilityRole=\"image\" announcement in source (not just at runtime)"
    - "A 19-zone normalizer (zonesForSide) fills in an untrained fallback for any muscle group the host under-supplies, making the zero-figure-data guard and the always-19-zones contract hold unconditionally"
    - "nothing-in-window vs no-history is a hasHistory boolean from a bounded existence check, never derived from the window-scoped read's own emptiness"

key-files:
  created:
    - apps/mobile/components/MuscleHeatmap.tsx
    - apps/mobile/components/__tests__/MuscleHeatmap.test.tsx
    - apps/mobile/components/MuscleVolumeRow.tsx
    - apps/mobile/components/__tests__/MuscleVolumeRow.test.tsx
    - apps/mobile/lib/analytics/muscle-map-labels.ts
    - apps/mobile/lib/analytics/__tests__/muscle-map-labels.test.ts
    - apps/mobile/app/muscle-map.tsx
    - apps/mobile/app/__tests__/muscle-map.test.ts
  modified:
    - apps/mobile/app/(tabs)/history.tsx
    - apps/mobile/app/(tabs)/__tests__/history.test.tsx

key-decisions:
  - "The UI-SPEC's illustrative MuscleVolumePoint prop shape drops setCount/weightedSets, which breaks structural compatibility with the pure package's topTrainedPoint (it requires those fields). Named the actual exported type MuscleHeatmapPoint (matching this plan's own Artifacts table, not the UI-SPEC's example name) and defined it as `extends MuscleMapPoint` plus muscleName/volumeLabel, so topTrainedPoint accepts it with no cast at the call site."
  - "The two <Svg> figures are written as two literal blocks rather than factored through one shared sub-component. A shared component would print exactly one `accessibilityRole=\"image\"` occurrence in source even though it renders twice at runtime, and the plan's own grep gate (`grep -c 'accessibilityRole=\"image\"'` must equal 2) checks source text, not rendered output — so the DRY refactor would fail the acceptance criterion it looks like it satisfies."
  - "nothing-in-window vs no-history needed a signal the 10-03 read layer doesn't provide (a truly unbounded existence check, not a window-bound one) since muscle-volume-query.ts is this plan's 'do not widen' file. Added a local, bounded `loadHasAnyHistory` existence query directly in muscle-map.tsx (limit 1, no aggregation) rather than editing the owned file."
  - "The set-count-at-zero-volume row branch (bodyweight/time-based training) renders '{n} sets' and announces itself as trained, never reusing the Untrained string — this is the plan's own flagged assumption, implemented as specified."

patterns-established:
  - "MuscleHeatmapPoint = MuscleMapPoint & { muscleName, volumeLabel } is the shape any future screen mapping pure-package points into this component must produce"

requirements-completed: [ANLY-04]

coverage:
  - id: D1
    description: "MuscleHeatmap renders two schematic body figures (10 front + 9 back zones), each a single accessibilityRole=\"image\" announcement with every shape hidden from assistive tech, filled by a categorical (never continuous) trained/untrained rule, with no text inside either <Svg>"
    requirement: "ANLY-04"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/MuscleHeatmap.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "MuscleVolumeRow renders one honest value per muscle — a volume, a set count, or 'Untrained' — as a single 48px press target with a three-branch composed accessible name, no disabled state, no line clamp"
    requirement: "ANLY-04"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/MuscleVolumeRow.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "The /muscle-map screen renders all five UI-SPEC states (error, loading, no-history, nothing-in-window, ready) from real local reads, is reachable from the History tab header and empty state, and leaves a named seam for the 10-06 drill-down"
    requirement: "ANLY-04"
    verification:
      - kind: unit
        ref: "apps/mobile/app/__tests__/muscle-map.test.ts"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-08-29
status: complete
---

# Phase 10 Plan 05: Muscle Map Screen and Heatmap Summary

**Two schematic front/back body figures with a categorical trained/untrained fill, a three-branch breakdown row, and a five-state `/muscle-map` screen reachable from the History tab — the whole user-facing half of ANLY-04, wired to 10-03's local reads with zero aggregation of its own.**

## Performance

- **Duration:** ~9 min (commit span)
- **Started:** 2026-08-29T19:18:00+03:00
- **Completed:** 2026-08-29T19:27:08+03:00
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- `MuscleHeatmap.tsx` — `resolveMuscleMapFigureWidth` (floors at `MIN_FIGURE_WIDTH`, guards non-finite input), `fillForMusclePoint` (R22's categorical split: untrained is always `foregroundMuted`, trained is always `accent` at a floor-plus-intensity opacity, never the same colour), `muscleMapFigureSummary` (R23's one-sentence-per-figure announcement, using `topTrainedPoint`'s tie-break rather than re-sorting), a 19-zone normalizer that falls back every unsupplied muscle group to untrained so the zero-figure-data guard holds unconditionally
- `MuscleVolumeRow.tsx` — `muscleVolumeRowLabel`'s three branches (trained-with-volume, trained-at-zero-volume rendering a set count, untrained), one `Pressable` press target at 48px minimum height, no disabled state on an untrained row
- `muscle-map-labels.ts` — `formatMuscleVolumeLabel` through the app's one shared weight formatter, `staleRollupCaption` (null at zero, singular/plural otherwise), `MUSCLE_MAP_VOLUME_CAPTION` (D-04's disambiguation sentence verbatim)
- `muscle-map.tsx` — `deriveMuscleMapScreenState`'s five-state classifier (error beats everything; a not-yet-landed read is never reported empty; `nothing-in-window` is distinguished from `no-history` by a bounded existence check, never by whether the selected window happens to be empty), `MuscleMapScreenView` rendering the UI-SPEC's exact per-state visibility rules, and the named `selectedMuscleGroupId`/`onMusclePress` seam for 10-06
- History tab: `Muscle Map` link added to the header's leading group (with `Records`) and to the empty-state stack, in the UI-SPEC's pinned order

## Task Commits

1. **Task 1: The two figures — schematic zones, one announcement each, no text inside the canvas** - `4de7b76` (feat)
2. **Task 2: The breakdown row — trained, untrained, and the third honest case** - `0d42769` (feat)
3. **Task 3: The Muscle Map screen and its entry point on the History tab** - `87b420d` (feat)

_No TDD RED/GREEN gate applies — each task's own tests and implementation landed together in one atomic commit per the plan's task boundaries, matching 10-03's precedent for this phase._

## Files Created/Modified
- `apps/mobile/components/MuscleHeatmap.tsx` - the phase's only new `react-native-svg` consumer; width resolver, fill rule, announcement, two-figure render
- `apps/mobile/components/__tests__/MuscleHeatmap.test.tsx` - fill/summary/width unit tests plus the two held-out backstop assertions (no SvgText-family element, accessible+image role per root)
- `apps/mobile/components/MuscleVolumeRow.tsx` - the breakdown row and its three-branch accessible name
- `apps/mobile/components/__tests__/MuscleVolumeRow.test.tsx` - label/render/press-target tests
- `apps/mobile/lib/analytics/muscle-map-labels.ts` - volume/session-count label formatting
- `apps/mobile/lib/analytics/__tests__/muscle-map-labels.test.ts` - label formatting tests
- `apps/mobile/app/muscle-map.tsx` - the S5 route, its classifier, hook-free view and default export
- `apps/mobile/app/__tests__/muscle-map.test.ts` - classifier and per-state view tests
- `apps/mobile/app/(tabs)/history.tsx` - `Muscle Map` link in the header and empty state, `onMuscleMap` threaded through `HistoryScreenViewProps`
- `apps/mobile/app/(tabs)/__tests__/history.test.tsx` - updated `baseProps` for the new required prop, plus a new test asserting the Muscle Map link's header placement and wiring

## Decisions Made
- `MuscleHeatmapPoint extends MuscleMapPoint` (rather than the UI-SPEC's illustrative, narrower `MuscleVolumePoint` shape) so `topTrainedPoint` accepts the component's points array with no cast — the UI-SPEC's example dropped `setCount`/`weightedSets`, which the pure package's tie-break function actually requires.
- The two `<Svg>` figures are two literal JSX blocks, not one shared sub-component rendered twice — the plan's own acceptance criterion greps for exactly 2 occurrences of `accessibilityRole="image"` in source text, which a DRY refactor would collapse to 1 even though it still renders two figures at runtime.
- Added a small, bounded `loadHasAnyHistory` existence check directly in `muscle-map.tsx` (a `limit(1)` select, no aggregation) rather than widening `muscle-volume-query.ts`, which this plan is required to leave untouched. This is the signal that lets `nothing-in-window` and `no-history` stay genuinely distinct.
- The set-count-at-zero-volume row branch (a muscle trained only by bodyweight/time-based work) renders `"{n} sets"` and announces itself as trained — the plan's own flagged assumption, implemented as specified rather than reused as a workaround.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `MuscleGroupId` re-exported from the wrong package in the first draft of `MuscleHeatmap.tsx`**
- **Found during:** Task 1 typecheck
- **Issue:** Initially imported `MuscleGroupId` from `@fitness/analytics-engine`, which does not re-export it (it lives in `@fitness/api-contracts`); `npx turbo run typecheck` failed with `TS2305`.
- **Fix:** Moved the import to `@fitness/api-contracts`, matching how `packages/analytics-engine/src/muscle-map.ts` itself imports it.
- **Files modified:** `apps/mobile/components/MuscleHeatmap.tsx`
- **Committed in:** `4de7b76` (Task 1 commit)

**2. [Rule 3 - Blocking] `apps/mobile/app/(tabs)/__tests__/history.test.tsx` needed a new required prop**
- **Found during:** Task 3 typecheck
- **Issue:** Extending `HistoryScreenViewProps` with the required `onMuscleMap` callback broke the pre-existing test's `baseProps()` helper (`TS2322`), and one existing test destructured the header row's children positionally, which shifted once the header gained a nested leading-group `View`.
- **Fix:** Added `onMuscleMap: jest.fn()` to `baseProps()`; updated the "Records link in the header" test to reach through the new leading-group wrapper, and added a parallel test for the Muscle Map link at the same location.
- **Files modified:** `apps/mobile/app/(tabs)/__tests__/history.test.tsx`
- **Committed in:** `87b420d` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking type errors surfaced by `npx turbo run typecheck`, fixed inline, verified by a subsequent clean typecheck run)
**Impact on plan:** No scope creep — both fixes are corrections required to compile and to keep a pre-existing, out-of-plan-scope test file passing against a new required prop this plan legitimately added.

## Issues Encountered
None beyond the two auto-fixed items above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `apps/mobile/components/MuscleHeatmap.tsx` and `MuscleVolumeRow.tsx` are sole-owner files for the whole phase — 10-06 imports them and edits neither.
- `apps/mobile/app/muscle-map.tsx` carries the named `selectedMuscleGroupId`/`onMusclePress` seam 10-06 needs to mount the drill-down sheet without restructuring the screen.
- `apps/mobile/app/(tabs)/history.tsx` was this plan's sole permitted edit outside new files, confirmed via `git diff --name-only` against the plan's full forbidden-file list before every commit — no forbidden file was touched across all three commits.
- No `apps/api` file and no Drizzle schema file was modified, so no `drizzle-kit push` step is needed anywhere in this plan.
- Full mobile test suite (114 suites, 2013 tests) passes with zero skipped tests; `npx turbo run typecheck lint` exits 0 across every workspace package.
- No blockers for 10-06 or 10-07.

## Self-Check: PASSED

All 8 created files verified present on disk; all 3 task commit hashes (`4de7b76`, `0d42769`, `87b420d`) verified present in git log.

---
*Phase: 10-server-analytics-reconciliation*
*Completed: 2026-08-29*
