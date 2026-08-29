---
phase: 09-records-client-analytics
plan: 01
subsystem: analytics
status: complete
tags: [analytics, charting, react-native-svg, accessibility, e2e, tracer]

requires:
  - "@fitness/pr-rules: estimated1RM, E1RM_MAX_VALID_REPS"
  - "@fitness/api-contracts: countsTowardRecords, countsTowardWorkingVolume, formatWeight, CANONICAL_KG_SCALE"
provides:
  - "@fitness/analytics-engine (new package): constants, chart-geometry, exercise-series, e1rm-display"
  - "apps/mobile/components/TrendChart.tsx: the app's only react-native-svg consumer"
  - "apps/mobile/components/SegmentedChipRow.tsx: the shared single-select switch"
  - "apps/mobile/lib/analytics/chart-labels.ts: formatChartDateLabel, pluralizeCount"
  - "apps/mobile/lib/db/exercise-history-query.ts: loadExerciseHistory"
  - "apps/mobile/app/exercise-performance.tsx: the S4 route"
  - "apps/mobile/lib/db/test-support.ts: seedExerciseHistory"
affects:
  - "apps/mobile/package.json (sole owner of the react-native-svg edit this phase)"
  - "apps/mobile/app/__durability.web.tsx (append-only)"
  - "apps/mobile/playwright.config.ts (append-only)"

tech-stack:
  added:
    - "react-native-svg@15.15.4 (exact, Expo SDK 57's own native-module version map)"
  patterns:
    - "Pure computation in a workspace package, hook-free *View components in the app"
    - "Shape-only SVG: every label is a sibling React Native <Text> node (R16)"
    - "Chart announced once via accessibilityRole=image + accessibilityLabel, children hidden (R20)"

key-files:
  created:
    - packages/analytics-engine/package.json
    - packages/analytics-engine/tsconfig.json
    - packages/analytics-engine/jest.config.js
    - packages/analytics-engine/src/index.ts
    - packages/analytics-engine/src/constants.ts
    - packages/analytics-engine/src/chart-geometry.ts
    - packages/analytics-engine/src/exercise-series.ts
    - packages/analytics-engine/src/e1rm-display.ts
    - packages/analytics-engine/src/__tests__/chart-geometry.test.ts
    - packages/analytics-engine/src/__tests__/exercise-series.test.ts
    - packages/analytics-engine/src/__tests__/e1rm-display.test.ts
    - apps/mobile/components/TrendChart.tsx
    - apps/mobile/components/__tests__/TrendChart.test.tsx
    - apps/mobile/components/SegmentedChipRow.tsx
    - apps/mobile/components/__tests__/SegmentedChipRow.test.tsx
    - apps/mobile/lib/analytics/chart-labels.ts
    - apps/mobile/lib/analytics/__tests__/chart-labels.test.ts
    - apps/mobile/lib/db/exercise-history-query.ts
    - apps/mobile/lib/db/__tests__/exercise-history-query.test.ts
    - apps/mobile/app/exercise-performance.tsx
    - apps/mobile/app/__tests__/exercise-performance.test.ts
    - apps/mobile/e2e/exercise-performance.spec.ts
  modified:
    - apps/mobile/package.json
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/playwright.config.ts

decisions:
  - "role=\"img\" + accessible name HOLDS under react-native-web — proven in a real browser, not reasoned about"
  - "x is spaced by index, not elapsed time: TrendChartProps carries no numeric date per point"
  - "Chart shapes are matched in unit tests by their geometry props, never by importing react-native-svg"
  - "loadExerciseHistory returns one entry per SESSION, merging duplicate session_exercise rows"

metrics:
  duration: "~55 min"
  completed: 2026-08-29

actuals:
  tokens: 23993
  tasks: 3
  commits: 5
---

# Phase 9 Plan 01: Exercise Performance Tracer Summary

