---
phase: 12-body-metrics-dashboard
reviewed: 2026-08-31T00:00:00Z
depth: standard
files_reviewed: 76
files_reviewed_list:
  - apps/api/src/db/schema.ts
  - apps/api/src/db/schema/records.ts
  - apps/api/src/sync/patch-update-set.ts
  - apps/api/src/sync/sync.service.ts
  - apps/api/test/body-metric.e2e-spec.ts
  - apps/api/test/dashboard-widget.e2e-spec.ts
  - apps/api/test/progress-photo.e2e-spec.ts
  - apps/mobile/app/(tabs)/index.tsx
  - apps/mobile/app/(tabs)/profile.tsx
  - apps/mobile/app/(tabs)/workout.tsx
  - apps/mobile/app/__durability.web.tsx
  - apps/mobile/app/__tests__/body-metrics-screen.test.ts
  - apps/mobile/app/__tests__/photo-composite-screen.test.ts
  - apps/mobile/app/__tests__/quick-actions.test.ts
  - apps/mobile/app/body-metric-trend.tsx
  - apps/mobile/app/body-metrics.tsx
  - apps/mobile/app/photo-composite.tsx
  - apps/mobile/app/progress-photos.tsx
  - apps/mobile/components/BodyMetricRow.tsx
  - apps/mobile/components/BodyweightTrendWidget.tsx
  - apps/mobile/components/DashboardWidgetHost.tsx
  - apps/mobile/components/DashboardWidgetPicker.tsx
  - apps/mobile/components/MetricEntryActionSheet.tsx
  - apps/mobile/components/MetricEntryRow.tsx
  - apps/mobile/components/MetricEntrySheet.tsx
  - apps/mobile/components/MetricValueKeypad.tsx
  - apps/mobile/components/MuscleHeatmapWidget.tsx
  - apps/mobile/components/NextUpWidget.tsx
  - apps/mobile/components/PhotoCaptureConfirmSheet.tsx
  - apps/mobile/components/ProgressPhotoActionSheet.tsx
  - apps/mobile/components/ProgressPhotoPlaceholder.tsx
  - apps/mobile/components/ProgressPhotoTile.tsx
  - apps/mobile/components/QuickActionSheet.tsx
  - apps/mobile/components/RecentRecordsWidget.tsx
  - apps/mobile/components/TrackKindSheet.tsx
  - apps/mobile/components/__tests__/BodyMetricRow.test.tsx
  - apps/mobile/components/__tests__/DashboardWidgetPicker.test.tsx
  - apps/mobile/components/__tests__/MetricEntrySheet.test.tsx
  - apps/mobile/components/__tests__/QuickActionSheet.test.tsx
  - apps/mobile/components/__tests__/TrackKindSheet.test.tsx
  - apps/mobile/e2e/body-metric.spec.ts
  - apps/mobile/e2e/dashboard-widgets.spec.ts
  - apps/mobile/e2e/photo-composite.spec.ts
  - apps/mobile/e2e/progress-photo.spec.ts
  - apps/mobile/e2e/quick-action.spec.ts
  - apps/mobile/lib/db/__tests__/body-metrics.test.ts
  - apps/mobile/lib/db/__tests__/dashboard-widgets.test.ts
  - apps/mobile/lib/db/body-metric-trend-query.ts
  - apps/mobile/lib/db/body-metrics.ts
  - apps/mobile/lib/db/dashboard-widgets.ts
  - apps/mobile/lib/db/progress-photos.ts
  - apps/mobile/lib/db/schema.ts
  - apps/mobile/lib/db/test-support.ts
  - apps/mobile/lib/photos/__tests__/composite-layout.test.ts
  - apps/mobile/lib/photos/capture.ts
  - apps/mobile/lib/photos/capture.web.ts
  - apps/mobile/lib/photos/composite-layout.ts
  - apps/mobile/lib/photos/composite.ts
  - apps/mobile/lib/photos/composite.web.ts
  - apps/mobile/lib/photos/constants.ts
  - apps/mobile/lib/photos/downscale.ts
  - apps/mobile/lib/photos/downscale.web.ts
  - apps/mobile/lib/photos/photo-store.ts
  - apps/mobile/lib/photos/photo-store.web.ts
  - apps/mobile/package.json
  - apps/mobile/playwright.config.ts
  - docs/body-metric-vocabularies.md
  - docs/platform-modules.md
  - ops/powersync/sync-rules.yaml
  - packages/api-contracts/src/__tests__/body-metrics.test.ts
  - packages/api-contracts/src/__tests__/sync.test.ts
  - packages/api-contracts/src/__tests__/units.test.ts
  - packages/api-contracts/src/body-metrics.ts
  - packages/api-contracts/src/index.ts
  - packages/api-contracts/src/sync.ts
  - packages/api-contracts/src/units.ts
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 12: Body Metrics & Dashboard Code Review Report

