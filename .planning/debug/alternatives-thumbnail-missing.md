---
status: resolved
trigger: "alternatives-thumbnail-missing — The \"Suggested Alternatives\" section on the exercise detail screen renders candidate rows without a thumbnail image."
created: 2026-08-19T00:00:00Z
updated: 2026-08-31
---

## Current Focus

bug_class: Bohrbug (deterministic — every render of every candidate row, no timing/concurrency component)

reasoning_checkpoint:
  hypothesis: "The missing thumbnail is not a SwapSuggestionList defect. SwapSuggestionList's thumbnail subtree is byte-identical to ExerciseListRow's and resolves its image with the identical call (getLocalCatalogImage(id)), so the alternatives thumbnail cannot fail while the list thumbnail succeeds. The defect is in the single shared render path — ExerciseImageTile — whose box has no pixel dimension anywhere: the container's height exists only via aspectRatio on a percentage-width box, and the <Image> asks for height:'100%' of that. On react-native-web the Image paints via a position:absolute inset:0 background-image layer inside that box, so a box with no resolved height paints nothing, silently."
  confirming_evidence:
    - "SwapSuggestionList.tsx:57-59 and ExerciseListRow.tsx:39-41 are the same three lines: <View style={{width:56}}><ExerciseImageTile localSource={getLocalCatalogImage(id)} /></View>."
    - "app/exercises/index.tsx:238 passes localSource={getLocalCatalogImage(item.id)} — the identical call the swap row makes. localSource takes precedence over uri inside ExerciseImageTile, so the list row's remote-uri fallback is never reached for a seeded exercise."
    - "Re-ran the real scorer logic over the real catalog snapshot for seed_90_90_Hamstring: the 5 winning candidates are seed_Knee_Tuck_Jump, seed_Natural_Glute_Ham_Raise, seed_Front_Leg_Raises, seed_Inchworm, seed_Alternating_Hang_Clean — all 5 present in catalog-image-map.generated.ts. So getLocalCatalogImage returns a real asset for every visible row."
    - "03-07-SUMMARY.md D5 — 'A vendored image actually paints on screen in a real browser, simulator, or device' — verification: [], human_judgment: true, WINDOWS #37. 03-10-SUMMARY.md line 99 says the same for the suggestion list. No image in this app has EVER been observed to paint."
    - "ExerciseImageTile computes showImage = !!source && !failed. source is non-null (asset resolves), nothing errored, so the 'No image available' fallback Text never renders and no onError fires — the failure is silent by construction."
    - "The tile's container uses bg-surface, and the alternatives row Pressable ALSO uses bg-surface — an empty tile is the exact same colour as the row it sits on, so it is literally invisible."
  falsification_test: "Open the exercise list at /exercises with devtools and inspect any row's thumbnail div. If the list thumbnails DO paint a photo while the alternatives ones do not, this hypothesis is wrong and the fault is something outside the shared path. Equivalently: measure the computed height of the RNW Image root div (the one carrying inline width:100%;height:100%) — non-zero height with a background-image URL falsifies the sizing hypothesis."
  fix_rationale: "Any fix must land in ExerciseImageTile (and/or its call sites' wrappers), not SwapSuggestionList — patching SwapSuggestionList would leave the list rows and the detail hero equally broken. Giving the tile a real, resolved box (explicit pixel height, or an absolutely-positioned image that fills whatever box aspectRatio produces) addresses the mechanism rather than the symptom."
  blind_spots:
    - "Could not observe the browser (explicitly out of scope for this session), so the precise CSS mechanism — percentage height failing to resolve against an aspectRatio-derived height inside a column flex container — is inferred from the code, the emitted DOM/CSS and the elimination of every other candidate, not directly measured."
    - "Did not observe whether the exercise-list thumbnails and the detail hero image are equally blank. The code proves they must be, but that has not been seen."
    - "The dev-server asset URL (/assets/?unstable_path=...%2Fseed_X/0.jpg) was reasoned to be correct from @expo/metro-config's asset-transformer but never actually requested — no dev server was running."
  candidate_causes:
    - "code: ExerciseImageTile sizes its <Image> only by percentages of an aspectRatio-derived box; nothing in the chain has a pixel height (category: code)"
    - "config: tailwind content globs / NativeWind wiring failing to emit w-full, items-center, bg-surface (category: config) — ELIMINATED, all classes verified present in the built CSS"
    - "data: image map keys not matching the runtime exercise ids, or missing/corrupt vendored files (category: data) — ELIMINATED, 870/870 keys ≡ snapshot ids, 1740/1740 files exist and are valid progressive JPEGs"
    - "environment: Metro dev-server asset URL 404s so the image errors (category: environment) — NOT ELIMINATED but ranked below, because a 404 fires onError -> setFailed(true) -> the visible 'No image available' text, which the user did not report"
  and_gate: "no — a single condition (the tile's box producing no painted pixels) is sufficient to produce the exact observed symptom, including its silence. The bg-surface-on-bg-surface colour collision is an aggravating factor that hides the failure, not a second necessary cause; on the detail hero the same defect is visible as a faint empty box because bg-surface sits on bg-background there."

