---
phase: 05-in-gym-session-logging
plan: 05
subsystem: ui

tags: [expo-notifications, react-native, expo-router, rest-timer, notifications, drizzle-orm]

requires:
  - phase: 05-in-gym-session-logging
    provides: "05-01's workout.tsx screen, SetRow/ExerciseStrip/ExercisePager component set, and useWorkoutScreen hook this plan mounts the header bar and rest-scheduling logic into"
  - phase: 05-in-gym-session-logging
    provides: "05-02's workout_session.paused_at/accumulated_paused_seconds/rest_target_at and logged_set.rest_taken_seconds columns"
provides:
  - "rest-timer.ts: pure wall-clock arithmetic (remainingSeconds, restTargetFrom, elapsedWorkoutSeconds, formatClock, REST_EXTEND_SECONDS) with no clock read except as a defaulted argument"
  - "rest-alert.ts / rest-alert.web.ts: the D-08 platform-split alert seam — six identical exported names, expo-notifications DATE-trigger scheduling on native, setTimeout + visibilitychange re-arm on web, both with a memoized post-denial no-op"
  - "RestTimerBar / RestTimerFullScreen: the persistent header duration+rest bar and the full-screen extend/skip/at-zero countdown view"
  - "NotificationPermissionPrompt / BackgroundAlertsOffNote: D-22's onboarding rationale and D-23's degraded-state note"
affects: [05-06, 05-07, 05-08, 05-09, 05-10]

actuals:
  tokens: 20264
  tasks: 3
  commits: 2

tech-stack:
  added: [expo-notifications@~57.0.14]
  patterns:
    - "Platform-split alert seam (rest-alert.ts / rest-alert.web.ts) with zero Platform.OS branches — D-08's .web.ts sibling convention applied to a genuinely new native-capability boundary."
    - "One-second re-render tick lives inside the stateful *Bar/*FullScreen wrapper only — every displayed number is recomputed fresh from Date.now() against a stored timestamp on every tick, never carried in the tick's own state."
    - "SessionScreenMode threaded as an explicit hook argument (not read via useSessionMode()) when the hook's own render happens outside the provider it creates — same single-typed-value gating, different plumbing."

key-files:
  created:
    - apps/mobile/lib/rest-timer.ts
    - apps/mobile/lib/rest-alert.ts
    - apps/mobile/lib/rest-alert.web.ts
    - apps/mobile/lib/__tests__/rest-timer.test.ts
    - apps/mobile/lib/__tests__/rest-alert.test.ts
    - apps/mobile/components/RestTimerBar.tsx
    - apps/mobile/components/RestTimerFullScreen.tsx
    - apps/mobile/components/NotificationPermissionPrompt.tsx
    - apps/mobile/components/__tests__/RestTimerBar.test.tsx
    - apps/mobile/app/rest-timer.tsx
    - apps/mobile/e2e/rest-timer.spec.ts
  modified:
    - apps/mobile/package.json
    - apps/mobile/app.json
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/app/(tabs)/__tests__/workout.test.tsx
    - apps/mobile/lib/db/session-query.ts
    - apps/mobile/playwright.config.ts
    - docs/platform-modules.md
    - pnpm-lock.yaml
    - pnpm-workspace.yaml

key-decisions:
  - "Task 1's package-legitimacy checkpoint was pre-resolved by the orchestrator before dispatch (registry repository field, weekly downloads, absence of install scripts, 57.x SDK-train version pin all confirmed) — installed expo-notifications ~57.0.14 with no re-audit."
  - "startRest/clearRest-shaped writes (the plan's own phrasing) were implemented as inline Drizzle .update() calls at the call sites (workout.tsx's completion/undo handlers, app/rest-timer.tsx's extend/skip handlers), not as two new named functions inside rest-timer.ts — rest-timer.ts must stay a pure, DB-free module per Task 2's own contract, and lib/db/log-set.ts is explicitly out of scope this plan (05-06 owns it)."
  - "mode: SessionScreenMode is threaded into useWorkoutScreen as an explicit argument rather than read via useSessionMode() — the hook's render happens inside WorkoutScreen, the component that CREATES <SessionModeProvider>, so the context it provides is structurally unreachable from that call site. Threading the same typed value as an argument satisfies R10's single-source-of-truth gating identically; only the plumbing differs."
  - "The rest column's dormant/active tone is derived purely from remainingSeconds(target, now) > 0 on every tick — no explicit 'clear rest_target_at at zero' write exists. D-26's 'stops and clears at zero' is satisfied structurally: remainingSeconds already clamps to 0 for a past target regardless of what the DB still holds, and the next set's restTargetFrom call overwrites any stale value. Nothing observable differs from an explicit clear-at-zero write."
  - "sessionId and the initial rest target arrive at app/rest-timer.tsx as route params rather than a fresh DB read on mount — the caller (workout.tsx) already holds this exact state in memory, so the full-screen route renders its true value on the first frame with no loading state (R6)."

