---
phase: 03-exercise-catalog
plan: 06
subsystem: ui
tags: [minisearch, flash-list, expo-router, nativewind, react-native, catalog-search]

requires:
  - phase: 03-exercise-catalog
    provides: "03-05's real 870-exercise bundled snapshot, seededExercise/exercise UNION read pattern (WINDOWS #32), and the exported-but-uncalled refreshCatalog(db) background version handshake"
provides:
  - "apps/mobile/lib/catalog/search-index.ts — buildSearchIndex/searchCatalog/normalizeQuery, a pure MiniSearch wrapper with NFC/NFD-decompose-and-strip-diacritics as the one processTerm both documents and queries pass through"
  - "apps/mobile/lib/catalog/catalog-filter.ts — applyCatalogFilters/deriveFacets/sortCatalogResults plus the screen's extracted presentational helpers (formatResultCount, hasActiveFilters, collapseTags, deriveExerciseListScreenState, formatFacetLabel)"
  - "apps/mobile/components/SearchField.tsx, FilterChipRow.tsx, ExerciseListRow.tsx — the three new reusable components this phase's UI-SPEC establishes as house style for Phases 4-11"
  - "apps/mobile/app/exercises/index.tsx — the real list screen (FlashList, search, three filter-chip dimensions, all four UI-SPEC E1 states), replacing 03-01's tracer and wiring 03-05's refreshCatalog from mount"
affects: ["03-07 (parallel — exercise detail screen; declared non-overlapping file scope)", "03-08 (creates /exercises/new, which this plan's Add Custom Exercise button points at but does not yet implement)", "any future phase adding a fourth filter dimension or reusing SearchField/FilterChipRow/ExerciseListRow"]

actuals:
  tokens: 14304
  tasks: 3
  commits: 3

tech-stack:
  added: ["minisearch@7.2.0", "@shopify/flash-list@2.0.2"]
  patterns:
    - "Pure-module screen-helper extraction: with no @testing-library/react-native in this codebase, a screen's presentational decisions (pluralization, +N tag-collapse threshold, which of loading/error/empty/populated state to render, snake_case facet-id display formatting) are extracted as small exported, unit-tested functions in catalog-filter.ts rather than asserted against a rendered tree — established here for reuse by any future screen with the same testing-library gap"
    - "One processTerm function for both index and query: MiniSearch's processTerm option applies identically to indexed document terms and search query terms by default, so NFC/NFD-decompose-and-strip-diacritics/lowercase is written once and cannot silently diverge between the two sides"
    - "Two-read UNION over seededExercise and exercise(is_custom=true), both filtered to archivedAt IS NULL at the read boundary — content-level archive (a seeded row that vanished from a newer artifact, or a drift-archived custom row) is excluded before search/filter ever see it, distinct from the per-user archive/never-suggest state in user_exercise_preference which applyCatalogFilters handles separately"

key-files:
  created:
    - apps/mobile/lib/catalog/search-index.ts
    - apps/mobile/lib/catalog/catalog-filter.ts
    - apps/mobile/lib/catalog/__tests__/search-index.test.ts
    - apps/mobile/lib/catalog/__tests__/catalog-filter.test.ts
    - apps/mobile/components/SearchField.tsx
    - apps/mobile/components/FilterChipRow.tsx
    - apps/mobile/components/ExerciseListRow.tsx
  modified:
    - apps/mobile/app/exercises/index.tsx
    - apps/mobile/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Task 0's package-legitimacy gate (minisearch, @shopify/flash-list) was answered by the human before this executor started, per the orchestrator's own live registry checks. Evidence recorded here for the audit trail: minisearch — exact name, latest 7.2.0, repo github.com/lucaong/minisearch, maintainer lucaong <mail@lucaongaro.eu> (matches repo owner), first published 2018-09-17, 1,949,154 weekly downloads. @shopify/flash-list — org-scoped name (npm scopes are org-controlled, so a typosquat cannot occupy @shopify/), repo github.com/Shopify/flash-list, six maintainers all @shopify.com incl. shopify-admin, first published 2022-06-30, 1,256,655 weekly downloads. None of the gate's four red flags (typosquat name, unrecognized publisher, 404ing repo, fresh publish with no history) were present. Limitation recorded honestly: the npmjs.com web pages and the Expo SDK docs page were NOT opened in a browser — project CLAUDE.md forbids launching a browser unless the user asks. All evidence came from `npm view` and the npm downloads API."
  - "flash-list version: `pnpm exec expo install @shopify/flash-list` resolved 2.0.2, not the 2.3.2 the package-legitimacy gate audited. The human was asked and chose to ACCEPT 2.0.2 before this executor started, having verified 2.0.2 was published 2025-08-05 by the same shopify-dep account that publishes 2.3.2, from the canonical registry.npmjs.org tarball, same scoped name, same repository — an authentic older Shopify release, the version Expo's compatibility database pins for this project's Expo SDK 57.0.12 / React Native 0.86.2 (New Architecture mandatory). This executor ran the install exactly as instructed and confirmed the resolved version matched the human's accepted 2.0.2 (`node -e` check against apps/mobile/package.json)."
  - "Chip label text: muscle-group chip labels come from the seeded muscle_group.name column (real display names, e.g. 'Front Delts'); equipment and movement-pattern chip labels have no readable-name source in the catalog data, so a new pure helper (formatFacetLabel) title-cases the snake_case id ('horizontal_push' -> 'Horizontal Push') instead — not specified verbatim by the plan, judged the smallest correct choice consistent with 03-UI-SPEC.md's Copywriting Contract silence on facet-label formatting."
  - "'Add Custom Exercise' renders as a real PrimaryButton with a no-op onPress rather than importing a disabled-state prop PrimaryButton does not have. /exercises/new does not exist until 03-08 and PrimaryButton.tsx is out of this plan's declared file scope (and out of this parallel worktree's declared scope) — modifying it to add a disabled variant would be an out-of-scope edit for a cosmetic difference. The plan's own text permits rendering it disabled 'or' documenting the gap; this executor chose the latter to avoid touching a shared component."
  - "Two backstop must_haves truths (the ~870-row FlashList performance assertion, and the catalog-load-failure error-state render) could not be independently verified in this environment: no iOS/Android simulator or device, and no Playwright browsers installed in this worktree — matching every prior phase's documented native/browser gap (WINDOWS #4, #8, #16, #26, #34). Recorded honestly as WINDOWS #37 and #38 rather than silently marked passed; automated coverage (typecheck, 178/178 jest tests, `expo export --platform web`) is real but is not the rendered/on-device observation the backstop calls for."

