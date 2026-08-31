---
phase: 12-body-metrics-dashboard
plan: 05
subsystem: ui
tags: [react-native, expo-router, powersync, drizzle, nestjs, sync]

# Dependency graph
requires:
  - phase: 12-body-metrics-dashboard
    provides: 12-01 body_metric table/vocabulary pattern, 12-02 body metrics entry, 12-03 progress photos, 12-04 bodyweight trend detail (loadBodyMetricTrend)
  - phase: 09-progress-analytics
    provides: WeeklyProgressCard, weekly-progress-query, records-query, RecordRow, pr-vocabulary
  - phase: 10-muscle-map
    provides: MuscleHeatmap component, muscle-volume-query, muscle-map analytics-engine
provides:
  - New synced dashboard_widget table (Postgres + client SQLite), registered at all seven sync.service.ts touchpoints
  - Forward-compatible DashboardWidgetHost dispatch (filter-before-map, never throws on an unknown widget_kind)
  - Six-widget v1 catalog (next_up, weekly_progress, recent_records, muscle_heatmap, bodyweight_trend, history_trend), all wrapping already-shipped surfaces, no new analytics
  - loadOrMaterializeDashboardWidgets — first-run default widget set reproducing today's Home exactly
  - Home tab restructured into a widget-driven dashboard with four explicit states (loading/error/empty/ready) via deriveDashboardState
affects: [12-06, 12-07, 12-08, dashboard-widget-picker, quick-actions]

# Actuals (#2632)
actuals:
  tokens: 30324
  tasks: 4
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Widget dispatch host: filter-before-map over a closed WIDGET_KIND_SET, never an exhaustive switch with a throwing default (D-22/R26) — an unrecognised kind from a newer device is silently absent, not fatal"
    - "Materialize-on-first-read for a synced table (loadOrMaterializeDashboardWidgets): a zero-row result inserts real default rows once; a later all-disabled result is respected as deliberate emptiness, never re-populated (D-24/D-26)"
    - "Data-fetch wrapper components colocated in the dispatch host file for verbatim-reused display components (WeeklyProgressCard, HistoryTrendCard) that don't self-fetch, so the reused components stay untouched (D-23)"
    - "Hook-free view + stateful wrapper split (HomeDashboardView / HomeScreen) so every screen state is unit-testable via direct invocation, no renderer needed"

key-files:
  created:
    - apps/mobile/lib/db/dashboard-widgets.ts
    - apps/mobile/components/DashboardWidgetHost.tsx
    - apps/mobile/components/NextUpWidget.tsx
    - apps/mobile/components/RecentRecordsWidget.tsx
    - apps/mobile/components/MuscleHeatmapWidget.tsx
    - apps/mobile/components/BodyweightTrendWidget.tsx
    - apps/api/test/dashboard-widget.e2e-spec.ts
  modified:
    - apps/api/src/db/schema/records.ts
    - apps/api/src/db/schema.ts
    - apps/api/src/sync/patch-update-set.ts
    - apps/api/src/sync/sync.service.ts
    - ops/powersync/sync-rules.yaml
    - apps/mobile/lib/db/schema.ts
    - apps/mobile/app/(tabs)/index.tsx
    - packages/api-contracts/src/body-metrics.ts
    - packages/api-contracts/src/sync.ts
    - docs/body-metric-vocabularies.md

key-decisions:
  - "Task 1 checkpoint (D-21, one-way): confirmed row-per-widget dashboard_widget table over a JSON array on user_preference, matching excluded_exercise/personal_record/equipment_profile precedent — a packed JSON column would let two devices' concurrent reorders silently clobber the whole layout under LWW"
  - "MuscleHeatmapWidget reuses loadMuscleMapWindow({ windowId: '1w' }) directly rather than re-deriving a day count, with a runtime equality check against analytics-engine's MUSCLE_MAP_WINDOW_DAYS['1w'] guarding the two from drifting apart"
  - "BodyweightTrendWidget bypasses the resolveDisplayUnit/fromCanonicalValue machinery and calls formatWeight directly, since bodyweight's canonical unit is always kg with no cm/in branch"
  - "RecentRecordsWidget merges across all four PR_TYPES via Promise.all (4 bounded queries), not a per-metric read — loadRecordsPage is single-metric and does not fit this widget's cross-metric feed"

patterns-established:
  - "Widget vocabulary (WIDGET_KINDS) shares packages/api-contracts/src/body-metrics.ts with BODY_METRIC_KINDS per D-22, despite the filename reading narrower than its contents — documented with a header note rather than a rename"

requirements-completed: [DASH-01]

