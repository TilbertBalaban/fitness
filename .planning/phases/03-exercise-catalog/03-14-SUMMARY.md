---
phase: 03-exercise-catalog
plan: 14
subsystem: ui
tags: [expo-router, react-native, navigation, authorization, ui-spec]

requires:
  - phase: 03-exercise-catalog
    provides: exercise detail screen, edit route, custom-exercise duplicate flow (03-08/03-09/03-13)
provides:
  - goBackOrReplace pure function and NavBackButton control for direct-URL-load-safe back navigation
  - app/exercises/_layout.tsx segment layout (header, anchor route, native gesture options)
  - unconditional Edit control on the exercise detail screen, routing to a reachable not-permitted explanation
  - a Navigation Contract section in 03-UI-SPEC.md stating the native/web gesture split and the edit-visibility rule
affects: [phase-03-uat, phase-999-native-sweep]

actuals:
  tokens: 4108
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Structural router interfaces for pure navigation logic: goBackOrReplace takes a three-member interface (canGoBack/back/replace) rather than importing expo-router, so it is testable with plain jest.fn()s and no renderer"
    - "Segment-layout auth guard: an app/<segment>/_layout.tsx collapses hoisted sibling routes into one guarded route, letting a root Stack.Protected guard cover the whole segment instead of only its list route"
    - "Visibility vs. permission separation: a detail-visibility predicate (resolveDetailActions) renders a control unconditionally while a separate route-level predicate (resolveEditAccess) enforces the actual permission"

key-files:
  created:
    - apps/mobile/lib/navigation/back.ts
    - apps/mobile/lib/navigation/__tests__/back.test.ts
    - apps/mobile/components/NavBackButton.tsx
    - apps/mobile/app/exercises/_layout.tsx
  modified:
    - apps/mobile/app/exercises/index.tsx
    - apps/mobile/app/exercises/[id].tsx
    - apps/mobile/lib/catalog/preferences.ts
    - apps/mobile/lib/catalog/__tests__/preferences.test.ts
    - apps/mobile/app/exercises/__tests__/exercise-detail-screen.test.ts
    - .planning/phases/03-exercise-catalog/03-UI-SPEC.md

key-decisions:
  - "Took option (a) for Edit discoverability: render Edit unconditionally and let the existing not-permitted screen explain, rather than relabeling Duplicate — resurrects already-tested UI and makes the not-permitted branch reachable by navigation"
  - "Declared unstable_settings.anchor: 'index' in the segment layout rather than initialRouteName — this expo-router version reads anchor first"
  - "Explicit gestureEnabled/fullScreenGestureEnabled even though both are inert on web, because a custom headerLeft is not guaranteed to preserve iOS's default interactive-pop gesture"

patterns-established:
  - "A segment _layout.tsx file is the single place that supplies header chrome, anchor route, and auth-guard coverage together — adding one closes navigation and authorization gaps in the same change when their root cause (hoisted sibling routes) is shared"

requirements-completed: [EXER-03, EXER-04, EXER-05]

coverage:
  - id: D1
    description: "goBackOrReplace falls back to replace() with the caller-supplied href when no previous stack entry exists (the direct-URL-load / refresh case), and calls back() otherwise"
    requirement: "EXER-05"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/navigation/__tests__/back.test.ts#goBackOrReplace"
        status: pass
    human_judgment: false
  - id: D2
    description: "app/exercises/_layout.tsx supplies a header, an anchor route, an explicit back control, and native gesture options across all four exercises routes"
    requirement: "EXER-05"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/exercises-screen.test.ts"
        status: pass
      - kind: other
        ref: "grep checks for unstable_settings/anchor/headerLeft/gestureEnabled/edit-[id] in app/exercises/_layout.tsx"
        status: pass
    human_judgment: true
    rationale: "Whether the header, its title, and the back control actually render on /exercises/seed_90_90_Hamstring in a browser is unobserved (WINDOWS R4/R5); browser testing was not authorized this session."
  - id: D3
    description: "Edit renders unconditionally on the exercise detail screen for every exercise, and routes to the edit route's reachable not-permitted branch for a non-owned (e.g. seeded) exercise"
    requirement: "EXER-04"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/preferences.test.ts#resolveDetailActions"
        status: pass
      - kind: unit
        ref: "apps/mobile/app/exercises/__tests__/exercise-detail-screen.test.ts#exercise detail screen — structural invariants"
        status: pass
    human_judgment: false
  - id: D4
    description: "The exercises segment collapses into one guarded route, so the root layout's signed-in guard now covers exercises/[id], exercises/new and exercises/edit/[id] (T-03-58, previously unguarded)"
    verification:
      - kind: other
        ref: "structural: single Stack.Screen name=exercises in app/_layout.tsx now matches the segment's own _layout.tsx per expo-router's own hoisting/screen-matching rules (cited in the plan's diagnosis)"
        status: pass
    human_judgment: true
    rationale: "Security-relevant behavior (a route no longer mounting signed-out) that follows deterministically from documented expo-router internals but has not been observed in a browser (WINDOWS R6)."

