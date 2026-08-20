---
phase: 03-exercise-catalog
reviewed: 2026-08-20T00:00:00Z
depth: standard
files_reviewed: 68
files_reviewed_list:
  - apps/api/package.json
  - apps/api/src/app.module.ts
  - apps/api/src/auth/auth.ts
  - apps/api/src/catalog/catalog.controller.ts
  - apps/api/src/catalog/catalog.module.ts
  - apps/api/src/catalog/catalog.service.ts
  - apps/api/src/common/web-origins.ts
  - apps/api/src/db/schema.ts
  - apps/api/src/db/schema/catalog.ts
  - apps/api/src/main.ts
  - apps/api/src/seed/__tests__/normalize-catalog.spec.ts
  - apps/api/src/seed/catalog-taxonomy.ts
  - apps/api/src/seed/normalize-catalog.ts
  - apps/api/src/seed/seed-catalog.ts
  - apps/api/src/sync/__tests__/patch-update-set.spec.ts
  - apps/api/src/sync/patch-update-set.ts
  - apps/api/src/sync/sync.service.ts
  - apps/api/test/catalog-delivery.e2e-spec.ts
  - apps/api/test/concurrent-edit.e2e-spec.ts
  - apps/api/test/cors.e2e-spec.ts
  - apps/api/test/exercise-sync.e2e-spec.ts
  - apps/api/test/poison-pill.e2e-spec.ts
  - apps/api/test/schema-parity.e2e-spec.ts
  - apps/api/test/seed-catalog.e2e-spec.ts
  - apps/api/test/sync-aggregate.e2e-spec.ts
  - apps/api/test/user-exercise-preference.e2e-spec.ts
  - apps/mobile/app/(tabs)/index.tsx
  - apps/mobile/app/__durability.web.tsx
  - apps/mobile/app/_layout.tsx
  - apps/mobile/app/exercises/[id].tsx
  - apps/mobile/app/exercises/__tests__/exercise-detail-screen.test.ts
  - apps/mobile/app/exercises/_layout.tsx
  - apps/mobile/app/exercises/edit/[id].tsx
  - apps/mobile/app/exercises/index.tsx
  - apps/mobile/app/exercises/new.tsx
  - apps/mobile/components/ArchiveDialog.tsx
  - apps/mobile/components/DetailSection.tsx
  - apps/mobile/components/ExerciseImageTile.tsx
  - apps/mobile/components/ExerciseListRow.tsx
  - apps/mobile/components/FilterChipRow.tsx
  - apps/mobile/components/MuscleTargetList.tsx
  - apps/mobile/components/NavBackButton.tsx
  - apps/mobile/components/SearchField.tsx
  - apps/mobile/components/SelectField.tsx
  - apps/mobile/components/SwapSuggestionList.tsx
  - apps/mobile/components/__tests__/ArchiveDialog.test.tsx
  - apps/mobile/components/__tests__/ExerciseImageTile.test.tsx
  - apps/mobile/components/__tests__/ExerciseListRow.test.tsx
  - apps/mobile/components/__tests__/SwapSuggestionList.test.tsx
  - apps/mobile/components/__tests__/exercise-detail-components.test.tsx
  - apps/mobile/e2e/catalog-load.spec.ts
  - apps/mobile/lib/catalog/__tests__/catalog-filter.test.ts
  - apps/mobile/lib/catalog/__tests__/custom-exercise.test.ts
  - apps/mobile/lib/catalog/__tests__/ensure-catalog.test.ts
  - apps/mobile/lib/catalog/__tests__/exercise-detail.test.ts
  - apps/mobile/lib/catalog/__tests__/exercises-screen.test.ts
  - apps/mobile/lib/catalog/__tests__/load-snapshot.test.ts
  - apps/mobile/lib/catalog/__tests__/preferences.test.ts
  - apps/mobile/lib/catalog/__tests__/refresh-catalog.test.ts
  - apps/mobile/lib/catalog/__tests__/search-index.test.ts
  - apps/mobile/lib/catalog/__tests__/smart-swap.test.ts
  - apps/mobile/lib/catalog/catalog-filter.ts
  - apps/mobile/lib/catalog/custom-exercise.ts
  - apps/mobile/lib/catalog/ensure-catalog.ts
  - apps/mobile/lib/catalog/exercise-detail.ts
  - apps/mobile/lib/catalog/load-snapshot.ts
  - apps/mobile/lib/catalog/preferences.ts
  - apps/mobile/lib/catalog/refresh-catalog.ts
  - apps/mobile/lib/catalog/search-index.ts
  - apps/mobile/lib/catalog/smart-swap.ts
  - apps/mobile/lib/db/powersync.ts
  - apps/mobile/lib/db/powersync.web.ts
  - apps/mobile/lib/db/schema.ts
  - apps/mobile/lib/db/test-support.ts
  - apps/mobile/lib/navigation/__tests__/back.test.ts
  - apps/mobile/lib/navigation/__tests__/route-guard.test.ts
  - apps/mobile/lib/navigation/back.ts
  - apps/mobile/lib/navigation/root-stack.tsx
  - apps/mobile/package.json
  - apps/mobile/playwright.config.ts
  - docs/catalog-dataset-license.md
  - docs/catalog-load-types.md
  - ops/powersync/sync-rules.yaml
  - packages/api-contracts/src/__tests__/catalog.test.ts
  - packages/api-contracts/src/__tests__/sync.test.ts
  - packages/api-contracts/src/catalog.ts
  - packages/api-contracts/src/index.ts
  - packages/api-contracts/src/sync.ts
  - scripts/generate-catalog-image-map.cjs
  - scripts/sync-catalog-snapshot.cjs
  - scripts/vendor-catalog-images.cjs
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-08-20
**Depth:** standard
**Files Reviewed:** 68 (of the listed files that are not lockfiles/generated data artifacts)
**Status:** issues_found

