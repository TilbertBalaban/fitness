---
phase: 03-exercise-catalog
reviewed: 2026-08-19T00:00:00Z
depth: standard
files_reviewed: 88
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
  - apps/api/src/seed/data/catalog-normalization-report.json
  - apps/api/src/seed/data/catalog-normalized.json
  - apps/api/src/seed/data/free-exercise-db.source.json
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
  - apps/mobile/app/exercises/edit/[id].tsx
  - apps/mobile/app/exercises/index.tsx
  - apps/mobile/app/exercises/new.tsx
  - apps/mobile/assets/catalog/catalog-snapshot.json
  - apps/mobile/assets/catalog/image-manifest.json
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
  - apps/mobile/e2e/catalog-load.spec.ts
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
  - apps/mobile/lib/catalog/catalog-image-map.generated.ts
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
  - apps/mobile/lib/db/test-support.ts
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
  - pnpm-lock.yaml
  - scripts/generate-catalog-image-map.cjs
  - scripts/sync-catalog-snapshot.cjs
  - scripts/vendor-catalog-images.cjs
findings:
  critical: 0
  warning: 5
  info: 2
  total: 7
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-08-19T00:00:00Z
**Depth:** standard
**Files Reviewed:** 88
**Status:** issues_found

## Summary

This phase delivers the exercise catalog: a build-time normalization/seed pipeline
(`normalize-catalog.ts`, `catalog-taxonomy.ts`, `seed-catalog.ts`), a read-only unauthenticated
catalog-delivery API (`catalog.controller.ts`/`catalog.service.ts`), a client-side
localOnly-table load/refresh path (`load-snapshot.ts`, `refresh-catalog.ts`), and the
exercises list/detail/create/edit screens with search, filtering, smart-swap suggestions and
per-user archive/never-suggest preferences.

The core data-integrity discipline is strong: ownership resolution in `sync.service.ts`
correctly distinguishes "no such row" from "row exists with a null owner" for the nullable
`exercise.userId` case, `patchAwareSet`'s exhaustiveness-typed field maps prevent the
whole-column-clobber class of bug the code's own comments describe having happened before, and
the seed/refresh paths both use table separation (`seededExercise` vs `exercise`) rather than a
`WHERE is_custom = false` filter to keep custom rows structurally unreachable by catalog writes.
No SQL injection, hardcoded secrets, or auth bypasses were found in the reviewed diff.

The issues below are concentrated in the mobile screen layer: async write handlers with no
error handling that can leave forms permanently stuck in a "submitting" state on any failure,
and a `submitting` prop on `PrimaryButton` that is overloaded to also mean "form invalid,"
producing a spinner on a button that isn't actually doing anything. There is also a validation
gap between what `isCatalogSnapshot`'s doc comment promises ("refusing to seed a partial or
malformed catalog") and what it actually checks (only `load_type` on each exercise; nothing
about `muscle_groups`/`mappings` element shape or the other required exercise fields).

## Warnings

### WR-01: Async write handlers with no error handling leave the UI permanently stuck mid-submit

**File:** `apps/mobile/app/exercises/new.tsx:126-140`, `apps/mobile/app/exercises/edit/[id].tsx:147-169`, `apps/mobile/app/exercises/[id].tsx:190-209`

**Issue:** Every write-triggering handler in these three files awaits a promise with no
try/catch:

```ts
// new.tsx
async function onSubmit() {
  if (!userId) return;
  setSubmitting(true);
  const result = await submitNewExercise(getPowerSync(), userId, draft); // can throw
  setSubmitting(false); // never reached if the line above throws
  ...
}
```

`submitNewExercise`/`submitEditExercise` only return `{ ok: false, errors }` for a *validation*
failure — they still `await createCustomExercise(...)` / `await updateCustomExercise(...)`
unguarded, and `updateCustomExercise` itself throws a raw `Error('not_owner')` when its
ownership re-check fails (`custom-exercise.ts:200-204`), a path that is reachable in production
(e.g. two devices editing after one archives/reassigns, or a race between `resolveEditAccess`'s
render-time check and the transaction's own re-read). `db.transaction(...)` can also reject for
any local SQLite failure. In every one of these cases:

1. `setSubmitting(false)` never runs, so `PrimaryButton`'s `disabled={submitting}` (see WR-02)
   permanently disables the Save/Duplicate control until the screen is torn down and remounted.
2. The rejection becomes an unhandled promise rejection with no user-visible feedback — the
   screen just appears to hang.

The same pattern applies to `handleConfirmArchiveToggle`, `handleToggleNeverSuggest`, and
`handleDuplicate` in `[id].tsx` (lines 190-209): these are optimistic local-first writes with a
comment claiming "no failure path to render, since the write cannot fail against a server it
never waits for" — but the write is still a local PowerSync/SQLite write, which *can* throw (a
prior-in-flight `not_owner` race in `duplicateExercise`'s source lookup returning
`exercise_not_found`, or a SQLite-level constraint failure), and there is no catch to reconcile
the already-applied optimistic state update if it does.

