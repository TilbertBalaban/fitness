# Platform modules and the web escape hatch

One codebase targets iOS, Android, and the browser. This document records the single convention for
handling a divergence between those targets, and the audited web behaviour of every native-capability
module the project either uses today or will reach for later.

It exists because "React Native Web divergence discovered late" is a named project pitfall
(`.planning/research/PITFALLS.md` pitfall 6). A divergence is only dangerous once it is invisible.

---

## The convention: diverge by filename, not by runtime branch

Metro resolves a module by trying platform extensions before the bare filename. For a web bundle the
order is:

```
foo.web.tsx  →  foo.tsx
```

and for a native bundle:

```
foo.ios.tsx / foo.android.tsx  →  foo.native.tsx  →  foo.tsx
```

**The rule this project follows:** when a surface must behave differently on web, express it as a
`.web.tsx` sibling that Metro picks at build time. Do not branch on `Platform.OS` at the call site.
Shared code stays unaware of which target it is running on, and the divergence is a file you can find
by listing the directory rather than a conditional you have to read the whole module to notice.

### The `app/` directory gotcha

Inside `app/`, Expo Router builds its route tree from a `require.context` glob that matches every
`.tsx` file, and then scores the matches. A file carrying a platform extension scores as most
specific **for that platform** and is discarded on every other platform
(`expo-router/build/getRoutesCore.js`, `validPlatforms` / specificity block). This is what makes the
split work at the route level.

The consequence: **a `.web.tsx` route needs a non-platform-suffixed sibling to exist**, or the route
is never registered at all. `apps/mobile/app/reset-password.tsx` exists for exactly this reason and
holds no real UI — the page lives in `reset-password.web.tsx`.

Two related facts worth knowing before you debug the wrong thing:

- Both siblings end up **in the web bundle**, because `require.context` matches both files. Only the
  more specific one is ever *rendered*. Seeing `native-tabs.module-*.css` emitted by
  `expo export --platform web` is therefore expected and is not evidence that native tabs render on
  web.
- The specificity scoring runs per platform, so a `.web.tsx` file is not merely unused on native — it
  is scored `-1` and dropped from the native route tree entirely.

### The two instances that exist today

| Pair | Why it diverges |
|---|---|
| `apps/mobile/app/(tabs)/_layout.tsx` + `apps/mobile/app/(tabs)/_layout.web.tsx` | Native renders OS tab-bar controllers via `NativeTabs`; web renders a link-backed `expo-router/ui` bar so every tab has a real, pasteable URL. Same five route names, same route tree, no `Platform.OS` anywhere under `app/(tabs)/`. |
| `apps/mobile/app/reset-password.tsx` (sibling stub) + `apps/mobile/app/reset-password.web.tsx` | The password-reset link always opens a browser regardless of which platform requested it (D-07), so this route exists only in the web bundle. |

### The one documented exception

**Do not wrap `authClient` calls in a platform check.** The Better Auth Expo plugin already branches
internally — `@better-auth/expo/dist/client.js` early-returns on `Platform.OS === 'web'` and only
touches `storage` when not on web. Adding a second check forks one call site into two for no
behavioural difference. `apps/mobile/lib/auth-client.ts` passing `storage: SecureStore` is therefore
correct and inert on web; removing it would break native without helping web.

That exception is scoped to `authClient`. Any *other* code that touches `expo-secure-store` directly
needs its own guard — see the audit table.

---

## Native-capability web audit

"Observed" rows were checked against the modules Metro actually resolves for the web target and
against the emitted `expo export --platform web` bundle, not against remembered documentation.
"Unverified" rows name the phase that will verify them, so a later phase inherits a known gap rather
than an assumed answer.

