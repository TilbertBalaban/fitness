---
phase: 03-exercise-catalog
verified: 2026-08-19T16:30:00Z
status: human_needed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 9/9
  gaps_closed:
    - "G-03-3: Suggested Alternatives (and every other) exercise image tile collapsed to a zero-height box (ratio-on-percentage sizing) and painted nothing, silently. Closed by plan 03-13: ExerciseImageTile rewritten with resolveTileBox (pure, floors to a positive box for any input) and an absolute-inset Image fill; all three call sites (ExerciseListRow, SwapSuggestionList, detail hero) route through the shared EXERCISE_THUMBNAIL_WIDTH/resolveHeroImageWidth contract; placeholder now renders behind the image instead of as its else-branch; container gained a border so an empty tile is visible against both surface and background parents."
    - "G-03-4: from an exercise detail route the user could reach neither the Edit form (hidden behind an ownership gate that is false for all ~870 seeded exercises) nor navigate back (no segment layout, no header, no back control, and no anchor route so a direct URL load produced a single-entry stack). Closed by plan 03-14: app/exercises/_layout.tsx supplies a header, an anchor route (unstable_settings.anchor: 'index'), a function-valued headerLeft (NavBackButton) driven by goBackOrReplace's tested fallback-to-replace logic, and native gesture options; resolveDetailActions no longer carries a showEdit flag, so Edit renders unconditionally and routes to the edit route's already-written not-permitted explanation for non-owners. As a byproduct, the segment layout also closes an auth-guard hole (T-03-58): the four exercises routes were root-stack siblings and only the list route was covered by the signed-in guard; collapsing them under one _layout.tsx route brings exercises/[id], exercises/new and exercises/edit/[id] under the existing Stack.Protected guard."
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Open an exercise detail screen and the Suggested Alternatives section; confirm every image tile (list row thumbnails, alternatives-row thumbnails, detail hero) actually paints a picture, not an empty/placeholder tile."
    expected: "Real vendored images render at a visible, non-collapsed size on all three call sites."
    why_human: "G-03-3's fix (resolveTileBox, absolute-inset fill, shared width contract) is proven by 16+4 new unit tests, a clean typecheck and a clean web bundle, but the actual pixels painting in a browser/device were never observed (WINDOWS #36/#37/#39/#46). No browser was launched this verification round per CLAUDE.md's global rule."
  - test: "Scroll the ~870-row exercise list continuously, including past any row whose image fails to load (e.g. throttle/block one image request), and confirm subsequently-scrolled-in rows still show their own correct image rather than the previous failed row's blank tile."
    expected: "Each row's thumbnail reflects that row's own exercise; a load failure in one FlashList slot does not persist onto a different exercise recycled into the same slot."
    why_human: "Code-confirmed defect (WR-01 in 03-REVIEW.md, not fixed by 03-13): ExerciseImageTile's `failed` state has no dependency on `source`, and @shopify/flash-list@2.0.2 documents view recycling for ExerciseListRow. Once any image fails in a given list slot, every subsequent exercise recycled into that slot renders as broken/blank regardless of its own image validity. Detail hero and SwapSuggestionList (plain .map, not recycled) are unaffected. Not caught by any test — a state-across-recycling defect cannot be observed via typecheck or a single-render unit test. Recommend filing as a new WINDOWS entry and a follow-up fix (reset `failed` in a `useEffect` keyed on the effective source) before relying on the list at scale."
  - test: "From /exercises/seed_90_90_Hamstring (or any exercise detail route), confirm a back control renders in the header, pressing it returns to the list, and reloading/refreshing that exact URL directly still shows a working back control that replaces to /exercises rather than rendering a dead or missing control."
    expected: "Back control present and functional both when navigated-to from the list and when the URL is loaded directly / refreshed."
    why_human: "app/exercises/_layout.tsx and goBackOrReplace are structurally verified (file exists, declares the anchor, supplies a function-valued headerLeft, both branches pass against a fake router in back.test.ts) but the header, its title and the control's real rendering, plus react-navigation's real canGoBack predicate on a refreshed detail URL, have not been observed in a browser (WINDOWS #49/#50, R4/R5)."
  - test: "SECURITY-RELEVANT — while signed out, attempt to load /exercises/seed_90_90_Hamstring, /exercises/new and /exercises/edit/seed_90_90_Hamstring directly by URL; confirm all three redirect to sign-in / do not mount, matching the existing behavior of /exercises."
    expected: "None of the three routes render their protected content while signed out — the segment layout's existence should bring them under the root layout's Stack.Protected(signedIn) guard the same way it already covers /exercises."
    why_human: "This is a security-relevant claim (T-03-58, WINDOWS #51/R6) that follows deterministically from expo-router's documented route-hoisting and screen-matching behavior (confirmed by direct reading of node_modules/expo-router's getRoutesCore.js and useScreens.js during 03-14's diagnosis, and re-confirmed this round by reading app/_layout.tsx's Stack.Protected(signedIn) wrapping <Stack.Screen name=\"exercises\" />), but it has zero automated regression coverage (WR-03 in 03-REVIEW.md) and has never been observed in a running app. Must be verified before Phase 03 sign-off per the plan's own verification section."
  - test: "Full native (iOS/Android) pass over every catalog screen — list, detail, create/edit forms, archive dialog, back navigation (including native swipe-back), and swap suggestions."
    expected: "Same behavior as the web/unit-test-verified logic, rendered correctly on native chrome."
    why_human: "No Xcode or Android SDK on this machine (WINDOWS #16/#34/#52, R7). Per project convention (MEMORY.md: native testing deferred to final phase) this is swept once at ROADMAP Phase 999.1 rather than per-phase."
