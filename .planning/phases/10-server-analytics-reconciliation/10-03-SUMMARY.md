---
phase: 10-server-analytics-reconciliation
plan: 03
subsystem: analytics
tags: [analytics-engine, powersync, drizzle, local-first, react-native]

requires:
  - phase: 10-01
    provides: muscle_volume_rollup/analytics_watermark Postgres tables mirrored to client SQLite through the existing user_data PowerSync stream, and muscleVolumeCells (the shared weighted aggregation this plan's local read also folds through)
provides:
  - packages/analytics-engine/src/muscle-map.ts — MUSCLE_MAP_WINDOWS/MUSCLE_MAP_WINDOW_DAYS/MUSCLE_MAP_WINDOW_CHIP_LABELS/MUSCLE_MAP_WINDOW_LABELS, MUSCLE_MAP_ROLLUP_WINDOWS/windowReadsRollup, MUSCLE_GROUP_FIGURE_SIDE, MUSCLE_MAP_ROW_ORDER
  - packages/analytics-engine/src/muscle-map-window.ts — mergeMuscleVolumeCells, muscleMapPoints, topTrainedPoint, rankMuscleContributions
  - apps/mobile/lib/db/muscle-volume-query.ts — loadMuscleMapWindow, loadMuscleDrilldown, muscleMapOverlayFilter (the D-01 predicate, unit-testable standalone)
affects: [10-05-muscle-map-screen-and-heatmap, 10-06-muscle-drilldown-sheet, 10-07-durability-evidence]

actuals:
  tokens: 11520
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Window vocabulary as data, never an if-branch: windowReadsRollup(id) derived from a tuple, so D-01's short-vs-long split is a lookup at every call site"
    - "Pure rollup+overlay merge shared by the server writer (10-01) and this client reader — both fold the same MuscleVolumeCell shape, which is what makes summing the two sources safe"
    - "Reader assembles inputs and calls the pure package only, mirroring weekly-progress-query.ts's discipline; the D-01 overlay predicate is exported standalone so it is unit-testable without a database"

key-files:
  created:
    - packages/analytics-engine/src/muscle-map.ts
    - packages/analytics-engine/src/muscle-map-window.ts
    - packages/analytics-engine/src/__tests__/muscle-map.test.ts
    - packages/analytics-engine/src/__tests__/muscle-map-window.test.ts
    - apps/mobile/lib/db/muscle-volume-query.ts
    - apps/mobile/lib/db/__tests__/muscle-volume-query.test.ts
  modified:
    - packages/analytics-engine/src/index.ts

key-decisions:
  - "The muscle_group display-name read (one select over muscle_group) lives inside loadMuscleMapWindow itself, since MuscleMapWindowData.muscleNames is part of that function's own contract — this makes the real select count 5 for the 1-week path and 7 for a rollup-window path, one more than the plan prose's '4'/'6' count of the aggregation-only reads (sessions/session_exercise/logged_set/mappings, or watermark+rollup+those four). Documented here rather than silently reconciled: the plan's own action text separately instructs 'resolve muscle display names with one select... returned as a map' as part of the same function, so the extra select is required by the plan's own design, not a bug. My tests assert the real counts (5 and 7)."
  - "loadMuscleDrilldown short-circuits to the empty result as soon as any of sessions/session_exercise/mapping rows come back empty, mirroring exercise-history-query.ts's 'issues no second query when nothing matched' precedent rather than always issuing every possible select."

patterns-established:
  - "MUSCLE_GROUP_FIGURE_SIDE and MUSCLE_MAP_ROW_ORDER are the phase-wide sole source of front/back figure membership and row order for 10-05/10-06 to import — no other file may declare either table"

requirements-completed: [ANLY-04, ANLY-05]

coverage:
  - id: D1
    description: "The muscle-map vocabulary — every window length, chip label, announced duration phrase, figure assignment and row position is a named export in one pure module, with total MUSCLE_GROUPS coverage and no-duplicate/no-omission asserted by test"
    requirement: "ANLY-04"
    verification:
      - kind: unit
        ref: "packages/analytics-engine/src/__tests__/muscle-map.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Rollup and overlay fold into one set of nineteen MUSCLE_MAP_ROW_ORDER-ordered, side-tagged points with a guarded relative intensity; untrained is decided by set count, never volume; the drill-down's ranking is a total order with every tie broken"
    requirement: "ANLY-04"
    verification:
      - kind: unit
        ref: "packages/analytics-engine/src/__tests__/muscle-map-window.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Three local reads: a rollup-free 1-week path, a rollup-plus-overlay path whose D-01 predicate is separately testable, and a bounded drill-down that resolves seeded-catalog exercise names — all folding through the same pure functions the server writer (10-01) uses"
    requirement: "ANLY-05"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/muscle-volume-query.test.ts"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-08-29
status: complete
---

# Phase 10 Plan 03: Muscle-Map Vocabulary, Pure Merge and Local Read Layer Summary

**The client-side read half of D-01: a 1-week muscle-volume window computed entirely from local SQLite, and 1-month/3-month windows that read 10-01's server rollup and overlay every local session the rollup hasn't seen yet, all folding through one pure package shared with the server writer.**

## Performance

- **Duration:** ~8 min (commit span)
- **Started:** 2026-08-29T18:20:52+03:00
- **Completed:** 2026-08-29T18:28:49+03:00
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- `MUSCLE_MAP_WINDOWS`/`MUSCLE_MAP_WINDOW_DAYS`/`MUSCLE_MAP_WINDOW_CHIP_LABELS`/`MUSCLE_MAP_WINDOW_LABELS`/`MUSCLE_MAP_ROLLUP_WINDOWS`/`windowReadsRollup` — the phase's whole window vocabulary as named data, `1w` reusing `PROGRESS_WINDOW_DAYS` by import
- `MUSCLE_GROUP_FIGURE_SIDE` and `MUSCLE_MAP_ROW_ORDER` transcribed verbatim from the UI-SPEC, with a test asserting total `MUSCLE_GROUPS` coverage (so a twentieth muscle group later fails loudly instead of rendering on neither figure)
- `mergeMuscleVolumeCells`/`muscleMapPoints`/`topTrainedPoint` — the pure fold that turns a rollup source and an overlay source into nineteen ordered, side-tagged points, with untrained decided by set count (never volume) and relative intensity guarded against a zero divisor
- `rankMuscleContributions` — a total order (volume desc, set count desc, name asc, id asc) with no locale collator, so the drill-down list cannot reshuffle between reads
- `loadMuscleMapWindow`/`loadMuscleDrilldown`/`muscleMapOverlayFilter` — the client reads: 1-week never touches the rollup or watermark at all; the rollup windows read the watermark then overlay every local session past it; the drill-down stays local-only and resolves seeded-catalog exercise names correctly

## Task Commits

1. **Task 1: The muscle-map vocabulary — windows, figure sides and the fixed row order** - `87a9f3b` (test)
2. **Task 2: Merge rollup and overlay into 19 ordered points, and rank the drill-down** - `478eddc` (feat)
3. **Task 3: The three local reads — 1-week, rollup-plus-overlay, and the drill-down** - `d3e791e` (feat)

_No TDD RED/GREEN gate applies — each task's own tests and implementation landed together in one atomic commit per the plan's task boundaries, matching 10-01's precedent for this phase._

## Files Created/Modified
- `packages/analytics-engine/src/muscle-map.ts` - window vocabulary, figure-side and row-order constants
- `packages/analytics-engine/src/__tests__/muscle-map.test.ts` - full-coverage/no-duplicate/no-omission tests plus the window-label regex assertion
- `packages/analytics-engine/src/muscle-map-window.ts` - `mergeMuscleVolumeCells`, `muscleMapPoints`, `topTrainedPoint`, `rankMuscleContributions`
- `packages/analytics-engine/src/__tests__/muscle-map-window.test.ts` - merge/points/tie-break/ranking tests
- `packages/analytics-engine/src/index.ts` - two appended barrel export lines (Task 1, Task 2)
- `apps/mobile/lib/db/muscle-volume-query.ts` - `loadMuscleMapWindow`, `loadMuscleDrilldown`, `muscleMapOverlayFilter`
- `apps/mobile/lib/db/__tests__/muscle-volume-query.test.ts` - select-count, overlay, signed-out and seeded-name-resolution tests

## Decisions Made
- The `muscle_group` display-name read lives inside `loadMuscleMapWindow` (its own contract requires `muscleNames`), making the real select count 5 for `1w` and 7 for a rollup window — one more than the plan prose's aggregation-only counts of 4/6. This is required by the plan's own design (the muscle-name read is specified as part of the same function), not a defect; my tests assert the real counts.
- `loadMuscleDrilldown` short-circuits to the empty result as soon as sessions, session_exercise rows, or matching mapping rows come back empty, following `exercise-history-query.ts`'s established "no second query when nothing matched" precedent rather than issuing every possible select unconditionally.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Documented arithmetic clarification] Select-count numbers in the plan's `<behavior>` prose ("four"/"six" selects) undercount by one against the plan's own instruction to also resolve muscle display names inside the same function**
- **Found during:** Task 3 authorship
- **Issue:** The plan's behavior list says `loadMuscleMapWindow` "issues exactly four selects" (1w) / "exactly six selects" (rollup windows), naming only the aggregation reads. The plan's own action text (step 3) separately requires "Resolve muscle display names with one select over `muscle_group`... returned as a map" inside the same function. Implementing both literally yields 5 and 7 selects, not 4 and 6.
- **Fix:** Implemented as specified (muscle names resolved inside `loadMuscleMapWindow`), and wrote tests asserting the real counts (5 and 7) rather than a false 4/6 claim. Documented under Decisions Made and here so the mismatch is visible rather than silently glossed over — mirrors the precedent 10-01's own SUMMARY set for an analogous grep-count mismatch.
- **Files modified:** `apps/mobile/lib/db/muscle-volume-query.ts`, `apps/mobile/lib/db/__tests__/muscle-volume-query.test.ts`
- **Committed in:** `d3e791e` (Task 3 commit)

---

**Total deviations:** 1 documented arithmetic clarification (no behavior changed from the plan's actual design intent; only the prose count was imprecise)
**Impact on plan:** None on correctness or scope — every acceptance criterion in the plan (all of which are grep/typecheck/test-exit-code checks, none of which assert a literal select-count number) passes as written.

## Issues Encountered

- The offline-edit residual flagged in the plan's "Flagged planner assumptions" (an offline EDIT of an already-synced session dated on or before the watermark shows its pre-edit contribution until the edit reaches the server) is recorded in `.planning/WINDOWS.md` via the `gsd-tools windows` CLI as instructed, rather than fixed — it is a known, disclosed, self-correcting residual per the plan's own design, not a defect in this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `packages/analytics-engine/src/muscle-map.ts` and `muscle-map-window.ts` are this whole phase's sole-owner files (per the plan's ownership table) — 10-05/10-06 import from here and declare nothing of their own beyond component-local drawing constants.
- `apps/mobile/lib/db/muscle-volume-query.ts` is likewise sole-owner for the whole phase — 10-05/10-06 call `loadMuscleMapWindow`/`loadMuscleDrilldown` but neither edits this file.
- No `apps/api` file, no Drizzle schema file, and no `ops/powersync` file was touched — confirmed via `git status` before every commit — so no `drizzle-kit push` step is needed anywhere in this plan, matching the plan's own verification checklist.
- `apps/mobile/lib/db/schema.ts`, `powersync.ts`, `test-support.ts` and `app/__durability.web.tsx` are untouched, exactly as the plan's ownership table requires (10-01 landed the first two; 10-07 owns the last two for this phase).
- No blockers for 10-05/10-06/10-07.

## Self-Check: PASSED

All 6 created files verified present on disk; all 3 task commit hashes (`87a9f3b`, `478eddc`, `d3e791e`) verified present in git log.

---
*Phase: 10-server-analytics-reconciliation*
*Completed: 2026-08-29*