next_action: "Hand to gap-closure plan G-03-3. Do NOT patch SwapSuggestionList."

## Symptoms

expected: On the exercise detail screen (e.g. /exercises/seed_90_90_Hamstring), the "Suggested Alternatives" section renders each candidate row with a thumbnail image, the exercise name, and a plain-language "why" string. UI-SPEC for Phase 03 specifies the thumbnail as part of the candidate row.
actual: User reported verbatim: "I don't see thumbnail in \"5 suggested alternatives\"". The section renders and lists 5 alternatives, but no thumbnail image appears on the rows.
errors: None reported by the user.
reproduction: Test 3 in .planning/phases/03-exercise-catalog/03-UAT.md. Open web app at http://localhost:8081/exercises, open /exercises/seed_90_90_Hamstring, scroll to "Suggested Alternatives".
started: Discovered during UAT of Phase 03 after G-03-1 (CORS) and G-03-2 (catalog UPSERT) were closed. Never previously observed by a human — verified only via 20 scorer unit tests + 7 direct-invocation component tests + typecheck/bundling (WINDOWS #46).

## Eliminated

- hypothesis: "The thumbnail markup was added after the user's UAT run — they ran a build without it."
  evidence: "git log --follow on apps/mobile/components/SwapSuggestionList.tsx shows one commit only: 87bfc32, 2026-08-18T23:21:48+0300. git show 87bfc32:.../SwapSuggestionList.tsx already contains ExerciseImageTile + getLocalCatalogImage + <View style={{width:56}}>. UAT ran 2026-08-19T13:15Z, ~14h later."
  timestamp: 2026-08-19

- hypothesis: "getLocalCatalogImage(candidate.id) returns null for the candidates because the runtime exercise ids do not match the generated map's keys, or because entries are missing."
  evidence: "Parsed catalog-image-map.generated.ts: 870 keys, 1740 require() paths, 0 missing files on disk. Set-compared map keys against catalog-snapshot.json exercise ids: 0 snapshot ids missing from the map, 0 map keys missing from the snapshot. Additionally re-ran the scorer's arithmetic over the real snapshot for target seed_90_90_Hamstring: all 5 winning candidate ids are present in the map."
  timestamp: 2026-08-19

- hypothesis: "The vendored images are corrupt / are HTML error pages or LFS pointers rather than real JPEGs."
  evidence: "file(1) on seed_90_90_Hamstring/0.jpg and seed_Knee_Tuck_Jump/0.jpg: 'JPEG image data, JFIF standard 1.01, ... progressive, precision 8, 850x567, components 3'. Real images."
  timestamp: 2026-08-19

- hypothesis: "The images are not bundled — Metro never resolved the requires for web."
  evidence: "apps/mobile/dist (web export) contains exactly 1740 .jpg files; dist/assets/assets/catalog/images/seed_90_90_Hamstring/0.9c347affdacbe057f6c5baca7052dac5.jpg exists, and the bundle contains the matching asset module module.exports={uri:'/assets/assets/catalog/images/seed_90_90_Hamstring/0.9c34....jpg',width:850,height:567,toString(){...}}. 03-07-SUMMARY D4 independently confirms find dist -iname '*.jpg' | wc -l -> 1740."
  timestamp: 2026-08-19

- hypothesis: "On web, require() returns an object rather than a Metro numeric asset id, so ExerciseImageTile's `localSource != null` branch feeds react-native-web's <Image> something it cannot resolve."
  evidence: "@expo/metro-config asset-transformer.js emits `module.exports = {uri, width, height, toString(){return this.uri}}` for platform === 'web' (both dev and export). react-native-web's Image resolveAssetUri has an explicit `else if (source && typeof source.uri === 'string') { uri = source.uri }` branch, so the object resolves correctly. The `localSource?: number | null` type annotation is a lie on web, but harmless at runtime."
  timestamp: 2026-08-19

- hypothesis: "The Tailwind/NativeWind classes the tile depends on (w-full, items-center, bg-surface, flex-row) are not emitted, so the tile has no width."
  evidence: "Extracted from the built stylesheet dist/_expo/static/css/web-*.css: .w-full{width:100%} .flex-row{flex-direction:row} .items-center{align-items:center} .justify-center{justify-content:center} .gap-sm{gap:8px} .rounded-md{border-radius:.375rem} .bg-surface{...} .px-md{...} .py-sm{...} — all present. dist/index.html shows <style id=\"react-native-stylesheet\"> in <head> BEFORE the <link> to the Tailwind sheet, so Tailwind classes win cascade ties against react-native-web's View base class. The bundle also contains react-native-css-interop's cssInterop registrations and $$css usage, confirming className reaches the DOM."
  timestamp: 2026-08-19

- hypothesis: "The <Link asChild> wrapper (unique to the swap row vs the list row) breaks the row's layout — e.g. RNW renders it as an <a> that changes display, or Radix's Slot drops the child's style/className."
  evidence: "Radix Slot's mergeProps merges style object-wise and joins className, child wins on conflicts; expo-router's useInteropClassName returns rest.style (undefined here). Separately, grep for 'href' in react-native-web's View, forwardedProps and createDOMProps returns 0 matches — RNW's View never forwards href and never becomes an <a>. The row is a plain <div> with onClick; layout is unaffected."
  timestamp: 2026-08-19

- hypothesis: "react-native-web drops aspectRatio, so the tile has no height."
  evidence: "react-native-web/dist/exports/StyleSheet/preprocess.js:165 — `if (prop === 'aspectRatio' && typeof _value === 'number') nextStyle[prop] = _value.toString()`. A react-dom/server SSR probe of the exact tile subtree emits `<div class=\"css-view-g5y9jx w-full items-center justify-center rounded-md bg-surface\" style=\"aspect-ratio:1.3333333333333333\">` — inline, therefore highest priority."
  timestamp: 2026-08-19

- hypothesis: "ExerciseImageTile's unstable onError closure (`onError={() => setFailed(true)}`) sits in RNW Image's load-effect dependency array and causes an abort/reload loop that never completes, pinning the image in a non-displaying state."
  evidence: "The closure is created in ExerciseImageTile's render, not in RNW Image's. RNW Image's internal updateState re-renders only the Image, leaving props.onError referentially stable, so the effect does not re-run on its own state transitions. Also RNW's shouldDisplaySource is true for BOTH LOADING and LOADED when defaultSource == null, so even a perpetually-restarting load would still paint. This is a latent fragility worth fixing, not the cause."
  timestamp: 2026-08-19

- hypothesis: "The <Image>'s background layer (styles.image, z-index:-1) paints behind the tile's opaque bg-surface."
  evidence: "react-native-web's View base class .css-view-g5y9jx sets position:relative AND z-index:0, which makes every RNW View a stacking context. The z-index:-1 background layer is therefore contained within the Image root's own stacking context and paints above the tile's background."
  timestamp: 2026-08-19

## Evidence

- timestamp: 2026-08-19
  checked: ".planning/debug/ for a knowledge base"
  found: "No knowledge-base.md and no resolved/ directory exist; only exercise-catalog-load-failure.md. Phase 0 semantic recall produced no prior-pattern candidate."
  implication: "No known-pattern shortcut; full investigation required."

- timestamp: 2026-08-19
  checked: "apps/mobile/components/SwapSuggestionList.tsx:57-59"
  found: "The thumbnail IS rendered: <View style={{ width: 56 }}><ExerciseImageTile localSource={getLocalCatalogImage(candidate.id)} /></View>."
  implication: "The element is not simply absent from the JSX. Either the resolved image is null/failed, or the rendered box paints nothing."

- timestamp: 2026-08-19
  checked: "apps/mobile/components/ExerciseListRow.tsx:39-41 and apps/mobile/app/exercises/index.tsx:238, vs SwapSuggestionList.tsx:57-59"
  found: "Identical subtree — same 56px wrapper, same ExerciseImageTile, same getLocalCatalogImage(id) call. The list row additionally passes uri, but localSource takes precedence inside ExerciseImageTile whenever it is non-null, which it always is for a seeded exercise."
  implication: "DECISIVE: the alternatives thumbnail cannot be broken while the list thumbnail works. Whatever the user sees in the alternatives section, they see in the list rows and in the detail hero (app/exercises/[id].tsx:309) too. The gap is in the shared path, not in SwapSuggestionList."

- timestamp: 2026-08-19
  checked: "apps/mobile/components/ExerciseImageTile.tsx (whole file)"
  found: "No pixel dimension anywhere. Container: className='w-full items-center justify-center rounded-md bg-surface' + style={{aspectRatio: 4/3}}. Image: style={{width:'100%', height:'100%', borderRadius:6}}. showImage = !!source && !failed."
  implication: "Every dimension in the chain is a percentage or a ratio. The whole visual depends on `height:'100%'` resolving against a height that itself only exists via aspectRatio. And because source is non-null, showImage is true, so the 'No image available' fallback can never render for this failure mode."

- timestamp: 2026-08-19
  checked: "react-native-web/dist/exports/Image/index.js render body + styles"
  found: "RNW's <Image> renders a View whose only visible content is a sibling div with {...StyleSheet.absoluteFillObject, backgroundImage, backgroundSize:'cover', height:'100%', width:'100%', zIndex:-1}, plus an opacity:0 <img> used only for the browser context menu. The <Image> element paints nothing itself."
  implication: "If the Image root box has no resolved height, absolutely nothing is painted — no image, no broken-image icon (the real <img> is invisible), and no onError (nothing failed to load). A silent, total blank. This matches the user's report exactly, including 'errors: none'."

- timestamp: 2026-08-19
  checked: "react-dom/server SSR probe of the exact swap-row subtree against the project's real react-native-web 0.21.2"
  found: "Emitted DOM: <div style='width:56px'><div class='...w-full items-center justify-center...' style='aspect-ratio:1.3333333333333333'><div class='css-view-g5y9jx r-flexBasis... r-overflow-1udh08x' style='width:100%;height:100%;border-*-radius:6px'><div class='...absolute inset 0, z-index:-1, background-size:cover'></div></div></div></div>"
  implication: "The intended structure is emitted correctly. Confirms the render depends entirely on a percentage height cascading through an aspectRatio-only box, with the paint surface being an absolutely-positioned layer inside it."

- timestamp: 2026-08-19
  checked: "apps/mobile/components/__tests__/SwapSuggestionList.test.tsx (all 7 tests) and app/exercises/__tests__/exercise-detail-screen.test.ts"
  found: "Every assertion is text-only (flatText / numberOfLines). The one image-adjacent test ('a candidate with no local image still renders its name and why string via the ExerciseImageTile fallback') asserts only that the NAME and WHY strings survive. The detail-screen test asserts only that the source string contains 'ExerciseImageTile'."
  implication: "Zero coverage of the image element itself — no test asserts an <Image> is produced, that its source is non-null, or that the tile has a non-zero box. This is precisely why 20+7 green tests plus typecheck and a successful bundle could not catch it."

- timestamp: 2026-08-19
  checked: ".planning/phases/03-exercise-catalog/03-07-SUMMARY.md D5 and 03-10-SUMMARY.md line 99"
  found: "D5: 'A vendored image actually paints on screen in a real browser, simulator, or device' — verification: [], human_judgment: true, rationale 'Not observed in this session', recorded as WINDOWS #37. 03-10 line 99: 'The suggestion list actually paints correctly (thumbnail, name, why, empty state) in a real browser, simulator, or device' — same status."
  implication: "The project's own records confirm NO image in this app has ever been observed to paint. The user's report is the first human observation of the shared image render path, not a regression localized to the alternatives section."

- timestamp: 2026-08-19
  checked: "UI-SPEC 03 element E6 'populated' row"
  found: "'Each row shows the candidate exercise name plus a one-line, plain-language why string' — the thumbnail is never named in the populated row; it appears only in the 'partial' row ('A candidate missing a thumbnail still renders with name + why string')."
  implication: "The spec's derived must_haves never required a thumbnail to actually paint, only that a missing one degrades gracefully. That is a second reason no gate covered this."

## Resolution

root_cause: "The Suggested Alternatives thumbnail is not a SwapSuggestionList defect — SwapSuggestionList's thumbnail subtree and image resolution are identical to ExerciseListRow's and to the detail hero's, so the fault lies in the single shared render path, apps/mobile/components/ExerciseImageTile.tsx. That component gives its image no resolvable box: the container's height exists only through style={{aspectRatio: 4/3}} on a percentage-width box (className 'w-full'), and the <Image> requests style={{width:'100%', height:'100%'}} of that container. On react-native-web an <Image> paints nothing itself — its pixels come from a position:absolute; inset:0; z-index:-1 background-image layer inside that box — so when the box yields no height nothing is painted at all. The failure is completely silent by construction: the asset resolves (so showImage is true and the 'No image available' fallback never renders), nothing errors (so onError never fires and `failed` stays false), and RNW's real <img> is opacity:0 (so there is no broken-image icon). In the alternatives row the tile's bg-surface is the same colour as the row Pressable's own bg-surface, so the empty tile is literally indistinguishable from the row background — which is exactly the reported 'I don't see thumbnail', with no console errors. Confirming context: 03-07-SUMMARY D5 and 03-10-SUMMARY line 99 both record 'a vendored image actually paints on screen' as never observed (WINDOWS #37), and no test in the phase asserts anything about the image element."
fix: ""
verification: ""
files_changed: []

## Resolution (2026-08-31)

Fixed in `components/ExerciseImageTile.tsx` (G-03-3). The tile no longer sizes itself
from a ratio on a percentage-width box: `resolveTileBox()` derives a finite pixel
{width, height} clamped to `MIN_TILE_WIDTH`, and `resolveTileImageStyle()` sets an
explicit width/height so it wins over react-native-web's intrinsic asset dimensions.
`EXERCISE_THUMBNAIL_WIDTH` is now shared by `ExerciseListRow` and `SwapSuggestionList`
so the two call sites cannot drift apart again.

Closed during the v1.0 milestone-close artifact audit: the fix was verified present in
the working tree, but the session file had never been flipped out of `diagnosed`.
