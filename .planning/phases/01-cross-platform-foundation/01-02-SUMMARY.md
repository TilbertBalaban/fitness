---
phase: 01-cross-platform-foundation
plan: 02
subsystem: ui
tags: [nativewind, tailwindcss, expo-router, jest-expo, async-storage, appearance, dark-mode]

requires:
  - phase: 01-01
    provides: "pnpm/Turborepo workspace, apps/mobile Expo Router app, app/_layout.tsx root layout with the D-02 session gate"
provides:
  - "NativeWind v4 wired for native and web with the UI-SPEC's binding token contract (six colour roles, seven spacing tokens, four font sizes, two weights)"
  - "Three-state (system/light/dark) appearance preference: read, apply, persist, restore, with two silent-fallback failure paths"
  - "The labelled AppearanceControl component, exported and unmounted, ready for 01-07's Profile screen"
  - "apps/mobile's first client-side test vehicle (jest-expo, jest.config.js) — plan 01-05 also depends on this"
affects: [01-05, 01-07, phase-02-onward-ui]

actuals:
  tokens: 3550
  tasks: 3
  commits: 4

tech-stack:
  added:
    - "nativewind 4.2.6 + tailwindcss 3.4.19 (NOT the tailwindcss v4 line — see deviations)"
    - "@react-native-async-storage/async-storage 2.2.0"
    - "react-native-css-interop 0.2.6 (explicit direct dependency — see deviations)"
    - "babel-preset-expo ^57.0.6 (explicit direct dependency — see deviations)"
    - "jest-expo 57.0.3 + jest 29.7.0 (NOT jest 30 — see deviations)"
  patterns:
    - "Colour roles as CSS custom properties (rgb(var(--color-x) / <alpha-value>)) so one Tailwind class resolves in both light and dark via the .dark selector"
    - "Silent-fallback persistence: an unrecognised stored token or a rejected AsyncStorage call both resolve to 'system' rather than throwing or surfacing an error"
    - "Root layout holds render on one local (non-network) storage read before mounting the Stack, to avoid a wrong-theme flash on cold start"

key-files:
  created:
    - apps/mobile/tailwind.config.js
    - apps/mobile/global.css
    - apps/mobile/babel.config.js
    - apps/mobile/metro.config.js
    - apps/mobile/nativewind-env.d.ts
    - apps/mobile/jest.config.js
    - apps/mobile/lib/theme.ts
    - apps/mobile/lib/__tests__/theme.test.ts
    - apps/mobile/components/AppearanceControl.tsx
  modified:
    - apps/mobile/app/_layout.tsx
    - apps/mobile/package.json
    - apps/mobile/tsconfig.json

key-decisions:
  - "tailwindcss pinned to the 3.4.x line, not the v4 that `expo install`'s semver range (>3.3.0) resolved to by default — NativeWind 4.2.6 is built against Tailwind v3's JS API/config format; Tailwind v4's CSS-first config and Oxide engine are architecturally incompatible with it"
  - "jest pinned to the 29.x line, not the v30 initially installed — jest-expo@57's own dependencies (@jest/globals, jest-environment-jsdom, jest-snapshot) are all ^29.2.1, and jest 30's jest-runtime API removed internals jest-expo's preset calls directly"
  - "Appearance.setColorScheme's system-follow argument is the string 'unspecified', not null, on RN 0.86 — 01-UI-SPEC.md and 01-RESEARCH.md both specify null; the installed type declarations and Appearance.js runtime disagree, so the code follows the actual installed package"
  - "react-native-css-interop and babel-preset-expo added as explicit direct dependencies of apps/mobile, not left as transitive — pnpm's strict node_modules layout only exposes a package's own dependencies inside that package's own node_modules folder, so Metro/Babel cannot resolve a transitive dependency's exports from application source files without an explicit direct install"

