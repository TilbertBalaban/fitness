---
phase: 01-cross-platform-foundation
plan: 10
subsystem: testing
tags: [jest, nativewind, react-native, expo-router, wr-fix]

requires:
  - phase: 01-cross-platform-foundation
    provides: apps/mobile/lib/theme.ts, apps/mobile/app/(auth)/sign-up.tsx, and the code-review findings (01-REVIEW.md WR-02/WR-03) this plan closes
provides:
  - The appearance regression test (theme.test.ts) now asserts equality against the sentinel this project's pinned React Native version actually produces, and can fail
  - The sign-up duplicate-email error copy is three independent constants in a dependency-free module, with a verbatim assertion against the UI-SPEC sentence
  - docs/native-verification.md — a run recipe and four-item checklist for the human-verification items 01-VERIFICATION.md could not close
affects: [phase-01-verification, phase-01-validation, any-future-phase-needing-a-device]

actuals:
  tokens: 5841
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "jest.spyOn(Platform, 'constants', 'get').mockReturnValue(...) to stub the native-constants getter a library branches on, rather than pinning to whatever the test runner's default mock happens to report"
    - "Copy fragments consumed by both a screen and a lib-level unit test live in a dependency-free lib/ module, not inline in the screen file — screens here import expo-router and better-auth/react (ESM-only, outside this project's jest transformIgnorePatterns), so importing a screen module from a test crashes before any assertion runs"

key-files:
  created:
    - apps/mobile/lib/duplicate-email-copy.ts
    - docs/native-verification.md
  modified:
    - apps/mobile/lib/__tests__/theme.test.ts
    - apps/mobile/app/(auth)/sign-up.tsx
    - apps/mobile/lib/__tests__/auth-forms.test.ts

key-decisions:
  - "WR-02 fix took 01-REVIEW.md's option (b) — stub Platform.constants().reactNativeVersion — after reading react-native-css-interop's appearance-observables.ts source directly and confirming applyAppearance's sentinel choice is nativewind's colorScheme.set branching on Platform.constants?.reactNativeVersion?.minor >= 82, not on anything this project's own code decides"
  - "WR-03's three constants were extracted to a new apps/mobile/lib/duplicate-email-copy.ts rather than left inline in sign-up.tsx, because importing the screen module from auth-forms.test.ts (as the plan directed) crashes the jest run — expo-router's import chain throws on a null scriptURL mock, and even after mocking that out, better-auth/react ships ESM-only and is outside this project's jest transformIgnorePatterns"

patterns-established:
  - "Any future WR fix or copy constant that needs testing from a lib-level unit test, but lives inside a screen under apps/mobile/app/, should be extracted to a dependency-free apps/mobile/lib/ module rather than imported from the screen directly"

requirements-completed: [PLAT-09, PLAT-05, PLAT-01]

coverage:
  - id: D1
    description: "The appearance regression test asserts equality against the sentinel this project's pinned React Native runtime produces (not a permissive membership check), and can fail on a regression to the legacy sentinel"
    requirement: "PLAT-09"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/__tests__/theme.test.ts#setAppearance > writes 'system' and hands Appearance.setColorScheme the resume-OS sentinel so the OS value resumes governing"
        status: pass
      - kind: manual_procedural
        ref: "Manually inverted the assertion to expect(null) and re-ran; observed a failure (Expected: null, Received: \"unspecified\"), then reverted"
        status: pass
    human_judgment: false
  - id: D2
    description: "The sign-up duplicate-email error copy is composed from three independent constants (no runtime .split()), asserted verbatim against the UI-SPEC sentence, with the rendered JSX composition order unchanged"
    requirement: "PLAT-05"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/__tests__/auth-forms.test.ts#sign-up duplicate-email error copy (WR-03) > concatenates the lead, link label, and tail to the UI-SPEC sentence verbatim"
        status: pass
    human_judgment: false
  - id: D3
    description: "docs/native-verification.md gives a runnable recipe and precise, unchecked checklist for the four human-verification items 01-VERIFICATION.md routed to a human, citing the WINDOWS.md ledger entries each would close"
    requirement: "PLAT-01"
    verification:
      - kind: other
        ref: "test -f docs/native-verification.md && grep -c WINDOWS docs/native-verification.md && node checklist-shape assertion (>=4 unchecked boxes, zero checked boxes) — plan's <verify> block, all passed"
        status: pass
    human_judgment: true
    rationale: "The document's actual value — whether a person with a phone can follow it and reach a working app — cannot be assessed by any check runnable in this sandboxed worktree, which has no simulator, emulator, or device. The four checklist items themselves remain open human-verification work; this deliverable is the recipe, not the observation."

