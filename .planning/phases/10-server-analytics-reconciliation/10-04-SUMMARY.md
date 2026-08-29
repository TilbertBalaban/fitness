---
phase: 10-server-analytics-reconciliation
plan: 04
subsystem: testing
tags: [drizzle, postgres, seed-data, query-budget, performance]

requires:
  - phase: 10-server-analytics-reconciliation
    provides: "10-01's muscle_volume_rollup/analytics_watermark tables and AnalyticsReconciliationService.reconcileSession, 10-02's completed PR-replay reconciliation"
provides:
  - apps/api/src/seed/corpus-shape.ts — CORPUS_MUSCLE_MAPPINGS (weighted, secondary-inclusive muscle taxonomy for the ten seed-ex-* exercises) and PERF_BUDGET.maxQueriesPerReconcile
  - apps/api/src/seed/generate-corpus.ts — ensureMuscleGroups/ensureExerciseMuscleMappings reference-data bootstrap, and reset-path cleanup of muscle_volume_rollup/analytics_watermark
  - apps/api/test/seeded-corpus-perf.e2e-spec.ts — executed, passing assertions that the reconcile query count holds as data grows (criterion 5)
affects: []

actuals:
  tokens: 3636
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A corpus's reference-data taxonomy and the performance ceiling measured against it live in the same file (corpus-shape.ts), so a corpus change cannot silently invalidate its own budget"
    - "A non-vacuity guard runs before any query-count budget assertion in the same spec file, proving the aggregate being budgeted is genuinely populated (not an empty join) before its cost is measured"

key-files:
  created: []
  modified:
    - apps/api/src/seed/corpus-shape.ts
    - apps/api/src/seed/generate-corpus.ts
    - apps/api/test/seeded-corpus-perf.e2e-spec.ts

key-decisions:
  - "PERF_BUDGET.maxQueriesPerReconcile stayed at its planned [ASSUMED] starting value of 24 — the actual measured reconcile query count for both edit-size invariance and history-size invariance came in under the ceiling on the first real run, so no calibration adjustment was needed or recorded."
  - "The plan's 'secondary-only muscle group' non-vacuity check uses 'lower_back' rather than a group computed from CORPUS_MUSCLE_MAPPINGS at large, because two of the ten seed exercises (Plank, Farmer's Carry) are never referenced by any ROUTINE_DAYS entry and are therefore never logged by the corpus generator — a mapping reachable only through either of those two exercises would produce zero rollup rows and fail the assertion for a reason unrelated to secondary-mapping correctness. lower_back is reachable only through the deadlift (which the routine does log) and is never a primary mapping anywhere, so it is a safe, always-populated witness."
  - "Task 3's history-size-invariance test reuses the already-signed-up otherUserId fixture (created in beforeAll for the existing cross-user isolation test) instead of creating a third user, per the plan's own instruction to reuse existing sign-up helpers rather than write a new bootstrap — its session id is looked up fresh inside the new test rather than captured in beforeAll, keeping the edit to beforeAll's existing lines at zero (see Deviations)."

patterns-established:
  - "Any future 'does cost stay flat as history grows' assertion in this codebase should follow the same shape: countQueries wrapping the real service call, one edit against a large-history fixture, one identical edit against a single-session fixture, asserted equal (not merely both under a ceiling)."

requirements-completed: [ANLY-04, ANLY-09]

