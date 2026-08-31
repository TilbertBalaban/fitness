---
phase: 12-body-metrics-dashboard
plan: 08
subsystem: ui
tags: [react-native, expo-router, powersync, drizzle, sync]

# Dependency graph
requires:
  - phase: 12-body-metrics-dashboard
    provides: 12-02 MetricEntrySheet/body-metrics.ts, 12-03 PhotoCaptureConfirmSheet/capture pipeline, 12-05 Home dashboard header (quickActionsOpen flag), 12-07 DashboardWidgetPicker
provides:
  - QuickActionSheet — one fixed six-row sheet reaching quick weigh-in, quick measurement, progress photo, history, new program and one-off workout, opened from the Home header
  - resolveQuickAction/dispatchQuickAction — the pure dispatch pair that makes R30's dismiss-before-navigate ordering a tested guarantee, not a convention
  - Inline quick weigh-in: MetricEntrySheet mounted over Home, pre-selected to bodyweight, pre-filled with the last recorded value, committing with no route change
  - Two new Profile settings rows (Body Metrics, Progress Photos)
  - A route parameter (workout.tsx `openOneOff=1`) that opens the existing one-off picker without duplicating it
  - The falsifiable PUSH_DEFERRED_TABLES-is-empty milestone assertion in packages/api-contracts
affects: []

# Actuals (#2632)
actuals:
  tokens: 11041
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Dispatch-then-render split for a quick-action sheet: resolveQuickAction (pure, id -> navigate/in-place descriptor) and dispatchQuickAction (pure, calls dismiss unconditionally before either branch) are both exported and unit-testable without a renderer, matching readInProgressSession/deriveDashboardState's own extraction shape in index.tsx"
    - "A route param read once via lazy useState initializer (`useState(() => flag ?? false)`), not an effect + ref, is this codebase's idiom for 'open this existing sheet once on mount from a route param' — see workout.tsx's oneOffPickerOpen"
    - "A harness-side spy on the real imperative router.push (readPushedRoutes in __durability.web.tsx), appended once at module scope, is the fallback proof technique when a real-browser e2e case's destination is a Stack.Protected route this unauthenticated harness structurally cannot cross"

key-files:
  created:
    - apps/mobile/components/QuickActionSheet.tsx
    - apps/mobile/components/__tests__/QuickActionSheet.test.tsx
    - apps/mobile/app/__tests__/quick-actions.test.ts
    - apps/mobile/e2e/quick-action.spec.ts
  modified:
    - apps/mobile/app/(tabs)/index.tsx
    - apps/mobile/app/(tabs)/profile.tsx
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/playwright.config.ts
    - packages/api-contracts/src/__tests__/sync.test.ts
    - apps/mobile/lib/db/__tests__/body-metrics.test.ts

key-decisions:
  - "QuickActionSheet carries no per-row destructive flag at all (unlike SESSION_EXERCISE_ACTIONS/HISTORY_ROW_ACTIONS) — none of the six rows is a destructive action, so the type shape itself makes that structurally true rather than asserted"
  - "dispatchQuickAction is the single place that calls handlers.dismiss() unconditionally, before branching on navigate vs. in-place — R30's ordering guarantee is a property of one function, not a discipline every call site has to remember"
  - "Quick Measurement's tracked-kind set is loaded lazily right before the sheet opens (matching body-metrics.tsx's own reload-then-open shape) rather than kept live on Home's every focus"
  - "Profile's two new rows are placed after Gym Profiles, not before Appearance as 12-UI-SPEC's S5/S8 entry-point line states verbatim — Appearance already renders above Gym Profiles in the shipped file, so literally satisfying 'before Appearance' would mean reordering existing content, which the same instruction's own 'change nothing else in that file' forbids. After Gym Profiles (the satisfiable half, and the one that groups the two rows with the other manage-your-data entries) is what shipped"
  - "The History quick action's e2e proof reads back the app's own router.push call via a harness spy instead of asserting page.url() changed — router.push('/(tabs)/history') is a genuine, verified no-op when this harness's session is unauthenticated (root-stack.tsx's Stack.Protected guard excludes the whole (tabs) group), and the durability project has no live auth backend to sign into by design (playwright.config.ts's own 'no PowerSync Service, no API, no Postgres' contract)"

patterns-established:
  - "Quick-action dispatch pair (resolveQuickAction + dispatchQuickAction), reused by any future sheet that needs a testable dismiss-then-navigate/act ordering"

requirements-completed: [DASH-03]