coverage:
  - id: D1
    description: "New dashboard_widget table synced end-to-end (Postgres schema, sync.ts tuples, sync-rules.yaml query, all seven sync.service.ts touchpoints), with ownership/vocabulary/type validation enforced server-side"
    requirement: "DASH-01"
    verification:
      - kind: e2e
        ref: "apps/api/test/dashboard-widget.e2e-spec.ts — 4 cases (happy path, foreign user_id rejected, invalid widget_kind rejected, invalid position rejected)"
        status: pass
      - kind: unit
        ref: "packages/api-contracts/src/__tests__/sync.test.ts, packages/api-contracts/src/__tests__/body-metrics.test.ts — WIDGET_KINDS totality"
        status: pass
    human_judgment: false
  - id: D2
    description: "loadOrMaterializeDashboardWidgets — first-run default widget set (next_up, weekly_progress) reproducing today's Home exactly; deliberate all-disabled state is never re-populated"
    requirement: "DASH-01"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/dashboard-widgets.test.ts — 4 cases"
        status: pass
    human_judgment: false
  - id: D3
    description: "DashboardWidgetHost dispatches all six widget kinds via filter-before-map; an unrecognised widget_kind is excluded without raising"
    requirement: "DASH-01"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/DashboardWidgetHost.test.tsx — resolveDashboardWidgets (5 cases) + DashboardWidgetHost direct-invocation (2 cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Six-widget v1 catalog (next_up, weekly_progress, recent_records, muscle_heatmap, bodyweight_trend, history_trend), each wrapping an already-shipped surface with no new analytics"
    requirement: "DASH-01"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/NextUpWidget.test.ts, apps/mobile/components/__tests__/DashboardWidgetHost.test.tsx (readWeeklyProgress — 7 cases)"
        status: pass
      - kind: other
        ref: "pnpm --filter mobile typecheck — RecentRecordsWidget/MuscleHeatmapWidget/BodyweightTrendWidget compile against their real data sources"
        status: pass
    human_judgment: true
    rationale: "Recent Records, Muscle Heatmap and Bodyweight Trend widgets have no dedicated unit-level data-shaping tests beyond typecheck — their underlying reads (records-query, muscle-volume-query, body-metric-trend-query) are already covered by Phase 9/10/12-04 test suites, but the widget wrapper's own render/props wiring has not been directly asserted. Visual/functional confirmation on a device is deferred to ROADMAP Phase 999.1 per the standing native-toolchain-absent constraint."
  - id: D5
    description: "Home tab renders four explicit widget-list-area states (loading, error, empty, ready) via deriveDashboardState, with the header row, in-progress banner and trailing CTA pinned across all four"
    requirement: "DASH-01"
    verification:
      - kind: unit
        ref: "apps/mobile/app/__tests__/home-dashboard.test.ts — deriveDashboardState (5 cases)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Live Postgres carries dashboard_widget with the intended columns and passes schema parity"
    requirement: "DASH-01"
    verification:
      - kind: e2e
        ref: "pnpm --filter api db:push && pnpm --filter api db:verify (schema-parity.e2e-spec.ts — 36 cases)"
        status: pass
      - kind: other
        ref: "psql direct query against the live database confirming id, user_id, widget_kind, position, enabled, server_seq columns"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-08-31
status: complete
---

# Phase 12 Plan 05: Home Tab Widget Dashboard Summary

**Home tab rebuilt as a stored-widget dashboard backed by a new synced `dashboard_widget` table, with a forward-compatible six-widget catalog that wraps only already-shipped Phase 9/10 surfaces**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-31T11:16:19+03:00 (first task commit)
- **Completed:** 2026-08-31T11:32:24+03:00
- **Tasks:** 4 (1 checkpoint:decision, 1 tracer, 1 blocking/no-code, 1 tdd)
- **Files modified:** 24 (across api, mobile, api-contracts, ops, docs)

## Accomplishments
- New `dashboard_widget` synced table shipped end-to-end: Postgres schema, `sync.ts` `SYNCED_TABLES`/`PUSH_APPLIED_TABLES` tuples, `patch-update-set.ts` patch fields, all seven `sync.service.ts` apply-path touchpoints, and a `sync-rules.yaml` per-user pull query
- `loadOrMaterializeDashboardWidgets` materializes a real first-run default widget set (`next_up`, `weekly_progress`) that reproduces today's pre-dashboard Home exactly, and never re-populates a deliberately-emptied layout
- `DashboardWidgetHost` dispatches all six v1 widget kinds through a filter-before-map structure — an unrecognised `widget_kind` from a newer device is silently skipped, not fatal
- Six-widget catalog (`NextUpWidget`, `WeeklyProgressCard`, `RecentRecordsWidget`, `MuscleHeatmapWidget`, `BodyweightTrendWidget`, `HistoryTrendCard`) — three newly written as thin wrappers, three reused verbatim — with no new analytics written (D-23)
- Home's widget-list area renders four explicit states (loading, error, empty, ready) via `deriveDashboardState`, independent of the pinned header row, in-progress banner and trailing CTA
- Live Postgres schema pushed and verified: `dashboard_widget` exists with `id`, `user_id`, `widget_kind`, `position`, `enabled`, `server_seq`, passing all 36 schema-parity cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm the one-way widget-layout storage shape (D-21)** — checkpoint:decision, no commit (see Checkpoint Decisions below)
2. **Task 2: End-to-end "my Home screen is made of stored widgets"** — `9ae2883` (feat)
3. **Task 3: [BLOCKING] Push the `dashboard_widget` schema and verify parity** — no source edits (see below); ran `db:push`/`db:verify`
4. **Task 4: The full widget catalog and every Home dashboard state** — `9519d38` (test, RED) then `2c7e45d` (feat, GREEN)

**Plan metadata:** pending (this commit)

_Note: TDD Task 4 has two commits (test → feat); no refactor commit was needed._

## Checkpoint Decisions

**Task 1 (D-21, gate="blocking", auto-approved per the unattended-run directive):**

Selected **row-per-widget** — a new `dashboard_widget` table, one row per widget — over the rejected alternative **json-on-preference** (a packed JSON array column on `user_preference`).

Rationale: D-21 is rated one-way — once the table ships with its `sync-rules.yaml` query, changing the storage shape means a Postgres migration, a client schema change, a sync-rules change, and a PowerSync Service restart, with rows already on devices. The project's standing rule (Phase 11's D-10 `excluded_exercise`, `user_preference.active_routine_id`) already picks a row or column over a packed list for the same reason: under row-level LWW, a JSON array packed into one column loses concurrent offline edits wholesale — reordering is exactly the edit two devices are most likely to make independently, and a JSON array would mean the last device to sync wins the entire layout. The row-per-widget cost (a new table, seven more `sync.service.ts` registration points, an unverifiable service restart) was accepted as the correct tradeoff.

