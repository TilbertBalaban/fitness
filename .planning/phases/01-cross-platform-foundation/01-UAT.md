---
status: complete
phase: 01-cross-platform-foundation
source: [01-VERIFICATION.md]
started: 2026-08-14T16:10:00Z
updated: 2026-08-19T00:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Sign up via the UI lands on the authenticated five-tab shell (web)
expected: Sign-up completes, `better-auth.session_token` is set, authenticated shell renders with zero console errors
result: pass
source: web-target run 2026-08-14 (Playwright/Chromium vs live Expo web + NestJS + Postgres)

### 2. All five tabs render (web)
expected: Home, Programs, Workout, History, Profile all present in the tab bar
result: pass
source: web-target run 2026-08-14

### 3. Sign in with the same account reaches the same authenticated shell (web)
expected: Same authenticated five-tab shell; a new session row is created server-side
result: pass
source: web-target run 2026-08-14

### 4. Tabs are real deep-linkable URLs with working back/forward (web)
expected: `/programs`, `/workout`, `/history`, `/profile` are addressable; direct load of `/history` renders
result: pass
source: web-target run 2026-08-14

### 5. Session survives a full cold reload (web)
expected: Authenticated shell renders after a hard reload with no re-authentication
result: pass
source: web-target run 2026-08-14

### 6. API origin unreachable renders sign-in provisionally without destroying the session (web)
expected: Per UI-SPEC R2 sign-in renders provisionally; cookie and server session row are both left intact (D-03)
result: pass
source: web-target run 2026-08-14

### 7. Recovery once the API returns (web)
expected: Authenticated shell swaps back in on `focus`/`visibilitychange`/`online`, and on a plain reload. No timer-based self-heal is scheduled, which matches the design
result: pass
source: web-target run 2026-08-14

### 8. Wrap-and-grow at 320px and 480px (web)
expected: Tab bar wraps to 3 rows and grows; zero horizontal overflow; no clipping or truncation (UI-SPEC R1)
result: pass
source: web-target run 2026-08-14

### 9. Sign-out revokes the session server-side (web)
expected: Postgres session rows drop 4→3, cookie jar emptied, redirected to sign-in
result: pass
source: web-target run 2026-08-14

### 10. Protected route unreachable after sign-out, and light/dark switching persists (web)
expected: `/` redirects to sign-in after sign-out; PLAT-09 Dark applies and survives a full reload
result: pass
source: web-target run 2026-08-14

### 11. Sign up, sign in, and reach the same authenticated five-tab home screen on a real iOS simulator/device
expected: Native tab chrome renders (NativeTabs), the authenticated stack shows on first frame, Home/Programs/Workout/History/Profile all reachable, identical account/session as the browser and Android builds
result: skipped
reason: "Deferred follow-up: user decision 2026-08-19 — all native (iOS + Android) verification is deferred to the final native verification sweep, Phase 999.1. Environment re-checked 2026-08-19 and still has no iOS toolchain (xcode-select → /Library/Developer/CommandLineTools, no Xcode.app, `xcrun simctl` unavailable), so this checkpoint cannot be run on this machine. Automated evidence stands: mobile suite 86/86 pass, `tsc --noEmit` exit 0. Neither renders native UI."

### 12. Sign up, sign in, and reach the same authenticated five-tab home screen on a real Android emulator/device
expected: Same as iOS row above, on Android
result: skipped
reason: "Deferred follow-up: user decision 2026-08-15 — all Android verification is deferred to the final phase and will be performed in one pass once every phase is built. Tracked as Phase 999.1 in ROADMAP.md Backlog. (Environment state re-confirmed 2026-08-19: no ~/Library/Android/sdk, `adb` not on PATH, no emulator image, no attached device.)"

### 13. Sign in on a device, put it in airplane mode, wait, and cold-start the app after a genuinely elapsed multi-week gap (or at minimum an extended offline period)
expected: Authenticated UI renders immediately with no network wait and no sign-out, per D-01/D-02
result: skipped
reason: "Deferred follow-up: user decision 2026-08-19 — deferred to Phase 999.1. Requires a real device, real OS-level network loss, and genuinely elapsed time — none producible on this machine. session-refresh.test.ts still proves the classification logic in isolation (part of the 86/86 pass), but does not exercise the OS cold-start/network-loss path."

