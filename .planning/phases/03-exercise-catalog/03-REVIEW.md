---
phase: 03-exercise-catalog
reviewed: 2026-08-19T00:00:00Z
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
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-08-19T00:00:00Z
**Depth:** standard
**Files Reviewed:** 68 (of 75 listed in scope)
**Status:** issues_found

## Scope Notes

- 7 machine-generated/lockfile artifacts were deliberately excluded from review per the workflow's
  instructions: `catalog-snapshot.json`, `catalog-normalized.json`, `free-exercise-db.source.json`,
  `catalog-normalization-report.json`, `pnpm-lock.yaml`, `catalog-image-map.generated.ts`,
  `image-manifest.json` (~6 MB of generated data). This narrowing means the review below covers the
  code that produces and consumes those artifacts, not the artifacts' own content — it should not be
  read as full coverage of the committed catalog dataset.
- Prior finding **CR-01** ("exercise list thumbnails fetch images over the network instead of from
  the vendored local bundle," recorded 2026-08-18) was re-verified against the current code
  (`ExerciseImageTile.tsx`, `ExerciseListRow.tsx`, `exercises/index.tsx`, `exercises/[id].tsx`) and
  is confirmed fixed by commit `1169067`: `localSource` (the vendored Metro asset id) takes
  precedence over `uri` (the remote URL) in `ExerciseImageTile`, and both list and detail screens
  pass `getLocalCatalogImage(...)` as `localSource`. It is not carried forward here.
- The most recent change, plan 03-11 (CORS), was reviewed in depth: `web-origins.ts`,
  `main.ts`'s `app.enableCors(...)` placement relative to `minClientVersionMiddleware`, `auth.ts`'s
  `trustedOrigins` construction, and `cors.e2e-spec.ts`'s assertions. No defects were found there —
  the allowlist is a real allowlist (a disallowed origin gets no `Access-Control-Allow-Origin`
  header), `Vary: Origin` is asserted, and both the Better-Auth mount and ordinary Nest routes are
  covered by the same middleware registered ahead of the version guard.

## Narrative Findings (AI reviewer)

### WR-01: `refreshCatalog` can throw despite its own "never throws" contract, becoming an unhandled promise rejection

**File:** `apps/mobile/lib/catalog/refresh-catalog.ts:66-74`
**Issue:** The function's own doc comment states: "Never throws: every non-success path resolves to
an outcome instead ... a caller can legitimately ignore an 'offline' result." Every other failure
path in the function is indeed guarded (fetch errors return `{status:'offline'}`, JSON parse
failures are caught, shape validation returns `{status:'invalid'}`). However the final write is not
guarded:

```ts
await db.transaction(async (tx) => {
  await applyCatalogSnapshot(tx, snapshot);
});

return { status: 'updated', catalogVersion: snapshot.catalog_version };
```

If `applyCatalogSnapshot` throws for any reason (SQLite disk-full, a constraint violation, a
PowerSync internal error), this propagates out of `refreshCatalog` uncaught. Its only production
call site, `apps/mobile/app/exercises/index.tsx:155`, invokes it fire-and-forget as
`void refreshCatalog(db);` with no `.catch()`, so a thrown error here becomes an unhandled promise
rejection rather than the documented graceful outcome. This contradicts the explicit "never throws"
guarantee the module's own comment makes to its caller, and unlike `loadCatalogSnapshot`'s call site
(which is wrapped in a `try { ... } catch { setFailed(true) }` in the same file), nothing catches it.
**Fix:** Wrap the transaction in a try/catch and return a status (e.g. reuse `'invalid'` or add an
`'error'` variant) instead of letting it propagate:
```ts
try {
  await db.transaction(async (tx) => {
    await applyCatalogSnapshot(tx, snapshot);
  });
} catch {
  return { status: 'offline' }; // or a new 'error' outcome
}
return { status: 'updated', catalogVersion: snapshot.catalog_version };
```

### WR-02: Save button shows a spinner ("submitting") whenever the form is merely invalid, not just while a write is in flight

**File:** `apps/mobile/app/exercises/new.tsx:192`, `apps/mobile/app/exercises/edit/[id].tsx:289`
**Issue:** Both screens pass a single combined value into `PrimaryButton`'s `submitting` prop:

```tsx
<PrimaryButton label="Save Exercise" onPress={onSubmit} submitting={submitting || !isSaveEnabled(draft)} />
```

`PrimaryButton` (`apps/mobile/components/PrimaryButton.tsx`) renders an `ActivityIndicator` and sets
`accessibilityState={{ busy: submitting, disabled: submitting }}` whenever `submitting` is truthy.
Because `!isSaveEnabled(draft)` is folded into the same prop, the button shows a spinning
"in-progress" indicator on page load — before the user has typed a name or picked a tracking type —
and continues showing it for the entire time the form is incomplete, not only during the actual
async write. This misrepresents "form invalid, please fill it in" as "working, please wait," which
is a real UX/correctness defect distinguishable from the button's own intended semantics
(`submitting` = "a write is in flight").
**Fix:** Give `PrimaryButton` a separate `disabled` prop (distinct from `submitting`), or gate the
spinner on the actual in-flight boolean only:
```tsx
<PrimaryButton label="Save Exercise" onPress={onSubmit} submitting={submitting} disabled={!isSaveEnabled(draft)} />
```

### WR-03: A partially-failed image download can poison the generated image-require map with a `null` path

**File:** `scripts/vendor-catalog-images.cjs:69-70`, `scripts/generate-catalog-image-map.cjs:34-39`
**Issue:** `vendor-catalog-images.cjs` only writes a manifest entry for a job that succeeds:
```js
if (result.ok) {
  if (!manifest[job.id]) manifest[job.id] = [];
  manifest[job.id][job.index] = `images/${job.id}/${job.index}.jpg`;
} else {
  failedCount += 1;
  failures.push({ id: job.id, index: job.index, url: job.url, error: result.error });
}
```
If image index 0 for an exercise fails (even after all 4 retry attempts) while index 1 for the same
exercise succeeds, `manifest[job.id]` becomes a sparse array whose index 0 is a hole. `JSON.stringify`
serializes an array hole as the literal `null`, so the written `image-manifest.json` contains
`[null, "images/<id>/1.jpg"]` for that exercise. `generate-catalog-image-map.cjs` then does:
```js
const requireCalls = paths.map((path) => `require(${JSON.stringify(`${RELATIVE_ASSET_PREFIX}/${path}`)})`);
```
`paths.map` runs over every element including the `null` one (once parsed back from JSON it is a
real array element, not a hole), producing `require("../../assets/catalog/null")` — a `require()`
call for a file that does not exist. This breaks Metro bundling for the whole app the next time the
image map is regenerated after a partial-failure vendoring run, and the failure surfaces far from its
cause (a bundler resolution error, not a vendoring-script error message naming the offending id).
**Fix:** In `vendor-catalog-images.cjs`, filter out `null`/holes before writing the manifest, e.g.
`manifest[job.id] = manifest[job.id].filter(Boolean)` per exercise before `JSON.stringify`, or push
into a plain array in completion order instead of assigning by `job.index`.

## Info

### IN-01: `isCatalogSnapshot` only validates `load_type` on each exercise, not the rest of the required shape

**File:** `packages/api-contracts/src/catalog.ts:143-161`
**Issue:** The function is the sole gate both `seedCatalog` (server) and `loadCatalogSnapshot`/
`applyCatalogSnapshot` (client) rely on to fail closed before opening a write transaction — several
call sites' own comments describe this as "a shape failure never reaches a write." In practice the
check only verifies: `catalog_version` is a non-empty string, `muscle_groups`/`exercises`/`mappings`
are arrays, and each exercise object has a `load_type` drawn from `LOAD_TYPES`. It does not check
that `id`/`name` are present/non-empty on exercises, that `muscle_groups` entries have a valid `id`,
or that `mappings` entries reference a real `exercise_id`/`muscle_group_id`/`weight_factor`. A
malformed artifact missing, say, `exercises[i].id` would pass `isCatalogSnapshot` and only fail much
later — as a raw SQL NOT NULL violation in `seedCatalog`'s chunked insert, or a garbled row in
`applyCatalogSnapshot`'s upsert (e.g. `id: undefined` used as a Drizzle primary key) — rather than
the deliberate, named `isCatalogSnapshot` rejection the design intends. This is not exploitable
today (only two producers exist: the committed normalize-catalog output and the API's own delivery
of that same file), but it weakens the documented fail-closed guarantee for the one function the
project bothers to name specifically for that purpose.
**Fix:** Extend the loop to check `typeof id === 'string' && id.length > 0` and
`typeof name === 'string'` per exercise, and add light shape checks for `muscle_groups`/`mappings`
elements (at minimum that `id`/`exercise_id`/`muscle_group_id`/`weight_factor` are non-empty
strings).

---

_Reviewed: 2026-08-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