A production-quality vertical slice from `logged_set` rows through a new pure package, a real SVG chart and a new route, proven green in a real browser: `@fitness/analytics-engine` computes the per-session series, `TrendChart` draws shape only, and `/exercise-performance` renders every UI-SPEC state including the ANLY-10 omission caption.

---

## THE HEADLINE FINDING — read this before writing any other chart spec in this phase

**The `role="img"` + accessible-name selector strategy HOLDS.** 09-RESEARCH §1 flagged this as the phase's one unverified assumption. It is now settled empirically, in a real Chromium page, against a real `@powersync/web` database.

`react-native-svg@15.15.4` under `react-native-web` maps `accessible` + `accessibilityRole="image"` + `accessibilityLabel` onto a DOM `<svg>` that Playwright finds by `getByRole('img', { name: ... })` with the accessible name intact. These assertions passed:

```ts
await expect(page.getByRole('img', { name: /Heaviest weight over Last 3 months/ })).toBeVisible();
await expect(page.getByRole('img', { name: /3 points/ })).toBeVisible();
await expect(page.getByRole('img', { name: /One point: 90.00 kg/ })).toBeVisible();
await expect(page.getByRole('img')).toHaveCount(0);   // the no-history state
```

**09-03, 09-04, 09-05 and 09-06: inherit this.** Assert a chart by its image role and the sentence `trendChartSummary()` produces. No fallback to sibling text is needed and no WINDOWS deviation was recorded, because there was nothing to correct. Add no `testID` to any shape — `data-testid` stays reserved for the harness-ready sentinel.

Two further mappings were confirmed in the same run and are also safe to rely on:

- `accessibilityRole="radio"` on a `Pressable` → `getByRole('radio', { name: 'Est. 1RM' })` finds and clicks the chip.
- `accessibilityRole="radiogroup"` on a `ScrollView` renders without breaking the chip strip.

---

## What Was Built

**Task 1 — `@fitness/analytics-engine`** (`f505a8e` RED, `8302430` GREEN)

Scaffolded byte-for-byte from `progression-engine`: identical `jest.config.js` (suite-integrity reporter included), identical `tsconfig.json` with `lib: ["ES2022"]` and no DOM entry — which is what makes a clock or `window` read inside this package a compile error rather than a review comment (D-10). Four modules:

- `constants.ts` — every window, bucket and range this phase names, including the four (`PROGRESS_WINDOW_DAYS`, `TREND_WEEKS`, `TREND_BUCKET_DAYS`, `PER_SESSION_RANGE_DAYS`) that 09-02 and later plans consume. One file owns the vocabulary.
- `chart-geometry.ts` — `linearScale` with the `span === 0` guard, `paddedDomain` that never starts at zero, `buildChartGeometry` with an inverted y range and two-decimal coordinates.
- `exercise-series.ts` — one point per session per metric. **The two predicates are imported and never merged**: `countsTowardRecords` for `heaviest`/`e1rm`, `countsTowardWorkingVolume` for `volume`.
- `e1rm-display.ts` — the three-branch union plus `E1RM_ABOVE_CAP_COPY` built by interpolating the imported cap.

30 tests. The predicate divergence is asserted from **one shared fixture** as the plan required: the same session yields `heaviest = 100` (the 110kg partial and the incomplete 200kg set both excluded), `volume = 1470` (the partial and the drop-set child both included), and `e1rm = 116.67` — three different numbers from one set list, so a future merge of the predicates breaks a test that shows exactly why.

**Task 2 — the chart, the switch, the read and the route** (`f7f98be` RED, `fa9f4e5` GREEN)

`react-native-svg` pinned at exactly `15.15.4`. `TrendChart` is the app's only importer of it and draws shape only — baseline, area, line, markers — with every number, date and caption an ordinary React Native `<Text>` sibling. `SegmentedChipRow` copies `FilterChipRow`'s anatomy and adds the radio/radiogroup semantics it lacks. `loadExerciseHistory` reads one exercise's completed sessions in two queries at any scale. `/exercise-performance` is a flat root route matching the shipped `workout-summary.tsx` precedent, with the `{ exerciseId, metric, userId, db }` override the harness mounts against. 34 tests.

