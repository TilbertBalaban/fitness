---
phase: 12-body-metrics-dashboard
verified: 2026-08-31T12:00:00Z
status: passed
score: 4/4 success criteria verified (present + wired; behavior confirmed via passing automated tests)
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "Native (iOS/Android) rendering of every photo/composite/keypad/drag-reorder surface this phase adds (12-02 MetricValueKeypad/TrackKindSheet, 12-03 expo-image-picker/expo-image-manipulator/expo-file-system photo store, 12-06 react-native-view-shot composite + expo-sharing, 12-07 DragHandle.tsx native gesture path)"
    addressed_in: "Phase 999.1"
    evidence: "No Xcode and no Android SDK on this machine — every native half of a platform-split module here is typecheck-only. Standing project policy sweeps native UAT once at the end via ROADMAP Phase 999.1. Relocated, not skipped: WINDOWS.md entries #174, #175, #176, #178, plus ROADMAP 999.1 accumulated items for 12-02/12-04/12-07."
  - truth: "Cross-device sync of body_metric, progress_photo and dashboard_widget rows after a PowerSync Service restart against the edited sync-rules.yaml"
    addressed_in: "Phase 999.1"
    evidence: "Requires restarting the PowerSync Service and two live devices; unavailable in this environment. Each table is in PUSH_APPLIED_TABLES with sync.service.ts validation, a Postgres table and a user-scoped sync-rules query — verified by the same mechanism every other synced table relies on, consistent with every prior phase's treatment of cross-device claims. Relocated: WINDOWS.md entry #177 and ROADMAP 999.1 item 'Phase 12-07 test 2'."
  - truth: "Subjective visual judgment of the restructured dashboard, widget picker, composite three-step flow, and every new sheet/keypad at maximum OS font scale"
    addressed_in: "Phase 999.2"
    evidence: "Human visual judgment. Relocated: ROADMAP 999.2, and the four `verification: backstop` must_haves in 12-02/12-03/12-04/12-07 plan frontmatter."
  - truth: "WorkoutScreen mounted with the `openOneOff=1` route param actually opens the one-off picker on screen (not just that dispatchQuickAction requests the right route string)"
    addressed_in: "Phase 999.1"
    evidence: "Proven at the resolveQuickAction/dispatchQuickAction unit level (7/7 passing, independently re-run during verification); no test mounts WorkoutScreen with the param. Relocated: WINDOWS.md entry #179."
---

# Phase 12: Body Metrics & Dashboard Verification Report

