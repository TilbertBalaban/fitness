---
status: diagnosed
trigger: "I don't see edit form. I don't know how to go back from http://localhost:8081/exercises/seed_90_90_Hamstring . add back-arrow button + support swipes"
created: 2026-08-19T00:00:00Z
updated: 2026-08-19T00:00:00Z
---

## Current Focus

bug_class: Bohrbug (deterministic — reproduces on every load of any seeded exercise detail URL; no timing, no concurrency, no flakiness)

reasoning_checkpoint:
  hypothesis: >
    Two independent, deterministic defects.
    (A) The Edit affordance is intentionally hidden for seeded exercises — resolveDetailActions()
    returns showEdit=false whenever exerciseOwnerId is null, which is true for every seeded row.
    seed_90_90_Hamstring is seeded, so the <Link href="/exercises/edit/[id]"> at [id].tsx:296 is
    never rendered. The Edit ROUTE exists and works; the discoverable path to an editable copy is
    the always-visible "Duplicate" button, but nothing on screen says so.
    (B) No back affordance exists anywhere in the exercises segment because the only Stack that
    wraps those routes (app/_layout.tsx:109) sets screenOptions={{ headerShown: false }} globally,
    there is no app/exercises/_layout.tsx to override it, and no screen renders a custom back
    control. Compounding it: with no _layout.tsx the four exercises routes are hoisted as siblings
    into the ROOT stack, and with no unstable_settings/initialRouteName anchor a direct URL load of
    /exercises/<id> yields a single-entry stack, so react-navigation's own canGoBack is false.
  confirming_evidence:
    - "preferences.ts:140-145 — owned = exerciseOwnerId !== null && exerciseOwnerId === currentUserId; showEdit: owned"
    - "[id].tsx:64 — loadOwnerAndVariation returns { ownerId: null } for any row found in seededExercise"
    - "[id].tsx:295 — the Edit <Link> is wrapped in `actions.showEdit ? ... : null`"
    - "preferences.test.ts:271-275 pins the behavior: 'a seeded exercise (null owner) shows Duplicate and never Edit'"
    - "repo-wide grep over apps/mobile/app + apps/mobile/components for headerShown|headerLeft|router.back|goBack|canGoBack|gestureEnabled returns exactly two hits, both `headerShown: false` (_layout.tsx:109, (auth)/_layout.tsx:7)"
    - "`find apps/mobile/app -type f` — no app/exercises/_layout.tsx exists"
    - "expo-router/build/getRoutes.js:15-16 (own source doc): 'Routes in directories without _layout files are hoisted to the nearest _layout. The name of the route is relative to the nearest _layout.'"
    - "expo-router/build/react-navigation/native-stack/views/NativeStackView.js:61-67 (the WEB variant) — headerBack derives from previousDescriptor; canGoBack = headerBack != null; the file contains no gesture handling at all"
    - "grep for unstable_settings|initialRouteName|anchor across apps/mobile/app returns nothing"
  falsification_test: >
    (A) would be refuted if resolveDetailActions returned showEdit=true for a null owner, or if any
    other on-screen control linked to /exercises/edit/[id]. Neither is the case.
    (B) would be refuted by any headerShown:true, headerLeft, router.back(), or gestureEnabled in
    apps/mobile — the grep returns none.
  fix_rationale: >
    Not applied (diagnosis-only mode). Direction recorded under Resolution.
  blind_spots:
    - "Not observed in a live browser (browser testing not authorized this session) — conclusions are from source + expo-router internals."
    - "Whether the user also tried a CUSTOM (owned) exercise, where Edit does render, was not established."
    - "Whether the browser Back button in fact works on this route was not empirically confirmed; router.push from (tabs)/index.tsx:18 should push a history entry, so it should."
  candidate_causes:
    - "code — Edit link gated behind showEdit, which is false by design for seeded rows (app/exercises/[id].tsx + lib/catalog/preferences.ts)"
    - "config — global headerShown:false on the root Stack + absent app/exercises/_layout.tsx (Expo Router layout configuration, not business logic)"
    - "environment — react-native-web target has no native-stack pan gesture at all; the web NativeStackView has zero gesture code, so 'swipe back' can only ever mean browser history"
    - "data — seeded rows carry owner null by construction (seededExercise is localOnly with no user_id), which is what drives the code branch above"
  and_gate: >
    yes for sub-defect B — it needs BOTH conditions simultaneously: (1) headerShown:false with no
    segment layout to override it, AND (2) a single-entry navigation stack on direct URL load
    (no anchor/initialRouteName). Flipping headerShown alone still renders no back button on a
    fresh load or page refresh, because canGoBack is false. Sub-defect A is single-cause (code).

## Symptoms