coverage:
  - id: D1
    description: "The seeded corpus's ten exercises carry a real, weighted, secondary-inclusive muscle taxonomy (CORPUS_MUSCLE_MAPPINGS), so the rollup path computes real weighted-volume math instead of joining to nothing"
    requirement: "ANLY-04"
    verification:
      - kind: e2e
        ref: "apps/api/test/seeded-corpus-perf.e2e-spec.ts#produces a non-vacuously populated muscle_volume_rollup and a real analytics_watermark for the corpus user"
        status: pass
    human_judgment: false
  - id: D2
    description: "The reconcile query ceiling (PERF_BUDGET.maxQueriesPerReconcile) is declared beside the corpus shape it is measured against, and an executed assertion proves editing a past workout stays within it"
    requirement: "ANLY-09"
    verification:
      - kind: e2e
        ref: "apps/api/test/seeded-corpus-perf.e2e-spec.ts#recomputes an edited past workout within the reconcile query ceiling"
        status: pass
    human_judgment: false
  - id: D3
    description: "The reconcile's query count is invariant in the size of the edit (three-set vs thirty-set session) and, critically, invariant in the size of the user's history (a one-session user vs eighteen months of history) — criterion 5 stated literally"
    requirement: "ANLY-09"
    verification:
      - kind: e2e
        ref: "apps/api/test/seeded-corpus-perf.e2e-spec.ts#issues the same reconcile query count editing a three-set session and a thirty-set session"
        status: pass
      - kind: e2e
        ref: "apps/api/test/seeded-corpus-perf.e2e-spec.ts#issues the same reconcile query count against a one-session user as against eighteen months of history"
        status: pass
    human_judgment: false
  - id: D4
    description: "A reset regeneration of the corpus leaves no orphaned muscle_volume_rollup or analytics_watermark rows from a prior run"
    requirement: "ANLY-04"
    verification:
      - kind: e2e
        ref: "apps/api/test/seeded-corpus-perf.e2e-spec.ts (full suite passes with reset: true on every beforeAll run, including repeated local runs against the same live database)"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-08-29
status: complete
---

# Phase 10 Plan 04: Corpus Muscle Taxonomy and Reconcile Query Budget Summary

**The seeded corpus now carries a weighted, secondary-inclusive muscle taxonomy across its ten exercises, and an executed query-count assertion proves editing a past workout costs the same number of statements against eighteen months of history as against a single session — the reconcile ceiling (`PERF_BUDGET.maxQueriesPerReconcile: 24`) held on the first real run with no adjustment needed.**

## Performance

- **Duration:** 14 min (commit span)
- **Started:** 2026-08-29T16:11:15Z (base commit)
- **Completed:** 2026-08-29T16:25:06Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- `CORPUS_MUSCLE_MAPPINGS` (corpus-shape.ts) — a plausible strength-training taxonomy for all ten seed-ex-* exercises, each with one primary mapping at weight factor 1.00 and at least one secondary mapping at a fractional factor (0.50 or 0.30), giving the rollup path real weighted-volume math to compute
- `PERF_BUDGET.maxQueriesPerReconcile: 24`, `[ASSUMED]`, co-located with the corpus shape it is measured against
- `ensureMuscleGroups`/`ensureExerciseMuscleMappings` (generate-corpus.ts) — idempotent reference-data bootstrap, called before `ensureUser`, closing the gap where every rollup computation against the shipped corpus joined to zero muscle mappings
- Reset-path cleanup — `muscle_volume_rollup`/`analytics_watermark` rows for the target user are deleted before the session delete, since both tables cascade on `user_id`, not on `workout_session`, and would otherwise survive a `--reset` regeneration
- A non-vacuity guard (new `it(...)`) proving the corpus's rollup spans at least 3 distinct muscle groups and 50 distinct dates with positive summed weighted volume, including a cell reachable only through a secondary mapping's fractional weight factor (`lower_back`, only ever mapped via the deadlift)
- Three new `it(...)` blocks proving criterion 5 literally: an edited session's reconcile stays within the query ceiling; editing a three-set and a thirty-set session issues the identical query count; editing a fresh one-session user's only session issues the identical query count as editing a session belonging to the eighteen-month corpus user

## Task Commits

1. **Task 1: Give the corpus a real muscle taxonomy, so the rollup path has something to compute** - `52d4e9a` (feat)
2. **Task 2: Prove the rollup is non-trivially populated before budgeting it** - `2d27612` (test)
3. **Task 3: Assert the recompute's query count holds as data grows** - `20cec80` (test)

## Files Created/Modified
- `apps/api/src/seed/corpus-shape.ts` - `CORPUS_MUSCLE_MAPPINGS` (ten exercises, weighted primary/secondary muscle mappings) and `PERF_BUDGET.maxQueriesPerReconcile: 24`
- `apps/api/src/seed/generate-corpus.ts` - `ensureMuscleGroups`, `ensureExerciseMuscleMappings`, and reset-path deletes for `muscle_volume_rollup`/`analytics_watermark`
- `apps/api/test/seeded-corpus-perf.e2e-spec.ts` - one non-vacuity guard plus three query-count-invariance assertions, all appended at the end of the file, zero existing lines rewritten

