---
phase: 05-in-gym-session-logging
plan: 06
subsystem: ui

tags: [react-native, drizzle-orm, powersync, expo-router]

requires:
  - phase: 05-in-gym-session-logging
    provides: "ExercisePage.tsx's actionBarSlot render-prop and the SetRowView/ExercisePageView component split (05-01)"
  - phase: 05-in-gym-session-logging
    provides: "session_exercise.notes / logged_set.notes / workout_session.notes columns (05-02)"
provides:
  - "session-mutations.ts: setNote, setSessionExerciseTargets, resolveWriteBackTarget, writeBackTargets, addExerciseToSession, swapSessionExercise, removeSessionExercise, reorderSessionExercises — the one module owning every session-scoped write the action bar and overflow sheet perform"
  - "ExerciseActionBar/TargetsSheet/NoteSheet/SessionActionSheet components, and a fully-wired stateful ExercisePage wrapper (not yet consumed by workout.tsx — see Known Gaps)"
  - "updateLoggedSet's setType patch, for a future set-number-tap-target picker"
affects: [05-08, 05-10]

actuals:
  tokens: 20000
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Hook-free View + thin stateful wrapper split, extended to ExerciseActionBar/TargetsSheet/NoteSheet/SessionActionSheet — matches SetRowView/ExercisePageView precedent, direct-invocable by Jest with no renderer."
    - "Stateful wrappers with internal useState are tested only through their hook-free View's distinct callback props (e.g. TargetsSheetView's onSave vs onWriteBack), never by direct-invoking the stateful component itself — matches this codebase's existing ExerciseSlotRow.test.tsx convention (no renderer/react-test-renderer is in this worktree's lockfile)."
    - "Per-field write-back resolution (resolveWriteBackTarget) mirrors a per-field read resolution (resolvePrescriptionForCycle) exactly — the write side never creates rows the read side wouldn't already resolve through."

key-files:
  created:
    - apps/mobile/lib/db/session-mutations.ts
    - apps/mobile/components/ExerciseActionBar.tsx
    - apps/mobile/components/TargetsSheet.tsx
    - apps/mobile/components/NoteSheet.tsx
    - apps/mobile/components/SessionActionSheet.tsx
    - apps/mobile/lib/db/__tests__/session-mutations.test.ts
    - apps/mobile/components/__tests__/ExerciseActionBar.test.tsx
    - apps/mobile/components/__tests__/TargetsSheet.test.tsx
    - apps/mobile/components/__tests__/SessionActionSheet.test.tsx
  modified:
    - apps/mobile/components/ExercisePage.tsx
    - apps/mobile/components/ExerciseSlotRow.tsx
    - apps/mobile/lib/db/log-set.ts
    - .planning/WINDOWS.md

key-decisions:
  - "Task 2 (WarmupSheet.tsx, generateWarmupSets) is not implemented. It requires importing warmupSets from the @fitness/pr-rules workspace package, which apps/mobile/package.json does not declare as a dependency — adding it needs a package.json edit plus pnpm install, both explicitly forbidden by this wave's dependency freeze ('If you believe you need a new dependency, HALT and report'). Halted rather than duplicating the 40/60/80 percent warm-up math locally, which the plan's own acceptance criteria explicitly forbid (a source-scan-for-0.4/0.6/0.8 check)."
  - "The 'W' warm-up badge (the rendering half of Task 2 that needs no new dependency) IS implemented in ExercisePageView, keyed off an optional new setType field on ExercisePageSetRow."
  - "ExercisePage.tsx's stateful wrapper (the fully-wired action bar + all four sheets) is built and unit-provable, but apps/mobile/app/(tabs)/workout.tsx — frozen this wave, owned by the concurrent 05-07 worktree — renders ExercisePageView directly and was never touched, so none of this plan's UI is reachable from the live screen yet. See Known Gaps."
  - "Swap opens the unmodified Phase 4 ExercisePickerModal (taking the first selected exercise) rather than SwapSuggestionList — 05-06-PLAN.md's Task 3 action text names both, contradicting itself; ExercisePickerModal is the reuse-unmodified, swap-execution-capable option, since SwapSuggestionList's rows are read-only Links to the exercise detail page."
  - "The Session Action Sheet's Reorder row has no drag UI this phase — 05-UI-SPEC.md defines the four fixed rows but no interaction for Reorder specifically; reorderSessionExercises is implemented and tested, with no UI trigger yet."
  - "Note is wired only at the exercise level (the action bar's Note button) — 05-UI-SPEC.md defines no set-level or session-level trigger this phase; setNote/NoteSheet support all three levels and are ready for a future trigger."

