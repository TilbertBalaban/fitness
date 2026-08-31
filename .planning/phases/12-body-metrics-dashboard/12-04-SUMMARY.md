---
phase: 12-body-metrics-dashboard
plan: 04
subsystem: ui
tags: [powersync, drizzle, expo-router, react-native-web, playwright, trend-chart]

requires:
  - phase: 12-body-metrics-dashboard
    provides: BODY-01/BODY-02 (BodyMetricRow overview, logMetric/loadLatestMetric, MetricEntrySheet, TrackKindSheet)
provides:
  - "/body-metric-trend?kind={kind} route: per-kind trend chart, window switch, entries list, edit and delete"
  - loadBodyMetricTrend/bodyMetricWindowStart in lib/db/body-metric-trend-query.ts (single batched read, JS-side window filter and dedup)
  - loadMetricEntries/updateMetric/deleteMetric in lib/db/body-metrics.ts
  - MetricEntryRow, MetricEntryActionSheet, DeleteMetricEntryDialog components
affects: [12-body-metrics-dashboard, 999.1-native-verification, 999.2-web-human-verification]

actuals:
  tokens: 24265
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Trend detail loads once (windowStart: null) and filters/dedupes in JS per window switch — no re-query per chip press"
    - "Hook-free *View + stateful default-export wrapper split, matching every other Phase 12 screen"

key-files:
  created:
    - apps/mobile/lib/db/body-metric-trend-query.ts
    - apps/mobile/app/body-metric-trend.tsx
    - apps/mobile/components/MetricEntryRow.tsx
    - apps/mobile/components/MetricEntryActionSheet.tsx
    - apps/mobile/e2e/body-metric.spec.ts
  modified:
    - apps/mobile/lib/db/body-metrics.ts
    - apps/mobile/components/MetricEntrySheet.tsx
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/playwright.config.ts

key-decisions:
  - "emptyState() rendered as a plain function call embedded directly in the tree, not a <Component/> JSX element — a locally-defined element is opaque to this codebase's tree-walking test convention, matching the existing renderStateBlock precedent"
  - "MetricEntryActionSheet and DeleteMetricEntryDialog each wrap their own self-contained <Modal>, matching Phase 12's own convention (MetricEntrySheetView, TrackKindSheetView) rather than HistoryActionSheet's externally-wrapped precedent"
  - "MetricEntrySheet's edit mode pre-fills from the passed entry's own canonical value via fromCanonicalValue, checked before the loadLatestMetric fallback, and saves through updateMetric instead of logMetric"

patterns-established:
  - "Structural .toString()-source assertions for stateful components with no renderer available in this workspace (no @testing-library/react-native, no react-test-renderer) — must match Babel's transpiled qualified-call shape, e.g. '.updateMetric)({' not 'updateMetric({'"

requirements-completed: [BODY-03]

coverage:
  - id: D1
    description: "Trend chart plots a kind's history on-device via loadBodyMetricTrend, latest-per-local_date dedup, no server call"
    requirement: BODY-03
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/body-metric-trend-query.test.ts"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/body-metric.spec.ts — 'one kind, one window'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Window switch (1m/3m/1y/all, default 3m) via the shipped SegmentedChipRow, filtering in JS without re-querying"
    requirement: BODY-03
    verification:
      - kind: unit
        ref: "apps/mobile/app/__tests__/body-metric-trend-screen.test.ts — 'ready' describe block"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/body-metric.spec.ts — 'window switch'"
        status: pass
    human_judgment: false
  - id: D3
    description: "All five trend-detail states (error, loading, empty-kind, empty-window, ready/partial) render the specified copy and window-switch visibility"
    requirement: BODY-03
    verification:
      - kind: unit
        ref: "apps/mobile/app/__tests__/body-metric-trend-screen.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Entries list shows every raw row (not deduped), and supports edit (pre-filled MetricEntrySheet, overwrite in place) and delete (DeleteMetricEntryDialog confirm, hard delete) scoped by id and userId"
    requirement: BODY-03
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/body-metrics.test.ts — loadMetricEntries/updateMetric/deleteMetric"
        status: pass
      - kind: unit
        ref: "apps/mobile/components/__tests__/MetricEntryActionSheet.test.tsx"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/body-metric.spec.ts — 'entries list, edit and delete'"
        status: pass
    human_judgment: false
  - id: D5
    description: "TrendChart/SegmentedChipRow/analytics-engine reused completely unchanged (D-11) and trendChartSummary reads correctly for a non-weight metric label"
    requirement: BODY-03
    verification:
      - kind: other
        ref: "git diff <base>..a40d863 --name-only confirms TrendChart.tsx, SegmentedChipRow.tsx, packages/analytics-engine/** untouched"
        status: pass
    human_judgment: true
    rationale: "trendChartSummary's screen-reader announcement wording for a non-weight, non-exercise metric label is a UI-SPEC E6 accessibility backstop — legibility/correctness of the spoken string is human judgment, deferred to Phase 999.2"

duration: 62min
completed: 2026-08-31
status: complete
---

# Phase 12 Plan 04: Body Metric Trend Detail Summary

**Per-kind trend detail route (`/body-metric-trend?kind={kind}`) with the shipped `TrendChart`/`SegmentedChipRow` reused unchanged, latest-per-day dedup, and an entries list supporting edit/delete of raw logged rows**

## Performance

