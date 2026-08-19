---
phase: 03-exercise-catalog
reviewed: 2026-08-19T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - apps/mobile/app/exercises/[id].tsx
  - apps/mobile/app/exercises/__tests__/exercise-detail-screen.test.ts
  - apps/mobile/app/exercises/_layout.tsx
  - apps/mobile/app/exercises/index.tsx
  - apps/mobile/components/ExerciseImageTile.tsx
  - apps/mobile/components/ExerciseListRow.tsx
  - apps/mobile/components/NavBackButton.tsx
  - apps/mobile/components/SwapSuggestionList.tsx
  - apps/mobile/components/__tests__/ExerciseImageTile.test.tsx
  - apps/mobile/components/__tests__/SwapSuggestionList.test.tsx
  - apps/mobile/lib/catalog/__tests__/preferences.test.ts
  - apps/mobile/lib/catalog/preferences.ts
  - apps/mobile/lib/navigation/__tests__/back.test.ts
  - apps/mobile/lib/navigation/back.ts
  - scripts/generate-catalog-image-map.cjs
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-08-19
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Scoped review of the two gap-closure plans (03-13 closing G-03-3 image-sizing, 03-14 closing G-03-4
navigation/auth-guard) against `de4aa9a` as diff base. `tsc --noEmit` is clean and all 54 tests in
the five in-scope test files pass.

Two specific claims called out in the review scope were independently verified rather than taken on
faith:

- **`resolveTileBox`/`resolveHeroImageWidth` box-collapse fix (G-03-3):** confirmed sound for every
  input class named in the scope (`0`, negative, `NaN`, `Infinity`, `undefined`-via-non-finite). All
  three call sites (`[id].tsx`, `ExerciseListRow.tsx`, `SwapSuggestionList.tsx`) pass an explicit
  `width`. No defect found here.
- **Auth-guard claim in `app/exercises/_layout.tsx` (T-03-58):** read `expo-router`'s own
  `getRoutesCore.js` in `node_modules` directly. It confirms "routes in directories without
  `_layout` files are hoisted to the nearest `_layout`" — which is exactly the mechanism the file's
  comment claims fixed the previously-unguarded `exercises/[id]`, `exercises/new`, and
  `exercises/edit/[id]` routes. The mechanism is real and correctly applied. Also confirmed
  `resolveEditAccess` (in `lib/catalog/custom-exercise.ts`, out of this diff's scope but the actual
  enforcement point) genuinely blocks non-owners, so removing the `showEdit` ownership gate from
  `resolveDetailActions` in `preferences.ts` did not leak an authorization gap — the edit route
  itself enforces it correctly. No defect found in either of these two areas, but see WR-03 below:
  the guard fix itself carries zero regression-test coverage.

What follows are the defects found beyond the two claims above: a recycling-related state bug in
`ExerciseImageTile` that predates this diff but remains unaddressed through a substantial rewrite of
that exact file, a duplicate-title UI regression introduced by `_layout.tsx` on two screens not in
this diff's file list, and a small dead-computation/stale-comment issue in `[id].tsx`.

## Warnings

### WR-01: `ExerciseImageTile`'s failure state is not reset across FlashList recycling — a permanently-broken thumbnail can "leak" onto unrelated exercises

**File:** `apps/mobile/components/ExerciseImageTile.tsx:74-81`
**Issue:** `ExerciseImageTile` keeps `failed` in local component state with no dependency on the
`source` it is currently showing:

```tsx
export function ExerciseImageTile({ uri, localSource, width = EXERCISE_THUMBNAIL_WIDTH }: ExerciseImageTileProps) {
  const [failed, setFailed] = useState(false);
  const handleError = useCallback(() => setFailed(true), []);
  const source: ImageSourcePropType | null =
    localSource != null ? localSource : uri ? { uri } : null;

  return <ExerciseImageTileView source={failed ? null : source} width={width} onError={handleError} />;
}
```

`ExerciseListRow` is rendered inside `@shopify/flash-list@2.0.2` (`app/exercises/index.tsx`), whose
own README states it "uses view recycling" and "recycles views instead of destroying them" — i.e.
the same `ExerciseListRow`/`ExerciseImageTile` component instance at a given list slot is reused for
a different `item` as the user scrolls, receiving new props without unmounting. Once any image fails
to load in a given slot (`failed` set to `true`), every subsequent exercise that scrolls into that
same slot will render the broken-image placeholder forever — even though its own `localSource`/`uri`
is perfectly valid — because nothing ever resets `failed` back to `false` when `source` changes.

`SwapSuggestionList` renders a plain (non-recycled) `.map()`, so it is not affected. This is scoped to
the FlashList-backed list row usage.

This is not new in this diff (the `useState(false)` line existed before 03-13), but 03-13
substantially rewrote this exact function (added `resolveTileBox`, `width`, `useCallback`) without
addressing it, and the file is squarely in this review's scope.

**Fix:** Reset `failed` whenever the effective source identity changes, e.g.:

