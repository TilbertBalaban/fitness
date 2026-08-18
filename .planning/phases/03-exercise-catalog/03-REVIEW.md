---
phase: 03-exercise-catalog
reviewed: 2026-08-18T00:00:00Z
depth: standard
files_reviewed: 73
files_reviewed_list:
  - apps/api/package.json
  - apps/api/src/app.module.ts
  - apps/api/src/catalog/catalog.controller.ts
  - apps/api/src/catalog/catalog.module.ts
  - apps/api/src/catalog/catalog.service.ts
  - apps/api/src/db/schema.ts
  - apps/api/src/db/schema/catalog.ts
  - apps/api/src/seed/__tests__/normalize-catalog.spec.ts
  - apps/api/src/seed/catalog-taxonomy.ts
  - apps/api/src/seed/normalize-catalog.ts
  - apps/api/src/seed/seed-catalog.ts
  - apps/api/src/sync/__tests__/patch-update-set.spec.ts
  - apps/api/src/sync/patch-update-set.ts
  - apps/api/src/sync/sync.service.ts
  - apps/api/test/catalog-delivery.e2e-spec.ts
  - apps/api/test/concurrent-edit.e2e-spec.ts
  - apps/api/test/exercise-sync.e2e-spec.ts
  - apps/api/test/poison-pill.e2e-spec.ts
  - apps/api/test/schema-parity.e2e-spec.ts
  - apps/api/test/seed-catalog.e2e-spec.ts
  - apps/api/test/sync-aggregate.e2e-spec.ts
  - apps/api/test/user-exercise-preference.e2e-spec.ts
  - apps/mobile/app/(tabs)/index.tsx
  - apps/mobile/app/_layout.tsx
  - apps/mobile/app/exercises/[id].tsx
  - apps/mobile/app/exercises/__tests__/exercise-detail-screen.test.ts
  - apps/mobile/app/exercises/edit/[id].tsx
  - apps/mobile/app/exercises/index.tsx
  - apps/mobile/app/exercises/new.tsx
  - apps/mobile/components/ArchiveDialog.tsx
  - apps/mobile/components/DetailSection.tsx
  - apps/mobile/components/ExerciseImageTile.tsx
  - apps/mobile/components/ExerciseListRow.tsx
  - apps/mobile/components/FilterChipRow.tsx
  - apps/mobile/components/MuscleTargetList.tsx
  - apps/mobile/components/SearchField.tsx
  - apps/mobile/components/SelectField.tsx
  - apps/mobile/components/SwapSuggestionList.tsx
  - apps/mobile/components/__tests__/ArchiveDialog.test.tsx
  - apps/mobile/components/__tests__/SwapSuggestionList.test.tsx
  - apps/mobile/components/__tests__/exercise-detail-components.test.tsx
  - apps/mobile/lib/catalog/__tests__/catalog-filter.test.ts
  - apps/mobile/lib/catalog/__tests__/custom-exercise.test.ts
  - apps/mobile/lib/catalog/__tests__/exercise-detail.test.ts
  - apps/mobile/lib/catalog/__tests__/exercises-screen.test.ts
  - apps/mobile/lib/catalog/__tests__/load-snapshot.test.ts
  - apps/mobile/lib/catalog/__tests__/preferences.test.ts
  - apps/mobile/lib/catalog/__tests__/refresh-catalog.test.ts
  - apps/mobile/lib/catalog/__tests__/search-index.test.ts
  - apps/mobile/lib/catalog/__tests__/smart-swap.test.ts
  - apps/mobile/lib/catalog/catalog-filter.ts
  - apps/mobile/lib/catalog/custom-exercise.ts
  - apps/mobile/lib/catalog/exercise-detail.ts
  - apps/mobile/lib/catalog/load-snapshot.ts
  - apps/mobile/lib/catalog/preferences.ts
  - apps/mobile/lib/catalog/refresh-catalog.ts
  - apps/mobile/lib/catalog/search-index.ts
  - apps/mobile/lib/catalog/smart-swap.ts
  - apps/mobile/lib/db/powersync.ts
  - apps/mobile/lib/db/powersync.web.ts
  - apps/mobile/lib/db/schema.ts
  - apps/mobile/package.json
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
  critical: 1
  warning: 2
  info: 1
  total: 4
status: issues_found
---

# Phase 3: Exercise Catalog — Code Review Report