**Task 3 note:** made no source edits, per its own contract — it ran `pnpm --filter api db:push` then `pnpm --filter api db:verify` against Task 2's already-committed schema, confirming zero drift.

## Files Created/Modified
- `apps/api/src/db/schema/records.ts` — `dashboardWidget` pgTable + relations
- `apps/api/src/db/schema.ts` — registered `dashboardWidget` in imports, exports, `schema`, `userRelations`
- `apps/api/src/sync/patch-update-set.ts` — `DashboardWidgetValues`, `DASHBOARD_WIDGET_PATCH_FIELDS`
- `apps/api/src/sync/sync.service.ts` — all seven singleton-root registration touchpoints for `dashboard_widget`
- `apps/api/test/dashboard-widget.e2e-spec.ts` — 4 e2e cases against live Postgres
- `ops/powersync/sync-rules.yaml` — appended `dashboard_widget` per-user query
- `apps/mobile/lib/db/schema.ts` — `dashboardWidget` sqliteTable + `drizzleSchema` entry
- `apps/mobile/lib/db/dashboard-widgets.ts` — `DEFAULT_WIDGET_KINDS`, `loadOrMaterializeDashboardWidgets`
- `apps/mobile/components/DashboardWidgetHost.tsx` — `resolveDashboardWidgets`, six-kind dispatch, `WeeklyProgressWidget`/`HistoryTrendWidget` fetch wrappers
- `apps/mobile/components/NextUpWidget.tsx` — extracted verbatim from the old `index.tsx`
- `apps/mobile/components/RecentRecordsWidget.tsx` — up to `RECENT_RECORDS_WIDGET_LIMIT = 3` records across all PR types
- `apps/mobile/components/MuscleHeatmapWidget.tsx` — fixed `MUSCLE_HEATMAP_WIDGET_WINDOW_DAYS = 7` window
- `apps/mobile/components/BodyweightTrendWidget.tsx` — fixed `BODYWEIGHT_TREND_WIDGET_WINDOW_DAYS = 30` window
- `apps/mobile/app/(tabs)/index.tsx` — restructured into `HomeDashboardView`/`HomeScreen`, `deriveDashboardState`, header row, four-state widget-list render
- `packages/api-contracts/src/body-metrics.ts` — `WIDGET_KINDS`, `WidgetKind`, `WIDGET_KIND_SET`, `WIDGET_KIND_LABELS`
- `packages/api-contracts/src/sync.ts` — `'dashboard_widget'` appended to `SYNCED_TABLES`/`PUSH_APPLIED_TABLES`
- `docs/body-metric-vocabularies.md` — new `dashboard_widget` section: column table, vocabulary table, enforcement layers, skip-unknown-never-error rationale

