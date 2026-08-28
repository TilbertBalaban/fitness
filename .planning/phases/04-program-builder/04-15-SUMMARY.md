---
phase: 04-program-builder
plan: 15
subsystem: testing
tags: [react-native, powersync, playwright, drizzle, jest]

# Dependency graph
requires:
  - phase: 04-program-builder
    provides: "day archive/restore/duplicate on the day page (04-13), Mark Ready wiring and the archived-day rotation/history-safety regressions (04-14)"
provides:
  - "ProgramsScreenProps (userId/db injection seam) on apps/mobile/app/(tabs)/programs.tsx, mirroring GymProfilesScreenProps exactly"
  - "seedRoutineTree + readRoutineDayRaw/readRoutineDaysRaw/readRoutineCycleRaw in apps/mobile/lib/db/test-support.ts"
  - "openProgramsScreen + seedRoutineTree + three raw-read methods on the durability harness, and a programsHarness mount branch"
affects: [04-16]

# Actuals (#2632)
actuals:
  tokens: 6200
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resolveEffectiveUserId extracts the override-then-session-then-null rule GymProfilesScreen and useWorkoutScreen already apply inline, so a suite can assert it without rendering the screen"
    - "database resolves once (db ?? getPowerSync()) near the top of the component and every handler passes it as an explicit trailing argument to its write/read helper — the WINDOWS #134/#135/#137/#138 defect class, closed for this screen"
    - "seedRoutineTree funnels every row through the shipped createRoutine/addDay/addExercisesToDay/addCycle/activateRoutine helpers, matching seedProgrammedSession's own no-shortcut discipline"

key-files:
  created: []
  modified:
    - apps/mobile/app/(tabs)/programs.tsx
    - apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/app/__durability.web.tsx

key-decisions:
  - "openProgramsScreen clears all four other mount states (workoutHarness, editingHarness, gymProfilesHarness, gymEditorHarness), not just the sibling gym-editor state openGymProfilesScreen itself clears — the plan's own text ('clears the other four mount states') is the more explicit spec, and this harness's single-active-mount convention holds regardless of which prior mount was open."
  - "seedRoutineTree seeds two real seeded_exercise rows (ex-routine-tree-1/2) rather than reusing seedProgrammedSession's bare ex-workout-harness-* ids, because 04-16's builder mounts a picker/deck that renders exercise names, unlike the workout screen's tolerance for an unresolvable id falling back to 'Unknown exercise'."

patterns-established: []

requirements-completed: [PROG-07]

coverage:
  - id: D1
    description: "The Programs screen accepts an optional userId and db and uses them for every read and every write; with neither supplied it behaves exactly as before"
    requirement: "PROG-07"
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts#resolveEffectiveUserId honours an explicit override over the session / falls back to the session id / is null when neither exists"
        status: pass
      - kind: other
        ref: "grep -c 'getPowerSync()' apps/mobile/app/(tabs)/programs.tsx returns 1"
        status: pass
      - kind: unit
        ref: "pnpm --filter mobile test — all 53 pre-existing programs-screen assertions pass unedited"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every write helper the screen calls receives the resolved database explicitly — inspected call by call, not sampled"
    requirement: "PROG-07"
    verification:
      - kind: other
        ref: "manual diff inspection of every mutate()/runMutation() call site in apps/mobile/app/(tabs)/programs.tsx — all 16 write/read helper calls (addDay, renameDay, removeDay, archiveDay, restoreDay, duplicateDay, addExercisesToDay, removeExercise, moveExercise, setExerciseTargets, setCycleTarget, clearCycleTarget, addCycle, updateCycle, moveCycle, removeCycle, setProgressionFrozen) carry the resolved `database` as their trailing argument"
        status: pass
    human_judgment: false
  - id: D3
    description: "The durability harness can seed a real routine tree (routine, two days, four exercise slots, one cycle, an active-program pointer) through the shipped write helpers, mount the real Programs screen against it, and read routine_day/routine_cycle rows back raw"
    requirement: "PROG-07"
    verification:
      - kind: e2e
        ref: "temporary smoke spec (not committed): seedRoutineTree returns 2 dayIds/4 exerciseSlotIds/a cycleId; openProgramsScreen renders 'Harness Routine Tree', 'Push' and 'Pull'; readRoutineDaysRaw returns 2 non-archived rows; readRoutineDayRaw returns archived_at: null; readRoutineCycleRaw returns the 'Week 1' cycle — run against a real @powersync/web database, then removed per this plan's scope (04-16 owns the permanent spec)"
        status: pass
      - kind: e2e
        ref: "pnpm --filter mobile test:e2e:durability — all 45 pre-existing durability cases pass unchanged, proving the harness append broke nothing"
        status: pass
    human_judgment: false
  - id: D4
    description: "pnpm --filter mobile test, typecheck and build all exit 0, and npx turbo run typecheck lint is fully successful"
    requirement: "PROG-07"
    verification:
      - kind: unit
        ref: "pnpm --filter mobile test — 91 suites, 1671 tests, all pass"
        status: pass
      - kind: other
        ref: "pnpm --filter mobile typecheck, pnpm --filter mobile build, npx turbo run typecheck lint (11/11 tasks successful)"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-08-28
status: complete
---

# Phase 04 Plan 15: Programs screen injection seam + durability harness routine-tree seed Summary

