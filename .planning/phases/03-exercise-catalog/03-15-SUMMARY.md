---
phase: 03-exercise-catalog
plan: 15
subsystem: exercise-catalog
tags: [ui, exercise-images, gap-closure, tile-layout]
dependency-graph:
  requires: [03-14]
  provides: [G-03-2-closed]
  affects: [ExerciseImageTile, ExerciseListRow, SwapSuggestionList]
tech-stack:
  added: []
  patterns:
    - "Style-composition seam: resolveTileImageStyle() is the single function every tile call site routes through, so a source's intrinsic dimensions can never re-enter layout without a future edit touching this one place"
key-files:
  created:
    - apps/mobile/components/__tests__/ExerciseListRow.test.tsx
  modified:
    - apps/mobile/components/ExerciseImageTile.tsx
    - apps/mobile/components/__tests__/ExerciseImageTile.test.tsx
    - apps/mobile/components/__tests__/SwapSuggestionList.test.tsx
decisions:
  - "The gap's 'missing: confirm resizeMode=cover reaches the DOM as object-fit: cover' item is dispositioned as a misdiagnosis, not implemented — react-native-web 0.21.2 never emits object-fit for Image; it already applies background-size: cover correctly (confirmed by direct read of node_modules/.../react-native-web/dist/exports/Image/index.js)"
  - "resolveTileImageStyle() returns one flat object (not a style array) so a test can flatten and compare it directly against the rendered element's own style without modelling array order"
metrics:
  duration: "~35 minutes across 3 tasks (2 execution + 1 human-verify checkpoint)"
  completed: 2026-08-20
status: complete
actuals:
  tokens: 39000
  tasks: 3
  commits: 2
---

# Phase 03 Plan 15: Bound the Catalog Tile Image to Its Box, Not Its Source — Summary

Fixed the catalog thumbnail defect (G-03-2): each tile's `Image` was laid out at its source's intrinsic pixel dimensions (750x500, 850x567, 800x533 measured across the failing rows) inside a correctly-sized 56x42 clipped tile, so the screen showed a magnified top-left crop of each photo instead of the whole image — for at least one row ("3/4 Sit-Up") this rendered as a solid near-black square. `resolveTileImageStyle()` now hands the tile's `Image` explicit `width: '100%'` / `height: '100%'` on top of the existing absolute-fill insets, which is the one entry in react-native-web's style-composition order that can override a source's own intrinsic dimensions.

## What Was Built

**Task 1 — the fix itself (tracer, TDD).** Added an exported pure function `resolveTileImageStyle()` to `ExerciseImageTile.tsx` returning `{ ...StyleSheet.absoluteFill, width: '100%', height: '100%' }`, and wired `ExerciseImageTileView`'s `Image` to use it as its `style`. `resizeMode="cover"` stayed a prop (not a style key) — react-native-web 0.21.2 reads `props.resizeMode` first and warns on `style.resizeMode`. `ExerciseImageTile.test.tsx` gained a `describe('resolveTileImageStyle — a source's intrinsic dimensions cannot win')` block covering the three measured intrinsic sizes via `it.each`, plus a string-typed-width/height guard, plus a rewritten inset case that now asserts the rendered `Image`'s flattened style deep-equals the flattened `resolveTileImageStyle()` output.

**Task 2 — extending coverage to both call sites (auto, TDD).** Created `ExerciseListRow.test.tsx` from scratch (no test file existed for this component before this plan, which is exactly why UAT caught the row broken while the suite stayed green). It asserts the row forwards both `uri` and `localSource` unchanged to a single `ExerciseImageTile` at `EXERCISE_THUMBNAIL_WIDTH`, that the null-source path still renders exactly one tile (the placeholder), and that the composed style resolves to `100%`/`100%` against a 750x500 intrinsic entry. Extended `SwapSuggestionList.test.tsx` with the equivalent two cases for the Suggested Alternatives row — the call site the previous UAT round never separately observed — plus a partial-data case confirming a candidate with no resolvable thumbnail still renders its name and `why` string.

**Task 3 — browser confirmation (checkpoint:human-verify, gate=blocking).** The user ran the live stack (NestJS API on :4000, Postgres seeded with ~880 exercises, PowerSync on :8080, `expo start --web` on :8081) and verified in-browser:
1. Catalog list thumbnails at `/exercises` show recognisable exercise photographs scaled to fit the 56x42 box — not flat colour blocks, not magnified crops.
2. (Mechanical check available via devtools box inspection, not required to be reported back.)
3. Exercise detail page "suggested alternatives" thumbnails also show recognisable images — the call site 03-15 added coverage for and the prior UAT round never separately observed.
4. The detail hero image, which was already correct, was confirmed not to have regressed.

**Result:** "approved" — checkpoint passed.

## Mechanism (why this was the actual defect)

Confirmed by direct read of `react-native-web@0.21.2`'s `Image` implementation: the outer `View`'s style array is `[styles.root, ..., imageSizeStyle, style, styles.undo, ...]`, where `imageSizeStyle` is the source's own intrinsic `{width, height}` (populated for every bundler-`require()`d vendored asset) and the tile's passed `style` is the only later entry able to override it. The pre-fix tile passed only `StyleSheet.absoluteFill` — insets with no width/height — so CSS over-constraint (`left:0` + `right:0` + `width:750px` → drops `right`) let the 750px-wide box survive inside the 56px clipped parent. `resolveTileImageStyle()` closes that gap by adding explicit percentage width/height, which both wins the CSS override and (via the container's `position: relative` box) resolves against the tile, not the source.

## Deviations from Plan

None — plan executed exactly as written across all three tasks. The `object-fit` item in the gap's original `missing:` list was dispositioned per the plan's own instruction (misdiagnosis, sourced against react-native-web's implementation) rather than implemented, which the plan explicitly called for rather than treating as a deviation.

## Gap Closure

**G-03-2 closed.** Requirements: EXER-01, EXER-03, EXER-10.

## Self-Check: PASSED

- `apps/mobile/components/ExerciseImageTile.tsx` — FOUND, contains `resolveTileImageStyle`
- `apps/mobile/components/__tests__/ExerciseImageTile.test.tsx` — FOUND, modified
- `apps/mobile/components/__tests__/ExerciseListRow.test.tsx` — FOUND (new file)
- `apps/mobile/components/__tests__/SwapSuggestionList.test.tsx` — FOUND, modified
- Commit `6eddcbb` (feat(03-15): bound the catalog tile image to its box, not its source) — FOUND in git log
- Commit `84d0eb5` (test(03-15): cover both thumbnail call sites for the tile-image fix) — FOUND in git log
- `pnpm --filter mobile test` → 25 suites, 361 tests, 0 skipped, 0 todo, exit 0 (re-verified by orchestrator on current HEAD)
- `pnpm --filter mobile typecheck` → exit 0 (re-verified by orchestrator on current HEAD)
- `pnpm --filter mobile build` (expo export --platform web) → exit 0 (re-verified by orchestrator on current HEAD)
- Checkpoint (Task 3, gate=blocking) → approved by user in a live browser session