duration: ~45min
completed: 2026-08-14
status: complete
---

# Phase 1 Plan 10: Gap Closure — Appearance Test Sentinel, Sign-Up Copy Independence, Native Verification Recipe Summary

**Pinned the appearance regression test to the sentinel nativewind's colorScheme.set actually produces for this project's shipped React Native version, replaced the sign-up duplicate-email copy's runtime `.split()` with three independent constants in their own module, and wrote a run-recipe-plus-checklist for the four device checks phase 1 still owes.**

## Performance

- **Duration:** ~45min (estimated — this executor did not capture a start timestamp before beginning work)
- **Completed:** 2026-08-14T14:45:35Z
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- WR-02 closed: `theme.test.ts`'s appearance regression test now stubs `Platform.constants().reactNativeVersion` to this project's pinned 0.86 and asserts equality (`toBe('unspecified')`) instead of a permissive `['unspecified', null]` membership check. Manually confirmed the test can fail by inverting the expectation to `null` and observing a real failure before reverting.
- WR-03 closed: the sign-up duplicate-email error copy is now three independent flat constants (`DUPLICATE_EMAIL_LEAD`, `DUPLICATE_EMAIL_LINK_LABEL`, `DUPLICATE_EMAIL_TAIL`) with no runtime derivation, living in a new dependency-free `apps/mobile/lib/duplicate-email-copy.ts`, asserted verbatim against the UI-SPEC sentence in `auth-forms.test.ts`.
- `docs/native-verification.md` written: a copy-pasteable run recipe (no dev client or EAS account needed — Phase 1 runs entirely inside Expo Go) and a four-section checklist, one per `01-VERIFICATION.md` `human_verification` entry, each citing the `WINDOWS.md` ledger entries it would let a human close (all seven cited entries — #2, #4, #5, #7, #8, #9, #10 — covered across the four sections).

## Task Commits

Each task was committed atomically:

1. **Task 1: WR-02 — the appearance regression test regains the ability to fail** - `2395484` (test)
2. **Task 2: WR-03 — the duplicate-email sentence stops being derived from itself** - `e4af588` (fix)
3. **Task 3: A device-verification recipe** - `979da2b` (docs)

**Plan metadata:** commit made after this summary is written.

## Files Created/Modified

- `apps/mobile/lib/__tests__/theme.test.ts` - Stubs `Platform.constants().reactNativeVersion` to 0.86 for the `setAppearance` describe block; system-appearance case is now an equality assertion; new case pins the declared react-native minor version at or above 82
- `apps/mobile/app/(auth)/sign-up.tsx` - Imports the three duplicate-email copy constants from the new lib module instead of declaring/deriving them inline; JSX render site unchanged
- `apps/mobile/lib/duplicate-email-copy.ts` - New. Three independent, dependency-free string constants: lead, link label, tail
- `apps/mobile/lib/__tests__/auth-forms.test.ts` - New `describe('sign-up duplicate-email error copy (WR-03)')` block asserting the three constants concatenate to the UI-SPEC sentence
- `docs/native-verification.md` - New. Run recipe + four-section unchecked checklist for the outstanding human-verification items

## Decisions Made

- **WR-02: chose 01-REVIEW.md's option (b)** (stub the platform version) over option (a) (pin the assertion literal). Confirmed by reading `react-native-css-interop`'s `appearance-observables.ts` source directly: `colorScheme.set('system')` calls `appearance.setColorScheme('unspecified')` when `Platform.constants?.reactNativeVersion?.minor >= 82`, else `appearance.setColorScheme(null)`. The branch is entirely inside a dependency, keyed on the platform-reported version — stubbing that version is what makes the test exercise the real sentinel rather than assuming one.
- **WR-03: extracted the three constants to a new file rather than leaving them inline in `sign-up.tsx`** (see Deviations below — this was a Rule 3 blocking-issue fix, not a plan-as-written execution).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `auth-forms.test.ts` cannot import `sign-up.tsx` directly — extracted the three copy constants to a new dependency-free module**
- **Found during:** Task 2 (WR-03 fix)
- **Issue:** The plan directed adding the new duplicate-email test case to `auth-forms.test.ts` importing the three constants from `sign-up.tsx` directly. Doing so crashes the Jest run before any test executes: `sign-up.tsx` imports `Link` from `expo-router`, and importing `expo-router` under this project's jest-expo config throws (`TypeError: Cannot read properties of null (reading 'match')` inside `expo`'s `getDevServer.js`, because the `NativePlatformConstantsIOS`-style mock reports a null `scriptURL`). Mocking `expo-router` around that crash surfaces a second, harder blocker one import deeper: `sign-up.tsx` also imports `@/lib/auth-client`, which imports `better-auth/react` — an ESM-only package outside this project's `transformIgnorePatterns` (`SyntaxError: Cannot use import statement outside a module`). No existing test in this codebase imports a screen file for exactly this reason (confirmed in `01-PATTERNS.md`'s "No Analog Found" section, which had already flagged there is no established convention for testing a file that imports `expo-router` here).
- **Fix:** Extracted `DUPLICATE_EMAIL_LEAD`, `DUPLICATE_EMAIL_LINK_LABEL`, and `DUPLICATE_EMAIL_TAIL` into a new `apps/mobile/lib/duplicate-email-copy.ts` with zero dependencies. `sign-up.tsx` imports the three constants from there instead of declaring them inline; `auth-forms.test.ts` imports directly from the same lib module, never touching the screen file or its heavy import graph. The JSX render site in `sign-up.tsx` is otherwise untouched — confirmed via `git diff` that the composition order (lead, link, tail) is byte-identical to before the refactor.
- **Files modified:** `apps/mobile/lib/duplicate-email-copy.ts` (new), `apps/mobile/app/(auth)/sign-up.tsx`, `apps/mobile/lib/__tests__/auth-forms.test.ts`
- **Verification:** `pnpm --filter mobile test -- auth-forms.test.ts` passes (18/18, the 17 pre-existing plus the new WR-03 case); `pnpm --filter mobile test` passes across all suites (53/53); `pnpm --filter mobile exec tsc --noEmit` exits 0; `pnpm --filter mobile exec expo export --platform web` exits 0 with `/sign-up` and `/(auth)/sign-up` both present in the route list.
- **Committed in:** `e4af588` (Task 2 commit)