patterns-established:
  - "rest_taken_seconds (existed since 05-02, never written before this plan) is backfilled lazily: when a NEW set completes while a rest target is outstanding, the previous session-wide most-recently-completed set (not scoped to one exercise — D-26's rest is one-per-session) gets its actual elapsed rest written, independent of the prescribed target."

requirements-completed: [LOG-08, LOG-09, LOG-10, LOG-11]

coverage:
  - id: D1
    description: "remainingSeconds/restTargetFrom/elapsedWorkoutSeconds/formatClock are pure, fully unit-tested, with no ambient clock read anywhere but a defaulted argument"
    requirement: "LOG-08"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/__tests__/rest-timer.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "rest-alert.ts / rest-alert.web.ts export the same six function names with zero Platform.OS branches; native cancels before scheduling so exactly one alert is ever pending, and memoizes a denial so requestAlertPermission never re-prompts"
    requirement: "LOG-08"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/__tests__/rest-alert.test.ts"
        status: pass
      - kind: other
        ref: "grep -vE '^\\s*(//|\\*|/\\*)' apps/mobile/lib/rest-alert.ts apps/mobile/lib/rest-alert.web.ts | grep -c 'Platform' -> 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "RestTimerBar renders duration+rest in a fixed two-column layout, dormant rest at 0:00 muted, paused duration frozen and muted, no urgency-color escalation between 5s and 60s remaining, past-one-hour duration in H:MM:SS"
    requirement: "LOG-11"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/RestTimerBar.test.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "Completing a set writes workout_session.rest_target_at from the snapshot target and schedules exactly one alert; the previous set's logged_set.rest_taken_seconds is backfilled; undo cancels the alert when the undone set owns the outstanding rest; every scheduling call site gates on the typed session-mode value, never session.status"
    requirement: "LOG-08, LOG-10"
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/workout.test.tsx (existing suite, extended fixtures, all 35 cases pass against the new wiring)"
        status: pass
      - kind: other
        ref: "grep -c 'session.status ===' apps/mobile/app/(tabs)/workout.tsx -> 0; scheduleRestAlert has exactly one call site, inside the mode === 'live' branch"
        status: pass
    human_judgment: false
  - id: D5
    description: "app/rest-timer.tsx full-screen route: 64px centered countdown, +30s/Skip Rest pair replaced by a single Back to Workout CTA at zero, dismiss returns without altering the timer"
    requirement: "LOG-10"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/rest-timer.spec.ts (written, not executed)"
        status: unknown
    human_judgment: true
    rationale: "Playwright e2e was written against the real durability harness and a stubbed Notification constructor + page.clock, but this session's CLAUDE.md forbids launching a browser or running browser/e2e suites unless explicitly requested. Needs a human or CI run of pnpm --filter mobile test:e2e:durability -- rest-timer.spec.ts."
  - id: D6
    description: "NotificationPermissionPrompt (D-22 onboarding rationale) and BackgroundAlertsOffNote (D-23 degraded-state note) render the Copywriting Contract's copy verbatim and are wired into the pre-session/live workout states respectively, gated on getAlertPermission()'s current value"
    requirement: "LOG-09"
    verification:
      - kind: other
        ref: "apps/mobile/components/NotificationPermissionPrompt.tsx contains both body strings verbatim (confirmed by direct read-back against 05-UI-SPEC.md's Copywriting Contract)"
        status: pass
    human_judgment: false
  - id: D7
    description: "The native background/lock-screen half of LOG-09 (a scheduled expo-notifications alert actually firing while the app is fully backgrounded and the phone is locked) cannot be observed on this machine (no Xcode, no Android SDK) and is filed as a WINDOWS.md unrun-verify entry against Phase 999.1, not claimed as verified"
    requirement: "LOG-09"
    verification: []
    human_judgment: true
    rationale: "Device-only claim, structurally unverifiable in this environment per D-10 — filed rather than assumed, matching RESEARCH.md Pitfall 4's explicit warning against treating typecheck-plus-web-e2e as equivalent to verified."

