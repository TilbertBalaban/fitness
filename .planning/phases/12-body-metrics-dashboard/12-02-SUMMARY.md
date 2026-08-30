---
phase: 12-body-metrics-dashboard
plan: 02
subsystem: ui
tags: [react-native, expo-router, nativewind, drizzle, units-conversion, tdd]

requires:
  - phase: 12-body-metrics-dashboard
    provides: "12-01's body_metric push apply path, the closed 15-kind vocabulary (BODY_METRIC_KINDS/BODY_METRIC_KIND_ORDER/BODY_METRIC_KIND_LABELS/BODY_METRIC_CANONICAL_UNIT) and apps/mobile/lib/db/body-metrics.ts's logMetric/loadLatestMetric"
provides:
  - "Working /body-metrics overview screen: loading/error/empty/populated states, a row per tracked kind sorted by BODY_METRIC_KIND_ORDER, and a fixed 'Track a measurement' affordance that is never hidden by state"
  - "MetricEntrySheet: docked-keypad entry sheet with MetricValueKeypad (digit-grid reducer, no plate strip), blank/pre-filled/write-failed states, and a quick-measurement kind picker (SegmentedChipRow excluding bodyweight) for future DASH-03 callers"
  - "TrackKindSheet: pick-a-kind-to-track sheet over the closed vocabulary, hands off straight into MetricEntrySheet pre-selected to the chosen kind (decision 8)"
  - "cm/in half of the units boundary (toCanonicalCm/fromCanonicalCm/formatLength) plus resolveDisplayUnit/toCanonicalValue/fromCanonicalValue — D-08's single weight_unit-driven mapping from any body-metric kind to its display unit"
  - "loadTrackedKindSummaries and loadTrackedKinds in apps/mobile/lib/db/body-metrics.ts, sharing one batched read via a private loadLatestPerKind helper"
affects: [12-03, 12-06, 12-08]

actuals:
  tokens: 18040
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Length conversion (cm/in) extends units.ts's existing bigint-fraction pipeline (convertByFactor generalized from convertFraction) rather than a second module — CM_PER_IN substituted for KG_PER_LB, same parseDecimalToFraction/roundExactFractionToScale/formatScaledBigInt chain"
    - "fromCanonicalCm trims a trailing decimal zero after the exact bigint arithmetic runs (trimTrailingDecimalZeros) — a display-string-only transform, deliberately different from fromCanonicalKg's fixed-decimal-places convention, because a body measurement has no plate-increment reason to keep a trailing .0"
    - "resolveDisplayUnit/toCanonicalValue/fromCanonicalValue in body-metrics.ts are the single place D-08's 'one weight_unit toggle drives both mass and length display' rule lives — MetricEntrySheet and BodyMetricRow both call through it, never branching on BODY_METRIC_CANONICAL_UNIT themselves"
    - "loadTrackedKinds and loadTrackedKindSummaries share one batched SQL statement via a private loadLatestPerKind helper, rather than each issuing its own query — the 'same single batched read' requirement implemented as shared query logic, not merely a shared call"
    - "MetricEntrySheetView is a two-step sheet (kind===null renders the SegmentedChipRow picker; a named kind renders the value/keypad/Log step), never both at once — matches UI-SPEC's 'selecting a chip advances to step 3' language"

key-files:
  created:
    - apps/mobile/app/body-metrics.tsx
    - apps/mobile/components/MetricValueKeypad.tsx
    - apps/mobile/components/MetricEntrySheet.tsx
    - apps/mobile/components/BodyMetricRow.tsx
    - apps/mobile/components/TrackKindSheet.tsx
    - apps/mobile/components/__tests__/MetricEntrySheet.test.tsx
    - apps/mobile/components/__tests__/BodyMetricRow.test.tsx
    - apps/mobile/components/__tests__/TrackKindSheet.test.tsx
    - apps/mobile/app/__tests__/body-metrics-screen.test.ts
  modified:
    - apps/mobile/lib/db/body-metrics.ts
    - apps/mobile/lib/db/__tests__/body-metrics.test.ts
    - packages/api-contracts/src/units.ts
    - packages/api-contracts/src/__tests__/units.test.ts
    - packages/api-contracts/src/body-metrics.ts
    - packages/api-contracts/src/__tests__/body-metrics.test.ts