**Fix:** Wrap each write in try/catch, always reset `submitting` in a `finally`, and surface a
generic failure message (or re-throw to an error boundary) instead of leaving the button
disabled with no explanation:

```ts
async function onSubmit() {
  if (!userId) return;
  setSubmitting(true);
  try {
    const result = await submitNewExercise(getPowerSync(), userId, draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    router.replace({ pathname: '/exercises/[id]', params: { id: result.id } });
  } catch (error) {
    console.error('exercise save failed', error);
    // surface a retry/error state instead of leaving the button silently disabled
  } finally {
    setSubmitting(false);
  }
}
```

### WR-02: `PrimaryButton`'s `submitting` prop is overloaded to also mean "disabled" — an invalid form renders a permanent loading spinner

**File:** `apps/mobile/app/exercises/new.tsx:192`, `apps/mobile/app/exercises/edit/[id].tsx:289`, `apps/mobile/components/PrimaryButton.tsx:9-22`

**Issue:** `PrimaryButton` only exposes one boolean, `submitting`, which drives both
`disabled={submitting}` *and* the `ActivityIndicator`:

```tsx
<PrimaryButton label="Save Exercise" onPress={onSubmit} submitting={submitting || !isSaveEnabled(draft)} />
```

Whenever the draft is simply incomplete (no name / no load type yet — the normal state of a
freshly opened "Add Custom Exercise" form), this renders a spinning `ActivityIndicator` next to
the label, implying a network/write operation is in progress when nothing is happening at all.
This is a real user-facing correctness bug in the affordance, not a style nit: a spinner
communicates "something is happening, wait," and here it is shown on a form the user hasn't
even started filling in.

**Fix:** Give `PrimaryButton` a separate `disabled` prop, and only pass `submitting` when an
actual write is in flight:

```tsx
<PrimaryButton
  label="Save Exercise"
  onPress={onSubmit}
  submitting={submitting}
  disabled={submitting || !isSaveEnabled(draft)}
/>
```

### WR-03: `isCatalogSnapshot` validates far less than its call sites' comments claim

**File:** `packages/api-contracts/src/catalog.ts:143-161`

**Issue:** `isCatalogSnapshot` checks that `muscle_groups`/`exercises`/`mappings` are arrays and
that every exercise's `load_type` is a member of `LOAD_TYPES` — and nothing else. It does not
check that `id`/`name` are non-empty strings, that `mappings[].exercise_id` /
`mappings[].muscle_group_id` reference real rows or are even strings, or that
`muscle_groups[]` elements have the required shape at all. Yet this is the function three
different call sites lean on as their sole gate against malformed input:

- `seed-catalog.ts:51-55`: *"Validates before opening its own transaction ... refusing to seed a
  partial or malformed catalog."*
- `load-snapshot.ts:159-161`: *"Structural validation runs before the transaction opens ... a
  shape failure never reaches a write."*
- `refresh-catalog.ts:64-66`: gates a snapshot downloaded over the network (an unauthenticated,
  public endpoint — see `catalog.controller.ts`) before writing it into the local database.

In `refresh-catalog.ts` particularly, this is the boundary between "an untrusted, possibly
corrupted or replayed HTTP response" and a local database write — a compromised/misconfigured
CDN edge, a truncated response, or a future backend regression that serves an exercise with a
missing `name`/`id` would pass `isCatalogSnapshot` and reach `applyCatalogSnapshot`, where
`item.id`/`item.name` are used directly as SQLite insert values (`load-snapshot.ts:79-102`).
The transaction wrapping limits the blast radius (a thrown error rolls back), but the function's
own doc comments overstate the guarantee it actually provides, and a non-throwing malformed row
(e.g. `image_urls: undefined` silently serializing to `imageUrls: undefined` rather than
throwing) could reach storage undetected.

