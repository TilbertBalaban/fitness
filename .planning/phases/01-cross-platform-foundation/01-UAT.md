---
status: partial
phase: 01-cross-platform-foundation
source: [01-VERIFICATION.md]
started: 2026-08-14T16:10:00Z
updated: 2026-08-14T17:05:00Z
---

## Current Test

[testing paused — 5 items outstanding]

## Tests

### 1. Sign up, sign in, and reach the same authenticated five-tab home screen on a real iOS simulator/device
expected: Native tab chrome renders (NativeTabs), the authenticated stack shows on first frame, Home/Programs/Workout/History/Profile all reachable, identical account/session as the browser and Android builds
result: blocked
blocked_by: physical-device
reason: "No iOS toolchain on this machine — xcode-select points at /Library/Developer/CommandLineTools, no Xcode.app installed, so `xcrun simctl` is unavailable and no simulator can be booted. Automated evidence re-run instead: mobile suite 86/86 pass, `tsc --noEmit` exit 0. Neither renders native UI."

### 2. Sign up, sign in, and reach the same authenticated five-tab home screen on a real Android emulator/device
expected: Same as iOS row above, on Android
result: blocked
blocked_by: physical-device
reason: "No Android toolchain — no ~/Library/Android/sdk, `adb` not on PATH, no emulator image, no attached device. Same automated evidence as row 1; no native render observed."

### 3. Sign in on a device, put it in airplane mode, wait, and cold-start the app after a genuinely elapsed multi-week gap (or at minimum an extended offline period)
expected: Authenticated UI renders immediately with no network wait and no sign-out, per D-01/D-02
result: blocked
blocked_by: physical-device
reason: "Requires a real device, real OS-level network loss, and genuinely elapsed time — none producible here. session-refresh.test.ts still proves the classification logic in isolation (part of the 86/86 pass), but does not exercise the OS cold-start/network-loss path."

### 4. On a real iOS or Android build, confirm the attached cookie header is accepted by the running server and the session row is deleted on explicit sign-out
expected: Same behavior the e2e suite (native-session.e2e-spec.ts) proves over HTTP, now observed on a physical/simulated device
result: blocked
blocked_by: physical-device
reason: "HTTP-level backstop independently re-run and green this session: `pnpm --filter api test:e2e` against live Postgres — 5 suites / 22 tests pass, including native-session.e2e-spec.ts. The device-level half of the checkpoint is unmet: no iOS/Android build can be installed or run here."

### 5. Confirm maximum OS accessibility font scale wrap-and-grow behavior (auth fields, tab bar labels, placeholder body copy) on iOS and Android
expected: Long text wraps and containers grow rather than clipping or truncating, per UI-SPEC R1
result: blocked
blocked_by: physical-device
reason: "Requires setting OS accessibility text size on a native device. Web-viewport approximation was already performed in a prior pass (WINDOWS.md #9) and is explicitly not accepted as equivalent by 01-VERIFICATION.md."

## Summary

total: 5
passed: 0
issues: 0
pending: 0
skipped: 0
blocked: 5

## Gaps

<!-- No gaps: all outstanding items are prerequisite/environment gates, not code defects. -->

## Web-Target Verification

Driven with Playwright/Chromium against `expo start --web` (localhost:8081) + NestJS API
(localhost:3000) + live Postgres, 2026-08-14. This is the **web half** of the phase goal only —
it does NOT close tests 1-5 above, which are native-device by construction and remain blocked.

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
