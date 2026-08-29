---
phase: 09-records-client-analytics
verified: 2026-08-29T13:20:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "Native (iOS/Android) rendering of TrendChart, RecordRow, the Last 7 Days card and the History trend card"
    addressed_in: "Phase 999.1"
    evidence: "Project-wide policy: native-only UAT accumulates in Phase 999.1; this machine has neither Xcode nor the Android SDK. Recorded as WINDOWS #155, #158, #160."
  - truth: "Subjective visual review at maximum OS font scale of the chart axis row, the ANLY-10 caption, the Records rows and the three progress tracks"
    addressed_in: "Phase 999.2"
    evidence: "Project-wide policy: web human-judgment UAT accumulates in Phase 999.2. Recorded as WINDOWS #156, #159, #161."
warnings:
  - id: W1
    severity: warning
    summary: "Phase 09's six deferred UAT items exist in WINDOWS.md but were never appended to the ROADMAP Phase 999.1 / 999.2 accumulated-items lists, unlike every phase 01-08."
    action: "Append the six items to ROADMAP.md so the sweep phases actually surface them."
  - id: W2
    severity: informational
    summary: "summary-query.ts derives topWeightKg/bestE1rmKg over countsTowardWorkingVolume (partials included) while PR detection and the performance chart use countsTowardRecords (partials excluded). Pre-existing Phase 5 code, deliberately untouched under R15."
  - id: W3
    severity: cosmetic
    summary: "RecordsScreenView accepts and destructures a `colors` prop it never reads."
---

# Phase 9: Records & Client Analytics — Verification Report

**Phase Goal:** The user can see what they've achieved and whether they're doing enough, computed on-device.
**Verified:** 2026-08-29
**Status:** passed
**Re-verification:** No — initial verification

**Note on `mode: mvp`.** ROADMAP marks this phase `mode: mvp`, but its goal is not in the
`As a …, I want to …, so that ….` User Story form the MVP-mode verifier requires, so the User
Flow Coverage table is not applicable. Verification ran goal-backward against the five ROADMAP
Success Criteria, which are the actual contract, per the verification directive for this run.

---

## Evidence executed by this verifier (not quoted from any SUMMARY)

| Command | Result |
|---|---|
| `pnpm --filter mobile test:e2e:durability` | **78 passed, 0 failed** (5.2m), exit 0 |
| `npx turbo run typecheck lint test` | **21/21 tasks successful**, exit 0; `mobile:test` 108 suites / 1946 tests |
| `npx turbo run test --filter=@fitness/analytics-engine --force` (cache bypassed) | **6 suites / 88 tests passed** |

The 78-case durability run included, by name: `weekly-progress.spec.ts` cases 69–75,
`records.spec.ts` cases 38–42, `history-trend.spec.ts` cases 21–23, `workout-summary.spec.ts`
case 78, plus the `exercise-performance.spec.ts` cases. The analytics-engine result was forced
past the Turborepo cache so it is a real execution, not a replayed log.

---

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | PRs detected automatically across heaviest weight, best e1RM, most reps at a weight, and best set volume, surfacing in the workout summary | ✓ VERIFIED | `packages/pr-rules/src/personal-records.ts` `detectPrs` emits all four `PR_TYPES`, gated on `countsTowardRecords`. `WorkoutSummary.tsx:renderPrBadges` now labels each pill from `PR_TYPE_BADGE_LABELS` instead of a repeated "New PR". Browser-proven: durability case 78 asserts `Heaviest PR` **and** `Volume PR` visible, `Est. 1RM PR` absent (12 reps > cap), then both gone after the correction. |
| 2 | User can browse recent records and switch between PR metrics | ✓ VERIFIED | `apps/mobile/app/records.tsx` (route `/records`) + `RecordRow.tsx` + `SegmentedChipRow` chips derived from `PR_TYPES`; keyset `(achieved_at, id)` pagination in `records-query.ts` reading the persisted `personal_record` table (no second PR implementation). Reached from the History tab via the added `Records` pressable (both the populated and empty branches). Durability cases 38–42 cover ordering, the rep-count formatting trap, per-metric empty copy with the switch still mounted, and switching back. |
| 3 | User can view a single exercise's performance over time across selectable metrics and ranges, and browse full workout history with trends | ✓ VERIFIED | `apps/mobile/app/exercise-performance.tsx` (metric chips heaviest/e1rm/volume; range chips 3m/1y/all with weekly-best bucketing for the two long ranges), reachable from `exercises/[id].tsx`'s unconditional "View performance" link and from a record row. `HistoryTrendCard` is the History list's `ListHeaderComponent` over `historyTrendSeries` (12 × 7-day buckets, four-branch delta). Durability cases 21–23 plus the exercise-performance cases prove chart, chip redraw, weekly-bucket maxima (not means), and the "nothing in range" branch. |
| 4 | User sees this week's progress against targets for muscles trained, sets and exercises — available immediately after logging, before any sync | ✓ VERIFIED (behavioral test, not presence) | `weekly-progress-query.ts` reads local SQLite through Drizzle-over-PowerSync in four batched selects; **no `fetch`/`http`/API client appears anywhere in the phase's non-test source** (grep over all 27 phase source files returned only the Playwright `baseURL`). Targets are derived from the active program via the shipped `loadNextUp`/`resolveNextUp`/`resolveTarget` (D-08). Home mounts the card behind a third independent `useFocusEffect`. Durability case 75 — *"a set logged after the card is on screen raises the figure once Home is focused again"* — seeds into an already-mounted screen, drives a real `router.push('/reset-password')` + `router.back()`, and asserts `Sets: 4 of 12` appears while `Sets: 3 of 12` disappears. That is the state transition, not a seed-then-mount. |
| 5 | Estimated 1RM figures are only shown where the formula is valid for the rep range | ✓ VERIFIED | See the ANLY-10 sweep below. |

