---
phase: 05-in-gym-session-logging
plan: 08
subsystem: ui
status: complete
tags: [react-native, expo-router, drizzle-orm, powersync, sqlite, pr-rules]

requires:
  - phase: 05-in-gym-session-logging
    provides: personal_record schema and PR_TYPES vocabulary (05-02), personal_record sync apply path (05-03)
  - phase: 05-in-gym-session-logging
    provides: detectPrs / foldPriorBest / emptyPriorBest / estimated1RM from @fitness/pr-rules (05-04)
  - phase: 05-in-gym-session-logging
    provides: finishSession and the session lifecycle (05-07)
provides:
  - loadSessionSummary — one aggregate read assembling what was trained, per-exercise breakdown and estimated 1RM
  - detectPrsForSession / loadPriorBestByExercise / logPersonalRecord — the PR write path, rules imported not reimplemented
  - computeSessionPrTypesBySetId / loadSessionPersonalRecords — per-set PR lookup for the summary
  - WorkoutSummary component and the /workout-summary route, with every number correctable before dismissal
affects: [05-10 (edit-a-past-session reuses the summary's correction path), phase-999.1 (native/e2e sweep)]

actuals:
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "PR rules imported wholesale from @fitness/pr-rules (D-30) — the mobile app contributes data loading only, never a local copy of the rules"
    - "finishSession routes to /workout-summary?sessionId=… rather than rendering the summary inline, so the summary is a real addressable route on web"

key-files:
  created:
    - apps/mobile/lib/db/personal-record.ts
    - apps/mobile/lib/db/summary-query.ts
    - apps/mobile/lib/db/__tests__/personal-record.test.ts
    - apps/mobile/lib/db/__tests__/summary-query.test.ts
    - apps/mobile/components/WorkoutSummary.tsx
    - apps/mobile/components/__tests__/WorkoutSummary.test.tsx
    - apps/mobile/app/workout-summary.tsx
    - apps/mobile/e2e/workout-summary.spec.ts
  modified:
    - apps/mobile/lib/session/finish-session.ts
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/app/__durability.web.tsx

requirements-completed: [LOG-18, LOG-19]
---

# Plan 05-08 — Workout Summary

Finishing a workout now lands on a real summary route: what was trained, which records
were beaten, and a per-exercise breakdown with estimated 1RM — with every number still
correctable before the summary is dismissed.

## What was built

- **`apps/mobile/lib/db/personal-record.ts`** — the PR write path. `detectPrsForSession`
  folds each exercise's prior history with `foldPriorBest` and evaluates every completed
  working set with `detectPrs`, both imported from `@fitness/pr-rules`. `logPersonalRecord`
  persists the detected rows; `loadPriorBestByExercise`, `computeSessionPrTypesBySetId` and
  `loadSessionPersonalRecords` serve the read side.
- **`apps/mobile/lib/db/summary-query.ts`** — `loadSessionSummary`, the aggregate read
  behind the screen.
- **`apps/mobile/components/WorkoutSummary.tsx`** and **`apps/mobile/app/workout-summary.tsx`**
  — the summary UI and its route.
- **`apps/mobile/lib/session/finish-session.ts`** — now pushes
  `/workout-summary?sessionId=…` on finish.

## Deviations

**Orchestrator-reconstructed SUMMARY.** The executor for this plan was terminated by an API
session limit after committing Tasks 1 and 2 (`d0f0fba`, `a62b1a5`) and completing Task 3 in
its working tree without committing it. The orchestrator recovered the uncommitted work
verbatim as `f686eff` and wrote this SUMMARY from the landed commits rather than re-running
the plan. Consequently this file records what the code demonstrably does, not the executor's
own account — any deviation the executor would have reported for Task 3 is not captured here.
The recovered state was verified on the merged tree: build 6/6 packages, mobile 1243 tests
across 71 suites, api 67, api-contracts 103, pr-rules 38, all green, plus repo typecheck and
lint.

## Known gaps

- `apps/mobile/e2e/workout-summary.spec.ts` was written but never executed — project
  CLAUDE.md forbids launching a browser without an explicit request. Filed in WINDOWS.md as
  an `unrun-verify` entry.

## Self-Check: PASSED

- All four exports named in the plan's acceptance criteria exist in `personal-record.ts`
  (`logPersonalRecord`, `loadPriorBestByExercise`, `detectPrsForSession`,
  `loadSessionPersonalRecords`), and `summary-query.ts` exports `loadSessionSummary`.
- `detectPrs` and `foldPriorBest` are imported from `@fitness/pr-rules`; no PR or e1RM rule
  is reimplemented in the mobile app (D-30).
- Exactly one `insert(workoutSession)` remains in `apps/mobile/lib/db/`, in `log-set.ts` (D-33).
- Full build and test suites green on the merged tree.
