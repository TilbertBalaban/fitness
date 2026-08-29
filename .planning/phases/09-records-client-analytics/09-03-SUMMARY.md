---
phase: 09-records-client-analytics
plan: 03
subsystem: analytics
status: complete
tags: [records, personal-records, keyset-pagination, workout-summary, e2e, accessibility]

requires:
  - "@fitness/api-contracts: PR_TYPES, PrType, formatWeight, WeightUnit"
  - "@fitness/pr-rules: E1RM_MAX_VALID_REPS"
  - "@fitness/analytics-engine: E1rmDisplay, resolveE1rmDisplay, E1RM_ABOVE_CAP_COPY, PerformanceMetricId (09-01)"
  - "apps/mobile/components/SegmentedChipRow.tsx (09-01)"
  - "apps/mobile/lib/analytics/chart-labels.ts: formatChartDateLabel, pluralizeCount (09-01)"
  - "apps/mobile/app/exercise-performance.tsx: the /exercise-performance route a record row navigates to (09-01)"
provides:
  - "apps/mobile/lib/analytics/pr-vocabulary.ts: PR_TYPE_CHIP_LABELS, PR_TYPE_BADGE_LABELS, PERFORMANCE_METRIC_FOR_PR_TYPE"
  - "apps/mobile/lib/db/records-query.ts: loadRecordsPage, formatRecordValue, RecordListRow, RecordsPage, RecordsCursor"
  - "apps/mobile/components/RecordRow.tsx: RecordRowView, RecordRow"
  - "apps/mobile/app/records.tsx: the /records route, deriveRecordsScreenState, RecordsScreenView"
  - "apps/mobile/components/WorkoutSummary.tsx: e1rmCellText, and RowDisplay.e1rm as the three-branch union"
  - "apps/mobile/lib/db/test-support.ts: seedPersonalRecords"
affects:
  - "apps/mobile/app/(tabs)/history.tsx (header action row + empty state ONLY — 09-05 owns ListHeaderComponent next wave)"
  - "apps/mobile/app/__durability.web.tsx (append-only)"
  - "apps/mobile/playwright.config.ts (append-only)"

tech-stack:
  added: []
  patterns:
    - "One vocabulary module keyed by the shipped enum, typed as a total Record so a fifth metric is a compile error"
    - "Keyset pagination over (achieved_at, id) with three batched reads, mirroring history-query.ts"
    - "renderStateBlock as a plain called function, not a JSX component — the direct-invocation walker cannot see past a component boundary"

key-files:
  created:
    - apps/mobile/lib/analytics/pr-vocabulary.ts
    - apps/mobile/lib/analytics/__tests__/pr-vocabulary.test.ts
    - apps/mobile/lib/db/records-query.ts
    - apps/mobile/lib/db/__tests__/records-query.test.ts
    - apps/mobile/components/RecordRow.tsx
    - apps/mobile/components/__tests__/RecordRow.test.tsx
    - apps/mobile/app/records.tsx
    - apps/mobile/app/__tests__/records.test.ts
    - apps/mobile/e2e/records.spec.ts
  modified:
    - apps/mobile/app/(tabs)/history.tsx
    - apps/mobile/app/(tabs)/__tests__/history.test.tsx
    - apps/mobile/components/WorkoutSummary.tsx
    - apps/mobile/components/__tests__/WorkoutSummary.test.tsx
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/playwright.config.ts
    - apps/mobile/e2e/workout-summary.spec.ts

decisions:
  - "personal_record.value carries a REP COUNT for most_reps_at_weight and the achieving weight exists nowhere on the row — resolved through a third batched logged_set read"
  - "formatRecordValue pluralizes the rep count via the shipped pluralizeCount idiom, so a one-rep record never reads '1 reps'"
  - "The record row's date is sliced from the stored ISO instant, never parsed into a Date — a Date would re-derive the day from the reading device's timezone"
  - "deriveRowDisplay wraps the injected estimator so a throw stays observable after resolveE1rmDisplay's internal catch, preserving the shipped badges-drop-with-the-cell isolation"
  - "The above-cap e1RM cell keeps the shipped text-body/foreground-muted class rather than switching to Label, so R15's no-other-pixel-changes rule is not bent"

