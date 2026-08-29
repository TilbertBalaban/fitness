# 09-04 Summary — Last 7 Days card (ANLY-08)

**Completed:** 2026-08-29
**Status:** complete
**Provenance:** the executor was killed by an API session rate limit during its verification step. Its two implementation commits were already in the worktree; the spec and the harness wiring were not committed. The orchestrator recovered both, finished verification, and fixed one defect the spec caught. Recorded here rather than hidden because the plan was not carried to completion by a single agent.

## What shipped

- `packages/analytics-engine` — consumed `weeklyProgress` / `ProgramTargetSlotInput` from 09-02; no package changes.
- `apps/mobile/lib/db/weekly-progress-query.ts` — one batched rolling-window read plus the program-derived target, no per-exercise query.
- `apps/mobile/components/WeeklyProgressCard.tsx` — three tracks (Sets, Exercises, Muscles trained), the no-target branch, and the all-or-nothing empty state.
- `apps/mobile/app/(tabs)/index.tsx` — the card mounted below `NextUpCard`, refreshed by the shipped `useFocusEffect` + `active`-flag idiom. No `.watch()`.
- `apps/mobile/e2e/weekly-progress.spec.ts` — 7 cases, executed.

## The defect the spec caught

The tracks carried `accessibilityValue={{ min, max, now }}`. **react-native-web 0.21 dropped that prop**, so each track rendered `role="progressbar"` with an `aria-label` and *no* `aria-valuemin` / `aria-valuemax` / `aria-valuenow` — a silent rectangle to a screen reader on web, while the unit test (which asserts React props, not DOM) stayed green. Replaced with the `aria-*` spelling, which React Native has accepted since 0.71, so one set of props is correct on both targets. The unit assertion was updated to match the DOM contract rather than the legacy prop.

This is exactly what the case "every track announces its bounds and its current value, so none is a silent rectangle" was written to prove, and it only failed because the spec was actually executed.

## Evidence

| Check | Result |
|---|---|
| `pnpm --filter mobile test:e2e:durability` | **78 passed, 0 failed** (whole project) |
| `weekly-progress.spec.ts` alone | 7 passed |
| `pnpm --filter mobile test` | 1946 passed / 108 suites |
| `npx turbo run typecheck lint test` | 21 tasks successful |

The causal case for success criterion 4 passes: with the card already mounted, seeding a further qualifying set and driving a real router push/pop raises the numeral. That is the case that fails if the focus effect carries a stale dependency array, and no seed-then-mount case can prove it.

## Deferred, not gated

Native rendering (999.1) and max-font-scale visual review (999.2) — recorded in WINDOWS, never a checkpoint.
