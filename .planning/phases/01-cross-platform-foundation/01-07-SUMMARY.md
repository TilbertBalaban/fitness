---
phase: 01-cross-platform-foundation
plan: 07
subsystem: navigation-shell
tags: [expo-router, react-native-web, tabs, platform-parity, theming, auth]
status: complete

requires:
  - "01-02: AppearanceControl, lib/theme.ts appearance persistence (PLAT-09)"
  - "01-05: lib/sign-out.ts signOut + pendingWriteCount seam, SignOutDialog (D-04)"
  - "01-01: the tracer landing screen whose route this plan replaces"
provides:
  - "apps/mobile/app/(tabs)/: five-route tab group, native chrome and link-backed web chrome from one route tree"
  - "apps/mobile/components/PlaceholderScreen.tsx: the shared heading+body shell four tabs use"
  - "apps/mobile/lib/theme-colors.ts: resolved ColorValues for native tab-bar controllers"
  - "docs/platform-modules.md: the .web.tsx convention and the native-capability web audit"
affects:
  - "apps/mobile/app/_layout.tsx: protected screen now (tabs) instead of index"
  - "apps/mobile/lib/theme.ts: appearance now applied through NativeWind (cross-plan fix)"
  - "apps/mobile/lib/__tests__/theme.test.ts: resume-OS sentinel assertion relaxed"

tech-stack:
  added: []
  patterns:
    - "Platform divergence expressed as a .web.tsx sibling resolved by Metro/expo-router specificity, never a Platform.OS branch at the call site"
    - "Native tab-bar controllers take resolved ColorValues from a JS palette module, because they cannot read the CSS variables NativeWind classes resolve against"
    - "Appearance is applied through NativeWind's colorScheme, the one API that drives Appearance on native and the `dark` class on web"

key-files:
  created:
    - apps/mobile/app/(tabs)/_layout.tsx
    - apps/mobile/app/(tabs)/_layout.web.tsx
    - apps/mobile/app/(tabs)/index.tsx
    - apps/mobile/app/(tabs)/programs.tsx
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/app/(tabs)/history.tsx
    - apps/mobile/app/(tabs)/profile.tsx
    - apps/mobile/components/PlaceholderScreen.tsx
    - apps/mobile/lib/theme-colors.ts
    - docs/platform-modules.md
  modified:
    - apps/mobile/app/_layout.tsx
    - apps/mobile/lib/theme.ts
    - apps/mobile/lib/__tests__/theme.test.ts
  removed:
    - apps/mobile/app/index.tsx

decisions:
  - "Native tabs import from expo-router/unstable-native-tabs — SDK 57 publishes no expo-router/native-tabs entry point"
  - "Tab tints come from a JS palette module mirroring global.css, because NativeTabs props take ColorValue not className"
  - "The five triggers are written out literally rather than mapped, so no edit can produce an empty or partial tab bar"
  - "Sign-out refetches the session at the call site rather than inside lib/sign-out.ts, which deliberately carries no auth-client dependency"

metrics:
  duration: ~2h
  completed: 2026-08-11

actuals:
  tokens: 41000
  tasks: 3
  commits: 6
---

# Phase 01 Plan 07: Five-Tab Navigation Shell Summary

One Expo Router route tree now renders `NativeTabs` chrome on iOS and Android and a link-backed,
deep-linkable `expo-router/ui` bar in the browser, with Home, Programs, Workout, History and Profile
as five labelled screens — and Profile mounting the PLAT-09 appearance control and the D-04 sign-out
lifecycle.

## What Was Built

**Task 1 — one route tree, two tab chromes** (`65cd554`)

`app/(tabs)/_layout.tsx` renders `NativeTabs` with one trigger per route, each carrying its
UI-SPEC Ionicons outline/filled pair via `NativeTabs.Trigger.VectorIcon`, Accent selected tint and
Foreground-muted default tint. Nothing overrides the bar's height, blur, or safe-area handling.

`app/(tabs)/_layout.web.tsx` renders `Tabs`/`TabList`/`TabTrigger`/`TabSlot` with the same five route
names and an `href` on each. `asChild` hands a local `WebTab` the `isFocused` and `href` props, and
react-native-web turns the resulting `Pressable` into a real anchor. 56px is a minimum height, the
bar wraps, and the 2px bottom border is applied unconditionally (transparent when inactive) so focus
never shifts the bar's height.