metrics:
  duration: "~50 min"
  completed: 2026-08-29

actuals:
  tokens: 20850
  tasks: 3
  commits: 5
---

# Phase 9 Plan 03: Records Screen and the Two Phase 5 Corrections Summary

A lifter can now open `/records` from the History tab, browse the records they hold most recent first, and switch between all four PR metrics without ever being stranded — reading the same persisted `personal_record` rows the badge already celebrated — while the workout summary's badges finally say WHICH record was set and its estimated-1RM cell explains a rep-cap suppression instead of blanking.

---

## What Was Built

**Task 1 — one vocabulary, one keyset reader** (`3266633` RED, `a09772c` GREEN)

`lib/analytics/pr-vocabulary.ts` holds all three record-metric maps — chip labels, badge labels, and the performance-metric mapping — each typed as a **total `Record<PrType, …>`** so a fifth member of the shipped enum is a compile error rather than a blank chip. Both label maps live in one module precisely so the Records chips and the summary badges cannot drift into disagreeing about what a record is called. The `most_reps_at_weight → heaviest` entry is commented as an explicit fallback (that metric has no time series), and `best_set_volume → volume` carries its own warning: the record is ONE set's `weight × reps` while the destination chart is the SESSION total, so the chart legitimately never contains the number the row displayed.

`lib/db/records-query.ts` pages the persisted table in **three batched reads** — the page, `loadExerciseNameMap`, and one `logged_set` read over exactly the page's non-null originating set ids — with a keyset cursor over `(achieved_at, id)` and the shipped signed-in-only guard. It imports no `pr-rules` helper at all (D-01: it reads, it does not recompute).

**The defect the plan predicted was real and is handled.** `personal_record.value` is a `numeric(10,3)` string for all four metrics, but only three of them are weights — `most_reps_at_weight` stores a **rep count**, and the weight it was achieved at exists **nowhere on the record row**. That is what the third batched read is for. `formatRecordValue` rounds the count back to a whole number and joins it with the resolved set weight; when the originating set is missing or unweighted it renders the count alone, deliberately **not** a dash — the em-dash convention means "no value", and here the weight simply is not part of what the row records. All of this is commented at the function, because a reader who assumes kilograms produces a plausible, silently wrong number.

**Task 2 — the screen, the row, the way in** (`ee0c9f6` RED, `6bf1238` GREEN)

`RecordRowView` mirrors `SessionHistoryRowView`'s thumbnail-less shape with the chevron **inside** the single press target (one hit region per row) and the metric in the announced name, because the chip row's selection is not otherwise reachable from a row in the reading order. Neither line takes a clamp.

`app/records.tsx` is a flat root route matching the shipped `workout-summary.tsx` convention, with the `{ userId, db }` override the harness mounts. Its per-metric empty state is the screen's load-bearing detail: the chip row **stays mounted** and only the list area is replaced, so switching to a metric with no records never strands the lifter — and there is no separate screen-level empty state, one code path only. The estimate metric gets its own body copy with the rep cap interpolated from `E1RM_MAX_VALID_REPS`, never spelled as a numeral.

`history.tsx` changed by exactly **21 lines**: the header row from `justify-end` to `justify-between` with "Records" leading, plus the same link in the empty state. The list, the modals, the view model and `deriveHistoryScreenState` are untouched, and `ListHeaderComponent` does not appear in the file — 09-05 owns that next wave.

**Task 3 — the two corrections, proven in a browser** (`f0948fa`)

`renderPrBadges` now looks up `PR_TYPE_BADGE_LABELS[prType]`; the pill shape, `bg-accent/10` fill, typography and wrapping container are byte-identical. `deriveRowDisplay` returns `RowDisplay.e1rm: E1rmDisplay` and the new `e1rmCellText` renders the estimate, `E1RM_ABOVE_CAP_COPY`, or the shipped em dash. **The population is unchanged**: `resolveE1rmDisplay` applies no predicate of its own and receives exactly the rows the screen already renders, so the cell's *value* is identical and only its *explanation* changed. The whole file diff is **43 changed lines**.