- **Duration:** 62 min
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments
- `loadBodyMetricTrend` — one batched SQLite read per screen load (`windowStart: null`), deduped to the latest entry per `local_date`, with window filtering/dedup done in JS on chip press rather than re-querying (no N+1)
- `/body-metric-trend` route with all five detail states (error, loading, empty-kind, empty-window, ready/partial), the Display-sized headline figure, and the shipped `TrendChart`/`SegmentedChipRow` reused verbatim (D-11)
- Entries list (`MetricEntryRow`) showing every raw logged row — genuinely distinct from the chart's deduped series (D-09) — with tap-through to `MetricEntryActionSheet` → edit (`MetricEntrySheet` pre-filled with that entry's own value) or delete (`DeleteMetricEntryDialog` confirm, hard delete)
- `updateMetric`/`deleteMetric` scoped by both `id` and `userId` (T-12-17); route param `kind` validated against the known kind set before any query (T-12-15)
- 8/8 Playwright e2e tests against a real `@powersync/web` database proving the query, route, window switch, and entries list edit/delete flows end to end

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end bodyweight trend — query, route, and real-browser proof (tracer)** - `c33a482` (feat)
2. **Task 2: Trend windows, dedup, and every trend-detail state (TDD)** - `ffdc1ef` (test) → `3282f99` (feat)
3. **Task 3: The entries list — edit and delete a logged entry (TDD)** - `02e4d28` (test) → `a40d863` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `apps/mobile/lib/db/body-metric-trend-query.ts` - windowed, deduped trend read + `bodyMetricWindowStart` window arithmetic
- `apps/mobile/lib/db/body-metrics.ts` - added `loadMetricEntries`, `updateMetric`, `deleteMetric`
- `apps/mobile/app/body-metric-trend.tsx` - the full route: hook-free `BodyMetricTrendView` + stateful `BodyMetricTrendScreen` wrapper
- `apps/mobile/components/MetricEntryRow.tsx` - one entries-list row (value/date/time, no `numberOfLines`)
- `apps/mobile/components/MetricEntryActionSheet.tsx` - edit/delete action sheet + `DeleteMetricEntryDialog`
- `apps/mobile/components/MetricEntrySheet.tsx` - added `editEntry` prop, pre-fill and `updateMetric` save path
- `apps/mobile/lib/db/test-support.ts` - `seedBodyMetrics`/`readBodyMetricsRaw` test seams (insertion-only)
- `apps/mobile/app/__durability.web.tsx` - four new harness methods + mount block (insertion-only)
- `apps/mobile/playwright.config.ts` - registered `body-metric.spec.ts` in the `durability` project (insertion-only)
- `apps/mobile/e2e/body-metric.spec.ts` - 8 Playwright tests across query/route, window switch, and entries-list edit/delete

## Decisions Made
- `emptyState(heading, body)` is called as a plain function embedded in the tree rather than rendered as a `<Component/>` element, matching `body-metrics.tsx`'s `renderStateBlock` precedent — required because this codebase's tree-walking test convention never invokes a JSX element's component function, only reads `props.children`
- `MetricEntryActionSheet`/`DeleteMetricEntryDialog` each own a self-contained `<Modal>` rather than being externally wrapped, matching every other Phase 12 sheet (`MetricEntrySheetView`, `TrackKindSheetView`)
- `MetricEntrySheet`'s edit mode checks a new `editEntry` prop (pre-filling from that entry's own canonical value) before falling back to `loadLatestMetric`, and routes `handleLog` through `updateMetric` instead of `logMetric` when editing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `DeleteMetricEntryDialog` copy used `&apos;` instead of a literal apostrophe**
- **Found during:** Task 3
- **Issue:** Initial body copy `can&apos;t be undone` rendered identically in JSX but failed the plan's grep-based acceptance check for the literal string `"...can't be undone..."`
- **Fix:** Switched to a literal apostrophe, matching `ProgressPhotoActionSheet.tsx`'s (Phase 12) newer convention over `HistoryActionSheet.tsx`'s older one
- **Files modified:** apps/mobile/components/MetricEntryActionSheet.tsx
- **Verification:** grep count = 1
- **Committed in:** a40d863

**2. [Rule 3 - Blocking] `BodyMetricTrendViewProps.entries` required-prop typecheck break**
- **Found during:** Task 3
- **Issue:** Adding `entries`/`onEntryPress` as required props broke the Task 2 test file's `renderView()` helper (missing props)
- **Fix:** Added `entries: []` and `onEntryPress: jest.fn()` to the helper's defaults
- **Files modified:** apps/mobile/app/__tests__/body-metric-trend-screen.test.ts
- **Verification:** `pnpm --filter mobile typecheck` clean
- **Committed in:** a40d863

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary for correctness against the plan's own acceptance criteria. No scope creep.

## Issues Encountered
- Three Playwright locators became ambiguous once Task 3's entries list duplicated the headline's formatted value and label substrings on the page — fixed with `.text-display`-scoped locators and `{exact: true}` role-name matching. No product code changed; e2e-only fix.

## Known Stubs
None - the trend chart, window switch, entries list, and edit/delete flows are fully wired to real PowerSync/SQLite reads and writes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- BODY-03 complete; `BodyMetricRow`'s row-body link from 12-02 now resolves to a real trend detail screen
- Native (iOS/Android) verification and max-font-scale visual review deferred to ROADMAP Phase 999.1/999.2 per project policy, not blocking this phase
- No blockers for subsequent 12-* plans

---
*Phase: 12-body-metrics-dashboard*
*Completed: 2026-08-31*

## Self-Check: PASSED

All 10 files created/referenced by this plan exist on disk. All 5 task commit hashes (`c33a482`, `ffdc1ef`, `3282f99`, `02e4d28`, `a40d863`) are present in `git log`.