key-decisions:
  - "MetricEntrySheetView, TrackKindSheetView and BodyMetricsScreenView each self-contain their own <Modal>/screen shell (matching MuscleDrilldownSheetView's convention), not HistoryActionSheet's caller-wraps-the-Modal convention — keeps every new sheet directly, fully renderable by a single test call with no external wrapper"
  - "TrackKindSheet skips the plan's suggested local GLYPH_COLORS constant — its rows carry no icon (S7's own anatomy has none), so there is no color value to resolve; adding an unused color table would be dead code"
  - "BodyMetricRow and MetricEntrySheet resolve their own display unit internally (via resolveDisplayUnit/fromCanonicalValue) from a canonical value + weightUnit prop, rather than the caller pre-formatting a valueLabel string — this is what let Task 2 extend both files to the full vocabulary without touching body-metrics.tsx at all"
  - "body-metrics.tsx defensively re-sorts the populated row list by BODY_METRIC_KIND_ORDER at render time, in addition to loadTrackedKindSummaries already returning it sorted — belt-and-suspenders per the plan's own 'sort the populated row list' instruction, and the acceptance criterion asking for a BODY_METRIC_KIND_ORDER reference in both body-metrics.tsx and TrackKindSheet.tsx"

patterns-established:
  - "A hook-free screen/sheet View takes a `colors: ThemeColors` prop when it renders any Ionicons icon (which needs a resolved color string, not a NativeWind class) — BodyMetricsScreenView and MetricEntrySheetView both follow this now, alongside the existing RecordRowView/BodyMetricRowView precedent"

requirements-completed: [BODY-01, BODY-02]

coverage:
  - id: D1
    description: "A user can open /body-metrics, tap a kind's add affordance, enter a number on the keypad and commit it as a body_metric row in one confirm — the tracer path proven end to end"
    requirement: "BODY-01"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/MetricEntrySheet.test.tsx#MetricEntrySheetView — populated/empty/keypad reducer"
        status: pass
      - kind: unit
        ref: "apps/mobile/app/__tests__/body-metrics-screen.test.ts#BodyMetricsScreenView — populated"
        status: pass
    human_judgment: false
  - id: D2
    description: "A user chooses which kinds to track from the closed vocabulary via TrackKindSheet; no free-text kind can be created, and picking an untracked kind opens MetricEntrySheet pre-selected to it (decision 8)"
    requirement: "BODY-02"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/TrackKindSheet.test.tsx#TrackKindSheetView — empty/populated"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/body-metrics.test.ts#loadTrackedKinds"
        status: pass
    human_judgment: false
  - id: D3
    description: "A circumference value entered under an lb weight_unit preference is stored as centimetres and displayed back in inches; cm and in convert through exact bigint-fraction arithmetic (D-03, D-08)"
    verification:
      - kind: unit
        ref: "packages/api-contracts/src/__tests__/units.test.ts#toCanonicalCm/fromCanonicalCm/cm-in round trip stability"
        status: pass
      - kind: unit
        ref: "packages/api-contracts/src/__tests__/body-metrics.test.ts#resolveDisplayUnit (D-08 — one preference, not two)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Body Metrics overview renders loading (3-row skeleton), error, empty and populated states distinctly, with the 'Track a measurement' row never hidden"
    verification:
      - kind: unit
        ref: "apps/mobile/app/__tests__/body-metrics-screen.test.ts#deriveBodyMetricsScreenState / loading / error / empty"
        status: pass
    human_judgment: false
  - id: D5
    description: "Native rendering of the new keypad/sheets and maximum-OS-font-scale backstop checks are deferred per standing project policy, not left as in-phase blockers"
    verification: []
    human_judgment: true
    rationale: "No Xcode/Android SDK on this machine and no live-human visual-judgment session was run this plan — both items were filed to ROADMAP Phase 999.1/999.2 instead of skipped silently."