coverage:
  - id: D1
    description: "One quick-action sheet, opened from the Home header, lists all six destinations in the specified fixed order, never hidden or reordered"
    requirement: DASH-03
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/QuickActionSheet.test.tsx#QUICK_ACTIONS (D-27/D-28) > lists the six rows in the specified fixed order, with no destructive flag"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/quick-action.spec.ts#opening Quick Actions from the Home header lists all six rows, in the specified order"
        status: pass
    human_judgment: false
  - id: D2
    description: "Quick Weigh-In writes a body_metric row from inside the sheet, pre-filled with the last recorded value, fully editable, committing with no route change"
    requirement: DASH-03
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/quick-action.spec.ts#tapping Quick Weigh-In opens the entry sheet pre-filled with the seeded last bodyweight value"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/quick-action.spec.ts#editing the pre-filled value and confirming writes exactly one new row with the page URL unchanged (D-29, R31)"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/body-metrics.test.ts#loadLatestMetric > returns the most recent of several entries logged across several days for the quick weigh-in pre-fill (D-29)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every pure-navigation destination (history, new program, one-off workout) dismisses the sheet before navigating, never with the sheet still mounted underneath (R30)"
    requirement: DASH-03
    verification:
      - kind: unit
        ref: "apps/mobile/app/__tests__/quick-actions.test.ts#dispatchQuickAction — pure-navigation rows dismiss before navigating (R30)"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/quick-action.spec.ts#tapping History dismisses the sheet before navigating, and requests the real history route (R30)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The one-off workout row reaches workout.tsx's existing empty-session start path through a route parameter, without duplicating handleStartOneOff/startOneOffSession"
    requirement: DASH-03
    verification:
      - kind: unit
        ref: "apps/mobile/app/__tests__/quick-actions.test.ts#dispatchQuickAction — pure-navigation rows dismiss before navigating (R30) > dismisses before navigating for one_off_workout"
        status: pass
    human_judgment: true
    rationale: "The route param's effect on workout.tsx (opening ExercisePickerModal via the existing oneOffPickerOpen state) is proven at the unit level (the correct route string is requested) and by workout.tsx's own existing one-off-picker test coverage, but no test in this plan exercises the full route-param -> picker-open chain in a mounted WorkoutScreen; ROADMAP Phase 999.1/999.2 owns native/UI confirmation."
  - id: D5
    description: "Profile gains Body Metrics and Progress Photos rows, placed after Gym Profiles; no tab is added, removed or reordered"
    requirement: DASH-03
    verification:
      - kind: other
        ref: "grep -c 'Body Metrics' apps/mobile/app/(tabs)/profile.tsx == 1; grep -c 'Progress Photos' apps/mobile/app/(tabs)/profile.tsx == 1; git diff --name-only does not list apps/mobile/app/(tabs)/_layout.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "PUSH_DEFERRED_TABLES is empty and the emptiness is asserted by a falsifiable test — every table SYNCED_TABLES names now has a push apply path in PUSH_APPLIED_TABLES"
    requirement: DASH-03
    verification:
      - kind: unit
        ref: "packages/api-contracts/src/__tests__/sync.test.ts#PUSH_DEFERRED_TABLES is empty — every synced table has a push apply path (12-08)"
        status: pass
    human_judgment: false

duration: 53min
completed: 2026-08-31
status: complete
---

# Phase 12 Plan 08: Quick Actions Summary

**One `QuickActionSheet` reaching six destinations from the Home header, a two-tap inline quick weigh-in via `dispatchQuickAction`'s tested dismiss-before-navigate ordering, and the falsifiable `PUSH_DEFERRED_TABLES`-is-empty milestone test.**

## Performance

