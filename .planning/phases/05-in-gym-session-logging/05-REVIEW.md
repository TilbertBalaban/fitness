---
phase: 05-in-gym-session-logging
reviewed: 2026-08-25T07:09:11Z
depth: standard
files_reviewed: 101
files_reviewed_list:
  - apps/api/src/db/schema/preference.ts
  - apps/api/src/db/schema/records.ts
  - apps/api/src/db/schema/session.ts
  - apps/api/src/sync/__tests__/patch-update-set.spec.ts
  - apps/api/src/sync/patch-update-set.ts
  - apps/api/src/sync/sync.service.ts
  - apps/api/test/personal-record-sync.e2e-spec.ts
  - apps/api/test/schema-parity.e2e-spec.ts
  - apps/api/test/session-annotations-sync.e2e-spec.ts
  - apps/api/test/user-exercise-preference.e2e-spec.ts
  - apps/mobile/app.json
  - "apps/mobile/app/(tabs)/__tests__/history.test.tsx"
  - "apps/mobile/app/(tabs)/__tests__/workout.test.tsx"
  - "apps/mobile/app/(tabs)/history.tsx"
  - "apps/mobile/app/(tabs)/index.tsx"
  - "apps/mobile/app/(tabs)/profile.tsx"
  - "apps/mobile/app/(tabs)/workout.tsx"
  - apps/mobile/app/__durability.web.tsx
  - apps/mobile/app/rest-timer.tsx
  - apps/mobile/app/workout-summary.tsx
  - apps/mobile/components/EditingWorkoutScreen.tsx
  - apps/mobile/components/ExerciseActionBar.tsx
  - apps/mobile/components/ExercisePage.tsx
  - apps/mobile/components/ExercisePager.tsx
  - apps/mobile/components/ExerciseSlotRow.tsx
  - apps/mobile/components/ExerciseStrip.tsx
  - apps/mobile/components/HistoryActionSheet.tsx
  - apps/mobile/components/NoteSheet.tsx
  - apps/mobile/components/NotificationPermissionPrompt.tsx
  - apps/mobile/components/NumericKeypad.tsx
  - apps/mobile/components/RestTimerBar.tsx
  - apps/mobile/components/RestTimerFullScreen.tsx
  - apps/mobile/components/SessionActionSheet.tsx
  - apps/mobile/components/SessionDateField.tsx
  - apps/mobile/components/SessionHistoryRow.tsx
  - apps/mobile/components/SetRow.tsx
  - apps/mobile/components/TargetsSheet.tsx
  - apps/mobile/components/WarmupSheet.tsx
  - apps/mobile/components/WorkoutInProgressBanner.tsx
  - apps/mobile/components/WorkoutSummary.tsx
  - apps/mobile/components/__tests__/EditingWorkoutScreen.test.tsx
  - apps/mobile/components/__tests__/ExerciseActionBar.test.tsx
  - apps/mobile/components/__tests__/HistoryActionSheet.test.tsx
  - apps/mobile/components/__tests__/RestTimerBar.test.tsx
  - apps/mobile/components/__tests__/SessionActionSheet.test.tsx
  - apps/mobile/components/__tests__/SessionDateField.test.tsx
  - apps/mobile/components/__tests__/TargetsSheet.test.tsx
  - apps/mobile/components/__tests__/WarmupSheet.test.tsx
  - apps/mobile/components/__tests__/WorkoutSummary.test.tsx
  - apps/mobile/e2e/durability.spec.ts
  - apps/mobile/e2e/history.spec.ts
  - apps/mobile/e2e/rest-timer.spec.ts
  - apps/mobile/e2e/schema-redefinition.spec.ts
  - apps/mobile/e2e/session-edit.spec.ts
  - apps/mobile/e2e/session-lifecycle.spec.ts
  - apps/mobile/e2e/workout-screen.spec.ts
  - apps/mobile/e2e/workout-summary.spec.ts
  - apps/mobile/lib/__tests__/rest-alert.test.ts
  - apps/mobile/lib/__tests__/rest-timer.test.ts
  - apps/mobile/lib/db/__tests__/personal-record.test.ts
  - apps/mobile/lib/db/__tests__/session-mutations.test.ts
  - apps/mobile/lib/db/__tests__/session-query.test.ts
  - apps/mobile/lib/db/__tests__/summary-query.test.ts
  - apps/mobile/lib/db/history-mutations.ts
  - apps/mobile/lib/db/history-query.ts
  - apps/mobile/lib/db/log-set.ts
  - apps/mobile/lib/db/personal-record.ts
  - apps/mobile/lib/db/preferences.ts
  - apps/mobile/lib/db/schema.ts
  - apps/mobile/lib/db/session-lifecycle.ts
  - apps/mobile/lib/db/session-mutations.ts
  - apps/mobile/lib/db/session-query.ts
  - apps/mobile/lib/db/summary-query.ts
  - apps/mobile/lib/db/test-support.ts
  - apps/mobile/lib/rest-alert.ts
  - apps/mobile/lib/rest-alert.web.ts
  - apps/mobile/lib/rest-timer.ts
  - apps/mobile/lib/session/__tests__/session-mode.test.tsx
  - apps/mobile/lib/session/auto-advance.ts
  - apps/mobile/lib/session/finish-session.ts
  - apps/mobile/lib/session/session-mode.tsx
  - apps/mobile/lib/session/set-row-builders.ts
  - apps/mobile/package.json
  - apps/mobile/playwright.config.ts
  - docs/platform-modules.md
  - docs/session-vocabularies.md
  - packages/api-contracts/src/__tests__/session.test.ts
  - packages/api-contracts/src/session.ts
  - packages/api-contracts/src/sync.ts
  - packages/pr-rules/jest.config.js
  - packages/pr-rules/package.json
  - packages/pr-rules/src/__tests__/estimated-1rm.test.ts
  - packages/pr-rules/src/__tests__/personal-records.test.ts
  - packages/pr-rules/src/__tests__/warmup.test.ts
  - packages/pr-rules/src/estimated-1rm.ts
  - packages/pr-rules/src/index.ts
  - packages/pr-rules/src/personal-records.ts
  - packages/pr-rules/src/warmup.ts
  - packages/pr-rules/tsconfig.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