patterns-established:
  - "NativeWind class-based dark mode (darkMode: 'class') is the only strategy compatible with an in-app three-state override — the media-query default throws when Appearance.setColorScheme is called"
  - "Every jest.config.js in this workspace must extend jest-expo's own transformIgnorePatterns (which already accounts for pnpm's .pnpm/<pkg>@<version>/node_modules/<pkg> nesting) rather than hand-rolling a pattern from the plain @react-native/jest-preset default, which assumes a flat node_modules layout"

requirements-completed: [PLAT-09]

coverage:
  - id: D1
    description: "readStoredAppearance defaults to system, round-trips light/dark exactly, and falls back to system for any value outside the three-token set or when the storage read rejects"
    requirement: PLAT-09
    verification:
      - kind: unit
        ref: "apps/mobile/lib/__tests__/theme.test.ts#readStoredAppearance (6 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "setAppearance writes the token and calls Appearance.setColorScheme with the correct native argument for both 'dark' and 'system' ('unspecified'), and tolerates a rejected storage write without throwing or skipping the in-memory apply"
    requirement: PLAT-09
    verification:
      - kind: unit
        ref: "apps/mobile/lib/__tests__/theme.test.ts#setAppearance (3 cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A value written by setAppearance is returned by a subsequent readStoredAppearance call, simulating restart restoration"
    requirement: PLAT-09
    verification:
      - kind: unit
        ref: "apps/mobile/lib/__tests__/theme.test.ts#restart restoration"
        status: pass
    human_judgment: false
  - id: D4
    description: "AppearanceControl renders the exact label 'Appearance' and segment strings 'System'/'Light'/'Dark', every segment's touch target is at least 48x48 via layout padding (not hitSlop), and no numberOfLines/ellipsizeMode is set anywhere in lib or components"
    requirement: PLAT-09
    verification:
      - kind: other
        ref: "grep -q \"'System'\"/\"'Light'\"/\"'Dark'\"/\"Appearance\" apps/mobile/components/AppearanceControl.tsx -> all match; grep -rEn 'numberOfLines|ellipsizeMode' apps/mobile/components -> no match; grep -rn allowFontScaling apps/mobile/lib apps/mobile/components -> no match"
        status: pass
    human_judgment: true
    rationale: "The 48x48 floor and font-scale grow-not-truncate behaviour are structurally present (no fixed height, no line-count cap, style minWidth/minHeight: 48), but actual rendered geometry at the OS's maximum accessibility font size can only be confirmed on a device/browser, and the control is not yet mounted on any screen — 01-07 mounts it on the Profile screen, where the plan's own human-check is scheduled."
  - id: D5
    description: "A person can open the Appearance control, switch between System/Light/Dark, and the whole app repaints on iOS, Android, and desktop browser; the choice survives a restart with no flash of the wrong theme"
    requirement: PLAT-09
    verification: []
    human_judgment: true
    rationale: "This is the plan's own <human-check> — it explicitly runs once plan 01-07 has mounted AppearanceControl on the Profile screen. This plan ships the control and the underlying persistence logic (proven by unit tests) but there is no screen to click through yet."
  - id: D6
    description: "NativeWind resolves className identically on native and web from one token set; the whole phase still runs in Expo Go with no dev-client build introduced"
    verification:
      - kind: other
        ref: "pnpm --filter mobile exec tsc --noEmit (exit 0); pnpm --filter mobile exec expo export --platform web (exit 0, produced /, /sign-in, /sign-up static routes with a non-empty --color-background/--color-accent CSS output); pnpm --filter mobile exec expo start (Metro bundler starts, 'Waiting on http://localhost:8081', no native-module error)"
        status: pass
    human_judgment: false

duration: 26min
completed: 2026-08-11
status: complete
---

# Phase 01 Plan 02: NativeWind Styling Foundation & Appearance Control Summary

NativeWind v4 wired for native and web against the UI-SPEC's binding token contract, plus a fully tested three-state (system/light/dark) appearance preference with silent-fallback persistence — the AppearanceControl component itself is built and exported but not yet mounted on a screen (that's 01-07's Profile screen).

## Performance