`app/index.tsx` was removed and the root layout's protected screen repointed at `(tabs)` — both paths
claimed the root URL.

**Task 2 — five screens, Profile carrying real functionality** (`452051d`)

`PlaceholderScreen` renders the Heading role (20/600) over Body role (16/400, Foreground-muted),
centred, `xl` top margin, in a `ScrollView` with `flexGrow: 1`. No card, no icon illustration, no
skeleton. Four tabs use it with the UI-SPEC copy verbatim.

`profile.tsx` renders the Profile heading, `AppearanceControl`, and a sign-out control that calls
`signOut` from `lib/sign-out.ts`, passing a `confirmDiscard` that mounts `SignOutDialog` in a `Modal`
only when `pendingWriteCount` returns above zero. In Phase 1 the count is always zero, so sign-out
proceeds with no interruption — but the seam is wired.

**Task 3 — platform-module audit** (`2e0e2e3`)

`docs/platform-modules.md` records the resolution order, the build-time-not-runtime rule, the
`app/` non-suffixed-sibling requirement (with the mechanism: expo-router's `getRoutesCore.js`
specificity scoring, which assigns `-1` to a foreign platform's file), the `authClient` exception,
and a six-row audit table.

## Verification Run

Everything below was actually executed, not asserted.

| Check | Result |
|---|---|
| `pnpm typecheck` (4 packages) | 5/5 tasks pass |
| `pnpm --filter mobile test` | 34/34 pass, 2 suites |
| `pnpm --filter mobile build` (web export) | Exits 0; emits `/`, `/programs`, `/workout`, `/history`, `/profile` plus `/reset-password` as real static routes |
| `pnpm --filter api test:e2e` (hoisting-regression check) | 4 suites, 21/21 pass — no repeat of the wave-2 `jest-environment-node` breakage. This plan adds no dependency at all; `package.json` and the lockfile are untouched. |
| `grep -rEc 'numberOfLines\|ellipsizeMode'` on both layouts and `PlaceholderScreen` | 0 for all three |
| `grep -rn 'Platform.OS' app/(tabs)/` | no match — the split is purely by filename |
| `grep -rEn '<Card\|Skeleton\|shimmer' app/(tabs)/` | no match |

### Live browser pass (Playwright, Chromium, against a running API)

The API was started on an ephemeral port (3111) and the web export served on 8099 — **port 3000 was
left untouched and confirmed still running**. A real account was created through the sign-up form.

| Truth | Observed |
|---|---|
| Five tabs, fixed order Home → Programs → Workout → History → Profile | All five present, in order, on every route |
| Each tab is real link-backed navigation | `<a role="tab">` with `href` `/`, `/programs`, `/workout`, `/history`, `/profile` |
| Clicking a tab changes the address bar | Yes, for all five |
| Pasting a tab URL lands on that tab | `/history` pasted cold → History screen, History tab active |
| Browser back and forward move between tabs | back → `/`, forward → `/workout` |
| Exactly one active tab, Accent tinted, 2px Accent bottom border on web | Active: border and label `rgb(37, 99, 235)`; the other four: `rgba(0,0,0,0)` border, label `rgb(113, 113, 122)` |
| Active tab swaps to the filled icon | Ionicons glyph changes (e.g. `` → `` for Home) |
| Tab bar 56px, a minimum not a fixed height | 56px at 1280w; **grows to 128px at 380w**, wrapping to three rows with zero labels clipped (`scrollWidth <= clientWidth` on every label) |
| Each placeholder screen shows its exact UI-SPEC copy | All four verified by string match in the rendered DOM |
| Appearance switching repaints the app | System / Light / Dark each toggle `documentElement.class` correctly; dark repaints tab tints to `rgb(161, 161, 170)` |
| Sign-out proceeds with no dialog and lands on sign-in | Yes; no "Sign Out Anyway" ever rendered |
| **T-01-13** — signed-out deep link to a tab route | `/profile` cold with no session → redirected to `/sign-in`, **zero tab chrome rendered** |
| **T-01-20** — session not retained after sign-out | POST `/v1/auth/sign-out` → 200, `better-auth.session_token` cookie removed from the jar, reload lands on sign-in |
| Console/page errors across the whole pass | none |

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — Blocking] `expo-router/native-tabs` does not exist in SDK 57**