findings:
  critical: 3
  warning: 3
  info: 1
  total: 7
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-08-25T07:09:11Z
**Depth:** standard
**Files Reviewed:** 101 (2 non-source: `pnpm-lock.yaml` scanned for unexpected additions only, not read in full; `pnpm-workspace.yaml` skimmed)
**Status:** issues_found

## Summary

This phase is unusually well self-documented — nearly every function carries a comment explaining
a specific invariant it's protecting (D-06 stamp-once, D-33 single funnel, D-30 rules-live-in-one-
place, D-08 platform seam, LOG-14 idempotency, etc.), and I verified every one of the invariants
named explicitly in the phase context by grepping the whole tree for competing writers, and none
were found: exactly two `db.insert(workoutSession)` sites exist in production code (`log-set.ts`'s
`startSession`) plus the one accepted test-fixture exception in `test-support.ts`; `timezone`/
`local_date` are written from exactly `startSession` and the documented `setSessionDate` exception;
`rest-alert.ts`/`rest-alert.web.ts` contain no `Platform.OS` branch; `EditingWorkoutScreen.tsx`
genuinely never imports `scheduleRestAlert`/`shouldAutoAdvance` (grepped, confirmed absent); and
`ExerciseStrip.tsx`'s completion fraction excludes warm-up rows on both the numerator
(`countCompletedWorkingSets`) and the denominator (`session_exercise.target_sets`, which is a
working-set-only prescription column). `packages/pr-rules` is clean, pure, and the only source of
PR/e1RM/warm-up arithmetic — no local reimplementation was found in the mobile app.