duration: 20min
completed: 2026-08-19
status: complete
---

# Phase 03 Plan 14: Back Navigation and Unconditional Edit Summary

**Segment layout (`app/exercises/_layout.tsx`) supplies header, anchor route, native swipe-back and — as a byproduct of its own existence — closes an auth-guard gap; Edit is now unconditional and routes to the previously-unreachable not-permitted explanation screen.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-08-19T15:14:00Z (approx.)
- **Completed:** 2026-08-19T15:34:00Z
- **Tasks:** 3
- **Files modified:** 10 (4 created, 6 modified)

## Accomplishments
- `goBackOrReplace` (pure function, structural router interface) and `NavBackButton` deliver a back control that works even on a direct URL load or page refresh — the exact case the reported bug hit, where react-navigation's own `canGoBack` is false
- `app/exercises/_layout.tsx` gives the exercises segment its own stack: an anchor route, an always-shown header with an explicit back control, and both native gesture options — and, because it collapses four previously-hoisted sibling routes into one, it also closes T-03-58 (detail/create/edit routes mounting regardless of session state)
- `resolveDetailActions` no longer carries an ownership-gated `showEdit` flag; the Edit control renders unconditionally on the detail screen and now reaches the edit route's already-written not-permitted explanation screen for any non-owner, including every one of the ~870 seeded exercises
- `03-UI-SPEC.md` gained a Back row in the Copywriting Contract and a `## Navigation Contract` section stating the native/web gesture split (web has no pan-gesture back at all) and the unconditional-Edit rule

## Task Commits

Each task was committed atomically:

1. **Task 1: A back decision that survives a direct URL load, and the control that uses it** - `bdbedff` (feat)
2. **Task 2: A segment layout that supplies the header, the anchor, the native gesture and the auth guard** - `2fcdb29` (feat)
3. **Task 3: Make Edit unconditional, make the not-permitted screen reachable, and record the contract change** - `7cf985e` (feat)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — orchestrator applies the final metadata commit after merge)

## Files Created/Modified
- `apps/mobile/lib/navigation/back.ts` - `goBackOrReplace(router, fallbackHref)`, a pure function over a structural router interface
- `apps/mobile/lib/navigation/__tests__/back.test.ts` - covers both branches plus verbatim-forwarding of the fallback href
- `apps/mobile/components/NavBackButton.tsx` - accessible, 48x48-minimum, theme-tinted back control used as the segment's `headerLeft`
- `apps/mobile/app/exercises/_layout.tsx` - the segment layout: anchor route, header, back control, gesture options, four titled child screens
- `apps/mobile/app/exercises/index.tsx` - removed the in-list "Exercises" heading duplicating the new header title; row goes end-justified
- `apps/mobile/app/exercises/[id].tsx` - Edit `Link` renders unconditionally; removed the now-unused `ownerId` state and the old three-argument `resolveDetailActions` call
- `apps/mobile/lib/catalog/preferences.ts` - `resolveDetailActions` reduced to a single `archivedAt` argument; `showEdit` removed from `DetailActionVisibility`
- `apps/mobile/lib/catalog/__tests__/preferences.test.ts` - replaced the two `showEdit`-pinning tests with a property-absence assertion and an unconditional-Duplicate assertion
- `apps/mobile/app/exercises/__tests__/exercise-detail-screen.test.ts` - added structural assertions that `showEdit` is absent from the compiled source and that the edit route path is present
- `.planning/phases/03-exercise-catalog/03-UI-SPEC.md` - Back row in Copywriting Contract; new `## Navigation Contract` section

