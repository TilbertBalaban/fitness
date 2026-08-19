---
quick_id: 260819-wpp
slug: fix-wr-01-exerciseimagetile-failure-stat
status: complete
date: 2026-08-19
commit: b4ae1c3
closes: WR-01 (03-REVIEW.md)
---

# Quick 260819-wpp — Summary

## What changed

`apps/mobile/components/ExerciseImageTile.tsx` — the tile now remembers *which* source failed
instead of that *something* failed. Three pure functions carry the logic:

- `resolveTileSource(uri, localSource)` — the existing precedence rule, lifted out.
- `resolveSourceKey(uri, localSource)` — a stable string identity (`local:<asset id>`,
  `local:<uri>`, `uri:<uri>`, or `null`).
- `resolveDisplaySource(uri, localSource, failedKey)` — returns `null` only when the current
  source's key matches the recorded failure.

`ExerciseImageTile` holds `failedKey: string | null` and derives the display source during render.

`apps/mobile/components/__tests__/ExerciseImageTile.test.tsx` — 20 new cases.

## Deviations from plan

None.

## Verification

| Check | Result |
|---|---|
| `pnpm --filter mobile test` | 22 suites / 327 tests pass (was 307) |
| `npx tsc --noEmit` (apps/mobile) | exit 0 |
| New cases discriminate | Temporarily restored the boolean semantics (`if (failedKey !== null) return null`) and re-ran: **3 of the new cases failed**, 29 passed. Restored the fix; 32/32 pass. The regression tests genuinely fail against the pre-fix behaviour rather than passing vacuously. |

## Decisions

**Render-time derivation over the review's `useEffect`.** `03-REVIEW.md` proposes
`useEffect(() => setFailed(false), [source])`. An effect runs after paint, so a recycled row would
show one frame of the previous exercise's placeholder before correcting. Deriving during render has
no such window and needs no second render pass. The review itself also flags that `source` is not
referentially stable — hence the string key rather than the object.

**Pure functions rather than a rendered-component test.** Neither `@testing-library/react-native`
nor `react-test-renderer` is in this workspace's lockfile, and installing one is out of scope under
the package-legitimacy gate. Extracting the decision follows the `resolveTileBox` /
`resolveHeroImageWidth` pattern already in this file.

## Not done

The fix is proven at the logic level, not observed in a running list. Phase 03 UAT test 3 asks for
the behaviour to be watched in a browser (throttle one image request, scroll past that slot). That
observation still requires a browser session and remains outstanding.