**Task 3 — the browser proof** (`5f746b7`)

`seedExerciseHistory` appended to `test-support.ts`; one seed-then-mount harness method and one mutually-exclusive mount slot appended to `__durability.web.tsx`; one filename appended to `playwright.config.ts`. Four spec cases: the populated chart with its accessible name and Display headline; the metric switch redrawing to the estimate and naming the two dropped sessions; a warm-up-only session contributing no point (seeded at 200kg, heavier than the working set, so a predicate leak would be unmissable); and the no-history empty state with zero charts and zero switches.

---

## Evidence — real numbers

| Check | Result |
|---|---|
| `pnpm --filter @fitness/analytics-engine test` | **3 suites, 30 tests, all passed** |
| `pnpm --filter mobile test` | **100 suites, 1804 tests, all passed** |
| `pnpm --filter mobile test:e2e:durability` | **58 passed, 0 failed (4.3m)** — the whole project, not just the new file |
| `npx turbo run typecheck lint` | **14 tasks successful** |
| `npx turbo run test` | 10 successful; `@fitness/analytics-engine#test` present in the summary; `api#test` failed (see below) |

The four new e2e cases in the green run:

```
✓ 11 exercise-performance.spec.ts › seeded history renders the chart, its accessible name and the display-sized latest value (2.8s)
✓ 12 exercise-performance.spec.ts › switching to the estimate redraws and names how many sessions the rep cap dropped (3.0s)
✓ 13 exercise-performance.spec.ts › a warm-up-only session contributes no point, proving the predicate split reaches the screen (2.7s)
✓ 14 exercise-performance.spec.ts › an exercise with no logged history renders the empty state and no chart at all (2.7s)
```

---

## Deviations from Plan

**1. [Rule 3 - Blocking] `test-support.ts`'s import line extended rather than purely appended**

- **Found during:** Task 3
- **Issue:** `seedExerciseHistory`'s input surface needs `SetType` (the plan requires a non-record-eligible set type in the surface so a spec can prove the predicate split from the DOM). `test-support.ts` imported only `EquipmentType` from `@fitness/api-contracts`.
- **Fix:** extended the existing type-import to `import type { EquipmentType, SetType }`. Everything else in that file is a pure append at the end. The append-only rule guards against reordering and merge collisions; a one-token addition to an import list creates neither.
- **Files modified:** `apps/mobile/lib/db/test-support.ts`
- **Commit:** `5f746b7`

**2. [Rule 2 - Missing functionality] Unknown-exercise fallback added to the S4 heading**

- **Found during:** Task 3
- **Issue:** `names.get(exerciseId) ?? ''` rendered a blank heading for an exercise id absent from the catalog — a blank that looks like a bug, which is exactly what D-02's discipline forbids elsewhere in this phase.
- **Fix:** used `'Unknown exercise'`, the fallback `session-query.ts` and `summary-query.ts` already ship, so the app has one label for this case rather than two.
- **Files modified:** `apps/mobile/app/exercise-performance.tsx`
- **Commit:** `5f746b7`

