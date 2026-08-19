---
phase: 03-exercise-catalog
plan: 13
subsystem: ui
tags: [react-native, react-native-web, expo, jest, image-rendering, gap-closure]

requires:
  - phase: 03-exercise-catalog
    provides: ExerciseImageTile, ExerciseListRow, SwapSuggestionList, the detail hero, and catalog-image-map.generated.ts, all built in earlier 03-* plans (03-05 through 03-10)
provides:
  - "ExerciseImageTile rewritten so its box can never collapse to zero, closing G-03-3 (no image has ever painted)"
  - "resolveTileBox and resolveHeroImageWidth: pure, independently-tested layout functions"
  - "EXERCISE_THUMBNAIL_WIDTH: a shared width constant imported by both row call sites"
  - "getLocalCatalogImage's declared return type corrected to match what the web bundler actually emits"
affects: [exercise-catalog, ui-image-rendering]

actuals:
  tokens: 4974
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Hook-free presentational half (ExerciseImageTileView) + thin stateful wrapper (ExerciseImageTile) split, so a component with no test renderer available can still be direct-invoked and inspected"
    - "Container sized in explicit pixels via a pure clamping function; image fills the box with StyleSheet.absoluteFill rather than percentage sizing"

key-files:
  created:
    - apps/mobile/components/__tests__/ExerciseImageTile.test.tsx
  modified:
    - apps/mobile/components/ExerciseImageTile.tsx
    - apps/mobile/components/ExerciseListRow.tsx
    - apps/mobile/components/SwapSuggestionList.tsx
    - apps/mobile/components/__tests__/SwapSuggestionList.test.tsx
    - apps/mobile/app/exercises/[id].tsx
    - apps/mobile/lib/catalog/catalog-image-map.generated.ts
    - scripts/generate-catalog-image-map.cjs

key-decisions:
  - "ExerciseImageTile's width prop is optional with a default of EXERCISE_THUMBNAIL_WIDTH (deviation, see below) so Task 1's typecheck stays green before Task 2 updates the three call sites to pass width explicitly"
  - "The placeholder label now renders behind the image (both present in the tree) rather than as the image's else branch, so a source that resolves but paints nothing still leaves a visible tile"
  - "The container gains a border-foreground-muted border so an empty tile is delineated from both a surface parent and a background parent"

patterns-established:
  - "Any new tile-consuming call site imports EXERCISE_THUMBNAIL_WIDTH (or, for a non-constant width, its own pure width function) rather than hardcoding a wrapper View width"

requirements-completed: [EXER-01, EXER-03, EXER-10]

coverage:
  - id: D1
    description: "resolveTileBox returns a finite positive width and height for zero, negative, non-finite and normal inputs"
    requirement: "EXER-10"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/ExerciseImageTile.test.tsx#resolveTileBox"
        status: pass
    human_judgment: false
  - id: D2
    description: "ExerciseImageTileView produces an Image element with a non-null source, filling its box by absolute inset, inside a container with numeric positive width and height"
    requirement: "EXER-03"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/ExerciseImageTile.test.tsx#ExerciseImageTileView"
        status: pass
    human_judgment: false
  - id: D3
    description: "The placeholder label and the image coexist in the rendered tree when both apply; an empty tile carries a border-foreground-muted border"
    requirement: "EXER-03"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/ExerciseImageTile.test.tsx#ExerciseImageTileView"
        status: pass
    human_judgment: false
  - id: D4
    description: "SwapSuggestionList asserts a non-null vendored localSource and a positive width for a real seeded id (seed_90_90_Hamstring), and an id absent from the manifest still gets a positive width with a null source"
    requirement: "EXER-01"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/SwapSuggestionList.test.tsx#SwapSuggestionList"
        status: pass
    human_judgment: false
  - id: D5
    description: "All three call sites (list row, alternatives row, detail hero) size their tile through the shared width contract; getLocalCatalogImage's declared type matches the bundler-emitted value on both platforms; the regenerated map still holds 870 entries and the web export still bundles 1740 images"
    requirement: "EXER-03"
    verification:
      - kind: unit
        ref: "pnpm --filter mobile test (306/306 passing)"
        status: pass
      - kind: other
        ref: "pnpm --filter mobile typecheck; pnpm --filter mobile build; find apps/mobile/dist -iname '*.jpg' | wc -l -> 1740"
        status: pass
    human_judgment: false
  - id: D6
    description: "A vendored image actually paints on screen in a real browser, simulator, or device"
    verification: []
    human_judgment: true
    rationale: "Browser testing was not authorized for this session (project convention forbids launching a browser unless explicitly asked). The unit gates above prove the box is non-zero and the source is non-null; they cannot prove pixels reached a screen. This is the same gap WINDOWS #37 and #46 record for earlier 03-* plans and remains open until a human observes it."