Despite that discipline, three real correctness defects survived review, one of them in the test
harness itself (two full e2e specs are silently never executed by any configured Playwright
project — verified by running `playwright test --list`, not just by reading the config), one in
the single most safety-critical write path in the phase (`logSet`'s unguarded set-index
read-then-write), and one in the workout-summary screen's PR-badge display logic for the
explicitly-supported "log the same exercise twice in one session" case. None of these are
security issues — the phase context's assessment that there is no untrusted input beyond the
device owner holds up; the API's sync-apply path (`sync.service.ts`, `patch-update-set.ts`) is
notably careful about ownership, reparenting, and patch-vs-put field scoping, and I did not find a
hole in it.

**Coverage note:** `apps/api/src/sync/sync.service.ts` is 1,936 lines; I read the full values-
builder/validation section (lines 1–950) and the full apply/conflict section for
`workout_session`/`session_exercise`/`logged_set` (lines ~1550–1770), plus the transaction error
classification tail, but did not line-by-line trace every one of the routine/program-table branches
that are copy-shaped siblings of the session branches already verified. I sampled rather than
read exhaustively: `ExerciseActionBar.tsx`, `ExerciseSlotRow.tsx`, `HistoryActionSheet.tsx`,
`SessionActionSheet.tsx`, `RestTimerBar.tsx`, `RestTimerFullScreen.tsx`,
`NotificationPermissionPrompt.tsx`, `SessionHistoryRow.tsx`, `history.tsx` (app screen), `index.tsx`,
`profile.tsx`, `rest-timer.tsx` (app screen), and the four `apps/api/test/*.e2e-spec.ts` files were
skimmed for shape (skipped calls, real assertions) rather than traced line-by-line against the
service code. `pnpm-lock.yaml` was checked only for suspicious/unexpected package additions, not
read. All `__tests__`/`.test.tsx` unit test files were spot-checked for assertion coverage of the
specific defects reported below (confirmed absent) rather than reviewed for general quality.

## Structural Findings (fallow)

None provided for this review — no `<structural_findings>` block was supplied.

## Narrative Findings (AI reviewer)

### CR-01: Two full e2e specs are wired into the repo but never run by any Playwright project

**File:** `apps/mobile/playwright.config.ts:17-26` (and the orphaned specs at
`apps/mobile/e2e/history.spec.ts`, `apps/mobile/e2e/workout-summary.spec.ts`)

**Issue:** `playwright.config.ts` defines two projects, each with an explicit `testMatch` file
list — `durability` (7 named files) and `sync` (1 named file). `apps/mobile/e2e/` contains 10
`*.spec.ts` files; only 8 are named in either `testMatch` array. `history.spec.ts` and
`workout-summary.spec.ts` are not listed in *either* project, which means neither
`pnpm test:e2e` nor `pnpm test:e2e:durability` (nor `npx playwright test` with no filter) ever
executes them — verified empirically, not just by reading the config:

```
$ npx playwright test --list          # no --project filter, all projects
$ npx playwright test --list --project=durability
```
Both list runs attempt to load exactly the 7/8 files named in `testMatch` (each fails to load
only because of an unrelated native-module resolution issue in this environment) and never even
attempt to load `history.spec.ts` or `workout-summary.spec.ts` — they are not silently skipped at
runtime, they are never discovered at all.

`workout-summary.spec.ts` is the one spec in this phase that actually exercises the real
`finishSession → /workout-summary → detectPrsForSession → loadSessionSummary` chain against a real
`@powersync/web` database in a real browser, including the "PR badge appears, then disappears after
a correction, without deleting the underlying `personal_record` row" behavior that CR-03 below
shows is actually broken for a related case. Because this file is invisible to the test runner,
that entire behavior — and everything `history.spec.ts` claims to verify about the History screen —
currently has zero executable coverage, despite both files reading as complete, real, DOM-driven
Playwright specs with concrete assertions (not stubs). This is exactly the kind of gap that looks
like coverage exists when it does not.