patterns-established:
  - "Screen-helper extraction for testing-library-less RN screens (see tech-stack.patterns above) — apply this same extraction discipline to any future screen in this codebase until @testing-library/react-native is added."

requirements-completed: [EXER-01, EXER-02]

coverage:
  - id: D1
    description: "searchCatalog returns the full catalog (stable name-then-id order) for empty/whitespace/null query, matches NFC/NFD/case/diacritic-insensitively, matches aliases and prefixes, and returns [] for no match"
    requirement: EXER-01
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/search-index.test.ts (6/6 passing)"
        status: pass
    human_judgment: false
  - id: D2
    description: "applyCatalogFilters (AND across dimensions, OR within one, per-user archive exclusion), sortCatalogResults (score desc / name asc / id asc total order), deriveFacets (canonical order, empty-dimension omission), plus the screen's presentational helpers (formatResultCount, hasActiveFilters, collapseTags, deriveExerciseListScreenState, formatFacetLabel)"
    requirement: EXER-02
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/catalog-filter.test.ts (21/21 passing)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The id tie-break in sortCatalogResults is load-bearing, not decorative — confirmed by temporarily removing it and observing the shuffle-invariance test go red, then restoring it"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/catalog-filter.test.ts — 'is red if the id tie-break in sortCatalogResults is removed', manually re-verified by mutation"
        status: pass
    human_judgment: false
  - id: D4
    description: "minisearch@7.2.0 and @shopify/flash-list@2.0.2 installed at audited/accepted versions; typecheck, full jest suite and expo export --platform web all exit 0 with the new dependencies in the tree"
    requirement: EXER-01
    verification:
      - kind: unit
        ref: "pnpm --filter mobile typecheck; pnpm --filter mobile test (178/178); pnpm --filter mobile build (expo export --platform web, exit 0)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The real exercises list screen (app/exercises/index.tsx) renders and scrolls the full local catalog via FlashList without dropped frames, and the catalog-load-failure error state renders correctly, in a real browser/simulator/device"
    verification: []
    human_judgment: true
    rationale: "No iOS/Android simulator, no device, and no Playwright browsers installed in this worktree — consistent with every prior phase's documented native/browser gap. Automated coverage (typecheck, 178/178 jest tests including the extracted screen-state helpers, expo export --platform web) is real but does not substitute for the rendered/on-device observation these two backstop must_haves truths call for. Recorded as WINDOWS #37 (performance) and #38 (error-state render)."

duration: ~25 min executor work (18:33Z install start - 18:52Z final task commit, plus SUMMARY authoring)
completed: 2026-08-18
status: complete
---

# Phase 3 Plan 6: Exercise Search, Filter and List Screen Summary

**Real ~870-row exercise list screen (search, three filter-chip dimensions, FlashList) replacing 03-01's 3-row tracer, backed by two pure unit-tested modules (MiniSearch-based search index, AND/OR filter predicate with per-user archive exclusion) and three new reusable components.**

## Performance