`workout-summary.spec.ts` was updated in the same commit, and **strengthened rather than weakened**: it now names `Heaviest PR` and `Volume PR` exactly and asserts `Est. 1RM PR` has count 0 — that the two pills read *differently* is the entire point of the correction, and a substring match could not tell them apart.

---

## Evidence — real numbers, all executed

| Check | Result |
|---|---|
| `pnpm --filter mobile test:e2e:durability` | **63 passed, 0 failed (4.0m)** — the whole project, not just the new file |
| `pnpm --filter mobile test` | **104 suites, 1864 tests, all passed**, zero skipped |
| `npx turbo run typecheck lint` | **14 tasks successful** |
| `pnpm --filter mobile test -- --testPathPattern "(pr-vocabulary\|records-query)"` | 2 suites, 33 tests passed |
| `pnpm --filter mobile test -- --testPathPattern "(RecordRow\|records\|history)"` | 9 suites, 84 tests passed |
| `pnpm --filter mobile test -- --testPathPattern WorkoutSummary` | 22 tests passed |

The five new e2e cases in the green full-project run:

```
✓ 30 records.spec.ts › seeded records render most recent first, formatted in the selected metric's own units (2.8s)
✓ 31 records.spec.ts › a most-reps record renders a whole rep count joined with its set's weight, never a three-decimal number (2.9s)
✓ 32 records.spec.ts › switching to a metric with no records shows that metric's empty copy with the switch still visible (2.9s)
✓ 33 records.spec.ts › the estimate metric's empty state names the rep cap rather than the generic copy (3.2s)
✓ 34 records.spec.ts › switching back restores the rows the previous metric had (2.9s)
✓ 63 workout-summary.spec.ts › finishing a workout with a new PR shows the badge, and correcting the set below the prior best removes it (4.1s)
```

Case 31 is the one that matters most: it asserts the DOM shows `12 reps @ 100.00 kg` and that neither `12.000` nor `12.00 kg` appears anywhere — the stored rep count reaching the screen as kilograms would have passed a weaker assertion.

09-01's selector findings held exactly as inherited: `getByRole('radio', { name })` drives the chip row and `toHaveAccessibleName(/…/)` reads the row's announced name. No `testID` was added to any surface.

---

## Acceptance Gates

| Gate | Result |
|---|---|
| `grep -c "PR_TYPES" pr-vocabulary.ts` ≥ 1 | 1 ✓ |
| `grep -cE "^export const (CHIP\|BADGE\|PERFORMANCE_METRIC)…"` = 3 | 3 ✓ |
| `records-query.ts` non-comment `offset` = 0 | 0 ✓ |
| `records-query.ts` `foldPriorBest\|detectPrs` = 0 | 0 ✓ |
| `db: WriteDb = getPowerSync()` ≥ 1 | 1 ✓ |
| `.watch(` in `records-query.ts` / `records.tsx` = 0 | 0 / 0 ✓ |
| `numberOfLines` in `RecordRow.tsx` = 0 | 0 ✓ |
| `SegmentedChipRow` in `records.tsx` ≥ 1, no `FilterChipRow`/`SelectField` import | 2 / 0 ✓ |
| `E1RM_MAX_VALID_REPS` ≥ 1, non-comment `10 reps` = 0 | 2 / 0 ✓ |
| `justify-between` ≥ 1, `Records` ≥ 2 in `history.tsx` | 1 / 9 ✓ |
| `git diff --stat history.tsx` < 30 lines | 21 ✓ |
| `ListHeaderComponent` in `history.tsx` = 0 | 0 ✓ |
| `New PR` in component and spec = 0 | 0 / 0 ✓ |
| `PR_TYPE_BADGE_LABELS` / `E1RM_ABOVE_CAP_COPY` / `estimateFn` in `WorkoutSummary.tsx` | 2 / 2 / 6 ✓ |
| non-comment `Not meaningful above` = 0 (copy imported) | 0 ✓ |
| `git diff --stat WorkoutSummary.tsx` < 45 lines | 43 ✓ |
| `git diff __durability.web.tsx \| grep -c "^-"` ≤ 1 | 1 (the diff header only — append-only held) ✓ |
| `records.spec.ts` in `playwright.config.ts` = 1 | 1 ✓ |
| `packages/analytics-engine`, `apps/api`, `package.json`, `theme-colors.ts`, `global.css`, `root-stack.tsx`, `schema.ts` untouched | `git diff 7ae39c4..HEAD` over all of them is empty ✓ |