- **Found during:** Task 1, first typecheck
- **Issue:** The plan, UI-SPEC and RESEARCH prose all name `expo-router/native-tabs`. expo-router
  57.0.12 publishes the subpath as `unstable-native-tabs` only (RESEARCH's own code comments already
  said so).
- **Fix:** Import from `expo-router/unstable-native-tabs`, with a one-line note.
- **Commit:** `65cd554`

**2. [Rule 3 — Blocking] Native tab tints need resolved colours, not classes**

- **Issue:** `NativeTabs` `iconColor`/`labelStyle` take `ColorValue`. They render real native tab-bar
  controllers and can never read the CSS variables the NativeWind classes resolve against.
- **Fix:** Added `apps/mobile/lib/theme-colors.ts` (**not in `files_modified`**) mirroring the
  `--color-*` values from `global.css`, with a comment marking the two-source-of-truth trap.
- **Commit:** `65cd554`

**3. [Rule 3 — Blocking] Root layout had to change**

- **Issue:** `apps/mobile/app/_layout.tsx` is **not in `files_modified`**, but `<Stack.Screen
  name="index" />` had to become `name="(tabs)"` or the tab group is unreachable. This was
  anticipated in the execution brief.
- **Fix:** One-line change. D-01/D-02/D-03 semantics preserved exactly — no new network wait on the
  native launch path, no new session-clearing path, the web budget/`WebSessionSkeleton` untouched.
- **Commit:** `65cd554`

**4. [Rule 1 — Bug, cross-plan] The web build rendered a blank page on every route**

This is the largest finding of the plan, and it is exactly the pitfall this phase exists to catch.

- **Found during:** the first browser run — `pageerror: c.default.setColorScheme is not a function`
- **Issue:** Plan 01-02's `applyAppearance` calls `Appearance.setColorScheme` from `react-native`.
  react-native-web's `Appearance` implements **only** `getColorScheme` and `addChangeListener`
  (verified in `react-native-web/dist/exports/Appearance/index.js`). The root layout calls
  `applyAppearance` at mount, so the call threw and **the entire web app rendered an empty root**.
  The typecheck, the unit tests and the static export all passed while this was true, because the
  export's static HTML is empty for an unrelated reason (`appearanceReady` is false during SSG).
- **Fix:** `applyAppearance` now calls NativeWind's `colorScheme.set(value)`. On native this calls
  the identical `Appearance.setColorScheme('unspecified' | 'light' | 'dark')` (verified in
  `react-native-css-interop/dist/runtime/native/appearance-observables.js`), so the UI-SPEC contract
  and 01-02's behaviour are unchanged. On web it toggles the `dark` class that
  `tailwind.config.js`'s `darkMode: 'class'` keys off.
- **Test touched:** one assertion in 01-02's `theme.test.ts` pinned `setColorScheme('unspecified')`.
  NativeWind chooses `'unspecified'` from RN 0.82 on and `null` before it, keyed off
  `Platform.constants.reactNativeVersion`; jest's mocked constants report 0.0.0 while the app runs
  on 0.86. The assertion now accepts either sentinel, with the reason recorded inline.
- **Files modified:** `apps/mobile/lib/theme.ts`, `apps/mobile/lib/__tests__/theme.test.ts` (**neither
  in `files_modified`** — both belong to plan 01-02)
- **Commit:** `ffae191`
- **Why fixed here rather than deferred:** not one web truth in this plan's `must_haves` is testable
  while the web app is a blank page, and the plan's own parity prohibition forbids shipping a
  platform where a delivered capability is silently absent.

**5. [Rule 1 — Bug] Tab tints ignored the in-app appearance override on web**

- **Found during:** the browser pass — switching to Dark repainted every className-styled surface
  while the tab bar stayed on the light palette.
- **Issue:** `useThemeColors` used React Native's `useColorScheme`, which on web reports only the OS
  `prefers-color-scheme` media query and never sees the in-app override.
- **Fix:** Use NativeWind's `useColorScheme`, which reflects the override on both targets.
- **Commit:** `801a99d`

