---
quick_id: 260819-wpp
slug: fix-wr-01-exerciseimagetile-failure-stat
status: planned
created: 2026-08-19
source: .planning/phases/03-exercise-catalog/03-REVIEW.md (WR-01)
closes_uat: 03-UAT.md test 3
---

# Quick 260819-wpp — Fix WR-01: tile failure state leaks across FlashList recycling

## Problem

`ExerciseImageTile` (`apps/mobile/components/ExerciseImageTile.tsx`) keeps `failed` as a bare
boolean with no tie to the source it was recorded for:

```tsx
const [failed, setFailed] = useState(false);
const handleError = useCallback(() => setFailed(true), []);
```

`ExerciseListRow` renders inside `@shopify/flash-list@2.0.2` (`app/exercises/index.tsx`), which
recycles view instances: the same component instance at a given list slot receives new props for a
different exercise without unmounting. Once any image fails in that slot, `failed` stays `true`
forever, so every later exercise recycled into that slot renders the placeholder despite having a
perfectly valid source.

`SwapSuggestionList` and the detail hero use plain `.map()` and are unaffected.

## Approach

Key the failure to the source identity instead of tracking a bare boolean.

The review suggests `useEffect(() => setFailed(false), [source])`. Rejected: an effect resets
*after* paint, so a recycled row shows one frame of the previous exercise's placeholder before
correcting. Deriving during render has no such window and needs no second render pass.

Testability constraint: this workspace has neither `@testing-library/react-native` nor
`react-test-renderer` (see the header comment in `ExerciseImageTile.test.tsx`), so the stateful
hook component cannot be rendered in a test. The decision must therefore live in a pure exported
function — the pattern `resolveTileBox`/`resolveHeroImageWidth` already established in this file.

## Tasks

### Task 1 — Extract the source identity and display decision as pure functions

**Files:** `apps/mobile/components/ExerciseImageTile.tsx`

- Add `resolveTileSource(uri, localSource)` — the existing precedence rule (localSource wins), lifted out.
- Add `resolveSourceKey(uri, localSource): string | null` — a stable string identity:
  numeric `localSource` (Metro asset id) → `local:<id>`; object `localSource` carrying a `uri` →
  `local:<uri>`; any other object/array → `local:<JSON>`; else `uri` → `uri:<uri>`; else `null`.
  A bare object identity cannot be used: web `localSource` values and `{ uri }` wrappers are new
  objects on every render, so an identity comparison would reset on every render.
- Add `resolveDisplaySource(uri, localSource, failedKey)` — returns `null` when the current
  source's key equals `failedKey`, otherwise the resolved source.
- Rewrite `ExerciseImageTile` to hold `failedKey: string | null` and call `resolveDisplaySource`.

**Verify:** `pnpm --filter mobile exec tsc --noEmit` exits 0.
**Done:** No call site, `ExerciseImageTileView`, `resolveTileBox` or `resolveHeroImageWidth` changed.

### Task 2 — Regression tests

**Files:** `apps/mobile/components/__tests__/ExerciseImageTile.test.tsx`

Cover, by direct invocation:
- a failure recorded for source A still suppresses A (the original behaviour is preserved);
- a failure recorded for source A does **not** suppress a different source B — the WR-01 case;
- the same across the `uri` → `localSource` transition and for numeric vs object `localSource`;
- `resolveSourceKey` is stable across separate but equal object sources (would otherwise reset every render);
- a null/absent source yields a `null` key and is never treated as failed.

**Verify:** `pnpm --filter mobile test` passes.
**Done:** New cases fail against the pre-fix implementation and pass after.