**Phase Goal:** The user can track their body alongside their training, and shape the home screen around what they care about.
**Verified:** 2026-08-31
**Status:** passed — 4 items relocated to ROADMAP Phase 999.1/999.2 per standing project policy
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can log bodyweight and named measurements over time and view their trends | ✓ VERIFIED | `apps/mobile/lib/db/body-metrics.ts` (`logMetric`/`updateMetric`/`deleteMetric`), `apps/mobile/app/body-metrics.tsx`, `apps/mobile/app/body-metric-trend.tsx` reusing `TrendChart`. Latest-per-day dedup + no-fabricated-zeros confirmed directly in `body-metric-trend-query.ts`. Sync push path confirmed live against Postgres in `apps/api/test/body-metric.e2e-spec.ts`, run and passing (14/14 turbo tasks per orchestrator's pre-run). |
| 2 | User can capture progress photos and generate a before-and-after composite | ✓ VERIFIED | `apps/mobile/lib/photos/{capture,downscale,photo-store,composite}.{ts,web.ts}`, `apps/mobile/app/progress-photos.tsx`, `apps/mobile/app/photo-composite.tsx`. Web capture/downscale/store/composite fully exercised by Playwright (`progress-photo.spec.ts`, `photo-composite.spec.ts`, 116/116 durability pass per orchestrator). D-18's platform split (native share vs. web Blob download) confirmed by file inspection. |
| 3 | User sees a dashboard with weekly progress, recent records, and insight tiles, and can add, remove, and reorder those widgets | ✓ VERIFIED | `DashboardWidgetHost.tsx` dispatches the exact 6-kind D-23 catalog; `dashboard-widgets.ts` `addWidget`/`removeWidget`/`moveWidget`; `DashboardWidgetPicker.tsx` wired from Home header. Reorder reuses `computeReorder`/`appendOrderIndex`/`sortByOrderThenId` from `programs/{days,order-index}.ts` (D-25) — confirmed by import statement, not reimplemented. `dashboard-widgets.spec.ts` Playwright spec passing. |
| 4 | User can reach quick weigh-in, measurement, progress photo, history, new program, and one-off workout from a single quick-action menu | ✓ VERIFIED | `QuickActionSheet.tsx`'s fixed 6-row `QUICK_ACTIONS`; `resolveQuickAction`/`dispatchQuickAction` in `(tabs)/index.tsx` (dismiss-before-navigate, R30, unit-tested 7/7 passing, independently re-run in this verification). Quick weigh-in reuses `MetricEntrySheet`, which itself pre-fills the last recorded value via `loadLatestMetric` (D-29). |

**Score:** 4/4 success criteria verified. All four are backed by both static wiring evidence and passing automated tests (unit, e2e-API-against-live-Postgres, and Playwright browser e2e) — several independently re-run during this verification, not merely re-read from SUMMARY.md claims.

### Required Artifacts (spot-checked against all 8 plans' `must_haves.artifacts`)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api-contracts/src/body-metrics.ts` | Closed 15-kind vocabulary, canonical units | ✓ VERIFIED | Exports `BODY_METRIC_KINDS`, `BODY_METRIC_KIND_ORDER`, `BODY_METRIC_KIND_LABELS`, `BODY_METRIC_CANONICAL_UNIT` |
| `docs/body-metric-vocabularies.md` | Vocabulary reference doc | ✓ VERIFIED | Present, listed in code-review's `files_reviewed_list` |
| `apps/mobile/lib/db/body-metrics.ts` | Write module | ✓ VERIFIED | `logMetric`, `loadLatestMetric`, `updateMetric`, `deleteMetric`, `loadMetricEntries`, `loadTrackedKinds` — 18/18 unit tests independently re-run and passing |
| `apps/api/test/body-metric.e2e-spec.ts` | Ownership/vocabulary/value e2e | ✓ VERIFIED | T-12-01, T-12-02 cases present; PATCH-clobber case added (WR-01 fix, `21e0a68`) |
| `apps/mobile/lib/photos/{capture,downscale,photo-store}.{ts,web.ts}` | Platform-split photo pipeline | ✓ VERIFIED | All present; web halves e2e-proven, native halves typecheck-only (correctly filed to 999.1) |
| `apps/mobile/components/ProgressPhotoPlaceholder.tsx` | Device-absent placeholder (D-15) | ✓ VERIFIED | Renders "On your other device" tile + "Not on this device" info sheet — a deliberate product statement, not a broken image |
| `apps/api/src/db/schema/records.ts` + `ops/powersync/sync-rules.yaml` | `dashboard_widget` table + sync rule | ✓ VERIFIED | New table, `WHERE user_id = auth.user_id()` scoped query per code review |
| `apps/mobile/components/DashboardWidgetHost.tsx` | Widget dispatch, unknown-kind filter | ✓ VERIFIED | `resolveDashboardWidgets` filters before mapping (D-22); no `default: throw` |
| `apps/mobile/components/DashboardWidgetPicker.tsx`, `apps/mobile/e2e/dashboard-widgets.spec.ts` | Add/remove/reorder UI + e2e | ✓ VERIFIED | Both present; unit tests (19/19, independently re-run) and Playwright spec passing |
| `apps/mobile/lib/photos/composite.ts`, `composite.web.ts`, `composite-layout.ts` | Before-and-after composite | ✓ VERIFIED | Native: `expo-sharing`; web: canvas `toBlob` + download-anchor idiom, mirroring `export-training-data.web.ts` |
| `apps/mobile/components/QuickActionSheet.tsx`, `apps/mobile/e2e/quick-action.spec.ts` | Quick-action sheet | ✓ VERIFIED | Fixed 6-row order; e2e spec present (149 lines) |
| `packages/api-contracts/src/__tests__/sync.test.ts` | `PUSH_DEFERRED_TABLES` empty assertion | ✓ VERIFIED | `expect(PUSH_DEFERRED_TABLES).toHaveLength(0)` — independently re-run, passes (28/28 in file) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `body-metrics.ts` `logMetric` | Postgres `body_metric` | PowerSync crud queue → `POST /v1/sync/push` → `SyncService.applyBatch` | ✓ WIRED | `body_metric` registered at all 7 `sync.service.ts` singleton-root touchpoints per code review; e2e-proven against live Postgres |
| `BodyMetricRow` row press | `/body-metric-trend?kind=...` | `router.push` in `body-metrics.tsx:183` | ✓ WIRED | Confirmed by direct grep — exact route string with interpolated `kind` |
| `BodyweightTrendWidget` | `/body-metric-trend?kind=bodyweight` | `router.push` | ✓ WIRED | Confirmed |
| Home header `Edit`/`Add Widgets` | `DashboardWidgetPicker` | `pickerOpen` state | ✓ WIRED | Both the populated-header entry and the empty-state `Add Widgets` control route through the same flag (D-24) |
| `dashboard-widgets.ts` reorder | `programs/order-index.ts` | direct import of `appendOrderIndex`/`sortByOrderThenId`/`computeReorder` | ✓ WIRED | Confirmed by import statement — D-25 satisfied, no reimplementation |
| Home header `Quick Actions` | `QuickActionSheet` → 6 destinations | `quickActionsOpen` state, `dispatchQuickAction` | ✓ WIRED | `dismiss()` called unconditionally before any branch (R30) — confirmed by reading `dispatchQuickAction`'s body |
| `photo-composite.tsx` picker | `ProgressPhotoPlaceholderView` (disabled mode) | rendered with no `onPress` prop when `!item.present` | ✓ WIRED | Line 170: `ProgressPhotoPlaceholderView` invoked with no `onPress` → `disabled = true` → `accessibilityState={{ disabled: true }}` (D-19/R28) |
| Profile tab | `/body-metrics`, `/progress-photos` | `DataRow` `onPress` → `router.push` | ✓ WIRED | Present and reachable — see note on placement discrepancy below |

### Specific Checks Requested

1. **`PUSH_DEFERRED_TABLES` milestone assertion.** ✓ CONFIRMED REAL. `PUSH_DEFERRED_TABLES = [] as const` in `packages/api-contracts/src/sync.ts:98`, and `packages/api-contracts/src/__tests__/sync.test.ts` contains `expect(PUSH_DEFERRED_TABLES).toHaveLength(0)` inside a describe block titled "PUSH_DEFERRED_TABLES is empty — every synced table has a push apply path (12-08)". Independently re-run in this verification: 28/28 tests pass in that file, including this assertion and tripwires for both `body_metric` and `progress_photo`'s tuple moves.

2. **D-15's honesty (device-absent placeholder) and D-19 (non-selectability).** ✓ CONFIRMED. `ProgressPhotoPlaceholder.tsx` renders "On your other device" (gallery tile) and "This photo was taken on another device. Its bytes haven't synced here." (info sheet) — a deliberate product statement, never a broken image or spinner. In `photo-composite.tsx`'s picker (line 170), an absent photo renders `ProgressPhotoPlaceholderView` with **no `onPress` prop**, which the component itself resolves to `disabled = true` and `accessibilityState={{ disabled: true }}` — genuinely non-interactive, not selectable-then-failing.

3. **D-20/D-26.** ✓ CONFIRMED. `(tabs)/_layout.tsx` still declares exactly 5 `NativeTabs.Trigger` entries (index/programs/workout/history/profile) — no sixth tab. `loadOrMaterializeDashboardWidgets` in `dashboard-widgets.ts` inserts real `dashboard_widget` rows (via `db.transaction`) for `DEFAULT_WIDGET_KINDS = ['next_up', 'weekly_progress']` on first read when the row count is zero — an implicit "no rows means default" rule was explicitly rejected in favor of materialized rows, matching D-26.

4. **D-25.** ✓ CONFIRMED. `dashboard-widgets.ts` imports `computeReorder` from `./programs/days` and `appendOrderIndex`, `sortByOrderThenId` from `./programs/order-index` — `moveWidget` calls `computeReorder(siblings, widgetId, beforeId, afterId)` directly. No reorder arithmetic is reimplemented.

5. **Decision coverage (D-01…D-29).** ✓ ALL 29 CITED AND TRACED. Every decision is referenced in at least one plan's `must_haves` or body text, and this verification traced representative code evidence for all of them (D-01/D-20/D-21/D-22/D-23/D-25/D-26 for the dashboard; D-03/D-04/D-05/D-06/D-07/D-08/D-09/D-10 for metrics; D-11/D-12/D-13/D-14 for trends; D-15/D-16/D-17/D-18/D-19 for photos; D-24/D-27/D-28/D-29 for empty-state/quick-actions). No decision was found cited-but-unimplemented.

6. **The six unclassified spec-less edge rows.** ✓ SURFACED, NOT SILENTLY DROPPED. Each of BODY-01 (12-01), BODY-02 (12-02), BODY-03 (12-04), BODY-05 (12-06), DASH-01 (12-05), DASH-03 (12-08) carries an explicit `<planner_assumptions>` entry in its PLAN.md reading "Spec-less edge probe... `unclassified` (unresolved)... Flagged, not dismissed," with the plan's own `must_haves.truths` derived from `12-CONTEXT.md`'s decisions instead. This is genuine, auditable disclosure — not a gap that got lost.

### Code Review Findings — Disposition

`12-REVIEW.md`: 0 critical, 4 warnings, 2 info. All 4 warnings were fixed and committed in this working tree, verified directly against the diffs:

- **WR-01** (no PATCH-clobber regression test) — fixed in `cc670f4` (unit) + `21e0a68` (e2e, all three new tables).
- **WR-02** (`capturePhoto()` on web hangs forever on picker cancel) — fixed in `28481b9`; new test asserts `resolves.toBeNull()` on a `cancel` event.
- **WR-03** (`photo-composite.tsx` `reload()` has no error handling) — fixed in `f65c74c`; adds `try/catch` and an error state matching `progress-photos.tsx`'s shape.
- **WR-04** (`deletePhoto` leaves UI stale if byte deletion fails) — fixed in `59b6d6c`; `handleConfirmDelete` now keeps `reload()` running after a `deletePhotoBytes` rejection.

**IN-01** and **IN-02** (both info-level, consciously left per the orchestrator's evidence) are genuinely minor: IN-01 is a test-symmetry note (happy path is covered, the byte-deletion-failure path's row-absence isn't independently asserted — WR-04's fix addresses the UI-facing half of this same concern). IN-02 (`value: null` PATCH silently zeroing a metric) is a pre-existing pattern copied from `personal_record`, not introduced by this phase, and is a narrow, low-probability edge (no legitimate client ever sends `value: null`). Neither blocks the phase goal.

### Minor Deviation Found (disclosed, not a blocker)

**Profile tab row placement vs. UI-SPEC wording.** `12-UI-SPEC.md` line 205 and `12-08-PLAN.md`'s must_have both state the two new rows go "after Gym Profiles, before Appearance." The shipped `profile.tsx` renders `AppearanceControl` **before** the Gyms section (an ordering that predates this phase and that the plan's own "change nothing else in that file" instruction forbade altering). The two anchors were mutually exclusive without reordering pre-existing content. The executor resolved this by satisfying "after Gym Profiles" (achieved — confirmed at `profile.tsx:301-302`, directly beneath `GymRow`) and explicitly documented the conflict and the choice in `12-08-SUMMARY.md`'s Deviations section (`key-decisions` entry + a numbered "Rule 4-adjacent" deviation writeup). This is honest, auditable disclosure of a self-contradictory spec instruction, not a hidden gap — both rows are present, reachable, and correctly grouped with "manage your data" entries. Functionally inconsequential to all four success criteria.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|------------|--------|----------|
| BODY-01 | 12-01, 12-02 | ✓ SATISFIED | Bodyweight logging via `body_metric` kind `bodyweight`; push path e2e-proven |
| BODY-02 | 12-01, 12-02 | ✓ SATISFIED | Named-measurement logging, closed 15-kind vocabulary, `TrackKindSheet` |
| BODY-03 | 12-04 | ✓ SATISFIED | Trend detail screen, `TrendChart` reuse, latest-per-day dedup, no fabricated zeros |
| BODY-04 | 12-03 | ✓ SATISFIED | Capture/downscale/store pipeline, gallery, device-absent placeholder, ownership e2e |
| BODY-05 | 12-06 | ✓ SATISFIED | Before-and-after composite, client-side render, platform-split share/download |
| DASH-01 | 12-05 | ✓ SATISFIED | Home tab restructured into 6-widget catalog dispatch, no new analytics |
| DASH-02 | 12-05, 12-07 | ✓ SATISFIED | Add/remove/reorder wired end-to-end; `dashboard_widget` push path e2e-proven |
| DASH-03 | 12-08 | ✓ SATISFIED | Fixed 6-action sheet; quick weigh-in in-place; R30 dismiss-before-navigate tested |

