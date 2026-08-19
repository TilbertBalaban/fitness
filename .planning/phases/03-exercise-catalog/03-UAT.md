---
status: partial
phase: 03-exercise-catalog
source: [03-VERIFICATION.md]
started: 2026-08-19T16:45:00Z
updated: "2026-08-19T17:10:00Z"
---

## Current Test

[testing paused — 4 items outstanding]

## Tests

### 1. SECURITY — signed-out direct-URL access to the exercises segment

expected: While signed out, /exercises/seed_90_90_Hamstring, /exercises/new and /exercises/edit/seed_90_90_Hamstring all redirect to sign-in or fail to mount, matching /exercises.
result: pass
why_human: Security-relevant claim (T-03-58, WINDOWS #51/R6). Adding app/exercises/_layout.tsx should collapse all four routes under the root layout's `Stack.Protected guard={signedIn}`. This follows deterministically from expo-router's route-hoisting — confirmed by reading getRoutesCore.js/useScreens.js and by direct read of app/_layout.tsx:110-113 — but it has ZERO automated regression coverage (WR-03) and has never been observed in a running signed-out session. Highest-priority item before phase sign-off.

### 2. Image tiles actually paint on all three call sites

expected: Real vendored images render at a visible, non-collapsed size on list-row thumbnails, Suggested-Alternatives thumbnails, and the detail hero.
result: skipped
reason: "User skipped remaining UAT tests"
why_human: G-03-3's fix (resolveTileBox, absolute-inset fill, shared width contract) is proven by 20 new unit tests, a clean typecheck and a clean web bundle — but no pixel has ever been observed painting (WINDOWS #36/#37/#39/#46). This exact combination of green checks previously coexisted with a 100%-reproducible "no image ever paints" defect, so tests are weak evidence here.

### 3. FlashList recycling does not carry a failed image onto later rows

expected: Each row's thumbnail reflects that row's own exercise; a load failure in one list slot does not persist onto a different exercise later recycled into the same slot.
result: skipped
reason: "User skipped remaining UAT tests"
why_human: Code-confirmed defect WR-01 (03-REVIEW.md), NOT fixed by 03-13 and outside its scope. ExerciseImageTile's `failed` state has no reset keyed on `source`, and ExerciseListRow renders inside a recycling FlashList (@shopify/flash-list 2.0.2). Detail hero and SwapSuggestionList use plain .map and are unaffected. A state-across-recycling defect cannot be caught by typecheck or single-render unit tests. Reproduce by throttling/blocking one image request, then scrolling past that slot. Fix: reset `failed` in a useEffect keyed on the effective source.

### 4. Back control on the detail route, including direct URL load and refresh

expected: A back control renders in the header; pressing it returns to the list. Reloading /exercises/seed_90_90_Hamstring directly still shows a working back control that replaces to /exercises rather than a dead or missing control.
result: skipped
reason: "User skipped remaining UAT tests"
why_human: app/exercises/_layout.tsx and goBackOrReplace are structurally verified (anchor declared, function-valued headerLeft, both branches pass against a fake router in back.test.ts), but the header, its title, the control's real rendering, and react-navigation's real canGoBack predicate on a refreshed detail URL have never been observed in a browser (WINDOWS #49/#50, R4/R5).

### 5. Full native (iOS/Android) pass over every catalog screen

expected: List, detail, create/edit forms, archive dialog, back navigation including native swipe-back, and swap suggestions all behave as the web/unit-verified logic, rendered correctly on native chrome.
result: [blocked]
why_human: No Xcode or Android SDK on this machine (WINDOWS #16/#34/#52, R7). Per project convention native testing is deferred and swept once at ROADMAP Phase 999.1 rather than per-phase — this item does not gate Phase 03.

## Summary

total: 5
passed: 1
issues: 0
pending: 0
skipped: 3
blocked: 1

## Gaps