duration: 2h10m
completed: 2026-08-24
status: complete
---

# Phase 5 Plan 5: Rest Timer & Header Timer Bar Summary

**A wall-clock-timestamp rest timer (never a JS interval) with a platform-split expo-notifications/browser-Notification alert seam, a persistent header duration+rest bar, a full-screen extend/skip countdown, and honest permission surfaces that degrade to a working in-app countdown when notifications are denied.**

## Performance

- **Duration:** ~2h10m
- **Tasks:** 3 (Task 1 checkpoint pre-resolved by the orchestrator, Tasks 2-3 auto)
- **Files modified:** 21 (11 created, 10 modified)

## Accomplishments

- `expo-notifications` installed at `~57.0.14`, pinned to the SDK-57 train, config plugin registered in `app.json` — a prebuild-affecting change this machine cannot build (D-10), documented rather than attempted.
- `lib/rest-timer.ts`: `remainingSeconds`, `restTargetFrom`, `elapsedWorkoutSeconds`, `formatClock`, `REST_EXTEND_SECONDS` — pure, fully unit-tested (24 cases), matching `next-up.ts`'s no-clock-read contract exactly.
- `lib/rest-alert.ts` / `lib/rest-alert.web.ts`: the D-08 platform seam, six identical exported names, zero `Platform.OS` branches. Native schedules through `expo-notifications`' typed `DATE` trigger and registers the foreground-notification handler; web schedules via `setTimeout` re-armed on every `visibilitychange` against the stored wall-clock target. Both memoize a denial so `requestAlertPermission` never re-prompts once refused.
- `RestTimerBar`/`RestTimerBarView`: the persistent header bar — duration counting up, rest counting down, dormant-but-present at `0:00` between sets, paused state freezes the duration readout for free via `elapsedWorkoutSeconds`'s own open-pause math.
- `RestTimerFullScreen`/`RestTimerFullScreenView` + `app/rest-timer.tsx`: the full-screen countdown route, 64px centered numeral, +30s/Skip Rest replaced by a single Back to Workout CTA at zero.
- `NotificationPermissionPrompt`/`BackgroundAlertsOffNote`: D-22's onboarding rationale and D-23's degraded-state note, copy verbatim from the UI-SPEC.
- `workout.tsx` wired end to end: completing a set writes `rest_target_at`, schedules the alert, and backfills the previous set's `rest_taken_seconds` (a column that existed since 05-02 and had never been written); undo cancels the alert when the undone set owns the outstanding rest; every scheduling call site gates on the typed session-mode value.
- `docs/platform-modules.md` and `.planning/WINDOWS.md` updated; the native background/lock-screen delivery gap filed against Phase 999.1 rather than claimed as verified.

## Task Commits

1. **Task 1 (checkpoint, pre-resolved) + Task 2: Install expo-notifications, build the pure timing math and platform-split alert seam** - `baf243c` (feat)
2. **Task 3: Header timer bar, full-screen countdown, permission surfaces** - `4b3c0e6` (feat)

**Plan metadata:** _pending — this commit_

## Files Created/Modified

