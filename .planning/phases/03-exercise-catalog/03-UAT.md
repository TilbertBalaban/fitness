---
status: diagnosed
phase: 03-exercise-catalog
source: [03-VERIFICATION.md]
started: 2026-08-18T20:50:00Z
updated: "2026-08-19T13:55:00Z"
---

## Current Test

[testing complete]

## Tests

### 1. Scroll the ~870-row exercise list continuously top to bottom on a real device or browser

expected: FlashList renders and scrolls all rows without dropped frames or visible jank.
result: pass
why_human: Performance/frame-drop behavior cannot be observed via typecheck or Jest; only bundler-level proof exists that FlashList is wired — WINDOWS #37. The catalog load itself is no longer the blocker (G-03-2 closed by plan 03-12), so this screen is reachable — only the scroll-performance observation remains outstanding.

### 2. Exercise create/edit form behaviours

expected: Open the Add Custom Exercise form, leave it blank, and confirm all six rendered behaviours match UI-SPEC exactly — placeholder tracking-type text; inline per-field errors on invalid submit; Save disabled (not hidden) until name + load_type are set; multiline cue/instructions auto-grows then scrolls; muscle-mapping chip picker works; opening a seeded exercise's Edit route as a non-owner shows a not-permitted state.
result: pass
why_human: No @testing-library/react-native in this codebase and no simulator/device available; verified instead via 33 unit tests over extracted presentational logic plus typecheck/bundling — WINDOWS #41. Previously blocked behind G-03-2; now structurally reachable but never walked by a human.

### 3. Suggested Alternatives section on the detail screen

expected: Candidate rows render with thumbnail, name, and a plain-language why string; the empty state and Browse Catalog link appear when no candidates qualify; why-strings are never blank.
result: issue
reported: "I don't see thumbnail in \"5 suggested alternatives\""
severity: major
why_human: Never observed in a real browser/device — verified via 20 scorer unit tests + 7 direct-invocation component tests + typecheck/bundling only — WINDOWS #46. Previously blocked behind G-03-2; now structurally reachable, not yet walked by a human.

### 4. Full native (iOS/Android) and browser pass over every catalog screen

expected: List, detail, create/edit forms, archive dialog and swap suggestions behave as the web/unit-verified logic, rendered correctly on native chrome. Also re-run the offline first-boot flow: cold-boot the app offline, open /exercises, then open one exercise — populated content with real images painting on screen, entirely offline, no blank screen, no broken-image icon, no network request fired.
result: issue
reported: "I don't see edit form. I don't know how to go back from http://localhost:8081/exercises/seed_90_90_Hamstring . add back-arrow button + support swipes"
severity: major
why_human: No Xcode or Android SDK on this machine. Consistent with every prior phase's native gap; per project convention this is swept once at ROADMAP Phase 999.1 rather than per-phase. The browser half is now unblocked by both G-03-1 (CORS/sign-up) and G-03-2 (catalog load) closures — only the native-device half is still environment-blocked.

## Summary

total: 4
passed: 2
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-03-1
  truth: "The web client can create an account and reach the catalog — credentialed cross-origin requests from http://localhost:8081 to the API succeed."
  status: fixed
  reason: "Closed by plan 03-11. apps/api/src/main.ts now calls app.enableCors({ origin: resolveWebOrigins(), credentials: true }) as the first line of bootstrap(), ahead of minClientVersionMiddleware and the Better Auth mount. apps/api/src/common/web-origins.ts is the sole reader of WEB_ORIGINS and feeds both the CORS allowlist and Better Auth's trustedOrigins, so they cannot drift. Proven by apps/api/test/cors.e2e-spec.ts, green in the full api e2e suite (18 suites / 135 tests) at the 03-12 regression gate — WINDOWS #48, fixed."
  severity: blocker
  test: 4
  root_cause: "apps/api/src/main.ts never called app.enableCors(). Better Auth does not emit CORS headers itself; trustedOrigins only drives its origin/CSRF check and redirect allowlist."
  debug_session: ""