### 14. On a real iOS or Android build, confirm the attached cookie header is accepted by the running server and the session row is deleted on explicit sign-out
expected: Same behavior the e2e suite (native-session.e2e-spec.ts) proves over HTTP, now observed on a physical/simulated device
result: skipped
reason: "Deferred follow-up: user decision 2026-08-19 — the device-level half is deferred to Phase 999.1. The HTTP-level backstop is independently green: `pnpm --filter api test:e2e` against live Postgres — 5 suites / 22 tests pass, including native-session.e2e-spec.ts. Only the on-device observation is outstanding."

### 15. Confirm maximum OS accessibility font scale wrap-and-grow behavior (auth fields, tab bar labels, placeholder body copy) on iOS and Android
expected: Long text wraps and containers grow rather than clipping or truncating, per UI-SPEC R1
result: skipped
reason: "Deferred follow-up: user decision 2026-08-19 — both halves now deferred to Phase 999.1 (the Android half was already deferred 2026-08-15). Requires setting OS accessibility text size on a simulator/device; no toolchain installed. Web-viewport approximation was performed in a prior pass (WINDOWS.md #9) and is explicitly not accepted as equivalent by 01-VERIFICATION.md."

## Summary

total: 15
passed: 10
issues: 0
pending: 0
skipped: 5
blocked: 0

## Gaps

<!-- No gaps: all outstanding items are prerequisite/environment gates deferred to Phase 999.1, not code defects. -->

## Deferred Follow-Ups

- test: 11
  idea: "iOS sign-up/sign-in reaching the authenticated five-tab home screen — deferred to the Phase 999.1 native verification sweep."
  deferred_at: 2026-08-19
- test: 12
  idea: "Android verification deferred to the final phase — test the Android app once every phase is built, in a single pass. Tracked as Phase 999.1 in ROADMAP.md Backlog."
  deferred_at: 2026-08-15
- test: 13
  idea: "Offline cold-start after a genuinely elapsed multi-week gap on a real device — deferred to Phase 999.1."
  deferred_at: 2026-08-19
- test: 14
  idea: "On-device cookie acceptance and sign-out session-row deletion — deferred to Phase 999.1; HTTP-level e2e backstop already green."
  deferred_at: 2026-08-19
- test: 15
  idea: "Maximum OS accessibility font-scale wrap-and-grow on iOS and Android — deferred to Phase 999.1 (Android half deferred 2026-08-15, iOS half 2026-08-19)."
  deferred_at: 2026-08-19

## Web-Target Verification

Driven with Playwright/Chromium against `expo start --web` (localhost:8081) + NestJS API
(localhost:3000) + live Postgres, 2026-08-14. This is the **web half** of the phase goal only —
it does NOT close tests 11-15 above, which are native-device by construction and are deferred to
Phase 999.1. Tests 1-10 above are these same checks promoted to structured UAT entries; the table
below is retained as the run's evidence detail.

| # | Web check | Result |
|---|-----------|--------|
| W1 | Sign up via UI → lands on authenticated five-tab shell | pass — `better-auth.session_token` set, 0 console errors |
| W2 | Home/Programs/Workout/History/Profile all render | pass — all five present in web tab bar |
| W3 | Sign in with the same account → same authenticated shell | pass — new session row created server-side |
| W4 | Tabs are real deep-linkable URLs; back/forward work | pass — `/programs`, `/workout`, `/history`, `/profile`; direct load of `/history` renders |
| W5 | Session survives a full cold reload | pass — authenticated shell renders, no re-auth |
| W6 | API origin unreachable (device-offline analog) | pass — renders sign-in *provisionally* per UI-SPEC R2; cookie and server session row both left intact (D-03 respected) |
| W6b | Recovery once the API returns | pass — shell swaps back in on `focus`/`visibilitychange`/`online`; a plain reload also restores. Does not self-heal on a timer alone (no retry is scheduled), which matches the design |
| W7 | Wrap-and-grow at 320px / 480px | pass — tab bar wraps to 3 rows and grows; zero horizontal overflow; no clipping or truncation |
| W8 | Sign-out revokes the session server-side | pass — session rows 4→3 in Postgres, cookie jar emptied, redirected to sign-in |
| W9 | Protected route unreachable after sign-out | pass — `/` redirects to sign-in |
| W10 | PLAT-09 light/dark switching | pass — Dark applies and persists across a full reload |

Test accounts created during this run were deleted from Postgres afterward.