**Fix:** Either narrow the doc comments to describe what's actually checked, or strengthen the
validator to check the fields every call site is trusting it to check (id/name presence, each
`mappings[]`/`muscle_groups[]` element's required string fields, `image_urls` being an array).

### WR-04: `explainMatch` reuses a "humanize muscle group" formatter to label a movement pattern

**File:** `apps/mobile/lib/catalog/smart-swap.ts:140-142, 157-158`

**Issue:**

```ts
function humanizeMuscleGroupId(id: string): string {
  return id.replace(/_/g, ' ');
}
...
if (movementPoints > 0 && movementPoints >= variationPoints && target.movementPattern) {
  return `Same movement pattern: ${humanizeMuscleGroupId(target.movementPattern)}`;
}
```

`humanizeMuscleGroupId` is called with `target.movementPattern` (e.g. `'horizontal_push'`), not
a muscle group id, even though its name and its only other call site both say "muscle group."
The transformation (`replace(/_/g, ' ')`) happens to work for both vocabularies since neither
capitalizes, but the naming is actively misleading to a future reader/editor who might assume
the function encodes muscle-group-specific logic (e.g. add a muscle-group display-name lookup
inside it) and unknowingly break the movement-pattern call site.

**Fix:** Rename to a vocabulary-neutral name (e.g. `humanizeSnakeCaseId`), matching the existing
`formatFacetLabel` naming convention already used elsewhere in this module tree
(`catalog-filter.ts`).

### WR-05: `readRawColumns` builds a SQL statement via raw string interpolation

**File:** `apps/mobile/lib/db/test-support.ts:229-235`

**Issue:**

```ts
export async function readRawColumns(table: string): Promise<string[]> {
  ...
  const rows = await rawDb.getAll<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.map((row) => row.name);
}
```

`table` is interpolated directly into the SQL text rather than passed as a bound parameter.
`PRAGMA` statements don't support parameter binding for identifiers in SQLite, so this is a
narrower case than a typical injection, and today's only caller is a Playwright durability
harness gated behind `EXPO_PUBLIC_DURABILITY_HARNESS === '1'` with a hardcoded table name
(`e2e/schema-redefinition.spec.ts`) — not reachable from any production/user-facing input. Still
worth flagging: this is the one raw-interpolated-SQL pattern in an otherwise parameterized-query
codebase, and it would become a real injection vector if this helper or its pattern were ever
reused for a call site with less-trusted input.

**Fix:** No change required for current usage; if this helper is ever exposed beyond the test
harness, validate `table` against an allow-list of known table names before interpolating.

## Info

### IN-01: `seed-catalog.ts`'s `groupOriginalsByCanonical` recomputes work `mergeCandidates` already did

**File:** `apps/api/src/seed/normalize-catalog.ts:349-386, 523-541`

**Issue:** `mergeCandidates` already groups every candidate by `mergeGroupKey` to find merge
groups. `groupOriginalsByCanonical` (called immediately afterward, `normalizeCatalog:453-456`)
regroups the *same* candidate list by the *same* key function from scratch, purely to recover
the original (pre-merge) member list per canonical id. This is a build-time script (not a
runtime hot path, out of this review's performance scope), but it is duplicated logic that could
drift if `mergeGroupKey`'s definition ever changes in only one of the two call sites' mental
model — currently safe only because both call the same exported function.

**Fix:** Have `mergeCandidates` return the full group (not just the canonical candidate), or
return a `Map<canonicalId, NormalizedCandidate[]>` directly from the merge pass, and drop
`groupOriginalsByCanonical` entirely.

### IN-02: `handleAddCustomExercisePress`/`onPress={() => {}}` — a no-op `onPress` handler on every list row

**File:** `apps/mobile/app/exercises/index.tsx:243`

**Issue:** `ExerciseListRow`'s `onPress={() => {}}` is a placeholder — navigation is actually
handled by the surrounding `<Link>` (`asChild`), so the row itself does nothing on press. This
is not a bug (the `Link` wrapper makes the whole row tappable regardless), but the empty
arrow function is dead code that could confuse a future reader into thinking `onPress` still
needs wiring, or that tapping the row does nothing.

**Fix:** Either drop the `onPress` prop from `ExerciseListRowProps` if `Link`-wrapping is now
the only call pattern across the codebase, or leave a one-line comment noting the prop is
structurally required but functionally a no-op under `Link asChild`.

---

_Reviewed: 2026-08-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
