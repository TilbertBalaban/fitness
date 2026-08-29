---
phase: 10-server-analytics-reconciliation
reviewed: 2026-08-29T17:22:30Z
depth: standard
files_reviewed: 42
files_reviewed_list:
  - apps/api/package.json
  - apps/api/src/analytics/__tests__/personal-record-replay.spec.ts
  - apps/api/src/analytics/__tests__/reconciliation.spec.ts
  - apps/api/src/analytics/analytics.module.ts
  - apps/api/src/analytics/muscle-volume.ts
  - apps/api/src/analytics/personal-record-replay.ts
  - apps/api/src/analytics/reconciliation.service.ts
  - apps/api/src/app.module.ts
  - apps/api/src/db/schema.ts
  - apps/api/src/db/schema/analytics.ts
  - apps/api/src/seed/corpus-shape.ts
  - apps/api/src/seed/generate-corpus.ts
  - apps/api/src/sync/sync.module.ts
  - apps/api/src/sync/sync.service.ts
  - apps/api/test/analytics-rollup.e2e-spec.ts
  - apps/api/test/personal-record-sync.e2e-spec.ts
  - apps/api/test/schema-parity.e2e-spec.ts
  - apps/api/test/seeded-corpus-perf.e2e-spec.ts
  - apps/mobile/app/(tabs)/__tests__/history.test.tsx
  - apps/mobile/app/(tabs)/history.tsx
  - apps/mobile/app/__durability.web.tsx
  - apps/mobile/app/__tests__/muscle-map.test.ts
  - apps/mobile/app/muscle-map.tsx
  - apps/mobile/components/MuscleDrilldownSheet.tsx
  - apps/mobile/components/MuscleHeatmap.tsx
  - apps/mobile/components/MuscleVolumeRow.tsx
  - apps/mobile/components/__tests__/MuscleDrilldownSheet.test.tsx
  - apps/mobile/components/__tests__/MuscleHeatmap.test.tsx
  - apps/mobile/components/__tests__/MuscleVolumeRow.test.tsx
  - apps/mobile/e2e/muscle-map.spec.ts
  - apps/mobile/lib/analytics/__tests__/muscle-map-labels.test.ts
  - apps/mobile/lib/analytics/muscle-map-labels.ts
  - apps/mobile/lib/db/__tests__/muscle-volume-query.test.ts
  - apps/mobile/lib/db/__tests__/schema.test.ts
  - apps/mobile/lib/db/muscle-volume-query.ts
  - apps/mobile/lib/db/schema.ts
  - apps/mobile/lib/db/test-support.ts
  - apps/mobile/playwright.config.ts
  - ops/powersync/sync-rules.yaml
  - packages/analytics-engine/src/__tests__/muscle-map-window.test.ts
  - packages/analytics-engine/src/__tests__/muscle-map.test.ts
  - packages/analytics-engine/src/__tests__/muscle-volume.test.ts
  - packages/analytics-engine/src/index.ts
  - packages/analytics-engine/src/muscle-map-window.ts
  - packages/analytics-engine/src/muscle-map.ts
  - packages/analytics-engine/src/muscle-volume.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-08-29T17:22:30Z
**Depth:** standard
**Files Reviewed:** 42
**Status:** issues_found

## Summary

Reviewed the server-side analytics reconciliation pipeline (muscle-volume rollup, personal-record
replay, watermark bookkeeping), the sync ingress that drives it, and the client-side rollup+overlay
merge and Muscle Map UI. The pure aggregation functions (`muscleVolumeCells`, `replayPersonalRecords`,
`diffRecordKeys`, `mergeMuscleVolumeCells`, `muscleMapPoints`) are well-tested, deterministic, and
correctly implement the documented D-01/D-04/D-10 rules (secondary-muscle weighting, untrained-vs-zero
distinction, delete-then-insert vacating stale cells, strict tie-breaking).

The one serious defect found is in how `sync.service.ts` computes the "new local_date" it hands to
`AnalyticsReconciliationService.reconcileSession` for a `workout_session` PATCH — it is silently
wrong whenever the PATCH omits both `local_date` and `started_at`, which is the case for the single
most common workout_session mutation in the app (finishing, pausing, or discarding a session). This
was not caught by the new e2e suite because the one PATCH test that exercises `newLocalDate`
(`analytics-rollup.e2e-spec.ts`, "moving a session to a different local_date...") deliberately
includes `local_date` in its PATCH payload — the gap this finding describes is the payload shape that
test never sends. See CR-01 below.

Two further findings are logic bugs of lesser severity (a missing per-user filter, and dead code), and
two are minor consistency/robustness notes.

## Critical Issues