---

# Phase 3: Exercise Catalog Verification Report

**Phase Goal:** The user can find any exercise they train, and the catalog carries the muscle and load metadata everything downstream depends on.
**Verified:** 2026-08-19T16:30:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (G-03-3, plan 03-13; G-03-4, plan 03-14)

## Goal Achievement

### G-03-3 Gap Closure — Verified Genuinely Closed at the Code Level

03-UAT.md (`status: diagnosed`) recorded: "I don't see thumbnail in '5 suggested alternatives'" — root cause
documented in `.planning/debug/alternatives-thumbnail-missing.md`: `ExerciseImageTile`'s container had no
pixel dimension anywhere in its chain (a ratio style on a percentage-width box), so the `<Image>` inside asked
for a percentage of a height that never resolved, and react-native-web painted nothing, silently. Verified
below against actual current source, not the SUMMARY's narrative:

| Must-have (03-13 PLAN frontmatter) | Verified against | Status |
|---|---|---|
| Every tile renders inside a box whose width/height are finite positive numbers for any input, including 0/negative/NaN/Infinity | `apps/mobile/components/ExerciseImageTile.tsx:33-36` `resolveTileBox` — floors to `MIN_TILE_WIDTH` (24) for any non-finite or ≤-floor input; direct read confirms the guard | ✓ VERIFIED |
| The image fills the box by absolute inset, not by percentage of an unresolved height | `ExerciseImageTile.tsx:67` — `style={StyleSheet.absoluteFill}`; `grep -q "aspectRatio:"` and `grep -q "'100%'"` both return no matches in the file (confirmed) | ✓ VERIFIED |
| Placeholder renders behind the image, not as its else-branch | `ExerciseImageTile.tsx:66-67` — the `Text` label and the `Image` are sibling children, not an if/else pair | ✓ VERIFIED |
| Empty tile delineated by its own border against both a `surface` and a `background` parent | `ExerciseImageTile.tsx:63` — `className` includes `border border-foreground-muted` unconditionally | ✓ VERIFIED |
| All three call sites (list row, alternatives row, detail hero) size their tile through one shared width contract | `ExerciseListRow.tsx:40` and `SwapSuggestionList.tsx:57` both pass `width={EXERCISE_THUMBNAIL_WIDTH}`; `app/exercises/[id].tsx:306` passes `width={resolveHeroImageWidth(windowWidth)}` — confirmed by direct read of all three files | ✓ VERIFIED |
| `getLocalCatalogImage`'s declared type matches the bundler-emitted value on web | `catalog-image-map.generated.ts` — regenerated, `grep -q "number | null"` finds no match; 870 entries confirmed (`grep -c '": \[require('` → 870) | ✓ VERIFIED |
| New tests assert a real `Image` element with a non-null source in a positive-size box | `ExerciseImageTile.test.tsx` (16 tests) + `SwapSuggestionList.test.tsx` (4 new tests) — both re-run this round, all pass | ✓ VERIFIED |