- **Duration:** 53 min (task commits) + wrap-up
- **Started:** 2026-08-31T10:33:00Z
- **Completed:** 2026-08-31T11:39:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- `QuickActionSheet` — a fixed six-row `SessionActionSheet`-shaped modal (`QUICK_ACTIONS`), opened from Home's existing "Quick Actions" header control, exactly one state, no row ever hidden or disabled
- `resolveQuickAction`/`dispatchQuickAction` — the pure dispatch pair that classifies each of the six ids as pure-navigation or in-place and calls `dismiss()` unconditionally before acting, making R30's ordering a property of one function rather than six call-site disciplines
- Quick Weigh-In: `MetricEntrySheet` mounted over Home pre-selected to `bodyweight`, pre-filled from `loadLatestMetric`, fully editable via the keypad, committing `logMetric` with no navigation — proven in a real browser (D-29, R31)
- Quick Measurement opens the same sheet's kind picker (tracked kinds loaded lazily); Progress Photo opens `capturePhoto()` -> `downscalePhoto()` -> `PhotoCaptureConfirmSheet` directly, the same pipeline `progress-photos.tsx` already ships
- `workout.tsx` reads a new `openOneOff=1` route param once, via a lazy `useState` initializer, to open its own existing one-off picker — no duplicated picker or session-start logic (23 insertions / 6 deletions, well under the plan's 30-line ceiling)
- Profile gained `Body Metrics` and `Progress Photos` rows after Gym Profiles; the five-tab shell (`_layout.tsx`) is untouched
- `packages/api-contracts/src/__tests__/sync.test.ts` asserts `PUSH_DEFERRED_TABLES` has length zero and that `SYNCED_TABLES`/`PUSH_APPLIED_TABLES` are mutually containing, iterating both tuples rather than hard-coding a second copy — the project's stated milestone is now falsifiable, not merely observed

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "quick weigh-in"** — `61dbc2c` (feat) — `QuickActionSheet.tsx`, Home mounting, `quick-action.spec.ts` (3 real-browser cases)
2. **Task 2 RED: failing cases for the remaining five destinations** — `77ded6e` (test)
3. **Task 2 GREEN: wire the remaining five actions and the two Profile rows** — `7b877e7` (feat) — `resolveQuickAction`/`dispatchQuickAction`, `workout.tsx` route param, `profile.tsx` rows, `__durability.web.tsx` router.push spy, extended `quick-action.spec.ts`
4. **Task 3: assert the milestone** — `d7454b2` (test) — sync-tuple assertions, `loadLatestMetric` several-days case; no functional change (the tuples were already correct as of 12-05)

_Task 3 carries no separate GREEN/`feat` commit — every assertion it adds was already true (12-05 emptied `PUSH_DEFERRED_TABLES` and updated its own header comment); this task turns that already-shipped state into a suite that goes red if a future phase regresses it. See "TDD Gate Compliance" below._

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/mobile/components/QuickActionSheet.tsx` — `QUICK_ACTIONS`, `QuickActionSheetView`, `QuickActionSheet`, `resolveQuickAction`
- `apps/mobile/components/__tests__/QuickActionSheet.test.tsx` — row order/no-destructive/no-numberOfLines/glyph-colour/select coverage
- `apps/mobile/app/__tests__/quick-actions.test.ts` — `dispatchQuickAction` call-order coverage
- `apps/mobile/e2e/quick-action.spec.ts` — 4 real-browser cases against `__durability.web.tsx`'s `mountDashboard()`
- `apps/mobile/app/(tabs)/index.tsx` — `dispatchQuickAction`/`QuickActionHandlers`, `HomeDashboardView` gains quick-action/metric-entry/photo-capture props, `HomeScreen` owns the new state and handlers
- `apps/mobile/app/(tabs)/profile.tsx` — `DataRow`, two new settings rows
- `apps/mobile/app/(tabs)/workout.tsx` — `openOneOffPicker` option threaded through `useWorkoutScreen`/`LiveWorkoutRoute`/`WorkoutScreen`
- `apps/mobile/app/__durability.web.tsx` — `readPushedRoutes()` router.push spy (append-only)
- `apps/mobile/playwright.config.ts` — `quick-action.spec.ts` appended to the `durability` project's `testMatch`
- `packages/api-contracts/src/__tests__/sync.test.ts` — the milestone assertion block
- `apps/mobile/lib/db/__tests__/body-metrics.test.ts` — `loadLatestMetric` several-entries-across-several-days case

## Decisions Made

See `key-decisions` in the frontmatter above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] The plan's own `pnpm --filter mobile test:e2e -- quick-action` verification command runs the FULL suite, not just the named file**
- **Found during:** Task 1 verification
- **Issue:** `pnpm test:e2e -- <substring>` forwards a literal `--` token ahead of the substring into `playwright test`'s own argv (`playwright test -- quick-action`), which Playwright's CLI does not treat as a file filter — it silently runs every spec in every project instead, including the `sync` project (which needs a live API/PowerSync/Postgres stack this environment does not run). This is a pre-existing pnpm/Playwright interaction, not introduced by this plan, and reproducible against the pre-12-08 tree.
- **Fix:** Verified with the equivalent, unambiguous invocation instead — `npx playwright test --project=durability e2e/quick-action.spec.ts` (and, separately, `npx playwright test quick-action --list` to confirm substring filtering works correctly at the Playwright layer itself, just not through this particular pnpm passthrough). All 4 cases pass. The full `durability` project (all 116 specs, including every spec from prior phases) was also run in full and is green — two specs (`exercise-performance.spec.ts`, `history-trend.spec.ts`) failed once under the ~8-minute single-worker serialized run and passed cleanly in isolation immediately after, consistent with transient server-warm-up flakiness under sustained load rather than a regression.
- **Files modified:** none (verification-only; no source or config change was needed or made)
- **Verification:** `npx playwright test --project=durability e2e/quick-action.spec.ts` — 4/4 pass; full `durability` project — 116/116 pass (2 confirmed-flaky, both green on immediate rerun)
- **Committed in:** N/A (no code change — documented here per the deviation rule's own record-keeping requirement)

**2. [Rule 4-adjacent, resolved without an architectural change — see key-decisions] Profile row placement conflicts with 12-UI-SPEC's literal "before Appearance" instruction**
- **Found during:** Task 2
- **Issue:** 12-UI-SPEC's "Navigation & Placement" section says the two new rows go "after Gym Profiles, before Appearance," but the shipped `profile.tsx` already renders `AppearanceControl` above the Gyms section — the two anchors are mutually exclusive without reordering existing content, which the same instruction (and the plan's own "change nothing else in that file") forbids.
- **Resolution:** Placed the two rows after Gym Profiles only (the satisfiable half, and the one consistent with "grouped with the other manage-your-data entries"). No reordering of existing rows.
- **Files modified:** `apps/mobile/app/(tabs)/profile.tsx`
- **Verification:** `grep -c` counts (1/1) confirmed in `<verify>`; existing Profile tests (7 suites, 118 tests) all pass unchanged
- **Committed in:** `7b877e7`

---

**Total deviations:** 2 (1 verification-only environment note, 1 spec-conflict resolution documented above and in key-decisions).
**Impact on plan:** No scope creep. No source behavior differs from what the plan asked for; both items are documentation of judgment calls made where the plan's own instructions were internally inconsistent with the pre-existing codebase or with the test-runner environment.

## TDD Gate Compliance

Task 2 (`tdd="true"`) followed the full RED (`77ded6e`) → GREEN (`7b877e7`) sequence; RED genuinely failed (6/6 `resolveQuickAction` cases and all 7 `dispatchQuickAction` cases threw `is not a function` before the implementation existed).

Task 3 (`tdd="true"`) has no GREEN/`feat` commit. Its four new assertions in `sync.test.ts` (`PUSH_DEFERRED_TABLES` length zero, mutual tuple containment, shared last member) all passed on first run — 12-05 had already emptied `PUSH_DEFERRED_TABLES` and updated its header comment (verified by reading `packages/api-contracts/src/sync.ts` before writing any test). This is a characterization/milestone test for already-shipped, already-correct behavior, not a behavior-adding task — the plan's own `<action>` text for Task 3 says explicitly "make no functional change to the tuples themselves in this task." Treated as a legitimate single-commit test-only task rather than forcing an artificial RED.

## Issues Encountered

**History quick action's e2e proof cannot assert a real URL change.** `router.push('/(tabs)/history')` is a genuine no-op when fired from this harness's unauthenticated session — `root-stack.tsx`'s `Stack.Protected guard={signedIn}` excludes the entire `(tabs)` group from the navigator's route table, and the `durability` Playwright project has no live auth backend to sign into by design (`playwright.config.ts`'s own "no PowerSync Service, no API, no Postgres" contract for that project). Confirmed empirically: `page.goto('/history')` (a full reload) correctly redirects to `/sign-in`, but `router.push('/(tabs)/history')` from within the mounted harness leaves the URL unchanged even after a 3-second wait. Resolved by adding a minimal, append-only `router.push` spy to `__durability.web.tsx` (`readPushedRoutes()`) that observes the real production call without replacing or stubbing any app behavior — the e2e case still drives `QuickActionSheet` → `dispatchQuickAction` through a real DOM click and proves both the dismiss-before-navigate ordering (Cancel row gone) and the exact route requested (`/(tabs)/history`).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Phase 12 (Body Metrics & Dashboard) is now fully executed: all 8 plans complete, `PUSH_DEFERRED_TABLES` is empty and falsifiably asserted, and the Home header reaches every DASH-03 destination. No blockers for phase close.

Deferred to ROADMAP Phase 999.1/999.2 (standing project policy, not new to this plan): native (iOS/Android) verification of every surface this phase shipped, and a subjective visual review pass.

---
*Phase: 12-body-metrics-dashboard*
*Completed: 2026-08-31*

## Self-Check: PASSED
All created files verified present on disk; all four task commit hashes (61dbc2c, 77ded6e, 7b877e7, d7454b2) verified in git log.