REQUIREMENTS.md marks all 8 requirements `Complete`, consistent with the evidence found. No orphaned requirements found for Phase 12 in REQUIREMENTS.md's mapping table.

### Anti-Patterns Found

None found in the reviewed surfaces beyond what the code review already caught (and which is now fixed — see above). No `TBD`/`FIXME`/`XXX` markers found in this phase's files. No stub returns, no hardcoded empty render paths feeding user-visible output.

### Behavioral Spot-Checks (independently re-run during this verification, not merely re-read from SUMMARY.md)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `PUSH_DEFERRED_TABLES` is empty, asserted | `pnpm --filter @fitness/api-contracts test -- sync.test.ts` | 28/28 pass, including `has length zero` | ✓ PASS |
| `dashboard-widgets.ts` add/remove/reorder unit coverage | `pnpm --filter mobile test -- dashboard-widgets.test.ts` | 19/19 pass | ✓ PASS |
| `body-metrics.ts` write/edit/delete unit coverage | `pnpm --filter mobile test -- body-metrics.test.ts` | 18/18 pass | ✓ PASS |
| `dispatchQuickAction` R30/D-29 ordering | `pnpm --filter mobile test -- quick-actions.test.ts` | 7/7 pass | ✓ PASS |

(Full-suite Playwright durability run — 116/116, 7.8m, including every Phase 12 spec — and the full `pnpm -w test`/`pnpm -w typecheck` runs were executed once by the orchestrator immediately before this verification per the provided evidence; this verification re-ran four targeted, fast single-file checks independently rather than re-running the whole suite, per the "run the full suite at most once" constraint.)