- gap_id: G-03-2
  truth: "Opening http://localhost:8081/exercises renders the exercise catalog list (~870 rows) and scrolls smoothly."
  status: fixed
  reason: "Closed by plan 03-12. applyCatalogSnapshot was rebuilt for all four catalog tables on read-existing-ids-then-branch (plain INSERT when new, condition-scoped UPDATE ... WHERE id = ? when existing) — no upsert clause remains anywhere in the production write path. Proven on a real @powersync/web engine in a real browser by apps/mobile/e2e/catalog-load.spec.ts, which observed the original `Error: cannot UPSERT a view` before the fix and, after it, 19 muscle groups / 870 exercises / 3134 mappings / 1 catalog_meta row with a zero-length upload queue, unchanged on re-apply. refreshCatalog's never-throws contract is now real (whole body wrapped, new 'write-failed' outcome) and app/exercises/index.tsx logs the caught error instead of discarding it. The Jest fakes now reject upsert grammar with the engine's own message, so reintroducing it turns the suite red in seconds. Closes WINDOWS #33 — the real-engine gap that let 282/282 mobile tests pass against this defect."
  severity: blocker
  test: 1
  root_cause: "applyCatalogSnapshot wrote every catalog row with Drizzle's .onConflictDoUpdate(), which compiles to a SQLite UPSERT. Every PowerSync-managed table — localOnly included — is a SQLite VIEW over ps_data__* / ps_data_local__* with INSTEAD OF triggers, and SQLite refuses to prepare an UPSERT against a view. The first site (muscle_group) threw at statement 1 of ~4066 inside the transaction; the rollback left catalog_meta unstamped, so currentVersion stayed null and every reload re-entered the same doomed path."
  debug_session: ".planning/debug/exercise-catalog-load-failure.md"

- gap_id: G-03-3
  truth: "Suggested Alternatives candidate rows render with a thumbnail, name, and plain-language why string."
  status: failed
  reason: "User reported: I don't see thumbnail in \"5 suggested alternatives\""
  severity: major
  test: 3
  root_cause: "Not a SwapSuggestionList defect. The fault is in the shared ExerciseImageTile: its container gets height only from style={{aspectRatio: 4/3}} on a percentage-width (className=\"w-full\") box, and the <Image> inside asks for width:100%/height:100% of it. On react-native-web an <Image> paints via a position:absolute; inset:0; z-index:-1 background-image layer, so a collapsed box paints nothing — silently: the asset resolves (showImage true, so the \"No image available\" fallback never renders), onError never fires, and RNW's real <img> is opacity:0 so no broken-image icon appears. The tile's bg-surface matches the row's own bg-surface, making the empty tile indistinguishable from the row background. All three call sites are equally affected — this is the first human observation of any image in the app, not a regression (03-07-SUMMARY D5 and 03-10-SUMMARY line 99 both carry verification: [] — WINDOWS #37)."
  artifacts:
    - path: "apps/mobile/components/ExerciseImageTile.tsx"
      issue: "The defect. No pixel dimension anywhere; <Image> sized only by width/height 100% of an aspectRatio-derived box. showImage = !!source && !failed means a resolvable-but-unpainted image never degrades to the placeholder."
    - path: "apps/mobile/components/SwapSuggestionList.tsx"
      issue: "Reporting surface only (line 58) — do NOT patch here."
    - path: "apps/mobile/components/ExerciseListRow.tsx"
      issue: "Second call site (line 40), equally blank."
    - path: "apps/mobile/app/exercises/[id].tsx"
      issue: "Third call site, the detail hero (line 309), equally blank."
    - path: "apps/mobile/components/__tests__/SwapSuggestionList.test.tsx"
      issue: "Blind spot: text-only assertions, zero image coverage — why 20+7 green tests, typecheck and a clean bundle all passed over this."
  missing:
    - "Give the tile a box that cannot collapse — explicit pixel width/height via a size prop, or keep aspectRatio on the container and fill it with StyleSheet.absoluteFill instead of percentage height."
    - "Fix must cover all three call sites (SwapSuggestionList, ExerciseListRow, exercises/[id] hero), not just the alternatives row."
    - "Stop the silent failure: render the placeholder behind the image rather than instead of it, so 'source resolved but nothing painted' still shows something."
    - "Stop the colour collision: the tile must not use the same bg-surface as the row it sits in."
    - "Add a test asserting an <Image> is produced with a non-null source for a known seeded id."
    - "Latent, not causal, worth fixing in-file: getLocalCatalogImage is typed number | null but returns {uri,width,height} on web; onError={() => setFailed(true)} is a fresh closure each render inside RNW's Image effect deps."
  residual_uncertainty: "One browser check would settle the CSS mechanism — inspect the computed height of the RNW Image root div carrying inline width:100%;height:100%. Non-zero height with a background-image URL would falsify the sizing hypothesis and point to the ranked-second cause (dev-server asset URL 404 -> onError -> visible 'No image available' text). NOT run: browser testing was not authorized this session."
  debug_session: ".planning/debug/alternatives-thumbnail-missing.md"

