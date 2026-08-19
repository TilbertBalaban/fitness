---
status: diagnosed
phase: 03-exercise-catalog
source: [03-VERIFICATION.md]
started: 2026-08-19T16:45:00Z
updated: "2026-08-19T17:10:00Z"
---

## Current Test

[testing complete — 3 passed, 1 issue, 1 native-blocked]

## Tests

### 1. SECURITY — signed-out direct-URL access to the exercises segment

expected: While signed out, /exercises/seed_90_90_Hamstring, /exercises/new and /exercises/edit/seed_90_90_Hamstring all redirect to sign-in or fail to mount, matching /exercises.
result: pass
why_human: Security-relevant claim (T-03-58, WINDOWS #51/R6). Adding app/exercises/_layout.tsx should collapse all four routes under the root layout's `Stack.Protected guard={signedIn}`. This follows deterministically from expo-router's route-hoisting — confirmed by reading getRoutesCore.js/useScreens.js and by direct read of app/_layout.tsx:110-113 — but it has ZERO automated regression coverage (WR-03) and has never been observed in a running signed-out session. Highest-priority item before phase sign-off.

### 2. Image tiles actually paint on all three call sites

expected: Real vendored images render at a visible, non-collapsed size on list-row thumbnails, Suggested-Alternatives thumbnails, and the detail hero.
result: issue
reported: "List-row thumbnails render as flat colour blocks, not recognisable exercise images. Observed in Chromium against the live stack 2026-08-19."
severity: major
observed: "The tile container is correctly 56x42 with overflow:hidden, but the <img> inside is laid out at the source's INTRINSIC size (750x500, 850x567, 800x533 - measured on 8 consecutive rows, every one), so each thumbnail shows a magnified top-left crop. '3/4 Sit-Up' renders as a solid near-black square. Mechanism: StyleSheet.absoluteFill sets insets but no width/height, so react-native-web substitutes the source's intrinsic dimensions, which win over right:0/bottom:0; resizeMode='cover' also arrives as object-fit:fill rather than cover. The detail hero is NOT affected - it paints the real photograph correctly (measured styleW/styleH 100%). The Suggested-Alternatives call site was not separately observed, but it uses the same EXERCISE_THUMBNAIL_WIDTH=56 tile, so it is likely affected by the same mechanism."
note: "The 'No image available' string appearing in the detail hero's text content is NOT a defect - ExerciseImageTileView renders that label behind the image whenever width >= EXERCISE_IMAGE_LABEL_MIN_WIDTH, and an existing unit test asserts label and image render together."

### 3. FlashList recycling does not carry a failed image onto later rows

expected: Each row's thumbnail reflects that row's own exercise; a load failure in one list slot does not persist onto a different exercise later recycled into the same slot.
result: pass
verified: "Observed in Chromium against the live stack 2026-08-19. Aborted every image request for seed_90_90_Hamstring at the network layer (1 request aborted), confirmed that row alone fell back to the empty placeholder tile, then scrolled ~12000px so the list recycled through many slots. Re-inspected the rendered rows: 12 recycled rows, every one showing its own image, and ZERO rows showing a placeholder for an exercise other than the blocked one. The WR-01 fix (commit b4ae1c3, quick task 260819-wpp) holds under real FlashList recycling, not only in unit tests."

### 4. Back control on the detail route, including direct URL load and refresh
expected: A back control renders in the header; pressing it returns to the list. Reloading /exercises/seed_90_90_Hamstring directly still shows a working back control that replaces to /exercises rather than a dead or missing control.
result: pass
verified: "Observed in Chromium 2026-08-19. A visible 48x48 control with aria-label='Back' renders at (0,8) in the header on (a) in-app navigation from the list, (b) a cold direct load of /exercises/seed_90_90_Hamstring, and (c) a full page reload of that URL. Clicking it returns to the exercises list in all three cases. react-navigation's canGoBack predicate on a refreshed detail URL therefore resolves correctly and goBackOrReplace takes its replace branch."
caveat: "Back lands on /exercises?id=seed_90_90_Hamstring, not a clean /exercises. The list renders correctly, so this is cosmetic URL noise rather than a broken control - logged as a follow-up, not a failure of this checkpoint."

### 5. Full native (iOS/Android) pass over every catalog screen

expected: List, detail, create/edit forms, archive dialog, back navigation including native swipe-back, and swap suggestions all behave as the web/unit-verified logic, rendered correctly on native chrome.
result: [blocked]
why_human: No Xcode or Android SDK on this machine (WINDOWS #16/#34/#52, R7). Per project convention native testing is deferred and swept once at ROADMAP Phase 999.1 rather than per-phase — this item does not gate Phase 03.

## Summary

total: 5
passed: 3
issues: 1
pending: 0
skipped: 0
blocked: 1

## Gaps

- gap_id: G-03-2
  truth: "Real vendored images render at a visible, non-collapsed size on list-row thumbnails, Suggested-Alternatives thumbnails, and the detail hero"
  status: failed
  reason: "Observed 2026-08-19 in Chromium: list-row thumbnails lay the <img> out at the source's intrinsic size (750x500, 850x567, 800x533 across 8 consecutive rows) inside a correct 56x42 overflow:hidden tile, so each renders a magnified top-left crop - a flat colour block. The detail hero is unaffected."
  severity: major
  test: 2
  root_cause: "StyleSheet.absoluteFill supplies insets but no width/height. react-native-web then substitutes the image source's intrinsic dimensions, which take precedence over right:0/bottom:0, so the element never shrinks to its 56x42 parent. resizeMode='cover' also lands as object-fit:fill. The detail hero escapes this because its <img> resolves to width/height 100%."
  artifacts:
    - path: "apps/mobile/components/ExerciseImageTile.tsx"
      issue: "ExerciseImageTileView passes style={StyleSheet.absoluteFill} to <Image> with no explicit width/height"
  missing:
    - "Give the tile image an explicit width:100%/height:100% (in addition to, or instead of, absoluteFill) so intrinsic dimensions cannot win"
    - "Confirm resizeMode='cover' reaches the DOM as object-fit:cover"
    - "Extend coverage to the Suggested-Alternatives call site, which shares EXERCISE_THUMBNAIL_WIDTH and was not separately observed"

- gap_id: G-03-6
  truth: "A deep link to /exercises/{id} resolves the exercise on a cold load, as a URL-addressable web route should"
  status: failed
  reason: "NOT one of the five planned checkpoints - found incidentally while verifying test 4. On a freshly signed-up account, loading /exercises/seed_90_90_Hamstring directly renders 'Exercise not found - This exercise may have been removed.' and STAYS that way: polled at 3, 6, 10, 15, 20, 30 and 40 seconds, unchanged. Visiting /exercises once, then returning to the same URL, renders the exercise correctly, and a hard reload then keeps working."
  severity: major
  test: null
  root_cause: "Not diagnosed. The evidence indicates the catalog snapshot is loaded into local SQLite by the exercises LIST screen, and the detail route does not itself ensure the catalog is populated - so a deep link that never mounts the list finds an empty table. Confirmed not a race: the failure is stable over 40s."
  artifacts: []
  missing:
    - "Diagnose which screen owns the catalog snapshot load and make the detail route resilient to a cold, list-never-mounted start"

## Verification Method

Tests 2, 3 and 4 were driven with Playwright/Chromium on 2026-08-19 against the live stack:
NestJS API on :4000 (health ok), Postgres with 880 seeded exercises, PowerSync on :8080, and
`expo start --web` on :8081. Each run signed up a fresh account so local SQLite started empty.
The scratch harness was removed after the run; nothing was committed to the e2e suite.

Test 3 was exercised adversarially rather than observationally: one exercise's image requests were
aborted at the network layer so a genuine failure existed to leak, then the list was scrolled far
enough to recycle slots many times over.

## Follow-Ups

- Back navigation lands on `/exercises?id={id}` rather than a clean `/exercises`. The list renders
  correctly, so this is URL noise, not a broken control.
