---
status: complete
phase: 03-exercise-catalog
source: [03-VERIFICATION.md]
started: 2026-08-19T16:45:00Z
updated: "2026-08-20T14:30:00Z"
---

## Current Test

[testing complete — all outstanding gaps closed; 3 originally passed, 2 fixed and human-approved, 1 native-blocked (deferred to ROADMAP Phase 999.1)]

## Tests

### 1. SECURITY — signed-out direct-URL access to the exercises segment

expected: While signed out, /exercises/seed_90_90_Hamstring, /exercises/new and /exercises/edit/seed_90_90_Hamstring all redirect to sign-in or fail to mount, matching /exercises.
result: pass
why_human: Security-relevant claim (T-03-58, WINDOWS #51/R6). Adding app/exercises/_layout.tsx should collapse all four routes under the root layout's `Stack.Protected guard={signedIn}`. This follows deterministically from expo-router's route-hoisting — confirmed by reading getRoutesCore.js/useScreens.js and by direct read of app/_layout.tsx:110-113 — but at the time of this test it had ZERO automated regression coverage (WR-03).
update: WR-03 is now closed. Plan 03-17 added `apps/mobile/lib/navigation/__tests__/route-guard.test.ts`, which asserts against `expo-router`'s real `getRoutes()` output that all four exercises routes nest under the guarded layout node and share a `Stack.Protected guard={signedIn}` ancestor with `(tabs)`, and proves its own discriminating power by re-running with `_layout.tsx` removed and observing the bypass. Independently confirmed by direct read in 03-VERIFICATION.md's 2026-08-20T12:00:00Z round.

### 2. Image tiles actually paint on all three call sites

expected: Real vendored images render at a visible, non-collapsed size on list-row thumbnails, Suggested-Alternatives thumbnails, and the detail hero.
result: fixed
originally_reported: "List-row thumbnails render as flat colour blocks, not recognisable exercise images. Observed in Chromium against the live stack 2026-08-19."
severity: major
root_cause: "StyleSheet.absoluteFill sets insets but no width/height, so react-native-web substitutes the source's intrinsic dimensions, which win over right:0/bottom:0; resizeMode='cover' also arrives as object-fit:fill rather than cover."
fix: "Plan 03-15 (gap G-03-2). `ExerciseImageTile.tsx`'s `resolveTileImageStyle()` now returns `{ ...StyleSheet.absoluteFill, width: '100%', height: '100%' }`, giving the tile `Image` explicit percentage dimensions that override the bundled asset's intrinsic pixel size. Both call sites (`ExerciseListRow.tsx`, `SwapSuggestionList.tsx`) route through it. Verified: Task 3 (`checkpoint:human-verify`, `gate=\"blocking\"`) was approved by the user in a live browser session against list rows, Suggested Alternatives, and the detail hero — recorded in `03-15-SUMMARY.md`. Independently re-confirmed by direct code read in 03-VERIFICATION.md's 2026-08-20T12:00:00Z round."
note: "The 'No image available' string appearing in the detail hero's text content is NOT a defect — ExerciseImageTileView renders that label behind the image whenever width >= EXERCISE_IMAGE_LABEL_MIN_WIDTH, and an existing unit test asserts label and image render together."

### 3. FlashList recycling does not carry a failed image onto later rows

expected: Each row's thumbnail reflects that row's own exercise; a load failure in one list slot does not persist onto a different exercise later recycled into the same slot.
result: pass
verified: "Observed in Chromium against the live stack 2026-08-19. Aborted every image request for seed_90_90_Hamstring at the network layer (1 request aborted), confirmed that row alone fell back to the empty placeholder tile, then scrolled ~12000px so the list recycled through many slots. Re-inspected the rendered rows: 12 recycled rows, every one showing its own image, and ZERO rows showing a placeholder for an exercise other than the blocked one. The WR-01 fix (commit b4ae1c3, quick task 260819-wpp) holds under real FlashList recycling, not only in unit tests."

### 4. Back control on the detail route, including direct URL load and refresh

expected: A back control renders in the header; pressing it returns to the list. Reloading /exercises/seed_90_90_Hamstring directly still shows a working back control that replaces to /exercises rather than a dead or missing control.
result: pass
verified: "Observed in Chromium 2026-08-19. A visible 48x48 control with aria-label='Back' renders at (0,8) in the header on (a) in-app navigation from the list, (b) a cold direct load of /exercises/seed_90_90_Hamstring, and (c) a full page reload of that URL. Clicking it returns to the exercises list in all three cases. react-navigation's canGoBack predicate on a refreshed detail URL therefore resolves correctly and goBackOrReplace takes its replace branch."
caveat: "Back lands on /exercises?id=seed_90_90_Hamstring, not a clean /exercises. The list renders correctly, so this is cosmetic URL noise rather than a broken control - logged as a follow-up, not a failure of this checkpoint."
incidental_finding: "While verifying this test, a separate cold-deep-link defect (G-03-6) was found and is tracked below — not a failure of this checkpoint's own expected behavior."

### 5. Full native (iOS/Android) pass over every catalog screen

expected: List, detail, create/edit forms, archive dialog, back navigation including native swipe-back, and swap suggestions all behave as the web/unit-verified logic, rendered correctly on native chrome.
result: [blocked]
why_human: No Xcode or Android SDK on this machine (WINDOWS #16/#34/#52, R7). Per project convention native testing is deferred and swept once at ROADMAP Phase 999.1 rather than per-phase — this item does not gate Phase 03.

## Summary

total: 5
passed: 3
fixed: 2
pending: 0
skipped: 0
blocked: 1

## Gaps

- gap_id: G-03-2
  truth: "Real vendored images render at a visible, non-collapsed size on list-row thumbnails, Suggested-Alternatives thumbnails, and the detail hero"
  status: fixed
  reason: "Closed by plan 03-15. `resolveTileImageStyle()` in `apps/mobile/components/ExerciseImageTile.tsx` gives the tile `Image` explicit `width:'100%'`/`height:'100%'` on top of the absolute-fill insets, overriding the bundled asset's intrinsic pixel dimensions per react-native-web's style-composition order. Both call sites (`ExerciseListRow.tsx`, `SwapSuggestionList.tsx`) confirmed routed through it. Human-approved in a live browser session (Task 3, blocking checkpoint, `03-15-SUMMARY.md`), covering list rows, Suggested Alternatives, and the detail hero with no regression. Independently re-confirmed by direct code read in 03-VERIFICATION.md."
  severity: major
  test: 2
  root_cause: "StyleSheet.absoluteFill supplies insets but no width/height. react-native-web then substitutes the image source's intrinsic dimensions, which take precedence over right:0/bottom:0, so the element never shrinks to its 56x42 parent. resizeMode='cover' also lands as object-fit:fill. The detail hero escapes this because its <img> resolves to width/height 100%."
  artifacts:
    - path: "apps/mobile/components/ExerciseImageTile.tsx"
      issue: "Fixed — resolveTileImageStyle() now returns explicit width:'100%'/height:'100%' alongside StyleSheet.absoluteFill"
  fixed_by: plan 03-15

- gap_id: G-03-6
  truth: "A deep link to /exercises/{id} resolves the exercise on a cold load, as a URL-addressable web route should"
  status: fixed
  reason: "Closed by plan 03-16. `apps/mobile/lib/catalog/ensure-catalog.ts` (new) is a single-flight, module-level memoized `ensureCatalogLoaded` seam that all three catalog-reading routes (`index.tsx`, `[id].tsx`, `edit/[id].tsx`) now call in their load effect before resolving detail state, so `not-found` can no longer be reached without a completed successful catalog load. Human-approved on two freshly signed-up accounts (Task 3, blocking checkpoint, `03-16-SUMMARY.md`), including the negative case (a genuinely absent id still reports not-found) and the edit-route cold-load case. Independently re-confirmed by direct code read in 03-VERIFICATION.md."
  severity: major
  test: null
  root_cause: "The catalog snapshot was loaded into local SQLite only by the exercises LIST screen; the detail route did not itself ensure the catalog was populated, so a deep link that never mounted the list found an empty table."
  artifacts:
    - path: "apps/mobile/lib/catalog/ensure-catalog.ts"
      issue: "Fixed — new single-flight hydration seam shared by all three catalog-reading routes"
  fixed_by: plan 03-16

## Verification Method

Tests 2, 3 and 4 were driven with Playwright/Chromium on 2026-08-19 against the live stack:
NestJS API on :4000 (health ok), Postgres with 880 seeded exercises, PowerSync on :8080, and
`expo start --web` on :8081. Each run signed up a fresh account so local SQLite started empty.
The scratch harness was removed after the run; nothing was committed to the e2e suite.

Test 3 was exercised adversarially rather than observationally: one exercise's image requests were
aborted at the network layer so a genuine failure existed to leak, then the list was scrolled far
enough to recycle slots many times over.

G-03-2 and G-03-6 closures were each confirmed by a live-browser blocking human-verify checkpoint
(plans 03-15 and 03-16 respectively) rather than by re-running this UAT's own Playwright harness,
and independently cross-checked against current source in 03-VERIFICATION.md's re-verification
rounds (2026-08-20T12:00:00Z and 2026-08-20T14:30:00Z).

## Follow-Ups

- Back navigation lands on `/exercises?id={id}` rather than a clean `/exercises`. The list renders
  correctly, so this is URL noise, not a broken control.
- WR-02 (native header title duplicates in-body heading on `new.tsx`/`edit/[id].tsx`) and IN-01
  (`loadOwnerAndVariation`'s unused `ownerId`) remain open per `03-REVIEW.md`. Both are cosmetic/
  dead-code and do not bear on any roadmap success criterion; judged non-blocking for phase sign-off.