## Summary

Full-phase review superseding the 2026-08-19 partial review (which covered only 15 files from
plans 03-13/03-14). This pass covers the whole phase: the catalog-download API surface
(`CatalogController`/`CatalogService`), the sync push validator (`sync.service.ts`/
`patch-update-set.ts`), the seed/normalize pipeline (`normalize-catalog.ts`/`catalog-taxonomy.ts`/
`seed-catalog.ts`), the mobile catalog hydration seam (`ensure-catalog.ts`, new this review), the
three screens that now route through it (`[id].tsx`, `edit/[id].tsx`, `index.tsx`), the
image-sizing fix (`ExerciseImageTile.tsx`), and the signed-in route guard
(`root-stack.tsx`/`app/_layout.tsx`/`exercises/_layout.tsx`).

The two specific risks called out for this review were checked directly and found sound:

- **`ensure-catalog.ts`'s single-flight memo:** the rejection path (`inFlight = null` inside the
  `.catch`) correctly un-wedges the memo on failure, and the synchronous check-then-set in
  `ensureCatalogLoaded` has no race window (JS's single-threaded execution means two calls in the
  same tick always observe the same `inFlight` state). Verified against
  `ensure-catalog.test.ts`'s concurrent/sequential/reject-then-recover cases.
- **The detail/edit screens' hydrating → found/not-found/error state machine:** `resolveDetailScreenState`
  never returns `'hydrating'` (excluded from its return type by construction), and the component's
  own `useState({status: 'hydrating'})` initial value is the only source of that state, so a
  catalog load that is merely still in flight can never be misreported as `'not-found'`. Confirmed
  against `exercise-detail-screen.test.ts`.
- **The `exercises/_layout.tsx` route guard (T-03-58):** `route-guard.test.ts` (new since the prior
  review) now directly asserts, via `expo-router`'s own `getRoutes()`, that all four exercises
  routes are nested under the segment layout (not hoisted to root) and that the segment sits behind
  the same `Stack.Protected` boundary as `(tabs)`. This closes WR-03 from the prior review.

One new gap was found in `sync.service.ts`'s server-side write validator (WR-04 below): it
validates `load_type` and `equipment_required` against their enums but not `movement_pattern`,
despite the file's own comment claiming parity with the client's validator. Two findings from the
prior partial review remain open against the current code and are carried forward unchanged
(WR-02, IN-01); one (WR-01, the FlashList image-recycling bug) is now fixed and is not repeated
here.

## Warnings

### WR-02: `_layout.tsx`'s native header duplicates existing in-page titles on `new.tsx` and `edit/[id].tsx`