requirements-completed: [LOG-14, LOG-15, LOG-16]

coverage:
  - id: D1
    description: "The per-exercise action bar renders from one exported EXERCISE_ACTIONS constant; all four items are always visible regardless of warmupSetsEnabled; the Note button's badge shows only when a note exists"
    requirement: "LOG-16"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/ExerciseActionBar.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "TargetsSheet edits write the session_exercise snapshot only via Save; 'Also update my program' is a distinct handler that writes both the snapshot and the program row the value resolved from (D-15's per-field override ?? base resolution, mirrored on the write side)"
    requirement: "LOG-15"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/TargetsSheet.test.tsx, apps/mobile/lib/db/__tests__/session-mutations.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Notes save and clear at set, exercise and session level as three independent writes; an empty/whitespace string normalizes to null"
    requirement: "LOG-16"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/session-mutations.test.ts#setNote"
        status: pass
    human_judgment: false
  - id: D4
    description: "Add, swap, and remove all work mid-session at the mutation layer: add never deduplicates, swap preserves order_index and every logged_set id, remove stamps removed_at and never deletes a logged_set row"
    requirement: "LOG-14"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/session-mutations.test.ts#addExerciseToSession,#swapSessionExercise,#removeSessionExercise"
        status: pass
    human_judgment: false
  - id: D5
    description: "Warm-up sets generate deterministically from the working weight and regenerate (not double) on a second tap"
    requirement: "LOG-17"
    verification: []
    human_judgment: true
    rationale: "Not implemented — blocked on the @fitness/pr-rules workspace dependency not being declared for apps/mobile (dependency freeze this wave). See WINDOWS #113."
  - id: D6
    description: "The action bar, targets/note/overflow sheets and add/swap/remove/reorder are reachable from the live workout screen"
    requirement: "LOG-14"
    verification: []
    human_judgment: true
    rationale: "Not reachable — apps/mobile/app/(tabs)/workout.tsx renders ExercisePageView directly, not the ExercisePage wrapper this plan built, and is frozen this wave (owned by the concurrent 05-07 worktree). See WINDOWS #114."

duration: ~2h30m
completed: 2026-08-24
status: halted
---

# Phase 5 Plan 6: Per-Exercise Action Bar, Targets/Note Sheets, and Session Action Sheet Summary

**Session-scoped mutation module (notes, targets/write-back, add/swap/remove/reorder) plus the components that call it — Task 2's warm-up generation is blocked on an undeclared workspace dependency, and none of this plan's UI is yet reachable from the live workout screen because `workout.tsx` is frozen this wave.**

## Performance

- **Duration:** ~2h30m
- **Tasks:** 2 of 3 completed (Task 1, Task 3); Task 2 blocked (see Deviations)
- **Files modified:** 12 (9 created, 4 modified — see key-files)

## Accomplishments

