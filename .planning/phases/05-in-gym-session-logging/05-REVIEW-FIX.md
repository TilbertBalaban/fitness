---
phase: 05-in-gym-session-logging
fixed_at: 2026-08-25T07:36:05Z
review_path: .planning/phases/05-in-gym-session-logging/05-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-08-25T07:36:05Z
**Source review:** .planning/phases/05-in-gym-session-logging/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (Critical: 3, Warning: 3 — Info excluded per `fix_scope: critical_warning`)
- Fixed: 6
- Skipped: 0

**Verification environment:** worktree-isolated (`.claude/worktrees/rf-05-86782-1787642048`, since
merged into the branch this report ships on). Mobile: full `jest` suite (75 suites / 1282 tests) +
`tsc --noEmit` + `turbo run typecheck`/`lint` all run inside the worktree against a symlinked
`node_modules`. API: `tsc --noEmit`, the full `jest --config test/jest-e2e.json` suite (21 suites /
251 tests) against the live local Postgres (`fitness-postgres-1`), and `nest build` all run inside
the worktree with a symlinked `.env`. All numbers are reproducible from the merged branch, since the
worktree's changes are now part of its history.

## Fixed Issues

### CR-01: Two full e2e specs never wired into any Playwright project

**Files modified:** `apps/mobile/playwright.config.ts`
**Commit:** `2369108`
**Applied fix:** Added `history.spec.ts` and `workout-summary.spec.ts` to the `durability`
project's `testMatch` array, matching the "needs only a browser" criterion the other 7 files there
share. Verified discovery with `npx playwright test --list --project=durability` (does not launch a
browser) — both files are now attempted to load, failing only on the same pre-existing,
environment-local native-module resolution issue the review itself already characterized as
unrelated to this fix. Did not execute the specs themselves, per the browser-testing prohibition.

### CR-02: `logSet`'s set-index assignment is an unguarded read-then-write race