- `apps/mobile/lib/rest-timer.ts` - pure timing arithmetic (duration, rest countdown, formatting)
- `apps/mobile/lib/rest-alert.ts` / `apps/mobile/lib/rest-alert.web.ts` - platform-split alert scheduling seam
- `apps/mobile/lib/__tests__/rest-timer.test.ts`, `apps/mobile/lib/__tests__/rest-alert.test.ts` - unit coverage for both
- `apps/mobile/components/RestTimerBar.tsx` - header duration+rest bar
- `apps/mobile/components/RestTimerFullScreen.tsx` - full-screen countdown view
- `apps/mobile/components/NotificationPermissionPrompt.tsx` - onboarding rationale + degraded-state note
- `apps/mobile/components/__tests__/RestTimerBar.test.tsx` - direct-invocation unit tests
- `apps/mobile/app/rest-timer.tsx` - the full-screen route, owns extend/skip DB writes
- `apps/mobile/app/(tabs)/workout.tsx` - mounts the header bar/prompts, wires set-completion and undo to rest scheduling
- `apps/mobile/app/(tabs)/__tests__/workout.test.tsx` - fixtures/props extended for the new wiring
- `apps/mobile/lib/db/session-query.ts` - `LiveSessionRow` gains `pausedAt`/`accumulatedPausedSeconds`/`restTargetAt`
- `apps/mobile/e2e/rest-timer.spec.ts` - written, not executed
- `apps/mobile/playwright.config.ts` - registered `rest-timer.spec.ts` and the previously-unregistered `workout-screen.spec.ts`
- `docs/platform-modules.md` - Notifications row now records the observed rest-alert split
- `apps/mobile/package.json`, `apps/mobile/app.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` - dependency install

## Decisions Made

See `key-decisions` in frontmatter — package-legitimacy pre-resolution, the `startRest`/`clearRest` inline-write interpretation, `mode` threaded as an explicit hook argument, the structural (not explicit-write) satisfaction of "stops and clears at zero," and route-param-sourced initial state for the full-screen route.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `LiveSessionRow` extended with `pausedAt`/`accumulatedPausedSeconds`/`restTargetAt`**
- **Found during:** Task 3
- **Issue:** Task 3's `<files>` list does not name `apps/mobile/lib/db/session-query.ts`, but the header bar's own done criteria ("duration derives from `started_at`... rest from D-21's stored timestamp") cannot be met without the raw session row exposing the pause and rest-target columns 05-02 already added to the schema.
- **Fix:** Added the three fields to `LiveSessionRow` and the `loadSessionTree` select. `session-query.ts` is owned by 05-01 (merged, wave 1) and not claimed by any concurrent wave-2 plan.
- **Files modified:** `apps/mobile/lib/db/session-query.ts`
- **Verification:** `pnpm --filter mobile test -- --testPathPattern session-query` — 22/22 pass, no regression (the fake test db ignores the select's field map, so undefined-valued keys on the fixture rows compare equal under Jest's `toEqual`).
- **Committed in:** `4b3c0e6`

**2. [Rule 3 - Blocking] Registered `rest-timer.spec.ts` (and the pre-existing, never-registered `workout-screen.spec.ts`) in `playwright.config.ts`'s `durability` project `testMatch`**
- **Found during:** Task 3, writing the e2e spec
- **Issue:** `playwright.config.ts`'s `durability` project names an explicit `testMatch` file list that omitted both `workout-screen.spec.ts` (a 05-01 gap) and, necessarily, the new `rest-timer.spec.ts`. Without this, this plan's own `<verify>` command (`pnpm --filter mobile test:e2e:durability -- rest-timer.spec.ts`) would match zero tests.
- **Fix:** Added both filenames to the `durability` project's `testMatch` array.
- **Files modified:** `apps/mobile/playwright.config.ts`
- **Verification:** Config change only, structurally minimal; not run this session (browser-launch restriction).
- **Committed in:** `4b3c0e6`

**3. [Rule 3 - Blocking] Built `@fitness/api-contracts` (`pnpm build`)**
- **Found during:** Task 2, first typecheck run
- **Issue:** `Cannot find module '@fitness/api-contracts'` — the workspace package had no `dist/` output in this fresh worktree, matching 05-01/05-02's documented precedent.
- **Fix:** Ran `pnpm build` inside `packages/api-contracts` (build step, no code change).
- **Verification:** `pnpm --filter mobile typecheck` exits 0.

**4. [Not a code deviation — tooling note] WINDOWS.md ids landed at 110-111, not the plan's pre-reserved 143-152 courtesy range**
- **Found during:** Task 3, filing the unrun-verify entries
- **Issue:** `gsd-tools windows append` assigns dense sequential ids (`max(existing) + 1`) with no manual-override flag; by the time this plan appended, the ledger already held 109 entries from 05-01/05-02's work, so 110/111 were the correct next ids.
- **Fix:** None needed — the tool's centralized, collision-proof assignment supersedes the plan's pre-reservation, which was a courtesy estimate against an earlier ledger state.
- **Files modified:** `.planning/WINDOWS.md`

