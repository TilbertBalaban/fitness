---
status: testing
phase: 01-cross-platform-foundation
source: [01-VERIFICATION.md]
started: 2026-08-14T16:10:00Z
updated: 2026-08-14T16:10:00Z
---

## Current Test

number: 1
name: Sign up, sign in, and reach the same authenticated five-tab home screen on a real iOS simulator/device
expected: |
  Native tab chrome renders (NativeTabs), the authenticated stack shows on first frame,
  Home/Programs/Workout/History/Profile all reachable, identical account/session as the
  browser and Android builds
awaiting: user response

## Tests

### 1. Sign up, sign in, and reach the same authenticated five-tab home screen on a real iOS simulator/device
expected: Native tab chrome renders (NativeTabs), the authenticated stack shows on first frame, Home/Programs/Workout/History/Profile all reachable, identical account/session as the browser and Android builds
result: [pending]

### 2. Sign up, sign in, and reach the same authenticated five-tab home screen on a real Android emulator/device
expected: Same as iOS row above, on Android
result: [pending]

### 3. Sign in on a device, put it in airplane mode, wait, and cold-start the app after a genuinely elapsed multi-week gap (or at minimum an extended offline period)
expected: Authenticated UI renders immediately with no network wait and no sign-out, per D-01/D-02
result: [pending]

### 4. On a real iOS or Android build, confirm the attached cookie header is accepted by the running server and the session row is deleted on explicit sign-out
expected: Same behavior the e2e suite (native-session.e2e-spec.ts) proves over HTTP, now observed on a physical/simulated device
result: [pending]

### 5. Confirm maximum OS accessibility font scale wrap-and-grow behavior (auth fields, tab bar labels, placeholder body copy) on iOS and Android
expected: Long text wraps and containers grow rather than clipping or truncating, per UI-SPEC R1
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