**Score: 5/5 truths verified (0 present, behavior-unverified).**

---

## Targeted adversarial checks

### 1. Set-predicate consistency — the phase's named "most likely correctness defect"

| Consumer | Predicate applied | Agrees with | Verdict |
|---|---|---|---|
| `exercise-series.ts` `heaviest` / `e1rm` | `countsTowardRecords` (imported, never re-derived) | `detectPrs` in `pr-rules` | ✓ |
| `exercise-series.ts` `volume` | `countsTowardWorkingVolume`, child-inclusive | `summary-query.ts` `volumeKg` | ✓ |
| `trend-series.ts` `volume` | `countsTowardWorkingVolume` + `completed`, children included | `summary-query.ts` `volumeKg` | ✓ |
| `trend-series.ts` `sets` | `parentSetId === null && countsTowardWorkingVolume && completed` | `ExerciseStrip.countCompletedWorkingSets` (verbatim trio) | ✓ |
| `weekly-progress.ts` `isQualifyingSet` | `parentSetId === null && countsTowardWorkingVolume(setType) && completed` | `ExerciseStrip.countCompletedWorkingSets` — same three conjuncts, same order | ✓ |

Both predicates are imported from `@fitness/api-contracts`; I found **zero** hand-rolled set-type
comparisons in the phase's source. The SQL readers (`weekly-progress-query`,
`history-trend-query`, `exercise-history-query`) each deliberately return set rows **unfiltered**
and document why — filtering in SQL would collapse the two populations into whichever one the
reader happened to pick.

**The drop-set claim is proven in a browser, not asserted.** `weekly-progress.spec.ts` seeds one
working set + one warm-up + two drop-set children on bench and two working sets on row — six
`logged_set` rows — and asserts `Sets: 3 of 12` is visible **and** `6 / 12` has count 0. A
predicate leak would render the second. A drop set is one set.

### 2. ANLY-10 — every e1RM surface

Only four non-test files reference e1RM at all (`exercise-performance.tsx`, `records.tsx`,
`WorkoutSummary.tsx`, `summary-query.ts`). Each was read:

| Surface | Above-cap behaviour | Bare em dash as sole explanation? |
|---|---|---|
| Workout summary cell | `e1rmCellText` renders `E1RM_ABOVE_CAP_COPY` = `"Not meaningful above 10 reps"`, built by interpolating `E1RM_MAX_VALID_REPS` | No — the em dash is reserved for `unavailable` (nothing logged), which is a different and true fact |
| Performance chart, some qualifying sessions | Non-qualifying sessions omitted from `points`; in-place caption `"N sessions above 10 reps aren't plotted — estimated 1RM isn't meaningful there."` | No |
| Performance chart, no qualifying session | Dedicated `e1rm-above-cap` state with its own heading/body; both switches stay mounted | No |
| Records screen, `best_e1rm` empty | `"Estimated 1RM is only shown for sets of 10 reps or fewer."` | No |
| `summary-query.ts` `bestE1rmKg` | `estimated1RM` returns `null` above the cap, so the field is `null` and never a computed number | n/a |

No surface can render a computed number above the cap: every path goes through `estimated1RM`,
and `resolveE1rmDisplay`'s `above-cap`/`unavailable` split is a closed union, so a wrong
explanation is unrepresentable rather than merely avoided. Every numeral in the copy is
interpolated from the imported constant — grep found no literal `10` in any e1RM string.
Durability evidence: the `2 sessions above 10 reps aren't plotted…` caption is asserted with
`{ exact: true }` alongside `img` name `/2 points/`.

