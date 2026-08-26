---
phase: 05-in-gym-session-logging
plan: 12
subsystem: mobile-e2e
tags: [playwright, powersync, targets-sheet, write-back, durability-harness]

# Dependency graph
requires:
  - phase: 05-in-gym-session-logging
    provides: 05-11's workout_session.cycle_id persistence and TargetsSheet cycleId threading
provides:
  - "A browser-real, registered target-write-back.spec.ts proving resolveWriteBackTarget's override and base branches, D-14's session-only Save, and SC4's reload-survives-destination case, against a real @powersync/web database"
  - "A db prop threaded through WorkoutScreenView -> ExercisePage -> TargetsSheet so the Targets write-back path lands in whichever database the screen actually reads from, matching the existing writeDb pattern used for logSet/startSession"
affects: [05-16, TargetsSheet, ExercisePage, WorkoutScreenView]

# Actuals (#2632)
actuals:
  tokens: 7700
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "TargetsSheet's db prop follows the same optional-db-with-getPowerSync()-default pattern already established for logSet/startSession's writeDb, rather than inventing a new DI mechanism."

key-files:
  created:
    - apps/mobile/e2e/target-write-back.spec.ts
  modified:
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/playwright.config.ts
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/app/(tabs)/__tests__/workout.test.tsx
    - apps/mobile/components/ExercisePage.tsx
    - apps/mobile/components/TargetsSheet.tsx

key-decisions:
  - "Fixed the spec's own read-before-write-completes race (Task 3) by waiting for the sheet to close — via the shared 'Increase Sets' stepper button becoming hidden — after every write-back/save click, rather than adding a fixed sleep or loosening an assertion."
  - "Threaded an optional db prop through WorkoutScreenView -> ExercisePage -> TargetsSheet (not through NoteSheet/WarmupSheet/swap/remove, which share the same latent defect but are out of this plan's scope and untouched by its test) because writeBackTargets/setSessionExerciseTargets always defaulted to getPowerSync(), silently diverging from whichever database the rest of the screen was actually using. Invisible in real single-database production usage; fatal to the durability harness's per-test isolation."

requirements-completed: [LOG-15]

coverage:
  - id: D1
    description: "seedProgrammedSessionWithCycle seeds a program with one routine_exercise_cycle_target override (first exercise) and no override (second exercise), funnelled through startWorkoutFromProgram; readRoutineExerciseRaw/readCycleTargetRaw/readRoutineExerciseCycleTargetsRaw expose both rows raw for assertions."
    requirement: "LOG-15"
    verification:
      - kind: unit
        ref: "pnpm --filter mobile typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "target-write-back.spec.ts drives the real WorkoutScreenView through DOM interactions only (Targets sheet, Increase Sets, Also update my program / Save) — no direct call to writeBackTargets or setSessionExerciseTargets — and registers in playwright.config.ts's durability project testMatch."
    requirement: "LOG-15"
    verification:
      - kind: e2e
        ref: "pnpm --filter mobile test:e2e:durability e2e/target-write-back.spec.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "With a real override row active, write-back updates the override row and leaves the base row untouched; with no override row, write-back updates the base row and creates no override; a session-only Save leaves both program rows untouched while the session's own displayed target reflects the edit (D-14); the destination survives a page reload (SC4)."
    requirement: "LOG-15"
    verification:
      - kind: e2e
        ref: "e2e/target-write-back.spec.ts — 'an override row exists — write-back updates the override, not the base' (includes the SC4 reload+repeat assertion)"
        status: pass
      - kind: e2e
        ref: "e2e/target-write-back.spec.ts — 'no override row exists — write-back updates the base row'"
        status: pass
      - kind: e2e
        ref: "e2e/target-write-back.spec.ts — 'a session-only Save leaves both program rows untouched'"
        status: pass
    human_judgment: false

duration: ~2.5hr (across the interrupted session and this resumed continuation)
completed: 2026-08-26
status: complete
---

# Phase 05 Plan 12: Browser-Real Write-Back Proof Summary

**A real, registered Playwright spec proves D-15's override-vs-base write-back resolution end to end against a real `@powersync/web` database, and in doing so found and fixed a genuine `getPowerSync()`-default bug that made `TargetsSheet` writes bypass whichever database the screen was actually using.**