## Decisions Made
- Kept `PERF_BUDGET.maxQueriesPerReconcile` at its planned `[ASSUMED]` value of 24 — the actual measured query count for every reconcile assertion (ceiling case, edit-size invariance, history-size invariance) came in under 24 on the first real run against the seeded corpus, so no calibration adjustment or WINDOWS.md entry was needed.
- Used `lower_back` (mapped only via the deadlift, secondary role, 0.30 weight factor) as the "reachable only through a secondary mapping" non-vacuity witness, rather than computing a secondary-only group from `CORPUS_MUSCLE_MAPPINGS` generically — two of the ten seed exercises (`seed-ex-plank`, `seed-ex-farmers-carry`) exist only for `load_type` diversity and are never referenced by any `ROUTINE_DAYS` entry, so any mapping reachable only through them would never appear in a real rollup row and would fail the assertion for an unrelated reason.
- Task 3's history-size-invariance case reuses the `otherUserId` fixture already created in `beforeAll` (for the pre-existing cross-user isolation test) instead of creating a third user via `signUp` — its session id is looked up fresh inside the new test with a plain `db.select(...)`, rather than being captured as a new `beforeAll` variable, so the edit to `beforeAll` stayed at zero lines changed (see Deviations below for why this mattered).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Initial edits to shared test-file lines violated the plan's own append-only acceptance gate**
- **Found during:** Task 2, first attempt at wiring `otherUserSessionId` and the new schema imports
- **Issue:** My first draft (a) rewrote the existing `import { user, userPreference, ... } from '../src/db/schema'` line into a multi-line import to add `muscleVolumeRollup`/`analyticsWatermark`, and (b) changed the existing `await pushSetsDirectly(otherUserId, 3);` line in `beforeAll` to capture its return value in a new `otherUserSessionId` variable for later reuse in Task 3. Both are line *modifications*, not pure additions — the plan's Task 2 and Task 3 acceptance criteria both hard-gate on `git diff ... | grep -c "^-[^-]"` being 0 ("append-only... never rewrite a shipped case").
- **Fix:** Reverted both changes. Added the two new imports as a second, separate `import { ... } from '../src/db/schema';` statement (ES modules hoist imports regardless of position, so a second statement is valid and does not touch the first line). Left the `beforeAll` `pushSetsDirectly(otherUserId, 3)` call completely untouched, and instead had the new Task 3 test look up `otherUserId`'s existing session id with a fresh `db.select(...).from(workoutSession).where(eq(workoutSession.userId, otherUserId)).limit(1)` query inside the test itself.
- **Files modified:** `apps/api/test/seeded-corpus-perf.e2e-spec.ts`
- **Verification:** `git diff -- apps/api/test/seeded-corpus-perf.e2e-spec.ts | grep -c "^-[^-]"` returns 0 after both fixes; the full suite still passes.
- **Committed in:** `2d27612` and `20cec80` (the corrected diffs are what was actually committed — the reverted draft was never committed)

---

**Total deviations:** 1 auto-fixed (a self-caught Rule 1 bug, corrected before committing — no incorrect diff ever landed)
**Impact on plan:** No scope creep. The fix is purely mechanical (how two facts get into the test file, not what the test asserts) and the corrected approach satisfies the plan's append-only acceptance criteria exactly as written.

## Issues Encountered

None beyond the self-caught deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Criterion 5 ("history holds its query count as data grows") is now an executed, passing assertion, not an aspirational comment — `pnpm --filter api test:e2e` (23 suites, 282 tests) and `npx turbo run typecheck lint` (7 packages) are both green.
- `apps/api/src/analytics/**` and `apps/api/src/sync/**` are untouched by this plan (verified by grep gate), as is everything under `apps/mobile/` and `packages/**` — no overlap with 10-05, which ran in the same wave.
- The `[ASSUMED]` tag on `PERF_BUDGET.maxQueriesPerReconcile` remains in place; the value held on first measurement, so there is nothing further to calibrate unless a future plan changes the reconcile path's query shape.
- This is the final plan in Phase 10's file-ownership table for `corpus-shape.ts`, `generate-corpus.ts`, and `seeded-corpus-perf.e2e-spec.ts` — no other 10-* plan should touch them further.

## Self-Check: PASSED

All 3 modified files verified present on disk with the expected content; all 3 task commit hashes (`52d4e9a`, `2d27612`, `20cec80`) verified present in `git log`.

---
*Phase: 10-server-analytics-reconciliation*
*Completed: 2026-08-29*