## Decisions Made
- Took option (a) for Edit discoverability (render unconditionally, let the not-permitted screen explain) over option (b) (relabel Duplicate) — smaller change, resurrects already-tested UI, makes UAT test 2's not-permitted state reachable by navigation instead of only by typing a URL
- Used `unstable_settings.anchor: 'index'` (not `initialRouteName`) per the plan's diagnosis of this expo-router version's read order
- Kept `gestureEnabled`/`fullScreenGestureEnabled` explicit rather than relying on defaults, since a custom `headerLeft` is not guaranteed to preserve iOS's interactive-pop gesture

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Built the `@fitness/api-contracts` workspace package before typecheck would pass**
- **Found during:** Task 1 (`pnpm --filter mobile typecheck`)
- **Issue:** `tsc --noEmit` failed with `Cannot find module '@fitness/api-contracts'` across ~10 pre-existing files (none touched by this plan) because `packages/api-contracts/dist` did not exist in this worktree — a stale build state, not a code defect.
- **Fix:** Ran `pnpm --filter @fitness/api-contracts build` (a workspace build step, not a package-manager install of a new dependency — explicitly outside the Rule 3 package-install exclusion). `dist/` is gitignored, so nothing new needed committing.
- **Files modified:** none (build artifact only, gitignored)
- **Verification:** `pnpm --filter mobile exec tsc --noEmit` clean afterward, and after every subsequent task
- **Committed in:** not applicable — no tracked files changed

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to get a working typecheck signal; no scope creep, no tracked-file changes.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None — this plan closes a gap (G-03-4) rather than introducing new UI surface with placeholder data.

## WINDOWS Entries Recorded

Per the plan's `<verification>` section, browser testing was not authorized this session. Recorded as `unrun-verify`:

- **R4** — the segment header, title and back control actually painting on `/exercises/seed_90_90_Hamstring` is unobserved.
- **R5** — `goBackOrReplace`'s no-previous-entry fallback is proven against a fake router, not react-navigation's real `canGoBack` on a refreshed detail URL.
- **R6** (flagged security-relevant) — that the auth guard now covers `exercises/[id]`, `exercises/new` and `exercises/edit/[id]` follows deterministically from expo-router's own hoisting/screen-matching rules but has not been observed in a browser; must be verified before Phase 03 sign-off.
- **R7** — native swipe-back unverified; no Xcode/Android SDK on this machine, swept once at ROADMAP Phase 999.1 per project convention.

Also recorded as a `deviation` kind entry: the T-03-58 security fix itself (segment layout collapsing four hoisted routes under the root's existing signed-in guard), so the fix is traceable independent of the browser-verification gap.

## Next Phase Readiness
- `pnpm --filter mobile test` (311/311 passing), `typecheck` (clean) and `expo export --platform web` (exit 0, all 24 static routes including the four exercises routes) all pass — the plan's own `<verification>` section is fully satisfied at the automated layer.
- G-03-4 is closed at the code/test level. R4/R5/R6/R7 above are the residual browser/device-verification items a human UAT pass over the merged wave should settle; R6 in particular should be checked first since it is security-relevant.

---
*Phase: 03-exercise-catalog*
*Completed: 2026-08-19*

## Self-Check: PASSED

All created files confirmed present on disk (`back.ts`, `back.test.ts`, `NavBackButton.tsx`, `_layout.tsx`, this SUMMARY.md). All four commits (`bdbedff`, `2fcdb29`, `7cf985e`, `a7286ef`) confirmed present in `git log --all`.