**2. [Rule 3 - Blocking] `node_modules` absent in this fresh worktree**
- **Found during:** Start of Task 1, before any test could run
- **Issue:** No `node_modules` present anywhere in the worktree (same as the precedent documented in `01-06-SUMMARY.md`'s Issues Encountered).
- **Fix:** `pnpm install --frozen-lockfile` at the repo root. No lockfile change; install completed cleanly (1197 packages, one benign postinstall for `unrs-resolver`).
- **Files modified:** None (install only, no manifest/lockfile changes)
- **Verification:** All subsequent `pnpm --filter mobile test`/`tsc`/`expo export` invocations ran successfully
- **Committed in:** N/A — no repo changes from the install itself

---

**Total deviations:** 2 auto-fixed (1 blocking-import restructure, 1 blocking environment setup)
**Impact on plan:** The `duplicate-email-copy.ts` extraction is a structural change beyond what the plan's file list named, but it is minimal (3 constants, zero new dependencies), stays fully within WR-03's own intent (independent, non-derived constants), and was required to make Task 2's acceptance criteria achievable at all under this project's actual jest configuration. No scope creep beyond that one file.

## Issues Encountered

None beyond the two deviations above.

## User Setup Required

None - no external service configuration required. `docs/native-verification.md` itself requires a human with a phone/simulator and Expo Go to actually perform the four checklist items — that is the human-verification work this plan was scoped to make *possible*, not to *perform*.

## Next Phase Readiness

- WR-02 and WR-03 are closed; `01-REVIEW.md` has no remaining open warnings from this pass.
- `docs/native-verification.md` exists and is ready to be worked through in one sitting. All seven cited `WINDOWS.md` ledger entries (#2, #4, #5, #7, #8, #9, #10) remain `open` — this plan makes them cheaper to close, and closes none of them itself. A future session with an actual device should run through the checklist and update `WINDOWS.md` via `gsd-tools windows fixed <id>` per item closed.
- `apps/mobile/lib/duplicate-email-copy.ts` is a new, small, reusable pattern: any future copy that needs to be both rendered by a screen and unit-tested from `lib/__tests__/` should follow this same shape (dependency-free constants module) rather than importing the screen.

## Self-Check: PASSED

- FOUND: `apps/mobile/lib/duplicate-email-copy.ts`
- FOUND: `docs/native-verification.md`
- FOUND: `.planning/phases/01-cross-platform-foundation/01-10-SUMMARY.md`
- FOUND commit: `2395484`
- FOUND commit: `e4af588`
- FOUND commit: `979da2b`

---
*Phase: 01-cross-platform-foundation*
*Completed: 2026-08-14*