### 3. D-07 — no user-visible string implies a calendar week

Repo-wide grep for `this week`, `monday`, `week starts`, `vs last week`, `calendar week` across
all `.ts`/`.tsx` (excluding tests/e2e/dist/node_modules) returns **four hits, none user-facing on
a phase-9 surface**: two pre-existing `WEEKDAY_NAMES` arrays (`SessionDateField.tsx`,
`history-query.ts`) that name a *specific date's* weekday, and two source comments in
`analytics-engine` explaining that a calendar week is deliberately not used. The rendered copy is
`Last 7 Days` / `Rolling window ending today.` / `Last 84 days` / `vs previous 7 days` — every
span derived from `PROGRESS_WINDOW_DAYS`, `TREND_WEEKS × TREND_BUCKET_DAYS`, never a literal.
Durability case 70 asserts `/this week|monday|week starts/i` has count 0 on the rendered card.

### 4. D-09 — no fabricated zero

- `weeklyProgress` returns `{ hasActivity: false, tracks: [] }` for an untrained window, so a row
  of zero bars is structurally unrepresentable; the card swaps in an empty state. Case 74 asserts
  `progressbar` count 0 and `Sets` (exact) count 0.
- `historyTrendSeries.qualifies()` omits a non-qualifying bucket from `points` entirely. Case 22
  seeds an empty bucket **and** a warm-up-only bucket and asserts the chart announces `/2 points/`
  while `/3 points/` and `/4 points/` have count 0, and that the warm-up's `2000.00 kg` never
  reaches the screen.
- `exerciseSeries` `continue`s on a session with no qualifying set rather than pushing a zero.
- `buildChartGeometry.paddedDomain` never anchors at zero, and the baseline is documented as chrome
  ("no data is ever drawn on it"); a one-point series emits `line: ''`/`area: ''` so no segment is
  drawn to an implied origin.
- `deltaBetween` returns `not-comparable` against a zero denominator, so no `0%` or infinite chip.
  Case 22 asserts `/vs previous 7 days/` has count 0 for that seed.
- Grep for `?? 0` / `|| 0` across all 27 phase source files: **zero matches**.

### 5. Criterion 4 — local-only, and causal rather than seed-then-mount

Covered in truth 4 above. Both halves hold: no network primitive exists in the read path, and
case 75 is the only case in the suite that can fail on a stale `useFocusEffect` dependency array
or a mount-memoised result. `navigateAwayAndBack` performs a real Expo Router push/pop against
`/reset-password` (a route that reads no database and fires no network call), so the mounted
screen loses and regains focus rather than remounting.

### 6. Scope leakage

Grep for `heatmap`, `body-map`, `bodymap`, `drill.down` across all source: three hits, all
**comments explaining the deliberate absence** (`WeeklyProgressCard.tsx` "muscle-group drill-down
is explicitly Phase 10 … a card that looks tappable but is not is worse", plus two in
`pr-vocabulary.ts`). No body-map component, no muscle-group route, no recompute-on-edit —
`detectPrsForSession` is the pre-existing Phase 5 write path and `WorkoutSummary.tsx:303`
explicitly defers superseding an invalidated row to Phase 10. ANLY-04/05/09 remain `[ ]` in
REQUIREMENTS.md and mapped to Phase 10.

### 7. Wave-3 recovery, scrutinised independently

The three recovered plans (09-04/05/06) were verified from source and from a fresh suite run, not
from their summaries:

- The `accessibilityValue` → `aria-*` fix is real and correct in `WeeklyProgressCard.tsx:65-68`,
  with a comment naming react-native-web 0.21 as the cause. Case 72 asserts the actual DOM
  attributes `aria-valuemin="0"`, `aria-valuemax="12"`, `aria-valuenow="3"` and
  `progressbar` count 3 — a prop-level unit assertion could not have caught the original defect,
  and this one cannot pass without the DOM contract holding.
- The hand-merged append-only files are internally consistent: `__durability.web.tsx` declares
  four new mount states and every new setter appears in **every** other method's mutual-exclusion
  list (checked all five seed-and-mount methods); `playwright.config.ts` lists all four new specs
  in the `durability` project — and all four executed in my run, so no spec is orphaned by a
  missing config line.