### CR-01: `workout_session` PATCH reconciliation uses a fabricated `local_date` whenever the patch doesn't name one — corrupts the analytics watermark's meaning on the single most common session mutation

**File:** `apps/api/src/sync/sync.service.ts:391-418` (root cause, `toWorkoutSessionValues`), consumed at `apps/api/src/sync/sync.service.ts:1849-1851` and `apps/api/src/sync/sync.service.ts:1886-1899`

**Issue:**

`toWorkoutSessionValues` computes `localDate` like this:

```ts
const startedAt = d.started_at ? new Date(d.started_at) : new Date();
...
localDate: d.local_date ?? startedAt.toISOString().slice(0, 10),
```

For a genuine PUT (first insert of a new session) this fallback is safe — a new session always
carries both fields. But this same function is also called for every **PATCH** op
(`values = ... toWorkoutSessionValues(op.id, userId, op.data) ...`), and PowerSync's CRUD queue only
puts *changed* columns into a PATCH's `data`. `patch-update-set.ts`'s `patchAwareSet` correctly
excludes `localDate` from the actual SQL `UPDATE ... SET` clause when `local_date` is absent from
`op.data` (this is the exact LOG-22 fix already applied to `timezone` — see the comment at
sync.service.ts:407-409) — so the *persisted row* is safe.

What is **not** guarded is `newLocalDate`, captured at sync.service.ts:1889:

```ts
const workoutSessionValues = values as WorkoutSessionValues;
newLocalDate = workoutSessionValues.localDate;
```

This reads the full, patch-**unaware** `values` object, not the patch-aware `set` clause. So whenever
a PATCH omits both `local_date` and `started_at`, `newLocalDate` becomes today's UTC calendar date
(`new Date()` at call time) — a value with no relationship to the session actually being edited.

This is not a rare edge case: `apps/mobile/lib/db/session-lifecycle.ts` shows every one of the app's
three workout_session status transitions omits both fields:

```ts
// pauseSession
.set({ pausedAt: now.toISOString(), status: PAUSED_STATUS })
// finishSession
.set({ endedAt: now.toISOString(), status: COMPLETED_STATUS, restTargetAt: null })
// discardSession
.set({ status: DISCARDED_STATUS })
```

Every completed workout therefore reaches `reconcileSession` with a **correct** `oldLocalDate`
(captured pre-write from the existing row, sync.service.ts:1697) but a **fabricated** `newLocalDate`.
`affectedLocalDates` (reconciliation.service.ts:24-26) then includes this phantom date alongside the
real one, and `writeRollupCells` recomputes it. In the common case this recompute is a harmless no-op
(it re-derives whatever the phantom date's rollup already should be from the live DB), but the
watermark update is not harmless:

```ts
const maxAffectedDate = affectedDates.reduce((max, date) => (date > max ? date : max));
...
computedThroughDate: sql`GREATEST(${analyticsWatermark.computedThroughDate}, excluded.computed_through_date)`,
```

Because the fabricated date is server "now" (UTC), it is very often the *largest* date in
`affectedDates`, so `computedThroughDate` gets advanced to a calendar date this push had nothing to do
with and never actually verified — on every single "finish workout" call. If the device's local
calendar day differs from the server's UTC day (exactly the overnight-session case this phase is
meant to get right), or if another aggregate in the same batch that legitimately owns "today" hasn't
committed yet, the watermark can end up claiming "computed through today" before today's real
contribution has been reconciled at all, silently defeating the whole point of a monotonic watermark.

**Fix:** `newLocalDate` must reflect what was actually (or will actually be) persisted, not
`toWorkoutSessionValues`'s insert-shaped fallback. The simplest correct fix is to only trust the
computed `localDate` when this op is a PUT or when `local_date` was actually present in the incoming
patch; otherwise it did not change, so reuse the already-captured `oldLocalDate`:

```ts
if (op.type === 'workout_session') {
  const nextSeq = sql`nextval('sync_seq')`;
  const workoutSessionValues = values as WorkoutSessionValues;
  const patchOmittedLocalDate = op.op === 'PATCH' && !('local_date' in (op.data ?? {}));
  newLocalDate = patchOmittedLocalDate ? oldLocalDate : workoutSessionValues.localDate;
  ...
```

Add a regression test alongside `analytics-rollup.e2e-spec.ts`'s existing local_date-move case: patch
a completed, already-rolled-up session with only `{ status: 'completed', ended_at: ... }` (no
`local_date`) and assert the watermark and rollup for a date unrelated to the session are unchanged.

## Warnings

### WR-01: `loadHasAnyHistory` accepts a `userId` but never filters the query on it

**File:** `apps/mobile/app/muscle-map.tsx:45-53`