**Reviewed:** 2026-08-31
**Depth:** standard
**Files Reviewed:** 76
**Status:** issues_found

## Summary

This phase adds push apply paths for `body_metric` and `progress_photo`, a wholly new
`dashboard_widget` table, and a large client surface (body metrics logging/trends, progress
photos, before-and-after composite, dashboard widgets, quick actions). The server-side sync path
(`sync.service.ts`, `patch-update-set.ts`, `sync.ts`) was traced closely against the sibling
pattern the phase context calls out (`excluded_exercise`/`personal_record`/`equipment_profile`):
ownership for all three new tables is derived exclusively from the authenticated session
(`userId` argument), never from `data.user_id`; closed-vocabulary validation (`BODY_METRIC_KIND_SET`,
`WIDGET_KIND_SET`) runs in `hasInvalidField` before any row is touched; and `patch-update-set.ts`'s
three new `PatchFieldMap`s correctly mark `id`/`userId` as server-derived (`null` = always-written-
from-the-resolved-value) and every other column as wire-mapped (written only when the PATCH names
it) — no field is silently clobbered on a narrow PATCH. `ops/powersync/sync-rules.yaml`'s new
`dashboard_widget` query is scoped `WHERE user_id = auth.user_id()` like every sibling query. The
client write paths (`dashboard-widgets.ts`, `body-metrics.ts`, `progress-photos.ts`) scope every
write by both row id and `userId`, and `dashboard-widgets.ts` correctly reuses
`programs/order-index.ts`'s `appendOrderIndex`/`computeReorder` rather than reimplementing reorder
arithmetic (D-25). Object-URL lifecycle in the two photo screens (`progress-photos.tsx`,
`photo-composite.tsx`) revokes prior URIs before creating new ones and on unmount.

No blockers were found. The issues below are test-coverage gaps in exactly the two areas the phase
context flagged for focused attention, plus a real (if low-impact) unresolved-promise bug in the
web photo-capture path and a couple of smaller robustness gaps.

## Warnings

### WR-01: No PATCH-clobber regression test exists for the three new tables' PatchFieldMaps