expected: From the exercise detail screen (e.g. /exercises/seed_90_90_Hamstring) the user can (a) reach the exercise create/edit form, and (b) navigate back to the catalog list — back-arrow in header plus swipe-back gesture.
actual: (1) no visible entry point to the Edit form from the detail screen, (2) no back-arrow / header back affordance and no swipe-back on the detail route.
errors: none reported
reproduction: Test 4 in .planning/phases/03-exercise-catalog/03-UAT.md — open http://localhost:8081/exercises, tap to /exercises/seed_90_90_Hamstring, attempt Edit and Back.
started: Phase 03 UAT, after G-03-1 (CORS) and G-03-2 (catalog UPSERT) closed and the browser half became reachable for the first time.

## Eliminated

- hypothesis: "The Edit route does not exist / was never built"
  evidence: "apps/mobile/app/exercises/edit/[id].tsx exists (294 lines), fully implemented, with loading / not-found / not-permitted / EditForm branches. 03-VERIFICATION.md:96 records it as VERIFIED."
  timestamp: T1

- hypothesis: "The create form (/exercises/new) is unreachable"
  evidence: "app/exercises/index.tsx:253 renders <PrimaryButton label=\"Add Custom Exercise\" onPress={() => handleAddCustomExercisePress(router)} /> in the FlashList ListHeaderComponent; handleAddCustomExercisePress pushes ADD_CUSTOM_EXERCISE_ROUTE = '/exercises/new' (index.tsx:41-48). The create path is present; only the EDIT path from a seeded detail is absent."
  timestamp: T2

- hypothesis: "duplicateExercise is still the unresolved cross-plan stub referenced by the comment at [id].tsx:12-19"
  evidence: "lib/catalog/custom-exercise.ts:288 exports async duplicateExercise(db, userId, sourceId). The module and symbol both exist; the comment is stale."
  timestamp: T3

- hypothesis: "A back control exists but is broken / mis-wired"
  evidence: "grep -rn 'headerShown|headerLeft|router.back|goBack|canGoBack|gestureEnabled|Stack.Screen|<Stack' over apps/mobile/app + apps/mobile/components returns only app/_layout.tsx:109-116 and app/(auth)/_layout.tsx:7. No back control has ever been written."
  timestamp: T4

## Evidence

- timestamp: T0
  checked: "find apps/mobile/app -type f"
  found: "No app/exercises/_layout.tsx. Routes: exercises/index.tsx, exercises/[id].tsx, exercises/new.tsx, exercises/edit/[id].tsx"
  implication: "The Edit route exists — sub-defect A is about the affordance, not the route. The exercises segment has no segment-level Stack, so header config can only come from the root layout."

- timestamp: T5
  checked: "apps/mobile/app/_layout.tsx:108-118"
  found: "<Stack screenOptions={{ headerShown: false }}> with <Stack.Screen name=\"(tabs)\" /> and <Stack.Screen name=\"exercises\" /> inside <Stack.Protected guard={signedIn}>"
  implication: "headerShown:false applies to EVERY screen in the root stack, including all four hoisted exercises routes. No screen-level override exists anywhere."

- timestamp: T6
  checked: "expo-router@57.0.12 build/getRoutes.js:15-16"
  found: "'Routes in directories without _layout files are hoisted to the nearest _layout. The name of the route is relative to the nearest _layout.'"
  implication: "Root-stack child route names are (tabs), (auth), exercises/index, exercises/[id], exercises/new, exercises/edit/[id], reset-password, __durability. The exercises segment is NOT a single nested navigator."

- timestamp: T7
  checked: "expo-router build/useScreens.js:77 and :117"
  found: "matchIndex = entries.findIndex((child) => child.route === name || child.route === `${name}/index`) — so <Stack.Screen name=\"exercises\" /> matches ONLY exercises/index. Unmatched children are then appended verbatim: ordered.push(...entries...). useSortedScreens filters by protectedScreens.has(route)."
  implication: >
    Two consequences. (1) Any option set on <Stack.Screen name=\"exercises\" /> would configure the
    LIST screen only, never the detail — so that declaration is not a usable place to add the
    header. (2) SECONDARY FINDING, out of scope for this bug: exercises/[id], exercises/new and
    exercises/edit/[id] are never named in any Stack.Protected, so they never enter protectedScreens
    and are mounted regardless of `signedIn`. Only /exercises itself is auth-guarded at the router
    level. Adding app/exercises/_layout.tsx closes this at the same time as the header.

- timestamp: T8
  checked: "apps/mobile/lib/catalog/preferences.ts:135-146 and apps/mobile/app/exercises/[id].tsx:59-71, 185, 284-305"
  found: >
    resolveDetailActions returns { showEdit: exerciseOwnerId !== null && exerciseOwnerId === currentUserId,
    showDuplicate: true, ... }. loadOwnerAndVariation returns ownerId:null for any id found in the
    seededExercise table. The Edit <Link href={{ pathname: '/exercises/edit/[id]' }}> is rendered only
    under `actions.showEdit ? ... : null`; the Duplicate <Pressable> is rendered under
    `actions.showDuplicate ? ...`, which is unconditionally true.
  implication: "For seed_90_90_Hamstring, showEdit is false by construction. The Edit control is hidden intentionally, not missing. The user's available path is the 'Duplicate' button, which router.replace()s to the new owned copy's detail — where Edit then appears."

