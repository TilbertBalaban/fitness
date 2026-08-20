---
phase: 03-exercise-catalog
plan: 17
subsystem: testing
tags: [expo-router, jest, navigation, authorization, regression-test]

requires:
  - phase: 03-exercise-catalog
    provides: "T-03-58's exercises segment layout (app/exercises/_layout.tsx), which collapses the four exercises routes under one guarded Stack.Screen"
provides:
  - "Automated regression test asserting the real app/exercises route tree hoists under one guarded layout node, with an in-suite proof that removing the segment layout breaks the assertion"
  - "renderRootStack(signedIn), a pure function making the root guard boundary inspectable without a renderer, plus assertions covering both guard values"
affects: [exercise-catalog, navigation, security]

actuals:
  tokens: 1917
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "expo-router's own build/getRoutes and build/internal/testing test seam (requireContext ponyfill + inMemoryContext) used to read the real route tree from disk without loading route modules"
    - "Pure renderRootStack(signedIn) extraction pattern for making JSX authorization boundaries directly testable"

key-files:
  created:
    - apps/mobile/lib/navigation/root-stack.tsx
    - apps/mobile/lib/navigation/__tests__/route-guard.test.ts
  modified:
    - apps/mobile/app/_layout.tsx

key-decisions:
  - "Case B's actual hoisting behavior differs from the plan's prediction: without app/exercises/_layout.tsx, all four routes (including index) hoist to root as exercises/-prefixed siblings (exercises/index, not a bare exercises node) rather than the list route alone collapsing to exercises. Assertions were tightened to the observed tree per the plan's own instruction to derive names from a real run rather than hand-write them."

patterns-established:
  - "A route-authorization regression test proves its own discriminating power by re-running its assertions against the same key list with the layout file removed, rather than asserting file existence."

requirements-completed: [EXER-03, EXER-05]

coverage:
  - id: D1
    description: "The exercises segment's route hoisting (four routes under one exercises layout node) is asserted against the real app/exercises directory, and the assertion is proven load-bearing by failing when the segment layout is removed"
    requirement: "EXER-03"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/navigation/__tests__/route-guard.test.ts#exercises route hoisting (WR-03 regression)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The root stack's guard boundary is inspectable via renderRootStack(signedIn), and asserted for both guard values that the exercises and (tabs) screens sit inside a Stack.Protected boundary whose guard prop tracks signedIn"
    requirement: "EXER-05"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/navigation/__tests__/route-guard.test.ts#root stack guard boundary (WR-03 regression)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-08-20
status: complete
---

# Phase 03 Plan 17: Automated Regression Coverage for the Exercises Auth Guard Summary

**Route-tree and guard-boundary Jest tests over expo-router's own test seam, pinning T-03-58's authorization fix so a routing refactor fails CI instead of reopening the hole.**

## Performance

- **Duration:** 20 min
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `apps/mobile/lib/navigation/__tests__/route-guard.test.ts` asserts, against the real on-disk `apps/mobile/app` directory via `requireContext`, that the four exercises routes ([id], edit/[id], index, new) nest under a single `exercises` layout node — and proves the assertion is load-bearing by rerunning it with `./exercises/_layout.tsx` removed from the key list, observing all four routes hoist to the root stack as `exercises/`-prefixed siblings.
- `apps/mobile/lib/navigation/root-stack.tsx` extracts the root layout's protected `<Stack>` JSX into a pure `renderRootStack(signedIn): ReactElement` function, called from `app/_layout.tsx` with no change to the guard expression itself.
- The same test file asserts, for both `renderRootStack(false)` and `renderRootStack(true)`, that the `exercises` and `(tabs)` screens share a `Stack.Protected` ancestor whose `guard` prop equals the boolean passed in, and that no `exercises` screen exists outside a protected boundary.

## Task Commits

Each task was committed atomically:

1. **Task 1: The route tree itself proves the four exercises routes are hoisted under one guarded node** - `4140524` (test)
2. **Task 2: The guard boundary itself is inspectable, and asserted for both guard values** - `0452bf1` (feat)

_Note: no plan-metadata commit — worktree mode; STATE.md/ROADMAP.md updates are owned by the orchestrator after wave merge._

## Files Created/Modified
- `apps/mobile/lib/navigation/__tests__/route-guard.test.ts` - Route-hoisting and guard-boundary regression suite (8 + 6 tests, 2 `it.each` blocks over `[false, true]`)
- `apps/mobile/lib/navigation/root-stack.tsx` - `renderRootStack(signedIn)`, the extracted pure root-stack JSX
- `apps/mobile/app/_layout.tsx` - Returns `renderRootStack(signedIn)` instead of declaring the `<Stack>` JSX inline; unused `Stack` import removed

## Decisions Made
- Tightened Case B's expected route names to the actually-observed tree (`exercises/[id]`, `exercises/edit/[id]`, `exercises/index`, `exercises/new`, with zero root-level node named exactly `exercises`) rather than the plan text's prediction that the index route alone would collapse to a bare `exercises` node. Running the test first and reading the real output, per the plan's own explicit instruction, showed the bypass is total, not partial — a stronger result than predicted.
- Used `isProtectedReactElement` from `expo-router/build/views/Protected` (expo-router's own predicate) rather than a hand-rolled `element.type === Stack.Protected` comparison, per the plan's stated preference.

## Deviations from Plan

None — plan executed exactly as written. Task 1 and Task 2 acceptance criteria were met without needing Rule 1-4 fixes. The only adjustment was tightening Case B's assertions to observed behavior, which the plan's own action text explicitly instructed ("Derive the exact expected names by running the test and reading the actual tree — do not hand-write names you have not observed").

One environment-level step was needed but is not a plan deviation: this worktree had no `node_modules` and `packages/api-contracts` had no built `dist/`, so `pnpm install` and `pnpm --filter @fitness/api-contracts build` were run before any verification command — both are build-environment setup, not code changes, and are excluded from the diff.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- WR-03 is closed: the T-03-58 authorization fix now has automated regression coverage at both the route-hoisting layer and the guard-boundary layer.
- `apps/mobile/app/exercises/_layout.tsx` is confirmed byte-identical post-plan (`git diff --exit-code` exits 0).
- Full verification block passed: `pnpm --filter mobile test` (341/341, zero skipped/todo), `pnpm --filter mobile typecheck`, and `pnpm --filter mobile build` (`expo export --platform web`) all exit 0.
- No blockers for downstream plans in this wave; this plan's sole file ownership (`app/_layout.tsx`, everything under `lib/navigation/`) was respected — no edits made to `apps/mobile/app/exercises/` route files or `ExerciseImageTile.tsx`, which belong to sibling plans 03-16 and 03-15 this wave.

---
*Phase: 03-exercise-catalog*
*Completed: 2026-08-20*