---

## Deviations from Plan

**1. [Rule 3 - Blocking] `history.test.tsx`'s header destructuring updated (assertions preserved)**

- **Found during:** Task 2
- **Issue:** the plan requires the History header row to hold two links, and requires every pre-existing History assertion to keep passing. The shipped test read the single link as `header.props.children` — with two children that expression is an array, and the destructure threw.
- **Fix:** changed the *locator* (`const [, addAffordance] = header.props.children`) and left both assertions — the `'Add a Past Workout'` accessible name and the `onAddPastWorkout` call — untouched. The empty state's `[heading, body, addAffordance]` destructure was deliberately preserved by placing the new Records link at index 3, after the existing affordance.
- **Files modified:** `apps/mobile/app/(tabs)/__tests__/history.test.tsx`
- **Commit:** `ee0c9f6`

**2. [Rule 3 - Blocking] `test-support.ts`'s import line extended, not purely appended**

- **Found during:** Task 3
- **Issue:** `seedPersonalRecords` must write through the real `logPersonalRecord` (the plan forbids re-implementing the insert), and `test-support.ts` imported neither it nor `PrType`.
- **Fix:** added one import line and one token to the existing `@fitness/api-contracts` type import. Everything else is a pure append at the end. This mirrors 09-01's identical, accepted deviation: the append-only rule guards against reordering and merge collisions, and neither is created here.
- **Files modified:** `apps/mobile/lib/db/test-support.ts`
- **Commit:** `f0948fa`