- timestamp: T9
  checked: "apps/mobile/lib/catalog/__tests__/preferences.test.ts:270-282"
  found: "it('a seeded exercise (null owner) shows Duplicate and never Edit') asserts showEdit===false, showDuplicate===true"
  implication: "The hidden-Edit behavior is a pinned, deliberate contract. This is a UX/discoverability defect, not a logic regression — fixing it means changing the contract or the copy, not repairing broken code."

- timestamp: T10
  checked: "apps/mobile/app/exercises/edit/[id].tsx:188-200 vs. every href in apps/mobile"
  found: "The 'not-permitted' branch renders 'Seeded exercises can't be edited directly. Duplicate it to make your own editable copy.' plus a Duplicate CTA. The ONLY link to /exercises/edit/[id] anywhere in the app is [id].tsx:296, which is gated on showEdit (false for exactly the case this branch handles)."
  implication: "DEAD UI. The not-permitted state is unreachable through in-app navigation — it can only be hit by typing the URL. 03-UAT.md test 2 required exactly this state and was marked 'pass' on 33 unit tests; those tests could not detect that no navigation path reaches it."

- timestamp: T11
  checked: "expo-router build/layouts/StackClient.js:9,17 and build/react-navigation/native-stack/views/NativeStackView.js (web variant, no .native suffix) lines 46-80"
  found: >
    expo-router's Stack is a fork of createNativeStackNavigator. On web, NativeStackView.js derives
    `headerBack` from `previousDescriptor` (the stack entry beneath the current one) and sets
    `canGoBack = headerBack != null`; the header's back control comes solely from that. The file
    contains no gesture code whatsoever — `gestureEnabled` appears only in the native path
    (fork/native-stack/createNativeStackNavigator.js:86-101).
  implication: >
    On react-native-web there is NO pan/swipe-back at all — 'support swipes' on web can only mean
    browser history back (which Expo Router does drive; (tabs)/index.tsx:18 uses router.push).
    On native, the iOS interactive-pop gesture is on by default and headerShown:false does not
    disable it; Android relies on the system back button.

- timestamp: T12
  checked: "grep -rn 'unstable_settings|initialRouteName|anchor' over apps/mobile/app"
  found: "no matches"
  implication: >
    CRITICAL for the fix. With the exercises routes hoisted as root-stack siblings and no anchor /
    initialRouteName declared, loading http://localhost:8081/exercises/seed_90_90_Hamstring directly
    (or refreshing that page) produces a single-entry stack. previousDescriptor is undefined,
    canGoBack is false, and react-navigation renders NO back button even if headerShown were flipped
    to true. This is exactly the URL in the bug report. A header toggle alone does not fix it.

## Resolution

root_cause: >
  Sub-defect A (no Edit form): app/exercises/[id].tsx:295 renders the Edit link only when
  resolveDetailActions().showEdit is true, and lib/catalog/preferences.ts:140-142 defines that as
  `exerciseOwnerId !== null && exerciseOwnerId === currentUserId`. Every seeded exercise resolves to
  ownerId null (app/exercises/[id].tsx:64), so Edit is hidden by design on seed_90_90_Hamstring —
  a contract pinned by lib/catalog/preferences.test.ts:271-275. The only user-facing path to an
  editable copy is the "Duplicate" button, whose label never says so, and the explanatory
  "not-permitted" screen written for exactly this case (edit/[id].tsx:188-200) is unreachable
  because no link ever targets /exercises/edit/[id] for a non-owned exercise. Discoverability
  defect + dead UI, not a logic regression.
  ;
  Sub-defect B (no back navigation): the only Stack wrapping the exercises routes is
  app/_layout.tsx:109, which sets screenOptions={{ headerShown: false }} for every screen. There is
  no app/exercises/_layout.tsx, so per expo-router's own hoisting rule (getRoutes.js:15-16) all four
  exercises routes are siblings in the ROOT stack with no place to override that option, and no
  screen renders a custom back control (repo-wide grep: zero hits for headerLeft/router.back/goBack/
  canGoBack/gestureEnabled). Compounded by an AND-condition: no unstable_settings/initialRouteName
  anchor is declared anywhere, so a direct load of /exercises/<id> yields a single-entry stack where
  react-navigation's own canGoBack is false — flipping headerShown alone would still render a
  back-less header on that exact URL. Separately, "swipe back" cannot be delivered on
  react-native-web at all: expo-router's web NativeStackView contains no gesture code; browser
  history is the only web back gesture.
fix: ""
verification: ""
files_changed: []
