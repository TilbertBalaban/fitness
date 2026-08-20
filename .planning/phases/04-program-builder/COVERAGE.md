# API Coverage — Phase 4: Program Builder

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

**Detector result at plan time:** `api-coverage.cjs --json` returned `{"detected": false}` — it ran
over the ROADMAP section before any PLAN.md existed. That result is not the whole story. The finished
plan bodies carry SDK-integration language (`react-native-tab-view`, `react-native-gesture-handler`,
`react-native-reanimated`, and the PowerSync push/pull surface), and the seal-time re-run at
`verify:pre` reads those bodies. This matrix is written now, following the Phase 2 precedent, so the
decision is a reasoned record rather than a seal-time block.

**Scope of this matrix.** Phase 4 integrates no *remote* third-party API. It integrates three
client-side libraries and extends this project's own PowerSync surface. The only HTTP endpoints it
touches (`POST /v1/sync/push`, the PowerSync Service stream) are first-party and already covered by
Phase 2's matrix; the rows below cover only what Phase 4 newly decides.

---

## Surface A — `react-native-tab-view` 4.3.2 (D-21, the swipeable day deck)

Capability surface = the props/exports the library publishes.

| capability | decision | reason |
|---|---|---|
| `TabView` | INTEGRATE | |
| `navigationState` / `onIndexChange` (controlled page index) | INTEGRATE | the cycle strip and the deck must stay in sync without losing the day position (D-22) |
| `renderScene` | INTEGRATE | |
| `SceneMap` | OPT-OUT | `SceneMap` remounts scenes on data change; the day deck renders live rows from one loaded tree, so a plain `renderScene` closure is correct here |
| `renderTabBar` | INTEGRATE | used only to render `null` — the cycle strip (D-22) is a separate pinned component, not this library's tab bar |
| `TabBar` component | OPT-OUT | the cycle strip is bespoke; adopting `TabBar` would give the deck a second, competing header |
| `lazy` / `renderLazyPlaceholder` | OPT-OUT | a program has 3–6 days already loaded in one tree; lazy mounting buys nothing and costs a placeholder state |
| `swipeEnabled` | INTEGRATE | must be assertable as `true` — the swipe is the whole point of D-21 |
| `keyboardDismissMode` | INTEGRATE | targets are entered inline (D-25); a swipe while the keypad is open must dismiss it |
| `pagerStyle` / `style` / `sceneContainerStyle` | INTEGRATE | needed to let a day page fill the remaining height under the cycle strip |
| `initialLayout` | INTEGRATE | avoids the first-frame zero-width measure on web |
| `animationEnabled` | OPT-OUT | default is correct; no requirement asks to disable the page animation |
| `commonOptions` / per-route options | OPT-OUT | tab-bar-only options; the tab bar is not rendered |

## Surface B — `react-native-gesture-handler` 3.2.1 (D-23, the always-visible drag handle)

| capability | decision | reason |
|---|---|---|
| `GestureHandlerRootView` | INTEGRATE | required root wrapper; without it no gesture fires |
| `Gesture.Pan()` | INTEGRATE | the drag handle's follow-finger gesture |
| `Gesture.Pan().activateAfterLongPress` | OPT-OUT | D-23 chose an *always-visible* handle — a long-press activation would hide the affordance the user asked for |
| `GestureDetector` | INTEGRATE | |
| `Gesture.Tap` / `Gesture.LongPress` / `Gesture.Fling` / `Gesture.Pinch` / `Gesture.Rotation` | OPT-OUT | no requirement in PROG-01..11 needs them; `Pressable` already covers taps |
| `Gesture.Race` / `Simultaneous` / `Exclusive` composition | INTEGRATE | the pan on the handle must not fight the deck's horizontal swipe — composition is how that is expressed |
| `gestureHandlerRootHOC` | OPT-OUT | legacy API superseded by `GestureHandlerRootView` |
| RNGH's own `Swipeable` / `DrawerLayout` / `ScrollView` / `FlatList` re-exports | OPT-OUT | the app already uses `@shopify/flash-list` and RN's own scrollables; swapping them wholesale is out of scope and would touch Phase 3 surfaces |

## Surface C — `react-native-reanimated` 4.5.3 (D-23, the reorder animation)

| capability | decision | reason |
|---|---|---|
| `useSharedValue` | INTEGRATE | |
| `useAnimatedStyle` | INTEGRATE | |
| `Animated.View` | INTEGRATE | |
| `runOnJS` | INTEGRATE | the commit-the-new-order callback runs on the JS thread |
| `withSpring` / `withTiming` | INTEGRATE | the drop-into-place transition |
| Babel/worklets plugin configuration | INTEGRATE | mandatory build-time wiring; `expo export --platform web` is the gate |
| `useAnimatedScrollHandler` | OPT-OUT | auto-scroll while dragging past the viewport edge is deferred — the day list is short (a day is 4–8 exercises) and no requirement asks for it |
| Layout animations / `Layout` / `entering` / `exiting` | OPT-OUT | the reorder animation is driven explicitly by the pan; implicit layout animations would double-animate |
| Shared element transitions | OPT-OUT | no cross-screen transition in this phase |
| Worklet-driven gesture on the *web* target's pointer events | INTEGRATE (conditional) | if the 04-05 spike shows a real web gap, the `.web.tsx` split (`docs/platform-modules.md`) is the answer and this row is re-decided in that plan's SUMMARY — never "drop the feature" |

## Surface D — PowerSync push/pull, tables newly covered by this phase

Extends Phase 2's matrix row "Push-side apply path — 9 of 12 `SYNCED_TABLES` (OPT-OUT, phased)".

| capability | decision | reason |
|---|---|---|
| `routine` push apply | INTEGRATE | 04-01 |
| `routine_day` push apply | INTEGRATE | 04-02 |
| `routine_exercise` push apply | INTEGRATE | 04-02 |
| `user_preference` push apply | INTEGRATE | 04-04 — moved forward from Phase 6 because PROG-08's active pointer needs it now (RESEARCH Pitfall 2) |
| `routine_cycle` push apply + pull query | INTEGRATE | 04-06 (new table) |
| `routine_exercise_cycle_target` push apply + pull query | INTEGRATE | 04-07 (new table) |
| `equipment_profile` push apply | OPT-OUT | still Phase 6 — no PROG requirement writes it |
| `personal_record` / `body_metric` / `progress_photo` push apply | OPT-OUT | Phases 9 and 12; unchanged by this phase |
| Hard `DELETE` of a `routine` | OPT-OUT | `HARD_DELETE_FORBIDDEN` already rejects it; archive-as-timestamp is the only removal path (D-05) |

## Re-open triggers

Re-run this matrix if the 04-05 gesture spike selects a pre-built reorder library instead of
building on gesture-handler directly, if auto-scroll-while-dragging is ever requested, or when
Phase 6 extends `user_preference`'s already-built apply path with `default_equipment_profile_id`.