- **Duration:** 26 min
- **Started:** 2026-08-11T09:01:05Z
- **Completed:** 2026-08-11T09:27:24Z
- **Tasks:** 3 completed
- **Files:** 9 created, 3 modified

## Accomplishments

- `tailwind.config.js` + `global.css` implement the UI-SPEC's exact colour roles, spacing scale, and typography contract as CSS custom properties, resolving identically on native and RN Web
- `lib/theme.ts` — `readStoredAppearance`, `applyAppearance`, `setAppearance`, `useAppearance` — with 10 passing unit tests covering every line of the plan's behaviour block, including both silent-fallback failure paths (unrecognised token, rejected storage op)
- `components/AppearanceControl.tsx` — the labelled three-segment control, 48x48 floor via real padding, no truncation at any font scale
- `app/_layout.tsx` now resolves and applies the stored appearance before mounting the Stack, so cold start never paints the wrong theme first
- `jest.config.js` stands up `jest-expo` as apps/mobile's first test runner, correctly accounting for pnpm's `.pnpm` store layout — a dependency plan 01-05 also needs

## Task Commits

Each task was committed atomically:

1. **Task 1: NativeWind v4 running on native and web with the UI-SPEC token contract** - `91392a6` (feat)
2. **Task 2: Three-state appearance preference — read, apply, persist, restore** - `c4031e7` (test, RED) → `3e2e5f9` (feat, GREEN)
3. **Task 3: The Appearance control, applied before first paint** - `1d0e537` (feat)

_TDD task 2 has two commits (test → feat); no refactor commit was needed._

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `apps/mobile/tailwind.config.js` - darkMode 'class', six colour roles, seven spacing tokens, four font sizes, two weights
- `apps/mobile/global.css` - light/dark CSS custom properties for all six colour roles
- `apps/mobile/babel.config.js` - `nativewind/babel` preset, `jsxImportSource: 'nativewind'`
- `apps/mobile/metro.config.js` - `withNativeWind` against `./global.css`
- `apps/mobile/nativewind-env.d.ts` - `className` typings + a `*.css` module declaration
- `apps/mobile/jest.config.js` - `jest-expo` preset with a pnpm-aware `transformIgnorePatterns`
- `apps/mobile/lib/theme.ts` - the appearance read/apply/persist/restore module
- `apps/mobile/lib/__tests__/theme.test.ts` - 10 tests covering the full behaviour block
- `apps/mobile/components/AppearanceControl.tsx` - the labelled three-segment control
- `apps/mobile/app/_layout.tsx` - now awaits the stored appearance before rendering children
- `apps/mobile/package.json` - nativewind, tailwindcss(v3), async-storage, jest-expo, jest(v29), babel-preset-expo, react-native-css-interop
- `apps/mobile/tsconfig.json` - `"types": ["jest"]` added, plus NativeWind's own auto-added `nativewind-env.d.ts` include

## Decisions Made

- Pinned `tailwindcss` to the 3.4.x line rather than the v4 `expo install` resolved by default — see Deviations
- Used `'unspecified'` (not `null`) as `Appearance.setColorScheme`'s system-follow argument, matching the installed RN 0.86 API rather than the plan/research docs' assumption
- Held `app/_layout.tsx`'s render on the local appearance read (not the session read) — scoped narrowly so D-02's "no network wait" guarantee is untouched

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocker] `expo install`'s tailwindcss peer range resolved to v4, which NativeWind 4.2.6 cannot use**
- **Found during:** Task 1
- **Issue:** The plan's peer spec (`tailwindcss >3.3.0`) let pnpm resolve the newest matching major, tailwindcss 4.3.3. NativeWind v4.2.6's own installation docs (confirmed via Context7) pin `tailwindcss@^3.4.17` — Tailwind v4's CSS-first `@theme` config and Oxide engine are a different architecture NativeWind 4.2.6 was never built against.
- **Fix:** Removed tailwindcss, reinstalled `tailwindcss@^3.4.17` as a devDependency.
- **Files modified:** `apps/mobile/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm exec expo export --platform web` produces a CSS bundle containing both light and dark `--color-background` values.
- **Committed in:** `91392a6`