- **Duration:** ~25 min of executor work across 3 commits (18:36Z-18:52Z), plus this SUMMARY
- **Completed:** 2026-08-18
- **Tasks:** 3 (Task 0's package-legitimacy checkpoint was already human-approved before this executor started, per the orchestrator's `<decisions_already_made>` handoff)
- **Files modified:** 10 (3 new lib files + 2 new test files + 3 new components + 1 screen rewrite + package.json/lockfile)

## Accomplishments

- **`search-index.ts`** — `buildSearchIndex`/`searchCatalog`/`normalizeQuery`, a pure wrapper around MiniSearch 7.2.0. `normalizeQuery`/the shared `processTerm` NFD-decompose-then-strip-combining-marks-then-recompose-NFC-then-lowercase, applied identically to both indexed document terms and query terms (MiniSearch's own documented default), so "PRESS", "press", "prèss" and its NFD-decomposed form all resolve to the same result ids — confirmed by an explicit `.normalize('NFD')` test case, not an assumption about source-file encoding. Empty/whitespace/null query returns the full catalog in stable name-then-id order rather than zero rows.
- **`catalog-filter.ts`** — `applyCatalogFilters` (AND across the three dimensions, OR within one; per-user archive exclusion scoped by an explicit `userId` parameter so one user's archived exercise can never disappear for another user), `sortCatalogResults` (score desc / locale-aware name asc / id asc — the id tie-break confirmed load-bearing by temporarily removing it and watching the shuffle-invariance test fail, then restoring it), `deriveFacets` (canonical declared order from `@fitness/api-contracts`, omitting any dimension with zero present values), plus five small presentational helpers extracted for the screen (`formatResultCount`, `hasActiveFilters`, `collapseTags`, `deriveExerciseListScreenState`, `formatFacetLabel`) — this codebase has no `@testing-library/react-native`, so per Task 3's own instruction these decisions are unit-tested as pure functions instead of asserted against a rendered tree.
- **Three new components** — `SearchField` (debounced, reuses `TextField`'s accent focus-border and 48×48 hit-target convention, no spinner since search is synchronous), `FilterChipRow` (wraps to additional rows, hides itself entirely when its dimension has zero values, accent border/label reserved for the selected chip only), `ExerciseListRow` (thumbnail via `ExerciseImageTile` — never renders the word "accent", confirmed by grep — name `numberOfLines={1}`, tag chips collapsing past 3 into a "+N" chip via `collapseTags`, 48×48 minimum tap target on the whole row).
- **`app/exercises/index.tsx` replaced.** FlashList over the `seededExercise` UNION `exercise(is_custom=true)` read (both filtered to `archivedAt IS NULL` at the read boundary — content-level archive, distinct from `user_exercise_preference`'s per-user archive state), wired to `searchCatalog` → `applyCatalogFilters` → `sortCatalogResults`. Renders all four UI-SPEC E1 states: a 6-row skeleton while the local read is in flight, the exact `Exercise catalog couldn't load` copy on a seed-shape failure, `No exercises found` + conditional `Clear Filters` on a zero-result search/filter, and the pluralized `{n} exercise(s)` count line only when populated. Fires 03-05's `refreshCatalog(db)` from the same mount effect, after the local read has already populated the screen, and ignores an `offline` outcome silently per that function's own contract.
- **Package installs verified end to end.** `minisearch@7.2.0` and `@shopify/flash-list@2.0.2` (the Expo-SDK-57-resolved version, not the 2.3.2 the legitimacy gate audited — see key-decisions) both resolve for the React Native Web target: `pnpm --filter mobile build` (`expo export --platform web`) exits 0 both before and after the two libraries were actually imported into the screen, and no `.web.tsx` split was added for either.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install the two client packages** — `fd59181` (feat)
2. **Task 2: The search index and the filter predicate, as pure tested modules** — `d9f271d` (feat)
3. **Task 3: The real list screen — search, chips, and ~900 virtualized rows** — `a2afbe3` (feat)

**Plan metadata:** this SUMMARY.md commit (docs)

_Task 0 (package-legitimacy checkpoint) required no commit — it was a human-verify gate, already answered before this executor started (see `key-decisions`)._

## Files Created/Modified

- `apps/mobile/lib/catalog/search-index.ts` — `buildSearchIndex`, `searchCatalog`, `normalizeQuery`, `SearchableExercise`, `ScoredExercise`
- `apps/mobile/lib/catalog/catalog-filter.ts` — `applyCatalogFilters`, `deriveFacets`, `sortCatalogResults`, `CatalogFilters`, `FacetValues`, plus `formatResultCount`/`hasActiveFilters`/`collapseTags`/`deriveExerciseListScreenState`/`formatFacetLabel`
- `apps/mobile/lib/catalog/__tests__/search-index.test.ts` — 6 tests
- `apps/mobile/lib/catalog/__tests__/catalog-filter.test.ts` — 21 tests
- `apps/mobile/components/SearchField.tsx` — debounced search input
- `apps/mobile/components/FilterChipRow.tsx` — one filter dimension's chip row
- `apps/mobile/components/ExerciseListRow.tsx` — a populated list row
- `apps/mobile/app/exercises/index.tsx` — the real list screen (replaces 03-01's tracer)
- `apps/mobile/package.json`, `pnpm-lock.yaml` — `minisearch`, `@shopify/flash-list`

## Decisions Made

See `key-decisions` in frontmatter for full detail. Summary:
- Task 0's package-legitimacy gate was pre-approved by the human before this executor started; evidence and its browser-check limitation are recorded in frontmatter for the audit trail.
- flash-list resolved to 2.0.2 (Expo SDK 57's pinned compatible version) rather than the audited 2.3.2 — accepted per the human's prior decision, re-confirmed by this executor's own `node -e` check against the installed `package.json`.
- Equipment/movement-pattern chip labels use a new `formatFacetLabel` title-case helper (no readable-name source exists for those two facets in the catalog data, unlike muscle groups which have a real `name` column).
- "Add Custom Exercise" is a real, tappable `PrimaryButton` with a no-op `onPress` rather than a modified `PrimaryButton` with a new disabled variant — `PrimaryButton.tsx` is outside this plan's and this worktree's declared file scope.
- Two backstop must_haves truths (FlashList performance at ~870 rows, and the error-state render) could not be independently verified in this environment and are recorded honestly as open WINDOWS entries rather than silently marked passed.

## Deviations from Plan

### Auto-fixed Issues

None — no Rule 1/2/3 auto-fixes were needed. The plan's own action text anticipated the one real judgment call this executor made (extracting screen-helpers into `catalog-filter.ts` given the missing `@testing-library/react-native`), so that is documented under Decisions Made rather than as a deviation.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None — plan executed as written, including its own explicitly-anticipated fallback for the missing component-test library.

## Issues Encountered

- **`npx expo install` failed** ("Missing script: expo") on this machine — `pnpm exec expo install @shopify/flash-list` (the exact command the plan and the human's prior decision specify) worked correctly and resolved the expected `2.0.2`. Not a plan defect; documented here since a future executor hitting the same `npx` failure should reach for `pnpm exec` directly rather than debugging `npx`.
- **Two backstop must_haves truths unverifiable in this environment** — see WINDOWS #37 (FlashList ~870-row performance) and #38 (catalog-load-failure error-state render), both `unrun-verify`, both consistent with every prior phase's documented native/browser gap on this machine (no Xcode, no Android SDK, no Playwright browsers installed in this worktree).

## User Setup Required

None for this plan's own deliverables.

## Next Phase Readiness

- The list screen is real and reads the full 870-row catalog; 03-07 (running in parallel, exercise detail screen) does not depend on anything this plan changed beyond the already-declared non-overlapping file scope.
- 03-08 (custom-exercise create/edit form) should implement `/exercises/new` — the "Add Custom Exercise" button already exists and is wired to route there, currently as a no-op pending that route's existence.
- WINDOWS #37 and #38 (this plan's two unrun backstop verifications) plus the still-open image-wiring stub (#36, assigned to 03-07) and image-licensing finding (#35) should all be re-read before `/gsd-ship`.
- A future phase reaching for on-device performance/visual verification of this screen will need either a real simulator/device or Playwright browsers installed in the execution environment — neither exists on this machine today.

## Self-Check: PASSED

All created files confirmed present on disk: `search-index.ts`, `catalog-filter.ts`, both `__tests__` files, `SearchField.tsx`, `FilterChipRow.tsx`, `ExerciseListRow.tsx`, and the rewritten `app/exercises/index.tsx`. All three task commit hashes (`fd59181`, `d9f271d`, `a2afbe3`) confirmed present in `git log --oneline`. Every automated `<verify>` command from the plan was actually re-run in this worktree, not inferred: `pnpm --filter mobile typecheck` (exit 0), `pnpm --filter mobile test` (178/178 passing, non-fully-skipped), `pnpm --filter mobile test -- catalog` (43/43 passing, well above the 12-test floor), `pnpm --filter mobile test -- search-index` (6/6) and `-- catalog-filter` (21/21) individually, `pnpm --filter mobile build` (`expo export --platform web`, exit 0, both packages resolve for the web target), and every acceptance-criteria grep (literal Copywriting Contract strings, `FlashList`/`refreshCatalog` presence, the `accent`-count gates on `FilterChipRow.tsx` vs `ExerciseListRow.tsx`, the react/powersync import-absence gate on both pure modules) re-run directly against the final file contents.

---
*Phase: 03-exercise-catalog*
*Completed: 2026-08-18*