**Fix:** Add both files to the `durability` project's `testMatch` array (they fit the same
"needs only a browser" profile as the other 7):
```ts
testMatch: [
  'durability.spec.ts',
  'schema-redefinition.spec.ts',
  'catalog-load.spec.ts',
  'workout-screen.spec.ts',
  'rest-timer.spec.ts',
  'session-lifecycle.spec.ts',
  'session-edit.spec.ts',
  'history.spec.ts',
  'workout-summary.spec.ts',
],
```
Then actually run `pnpm test:e2e:durability` once to confirm both pass before merging (both are
currently marked "written but not executed" per the project's own browser-testing convention, so
this has apparently never happened even locally).

### CR-02: `logSet`'s set-index assignment is an unguarded read-then-write race, reachable by a double-tap

**File:** `apps/mobile/lib/db/log-set.ts:178-205` (the write path); reachable from
`apps/mobile/app/(tabs)/workout.tsx:926-990` (`handleCheckmarkPress`),
`apps/mobile/components/EditingWorkoutScreen.tsx` (same handler shape), and
`apps/mobile/components/WorkoutSummary.tsx:340-346` (`handleCheckmarkPress`)

**Issue:** `logSet` computes the next `set_index` with a plain select-then-insert, with no
transaction, no advisory lock, and no client-side de-duplication:
```ts
const [maxRow] = await db.select({ maxIndex: sql<number | null>`max(${loggedSet.setIndex})` })
  .from(loggedSet).where(eq(loggedSet.sessionExerciseId, input.sessionExerciseId));
const setIndex = (maxRow?.maxIndex ?? 0) + 1;
...
await db.insert(loggedSet).values({ ..., setIndex, ... });
```
Every call site that invokes this on a "complete the trailing draft row" checkmark
(`workout.tsx:943`, the equivalent handler in `EditingWorkoutScreen.tsx`, and
`WorkoutSummary.tsx:344`) has no `disabled`/in-flight guard on the `Pressable` — there is no
`saving` state gating the checkmark the way `TargetsSheet`/`WarmupSheet`/`NoteSheet` gate their own
Save buttons. Two `handleCheckmarkPress` invocations fired in quick succession (a fast physical
double-tap, or two rapid clicks on web) both run their own `select(max)` before either `insert`
lands, and both compute the same `setIndex`, producing two `logged_set` rows with an identical
`(session_exercise_id, set_index)` pair. Neither the SQLite client schema
(`apps/mobile/lib/db/schema.ts`) nor the Postgres schema (`apps/api/src/db/schema/session.ts`)
has a uniqueness constraint on that pair to catch it — `logged_set_sessionExerciseId_setIndex_idx`
is a plain (non-unique) index.

The consequence is not just a cosmetic duplicate number: `previousSetReferencesForSession` and
`previousSetReference` (`session-query.ts`) assume "the prior session's set at this same
`set_index`" resolves to essentially one row per position, and `buildSetRows`'s display ordering
sorts by `set_index`, so a collision produces two rows racing for the same display slot with an
arbitrary tie-break.

**Fix:** Make the index assignment atomic — either wrap the select+insert in a single
`db.transaction` (PowerSync/Drizzle both support this, and `deleteSession` in
`history-mutations.ts` already establishes the pattern in this codebase), or add a client-side
in-flight guard keyed by `sessionExerciseId` so a second tap while the first `logSet` call is still
in flight is a no-op:
```ts
async function handleCheckmarkPress(exerciseId: string, setId: string | null) {
  if (pendingExerciseIds.has(exerciseId)) return;
  pendingExerciseIds.add(exerciseId);
  try { /* existing body */ } finally { pendingExerciseIds.delete(exerciseId); }
}
```
A unique index on `(session_exercise_id, set_index)` in both schemas would also turn this into a
loud failure instead of a silent duplicate, which is preferable given D-01's "durable, never
lost" framing.

### CR-03: The workout summary's "New PR" badge is attributed by exercise, not by session_exercise — misfires when the same exercise appears twice in one session

**File:** `apps/mobile/lib/db/summary-query.ts:229-247`