**2. [Rule 3 - blocker] `babel.config.js`'s `nativewind/babel` preset requires `babel-preset-expo` as a direct, not transitive, dependency**
- **Found during:** Task 1
- **Issue:** `babel-preset-expo` is a dependency of the `expo` package, not of `apps/mobile` directly. pnpm's strict node_modules layout only exposes a package's own declared dependencies inside that package's own `node_modules/`, so `require.resolve('babel-preset-expo')` failed from `apps/mobile`.
- **Fix:** Added `babel-preset-expo` as an explicit devDependency.
- **Files modified:** `apps/mobile/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm exec tsc --noEmit` and `expo export --platform web` both succeed.
- **Committed in:** `91392a6`

**3. [Rule 1 - bug] `import '@/global.css'` fails `tsc --noEmit` with TS2882 (no module declaration for a side-effect CSS import)**
- **Found during:** Task 1
- **Issue:** NativeWind's own installation docs import CSS from a `.js` entry file, which TypeScript never type-checks; this project's entry point is `.tsx` under `strict: true`, so the bare import needs a module declaration.
- **Fix:** Added `declare module '*.css';` to `nativewind-env.d.ts`.
- **Files modified:** `apps/mobile/nativewind-env.d.ts`
- **Verification:** `pnpm exec tsc --noEmit` exits 0.
- **Committed in:** `91392a6`