---

**Total deviations:** 4 (1 missing-critical addition, 2 blocking fixes, 1 tooling note — no code change)
**Impact on plan:** All code-affecting deviations were necessary for this plan's own stated `<done>` criteria or verify command to actually be true. No scope creep beyond what Task 3's acceptance criteria already required.

## Issues Encountered

- `Notifications.scheduleNotificationAsync`'s content `sound` field type is `boolean | 'default' | 'defaultCritical' | 'defaultRingtone' | (string & {})`, not the bare string union assumed from a quick read of the plan text — confirmed against the installed package's own `.d.ts` before writing `playInAppRestAlert`'s `sound: true`.
- `PermissionStatus`'s three string values (`'granted' | 'undetermined' | 'denied'`) already match `AlertPermission`'s literal shape one-for-one, but TypeScript's nominal enum typing still requires an explicit `switch`/cast rather than a structural assignment — used an explicit `switch` in `rest-alert.ts` for clarity and to guard against a future enum-value change silently breaking the mapping.
- The rest-alert unit test's first draft mocked `react-native` wholesale (`jest.mock('react-native', () => ({...}))`), which crashed on `mockComponent.js`'s eager evaluation of RN's lazily-defined component getters during `jest.requireActual`'s spread. Fixed by not mocking `react-native` at all — none of the four test cases exercise `openAlertSettings` (the only `Linking` call site), so the real, already-jest-preset-mocked module is fine as-is.
- The same test file's dynamic `await import('../rest-alert')` (used to get a fresh module instance per test via `jest.resetModules()`) threw `TypeError: A dynamic import callback was invoked without --experimental-vm-modules` under this project's CJS-targeted babel-jest transform — switched to a plain `require()` helper, which correctly re-evaluates module-level state after `jest.resetModules()`.

## User Setup Required

None — no external service configuration required. The `expo-notifications` config-plugin registration in `app.json` requires a fresh dev-client build to actually exercise anything native; this machine has no Xcode/Android SDK to produce one (D-10), documented as a known follow-up rather than attempted.

## Next Phase Readiness

- The rest timer's arithmetic, alert seam, header bar, full-screen view and permission surfaces are all built, unit-tested (1042/1042 mobile tests passing, 6 new RestTimerBar cases, 4 new rest-alert cases, 24 new rest-timer cases), typechecked, and the web build (`pnpm --filter mobile build`) resolves the `.web.ts` sibling cleanly.
- **Blocker for full confidence:** `pnpm --filter mobile test:e2e:durability -- rest-timer.spec.ts` was never executed this session — CLAUDE.md forbids launching a browser unless explicitly requested. A human or CI run is needed before D5's coverage item can be marked `pass`. The native background/lock-screen half of LOG-09 additionally requires a real iOS/Android device (D-10) — see WINDOWS.md entries 110-111.
- `apps/mobile/app/(tabs)/workout.tsx`'s `editing`/`summary-correction` `SessionScreenMode` values are still unimplemented (no UI reaches them yet) — `headerTimer`/`showNotificationPrompt`/`showBackgroundAlertsOffNote` are already structurally null/false whenever `mode !== 'live'`, so a later plan wiring `editing` mode inherits the correct "unreachable, not merely inactive" behavior (D-32) with no further change to this plan's files.
- No blockers for 05-06 (action bar / warm-up / targets / note), which composes into `ExercisePage`'s already-reserved `actionBarSlot` and does not touch any file this plan owns.

## Self-Check: PASSED

- FOUND: apps/mobile/lib/rest-timer.ts
- FOUND: apps/mobile/lib/rest-alert.ts
- FOUND: apps/mobile/lib/rest-alert.web.ts
- FOUND: apps/mobile/components/RestTimerBar.tsx
- FOUND: apps/mobile/components/RestTimerFullScreen.tsx
- FOUND: apps/mobile/components/NotificationPermissionPrompt.tsx
- FOUND: apps/mobile/app/rest-timer.tsx
- FOUND: apps/mobile/e2e/rest-timer.spec.ts
- FOUND: commit baf243c
- FOUND: commit 4b3c0e6

---
*Phase: 05-in-gym-session-logging*
*Completed: 2026-08-24*