- `test-support.ts` seeders write real `workout_session` / `session_exercise` / `logged_set` rows
  through Drizzle; nothing is stubbed.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `packages/analytics-engine/src/{constants,bucketing,chart-geometry,exercise-series,trend-series,weekly-progress,e1rm-display}.ts` | Pure, clock-free aggregation | ✓ VERIFIED | 691 lines, 88 passing tests forced past cache. No `Date.now`, no `Intl`, no DB import; every boundary derived from a `todayLocalDate` argument (D-10). |
| `apps/mobile/components/TrendChart.tsx` | The only `react-native-svg` consumer; shape primitives only | ✓ VERIFIED | Imports `Svg, Circle, Line, Path` only — no `Text`/`TSpan`/`TextPath` (R16 holds); labels are sibling RN `<Text>`; canvas announced once via `accessibilityRole="image"`, children hidden from AT. |
| `apps/mobile/components/SegmentedChipRow.tsx` | Shared single-select switch | ✓ VERIFIED | `radiogroup` + `radio` + `accessibilityState`, 48×48 minimum. Used by all four call sites. |
| `apps/mobile/app/exercise-performance.tsx` | S4 route | ✓ VERIFIED | 416 lines, six-branch state classifier, wired at `/exercise-performance`. |
| `apps/mobile/app/records.tsx` | S3 route | ✓ VERIFIED | 230 lines, wired at `/records`. |
| `apps/mobile/components/{WeeklyProgressCard,HistoryTrendCard,RecordRow}.tsx` | S1, S2, record row | ✓ VERIFIED | All three imported and rendered by a real host, none orphaned. |
| `apps/mobile/lib/db/{records,exercise-history,history-trend,weekly-progress}-query.ts` | Local batched reads | ✓ VERIFIED | Batched (no N+1), local-only, each documents its predicate stance. |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `(tabs)/index.tsx` | `weekly-progress-query.ts` → `weeklyProgress` | third `useFocusEffect` → `readWeeklyProgress` → `WeeklyProgressCard` | ✓ WIRED (case 75) |
| `(tabs)/history.tsx` | `history-trend-query.ts` → `historyTrendSeries` | second `useFocusEffect` → `ListHeaderComponent={<HistoryTrendCard/>}` | ✓ WIRED (cases 21–23) |
| `(tabs)/history.tsx` | `/records` | `onRecords: router.push('/records')`, present in both populated and empty branches | ✓ WIRED |
| `records.tsx` row | `/exercise-performance?exerciseId&metric` | `PERFORMANCE_METRIC_FOR_PR_TYPE[row.prType]` | ✓ WIRED |
| `exercises/[id].tsx` | `/exercise-performance` | unconditional "View performance" pressable | ✓ WIRED |
| `WorkoutSummary.tsx` | `@fitness/analytics-engine` `resolveE1rmDisplay` | `deriveRowDisplay` → `e1rmCellText` | ✓ WIRED (case 78) |

### Data-Flow Trace (Level 4)

| Surface | Rendered value | Source | Status |
|---|---|---|---|
| Last 7 Days tracks | `achieved` / `target` | `logged_set` + `session_exercise` + `workout_session` + `exercise_muscle_mapping` (local SQLite) → `weeklyProgress` | ✓ FLOWING |
| History trend headline/chart | bucket values | `workout_session` window → `historyTrendSeries` | ✓ FLOWING |
| Performance chart | `SeriesPoint.value` | joined `session_exercise`/`workout_session`/`logged_set` → `exerciseSeries` | ✓ FLOWING |
| Records rows | `value`, `setWeightKg` | persisted `personal_record` + batched `logged_set` weight lookup | ✓ FLOWING |
| Workout summary badges | `prTypes` | pure re-derivation of `detectPrs` over the session's own rows | ✓ FLOWING |

No static fallback, no hardcoded literal, no mock reaches any rendered value.

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|---|---|---|---|
| ANLY-01 | Four-metric PR detection | ✓ SATISFIED | `detectPrs` + case 78 |
| ANLY-02 | PRs highlighted in the workout summary | ✓ SATISFIED | Per-metric badges; case 78 names both expected pills exactly |
| ANLY-03 | Browse records, switch metrics | ✓ SATISFIED | Cases 38–42 |
| ANLY-06 | Per-exercise performance, selectable metrics + ranges | ✓ SATISFIED | Metric and range chips; weekly-best bucketing proven not to average |
| ANLY-07 | Full workout history with trends | ✓ SATISFIED | Cases 21–23 above the existing session list |
| ANLY-08 | This week's progress against targets | ✓ SATISFIED | Cases 69–75, including the causal case |
| ANLY-10 | e1RM only where the formula is valid | ✓ SATISFIED | Four-surface sweep above |
| ANLY-04/05/09 | — | out of scope (Phase 10) | Confirmed absent from the codebase |