**6. [Rule 1 — Bug] Sign-out left the shell rendering over a revoked session**

- **Found during:** the browser pass — sign-out returned 200 and the cookie was cleared, but the
  Profile screen kept rendering; only a manual reload landed on sign-in.
- **Issue:** `lib/sign-out.ts` deliberately carries **no** dependency on the auth client (its own
  comment explains why: the ESM-only builds are unreachable through Jest's transform config). Nothing
  therefore told Better Auth's session atom that the session had ended.
- **Fix:** `profile.tsx` awaits `refetch` from `authClient.useSession()` after `signOut` resolves.
  Placed at the call site rather than in `lib/sign-out.ts` precisely to preserve that module's
  dependency-free contract and its test suite.
- **Severity note:** the session itself was genuinely revoked in every case (server 200, cookie
  removed), so **T-01-20 was never actually violated** — this was a stale-UI defect, not a retained
  session. It is still worth fixing: a tab shell rendering over a dead session on a shared browser
  looks exactly like a retained session to the person using it.
- **Commit:** `2cc6b92`

### Scope notes

- **Task 1 created the four non-index route files.** The plan assigns them to Task 2, but Task 1's own
  `<verify>` runs `expo export --platform web`, and a `TabTrigger href="/programs"` pointing at a
  non-existent route is not a verifiable route tree. Task 1 committed them with inline heading/body;
  Task 2 extracted `PlaceholderScreen` and rewrote all five. No throwaway code survives the plan.
- **The tracer landing screen's content was not literally moved.** `app/index.tsx` displayed
  "Signed in" plus the session email; the UI-SPEC's Screen Inventory specifies Home as
  "Home" / "Your training dashboard will live here.". The spec wins; the email display is gone.
- **Plan 01-06's files were not touched.** No `(auth)/*` file, no `_layout.tsx` in that group, and
  none of `TextField`/`PrimaryButton`/`ErrorBanner`/`AuthScreenLayout` was created or modified. The
  sign-out control is composed from `Pressable`/`Text` plus token classes rather than a competing
  button primitive, per the plan's own instruction.
- **No dependency was added.** `package.json` and `pnpm-lock.yaml` are byte-identical to the base
  commit, so the wave-2 hoisting hazard is structurally inapplicable. The API e2e suites were run
  anyway and pass.

## Auto-Resolved Checkpoints

The plan carries no `type="checkpoint:*"` task. Its two `<human-check>` blocks were resolved as
follows under the auto-resolve policy.

| Gate | Resolution | Reasoning |
|---|---|---|
| Task 1 `<human-check>`: native tab bar on iOS/Android; web tab bar, URL changes, deep-link paste, back/forward; max font scale on all three | **Partially resolved, honestly.** The entire web half was driven end to end in a real Chromium against a live API and passes (table above). The iOS and Android halves were **not run** — no simulator or device is reachable from this worktree. The font-scale backstop was exercised on web only, by viewport narrowing. | Automating the web half was possible and was done rather than waved through. Claiming a native pass would have been a fabrication, so it is recorded as `unrun-verify` in `.planning/WINDOWS.md` instead. |
| Task 2 `<human-check>`: same account on three platforms reaching the same Home; all five tabs; appearance switching; sign-out landing on sign-in; max font scale | **Partially resolved, honestly.** All of it verified in the browser, including that sign-out lands on sign-in with no dialog. Not verified on iOS or Android. | Same reasoning. Running it is what surfaced deviations 4, 5 and 6 — three real bugs an auto-approval would have shipped. |
| Implicit gate: fix a pre-existing, out-of-scope, web-fatal bug in another plan's file (deviation 4) | **Resolved: fix it.** | It is a hard blocker on every web assertion this plan makes, and this plan's own prohibition names silent web absence as the thing not to ship. Kept minimal and contract-preserving: native behaviour is bit-identical, the UI-SPEC's `Appearance.setColorScheme` sentence stays true, and only one over-specific test assertion moved. |

No `blocking-human` gate was encountered.

## Coverage of `must_haves`

| Truth | Status | Evidence |
|---|---|---|
| One route tree → native tab chrome and deep-linkable web tab bar, same five names | **Web proven, native unproven** | Web: full browser pass. Native: typecheck + correct `NativeTabs` API usage only. |
| `.web.tsx` sibling picked up automatically with no runtime branch, demonstrated on the tab layout and reset-password | **Met** | `grep 'Platform.OS' app/(tabs)/` → no match; both instances exist; mechanism documented from `getRoutesCore.js` specificity scoring. |
| Pasting a tab URL navigates there; back and forward move between tabs | **Met** | Verified in Chromium. |
| Same authenticated home screen on iOS, Android and a desktop browser | **One third proven** | Browser only. Recorded as `unrun-verify`. |
| Appearance change and sign-out from Profile, confirmation only when unsynced writes pend | **Met** | Verified in browser; `SignOutDialog` reached only through the `pendingWriteCount` branch inside `signOut`. |
| Exactly five tabs, fixed order, never empty | **Met** | Five literal JSX triggers, no array to filter, no conditional. Observed in browser. |
| Native first-frame render with no loading state; web chrome immediate, only session-dependent content deferred | **Web met, native unproven** | Root layout's D-02 branch untouched; web bar renders as soon as the session resolves. |
| Tab bar performs no fetch, has no failure mode | **Met** | Both layouts are static; no network call in either file. |
| Exactly one active tab, Accent tinted, 2px Accent bottom border on web | **Met** | Measured computed styles. |
| Fixed and complete at build time, no partial state | **Met** | By construction. |
| Count invariantly five | **Met** | By construction. |
| Placeholder screens centre content in a growing, scrolling container | **Met** | `ScrollView` + `flexGrow: 1`; observed. |
| *(backstop)* Labels wrap and the bar grows at large font scales; 56px is a minimum | **Web met, native unproven** | 56px → 128px at 380px viewport, nothing clipped. |
| *(backstop)* Longest label legible at max accessibility size on all three | **Web met, native unproven** | Same measurement; no `numberOfLines` anywhere. |
| *(backstop)* Placeholder body wraps without clipping at max font scale | **Web met, native unproven** | No truncation props; container grows. |
| *(prohibition)* No silently absent or degraded web capability | **Met — and enforced** | This prohibition is what drove deviation 4. Every known gap has a row in `docs/platform-modules.md`. |

Artifact `contains` checks: `NativeTabs` ✓, `TabTrigger` ✓, `AppearanceControl` ✓,
`expo-secure-store` ✓. `PlaceholderScreen.tsx` `contains: "Heading"` is satisfied
case-insensitively (`heading` prop, `text-heading` role class) — there is no capital-H token in the
file, and inventing one would have been contrivance.

## Known Stubs

None. `apps/mobile/app/reset-password.tsx` remains a deliberate no-op sibling required by Expo
Router's platform-extension rule, now documented in `docs/platform-modules.md` rather than left as
folklore.

## Threat Flags

None. No new network endpoint, auth path, file access pattern, or schema change was introduced; the
tab group mounts inside the existing session gate.

## What Is Left Undone

1. **iOS and Android were never run.** Every native-specific claim rests on typecheck plus correct
   API usage. Recorded as `unrun-verify` in `.planning/WINDOWS.md`. This is the honest state, not a
   three-platform pass.
2. **Maximum OS accessibility font scale on native** — same reason.
3. `docs/platform-modules.md` carries four `Unverified` rows by design (notifications, haptics,
   background tasks, local SQLite), each naming the phase that will verify it.

## Self-Check: PASSED

All created files exist:

```
FOUND: apps/mobile/app/(tabs)/_layout.tsx
FOUND: apps/mobile/app/(tabs)/_layout.web.tsx
FOUND: apps/mobile/app/(tabs)/index.tsx
FOUND: apps/mobile/app/(tabs)/programs.tsx
FOUND: apps/mobile/app/(tabs)/workout.tsx
FOUND: apps/mobile/app/(tabs)/history.tsx
FOUND: apps/mobile/app/(tabs)/profile.tsx
FOUND: apps/mobile/components/PlaceholderScreen.tsx
FOUND: apps/mobile/lib/theme-colors.ts
FOUND: docs/platform-modules.md
REMOVED (as planned): apps/mobile/app/index.tsx
```

All commits exist: `65cd554`, `452051d`, `2e0e2e3`, `ffae191`, `801a99d`, `2cc6b92`.