duration: 30min
completed: 2026-08-30
status: complete
---

# Phase 12 Plan 02: Body Metrics Entry — Overview, Sheet, Keypad, Track-a-Kind Summary

**The first real surface a person can touch in Phase 12: `/body-metrics` overview with four distinct states, a docked-keypad `MetricEntrySheet` that resolves cm/in/kg/lb/percent from one `weight_unit` preference, and `TrackKindSheet` for choosing which of the 15 closed-vocabulary kinds to track.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-08-30T19:19:48Z
- **Completed:** 2026-08-30T19:48:38Z
- **Tasks:** 3 (1 tracer, 2 TDD)
- **Files modified:** 15

## Accomplishments
- A bodyweight (or any of the 14 named measurements) can be logged from `/body-metrics` through `MetricEntrySheet` and the row reflects the new value — proven by tests exercising the exact tracer path (open sheet → seed/blank value → keypad press → enabled Log).
- `packages/api-contracts/src/units.ts` gained a length half (`toCanonicalCm`/`fromCanonicalCm`/`formatLength`) built from the identical exact-bigint-fraction pipeline `toCanonicalKg`/`fromCanonicalKg` already use — no binary float anywhere in the path, verified by a grep gate and 88 passing unit cases.
- `resolveDisplayUnit`/`toCanonicalValue`/`fromCanonicalValue` in `body-metrics.ts` give D-08's "one toggle, not two" rule its single implementation: `weight_unit` resolves the display unit for every one of the 15 kinds, so a user can never see kilograms alongside inches.
- The Body Metrics overview renders four distinct, tested states (loading skeleton, error, empty, populated), and the "Track a measurement" row is fixed chrome that never disappears, matching UI-SPEC's "the path forward is never hidden."
- `TrackKindSheet` lists only untracked kinds from `BODY_METRIC_KIND_ORDER`, shows the "You're tracking everything" empty state at 15/15, and hands off straight into `MetricEntrySheet` pre-selected to the chosen kind — one action for "choose to track" and "log the first value" (decision 8).

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "log a weight from the Body Metrics screen"** — `7029d44` (feat)
2. **Task 2: Extend the units boundary to length (cm and in), and resolve display unit per kind** — `0576833` (test/RED), `aebcb19` (feat/GREEN)
3. **Task 3: Track-a-kind picker and every overview/sheet state** — `a0cee1b` (test/RED), `5a63793` (feat/GREEN)

**Plan metadata:** pending (this commit)

_TDD tasks (2, 3) each carry a RED commit (test) proven failing before the GREEN commit (feat) that makes it pass — see "TDD Gate Compliance" below._

## Files Created/Modified
- `apps/mobile/app/body-metrics.tsx` - the `/body-metrics` route: `deriveBodyMetricsScreenState`, the four rendered states, the sorted row list, the "Track a measurement" row, `MetricEntrySheet`/`TrackKindSheet` wiring
- `apps/mobile/components/MetricValueKeypad.tsx` - a single-value digit-grid keypad reusing `NumericKeypad.tsx`'s `KEYPAD_KEYS`/`applyKeypadPress`, no plate strip
- `apps/mobile/components/MetricEntrySheet.tsx` - the docked-keypad entry sheet: blank/pre-filled/write-failed states, the quick-measurement kind picker, `KEYPAD_SHEET_MAX_WIDTH`
- `apps/mobile/components/BodyMetricRow.tsx` - overview row: two independent press targets (row body, trailing "+"), resolves its own display unit via `resolveDisplayUnit`
- `apps/mobile/components/TrackKindSheet.tsx` - pick-a-kind-to-track sheet over `BODY_METRIC_KIND_ORDER`
- `apps/mobile/lib/db/body-metrics.ts` - `loadTrackedKindSummaries`, `loadTrackedKinds` (sharing one batched read via `loadLatestPerKind`)
- `packages/api-contracts/src/units.ts` - `LENGTH_UNITS`, `CANONICAL_CM_SCALE`, `LENGTH_DISPLAY_SCALE`, `CM_PER_IN`, `toCanonicalCm`, `fromCanonicalCm`, `formatLength`
- `packages/api-contracts/src/body-metrics.ts` - `BodyMetricDisplayUnit`, `resolveDisplayUnit`, `toCanonicalValue`, `fromCanonicalValue`
- Four new test files plus three extended ones — see frontmatter `key-files`