- gap_id: G-03-4
  truth: "From an exercise detail route the user can reach the Edit form and navigate back to the catalog list."
  status: failed
  reason: "User reported: I don't see edit form. I don't know how to go back from http://localhost:8081/exercises/seed_90_90_Hamstring . add back-arrow button + support swipes"
  severity: major
  test: 4
  root_cause: "Two independent deterministic defects, neither a logic regression. (A) No Edit: the Edit link exists at app/exercises/[id].tsx:296 but renders only under actions.showEdit, which lib/catalog/preferences.ts:140-142 defines as owned === true. Every seeded exercise resolves to ownerId: null, so Edit is hidden BY DESIGN — pinned by preferences.test.ts:271-275. The intended path is the always-visible Duplicate button, which router.replaces to an owned copy, but nothing on screen communicates that. Worse, the not-permitted screen written for exactly this case (edit/[id].tsx:188-200) is dead UI: the only href to /exercises/edit/[id] is itself gated behind showEdit, so a non-owner can only reach it by typing the URL. UAT test 2 required that state and passed on 33 unit tests that structurally could not detect its unreachability. (B) No back: app/_layout.tsx:109 sets <Stack screenOptions={{headerShown: false}}> and there is no app/exercises/_layout.tsx, so per expo-router hoisting all four exercises routes are siblings in the root stack with no override point; a repo-wide grep for headerShown|headerLeft|router.back|goBack|canGoBack|gestureEnabled returns exactly two hits, both headerShown: false. No back control was ever written. Compounding it, no unstable_settings/initialRouteName anchor exists, so loading the reported URL directly (or refreshing) yields a single-entry stack -> canGoBack === false, meaning flipping headerShown: true alone would render a back-LESS header."
  artifacts:
    - path: "apps/mobile/app/_layout.tsx"
      issue: "Line 109 global headerShown: false. <Stack.Screen name=\"exercises\" /> at line 112 only matches exercises/index (useScreens.js:77 matches name === route || name+'/index' === route), leaving the other three routes both unconfigured and unguarded."
    - path: "apps/mobile/app/exercises/_layout.tsx"
      issue: "MISSING. This single absence causes the hoisting, the header gap, and the auth-guard gap at once."
    - path: "apps/mobile/app/exercises/[id].tsx"
      issue: "Lines 284-305: no back control; Edit gated on showEdit; the Duplicate label does not convey that it is the route to editability."
    - path: "apps/mobile/lib/catalog/preferences.ts"
      issue: "resolveDetailActions at lines 135-146 — source of showEdit: false for seeded exercises."
    - path: "apps/mobile/lib/catalog/__tests__/preferences.test.ts"
      issue: "Lines 270-282 pin the hidden-Edit-for-seeded contract; must be updated if that contract changes."
    - path: "apps/mobile/app/exercises/edit/[id].tsx"
      issue: "Lines 188-200: unreachable not-permitted branch (dead UI)."
  missing:
    - "Add apps/mobile/app/exercises/_layout.tsx with its own <Stack> — one file fixes the header, makes <Stack.Screen name=\"exercises\" /> cover the whole segment, and gives a place for per-screen title/headerBackTitle."
    - "Supply an explicit headerLeft (or in-screen control) using router.canGoBack() ? router.back() : router.replace('/exercises') so a direct URL load or refresh still has a way back. Same treatment on new and edit/[id]. Do NOT rely on headerShown: true alone."
    - "Native swipe: set gestureEnabled: true (consider fullScreenGestureEnabled) on the segment."
    - "Web swipe is NOT achievable: expo-router's web NativeStackView contains zero gesture code (gestureEnabled exists only in the native fork). Browser history is the only web back gesture, and Expo Router does drive it. Restate the UAT criterion rather than promising a web pan gesture."
    - "Edit discoverability — pick one and update preferences.test.ts + 03-UI-SPEC.md accordingly: (a) always render an Edit control routing to /exercises/edit/[id] and let the existing not-permitted screen explain, which resurrects already-written already-tested UI and satisfies UAT test 2 by navigation; or (b) keep it hidden and relabel/annotate Duplicate as the path to an editable copy. Option (a) is the smaller change."
  secondary_finding: "OUT OF SCOPE for this gap, worth a WINDOWS entry: because <Stack.Screen name=\"exercises\" /> only matches exercises/index, and useScreens.js:117 does ordered.push(...entries), the routes exercises/[id], exercises/new and exercises/edit/[id] never enter protectedScreens — they mount regardless of signedIn. Only /exercises is auth-guarded at the router level."
  debug_session: ".planning/debug/detail-screen-no-back-nav-no-edit.md"
