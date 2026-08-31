---
phase: 12-body-metrics-dashboard
plan: 07
subsystem: ui
tags: [react-native, expo-router, powersync, drizzle, playwright]

# Dependency graph
requires:
  - phase: 12-body-metrics-dashboard
    provides: 12-05 dashboard_widget table, DashboardWidgetHost dispatch, six-widget catalog, restructured Home tab
affects: [12-08]

# Actuals (#2632)
actuals:
  tokens: 15943
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "moveWidget shares computeReorder/order-index.ts with moveDay/moveExercise (D-25) — a fourth data type reusing the one sparse-integer gap/renumber algorithm rather than a new copy"
    - "A select-level column alias (position AS orderIndex) is never relied on when a caller needs computeReorder's SiblingRow shape — the rename happens as a plain .map() after the read, matching sortRows's own established idiom in this same file"
    - "A file that needs a data-layer function importing programs/days.ts (for computeReorder) must jest.mock('../powersync') — that import chain reaches getPowerSync's real @powersync/react-native module, which Jest cannot parse (WINDOWS #22/#33)"

key-files:
  created:
    - apps/mobile/components/DashboardWidgetPicker.tsx
    - apps/mobile/components/__tests__/DashboardWidgetPicker.test.tsx
    - apps/mobile/e2e/dashboard-widgets.spec.ts
  modified:
    - apps/mobile/lib/db/dashboard-widgets.ts
    - apps/mobile/lib/db/__tests__/dashboard-widgets.test.ts
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/app/(tabs)/index.tsx
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/playwright.config.ts

key-decisions:
  - "moveWidget scopes both the sibling read and every write by userId, not just row id — a widget id the user does not own resolves to no sibling and writes nothing (T-12-29), matching moveDay's own per-row scoping"
  - "dashboard_widget's position column is aliased to computeReorder's expected orderIndex shape via a plain post-read .map(), never a select-level column alias — the fake test db (and, by the same reasoning, any db wrapper that doesn't respect select-level renaming) returns the row's real field names regardless of the requested projection"

requirements-completed: [DASH-02]

coverage:
  - id: D1
    description: "A user can remove a widget from the dashboard through a real DashboardWidgetPicker, in a real browser against a real @powersync/web database; removing the last widget lands on the empty state rather than re-materializing defaults"
    requirement: "DASH-02"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/dashboard-widgets.spec.ts — 4 cases (materialize defaults, list+remove availability, single remove survives Done, remove-everything empty state)"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/dashboard-widgets.test.ts — removeWidget (2 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A user can add a widget through the picker; adding an already-enabled kind is a no-op, an out-of-vocabulary kind writes nothing, and both picker empty states (no widgets enabled / everything enabled) render per UI-SPEC S2"
    requirement: "DASH-02"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/dashboard-widgets.spec.ts — 'adding Recent Records inserts exactly one row...and a second tap is a no-op'"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/dashboard-widgets.test.ts — addWidget/resolveAvailableWidgetKinds (6 cases); apps/mobile/components/__tests__/DashboardWidgetPicker.test.tsx — both empty states, onAdd wiring, no numberOfLines (5 cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A user can drag-reorder widgets via the shipped DragHandle; moveWidget writes the minimum rows the sparse-integer scheme allows (one midpoint write, or a selective renumber writing only changed rows), and a widget id the user does not own writes nothing (T-12-29)"
    requirement: "DASH-02"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/dashboard-widgets.spec.ts — 'dragging Weekly Progress above Next Up commits the new order, and Home re-renders in the dragged-to order' (a real Chromium pointer drag)"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/dashboard-widgets.test.ts — moveWidget (6 cases: one-row midpoint, selective renumber, head-move stays positive, reads back in dragged-to order, LWW-tie stable order, foreign widget id writes nothing); apps/mobile/components/__tests__/DashboardWidgetPicker.test.tsx — DragHandle onReorder wiring"
        status: pass
    human_judgment: false
  - id: D4
    description: "Two devices reordering the dashboard offline converge without losing a widget (T-12-32/D-21) — asserted structurally by the row-per-widget table shape, not by a runnable two-device test"
    requirement: "DASH-02"
    verification: []
    human_judgment: true
    rationale: "Two live, syncing devices are unavailable in this environment (standing constraint, planner_assumptions #1). Routed to ROADMAP Phase 999.1 alongside the native drag-gesture item, since DragHandle.tsx's real (non-web) gesture path is also unverified here."
duration: ~49min (includes a mid-plan session interruption; see Issues Encountered)
completed: 2026-08-31
status: complete
---