**File:** `apps/api/src/sync/__tests__/patch-update-set.spec.ts`
**Issue:** The phase context explicitly calls out "the PATCH rule from plan 02-13" as one of the
two areas requiring focused attention for this phase, and by direct code inspection
`BODY_METRIC_PATCH_FIELDS`, `PROGRESS_PHOTO_PATCH_FIELDS`, and `DASHBOARD_WIDGET_PATCH_FIELDS` in
`apps/api/src/sync/patch-update-set.ts` are all correctly shaped (every genuinely-patchable column
maps to its wire key; only `id`/`userId` map to `null`). However, `patch-update-set.spec.ts` — the
suite that unit-tests `patchAwareSet` against every `PatchFieldMap` — has test cases only for
`LOGGED_SET_PATCH_FIELDS`, `WORKOUT_SESSION_PATCH_FIELDS`, `SESSION_EXERCISE_PATCH_FIELDS`,
`EXERCISE_PATCH_FIELDS`, and `USER_EXERCISE_PREFERENCE_PATCH_FIELDS`. None of the three e2e specs
added this phase (`body-metric.e2e-spec.ts`, `progress-photo.e2e-spec.ts`,
`dashboard-widget.e2e-spec.ts`) contain a `PATCH` op either — every case in all three files uses
`op: 'PUT'` (the default). There is currently no automated test anywhere in the repository that
would catch a future regression where, e.g., a narrow PATCH to `dashboard_widget.position`
(reorder) silently clobbers `widget_kind` or `enabled`, or a PATCH to `progress_photo.note`
clobbers `storage_key`. Correctness today rests entirely on manual code review, not on a
falsifiable test — the same failure mode CR-04/T-02-05 in this file's own comments describe as
"passing any test that only asserts... while quietly discarding the user's edit."
**Fix:** Add unit cases to `patch-update-set.spec.ts` for `BODY_METRIC_PATCH_FIELDS`,
`PROGRESS_PHOTO_PATCH_FIELDS`, and `DASHBOARD_WIDGET_PATCH_FIELDS` (a PATCH naming one field leaves
every other field out of the produced `Partial<V>`), and add at least one `op: 'PATCH'` case to each
of the three new e2e specs verifying an unnamed column survives a narrow PATCH against a live
Postgres row (mirroring `session-annotations-sync.e2e-spec.ts`'s own "a push that omits notes
entirely leaves an existing note intact" case).

### WR-02: `capturePhoto()` on web never resolves if the user cancels the file picker

**File:** `apps/mobile/lib/photos/capture.web.ts:8-19`
**Issue:** The native sibling (`capture.ts`) explicitly resolves `null` when the picker is
cancelled or permission is denied. The web implementation creates an `<input type="file">`,
registers `onchange`, and calls `.click()`, but registers no `cancel` listener and no other
completion path. When a user opens the browser's file picker and dismisses it without choosing a
file, `onchange` never fires and the promise returned by `capturePhoto()` never settles — it hangs
forever. Every call site (`progress-photos.tsx`'s `handleAddPhoto`, `index.tsx`'s
`handleOpenPhotoCapture`) awaits this promise directly with no timeout, so on web, cancelling the
picker leaves that async function permanently pending (a leaked promise/closure, and — for any
future call site that shows a loading spinner before this `await` — a stuck spinner with no way to
recover short of navigating away). There is no test file for `capture.web.ts` at all.
**Fix:** Listen for the `cancel` event (supported in Chromium/Firefox on `<input type="file">`) and
resolve `null` from it, mirroring the native contract:
```ts
export function capturePhoto(): Promise<CapturedPhoto | null> {
  return new Promise((resolve) => {
    const input = window.document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    let settled = false;
    input.onchange = () => {
      settled = true;
      const file = input.files?.[0];
      resolve(file ? { blob: file } : null);
    };
    input.addEventListener('cancel', () => {
      if (!settled) resolve(null);
    });
    input.click();
  });
}
```

### WR-03: `photo-composite.tsx`'s `reload()` has no error handling — an unhandled rejection on a failed read

**File:** `apps/mobile/app/photo-composite.tsx:224-253`
**Issue:** The sibling screen `progress-photos.tsx` wraps its equivalent `reload()` body in
`try/catch`, sets a `failed` state, and renders an error block (`ProgressPhotosScreenView`'s
`state === 'error'` branch). `photo-composite.tsx`'s `reload()` has no `try/catch` at all, and this
screen has no `error`/`failed` state or UI branch (`CompositeScreenState` is only
`'not-enough-photos' | 'ready'`). If `loadProgressPhotos`, `hasPhotoBytes`, or `getPhotoUri` throws
(e.g., a local SQLite read failure, an IndexedDB error), the rejection is unhandled inside the
`void (async () => { ... })()` invoked from `useFocusEffect`, and the screen is left stuck with
`rows === null` (the function returns `if (rows === null) return null;` just above the final
return), rendering nothing at all with no path to recovery other than navigating away and back.
**Fix:** Wrap `reload()`'s body in `try/catch`, matching `progress-photos.tsx`'s shape, and add an
`error` state to `CompositeScreenState`/`deriveCompositeScreenState` (or reuse the existing
`renderStateBlock`-style pattern from the sibling screens) so a read failure here degrades the same
way it does everywhere else in this phase.

### WR-04: `deletePhoto` fully applies the DELETE before attempting the byte deletion, so a body-write failure alone still leaves the row gone

**File:** `apps/mobile/lib/db/progress-photos.ts:114-125`
**Issue:** `deletePhoto` reads `storageKey`, deletes the `progress_photo` row, and only then calls
`deletePhotoBytes`. This ordering is deliberate and documented as acceptable for the "row is gone,
blob is orphaned-but-invisible" case, mirroring `savePhoto`'s own bytes-first insert ordering
rationale in reverse. However there is no test exercising the failure path itself (e.g.,
`deletePhotoBytes` rejecting) to confirm the row deletion is not rolled back and the caller's
`reload()` still runs — `progress-photos.tsx`'s `handleConfirmDelete` has no `try/catch` around
`deletePhoto`, so if `deletePhotoBytes` throws (native `file.delete()` can throw on some platforms
for permission/locking reasons), the row is already gone from SQLite but the unhandled rejection
propagates out of the `Pressable`'s `onPress={() => void handleConfirmDelete()}` handler, and
`reload()` on the line after `deletePhoto` never runs — leaving the UI showing the just-deleted
photo until the next focus event.
**Fix:** Wrap the `deletePhoto`/`reload()` pair in `handleConfirmDelete` (and the equivalent flow if
one exists in `photo-composite.tsx`) in `try/catch`, and confirm via test that a `deletePhotoBytes`
rejection still leaves the row deleted and the gallery reloaded rather than silently stale.

## Info

### IN-01: `deletePhoto`'s row-then-bytes ordering documented rationale duplicates `savePhoto`'s comment without being independently verified by a test

**File:** `apps/mobile/lib/db/progress-photos.ts:106-125`
**Issue:** The comment above `deletePhoto` explains the ordering choice at length, but no test in
`apps/mobile/lib/db/__tests__/` (not in scope of this file list, but worth noting) exercises the
"bytes deletion fails after the row is already gone" case directly — only the happy path is likely
covered. This is a documentation/test-symmetry gap, not a functional defect; the bytes-first vs.
row-first split is intentional and reasonable, but its "invisible orphan is better than a broken
row" claim would benefit from the same falsifiable-test treatment `savePhoto`'s own comment implies
for the insert side.
**Fix:** Add a unit test asserting that when `deletePhotoBytes` throws, the row is nonetheless
absent from a subsequent `loadProgressPhotos` read.

### IN-02: `normalizeRequiredDecimal`/`isNonNegativeDecimalOrNull` allow an explicit `value: null` PATCH to silently zero out a logged metric

**File:** `apps/api/src/sync/sync.service.ts:876-895, 733-735`; `apps/api/src/db/schema/records.ts:43`
**Issue:** `body_metric.value` is `NOT NULL` in Postgres, but `hasInvalidField`'s check for
`body_metric` (`if (d.value !== undefined && !isNonNegativeDecimalOrNull(d.value)) return true;`)
accepts an explicit `value: null`, and `toBodyMetricValues` then calls
`normalizeRequiredDecimal(d.value)`, which turns `null`/`undefined` into the string `'0'`. Combined
with `patchAwareSet` (which writes `value` whenever the wire key `'value'` is present in `op.data`,
regardless of what it maps to), a client PATCH of `{ value: null }` against an existing
`body_metric` row is accepted and silently rewrites the stored weight/measurement to `0` rather
than being rejected `invalid_field`. This exact shape is copied verbatim from the pre-existing
`personal_record` pattern (`toPersonalRecordValues`/`normalizeRequiredDecimal`), so it is not a
defect introduced by this phase specifically, but it is a live path in code this phase adds a
second copy of, and a `0` bodyweight/measurement is a plausible, silently-wrong value a user would
notice on their trend chart without any error surfaced.
**Fix:** Consider tightening `hasInvalidField`'s `body_metric`/`personal_record` `value` check to
reject an explicit `null` (`isNonNegativeDecimal`, not `-OrNull`) rather than accepting it and
falling back to `'0'`, since `value` is genuinely required on both tables and there is no legitimate
"clear this measurement" PATCH shape today (D-10 clearing is a DELETE, not a PATCH-to-null).

---

_Reviewed: 2026-08-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