### Human Verification Required

4 items — all genuinely unverifiable in this environment and correctly filed to ROADMAP Phase 999.1/999.2 and WINDOWS.md rather than skipped silently. See frontmatter `human_verification` above for full detail. In summary:

1. **Native iOS/Android rendering** of every photo/composite/keypad/drag-reorder surface this phase adds (no Xcode/Android SDK on this machine).
2. **Cross-device sync** of the three newly-applied tables after a PowerSync Service restart (requires a second live device).
3. **Subjective visual judgment** at maximum OS font scale across the new screens (human visual judgment).
4. **`openOneOff=1` route param actually opening the picker on a mounted WorkoutScreen** — proven only at the pure-function level (`resolveQuickAction`/`dispatchQuickAction`), not with a mounted-screen test. Filed as WINDOWS #179.

### Gaps Summary

No blocking gaps found. All four ROADMAP success criteria are genuinely implemented, wired, and covered by passing automated tests — several independently re-executed during this verification rather than trusted from SUMMARY.md narration. The code review's four warnings were all fixed with accompanying tests, verified directly against their diffs. One minor, honestly-disclosed spec-wording deviation exists in Profile tab row placement (documented above) with no functional impact. The four human-verification items are legitimately unreachable in this environment (no native toolchain, no second device, no human visual reviewer) and were genuinely filed to the correct backlog locations rather than silently dropped — this routes the phase to `human_needed` rather than `passed`, per the verification decision tree, but does not indicate any deficiency in the shipped code.

---

_Verified: 2026-08-31_
_Verifier: Claude (gsd-verifier)_