## Performance

- **Duration:** ~2.5hr total (a prior executor session completed Task 1 and drafted an uncommitted Task 2 before hitting an account session limit; this continuation reviewed, corrected, and committed Task 2, then executed and fixed Task 3)
- **Tasks:** 3 of 3 complete
- **Files modified:** 9 across the full plan (2 net-new: `target-write-back.spec.ts`, plus the `durability-harness-key.ts`-adjacent files from Task 1)

## Accomplishments

- `seedProgrammedSessionWithCycle` seeds a real program (one routine, one day, two `routine_exercise` rows, one `routine_cycle`, one `routine_exercise_cycle_target` override on the first exercise only) funnelled entirely through `startWorkoutFromProgram` — never a direct `workout_session` insert (D-33's single-funnel invariant held).
- `target-write-back.spec.ts` — three browser-real cases, registered in `playwright.config.ts`'s `durability` project `testMatch` — prove: the override branch of `resolveWriteBackTarget`, the base branch, D-14's session-only-Save-leaves-program-alone guarantee, and SC4's reload-survives-destination case (a page reload, reopening the same underlying database by filename, and repeating the write-back on the same field still resolves to the override row).
- **Genuine defect found and fixed (Task 3):** `writeBackTargets`/`setSessionExerciseTargets` (called from `TargetsSheet.tsx`) always defaulted to the module-singleton `getPowerSync()`, ignoring whichever database the rest of the screen (`useWorkoutScreen`'s `writeDb = db ?? getPowerSync()`) was actually reading from. In real production usage there is only one `getPowerSync()` instance, so this was invisible — but it is exactly the kind of gap a real isolated-database browser test exists to catch, and it broke the harness's own per-test database isolation. Fixed by threading an optional `db` prop through `WorkoutScreenView -> ExercisePage -> TargetsSheet`, matching the existing `writeDb` pattern already used for `logSet`/`startSession`. Recorded as WINDOWS #134, now `fixed`.
- **Spec-side race fixed (Task 3):** the spec's own read of the database via `page.evaluate` immediately after clicking "Also update my program"/"Save" raced `handleWriteBack`/`handleSave`'s own `await` chain — the sheet only unmounts (`onDone`) once the write actually finishes, so waiting for the "Increase Sets" stepper button to become hidden after each write-triggering click is the correct synchronization point, not a fixed sleep or a loosened assertion.

## Task Commits

1. **Task 1: Seed a cycle-with-override program in the durability harness** — `18e7176` (feat) — completed and committed in the prior (interrupted) session; not redone.
2. **Task 2: Write and register the browser-real write-back spec** — `ec46a26` (test) — reviewed the prior session's uncommitted spec file critically, confirmed it correctly matched Task 1's harness method names (the resume dispatch's flagged "probable name mismatch" turned out not to exist — Task 1's commit already added all three harness methods with matching names), fixed the one confirmed defect (spec not registered in `playwright.config.ts`), and committed.
3. **Task 3: Run the spec against a real browser and fix what actually fails** — `a722ce4` (fix) — ran the spec for real (first run: all 3 failed with stale-value assertions; the `pnpm -- ` forwarding quirk the dispatch warned about did occur on the very first attempt and silently ran the entire `durability` project instead of just this file — caught it by checking the reported test count, not just the exit code), triaged the failures to two real causes (spec race + production `db`-threading bug), fixed both at source, and re-ran to a clean 3/3 pass.

## Files Created/Modified

- `apps/mobile/lib/db/test-support.ts` — `seedProgrammedSessionWithCycle`, `readRoutineExerciseRaw`, `readCycleTargetRaw`, `readRoutineExerciseCycleTargetsRaw` (Task 1)
- `apps/mobile/app/__durability.web.tsx` — `seedWorkoutSessionWithCycle`, `readRoutineExercise`, `readCycleTarget`, `readCycleTargetsForRoutineExercise` harness methods (Task 1)
- `apps/mobile/e2e/target-write-back.spec.ts` — new, three browser-real cases (Task 2, fixed in Task 3)
- `apps/mobile/playwright.config.ts` — registered the new spec in the `durability` project's `testMatch` (Task 2)
- `apps/mobile/app/(tabs)/workout.tsx` — `WorkoutScreenViewProps.db`, `useWorkoutScreen` returns `db: writeDb`, `ExercisePage` receives `db={db}` (Task 3 fix)
- `apps/mobile/app/(tabs)/__tests__/workout.test.tsx` — `baseViewProps` fixture extended with an opaque `db` stand-in (Task 3 fix, mechanical)
- `apps/mobile/components/ExercisePage.tsx` — optional `db?: WriteDb` prop, threaded to `TargetsSheet` (Task 3 fix)
- `apps/mobile/components/TargetsSheet.tsx` — optional `db?: WriteDb` prop, `writeDb = db ?? getPowerSync()` used by both `handleSave`/`handleWriteBack` (Task 3 fix)
- `.planning/WINDOWS.md` — WINDOWS #134 recorded and marked `fixed`

## Decisions Made

- **Scope of the `db`-threading fix:** limited to the exact path this plan's spec exercises (`TargetsSheet`'s Save/write-back). `NoteSheet`, `WarmupSheet`, and `ExercisePage`'s swap/remove handlers call the same class of `session-mutations.ts` helpers with the same missing `db` argument and share the identical latent defect, but none of them are exercised by this plan's tests or `files_modified` list — touching them here would be unreviewed scope creep with no test backing the change. Left as-is; a future plan that browser-tests those paths will hit and fix the same class of bug the same way.
- **Spec fix over sleep:** rejected adding a `page.waitForTimeout`/fixed delay to fix the observed race; used `await expect(page.getByRole('button', { name: 'Increase Sets' })).toBeHidden()` instead, which ties the wait to the actual state transition (`onDone()` unmounting the sheet) rather than a guessed duration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registered the spec in `playwright.config.ts`'s `durability` project `testMatch`**
- **Found during:** Task 2 review (resume dispatch flagged this as a known gap in the partial work)
- **Issue:** `target-write-back.spec.ts` existed but was not in `testMatch`, so the runner could not see it — the same class of bug as this phase's earlier CR-01 finding.
- **Fix:** Added `'target-write-back.spec.ts'` to the array.
- **Files modified:** `apps/mobile/playwright.config.ts`
- **Committed in:** `ec46a26`

**2. [Rule 1 - Bug] Fixed the spec's own read-before-write-completes race**
- **Found during:** Task 3, first real run (all 3 tests failed with stale pre-write values — e.g. expected `6`, received `5`)
- **Issue:** The spec read the database via `page.evaluate` immediately after clicking "Also update my program"/"Save", before `handleWriteBack`/`handleSave`'s own `await setSessionExerciseTargets(...)` / `await writeBackTargets(...)` chain had resolved. The page snapshot at failure time showed the Save/write-back buttons still `[disabled]` (the `saving` state was still `true`) — the write hadn't landed yet.
- **Fix:** Added `await expect(page.getByRole('button', { name: 'Increase Sets' })).toBeHidden();` after every write-triggering click, which only resolves once `onDone()` has unmounted the sheet (i.e., after the write actually completed).
- **Files modified:** `apps/mobile/e2e/target-write-back.spec.ts`
- **Committed in:** `a722ce4`

**3. [Rule 1 - Bug] Threaded `db` through `WorkoutScreenView -> ExercisePage -> TargetsSheet`**
- **Found during:** Task 3, second real run (same assertions still failed even after the sheet correctly closed before the read — the DOM snapshot no longer showed the sheet, but the raw database read still returned the pre-write value)
- **Issue:** `TargetsSheet.tsx`'s `handleSave`/`handleWriteBack` called `setSessionExerciseTargets`/`writeBackTargets` with no explicit `db` argument, so both always resolved the module-singleton `getPowerSync()` (hardcoded `dbFilename: 'fitness.db'`) — a different underlying SQLite database than the harness's isolated, per-test database (`openWithFilename`'s caller-supplied filename), which is what the spec's raw readers (`readCycleTargetRaw`/`readRoutineExerciseRaw`) actually queried. The write landed in a database the test never looked at.
- **Fix:** Added an optional `db?: WriteDb` prop to `TargetsSheetProps` and `ExercisePageProps`, defaulting to `getPowerSync()` exactly like the existing `logSet`/`startSession` pattern (`useWorkoutScreen`'s `writeDb = db ?? getPowerSync()`); added `db: writeDb` to `useWorkoutScreen`'s returned view model and `WorkoutScreenViewProps`; threaded it from `WorkoutScreenView`'s render into `ExercisePage`, and from `ExercisePage` into `TargetsSheet`.
- **Files modified:** `apps/mobile/app/(tabs)/workout.tsx`, `apps/mobile/components/ExercisePage.tsx`, `apps/mobile/components/TargetsSheet.tsx`, `apps/mobile/app/(tabs)/__tests__/workout.test.tsx` (fixture, mechanical)
- **Verification:** `pnpm --filter mobile typecheck` exits 0; `pnpm --filter mobile test` — 1288/1288 pass, 75/75 suites; `pnpm --filter mobile test:e2e:durability e2e/target-write-back.spec.ts` — 3/3 pass, exit 0 (repeated 3 times for flake-check, all green).
- **Committed in:** `a722ce4`
- **Recorded:** WINDOWS #134 (`deviation`), marked `fixed`.

**Total deviations:** 3 auto-fixed, all Rule 1/3. No architectural-decision (Rule 4) escalation was needed — the `db`-threading fix applies an already-established pattern one level further down an existing prop chain; it does not introduce a new dependency, table, or service.

## Known Stubs

None. No hardcoded empty values or placeholder text were introduced by this plan.

## Threat Flags

None. This plan touches no new trust boundary — the `db` prop threaded through `ExercisePage`/`TargetsSheet` is an internal dependency-injection parameter with a production-identical default, not a new input surface.

## Issues Encountered

**The `pnpm -- ` forwarding quirk the dispatch warned about did occur.** The very first invocation, `pnpm --filter mobile test:e2e:durability -- e2e/target-write-back.spec.ts`, silently ran the entire `durability` project (23 tests across 9 files, including this phase's known-failing specs) instead of scoping to the one file — confirmed by reading the full runner output (`20 failed`, `6 passed`), not just the exit code. Switched to invoking `playwright test` directly from `apps/mobile` (`npx playwright test --project=durability e2e/target-write-back.spec.ts`, no `--`) and to `pnpm --filter mobile test:e2e:durability e2e/target-write-back.spec.ts` (also no extra `--`), both of which correctly scoped to 3 tests — verified with `--list` before the real run.

**The resume dispatch's flagged "probable name mismatch" (harness exposing `readCycleTargetRaw`/`readRoutineExerciseRaw` under different names than the spec's `readCycleTarget`/`readRoutineExercise` calls) did not actually exist.** Task 1's single commit (`18e7176`) already wired all three harness methods (`seedWorkoutSessionWithCycle`, `readRoutineExercise`, `readCycleTarget`, plus a fourth, `readCycleTargetsForRoutineExercise`, that the spec also needed) under names matching the spec exactly — more complete than the dispatch's summary of it suggested. No fix was needed there.

## User Setup Required

None.

## Next Phase Readiness

**This plan is complete.** All three tasks are done and committed:

- `pnpm --filter mobile typecheck` — exit 0.
- `pnpm --filter mobile test` — 1288/1288 passed, 75/75 suites, exit 0 (confirms the `db`-threading fix did not regress any existing unit coverage).
- `pnpm --filter mobile test:e2e:durability e2e/target-write-back.spec.ts` — `3 passed (Ns)`, exit 0, run three times with identical results (no flake observed).

VERIFICATION.md's `human_verification` item — "With a program that has at least one `routine_exercise_cycle_target` override active … confirm the override (not the base row) reflects the edit" — is now closed by an automated, repeatable browser run instead of a manual check.

`NoteSheet`, `WarmupSheet`, and `ExercisePage`'s swap/remove handlers share the same `getPowerSync()`-default pattern this plan fixed for `TargetsSheet`, and would exhibit the identical database-divergence bug if browser-tested against an isolated harness database. Not fixed here (out of this plan's scope, no test exercises them) — worth flagging for whichever future plan (e.g. 05-16, or a dedicated note/warmup e2e plan) first writes a browser-real test against those paths.

## Self-Check: PASSED

All claimed files exist on disk and all claimed commit hashes (`18e7176`, `ec46a26`, `a722ce4`) are present in `git log --oneline --all`.