**3. [CLAUDE'S CALL] The `workers: 1` gate counts 2 and always did**

The plan's criterion `grep -c "workers: 1" playwright.config.ts` is 1 is **unsatisfiable against the shipped file**: line 18 is a comment beginning `// workers: 1 — every case in this project…` and line 28 is the setting itself, so the count was 2 before this plan and is 2 after. `git diff -- playwright.config.ts` shows exactly one added line (`'records.spec.ts',`); `workers`, `fullyParallel` and `webServer` are provably untouched. The gate's real invariant holds; only its arithmetic was wrong.

**4. [CLAUDE'S CALL] The above-cap e1RM cell keeps the shipped Body typography**

The UI-SPEC's ANLY-10 table annotates the above-cap cell "Label/muted", but R15 forbids other pixel changes to `WorkoutSummary.tsx` and the shipped cell is `text-body font-normal text-foreground-muted`. Switching typography for one branch of one cell would make the same list render two type sizes depending on data. Kept the shipped class for all three branches — the correction changes the *words*, not the *style*. Reversible in one line if a human prefers otherwise.

**5. [CLAUDE'S CALL] `formatRecordValue` pluralizes the rep count**

The UI-SPEC pins the row format as `"{reps} reps @ {weight}"`. Rendered literally, a one-rep record reads `"1 reps @ 100.00 kg"`. Used the shipped `pluralizeCount` idiom (`formatBreakdownLine` and the ANLY-10 caption already pluralize), so it reads `"1 rep @ …"`. Asserted both ways in the unit suite.

**6. [CLAUDE'S CALL] `deriveRowDisplay` wraps the injected estimator**

`resolveE1rmDisplay` catches internally, so a throwing estimator would return `unavailable` while leaving a full set of badges standing beside the degraded cell — a half-trusted mix the shipped isolation exists to prevent, and asserted by a pre-existing test. A three-line wrapper records the throw so the badges drop with the cell. The alternative was duplicating the package's population loop inside the component, which is worse.

**7. [CLAUDE'S CALL] `renderStateBlock` is a called function, not a component**

First written as `<StateBlock />`, which made the empty and error copy invisible to the direct-invocation test walker — exactly the trap `WorkoutSummary.tsx`'s `renderPrBadges` comment documents. Converted to a plain called function. Later plans adding states to a hook-free `*View` should copy this, not rediscover it.

---

## Deferred Issues (out of scope — NOT introduced by this plan)

**`api#test` still fails in a fresh worktree for want of `DATABASE_URL`.** Unchanged from 09-01's finding: `apps/api/src/db/drizzle.module.ts` throws at import time when the variable is unset. This plan changed **zero** files under `apps/api` (`git diff 7ae39c4..HEAD -- apps/api` is empty). A missing `.env` in this worktree, not a code defect; not fixed, per the executor scope boundary.

---

## Recorded for later verification (`.planning/WINDOWS.md`, via the CLI)

| Id | Kind | Subject | Where it gets verified |
|---|---|---|---|
| 157 | `unrun-verify` | Records screen rendering on iOS/Android — this machine has neither Xcode nor the Android SDK. Web rendering is proven green. | ROADMAP Phase 999.1 |
| 158 | `unrun-verify` | Subjective visual review of the Records row and chip row at maximum OS font scale. The absent line clamp is grep-enforced and unit-asserted; legibility itself needs a human. | ROADMAP Phase 999.2 |

Neither was allowed to become a checkpoint, per the plan.

**Resolved this plan:** ledger entry **#127** (`unrun-verify`, `workout-summary.spec.ts`, open since 2026-08-24, "written but not executed") was marked `fixed` through `gsd-tools windows fixed 127` — the spec genuinely ran green in a real browser as part of the 63-case durability run above. `.planning/WINDOWS.md` was never hand-edited.

---

## What 09-04 / 09-05 / 09-06 Inherit

1. **`PR_TYPE_CHIP_LABELS` / `PR_TYPE_BADGE_LABELS` / `PERFORMANCE_METRIC_FOR_PR_TYPE`** are the phase's record vocabulary. Import them; do not re-declare a label anywhere.
2. **`history.tsx`'s header action row is now `justify-between` with two links.** 09-05 owns `ListHeaderComponent` on the same file — the header row edit above must survive byte-intact; it is 21 lines and confined to two sites.
3. **`loadRecordsPage` is the pattern for any further keyset reader**: defaulted `db` parameter, signed-in-only guard, no `user_id` row filter, cursor over `(sort_column, id)`, batched reads.
4. **Any state block inside a hook-free `*View` must be a called function**, not a JSX component — see deviation 7.
5. **`seedPersonalRecords`** is appended to `test-support.ts` if a later spec needs record rows; the harness method is `seedRecordsAndOpenRecords`.
6. **`RowDisplay.e1rm` is now the union, not a string.** Any code reading `display.e1rmDisplay` no longer compiles; use `e1rmCellText(display.e1rm, unit)`.

## Known Stubs

None. Every surface this plan ships reads real rows: `/records` pages the persisted `personal_record` table through local SQLite, `formatRecordValue` renders those stored values in each metric's own units, and the summary's badges and e1RM cell derive from the same session data they always did — all proven end to end in a real browser.

## Threat Flags

None. Every `mitigate` disposition in the plan's register is in place and asserted: T-9-11 (per-metric meaning commented at the formatter and asserted per metric, including the rep-count rounding), T-9-12 (a grep gate proves the fold/detect helpers appear nowhere in the reader), T-9-13 (both label maps are total records over the enum, plus an enum-iterating test), T-9-15 (keyset pagination and three batched reads regardless of page size, asserted by a query-count test), T-9-16 (the three-branch union makes above-cap and unavailable structurally distinguishable). T-9-14 is `accept` as planned — the shipped signed-in-only guard is reused verbatim with no wider query. T-9-SC holds: zero registry installs, zero new dependencies. No network endpoint, auth path or schema change was introduced; this plan is read-only against the schema.

## Self-Check: PASSED

All 9 created files verified present on disk; all 5 commits verified present in `git log`.