**File:** `apps/mobile/app/exercises/_layout.tsx:34-37` (cause); consequence visible in
`apps/mobile/app/exercises/new.tsx:145` and `apps/mobile/app/exercises/edit/[id].tsx:266` (both
currently in this review's scope)
**Issue:** `exercises/_layout.tsx` sets `headerShown: true` for the whole segment with a static
`title` per screen:

```tsx
<Stack.Screen name="new" options={{ title: 'Add Custom Exercise' }} />
...
<Stack.Screen name="edit/[id]" options={{ title: 'Edit Exercise' }} />
```

`new.tsx` still renders its own in-body heading with the identical text
(`<Text className="text-heading font-semibold text-foreground">Add Custom Exercise</Text>`), and
`edit/[id].tsx`'s `EditForm` still renders `<Text ...>Edit Exercise</Text>`. A user sees the same
title twice — once in the native header bar, once as a large heading directly below it. The
sibling `index.tsx` route had its equivalent duplicate heading removed when the segment header was
added (proving the pattern is understood, just not applied to these two screens), and this
carry-forward review confirms neither `new.tsx` nor `edit/[id].tsx` has since been touched to fix
it.
**Fix:** Remove the now-redundant in-body heading `Text` from `new.tsx` and the `EditForm` render
in `edit/[id].tsx`, the same way it was removed from `index.tsx`.

### WR-04: `sync.service.ts`'s exercise write validator omits `movement_pattern`, despite a comment claiming parity with the client validator

**File:** `apps/api/src/sync/sync.service.ts:327-349` (validator); compare
`apps/mobile/lib/catalog/custom-exercise.ts:98-129` (client validator)
**Issue:** `hasInvalidField`'s `exercise` branch validates `load_type` against `LOAD_TYPES` and
`equipment_required` against `EQUIPMENT_TYPES`, but never validates `movement_pattern` against
`MOVEMENT_PATTERNS` — the import list at the top of the file pulls in only
`LOAD_TYPES as LOAD_TYPE_TUPLE` and `EQUIPMENT_TYPES as EQUIPMENT_TYPE_TUPLE`; `MOVEMENT_PATTERNS`
is never imported:

```ts
if (op.type === 'exercise') {
  const d = data as ExerciseOpData;
  if (d.load_type !== undefined && !(typeof d.load_type === 'string' && LOAD_TYPES.has(d.load_type))) {
    return true;
  }
  // ... 'archived_at' check ...
  if (
    d.equipment_required !== undefined &&
    d.equipment_required !== null &&
    !(typeof d.equipment_required === 'string' && EQUIPMENT_TYPES.has(d.equipment_required))
  ) {
    return true;
  }
  // no equivalent check for d.movement_pattern
  ...
}
```

`custom-exercise.ts`'s own comment states this server branch is "kept deliberately in step with"
the client's `validateCustomExercise`, but the client validates `movementPattern` against
`MOVEMENT_PATTERN_SET` (`custom-exercise.ts:116-118`) while the server does not — so the parity
claim is false for this field. Unlike `load_type` (which has a Postgres `CHECK` constraint,
`exercise_load_type_check`) and `equipment_required` (deliberately uncovered by a DB constraint per
its own module comment, but covered here in application code), `movement_pattern` has no DB-level
or application-level backstop at all on the write path: a client that bypasses or has a bug in its
own client-side validation (or a non-mobile client hitting the sync API directly) can push an
arbitrary string into `exercise.movement_pattern`, which is then read back and rendered as a movement
pattern facet chip via `formatFacetLabel` and matched by `applyCatalogFilters`'s movement-pattern
filter, producing a garbage facet value in the UI with nothing to reject it server-side. Confirmed
no e2e test exercises this rejection path (`exercise-sync.e2e-spec.ts` tests the `load_type`
rejection at line 239 but has no equivalent case for `movement_pattern` or `equipment_required`).
**Fix:** Import `MOVEMENT_PATTERNS` alongside the other two tuples and add the same shape of check:

```ts
import {
  SYNCED_TABLES,
  LOAD_TYPES as LOAD_TYPE_TUPLE,
  EQUIPMENT_TYPES as EQUIPMENT_TYPE_TUPLE,
  MOVEMENT_PATTERNS as MOVEMENT_PATTERN_TUPLE,
  ...
} from '@fitness/api-contracts';
const MOVEMENT_PATTERNS = new Set<string>(MOVEMENT_PATTERN_TUPLE);

// inside the exercise branch:
if (
  d.movement_pattern !== undefined &&
  d.movement_pattern !== null &&
  !(typeof d.movement_pattern === 'string' && MOVEMENT_PATTERNS.has(d.movement_pattern))
) {
  return true;
}
```

### WR-03 (from prior review — now fixed, kept here for traceability only): the T-03-58 auth-guard fix now has automated regression coverage

Not an open finding. `apps/mobile/lib/navigation/__tests__/route-guard.test.ts` (new since the
2026-08-19 review) directly asserts, against `expo-router`'s real `getRoutes()` output for the
`app/` directory, that all four `exercises/*` routes nest under the `exercises` segment layout and
share its `Stack.Protected` boundary with `(tabs)`, and that removing `exercises/_layout.tsx`
reopens exactly the hoisting gap the guard depends on. This closes the previously-flagged coverage
gap. No action needed.

## Info

### IN-01: `loadOwnerAndVariation`'s `ownerId` is computed but no longer consumed

**File:** `apps/mobile/app/exercises/[id].tsx:69-81,160-165`
**Issue:** `loadOwnerAndVariation` still queries and returns `{ ownerId, variationOfId }` from
either `seededExercise` or `exercise`, and its doc comment still frames the function as answering
"whether this id belongs to the current user's own `exercise` row." Only `.variationOfId` is read
out of the `Promise.all` result at the call site (`ownerAndVariation.variationOfId`, used to build
`target.variationOfId` for `scoreAlternatives`); `.ownerId` is computed and then discarded. This is
unchanged from the prior review — `resolveDetailActions(preference.archivedAt)` (not
`ownerId`-gated) is still the only consumer of edit-visibility logic, and edit permission is
enforced separately at the edit route via `resolveEditAccess`.
**Fix:** Either narrow `loadOwnerAndVariation` to select/return only `variationOfId` (dropping the
now-unused `userId`/`ownerId` half of both queries and the stale ownership framing from the
comment), or, if `ownerId` is being kept deliberately for a near-future consumer, say so explicitly
in the comment rather than leaving it looking like leftover state.

---

_Reviewed: 2026-08-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