# Phase 12 Plan 07: Dashboard Widget Picker Summary

**Add, remove and drag-reorder dashboard widgets through one `DashboardWidgetPicker`, backed by `addWidget`/`removeWidget`/`moveWidget` on the shipped sparse-integer order-index arithmetic, proven end to end in a real browser against a real `@powersync/web` database**

## Performance

- **Duration:** ~49 min total (12:40–13:29), including a genuine mid-plan session interruption between the tracer/RED-for-Task2 commits and the rest of the work — see Issues Encountered
- **Started:** 2026-08-31T12:40:31+03:00 (first task commit)
- **Completed:** 2026-08-31T13:29:21+03:00
- **Tasks:** 3 (1 tracer, 2 TDD)
- **Files modified:** 9

## Accomplishments
- `DashboardWidgetPicker` — a modal sheet reusing `ReorderExercisesSheet`'s exact anatomy — lets a user remove a widget, add one from the six-kind catalog, or drag-reorder the enabled set, all committing immediately per row action with no separate save
- `addWidget`/`removeWidget`/`moveWidget` in `dashboard-widgets.ts`: idempotent add/remove (exclusions.ts's read-then-insert precedent), and a reorder that shares `computeReorder`/`order-index.ts` with `moveDay`/`moveExercise` (D-25) rather than a fourth copy of the gap/renumber algorithm
- Both `DashboardWidgetPicker` empty states render per UI-SPEC S2: "No widgets added yet." with the full add list beneath it when nothing is enabled, and the entire "Add a Widget" section absent when every kind already is
- `moveWidget` scopes every read and write by `userId` as well as row id (T-12-29) — a widget id the user does not own resolves to no sibling and writes nothing
- A 6-case real-browser Playwright spec proves materialize/list/remove/remove-to-empty/add/drag against a real `@powersync/web` database, including one genuine pointer-driven drag through `DragHandle.web.tsx`'s capture contract

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "remove a widget from my dashboard"** (tracer) — `becd30e` (feat)
2. **Task 2: Adding a widget, and both picker empty states** (TDD) — `275baf3` (test, RED) then `ef2c3af` (feat, GREEN)
3. **Task 3: Reordering through the shipped drag primitive and order-index arithmetic** (TDD) — `d42bb3f` (test, RED) then `a3fd748` (feat, GREEN)

**Plan metadata:** pending (this commit)

_Note: Task 1 (tracer) is a single real-implementation commit per its own contract — see `<execution_flow>`'s tracer handling, not a RED/GREEN pair. Tasks 2 and 3 each have two commits (test → feat); neither needed a refactor commit._

## TDD Gate Compliance

Both TDD tasks carry a verified RED-then-GREEN sequence in git log:
- Task 2: `275baf3` (test) precedes `ef2c3af` (feat) — RED confirmed failing (5 cases) before GREEN, then 27 passing after.
- Task 3: `d42bb3f` (test) precedes `a3fd748` (feat) — RED confirmed failing (5 cases, `moveWidget is not a function`) before GREEN, then 34 passing after.

No gate violations.

## Files Created/Modified
- `apps/mobile/components/DashboardWidgetPicker.tsx` — `DashboardWidgetPickerView` (hook-free) + `DashboardWidgetPicker` (stateful wrapper): Your Widgets / Add a Widget sections, DragHandle wiring, Done-only dismissal
- `apps/mobile/components/__tests__/DashboardWidgetPicker.test.tsx` — both empty states, onAdd/DragHandle onReorder wiring, no `numberOfLines`
- `apps/mobile/e2e/dashboard-widgets.spec.ts` — 6 real-browser cases: materialize, list, single remove, remove-to-empty, add (with idempotency), and a real drag
- `apps/mobile/lib/db/dashboard-widgets.ts` — `addWidget`, `removeWidget`, `moveWidget`, `resolveAvailableWidgetKinds`, `loadDashboardWidgets`
- `apps/mobile/lib/db/__tests__/dashboard-widgets.test.ts` — 19 cases across `loadOrMaterializeDashboardWidgets`/`removeWidget`/`addWidget`/`resolveAvailableWidgetKinds`/`moveWidget`
- `apps/mobile/lib/db/test-support.ts` — `seedDashboardWidgets`, `readDashboardWidgetsRaw` (append-only, shared e2e seam)
- `apps/mobile/app/(tabs)/index.tsx` — mounts `DashboardWidgetPicker` on the `pickerOpen` flag 12-05 already held, reloads widgets on close
- `apps/mobile/app/__durability.web.tsx` — `dashboardWidgetsHarness` mount + window methods (append-only, shared e2e seam)
- `apps/mobile/playwright.config.ts` — `'dashboard-widgets.spec.ts'` appended to the `durability` project's `testMatch` (append-only, shared e2e seam)

## Decisions Made

See "Key Decisions" in frontmatter for the two load-bearing ones (T-12-29 ownership scoping on both the read and every write; the position→orderIndex rename as a plain post-read map rather than a select-level alias). Additional in-flight decision:

- Kept `DragHandle`'s props unrenamed (`exerciseName`, `exerciseId`) per the plan's own optional-cleanup framing — the component's label/gesture logic is already generic, and a rename touching every existing call site was out of this plan's scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `moveWidget`'s sibling read cannot rely on a select-level column alias to satisfy `computeReorder`'s `orderIndex` shape**
- **Found during:** Task 3, first GREEN run against the fake test db
- **Issue:** `dashboard_widget`'s column is `position`, not `order_index` (unlike `routine_day`/`routine_exercise`, which genuinely have an `orderIndex` column `moveDay`/`moveExercise` select directly). The first implementation used `.select({ id, orderIndex: dashboardWidget.position })`, aliasing at the select call — the fake test db's mock `select()` ignores the requested projection and returns the row's real field names, so `orderIndex` came back `undefined`, and `computeReorder` silently fell through to its "both anchors unknown" branch (`ORDER_INDEX_GAP`, 1024) instead of the real midpoint.
- **Fix:** Select the row's real field name (`position`) and rename to `orderIndex` via a plain post-read `.map()`, matching this same file's own `sortRows` precedent (`rows.map((row) => ({ ...row, orderIndex: row.position }))`) instead of leaning on a select-level alias.
- **Files modified:** `apps/mobile/lib/db/dashboard-widgets.ts`
- **Verification:** `pnpm --filter mobile test -- dashboard-widgets` — the "writes exactly one row" and "renumber writes only changed rows" cases now assert the correct midpoint/renumbered positions.
- **Committed in:** `a3fd748` (Task 3 GREEN commit)

**2. [Rule 3 - Blocking] `moveWidget`'s import of `computeReorder` transitively pulled in `getPowerSync`'s real, Jest-unparseable module chain**
- **Found during:** Task 3, first RED→GREEN test run
- **Issue:** `programs/days.ts` (home of `computeReorder`) imports `getPowerSync` from `../powersync` at module scope for its own default-arg call sites. `dashboard-widgets.ts` previously never had a real runtime import into that chain (its own `WriteDb` import was type-only), so `dashboard-widgets.test.ts` had never needed to mock `../powersync`. Importing `computeReorder` made that import eager, and Jest failed to parse `@powersync/shared-internals`'s ESM dist (documented WINDOWS #22/#33) — the whole suite failed to run, not just the new cases.
- **Fix:** Added `jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }))` to `dashboard-widgets.test.ts`, mirroring `programs.test.ts`'s own existing mock for the identical transitive import.
- **Files modified:** `apps/mobile/lib/db/__tests__/dashboard-widgets.test.ts`
- **Verification:** `pnpm --filter mobile test -- dashboard-widgets` parses and runs again; full suite green.
- **Committed in:** `a3fd748` (Task 3 GREEN commit)

**3. [Rule 1 - Bug] The Task 2 e2e "add a widget" case read row counts before the default widget set had materialized**
- **Found during:** resuming a session-interrupted run, before Task 2's GREEN commit landed
- **Issue:** The prior (cut-off) agent's new e2e case clicked "Edit Dashboard" and immediately read `readDashboardWidgets()`/clicked "Add Recent Records to dashboard" without waiting for the async default-set materialization (`loadOrMaterializeDashboardWidgets`) to land — a race this same spec file's other cases already avoid by waiting for a "Remove ... from dashboard" control first.
- **Fix:** Added the identical wait (`Remove Next Up from dashboard` visible) before reading the "before" row count, matching this file's own established precedent.
- **Files modified:** `apps/mobile/e2e/dashboard-widgets.spec.ts`
- **Verification:** `pnpm exec playwright test --project=durability e2e/dashboard-widgets.spec.ts` — 5/5 then 6/6 passing across multiple clean runs.
- **Committed in:** `ef2c3af` (Task 2 GREEN commit)

**4. [Rule 1 - Bug] The new Task 3 drag e2e case read Home's post-drag render before `onClosePicker`'s own async reload had finished**
- **Found during:** Task 3, first e2e run of the new drag case
- **Issue:** Clicking "Done" dismisses the picker modal synchronously, but `onClosePicker`'s own `loadWidgets()` (a fresh `loadOrMaterializeDashboardWidgets` read + `setWidgets`) is a separate async operation — reading the two widget cards' Y positions immediately after the click race that reload, exactly the gap `reorder-exercises.spec.ts`'s own `closeReorderSheet` comment documents for the identical pattern.
- **Fix:** Wrapped the Y-position comparison in `expect.poll(...)` instead of a single read, so the assertion waits out the reload rather than asserting against a still-stale render.
- **Files modified:** `apps/mobile/e2e/dashboard-widgets.spec.ts`
- **Verification:** Confirmed failing once (`Expected: < 137, Received: 289`) against the un-polled version, then passing cleanly after the fix.
- **Committed in:** `a3fd748` (Task 3 GREEN commit)

---

**Total deviations:** 4 auto-fixed (2 bugs, 1 blocking, 1 bug found while verifying a prior agent's uncommitted work)
**Impact on plan:** All four fixes were necessary for the plan's own acceptance criteria (correct midpoint/renumber positions, a parseable test suite, non-racy e2e assertions). No scope creep — nothing outside `dashboard-widgets.ts`/`DashboardWidgetPicker.tsx`/their tests/the e2e spec was touched.

## Issues Encountered

A previous executor run on this plan was cut off mid-task by a session rate limit, having landed the tracer (`becd30e`) and Task 2's RED tests (`275baf3`) but leaving Task 2's GREEN implementation uncommitted in the working tree. This run inspected that uncommitted work against `12-07-PLAN.md`, verified it was correct and complete (all RED tests passed once the implementation was reviewed and typechecked), fixed the one racy e2e case described in Deviation 3 above, committed it as Task 2's GREEN (`ef2c3af`), and then executed Task 3 from scratch (RED `d42bb3f`, GREEN `a3fd748`).

Separately, a Playwright invocation quirk was discovered while verifying: `pnpm --filter mobile test:e2e -- dashboard-widgets` (the plan's own documented `<verify>` command) does not reliably filter to just this spec file — in two runs during this session it ran the entire `durability` + `sync` project set (29+1 spec files) instead. This is a pre-existing pnpm/Playwright argument-passing behavior, not a defect introduced by this plan; all verification in this SUMMARY instead used the equivalent, reliably-scoped invocation `EXPO_PUBLIC_DURABILITY_HARNESS=1 pnpm exec playwright test --project=durability e2e/dashboard-widgets.spec.ts`, run from `apps/mobile` (the `EXPO_PUBLIC_DURABILITY_HARNESS=1` prefix is required when bypassing the `test:e2e` npm script directly — its absence silently makes the durability harness a no-op, since `DURABILITY_HARNESS_GLOBAL` is itself an env-gated constant).

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. Every add/remove/reorder path is wired to a real write against `dashboard_widget`, proven both by unit tests against a real in-memory condition-matching fake and by a real browser against a real `@powersync/web` database.

## Threat Flags

None beyond what `12-07-PLAN.md`'s own threat model already registers (T-12-29, T-12-30, T-12-31, T-12-32) — all four are mitigated or accepted as documented, and no new surface was introduced.

## Next Phase Readiness
- `DashboardWidgetPicker` and `addWidget`/`removeWidget`/`moveWidget` are complete and proven end to end; 12-08 (the quick-action sheet) mounts on the sibling `quickActionsOpen` flag `12-05`/`12-07` already hold and does not depend on anything new from this plan.
- Two deferred verification items were filed to ROADMAP Phase 999.1: the native (non-web) `DragHandle.tsx` drag gesture path (never compiled/rendered on this machine), and the two-device concurrent-reorder convergence claim (T-12-32/D-21), which is asserted structurally here but never exercised against two live, syncing devices.

## Self-Check: PASSED

Verified all created files exist and all referenced commits are present in `git log`:
- `apps/mobile/components/DashboardWidgetPicker.tsx` — FOUND
- `apps/mobile/components/__tests__/DashboardWidgetPicker.test.tsx` — FOUND
- `apps/mobile/e2e/dashboard-widgets.spec.ts` — FOUND
- `becd30e` — FOUND in `git log --oneline --all`
- `275baf3` — FOUND in `git log --oneline --all`
- `ef2c3af` — FOUND in `git log --oneline --all`
- `d42bb3f` — FOUND in `git log --oneline --all`
- `a3fd748` — FOUND in `git log --oneline --all`

---
*Phase: 12-body-metrics-dashboard*
*Completed: 2026-08-31*