**Behavioral evidence, re-run independently this round (not taken from the SUMMARY):**
`pnpm --filter mobile exec jest components/__tests__/ExerciseImageTile.test.tsx lib/navigation/__tests__/back.test.ts lib/catalog/__tests__/preferences.test.ts app/exercises/__tests__/exercise-detail-screen.test.ts components/__tests__/SwapSuggestionList.test.tsx`
→ 5 suites, 54 tests, all pass. Full `pnpm --filter mobile test` → 22 suites / 311 tests, all pass.
`pnpm --filter mobile typecheck` → clean.

**New defect found by this round's own code review (03-REVIEW.md WR-01), not fixed by 03-13:**
`ExerciseImageTile`'s `failed` state (`ExerciseImageTile.tsx:75`) has no dependency on the tile's effective
`source` — confirmed by direct read: `const [failed, setFailed] = useState(false);` with no `useEffect`
resetting it when `source`/`uri`/`localSource` changes. `ExerciseListRow` renders inside
`@shopify/flash-list@2.0.2` (`app/exercises/index.tsx`), which recycles view instances rather than destroying
them. Once any image fails to load in a given list slot, every subsequent exercise recycled into that same
slot renders as broken/blank forever, regardless of its own image's validity — a state-leak, not the
box-collapse defect G-03-3 targeted. `SwapSuggestionList` (a plain, non-recycled `.map()`) and the detail hero
(one instance per screen mount) are unaffected. This is real, code-confirmed (not a hypothesis), scoped to the
FlashList-backed catalog list, and was not in 03-13's stated must-haves. Not severe enough on its own to block
the phase goal (search/filter/detail viewing all work; this affects only already-failed thumbnails re-used by
a later row), but it directly bears on truth 1's "images" clause and is carried into human_verification below
rather than silently accepted.