**Reviewed:** 2026-08-18T00:00:00Z
**Depth:** standard
**Files Reviewed:** 73
**Status:** issues_found

## Summary

This phase is unusually disciplined: the seeded/synced table split (invariant 1), the per-user
preference boundary (invariant 3/4), the deterministic smart-swap scorer (invariant 5), and the
fail-closed snapshot loader (priority 2) are all correctly implemented and are backed by
e2e/unit tests that actually assert the security-relevant boundary rather than merely exercising
the happy path (`exercise-sync.e2e-spec.ts`'s seed-takeover test, `user-exercise-preference.e2e-spec.ts`'s
cross-user archive-isolation test, `patch-update-set.spec.ts`'s client-claimed-value tests). I could
not find a violation of any of the seven stated architectural invariants in the server-side sync
path, the schema, or the client preference/filter/swap logic.

The one real defect found is in the mobile exercise **list** screen, which — unlike the detail
screen and the swap-suggestion list built in the same phase — was wired to the wrong image source
and performs a live network fetch per row instead of using the vendored local image bundle. This is
a direct violation of the phase's offline-first invariant and is the kind of drift you'd expect
from ten parallel agents each building one screen against the same underlying data shape. A second,
lower-severity defect sits in the image-vendoring/generator script pair: a partial per-image
download failure can silently produce a `null` path in the manifest that the generator does not
filter, which would emit a `require()` call to a nonexistent asset and could break the whole Metro
bundle on a future re-vendor run.

## Critical Issues

### CR-01: Exercise list thumbnails fetch images over the network instead of from the vendored local bundle

**File:** `apps/mobile/app/exercises/index.tsx:93-103` (image URI selection) and `apps/mobile/app/exercises/index.tsx:233-241` (render), `apps/mobile/components/ExerciseListRow.tsx:23-37`

**Issue:** `loadCatalogRows` builds each list row's `imageUri` from `seededExercise.imageUrls` /
`exercise.imageUrls`, which — per `docs/catalog-dataset-license.md` and `CatalogSnapshotExercise`
— store the **raw, live `raw.githubusercontent.com` URLs**, not vendored local assets:

```ts
// apps/mobile/app/exercises/index.tsx
const imageUrls = parseJsonArray(row.imageUrls);
return { ..., imageUri: imageUrls[0] ?? null };
```

`ExerciseListRow` then passes this straight through to `ExerciseImageTile` as the **network** `uri`
prop, never as `localSource`:

```tsx
// apps/mobile/components/ExerciseListRow.tsx
<ExerciseImageTile uri={imageUri} />
```

`ExerciseImageTile` renders `<Image source={{ uri }} />` for this path, which is a real network
fetch. This is exactly the failure mode `apps/mobile/app/exercises/[id].tsx` and
`apps/mobile/components/SwapSuggestionList.tsx` were explicitly written to avoid — both of those
call `getLocalCatalogImage(id)` from `catalog-image-map.generated.ts` and pass the result as
`localSource`, with `[id].tsx` carrying the comment: *"The offline guarantee this screen exists to
keep: never resolve an image over the network... this deliberately never reads that field
[image_urls]."* The list screen does read that field, for every visible row, on every mount,
including the explicit "walk into a gym with no signal" scenario this project's Core Value
statement names. `ExerciseImageTile`'s `onError` fallback keeps this from crashing, but it still
fires a real, wasted network request per row and contradicts invariant 6 (images were deliberately
vendored to `assets/catalog/images/` for exactly this reason). `ExerciseListRow`'s prop type
(`imageUri: string | null`) does not even expose a `localSource` slot, so this cannot be fixed by
the caller alone — the component's API needs to change too.

**Fix:**
```tsx
// ExerciseListRowProps
export interface ExerciseListRowProps {
  name: string;
  localImage: number | null; // from getLocalCatalogImage(id)
  tags: string[];
  onPress: () => void;
}

export function ExerciseListRow({ name, localImage, tags, onPress }: ExerciseListRowProps) {
  // ...
  <ExerciseImageTile localSource={localImage} />
```
```ts
// apps/mobile/app/exercises/index.tsx
import { getLocalCatalogImage } from '@/lib/catalog/catalog-image-map.generated';
// in loadCatalogRows' row mapping, or in the renderItem:
const localImage = getLocalCatalogImage(item.id);
<ExerciseListRow name={item.name} localImage={localImage} ... />
```

## Warnings

### WR-01: Partial per-image download failure can corrupt the manifest with a `null` path, breaking the Metro require-map generator

**File:** `scripts/vendor-catalog-images.cjs:66-71`, `scripts/generate-catalog-image-map.cjs:33-40`

**Issue:** `vendor-catalog-images.cjs` builds `manifest[job.id]` as a plain array indexed by each
image's per-exercise position:

```js
if (!manifest[job.id]) manifest[job.id] = [];
manifest[job.id][job.index] = `images/${job.id}/${job.index}.jpg`;
```

If image index 0 for an exercise fails after all `MAX_ATTEMPTS` retries but index 1 succeeds, this
produces a sparse array with a hole at index 0. `JSON.stringify` serializes an array hole as `null`,
so `image-manifest.json` would contain e.g. `"seed_X": [null, "images/seed_X/1.jpg"]`.
`generate-catalog-image-map.cjs` then maps over this array unconditionally:

```js
const requireCalls = paths.map((path) => {
  totalImages += 1;
  return `require(${JSON.stringify(`${RELATIVE_ASSET_PREFIX}/${path}`)})`;
});
```

For the `null` entry this emits `require("../../assets/catalog/null")` — a static string Metro will
try (and fail) to resolve at bundle time, since no such file exists. Because Metro's static-require
resolution failures are bundle-fatal, a single partial download failure on a future re-vendor run
would break the entire mobile app build, not just that one exercise's thumbnail. The currently
committed manifest apparently has no such holes (all 1740 images present), so this is latent rather
than actively broken — but nothing in either script guards against it.

**Fix:** Filter falsy/`null` entries before emitting `require()` calls, and/or have
`vendor-catalog-images.cjs` omit a failed index entirely (e.g. compact via `.filter(Boolean)`)
rather than leaving a hole:
```js
// vendor-catalog-images.cjs
if (result.ok) {
  if (!manifest[job.id]) manifest[job.id] = [];
  manifest[job.id][job.index] = `images/${job.id}/${job.index}.jpg`;
}
// ...after the loop:
for (const id of Object.keys(manifest)) {
  manifest[id] = manifest[id].filter(Boolean);
}
```
```js
// generate-catalog-image-map.cjs
const requireCalls = paths.filter(Boolean).map((path) => { ... });
```

### WR-02: `MuscleMappingPicker` and `MultilineField` are duplicated verbatim between `new.tsx` and `edit/[id].tsx`

**File:** `apps/mobile/app/exercises/new.tsx:23-71,73-104`, `apps/mobile/app/exercises/edit/[id].tsx:29-78,80-104`

**Issue:** Both route files define byte-identical `MuscleMappingPicker` (~48 lines) and
`MultilineField` (~24 lines) components. The in-file comments acknowledge this is deliberate
("duplicated rather than imported cross-route... each stays a self-contained module") and explain
why `TextField.tsx` wasn't extended, but that doesn't justify duplicating the components between
two files in the *same* module (`lib/catalog` or `components/`) rather than one shared file. As
written, a future fix to the muscle-mapping cycle behavior or the multiline field's max-height must
be applied in two places, and nothing enforces that they stay in sync — exactly the drift risk this
review's cross-file-consistency priority calls out for a phase built by parallel agents.

**Fix:** Extract both into `apps/mobile/components/MuscleMappingPicker.tsx` and
`apps/mobile/components/MultilineField.tsx` (or a shared module under `app/exercises/`) and import
from both route files.

## Info

### IN-01: Some new component tests assert against `Component.toString()` source text rather than rendered behavior

**File:** `apps/mobile/app/exercises/__tests__/exercise-detail-screen.test.ts:58-81`

**Issue:** The "structural invariants" test block asserts facts like `source.toContain('Target Muscles')` and `source).not.toMatch(/numberOfLines/)` against the stringified function body of
`ExerciseDetailScreen`. This is explicitly justified in the file's own comment (no
`@testing-library/react-native`/`react-test-renderer` available in this worktree) and is a
reasonable stopgap, but it is a fragile pattern: a behavior-preserving refactor (renaming a local
variable, reordering an unrelated prop, or moving a string constant) can flip these tests red or
green without any real regression, and conversely a genuine behavioral bug that doesn't touch the
literal substring being matched would not be caught. Worth revisiting once
`@testing-library/react-native` is added to the workspace.

**Fix:** No action required now given the documented tooling constraint; track adding real
component-rendering tests once the testing-library dependency gate is lifted.

---

_Reviewed: 2026-08-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