**4. [Rule 3 - blocker] `react-native-css-interop/jsx-runtime` unresolvable from application source under pnpm**
- **Found during:** Task 1
- **Issue:** `expo export --platform web` failed with "Unable to resolve module react-native-css-interop/jsx-runtime" from `app/(auth)/sign-in.tsx`. `babel.config.js`'s `jsxImportSource: 'nativewind'` makes every `.tsx` file's JSX-runtime import resolve through `nativewind` → `react-native-css-interop`, but `react-native-css-interop` is only a transitive dependency (of `nativewind`), and pnpm's strict layout doesn't expose it to application source files.
- **Fix:** Added `react-native-css-interop@0.2.6` (matching nativewind's pinned version) as an explicit direct dependency.
- **Files modified:** `apps/mobile/package.json`, `pnpm-lock.yaml`
- **Verification:** `expo export --platform web` succeeds, producing all 7 static routes.
- **Committed in:** `91392a6`

**5. [Rule 3 - blocker] jest-expo@57 is incompatible with jest 30's jest-runtime internals**
- **Found during:** Task 2 (writing the RED-phase test)
- **Issue:** `jest-expo`'s own dependencies (`@jest/globals`, `jest-environment-jsdom`, `jest-snapshot`) are all pinned to `^29.2.1`. The initially-installed `jest@30.4.2` throws `TypeError: this._moduleMocker.clearMocksOnScope is not a function` — a jest-runtime internal removed between majors that jest-expo's preset calls directly.
- **Fix:** Downgraded `jest` and `@types/jest` to the `^29` line.
- **Files modified:** `apps/mobile/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm exec jest theme.test.ts` runs (proceeds to the next issue below, then eventually passes).
- **Committed in:** `c4031e7`

**6. [Rule 1 - bug] `transformIgnorePatterns` copied from the plain `@react-native/jest-preset` default breaks under pnpm's nested node_modules layout**
- **Found during:** Task 2
- **Issue:** The pattern `node_modules/(?!((jest-)?react-native|@react-native(-community)?)/)` assumes a flat node_modules layout. pnpm physically stores every package at `node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>/...`, so the FIRST `node_modules/` segment in any resolved path is the `.pnpm` store itself — the regex matches and ignores-for-transform at that position before ever reaching the real package name deeper in the path, causing `@react-native/jest-preset/jest/setup.js` (an ESM file) to be loaded unparsed and throw `SyntaxError: Cannot use import statement outside a module`.
- **Fix:** Replaced with `jest-expo`'s own documented pattern (`jest-expo/jest-preset.js`), which already accounts for `.pnpm`, extended with `nativewind` and `react-native-css-interop`.
- **Files modified:** `apps/mobile/jest.config.js`
- **Verification:** `pnpm exec jest theme.test.ts` gets past the parse stage (proceeds to the next issue below, then eventually passes).
- **Committed in:** `c4031e7`

**7. [Rule 1 - bug] 01-UI-SPEC.md/01-RESEARCH.md's `Appearance.setColorScheme(null)` does not match RN 0.86's actual API**
- **Found during:** Task 2 (typecheck, then confirmed against the installed `.d.ts`/runtime source)
- **Issue:** Both docs specify `Appearance.setColorScheme('system' | 'light' | 'dark')` and describe the system case as `(null)`. The installed `react-native@0.86.2` type (`ColorSchemeName = "light" | "dark" | "unspecified"`) has no `null` member, and `Appearance.js`'s runtime implementation treats `'unspecified'` as the system-follow sentinel. `tsc --noEmit` fails on `setColorScheme(null)`.
- **Fix:** Implemented and tested `applyAppearance` against `'unspecified'` instead of `null`.
- **Files modified:** `apps/mobile/lib/theme.ts`, `apps/mobile/lib/__tests__/theme.test.ts`
- **Verification:** `tsc --noEmit` exits 0; the corresponding unit test asserts `setColorScheme` was called with `'unspecified'`.
- **Committed in:** `3e2e5f9`

**8. [Rule 1 - bug] tsc did not resolve Jest's global test-runner types (`describe`/`it`/`expect`/`jest`) despite `@types/jest` being installed**
- **Found during:** Task 2
- **Issue:** `pnpm exec tsc --noEmit` reported `Cannot find name 'describe'`/`'jest'`/etc. across `theme.test.ts` even though `@types/jest` was present in `node_modules/@types/jest`.
- **Fix:** Added `"types": ["jest"]` to `apps/mobile/tsconfig.json`'s `compilerOptions`.
- **Files modified:** `apps/mobile/tsconfig.json`
- **Verification:** `tsc --noEmit` exits 0 with no test-file errors.
- **Committed in:** `3e2e5f9`

---

**Total deviations:** 8 auto-fixed (2 blockers found and fixed inline during Task 1 that were subsequently absorbed into that task's single commit, 2 blockers in Task 2, 4 bugs across Tasks 1–2). **Impact:** All were necessary for correctness — none represent scope creep. Six of the eight are pnpm-monorepo-specific resolution gaps (packages that exist transitively but aren't resolvable from application source without an explicit direct install, or resolution patterns written for a flat node_modules layout); two are places where the plan's source documents (UI-SPEC/RESEARCH) described an API surface that doesn't match what's actually installed (`null` vs `'unspecified'`, and the implicit assumption that `@types/jest` alone is sufficient without an explicit `types` array).

## Issues Encountered

None beyond the deviations documented above — each was resolved inline before proceeding to the next task.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `lib/theme.ts` and `components/AppearanceControl.tsx` are ready for 01-07 to import and mount on the Profile screen. The plan's own `<human-check>` (switching appearance on iOS/Android/web, confirming restart persistence and no-flash cold start) is explicitly scoped to run once that mounting happens — it is not skippable but is correctly deferred, not missed.
- `jest.config.js` and the `jest-expo`/`jest@29` pairing are now the established test-infrastructure baseline for `apps/mobile` — plan 01-05 depends on this and should not need to redo any of this deviation work.
- The NativeWind token system (`tailwind.config.js`, `global.css`) is the binding styling foundation every later phase inherits; no further changes are anticipated unless a real typography/brand-colour decision supersedes the UI-SPEC's placeholder blue-600/500 accent.
- `pnpm --filter mobile build` (`expo export --platform web`) and `pnpm --filter mobile exec expo start` (Expo Go) both remain green — this plan introduces no dev-client requirement.

## Self-Check: PASSED

---
*Phase: 01-cross-platform-foundation*
*Completed: 2026-08-11*