No orphaned requirements: every ID REQUIREMENTS.md maps to Phase 9 is claimed by a plan and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | `TBD` / `FIXME` / `XXX` across all 56 changed `.ts`/`.tsx` files | — | **None found** |
| — | — | `TODO` / `HACK` / `PLACEHOLDER` / "coming soon" / "not yet implemented" | — | **None found** |
| `apps/mobile/app/records.tsx` | 52, 88 | `colors` prop accepted and destructured but never read | ℹ️ Info | Dead prop; lint-clean, no behavioural effect |

### Behavioural Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Whole durability project | `pnpm --filter mobile test:e2e:durability` | 78 passed / 0 failed, exit 0 | ✓ PASS |
| Criterion 4's causal transition | (case 75, within the run above) | `Sets: 4 of 12` visible, `Sets: 3 of 12` count 0 | ✓ PASS |
| Pure layer, cache bypassed | `npx turbo run test --filter=@fitness/analytics-engine --force` | 6 suites / 88 tests | ✓ PASS |
| Typecheck + lint + unit, workspace-wide | `npx turbo run typecheck lint test` | 21/21 tasks, exit 0 | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` exists in this repository and no plan declares one — the durability
Playwright project is this project's equivalent evidence path and was executed above.

---

## Warnings (non-blocking)

### W1 — Phase 09's deferred UAT items never reached the ROADMAP sweep phases

Six items are recorded in `.planning/WINDOWS.md` (#155, #156, #158, #159, #160, #161) naming
Phase 999.1 or 999.2 as their destination. `.planning/ROADMAP.md`'s **Accumulated items** lists
for both sweep phases end at Phase 08 — no Phase 09 line exists in either. Every phase 01–08
appended its items to the ROADMAP list as well; this phase stopped at WINDOWS. The consequence is
narrow but real: whoever runs the 999.1/999.2 sweeps reads ROADMAP, and would not test this
phase's surfaces.

This is a tracking gap, not a goal gap — it fails no success criterion and no requirement, so it
does not change the verdict. Suggested closure, appended to the respective ROADMAP lists:

- 999.1: Phase 09 test 1 — TrendChart, RecordRow, the Last 7 Days card and the History trend card
  rendered on a real iOS and Android build (`react-native-svg`'s native path was never exercised).
- 999.2: Phase 09 test 2 — visual review at maximum OS font scale of the chart's two-label axis
  row, the ANLY-10 caption, the Records rows (no line clamp on either line), the three progress
  tracks, and the performance range switch.

### W2 — a latent cross-surface e1RM/top-weight population difference (informational, pre-existing)

`summary-query.ts` derives `topWeightKg` and `bestE1rmKg` over `workingCompleted`
(`countsTowardWorkingVolume` — warm-ups excluded, **partials included**), while `detectPrs` and
this phase's `heaviest`/`e1rm` chart use `countsTowardRecords` (partials also excluded). A
partial-ROM set can therefore raise the workout summary's displayed top weight or e1RM cell
without ever being eligible to set the corresponding record. This is shipped Phase 5 behaviour
that Phase 9 deliberately did not touch — `e1rm-display.ts` documents the choice explicitly
("Filtering inside would silently change the shipped summary cell's value") under the plan's
R15 no-other-pixel-changes rule. Flagged so Phase 10's recompute work can decide it on purpose
rather than inherit it.

### W3 — cosmetic

`RecordsScreenView` takes a `colors: ThemeColors` prop it never reads.

---

## Human Verification Required

None that gates this phase. The two categories that normally would — native rendering and
maximum-font-scale visual judgment — are governed by this project's standing deferral policy
(Phases 999.1 and 999.2) and are recorded above under `deferred`. They are tracked, not dropped,
and per that policy they do not hold the phase at `human_needed`. See W1 for the one bookkeeping
step still owed to make that tracking effective.

## Gaps Summary

None. All five ROADMAP success criteria and all seven in-scope requirements are satisfied by code
I read and by suites I executed rather than by any SUMMARY claim. The four checks most likely to
hide a plausible-looking defect — the set-count predicate against the exercise strip, the ANLY-10
rep cap at every surface, D-09's absent-not-zero discipline, and criterion 4's "after logging,
before sync" causality — each have a browser-executed case that would fail if the discipline had
slipped, and each passed in my own run. The wave-3 recovery holds up under independent
inspection: the `aria-*` fix is real, the hand-merged mutual-exclusion lists are complete, and no
recovered spec is orphaned by a missing Playwright config entry.

---

_Verified: 2026-08-29_
_Verifier: Claude (gsd-verifier)_