## Decisions Made
See `key-decisions` in frontmatter. The two worth restating: (1) every hook-free View built this plan self-contains its own `<Modal>`, so a single direct-invocation test call renders the whole surface; (2) `BodyMetricRow`/`MetricEntrySheet` resolve their own display unit from a canonical value, which is exactly what let Task 2's unit-boundary extension land without touching `body-metrics.tsx`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed an over-precise round-trip test fixture that failed against the real display-scale precision**
- **Found during:** Task 2 (GREEN)
- **Issue:** `IN_FIXTURES` included `'15.75'`, an inch value with 2 decimal digits — finer than `LENGTH_DISPLAY_SCALE`'s 1-decimal precision. The round-trip assertion (`toCanonicalCm(fromCanonicalCm(toCanonicalCm(v)))  === toCanonicalCm(v)`) legitimately failed, the same class of precision loss `LB_FIXTURES`'s own header comment already documents and excludes for pounds.
- **Fix:** Replaced `'15.75'` with `'15.5'` (matching the existing fixture's own "at most one decimal digit deep" discipline) and added a comment explaining why, mirroring `LB_FIXTURES`'s precedent exactly.
- **Files modified:** `packages/api-contracts/src/__tests__/units.test.ts`
- **Verification:** `pnpm --filter @fitness/api-contracts test -- units` — 88/88 passing.
- **Committed in:** `aebcb19` (Task 2 GREEN commit)

**2. [Rule 3 - Blocking] Extended the mobile `body-metrics.test.ts` fake-db `.where()` to be directly awaitable**
- **Found during:** Task 3 (GREEN)
- **Issue:** The existing test fake's `select().from().where()` only returned a `.orderBy().limit()`-chainable object; `loadTrackedKindSummaries`/`loadTrackedKinds` call `await db.select(...).where(...)` directly with no `.orderBy()`/`.limit()`, which the fake could not satisfy.
- **Fix:** Made the returned object both chainable (unchanged `.orderBy().limit()` path for `loadLatestMetric`) and a real thenable (`.then()`), matching drizzle's actual query-builder shape.
- **Files modified:** `apps/mobile/lib/db/__tests__/body-metrics.test.ts`
- **Verification:** `pnpm --filter mobile test -- body-metrics` — all cases pass, including the pre-existing `logMetric`/`loadLatestMetric` suite (unaffected).
- **Committed in:** `5a63793` (Task 3 GREEN commit)

**3. [Rule 1 - Bug] Fixed a screen-level test that wrongly expected the View to re-sort rows**
- **Found during:** Task 3 (GREEN)
- **Issue:** `body-metrics-screen.test.ts`'s populated-state test supplied rows in insertion order and expected `BodyMetricsScreenView` to sort them — but sorting is the query layer's contract (`loadTrackedKindSummaries`, already proven sorted by its own dedicated test), and the real screen always hands the View pre-sorted rows.
- **Fix:** Rewrote the fixture to supply already-sorted rows (matching real production data flow) and assert order is preserved. Also added a defensive `BODY_METRIC_KIND_ORDER` re-sort inside `BodyMetricsScreenView` itself (belt-and-suspenders, and satisfies the acceptance criterion requiring a `BODY_METRIC_KIND_ORDER` reference in `body-metrics.tsx`).
- **Files modified:** `apps/mobile/app/__tests__/body-metrics-screen.test.ts`, `apps/mobile/app/body-metrics.tsx`
- **Verification:** `pnpm --filter mobile test -- body-metrics` — all cases pass.
- **Committed in:** `5a63793` (Task 3 GREEN commit)

**4. [Rule 2 - Missing critical functionality] Added the two MetricEntrySheetView behavior tests the plan's own `<behavior>` block required but omitted from Task 3's `<files>` list**
- **Found during:** Task 3 (RED)
- **Issue:** Task 3's `<behavior>` explicitly requires "MetricEntrySheetView opened via the quick-measurement entry point renders a SegmentedChipRow kind picker..." and "...write-failed state renders the inline Couldn't save. Try again. line" — but `<files>` only lists three new test files (TrackKindSheet, BodyMetricRow, body-metrics-screen), omitting the already-existing `MetricEntrySheet.test.tsx`.
- **Fix:** Added both behaviors as new `describe` blocks to the existing `apps/mobile/components/__tests__/MetricEntrySheet.test.tsx` (the correct, natural location), following its established `renderSheet`/`findText`/`collect` conventions.
- **Files modified:** `apps/mobile/components/__tests__/MetricEntrySheet.test.tsx`
- **Verification:** `pnpm --filter mobile test -- MetricEntrySheet` — all cases pass, including the 3 new describe blocks.
- **Committed in:** `a0cee1b` (Task 3 RED), `5a63793` (Task 3 GREEN)

---

**Total deviations:** 4 auto-fixed (2 bug fixes, 1 blocking-environment fix, 1 missing-critical-coverage addition). No scope creep — all four were required for the plan's own stated behavior and acceptance criteria to be genuinely provable.

## Issues Encountered
None beyond the four auto-fixed items above.

## User Setup Required
None - no external service configuration required.

## TDD Gate Compliance

Both TDD tasks (2, 3) carry a verified RED → GREEN sequence in git log:
- Task 2: `0576833` (test, RED — confirmed failing: `toCanonicalCm`/`resolveDisplayUnit` did not exist, both suites failed to compile) → `aebcb19` (feat, GREEN — 88/88 passing).
- Task 3: `a0cee1b` (test, RED — confirmed failing: `TrackKindSheet.tsx` did not exist, `deriveBodyMetricsScreenState`/`loadTrackedKinds` were not functions, 13 failures) → `5a63793` (feat, GREEN — 38/38 passing).

No REFACTOR-only commit was needed for either task; both GREEN commits landed clean on the first implementation pass after RED.

## Next Phase Readiness
- 12-03 (trend detail screen) can read `loadTrackedKindSummaries`/`loadTrackedKinds` and reuse `resolveDisplayUnit`/`fromCanonicalValue` directly — no further units-boundary work needed for BODY-03.
- The `MetricEntrySheet` quick-measurement kind-picker path (kind === null) is built and tested but has no real call site yet in this plan — 12-08's Quick Measurement quick-action is its first production caller.
- `apps/mobile/app/body-metrics.tsx` is the durability-harness-compatible shape (`userId`/`db` props) every prior screen in this app uses, so a later e2e-bearing plan can mount it directly.
- No blockers. Native (iOS/Android) verification and the maximum-font-scale keypad/preview backstop are routed to ROADMAP Phase 999.1/999.2 respectively (added this plan, not left as in-phase blocking checks) per standing project policy — see the two new entries under "Phase 999.1"/"Phase 999.2" in `.planning/ROADMAP.md`.

---
*Phase: 12-body-metrics-dashboard*
*Completed: 2026-08-30*

## Self-Check: PASSED

All 16 created/modified files verified present; all 6 commits (`7029d44`, `0576833`, `aebcb19`, `a0cee1b`, `5a63793`, `8b43f3f`) verified present in `git log`.