- `session-mutations.ts` owns every session-scoped write the action bar and overflow sheet perform: `setNote` (3 independent note columns, empty-normalizes-to-null), `setSessionExerciseTargets` (session-only snapshot write), `resolveWriteBackTarget`/`writeBackTargets` (D-15's write-side mirror of the `override ?? base` read), and `addExerciseToSession`/`swapSessionExercise`/`removeSessionExercise`/`reorderSessionExercises` (LOG-14 — remove is a stamp, never a delete).
- `ExerciseActionBar.tsx` exports `EXERCISE_ACTIONS` as a single ordered constant (D-13) — four always-visible items, Note carries a badge.
- `TargetsSheet.tsx` reuses `ExerciseSlotRow`'s stepper anatomy verbatim (`renderTargetStepper` exported for that reuse); Save and "Also update my program" are distinct handlers, proven by direct-invocation tests on the hook-free view.
- `SessionActionSheet.tsx` mirrors `RoutineActionSheet`'s row shape for the fixed Swap/Remove/Reorder/Info list, plus a `RemoveExerciseDialog` carrying the exact Copywriting Contract copy.
- `ExercisePage.tsx`'s stateful wrapper wires all of the above into the `actionBarSlot` render-prop 05-01 left open, and `ExercisePageView` renders a "W" badge ahead of warm-up rows.
- `updateLoggedSet` (`log-set.ts`) gains an optional `setType` patch, forward-compatible with a future set-number-tap-target picker.
- 92 new unit tests, all passing; full mobile suite (57 suites / 1091 tests) and `pnpm --filter mobile typecheck`/`lint` are green.

## Task Commits

Each unit of completed work was committed atomically:

1. **Session-scoped mutations data layer (Task 1 writes + Task 3 writes, same module)** - `1e0e906` (feat)
2. **Task 1: exercise action bar and mid-workout targets/note sheets** - `98cf981` (feat)
3. **Task 3: session action sheet and ExercisePage warm-up badge + full wiring** - `3663017` (feat)
4. **WINDOWS.md ledger entries for deferred/blocked items** - `ba0176d` (docs)

**Task 2 (WarmupSheet.tsx, generateWarmupSets) has no commit — blocked, not started beyond the badge-rendering half already folded into commit 3.**

**Plan metadata:** this SUMMARY.md's own commit follows.

## Files Created/Modified

- `apps/mobile/lib/db/session-mutations.ts` - every session-scoped write this plan's surfaces perform
- `apps/mobile/components/ExerciseActionBar.tsx` - `EXERCISE_ACTIONS`, `ExerciseActionBarView`, `ExerciseActionBar`
- `apps/mobile/components/TargetsSheet.tsx` - `TargetsSheetView`, `TargetsSheet`
- `apps/mobile/components/NoteSheet.tsx` - `NoteSheetView`, `NoteSheet`
- `apps/mobile/components/SessionActionSheet.tsx` - `SESSION_EXERCISE_ACTIONS`, `SessionActionSheetView`, `SessionActionSheet`, `RemoveExerciseDialog`
- `apps/mobile/components/ExercisePage.tsx` - "W" badge rendering, optional `setType` field, fully-wired stateful `ExercisePage` wrapper
- `apps/mobile/components/ExerciseSlotRow.tsx` - exports `renderTargetStepper`/`TargetStepperProps` for `TargetsSheet`'s reuse
- `apps/mobile/lib/db/log-set.ts` - `updateLoggedSet` gains an optional `setType` patch
- `apps/mobile/lib/db/__tests__/session-mutations.test.ts`, `apps/mobile/components/__tests__/{ExerciseActionBar,TargetsSheet,SessionActionSheet}.test.tsx` - 92 new tests
- `.planning/WINDOWS.md` - 6 new deviation entries (ids 113–118, see Deviations)

## Decisions Made

- **Task 2 halted, not faked.** `warmupSets`/`WARMUP_STEPS`/`DEFAULT_ROUNDING_INCREMENT_KG` live in `@fitness/pr-rules`, a real workspace package 05-04 built specifically for this plan's consumption (per 05-04-SUMMARY.md), but `apps/mobile/package.json` never declared it as a dependency. This plan's own acceptance criteria forbid duplicating the 0.4/0.6/0.8 math locally (a source-scan check), and the wave's dispatch explicitly instructs halting rather than adding a dependency mid-task. Rather than silently skip the requirement, I built everything Task 2 needed that has no dependency (the "W" badge rendering path) and left `WarmupSheet.tsx`/`generateWarmupSets` for a follow-up once a human authorizes the `apps/mobile/package.json` edit + `pnpm install`.
- **ExercisePage's stateful wrapper is built but not wired into `workout.tsx`.** `workout.tsx` renders `ExercisePageView` directly (not the `ExercisePage` wrapper), and is owned by the concurrently-running 05-07 worktree this wave — editing it was explicitly forbidden by the dispatch's seam-ownership block. Every new component and mutation is complete, typechecked, and unit-tested via direct invocation; only the wiring from `workout.tsx`/`useWorkoutScreen` into these new props remains, and is recorded as WINDOWS #114 for a follow-up plan.
- **Swap reuses `ExercisePickerModal`, not `SwapSuggestionList`.** The plan's own Task 3 text names both, contradicting itself. `SwapSuggestionList`'s rows are read-only `Link`s to the exercise detail page — not swap-execution capable without modification, which conflicts with "reuse `ExercisePickerModal` through its existing props, do NOT modify it." Chose the reuse-unmodified, functionally-complete path; documented the resulting minor copy mismatch as WINDOWS #117.
- **`destructive`/`foreground` glyph colors resolved locally in `SessionActionSheet.tsx`**, not added to the shared `ThemeColors` interface — widening that interface's required fields broke 10 unrelated existing test files' literal `COLORS` objects (Rule 1 caught and reverted before commit; see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `packages/api-contracts` and `packages/pr-rules` had no `dist/` build output**
- **Found during:** first typecheck run
- **Issue:** `Cannot find module '@fitness/api-contracts'` across many pre-existing, unrelated files (this worktree's fresh checkout has no built `dist/`) — matches 05-01-SUMMARY.md's identical precedent.
- **Fix:** Ran `pnpm build` inside `packages/api-contracts` (build step, no code change; `packages/pr-rules` was left unbuilt since it's not consumed this session).
- **Verification:** Typecheck error count dropped from ~60 pre-existing failures to the ThemeColors-only set described below.

**2. [Rule 1 - Bug, self-caught before commit] Widening `ThemeColors` broke 10 unrelated test files**
- **Found during:** Task 3 (`SessionActionSheet.tsx` needed a destructive icon color `ThemeColors` doesn't carry)
- **Issue:** My first pass added `foreground`/`destructive` as required fields to the shared `ThemeColors` interface, which made every existing test file's literal `COLORS = { accent, foregroundMuted, surface }` object (10 files, none owned by this plan) fail `tsc --noEmit`.
- **Fix:** Reverted `theme-colors.ts` to its original shape; resolved the two colors locally inside `SessionActionSheet.tsx` via `useColorScheme()` + a small local light/dark map, mirroring `theme-colors.ts`'s own pattern without touching the shared interface.
- **Verification:** `pnpm --filter mobile typecheck` clean; full test suite green (1091/1091).

### Not auto-fixed — halted per the wave's explicit dependency-freeze instruction

**Task 2 (WarmupSheet.tsx, generateWarmupSets)** — see "Decisions Made" above and WINDOWS #113. This is the one deviation NOT auto-resolved: the wave's dispatch explicitly names this exact scenario ("If you believe you need a new dependency, HALT and report") and gives no auto-fix path, unlike Rules 1–3's other exclusions.

---

**Total deviations:** 2 auto-fixed (1 blocking build-output fix, 1 self-caught interface-widening bug) + 1 halted-per-instruction (the `@fitness/pr-rules` dependency).
**Impact on plan:** Auto-fixes were necessary corrections with no scope creep. The halt is a genuine, plan-external blocker — not a corner cut — and is fully documented for a fast follow-up.

## Known Gaps

**WINDOWS #113 — Task 2 blocked.** `WarmupSheet.tsx`/`generateWarmupSets` need `@fitness/pr-rules` declared as a dependency of `apps/mobile`; requires a human decision + `pnpm install` this wave forbids.

**WINDOWS #114 — workout.tsx integration gap.** None of this plan's action bar, sheets, or "W" badge data are reachable from the live workout screen yet; `workout.tsx` still renders `ExercisePageView` directly. A follow-up plan needs to switch it to the `ExercisePage` wrapper and thread `sessionExerciseId`/`exerciseId`/`targets`/`hasNote`/`noteText`/`routineExerciseId`/`cycleId`/`onExerciseChanged`/`setType` through `useWorkoutScreen`.

**WINDOWS #115 — e2e case not authored.** Task 3's mid-session-add e2e case was not written, since the strip's Add chip (`workout.tsx`'s `onAddExercise`) is itself a documented no-op this wave; an e2e case against it would fail for a reason unrelated to this plan.

**WINDOWS #116 — Reorder has no UI trigger.** `reorderSessionExercises` is implemented and tested; no drag surface exists in 05-UI-SPEC.md for this phase.

**WINDOWS #117 — Swap via `ExercisePickerModal`, imperfect copy.** See Decisions Made.

**WINDOWS #118 — Note wired at exercise level only.** `setNote`/`NoteSheet` support all three levels; only the action bar's exercise-level trigger exists this phase.

**ID range note:** `gsd-tools windows.append` auto-assigned ids 113–118 from the ledger's current state — it has no explicit-id override, so these did NOT land in this plan's reserved 153–162 range from the dispatch. Flagging for the orchestrator in case a sibling wave-3 worktree (e.g. 05-07, reserved 163–172) also auto-incremented from an overlapping base and needs reconciliation at merge time.

## Issues Encountered

- The generic `jest.mock()` factory used in earlier drafts of `session-mutations.test.ts` referenced an out-of-scope `idCounter` variable, which Jest's hoisting rules forbid; renamed to `mockIdCounter` (the one prefix Jest's own error message allows) to fix.
- `TargetsSheet.test.tsx` initially failed to parse: `TargetsSheet.tsx` transitively imports `session-mutations.ts` → `log-set.ts` → the real `@powersync/react-native` package, which ships ESM Jest can't parse un-mocked. Fixed by mocking `@/lib/db/powersync` at the top of the test file, matching `ExercisePickerModal.test.tsx`/`workout.test.tsx`'s own established convention.

## User Setup Required

None - no external service configuration required. (A human decision on the `@fitness/pr-rules` dependency is a code-review/planning decision, not an external-service setup step.)

## Next Phase Readiness

- The mutation layer (`session-mutations.ts`) and every component built this plan are complete, typechecked, and unit-tested independent of the `workout.tsx` wiring gap — a follow-up plan closing WINDOWS #113/#114 does not need to touch any of this plan's files beyond `workout.tsx`/`useWorkoutScreen` and (once authorized) `apps/mobile/package.json`/the lockfile.
- 05-08 and 05-10 (both depend on 05-06) should be aware this plan's `status: halted` — LOG-17 (warm-up generation) and the live-screen reachability of LOG-14/LOG-15/LOG-16 are not yet true end-to-end, only true at the component/mutation-unit level.
- `pnpm --filter mobile test` (57 suites / 1091 tests), `pnpm --filter mobile typecheck`, and `pnpm --filter mobile lint` are all green in this worktree.
- D-33's single-funnel invariant holds: a source scan of `apps/mobile/lib/db/` for `insert(workoutSession)` returns exactly one match, in `log-set.ts`.
- `pnpm-lock.yaml` untouched this session, per the wave's dependency freeze.

## Self-Check: PASSED

All 13 created/modified source files (plus this SUMMARY.md) confirmed present via `git ls-files`; all 4 commit hashes (`1e0e906`, `98cf981`, `3663017`, `ba0176d`) confirmed present via `git log`. No missing items.

---
*Phase: 05-in-gym-session-logging*
*Completed: 2026-08-24*