**Files modified:** `apps/mobile/lib/db/log-set.ts`, `apps/mobile/lib/db/__tests__/log-set.test.ts`,
`apps/mobile/lib/db/__tests__/session-mutations.test.ts`
**Commit:** `884c36c`
**Applied fix:** Wrapped the `select(max(set_index))` and the subsequent `insert` in a single
`db.transaction(...)`, mirroring the precedent `deleteSession` already established in
`history-mutations.ts`. PowerSync serializes `db.transaction()` calls on one local SQLite
connection, so a second `logSet` call's select cannot start until the first call's whole
transaction (select AND insert) has committed — closing the double-tap race at its source.
Deliberately did **not** add a unique `(session_exercise_id, set_index)` constraint to either
schema (the review's "and/or" alternative) — see WINDOWS #131 below for the reasoning.

Added a regression test with a fake db that snapshots `max(set_index)` at select-**issue** time
(not resolution time) and defers resolution under explicit test control, reproducing the exact
race. Verified failing (`[1, 1]`) against the pre-fix code and passing (`[1, 2]`) against the fix.

### CR-03: PR badge attribution collapses onto `exercise_id`, misfiring for a repeated exercise

**Files modified:** `apps/mobile/lib/db/summary-query.ts`, `apps/mobile/lib/db/__tests__/summary-query.test.ts`
**Commit:** `ad130d3`
**Applied fix:** Re-keyed the PR-type aggregation map from `exerciseId` to `sessionExerciseId`
(`sessionExerciseIdBySetId`, `prTypesBySessionExerciseId`), using the `session_exercise` id already
in scope in the per-exercise loop. Breakdown rows now read their PR types by their own
`sessionExerciseId`, so a PR earned on one instance of a repeated exercise (e.g. Bench Press logged
twice in one session, superset-style) no longer badges every instance sharing that `exerciseId`.

Added a regression test: two `session_exercise` rows sharing an `exerciseId`, a PR earned on only
one instance — asserts the badge appears on that instance alone.

### WR-01: Trailing draft `set_index` computed by row count, diverging from `logSet`'s own next index

**Files modified:** `apps/mobile/lib/session/set-row-builders.ts`,
`apps/mobile/app/(tabs)/__tests__/workout.test.tsx`
**Commit:** `645aac8`
**Applied fix:** Changed `draftSetIndex` in `buildSetRows` from `existingSets.length + 1` (a count)
to `max(existingSets.map(row => row.setIndex)) + 1` — the same formula `logSet` itself uses. A
warm-up ladder regenerated after working sets already exist can leave gaps in the raw `set_index`
sequence (the deleted warm-ups' indices are gone, so the new ladder lands above the working sets'
indices even though `orderForDisplay` still buckets warm-ups first for rendering); the draft row's
`previousSetReference` lookup now always agrees with what `logSet` will actually assign next.

Added a regression test reproducing the gapped sequence directly (working sets at 4–5, a
regenerated warm-up at 6) — asserts the draft resolves to 7. Verified failing (4) against the
pre-fix count-based code.

### WR-02: `duplicateSession` is not transactional

**Files modified:** `apps/mobile/lib/db/history-mutations.ts`, `apps/mobile/lib/db/log-set.ts`,
`apps/mobile/lib/db/powersync.ts`, `apps/mobile/lib/db/session-mutations.ts`,
`apps/mobile/lib/db/__tests__/history-mutations.test.ts`
**Commit:** `50d37e7`
**Applied fix:** Wrapped `startSession` and the `addSessionExercise`/`setSessionExerciseTargets`
copy loop in one `db.transaction`, matching `deleteSession`'s own precedent in the same file. The
two reads of the source session stay outside the transaction (they inform the write, not part of
it). Since `WriteTx` (the transaction callback's handle) could not satisfy the `WriteDb` type these
three functions previously required, added a new `WriteHandle = WriteDb | WriteTx` union in
`powersync.ts` and widened `startSession`/`addSessionExercise`/`setSessionExerciseTargets` (D-33's
named funnel) to accept it — `logSet` deliberately keeps the narrower `WriteDb`, since it opens its
own nested transaction, which `WriteTx` cannot do.

Added a regression test asserting `duplicateSession` opens exactly one transaction call, mirroring
`deleteSession`'s own existing transaction-count test in the same file.

### WR-03: `hasInvalidField` doesn't validate every `logged_set` column it accepts

**Files modified:** `apps/api/src/sync/sync.service.ts`, `apps/api/test/poison-pill.e2e-spec.ts`
**Commit:** `144b3ee`
**Applied fix:** Added shape checks for `completed` (new `isValidOptionalBoolean` helper), `side`
and `parent_set_id` (both `isValidOptionalStringOrNull`), and `rest_taken_seconds`
(`isNonNegativeIntegerOrNull`) to the `logged_set` branch of `hasInvalidField`, mirroring the
pattern already used for the fields it did validate.

Added five e2e cases to `poison-pill.e2e-spec.ts`, run against the real `/sync` endpoint and a live
local Postgres, matching that suite's existing `session_exercise` validation pattern. Verified
failing against the pre-fix code for `completed`/`side`/`rest_taken_seconds` (3 of 5); the
`parent_set_id` case passes on both pre- and post-fix code, since Postgres's own type-coercion
already rejects it via `classifyTransactionError`'s SQLSTATE-class defense-in-depth — consistent
with the review's own characterization of this as a shape-completeness gap, not a live correctness
bug for every field.

## Skipped Issues

None — all six in-scope findings were fixed.

## Deliberate Deviations

**CR-02's unique constraint (not added).** REVIEW.md's fix suggestion for CR-02 offered the
`db.transaction` wrap "and/or" a unique `(session_exercise_id, set_index)` constraint on both
schemas as belt-and-suspenders. This fixer applied the transaction wrap only. Filed as **WINDOWS
#131** (kind: `deviation`, phase 05, status: open):

> CR-02 review-fix intentionally did not add a unique (session_exercise_id, set_index) constraint
> to either schema, though REVIEW.md's fix suggestion mentioned it as a belt-and-suspenders option.
> The db.transaction wrap around logSet's select-max-then-insert (log-set.ts) already closes the
> race at its source. Adding the unique constraint would require a live Postgres db:push
> (explicitly out of scope for the review-fix agent) and PowerSync schema-versioning verification
> on the SQLite mirror (untested here). Revisit if a future finding shows the transaction-only fix
> insufficient.

No Postgres migration or `db:push` was run by this fixer, per the explicit constraint against doing
so.

---

_Fixed: 2026-08-25T07:36:05Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