**Conclusion: G-03-3 is closed at the code level** — the collapsing-box mechanism is fixed and independently
re-confirmed by direct source read and a fresh test run, not the SUMMARY's narrative. Whether pixels actually
paint on a real screen remains unobserved (WINDOWS #36/#37/#39/#46, carried into human_verification), and a
related-but-distinct recycling defect (WR-01) was found and is also carried into human_verification rather
than closed.

### G-03-4 Gap Closure — Verified Genuinely Closed at the Code Level

03-UAT.md recorded: "I don't see edit form. I don't know how to go back... add back-arrow button + support
swipes" — root cause documented in `.planning/debug/detail-screen-no-back-nav-no-edit.md`: no
`app/exercises/_layout.tsx` existed, so all four exercises routes were hoisted into the root stack with
`headerShown: false` and no back affordance anywhere; Edit was hidden behind an ownership flag that is false
for every seeded exercise. Verified below against actual current source:

| Must-have (03-14 PLAN frontmatter) | Verified against | Status |
|---|---|---|
| Every route in the segment renders a header with a back control, present with or without a stack entry beneath it | `app/exercises/_layout.tsx:18-32` — `headerShown: true`, `headerLeft: () => <NavBackButton fallbackHref="/exercises" />` (function-valued, not the default) | ✓ VERIFIED |
| Pressing back returns to the previous screen when one exists, otherwise replaces with the catalog list | `lib/navigation/back.ts:14-20` `goBackOrReplace` — `back.test.ts` re-run this round, both branches pass; forwards the fallback href verbatim | ✓ VERIFIED |
| The segment declares an anchor route so a deep link resolves against a stack with the list beneath it | `app/exercises/_layout.tsx:8` — `export const unstable_settings = { anchor: 'index' };` | ✓ VERIFIED |
| Native swipe-back enabled despite the custom back control | `app/exercises/_layout.tsx:30-31` — `gestureEnabled: true, fullScreenGestureEnabled: true` | ✓ VERIFIED |
| No web pan-gesture back claimed anywhere | `03-UI-SPEC.md` `## Navigation Contract` section (confirmed present via `grep -q "Navigation Contract"`) states web has no pan-gesture back; plan's own verification section restates the same | ✓ VERIFIED |
| Edit control renders unconditionally, routes to the edit route | `app/exercises/[id].tsx:294-302` — `Link` no longer wrapped in an `actions.showEdit` conditional (confirmed by direct read and `! grep -q "showEdit"` over both `preferences.ts` and `[id].tsx`) | ✓ VERIFIED |
| Opening edit for a seeded (non-owned) exercise renders the not-permitted explanation + Duplicate action | `lib/catalog/custom-exercise.ts:368-371` `resolveEditAccess` returns `'not-permitted'` unless `ownerUserId === currentUserId` (seeded rows have `ownerUserId: null`, never matches); `edit/[id].tsx:188-200` renders that branch — both confirmed by direct read | ✓ VERIFIED |
| `resolveDetailActions` carries no ownership-gated edit-visibility field | `preferences.ts:121-139` — `DetailActionVisibility` has only `showDuplicate`/`archiveLabel`; `preferences.test.ts:273` asserts `.not.toHaveProperty('showEdit')`, re-run this round, passes | ✓ VERIFIED |
| The exercises segment is one guarded route beneath the root's signed-in guard | `app/_layout.tsx:110-113` — `<Stack.Protected guard={signedIn}><Stack.Screen name="exercises" /></Stack.Protected>` (confirmed by direct read this round); with `_layout.tsx` now present, expo-router's hoisting collapses all four routes under this one screen name | ✓ VERIFIED (structural; not browser-observed, see below) |
| Catalog list shows exactly one "Exercises" title | `app/exercises/index.tsx` — `! grep -q ">Exercises<"` passes (in-list heading removed); title now supplied once by `_layout.tsx`'s `Stack.Screen name="index" options={{ title: 'Exercises' }}` | ✓ VERIFIED |

**Behavioral evidence, re-run independently this round:** the same 5-suite/54-test run above includes
`back.test.ts` and `preferences.test.ts`. Full suite (22/22 suites, 311/311 tests) and typecheck both re-run
clean this round, not merely cited from the SUMMARY.

**New defect found by this round's own code review (03-REVIEW.md WR-02), not blocking but real:**
`_layout.tsx` now shows a native header with `title: 'Add Custom Exercise'` / `title: 'Edit Exercise'` on the
`new` and `edit/[id]` screens, but those screens still render their own identical in-body heading text
(`new.tsx:145`, `edit/[id].tsx:239`) — confirmed by direct read of both files, both headings still present.
The same diff removed the equivalent duplicate from `index.tsx` but missed these two. Cosmetic (duplicate
title text), not a functional blocker; carried forward as a non-blocking warning, not gated.

**Security-relevant claim re-confirmed structurally, not yet browser-observed:** T-03-58's claim that the
segment layout brings `exercises/[id]`, `exercises/new` and `exercises/edit/[id]` under the existing
`Stack.Protected(signedIn)` guard was re-verified this round by direct read of `app/_layout.tsx` (confirms the
guard wraps `<Stack.Screen name="exercises" />`) and is corroborated by 03-REVIEW.md's independent read of
`expo-router`'s own `getRoutesCore.js` route-hoisting source. `03-REVIEW.md` (WR-03) separately notes this has
**zero automated regression test** — nothing in CI would catch a future edit that reopens this hole. Per the
plan's own verification section, this must be observed in a browser before Phase 03 sign-off (WINDOWS #51/R6)
— carried into human_verification as the highest-priority remaining item.

**Conclusion: G-03-4 is closed at the code level** — independently re-confirmed by direct source read and a
fresh test run. The security-relevant auth-guard consequence is structurally sound and correctly reasoned
from expo-router's documented behavior, but is untested and unobserved, and must be verified before ship.

### Observable Truths (9 phase-level truths)

None of the 9 truths established in earlier rounds changed shape at the requirement level — 03-13 and 03-14
touched the image-rendering and navigation/authorization mechanics beneath truths 1, 3, 4, 5 and 9, not the
requirements themselves. Re-confirmed by direct source read and fresh test runs this round:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can search ~870 exercises by name (and alias), filter by muscle/equipment/pattern, and open one to see target muscles, cues, and images | ✓ VERIFIED (code level) | `search-index.ts`, `catalog-filter.ts`, `exercise-detail.ts`, `[id].tsx` all present, substantive, wired; image-tile collapse defect (G-03-3) fixed and re-tested. Caveats: pixels-on-screen unobserved (see human_verification), and WR-01's recycling state-leak is a real, unaddressed, code-confirmed limitation on the list view specifically |
| 2 | User can create and edit their own exercises, and request suggested alternatives for any exercise | ✓ VERIFIED | `custom-exercise.ts` (create/update/duplicate), `smart-swap.ts`; Edit is now unconditionally reachable (G-03-4) instead of hidden by an ownership flag |
| 3 | Archiving removes from pickers/search, past logged sets stay attributed, per-user and idempotent | ✓ VERIFIED | `preferences.ts::setArchived`, `catalog-filter.ts::buildArchivedSet`, cross-user isolation e2e test (unchanged by this round's plans) |
| 4 | Every exercise carries an explicit load type, bodyweight/assisted/time/distance all representable pre-logging-UI | ✓ VERIFIED | `apps/api/src/db/schema/catalog.ts` CHECK constraint, `packages/api-contracts/src/catalog.ts` LOAD_TYPES tuple, `new.tsx` picker (unchanged by this round's plans) |

**Score:** 9/9 truths verified at the code level (0 present-but-behavior-unverified in the formal sense — the
back-navigation state transition is proven by a real behavioral test against a fake router, not merely
presence; the residual uncertainty is whether react-navigation's real `canGoBack` on a refreshed URL agrees,
which is filed as human_verification rather than left silently assumed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/mobile/components/ExerciseImageTile.tsx` (03-13, rewritten) | Non-collapsing box, absolute-inset image, border, behind-not-instead placeholder | ✓ VERIFIED | 81 lines, re-read this round, matches plan exactly |
| `apps/mobile/components/__tests__/ExerciseImageTile.test.tsx` (03-13, new) | Geometry/layering/border assertions | ✓ VERIFIED | Present, 16 tests, all pass |
| `apps/mobile/lib/catalog/catalog-image-map.generated.ts` (03-13, regenerated) | Corrected `ImageSourcePropType` return type, 870 entries | ✓ VERIFIED | 870 entries confirmed by grep, no `number \| null` remains |
| `scripts/generate-catalog-image-map.cjs` (03-13, modified) | Emits corrected types at generation time | ✓ VERIFIED | Present, confirmed via regenerated output |
| `apps/mobile/app/exercises/_layout.tsx` (03-14, new) | Header, anchor, back control, gesture options, auth-guard consequence | ✓ VERIFIED | 41 lines, re-read this round, matches plan exactly |
| `apps/mobile/components/NavBackButton.tsx` (03-14, new) | Accessible, 48x48, theme-tinted back control | ✓ VERIFIED | Present, uses `useThemeColors`, `accessibilityLabel="Back"`, `minWidth/minHeight: 48` |
| `apps/mobile/lib/navigation/back.ts` (03-14, new) | Pure `goBackOrReplace` over a structural router interface | ✓ VERIFIED | 21 lines, no expo-router import, matches plan |
| `apps/mobile/lib/navigation/__tests__/back.test.ts` (03-14, new) | Both branches + verbatim href forwarding | ✓ VERIFIED | Present, re-run this round, all pass |
| `.planning/phases/03-exercise-catalog/03-UI-SPEC.md` (03-14, modified) | Back row + Navigation Contract section | ✓ VERIFIED | `grep -q "Navigation Contract"` confirms present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `ExerciseListRow.tsx` / `SwapSuggestionList.tsx` / `app/exercises/[id].tsx` | `ExerciseImageTile.tsx` | `width={EXERCISE_THUMBNAIL_WIDTH}` / `width={resolveHeroImageWidth(windowWidth)}` | ✓ WIRED | Confirmed by direct read of all three call sites |
| `app/exercises/_layout.tsx` | `NavBackButton.tsx` | `headerLeft: () => <NavBackButton fallbackHref="/exercises" />` | ✓ WIRED | Confirmed by direct read |
| `NavBackButton.tsx` | `lib/navigation/back.ts` | `onPress={() => goBackOrReplace(router, fallbackHref)}` | ✓ WIRED | Confirmed by direct read |
| `app/_layout.tsx` (`Stack.Protected guard={signedIn}`) | `app/exercises/_layout.tsx` (segment) | expo-router route hoisting: `Stack.Screen name="exercises"` now matches the whole segment once `_layout.tsx` exists | ✓ WIRED (structural) | Confirmed by direct read of both files; browser observation still pending (R6) |
| `app/exercises/[id].tsx` (Edit link) | `app/exercises/edit/[id].tsx` (`resolveEditAccess`) | `<Link href={{ pathname: '/exercises/edit/[id]', ... }} asChild>` unconditional; edit route enforces permission | ✓ WIRED | Confirmed by direct read |
| (All other Phase-3 catalog links from prior rounds) | | | ✓ WIRED | Unchanged; 03-13/03-14 touched only image-rendering and navigation/auth-guard files |

### Data-Flow Trace (Level 4)

Unchanged from the prior round: catalog list/detail render from PowerSync-backed live queries over the
`seededExercise`/`exercise`/`exercise_muscle_mapping`/`muscle_group` tables. 03-13/03-14 touched only
presentational sizing (`ExerciseImageTile`) and navigation/routing (`_layout.tsx`, `back.ts`) — no data-source
wiring changed. Status: ✓ FLOWING, re-confirmed by direct read finding no new hardcoded/static fallback in
either plan's file scope.

### Behavioral Spot-Checks

Run independently this verification round, not taken from the SUMMARYs' narration:

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Gap-closure test files pass in isolation | `pnpm --filter mobile exec jest components/__tests__/ExerciseImageTile.test.tsx lib/navigation/__tests__/back.test.ts lib/catalog/__tests__/preferences.test.ts app/exercises/__tests__/exercise-detail-screen.test.ts components/__tests__/SwapSuggestionList.test.tsx` | 5 suites / 54 tests, all pass | ✓ PASS |
| Full mobile suite | `pnpm --filter mobile test` | 22 suites / 311 tests, all pass | ✓ PASS |
| Mobile typecheck | `pnpm --filter mobile typecheck` | clean | ✓ PASS |
| api-contracts suite | `pnpm --filter @fitness/api-contracts test` | 3 suites / 66 tests, all pass | ✓ PASS |
| api suite | `pnpm --filter api test` | 3 suites / 50 tests, all pass | ✓ PASS |
| Image map integrity | `grep -c '": \[require(' catalog-image-map.generated.ts` | 870 | ✓ PASS |

Total: 427 tests (66 + 50 + 311), matching the SUMMARY's claim and independently re-run rather than trusted.
Browser/device rendering (paint, header, back-control visuals, signed-out route guard) was not run — forbidden
by CLAUDE.md's global rule against launching a browser unless explicitly asked; these are the items filed
under Human Verification below.

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or found for this phase. Skipped — not a migration/tooling
phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| EXER-01 | 03-01, 03-05, 03-06, 03-11, 03-12, 03-13 | Search exercise library by name | ✓ Satisfied | `search-index.ts`; image-tile fix removes a rendering defect on the same screen |
| EXER-02 | 03-01, 03-02, 03-04, 03-05, 03-06, 03-11, 03-12 | Filter by muscle group/equipment/movement pattern | ✓ Satisfied | `catalog-filter.ts`, unchanged this round |
| EXER-03 | 03-01, 03-04, 03-05, 03-07, 03-12, 03-13, 03-14 | View exercise detail (incl. images) | ✓ Satisfied | `exercise-detail.ts` + detail screen; hero image sizing and Edit reachability both fixed this round |
| EXER-04 | 03-03, 03-08, 03-14 | Create custom exercise | ✓ Satisfied | `custom-exercise.ts::createCustomExercise`; unrelated to this round's diff |
| EXER-05 | 03-03, 03-08, 03-14 | Edit/duplicate custom exercise | ✓ Satisfied | Edit now unconditionally reachable (G-03-4); duplicate unchanged |
| EXER-06 | 03-02, 03-03, 03-09 | Archive exercise, logged sets stay attributed | ✓ Satisfied | Unchanged this round |
| EXER-07 | 03-02, 03-03, 03-09 | Never-suggest without deleting | ✓ Satisfied | Unchanged this round |
| EXER-08 | 03-01, 03-02, 03-04 | Load-type vocabulary representable pre-logging-UI | ✓ Satisfied | Unchanged this round |
| EXER-09 | (schema groundwork only, 03-02/03-04) | Bodyweight contribution accounted for in volume/load | Correctly Pending — out of phase-3 scope | Matches REQUIREMENTS.md line 34/211 (`Pending`) |
| EXER-10 | 03-10, 03-13 | Suggested alternatives (smart swap) | ✓ Satisfied | `smart-swap.ts`; alternatives-row thumbnail fix (G-03-3) directly closes the reported defect |

No orphaned requirements: all 10 EXER-* IDs in REQUIREMENTS.md's traceability table (lines 203-212) appear in
at least one plan's `requirements:` frontmatter, confirmed by direct grep of every `03-*-PLAN.md` including
03-13 and 03-14 this round.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX` debt markers in any file touched by 03-13/03-14 (confirmed by direct grep, empty
result). Findings from this round's `03-REVIEW.md` (0 critical / 3 warning / 1 info), independently
re-confirmed by direct source read during this verification:

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/mobile/components/ExerciseImageTile.tsx:74-81` | — | WR-01: `failed` local state has no dependency on `source`; combined with FlashList view recycling, one failed image can permanently break every exercise later recycled into that list slot | ⚠️ Warning | Real, code-confirmed, user-visible under specific conditions (an image load failure followed by scroll-recycling); scoped to the FlashList catalog list only. Not fixed by 03-13 despite a substantial rewrite of this exact file. Carried into human_verification and recommended as a new WINDOWS entry / follow-up fix |
| `apps/mobile/app/exercises/_layout.tsx:34-37` cause; `new.tsx:145`, `edit/[id].tsx:239` consequence | — | WR-02: native header title duplicates the in-body heading on the create and edit screens (the same diff fixed this for `index.tsx` but missed these two) | ⚠️ Warning | Cosmetic (duplicate title text), not a functional blocker |
| `apps/mobile/app/exercises/_layout.tsx:10-15` | — | WR-03: the T-03-58 auth-guard fix (segment layout bringing detail/create/edit under the signed-in guard) has zero automated regression coverage | ⚠️ Warning | Security-relevant claim currently protected only by the file's existence and a code comment; a future edit that restructures the segment could silently reopen the hole with nothing in CI to catch it. Recommend a static route-hoisting assertion test |
| `apps/mobile/app/exercises/[id].tsx:54-71,152-165` | — | IN-01: `loadOwnerAndVariation`'s `ownerId` is now queried but never consumed after G-03-4 removed its sole call site | ℹ️ Info | Dead computation, not a bug; doc comment is now half-stale |

Carried forward, unchanged from the prior round (03-REVIEW.md's earlier pass, none touched by 03-13/03-14):
async write handlers with no try/catch on `new.tsx`/`edit/[id].tsx`/`[id].tsx`; `PrimaryButton`'s `submitting`
prop overloaded for "form invalid"; `isCatalogSnapshot` under-validating; `humanizeMuscleGroupId` misleadingly
named; `readRawColumns`' raw-SQL table-name interpolation (test-harness only); `groupOriginalsByCanonical`
duplicate work; a no-op `onPress` on list rows.

### Human Verification Required

See frontmatter `human_verification` list — 5 items. Two items from the prior round (FlashList scroll
performance, create/edit form rendering) were already walked and passed by a human in 03-UAT.md's test 1 and
test 2 and are not re-listed. The 5 remaining items are: (1) images actually painting post-G-03-3, (2) the
new WR-01 recycling-state risk this round's code review surfaced, (3) back-navigation actually rendering and
working post-G-03-4, (4) the security-relevant auth-guard consequence (highest priority — flag before ship),
and (5) the standing native-platform sweep deferred to Phase 999.1 per project convention.

### Gaps Summary

No must-have truth, artifact, or key link from either 03-13's or 03-14's PLAN frontmatter failed. **Both
G-03-3 and G-03-4 — the two remaining functional gaps from the current UAT round — are verified closed at the
code level**, independently re-confirmed against actual current source (not the SUMMARYs' narrative) and a
freshly re-run test suite (427/427 tests across api-contracts, api and mobile; typecheck clean).

One new, real, code-confirmed defect was found by this round's own code review and independently re-confirmed
here: **WR-01**, a `FlashList` view-recycling state leak in `ExerciseImageTile` that predates 03-13 but
survived a substantial rewrite of that exact file. It is scoped to the catalog list's thumbnails only (the
detail hero and the non-recycled `SwapSuggestionList` are unaffected), requires a real image load failure to
trigger, and is Warning- not Blocker-severity per the code review's own classification and this phase's
established pattern of carrying forward non-blocking warnings. It is not treated as a phase-gating failure,
but it is not silently absorbed either — it is documented explicitly above and carried into
`human_verification` as its own item, with a recommendation to file it as a new WINDOWS entry and schedule a
follow-up fix (reset `failed` in a `useEffect` keyed on the effective source).

The overall status is `human_needed`, not `passed`, because five items genuinely require a human/browser
observation this verification round cannot supply under CLAUDE.md's no-browser-unless-asked rule: whether the
G-03-3 image fix actually paints, whether the new WR-01 recycling risk manifests in practice, whether the
G-03-4 back control actually renders and works (including on a direct URL load), whether the
security-relevant auth-guard consequence (T-03-58) actually holds in a running signed-out session, and the
standing native-platform sweep. None of the five indicate a known logic defect that blocks the phase goal —
all four EXER-* requirement groups touched by this round (EXER-01, EXER-03, EXER-04, EXER-05, EXER-10) are
satisfied at the code level, with the caveats above carried forward honestly rather than claimed as closed.

---

_Verified: 2026-08-19T16:30:00Z_
_Verifier: Claude (gsd-verifier)_