**3. [CLAUDE'S CALL] Unit tests match SVG shapes by geometry prop, never by importing `react-native-svg`**

The plan's own gate requires that no file other than `TrendChart.tsx` carries an `import ... react-native-svg` line under `apps/mobile/{components,app,lib}`. `components/__tests__/TrendChart.test.tsx` sits inside that scope, so importing `Circle`/`Path` there to find them in the tree would have defeated the gate it is meant to protect. The test instead matches on `props.cx` / `props.d` / `props.x1`. This is stricter, library-agnostic, and is the pattern later chart tests in this phase should copy.

**4. [CLAUDE'S CALL] x spacing is by index — recorded in the plan, restated here for later plans**

09-RESEARCH §2 proposed a time-proportional axis. The UI-SPEC's pinned `TrendChartProps` carries no numeric date per point (its `key` may be a session id), so a time-proportional scale is not expressible through it. Consequence, commented in `chart-geometry.ts`: an untrained gap is not visually distinguishable from a shorter one, and the axis dates remain the truthful signal. Reversible — a later phase can add a numeric date to `TrendPoint` and switch the scale.

**5. Route-classifier test mocks two ESM-reaching modules**

`app/__tests__/exercise-performance.test.ts` mocks `lib/db/powersync` and `lib/auth-client` before importing the route, exactly as the shipped `app/exercises/__tests__/exercise-detail-screen.test.ts` does (WINDOWS #22/#33). Without it Jest cannot parse `better-auth/react`'s ESM dist.

---

## Deferred Issues (out of scope — NOT introduced by this plan)

**`api#test` fails in a fresh worktree for want of `DATABASE_URL`.** `apps/api/src/db/drizzle.module.ts` throws at import time when the variable is unset, taking `src/sync/__tests__/progression-preference.spec.ts` down with it (the other 5 suites, 82 tests, pass). This plan changed **zero** files under `apps/api` — `git diff <base>..HEAD -- apps/api` is empty — and `apps/api` does not depend on `@fitness/analytics-engine`. It is a missing `.env` in this worktree, not a code defect, and per the executor scope boundary it was not fixed.

---

## Recorded for later verification (`.planning/WINDOWS.md`, via the CLI)

| Kind | Subject | Where it gets verified |
|---|---|---|
| `unrun-verify` | `TrendChart` rendering on iOS/Android — this machine has neither Xcode nor the Android SDK, so `react-native-svg`'s native build was never exercised. Web rendering is proven above. | ROADMAP Phase 999.1 |
| `unrun-verify` | Subjective visual review of the chart, its two-label axis row and the ANLY-10 caption at maximum OS font scale. R16 is grep-enforced and the axis row wraps, but legibility itself needs a human. | ROADMAP Phase 999.2 |

Neither was allowed to become a checkpoint, per the plan.

---

## Known Stubs

None. Every surface this plan ships is wired to real data: the route reads local SQLite, the series is computed from those rows, and the chart draws those numbers — proven end to end in a browser.

## Threat Flags

None. The plan's `<threat_model>` mitigations are all in place and asserted: T-9-01 (weights parsed at one boundary, non-finite dropped, no fabricated zeros), T-9-02 (the `span === 0` guard, asserted directly), T-9-04 (the three-branch union makes an above-cap number unrepresentable), T-9-05 (the read is bounded by `local_date` and is two queries at any scale), T-9-SC (`react-native-svg` pinned exactly at Expo SDK 57's own answer). No new network endpoint, auth path or schema change was introduced — this plan is read-only against the schema.

---

## What 09-02..09-06 Inherit

1. **Chart selectors:** `getByRole('img', { name: /<trendChartSummary sentence>/ })`. Confirmed working.
2. **Chip selectors:** `getByRole('radio', { name: '<chip label>' })`. Confirmed working.
3. **`SegmentedChipRow`** is ready for the Records metric switch, the History trend switch and 09-06's range switch. Pass `groupLabel`, `options`, `selectedId`, `onSelect`.
4. **`TrendChart`** takes already-formatted points; hosts own their own empty state and must not call it with an empty array.
5. **`constants.ts`** already exports `PROGRESS_WINDOW_DAYS`, `TREND_WEEKS`, `TREND_BUCKET_DAYS` and `HISTORY_TREND_METRICS` — import them, do not re-declare.
6. **`src/index.ts`** is append-only: add exactly one `export *` line at the END.
7. **`react-native-svg` is already declared.** Do not touch `apps/mobile/package.json` for it.
8. **The two predicates must stay apart.** `exercise-series.ts` carries the comment explaining why; any new aggregation module must make the same choice explicitly.

## Self-Check: PASSED

All 23 created files verified present on disk; all 5 commits verified present in `git log`.