```tsx
export function ExerciseImageTile({ uri, localSource, width = EXERCISE_THUMBNAIL_WIDTH }: ExerciseImageTileProps) {
  const source: ImageSourcePropType | null =
    localSource != null ? localSource : uri ? { uri } : null;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  const handleError = useCallback(() => setFailed(true), []);

  return <ExerciseImageTileView source={failed ? null : source} width={width} onError={handleError} />;
}
```
(`source` here is not referentially stable across renders for object sources; keying the effect on
`uri`/`typeof localSource === 'number' ? localSource : JSON.stringify(localSource)` or similar is
more robust than the object itself.)

### WR-02: `_layout.tsx`'s new native header duplicates existing in-page titles on `new.tsx` and `edit/[id].tsx`

**File:** `apps/mobile/app/exercises/_layout.tsx:34-37` (cause); consequence visible in
`apps/mobile/app/exercises/new.tsx:145` and `apps/mobile/app/exercises/edit/[id].tsx:239` (both
outside this diff's file list, but directly affected by it)
**Issue:** Before this diff, the root `Stack` used `headerShown: false`
(`apps/mobile/app/_layout.tsx:109`), so none of the four `exercises/*` routes had a native header.
`_layout.tsx` now sets `headerShown: true` for the whole segment and assigns a static `title` per
screen:

```tsx
<Stack.Screen name="new" options={{ title: 'Add Custom Exercise' }} />
...
<Stack.Screen name="edit/[id]" options={{ title: 'Edit Exercise' }} />
```

Both `new.tsx` and `edit/[id].tsx` already render their own in-body heading with the *identical*
text (`new.tsx:145`: `<Text ...>Add Custom Exercise</Text>`; `edit/[id].tsx:239`: `<Text
...>Edit Exercise</Text>`). Users will now see the same title twice — once in the native header bar,
once as a large heading directly below it.

This is a real oversight, not a deliberate choice: the same diff *did* remove the equivalent
duplicate heading from `index.tsx` (`git diff` shows `<Text ...>Exercises</Text>` deleted from the
list header alongside the "Add Custom Exercise" button, once `_layout.tsx`'s `title: 'Exercises'`
made it redundant), proving the author was aware of and fixed this exact class of duplication for one
screen but missed the other two.

**Fix:** Remove the now-redundant in-body heading `Text` from `new.tsx:145` and `edit/[id].tsx:239`,
the same way it was removed from `index.tsx`.

### WR-03: The T-03-58 auth-guard fix has zero automated regression coverage

**File:** `apps/mobile/app/exercises/_layout.tsx:10-15`
**Issue:** The file's own comment states it "is load-bearing for authorization, not just chrome" —
its mere existence is what makes the root `Stack.Protected` guard cover `exercises/[id]`,
`exercises/new`, and `exercises/edit/[id]` instead of only `exercises/index`. The mechanism was
verified correct in this review by reading `expo-router`'s route-hoisting implementation directly.
However, there is no test anywhere in the reviewed scope (or in
`apps/mobile/app/exercises/__tests__/`) that asserts these routes are nested under the segment layout
rather than hoisted to root, and the plan's own `03-14-SUMMARY.md` records this exact behavior (R6)
as "flagged security-relevant... has not been observed in a browser." A future edit that deletes or
restructures `_layout.tsx` (or moves one of the four route files out of the `exercises/` directory)
would silently reopen this gap with nothing in CI to catch it.
**Fix:** At minimum, add a static assertion/test (e.g., a snapshot of `require.context` / a Jest test
against `expo-router`'s own `getRoutes()` output for the `app/` directory, asserting
`exercises/[id]`, `exercises/new`, and `exercises/edit/[id]` are children of the `exercises` layout
route rather than root siblings) so this security-relevant invariant is enforced by something other
than a code comment. A manual UAT pass confirming the guard (as already flagged in the plan's own
SUMMARY) should also happen before this is considered closed.

## Info

### IN-01: `loadOwnerAndVariation`'s `ownerId` is computed but no longer consumed

**File:** `apps/mobile/app/exercises/[id].tsx:54-71,152-165`
**Issue:** `loadOwnerAndVariation` still queries and returns `ownerId` (from either `seededExercise`
or `exercise`), and its doc comment still describes it as answering "whether this id belongs to the
current user's own `exercise` row." Before 03-14, `ownerId` fed `resolveDetailActions(userId,
ownerId, ...)` to gate `showEdit`. That call site was removed
(`const actions = resolveDetailActions(preference.archivedAt);`) along with the `ownerId` state
(`setOwnerId` was deleted), but `ownerAndVariation.ownerId` itself is still read out of the
`Promise.all` result and simply discarded — only `.variationOfId` is used. The function's doc
comment is now half-stale (it still describes the ownership-answering purpose that no longer has a
consumer).
**Fix:** Either narrow `loadOwnerAndVariation` to only select/return `variationOfId` (drop the
now-unused `userId ownerId` half of the query and the stale ownership framing from the comment), or
if `ownerId` is being kept deliberately for a near-future consumer, say so explicitly in the comment
rather than leaving it looking like leftover state.

---

_Reviewed: 2026-08-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