## Decisions Made
See "Checkpoint Decisions" above for D-21. Additional in-flight decisions:
- MuscleHeatmapWidget calls `loadMuscleMapWindow({ windowId: '1w' })` directly (already equal to 7 days) rather than re-deriving a day count, guarded by a runtime equality check against `MUSCLE_MAP_WINDOW_DAYS['1w']` from `@fitness/analytics-engine` so the two constants cannot silently drift apart.
- BodyweightTrendWidget bypasses `resolveDisplayUnit`/`fromCanonicalValue` and calls `formatWeight` directly — bodyweight's canonical unit is always kg, so the general 15-kind conversion boundary is unnecessary machinery here.
- RecentRecordsWidget reads across all four `PR_TYPES` via `Promise.all` (4 bounded batched queries) rather than reusing `loadRecordsPage`, which is single-metric and does not fit a cross-metric feed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added a load-bearing drift guard between MuscleHeatmapWidget's window constant and analytics-engine's own window-day mapping**
- **Found during:** Task 4
- **Issue:** `MUSCLE_HEATMAP_WIDGET_WINDOW_DAYS = 7` (R32) was declared as a standalone literal with only a prose comment asserting its equivalence to `loadMuscleMapWindow`'s hardcoded `'1w'` window — nothing in code would catch the two silently diverging if `PROGRESS_WINDOW_DAYS` ever changed.
- **Fix:** Imported `MUSCLE_MAP_WINDOW_DAYS` from `@fitness/analytics-engine` and added a module-level equality assertion that throws at import time if the two values disagree.
- **Files modified:** `apps/mobile/components/MuscleHeatmapWidget.tsx`
- **Verification:** `pnpm --filter mobile typecheck` and the full mobile test suite (2253 tests) still pass; the assertion is exercised on every test-file import of the module.
- **Committed in:** `2c7e45d` (Task 4 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** The fix strengthens R32's intent (a named constant, not a numeral) into an enforced invariant rather than a documented one. No scope creep.

## Issues Encountered
- A stray native Homebrew Postgres process was also listening on `127.0.0.1:5432` alongside the Docker Postgres container, which briefly made a direct `docker exec ... psql` query against the container appear to show zero tables. Diagnosed via `lsof -nP -iTCP:5432 -sTCP:LISTEN` and resolved by connecting directly to `127.0.0.1:5432` (the address the API's `DATABASE_URL` actually points at), where `dashboard_widget` was confirmed present with all expected columns, indexes, FK and PowerSync publication membership. No code change required — this was purely an environment-diagnosis detour for Task 3's acceptance criterion.
- An `Edit` tool string-match failure on `packages/api-contracts/src/sync.ts` (likely a Unicode em-dash rendering difference) was worked around with a small `python3` UTF-8 string-replace script rather than retrying the same edit.

## User Setup Required

None - no external service configuration required. The PowerSync Service restart needed for `dashboard_widget`'s new sync-rules query to take effect, and cross-device confirmation of the row arriving on a second device, are both routed to ROADMAP Phase 999.1 (WINDOWS entry filed), matching the 04-02 and 11-02 precedent recorded in `12-05-PLAN.md`'s `<planner_assumptions>`.

## Known Stubs

None. `RecentRecordsWidget`, `MuscleHeatmapWidget` and `BodyweightTrendWidget` all render nothing (not a placeholder) when their underlying query has no data, matching each surface's existing empty-state contract from Phases 9/10/12-04.

## Next Phase Readiness
- `DashboardWidgetHost`'s dispatch table, `resolveDashboardWidgets`, and the `dashboard_widget` table/vocabulary are all in place for 12-06 (widget settings), 12-07 (`DashboardWidgetPicker`, which mounts on the `pickerOpen` boolean this plan already wired), and 12-08 (`QuickActionSheet`, which mounts on `quickActionsOpen`).
- The PowerSync Service restart and cross-device arrival of `dashboard_widget` rows remain unverified in this environment; both are recorded in ROADMAP Phase 999.1 and the WINDOWS ledger for the final native/cross-device sweep.

## Self-Check: PASSED

Verified all created files exist and all referenced commits are present in `git log`:
- `apps/mobile/lib/db/dashboard-widgets.ts` — FOUND
- `apps/mobile/components/DashboardWidgetHost.tsx` — FOUND
- `apps/mobile/components/NextUpWidget.tsx` — FOUND
- `apps/mobile/components/RecentRecordsWidget.tsx` — FOUND
- `apps/mobile/components/MuscleHeatmapWidget.tsx` — FOUND
- `apps/mobile/components/BodyweightTrendWidget.tsx` — FOUND
- `apps/api/test/dashboard-widget.e2e-spec.ts` — FOUND
- `9ae2883` — FOUND in `git log --oneline --all`
- `9519d38` — FOUND in `git log --oneline --all`
- `2c7e45d` — FOUND in `git log --oneline --all`

---
*Phase: 12-body-metrics-dashboard*
*Completed: 2026-08-31*