**Issue:** `session-mutations.ts`'s own `addExerciseToSession` explicitly documents that logging
the same exercise twice in one session is legitimate and expected ("LOG-14 idempotency truth"),
producing two distinct `session_exercise` rows with the same `exercise_id`. `loadSessionSummary`
builds one `ExerciseBreakdown` entry per `session_exercise` row (correct), but then attributes PR
badges like this:
```ts
const personalRecordsBySetId = await computeSessionPrTypesBySetId(sessionId, db); // keyed by loggedSetId — correct
const prTypesByExerciseId = new Map<string, Set<PrType>>();
for (const [loggedSetId, prTypes] of personalRecordsBySetId) {
  const exerciseId = exerciseIdBySetId.get(loggedSetId);   // collapses to exerciseId
  ...
  prTypesByExerciseId.set(exerciseId, set);
}
for (const row of breakdown) {
  row.prTypes = [...(prTypesByExerciseId.get(row.exerciseId) ?? [])];  // re-broadcast to EVERY row sharing that exerciseId
}
```
`computeSessionPrTypesBySetId` correctly computes PR types per individual `logged_set` (via
`walkSessionPrs`, which is per-exercise-in-session-order and correctly scoped). But the
re-aggregation into `prTypesByExerciseId` throws away the `session_exercise` boundary and unions
every PR type earned by *any* instance of that exercise in the session, then assigns that union to
*every* breakdown row for that exercise — including the instance that did not earn it. A user who
does Bench Press as slot 1 and again later as slot 5 in a superset, and only PRs on slot 5, will
see the "New PR" badge on slot 1's card too.

This does not corrupt the durable `personal_record` table (that write path, `detectPrsForSession`,
is correctly keyed by `logged_set_id` and unaffected) — it is purely a summary-screen display bug,
but it directly contradicts this codebase's own stated design principle
(`estimated-1rm.ts`'s comment: "a summary printing a confident number nobody should trust is worse
than one printing nothing") and is untested — `summary-query.test.ts` has no case with two
`session_exercise` rows sharing an `exerciseId`.

**Fix:** Key the aggregation map by `sessionExerciseId`, not `exerciseId`. `exerciseIdBySetId`
would need to become (or be joined against) a `sessionExerciseId`-keyed map instead — the loop
already has `exercise.id` (the session_exercise id) in scope when it populates
`exerciseIdBySetId`, so recording that instead (or alongside) is a small, local change:
```ts
const sessionExerciseIdBySetId = new Map<string, string>();
// ...inside the per-exercise loop: sessionExerciseIdBySetId.set(set.id, exercise.id);
const prTypesBySessionExerciseId = new Map<string, Set<PrType>>();
for (const [loggedSetId, prTypes] of personalRecordsBySetId) {
  const sessionExerciseId = sessionExerciseIdBySetId.get(loggedSetId);
  if (!sessionExerciseId) continue;
  const set = prTypesBySessionExerciseId.get(sessionExerciseId) ?? new Set<PrType>();
  for (const prType of prTypes) set.add(prType);
  prTypesBySessionExerciseId.set(sessionExerciseId, set);
}
for (const row of breakdown) {
  row.prTypes = [...(prTypesBySessionExerciseId.get(row.sessionExerciseId) ?? [])];
}
```

## Warnings

### WR-01: Regenerating warm-up sets after working sets already exist reorders `set_index` away from display order

**File:** `apps/mobile/lib/db/session-mutations.ts:205-235` (`generateWarmupSets`), with a
downstream consequence in `apps/mobile/lib/session/set-row-builders.ts:123`

**Issue:** `WarmupSheet.tsx`'s own doc comment confirms this sheet is reused as the
"regenerate-context sheet" — reachable at any point in a live session, not only before working
sets are logged. `generateWarmupSets` deletes the exercise's uncompleted warm-up rows, then calls
`logSet` once per new ladder entry, and `logSet` assigns `set_index` via
`max(existing set_index for this session_exercise) + 1`. If working sets already exist with higher
indices than the deleted warm-up rows (e.g. warm-ups at 1-3, working sets logged at 4-5, then
warm-up regenerated after only the earlier warm-ups are deleted), the new warm-up ladder is
inserted at indices 6-8 — after the working sets in raw index terms — even though
`orderForDisplay` in `set-row-builders.ts` still buckets warm-ups first for rendering. The
consequence: `set-row-builders.ts:123`'s `draftSetIndex = existingSets.length + 1` (a count, not a
max) silently diverges from the index `logSet` will actually assign next, so the trailing draft
row's `previousSetReference` lookup (`resolveReference` in the same file) can key against the
wrong historical set for that position.