duration: ~20min
completed: 2026-08-19
status: complete
---

# Phase 03 Plan 13: Fix the collapsing ExerciseImageTile box (G-03-3) Summary

**Rewrote `ExerciseImageTile` so its box is sized in explicit, clamped pixels and the image fills it by absolute inset instead of a percentage of an unresolved ratio height — the mechanism behind "no image in this app has ever painted" (G-03-3, WINDOWS #37/#46).**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-19
- **Tasks:** 3
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments

- `resolveTileBox` and `resolveHeroImageWidth`: pure functions that guarantee a finite, positive box for every input, including zero, negative, `NaN` and `Infinity` — the structural fix for the collapsing box.
- `ExerciseImageTile` split into a hook-free `ExerciseImageTileView` (direct-invocation testable) and a thin stateful wrapper, closing the blind spot where 27+ prior tests never asserted anything about a rendered `Image` element.
- The placeholder label now renders behind the image rather than as its `else` branch, so a source that resolves but paints nothing still shows a visible tile; the tile also gained a `border-foreground-muted` border so an empty tile is distinguishable from both a `surface` and a `background` parent.
- All three call sites (`ExerciseListRow`, `SwapSuggestionList`, the detail hero) now size their tile through the same exported `EXERCISE_THUMBNAIL_WIDTH` constant or, for the hero, `resolveHeroImageWidth(windowWidth)` — no call site wraps the tile in its own fixed-width `View` anymore.
- `getLocalCatalogImage`'s declared return type corrected at its generator (`scripts/generate-catalog-image-map.cjs`) from a numeric-only type to `ImageSourcePropType | null`, matching the `{uri, width, height}` object the web bundler actually returns; regenerated map still holds 870 entries / 1740 images.

## Task Commits

Each task was committed atomically, following RED/GREEN TDD for Tasks 1 and 2:

1. **Task 1: Give the tile a box that cannot collapse** — `de3bf3b` (test, RED) → `85d496d` (feat, GREEN)
2. **Task 2: Route all three call sites through the shared width contract** — `2b24229` (test, RED) → `4ba747c` (feat, GREEN)
3. **Task 3: Correct the generated image map's return type at its generator** — `1396b3a` (fix)

## Files Created/Modified

- `apps/mobile/components/ExerciseImageTile.tsx` — rewritten: pure layout functions, hook-free `ExerciseImageTileView`, stateful `ExerciseImageTile` wrapper, `useCallback`-stabilized error handler
- `apps/mobile/components/__tests__/ExerciseImageTile.test.tsx` — new: 16 tests over the pure functions and `ExerciseImageTileView`'s geometry/layering/border
- `apps/mobile/components/ExerciseListRow.tsx` — drops its fixed-width wrapper `View`, imports `EXERCISE_THUMBNAIL_WIDTH`, widens `localSource` to `ImageSourcePropType | null`
- `apps/mobile/components/SwapSuggestionList.tsx` — same change as `ExerciseListRow`
- `apps/mobile/components/__tests__/SwapSuggestionList.test.tsx` — 4 new tests asserting a real seeded id resolves a non-null vendored source with a positive width, an unmatched id still gets a positive width, and 5 candidates produce 5 tiles
- `apps/mobile/app/exercises/[id].tsx` — reads `useWindowDimensions()`, passes `width={resolveHeroImageWidth(windowWidth)}` to the hero tile; still passes only the vendored source, no `uri` (offline guarantee unchanged)
- `apps/mobile/lib/catalog/catalog-image-map.generated.ts` — regenerated with the corrected `ImageSourcePropType` types
- `scripts/generate-catalog-image-map.cjs` — emits the corrected types at generation time

## Decisions Made

- **`ExerciseImageTile`'s `width` prop is optional** (default `EXERCISE_THUMBNAIL_WIDTH`), not required as a literal reading of the plan's Task 1 action text might imply. Making it required in Task 1 would have broken `pnpm --filter mobile typecheck` (part of Task 1's own verify gate) at all three call sites, which are not updated until Task 2. This keeps each task's commit independently green, matching the plan's per-task verify structure. Documented as a Rule 3 deviation below.
- Reused the `findByType`/`flatText` direct-invocation helpers already established by `SwapSuggestionList.test.tsx`, copied into the new test file per this repo's existing convention (no shared test-helper module exists).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Built `@fitness/api-contracts` before `pnpm --filter mobile typecheck` would pass**
- **Found during:** Task 1 verify (`pnpm --filter mobile typecheck`)
- **Issue:** `@fitness/api-contracts`'s `package.json` declares `main: ./dist/index.js`, but no `dist/` existed in this worktree checkout, so every file importing it failed with `TS2307: Cannot find module '@fitness/api-contracts'` — ~15 pre-existing errors across files entirely outside this plan's scope (`load-snapshot.ts`, `smart-swap.ts`, `connector.ts`, etc.).
- **Fix:** Ran `pnpm run build` inside `packages/api-contracts` (its own declared `build` script, `tsc`). `dist/` is gitignored, so this produces no tracked diff — it is a local build artifact, not a package install.
- **Files modified:** None (build output only, gitignored).
- **Verification:** `pnpm --filter mobile typecheck` went from ~20 pre-existing errors to clean.
- **Committed in:** N/A (gitignored build output, nothing to commit).

**2. [Rule 3 - Blocking] Made `ExerciseImageTile`'s `width` prop optional with a default**
- **Found during:** Task 1, while drafting the wrapper per the plan's action text (`ExerciseImageTile({ uri, localSource, width })`)
- **Issue:** A required `width` prop would fail typecheck at all three existing call sites, none of which pass `width` until Task 2 — but Task 1's own verify gate includes `pnpm --filter mobile typecheck`, which runs before Task 2 exists.
- **Fix:** `width?: number` defaulting to `EXERCISE_THUMBNAIL_WIDTH` in the destructured parameter, with an inline comment explaining why. Task 2 then has every call site pass `width` explicitly, per the plan.
- **Files modified:** `apps/mobile/components/ExerciseImageTile.tsx`
- **Verification:** `pnpm --filter mobile typecheck` clean after both Task 1 and Task 2.
- **Committed in:** `85d496d` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking)
**Impact on plan:** Both were required to keep each task's own verify gate green in isolation; neither changes the plan's intended architecture or behavior.

## Issues Encountered

None beyond the two deviations above.

## Residual Items (not claimed, filed per plan's `<verification>` section)

The plan's own `<verification>` section names three residual items a browser would settle, explicitly not claimed by this plan. Browser testing was not authorized for this session (CLAUDE.md forbids launching a browser unless explicitly asked). `gsd-tools` (`gsd_run`) was not present in this worktree (no `gsd-core/bin` directory found under any of the configured lookup paths), so these could not be appended to `.planning/WINDOWS.md` programmatically via `gsd_run windows append`; recording them here instead, matching WINDOWS #37/#46's existing `unrun-verify` pattern for the same underlying gap. A future session with `gsd-tools` available (or the next `/gsd-ship` run) should file these three as `unrun-verify` entries against `.planning/WINDOWS.md`:

- **R1 — the mechanism.** Inspecting the computed height of the react-native-web `Image` root div in a real browser would distinguish the sizing hypothesis this plan fixes from the ranked-second candidate (a dev-server asset URL 404). The fix is correct under both hypotheses, but which one was operative in the original report is unproven.
- **R2 — the outcome.** "A vendored image actually paints on screen" remains unobserved by a human — the same gap WINDOWS #37 (03-07) and the analogous 03-10 line 99 record. Closing G-03-3 for real requires one human pass over `/exercises`, a detail route, and its Suggested Alternatives section. Filed as `coverage: D6` above with `human_judgment: true`.
- **R3 — native.** No Xcode or Android SDK exists on this machine; per project convention (see MEMORY.md "Android testing deferred to final phase" / "Native toolchain absent on this Mac") native verification is swept once at ROADMAP Phase 999.1.

## Next Phase Readiness

- G-03-3's code-level fix is complete and unit-proven: the tile's box cannot collapse, all three call sites share one width contract, and the generated map's type matches runtime reality.
- Ready for a human UAT pass (R2 above) to close the loop the original bug report opened — this is the natural next verification step for whoever picks up Phase 03's remaining gap-closure work.
- No blockers for downstream phases; this plan only touched exercise-catalog UI files already in place from earlier 03-* plans.

---
*Phase: 03-exercise-catalog*
*Completed: 2026-08-19*

## Self-Check: PASSED

All 9 files tracked by git (`git ls-files`), all 5 task commits plus the plan-metadata commit found in `git log`.