| Capability (module) | Installed today | Behaviour on the web target | Divergence needed | First phase that needs it |
|---|---|---|---|---|
| Secure storage (`expo-secure-store` 57.0.1) | Yes | **Unavailable.** `ExpoSecureStore.web.js` is literally `export default {}`, so `isAvailableAsync()` evaluates `!!ExpoSecureStore.getValueWithKeyAsync` → `false`, and any direct call (`getItemAsync`, `setItemAsync`, `deleteItemAsync`) dereferences an undefined native method and throws. Observed: the identifier `ExpoSecureStore` does not appear in the exported web bundle at all. | **Direct guard**, not a `.web.tsx`. Today the only use is inside `authClient`, which the plugin already guards (see exception above). Any future direct use elsewhere must check `Platform.OS !== 'web'` (or `isAvailableAsync()`) before calling, and must have a web fallback — the browser's cookie jar or `localStorage`, depending on sensitivity. | Phase 1 (in use now, via `authClient` only) |
| Local key-value storage (`@react-native-async-storage/async-storage` 2.2.0) | Yes | **Works, different backing store.** The web entry (`lib/module/AsyncStorage.js`, the non-`.native` variant Metro picks for web) is the `localStorage`-backed implementation; native uses `AsyncStorage.native.js`. Same async API, same call sites, so `lib/theme.ts` needs no branch. Observed: the exported web bundle contains that implementation's `window.localStorage` read/write path. Caveat inherited from `localStorage`: synchronous under the hood, ~5 MB per origin, cleared by the user clearing site data. | **None.** Do not add one. | Phase 1 (in use now, `lib/theme.ts`) |
| Notifications (`expo-notifications` 57.0.14, `lib/rest-alert.ts` / `lib/rest-alert.web.ts`) | Yes | **Split by design, not by discovery.** Native (`rest-alert.ts`) schedules through `Notifications.scheduleNotificationAsync` with a typed `DATE` trigger, requires the `expo-notifications` config plugin (registered in `app.json`) and a fresh dev-client build to exercise at all — unbuildable and unverifiable on this machine (D-10). Web (`rest-alert.web.ts`) uses `Notification.requestPermission()`/`new Notification(...)`, scheduled via a `setTimeout` recomputed against the stored wall-clock target on every `visibilitychange` — confirmed by `expo export --platform web` resolving the `.web.ts` sibling with no `Notifications` import in the web bundle. **What the web side cannot do:** fire while the tab is fully closed, or survive a real OS-level lock screen — there is no service-worker/Push-API layer here, only foreground/backgrounded-tab delivery via the visibility-driven re-arm. | **`.web.ts` sibling** (already built) — no `Platform.OS` branch in either file. | Phase 5 — the rest timer must alert with the app backgrounded and the phone locked (ROADMAP Phase 5 success criterion 3); the native half of that claim is filed as a `.planning/WINDOWS.md` unrun-verify entry against Phase 999.1, not claimed as verified. |
| Haptics (`expo-haptics`) | No | **Unverified.** Expected to be a no-op or unsupported on desktop browsers (`navigator.vibrate` is absent on desktop Safari and unreliable elsewhere). Not observed. | **Undecided.** Haptics is a progressive enhancement — the correct shape is probably a shared wrapper that silently does nothing on web, which is an acceptable degradation because no capability is lost, only feedback. That judgement must still be recorded here when made. | Phase 5 — set-logging feedback in the two-tap logging loop. No requirement names haptics explicitly yet, so this phase attribution is a projection, not a commitment. |
| Background tasks (`expo-background-task` / `expo-task-manager`) | No | **Unverified.** Expected to have **no web equivalent**: browsers offer no general background execution for a closed tab, and Background Sync / Periodic Background Sync are service-worker-scoped, Chromium-only, and not a substitute for a scheduled timer. This is the most likely candidate for a genuine, permanent capability gap on web. Not observed. | **Undecided, and expected to need an explicit declaration.** If web cannot do it, the web build must say so in the UI rather than presenting a control that silently does nothing — see the parity rule below. | Phase 5 — rest-timer alerting while backgrounded |
| Local SQLite (`expo-sqlite`, and whichever local-first engine Phase 2 settles on) | No | **Unverified.** Web support exists but through a different engine (WASM SQLite with OPFS/IndexedDB persistence) with different storage-quota and concurrency behaviour from native SQLite. Not observed. Listed here even though CONTEXT.md did not name it, because it is the largest web-divergence surface Phase 2 will hit and the audit is worth more than its strict scope. | **Undecided.** | Phase 2 — Data Model & Sync Engine |
| Swipeable paging (`react-native-tab-view` 4.3.2) | Yes | **Works, ships its own internal native/web split.** Observed directly in the installed package: `src/Pager.ios.tsx`/`Pager.android.tsx` both `export { PagerViewAdapter as Pager }` (backed by the native `react-native-pager-view`), while the platform-generic `src/Pager.tsx` — the file Metro resolves for web, since no `Pager.web.tsx` exists to outrank it — is exactly `export { PanResponderAdapter as Pager } from './PanResponderAdapter'`, a pure-JS `PanResponder` implementation with no native pager import. Confirmed against the shipped source, not remembered documentation. `expo export --platform web` succeeding is the load-bearing confirmation that the web bundle actually resolves the `PanResponderAdapter` path. | **None — no `DayDeck.web.tsx` needed.** The library's own internal split is the divergence; this app's `DayDeck.tsx` stays a single file with no `Platform.OS` branch. | 04-05 (Day Deck) |
| Pan gesture (`react-native-gesture-handler` ~2.32.0, Expo-pinned) | Yes | **Unverified on-device, typechecks and bundles for web.** Expo's `expo install` pinned `~2.32.0` (not the audited registry-latest `3.2.1`) for SDK 57/RN 0.86 compatibility. First-party "Web Support" documentation exists (docs.swmansion.com); this app has not independently exercised a real pointer-driven pan on the web target beyond `expo export --platform web` bundling successfully — native drag behaviour on iOS/Android is unobservable in this environment (no Xcode, no Android SDK) and is filed as a WINDOWS `unrun-verify` entry. | **Direct guard, not a filename split.** `GestureHandlerRootView` wraps the whole app root (`app/_layout.tsx`) unconditionally on both platforms; `DragHandle.tsx`'s pan gesture uses `activeOffsetY`/`failOffsetX` direction-locking (not a `Platform.OS` branch) so it never needs to diverge by file unless the web pointer story proves to have a real gap — see `DragHandle.web.tsx` decision in 04-05-SUMMARY.md. | 04-05 (Drag Handle) |
| Declarative animation (`react-native-reanimated` 4.5.1, Expo-pinned) | Yes | **Unverified on-device, typechecks and bundles for web.** Expo pinned `4.5.1` (not the audited registry-latest `4.5.3`). Requires the `react-native-worklets` Babel plugin (moved out of `react-native-reanimated/plugin` as of Reanimated 4 — confirmed via Context7 against `docs.swmansion.com/react-native-reanimated`), wired last in `babel.config.js`'s `plugins` array. `expo export --platform web` succeeding is the gate that the worklets transform resolves for the web bundle; native runtime behaviour (does the worklet actually run on the UI thread on-device) is unobservable in this environment and is filed as a WINDOWS `unrun-verify` entry. | **None planned.** `useSharedValue`/`useAnimatedStyle` are expected to work identically on web per Reanimated's own web-support documentation; no `.web.tsx` split exists for the drag handle's animation itself (only the gesture layer, if anything, would need one — see the gesture-handler row above). | 04-05 (Drag Handle) |

---

## The parity rule

A capability this project delivers must not be silently absent or quietly degraded on any platform it
ships to.

Where a surface genuinely cannot behave identically on web, that divergence gets **an explicit row in
the table above and an explicit file** — a `.web.tsx` sibling, or a guarded module with a documented
web fallback. It never gets an unannounced omission that a person discovers by finding a control that
does nothing.

A gap that is written down is a decision. A gap that is not written down is a bug that has not been
found yet.