**Fix:** Either scope `logSet`'s `max(set_index)` query to also renumber contiguously after a
warm-up regeneration (recompute every affected row's `set_index` in one pass), or compute
`draftSetIndex` the same way `logSet` computes its own next index (`max + 1`) rather than by
`existingSets.length`, so the two never disagree.

### WR-02: `duplicateSession` is not transactional, unlike every other multi-write mutation in this file

**File:** `apps/mobile/lib/db/history-mutations.ts:45-113`

**Issue:** `duplicateSession` performs one `startSession` insert followed by N
`addSessionExercise` + `setSessionExerciseTargets` pairs in a sequential, un-transacted loop. The
same file's `deleteSession` (lines 119-133) explicitly wraps its three deletes in
`db.transaction(...)` with a comment explaining why: "an interruption between them can never leave
a [child] row pointing at a removed [parent]." `duplicateSession` has the mirror-image risk with no
mirror-image guard: an app crash or force-quit partway through the loop leaves a new, partially
built `workout_session` with some but not all of the source session's exercises/targets — a
silent, incomplete duplicate that the user has no way to distinguish from an intentionally-shorter
one.

**Fix:** Wrap the `addSessionExercise`/`setSessionExerciseTargets` loop (and, ideally, the
`startSession` call) in a single `db.transaction`, matching `deleteSession`'s own precedent in
this file.

### WR-03: `hasInvalidField` doesn't validate the shape of every `logged_set` column it accepts

**File:** `apps/api/src/sync/sync.service.ts:775-786`

**Issue:** The `logged_set` branch of `hasInvalidField` validates `weight_kg`, `reps`,
`set_index`, `set_type`, and `notes`, but not `completed` (expected boolean), `side`, or
`parent_set_id`/`rest_taken_seconds` (expected integer or null). A malformed value for any of
these currently passes application-level validation and only fails at the Postgres layer, relying
entirely on `classifyTransactionError`'s SQLSTATE-class defense-in-depth (which does correctly map
a Postgres type-coercion failure — SQLSTATE class `22`, e.g. `22P02` — to `invalid_field`, so this
is not a correctness bug in practice today). It is a shape-completeness gap in the one module whose
own doc comment stakes its entire design on being an "exhaustiveness gate" for exactly this class
of omission (`patch-update-set.ts:164-178`'s "READ THE MAPPING DIRECTION..." comment).

**Fix:** Add `completed`/`side`/`parent_set_id`/`rest_taken_seconds` shape checks to the
`logged_set` branch of `hasInvalidField`, mirroring the pattern already used for the other
optional fields in this function, so validation failures are reported precisely (`invalid_field`)
at the application layer rather than relying on the database driver's error classification to
catch them incidentally.

## Info

### IN-01: `pnpm-lock.yaml` / `pnpm-workspace.yaml` — no anomalies found

**File:** `pnpm-lock.yaml`, `pnpm-workspace.yaml`

**Issue:** Per the review instructions, `pnpm-lock.yaml` was not read in full; I checked it only
for unexpected new top-level dependencies against `apps/mobile/package.json` /
`packages/pr-rules/package.json`'s stated dependencies and found nothing suspicious (no
unfamiliar/typo-squat-shaped package names, no unpinned `git+`/`file:` protocol entries). No
action needed — recorded for completeness since these two files were explicitly in scope.

---

_Reviewed: 2026-08-25T07:09:11Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