**Issue:**

```ts
async function loadHasAnyHistory(userId: string | null, db: WriteDb): Promise<boolean> {
  if (!userId) return false;
  const rows = await db
    .select({ id: workoutSession.id })
    .from(workoutSession)
    .where(eq(workoutSession.status, COMPLETED_STATUS))
    .limit(1);
  return rows.length > 0;
}
```

`userId` is used only for the initial null-check; the actual query has no `eq(workoutSession.userId,
userId)` clause, unlike every other reader in this phase (`loadMuscleMapWindow`, `loadMuscleDrilldown`,
`loadLocalMuscleVolumeCells`) which all scope by `userId`. In normal single-account operation this is
masked because a device's local PowerSync database only ever mirrors one user's rows. But this
function's entire purpose is to distinguish "this signed-in user has no history at all" (state
`no-history`) from "this window is quiet" (state `nothing-in-window`) — see
`deriveMuscleMapScreenState`. If the local SQLite database ever retains a previous account's
`workout_session` rows (account switch on a shared device, incomplete local wipe on sign-out, etc.),
this function will report `true` for a brand-new user with zero history of their own, producing the
wrong screen state.

**Fix:**

```ts
const rows = await db
  .select({ id: workoutSession.id })
  .from(workoutSession)
  .where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, COMPLETED_STATUS)))
  .limit(1);
```

### WR-02: The reconciliation "rescue" read always widens to every current exercise in the session, even when the push already supplied everything it needs

**File:** `apps/api/src/analytics/reconciliation.service.ts:120-131`

**Issue:** `reconcileSession`'s `if (!input.deleted)` block unconditionally re-reads every
`session_exercise` row currently attached to the session and unions all of their exercise ids into
`touchedExerciseIds`, and only backfills `affectedDates` if it started empty. This is correct in the
narrow case it documents (a lone `session_exercise`/`logged_set` edit with no accompanying
`workout_session` op), but it also runs — and re-adds every exercise in the session — for a push that
*already* supplied a complete, correctly-scoped `touchedExerciseIds` (e.g. a `workout_session` PATCH
that only changes `notes`). The result is that `reconcilePersonalRecords` replays and re-diffs every
exercise in the session on every push that touches the session at all, not just the exercises the push
actually changed. This is bounded (by session size, not total history) so it does not break the
"statement count does not grow with history" contract this phase cares most about, but it is wasted
work on the hot path and a source of surprising side effects (e.g. `reconciled_at`/`server_seq`
churn on unrelated exercises' `personal_record` rows) that a future reader could easily mistake for a
bug report.

**Fix:** Only run the current-session-exercises read when either `touchedExerciseIds` or
`affectedDates` is still empty after the op loop, e.g.:

```ts
if (!input.deleted && (affectedDates.length === 0 || touchedExerciseIds.size === 0)) {
  ...
}
```

(Confirm against the "lone logged_set edit" case, which supplies neither, before narrowing further.)

## Info

### IN-01: Dead branch in `topTrainedPoint`'s tie-break guard

**File:** `packages/analytics-engine/src/muscle-map-window.ts:96-104`

**Issue:** `if (best === null || point.relativeIntensity > (best.relativeIntensity ?? -Infinity))` —
`best` is only ever assigned a point whose own `relativeIntensity` is non-null (the loop `continue`s on
`point.relativeIntensity === null` before reaching the assignment), so `best.relativeIntensity` can
never be null once `best` is non-null, and the `?? -Infinity` fallback is unreachable.

**Fix:** `point.relativeIntensity > best.relativeIntensity` is sufficient once `best` is known non-null
via the `||` short-circuit; drop the `?? -Infinity`.

### IN-02: `MuscleDrilldownSheetView`'s `colors` prop is accepted and immediately discarded

**File:** `apps/mobile/components/MuscleDrilldownSheet.tsx:109-120`

**Issue:** `MuscleDrilldownSheetView` destructures `colors` and its first statement is `void colors;` —
the prop is threaded in by the wrapper (`MuscleDrilldownSheet`) but never used to render anything. The
comment says this mirrors "MuscleMapScreenView's own house shape," but `MuscleMapScreenView` actually
*uses* its `colors` prop (passed through to `MuscleHeatmap`). Here it is pure dead weight: every call
site pays to resolve `useThemeColors()` and pass it down for no effect.

**Fix:** Drop the `colors` prop from `MuscleDrilldownSheetViewProps`/`MuscleDrilldownSheetView` and the
`useThemeColors()` call in the wrapper, unless a near-term follow-up plan is already known to need it —
if so, a one-line comment saying so would prevent this from being flagged as dead code again.

---

_Reviewed: 2026-08-29T17:22:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