**`ProgramsScreenProps` gives the Programs screen the same `userId`/`db` override seam `GymProfilesScreen` already has — every one of its 16 write/read call sites now takes the resolved database explicitly — and the durability harness gained `seedRoutineTree` plus a real mount of the Programs screen, so 04-16 can drive the day-lifecycle controls against a real `@powersync/web` database in a browser.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-08-28T15:12:00Z (approx, worktree base)
- **Completed:** 2026-08-28T15:50:55Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `ProgramsScreenProps` (`userId?`, `db?`) added to `apps/mobile/app/(tabs)/programs.tsx`, matching `GymProfilesScreenProps`' shape exactly; `resolveEffectiveUserId` extracts the override-then-session-then-null rule as a pure, directly-tested function
- The database resolves once (`db ?? getPowerSync()`) and every one of the screen's 16 write/read helper calls (`addDay`, `renameDay`, `removeDay`, `archiveDay`, `restoreDay`, `duplicateDay`, `addExercisesToDay`, `removeExercise`, `moveExercise`, `setExerciseTargets`, `setCycleTarget`, `clearCycleTarget`, `addCycle`, `updateCycle`, `moveCycle`, `removeCycle`, `setProgressionFrozen`, plus the tree-loading `loadLibraryRoutines`/`loadActiveRoutineId`/`loadProgramTree`/`loadArchivedDays`/`loadExerciseNameMap`) now passes it explicitly — `getPowerSync()` appears exactly once in the file, in the resolution line, closing the exact defect class WINDOWS #134/#135/#137/#138 record
- `reload`, `reloadTree` and `mutate` all list `database` in their dependency arrays; every handler that closes over it lists it too, for correctness under React's exhaustive-deps rule
- `seedRoutineTree` (test-support.ts) seeds two real catalog exercises, a routine, two days (Push/Pull), two exercises per day, one training cycle and an active-program pointer, entirely through `createRoutine`/`addDay`/`addExercisesToDay`/`addCycle`/`activateRoutine` — no direct table insert for any of those five rows, and deliberately no `workout_session`
- `readRoutineDayRaw`, `readRoutineDaysRaw` and `readRoutineCycleRaw` added beside the existing raw readers; `readRoutineDayRaw` returns `archived_at`
- `__durability.web.tsx` gains exactly one mount state (`programsHarness`), one render branch mounting the real `ProgramsScreen` default export with an explicit `db`/`userId`, and five methods (`seedRoutineTree`, `openProgramsScreen`, `readRoutineDayRaw`, `readRoutineDaysRaw`, `readRoutineCycleRaw`); `close()` resets the new mount state alongside the existing four
- Proved the new harness seam end-to-end with a temporary Playwright spec against a real `@powersync/web` database (seed → mount → assert rendered day names → read raw rows back), then removed it — the permanent spec is 04-16's

## Task Commits

1. **Task 1: The Programs screen takes an injected user and database** - `f54a00b` (test), `f3253f9` (feat)
2. **Task 2: A seeded routine tree and a programs mount in the durability harness** - `2dac002` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `apps/mobile/app/(tabs)/programs.tsx` - `ProgramsScreenProps`, `resolveEffectiveUserId`, `database` resolution, every write/read call site updated to pass it explicitly
- `apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts` - `resolveEffectiveUserId` describe block (3 cases); every pre-existing assertion left unedited
- `apps/mobile/lib/db/test-support.ts` - `seedRoutineTree`, `SeededRoutineTree`, `readRoutineDayRaw`, `readRoutineDaysRaw`, `readRoutineCycleRaw`
- `apps/mobile/app/__durability.web.tsx` - `programsHarness` mount state, `openProgramsScreen`/`seedRoutineTree`/three raw-read methods, `ProgramsScreen` render branch, `close()` reset

## Decisions Made
- `openProgramsScreen` clears all four other mount states (`workoutHarness`, `editingHarness`, `gymProfilesHarness`, `gymEditorHarness`) rather than mirroring `openGymProfilesScreen`'s narrower single-sibling clear — the plan text explicitly calls for clearing "the other four," and doing so keeps the single-active-mount convention true regardless of which prior harness state was left open.
- `seedRoutineTree`'s two catalog exercises are real named `seeded_exercise` rows (`ex-routine-tree-1`/`-2`) rather than bare unregistered ids, since the builder's exercise picker and day-page rows render a name, unlike the workout screen's documented tolerance for "Unknown exercise."

## Deviations from Plan

None — plan executed exactly as written. `resolveEffectiveUserId`'s name was not specified by the plan (which only requires "a small pure helper"); named to match the existing three-way-rule vocabulary in this codebase (`resolveLiveRoutineId`, `resolveLiveEquipmentProfileId`).

## Issues Encountered

**Fresh-worktree bootstrap:** the worktree had no `node_modules` and no built workspace packages. Ran `pnpm install` and `npx turbo run build` before any test/typecheck/build command, consistent with 04-14's own note on the same friction.

**Playwright's `testMatch` allowlist excludes ad-hoc spec files by default:** `playwright.config.ts`'s `durability` project lists test filenames explicitly rather than a glob, so a temporary smoke spec required a momentary addition to that allowlist to run at all. The allowlist entry and the spec file were both removed before committing; `git status --short` was checked clean of both before the Task 2 commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 04-16, which drives the day-lifecycle controls (archive/restore/duplicate day, Mark Ready, day rotation) through the real Programs screen mounted via `openProgramsScreen()` against a `seedRoutineTree()`-seeded database, in a real browser. No blockers. Sibling plans 04-13/04-14 (which share `apps/mobile/app/(tabs)/programs.tsx` and `apps/mobile/lib/db/programs/*.ts`) were read but not touched by this plan beyond the injection-seam edit.

---
*Phase: 04-program-builder*
*Completed: 2026-08-28*

## Self-Check: PASSED
