---
phase: 05-in-gym-session-logging
plan: 06
subsystem: ui

tags: [react-native, drizzle-orm, powersync, expo-router, pr-rules]

requires:
  - phase: 05-in-gym-session-logging
    provides: "ExercisePage.tsx's actionBarSlot render-prop and the SetRowView/ExercisePageView component split (05-01)"
  - phase: 05-in-gym-session-logging
    provides: "session_exercise.notes / logged_set.notes / workout_session.notes columns (05-02)"
  - phase: 05-in-gym-session-logging
    provides: "warmupSets/WARMUP_STEPS/DEFAULT_ROUNDING_INCREMENT_KG in the @fitness/pr-rules workspace package (05-04)"
provides:
  - "session-mutations.ts: setNote, setSessionExerciseTargets, resolveWriteBackTarget, writeBackTargets, generateWarmupSets, addExerciseToSession, swapSessionExercise, removeSessionExercise, reorderSessionExercises — the one module owning every session-scoped write the action bar and overflow sheet perform"
  - "ExerciseActionBar/TargetsSheet/NoteSheet/WarmupSheet/SessionActionSheet components, plus a fully-wired stateful ExercisePage wrapper now consumed by workout.tsx — every sheet is reachable from the live workout screen"
  - "session-query.ts: defaultWarmupWorkingWeightKg (D-16 working-weight default), SessionExerciseRow.routineExerciseId/notes, and a removed_at IS NULL filter on the live session read"
  - "updateLoggedSet's setType patch, for a future set-number-tap-target picker"
  - "apps/mobile/package.json declares @fitness/pr-rules as a workspace dependency"
affects: [05-08, 05-10]

actuals:
  tokens: 37000
  tasks: 3
  commits: 9

tech-stack:
  added:
    - "@fitness/pr-rules (workspace:* dependency of apps/mobile, linked this session)"
  patterns:
    - "Hook-free View + thin stateful wrapper split, extended to ExerciseActionBar/TargetsSheet/NoteSheet/WarmupSheet/SessionActionSheet — matches SetRowView/ExercisePageView precedent, direct-invocable by Jest with no renderer."
    - "Stateful wrappers with internal useState are tested only through their hook-free View's distinct callback props (e.g. TargetsSheetView's onSave vs onWriteBack, WarmupSheetView's disabled-until-weight-known confirm), never by direct-invoking the stateful component itself — matches this codebase's existing ExerciseSlotRow.test.tsx convention (no renderer/react-test-renderer is in this worktree's lockfile). Extended this session to a stateful wrapper's own OUTER element in a caller's render tree (workout.test.tsx's renderCurrentExercisePage): read the pass-through props off the raw <ExercisePage> element rather than direct-invoking it."
    - "Per-field write-back resolution (resolveWriteBackTarget) mirrors a per-field read resolution (resolvePrescriptionForCycle) exactly — the write side never creates rows the read side wouldn't already resolve through."
    - "generateWarmupSets's delete-then-insert regenerate pattern (uncompleted rows only) — a second tap fixes the ladder instead of doubling it, while a completed warm-up row is left alone because the user did it."
    - "A view-model collection built alongside rowsByExercise (pageDataByExercise) rather than widening ResolvedSetRow — SetRowView-facing data and ExercisePage-action-bar-facing data stay two separate per-exercise records with two separate shapes."

key-files:
  created:
    - apps/mobile/lib/db/session-mutations.ts
    - apps/mobile/components/ExerciseActionBar.tsx
    - apps/mobile/components/TargetsSheet.tsx
    - apps/mobile/components/NoteSheet.tsx
    - apps/mobile/components/WarmupSheet.tsx
    - apps/mobile/components/SessionActionSheet.tsx
    - apps/mobile/lib/db/__tests__/session-mutations.test.ts
    - apps/mobile/components/__tests__/ExerciseActionBar.test.tsx
    - apps/mobile/components/__tests__/TargetsSheet.test.tsx
    - apps/mobile/components/__tests__/SessionActionSheet.test.tsx
    - apps/mobile/components/__tests__/WarmupSheet.test.tsx
  modified:
    - apps/mobile/components/ExercisePage.tsx
    - apps/mobile/components/ExerciseSlotRow.tsx
    - apps/mobile/lib/db/log-set.ts
    - apps/mobile/lib/db/session-query.ts
    - apps/mobile/lib/db/__tests__/session-query.test.ts
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/app/(tabs)/__tests__/workout.test.tsx
    - apps/mobile/e2e/workout-screen.spec.ts
    - apps/mobile/package.json
    - pnpm-lock.yaml
    - .planning/WINDOWS.md

key-decisions:
  - "Task 2 (WarmupSheet.tsx, generateWarmupSets) is implemented in the continuation dispatch that closed WINDOWS #113. @fitness/pr-rules is declared as a workspace dependency of apps/mobile (package.json + pnpm install), per the orchestrator's explicit one-package carve-out of the wave's dependency freeze — it is a first-party package this same phase (05-04) built specifically for this plan to consume, with zero runtime dependencies. generateWarmupSets imports warmupSets/WARMUP_STEPS/DEFAULT_ROUNDING_INCREMENT_KG unmodified; no percentage or rounding arithmetic is duplicated in session-mutations.ts or WarmupSheet.tsx (pinned by the plan's own 0.4/0.6/0.8 source-scan acceptance criterion)."
  - "WarmupSheet's working-weight default is resolved by a new session-query.ts function, defaultWarmupWorkingWeightKg: the exercise's own first logged working set in this session, else the D-16 cross-session history prefill (previousSetReference), else blank/required — matching 05-06-PLAN.md Task 2's action text exactly."
  - "workout.tsx now renders the stateful ExercisePage wrapper (not ExercisePageView directly) in the pager's renderExercise, closing WINDOWS #114. A new pageDataByExercise view-model collection, built alongside rowsByExercise from the same sessionExercises list, carries routineExerciseId/notes/targets/sessionId/userId into ExercisePage — SessionExerciseRow gained routineExerciseId and notes columns (previously not selected by loadSessionTree at all) to make this possible."
  - "loadSessionTree's exercise-rows select now filters removed_at IS NULL, per removeSessionExercise's own documented promise in session-mutations.ts ('every session read added by this phase filters removed_at as null for the live strip and pager') — this filter did not exist anywhere until this continuation, so Remove Exercise had no visible effect on the live screen before this session."
  - "ResolvedSetRow/buildSetRows now thread logged_set.set_type through as an optional field, so ExercisePageView's warm-up 'W' badge (built in the original 05-06 session) has real data to key off instead of always-undefined rows."
  - "The strip's 'Add Exercise' chip is wired to the unmodified Phase 4 ExercisePickerModal in multi-select, opened in a real RN Modal overlay (matching the existing showDiscardConfirm pattern) rather than the top-level full-screen replacement the one-off-start flow uses — mid-session add must not unmount the header timer or the rest of the ready screen."
  - "cycleId is passed as null in every ExercisePageData entry: no schema column persists which program cycle a live session started from (workout_session/session_exercise carry no cycle_id), so a programmed exercise's write-back always resolves to the base routine_exercise row rather than a cycle-specific routine_exercise_cycle_target override. This is a genuine, newly-discovered gap (not the plan's already-flagged null-routineExerciseId assumption) — logged as WINDOWS #123 for a follow-up plan to thread cycle identity through session creation."
  - "The mid-session-add e2e case (workout-screen.spec.ts) was written per Task 3's acceptance criteria but not executed — CLAUDE.md's browser-testing-only-on-request rule applies, and the dispatch that requested this work explicitly repeated it. Recorded as WINDOWS #122 (unrun-verify) rather than silently left unrecorded."
  - "The Session Action Sheet's Reorder row has no drag UI this phase — 05-UI-SPEC.md defines the four fixed rows but no interaction for Reorder specifically; reorderSessionExercises is implemented and tested, with no UI trigger yet (WINDOWS #116, unchanged this session)."
  - "Swap opens the unmodified Phase 4 ExercisePickerModal (taking the first selected exercise) rather than SwapSuggestionList — 05-06-PLAN.md's Task 3 action text names both, contradicting itself; ExercisePickerModal is the reuse-unmodified, swap-execution-capable option (WINDOWS #117, unchanged this session)."
  - "Note is wired only at the exercise level (the action bar's Note button) — 05-UI-SPEC.md defines no set-level or session-level trigger this phase; setNote/NoteSheet support all three levels and are ready for a future trigger (WINDOWS #118, unchanged this session)."

requirements-completed: [LOG-14, LOG-15, LOG-16, LOG-17]

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
    description: "Warm-up generation is deterministic, durable and idempotent on re-tap: generateWarmupSets inserts exactly warmupSets()'s returned rows, a second tap regenerates rather than appends, a completed warm-up row survives, and a null/zero working weight writes no rows"
    requirement: "LOG-17"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/session-mutations.test.ts#generateWarmupSets, apps/mobile/lib/db/__tests__/session-query.test.ts#defaultWarmupWorkingWeightKg, apps/mobile/components/__tests__/WarmupSheet.test.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "The action bar, targets/note/warmup/overflow sheets and add/swap/remove/reorder are reachable from the live workout screen"
    requirement: "LOG-14"
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/workout.test.tsx (renderExercise now returns <ExercisePage>, pageDataByExercise threading, Add Exercise wiring)"
        status: pass
    human_judgment: true
    rationale: "Unit tests prove the props/wiring are correct by construction (workout.tsx renders <ExercisePage> with real pageDataByExercise, the Add Exercise chip opens a real Modal around the unmodified ExercisePickerModal), but confirming the sheets actually present and are tappable in a running app is a visual/interaction judgment call no unit test can make. The new e2e case (workout-screen.spec.ts) exercises the Add Exercise path end-to-end but was not executed this session (WINDOWS #122) — a human UAT pass or a real e2e run is still the deciding evidence for this deliverable."

duration: ~2h30m (original) + ~1h40m (continuation, WINDOWS #113/#114/#115 closure) — ~4h10m total
completed: 2026-08-24
status: complete
---

# Phase 5 Plan 6: Per-Exercise Action Bar, Targets/Note/Warm-up Sheets, and Session Action Sheet Summary

**Session-scoped mutation module (notes, targets/write-back, warm-up generation, add/swap/remove/reorder) plus the components that call it, now fully wired into the live workout screen — warm-up sets materialize as real `logged_set` rows off `@fitness/pr-rules`'s ladder, and the action bar/all four sheets are reachable through a real tap, not just proven at the component-unit level.**

## Performance

- **Duration:** ~2h30m (original session) + ~1h40m (continuation closing WINDOWS #113/#114/#115) — ~4h10m total
- **Tasks:** 3 of 3 completed
- **Files modified:** 22 (11 created, 11 modified — see key-files)

## Accomplishments

- `session-mutations.ts` owns every session-scoped write the action bar and overflow sheet perform: `setNote` (3 independent note columns, empty-normalizes-to-null), `setSessionExerciseTargets` (session-only snapshot write), `resolveWriteBackTarget`/`writeBackTargets` (D-15's write-side mirror of the `override ?? base` read), `generateWarmupSets` (LOG-17's delete-then-insert regenerate, ladder from `@fitness/pr-rules`), and `addExerciseToSession`/`swapSessionExercise`/`removeSessionExercise`/`reorderSessionExercises` (LOG-14 — remove is a stamp, never a delete).
- `ExerciseActionBar.tsx` exports `EXERCISE_ACTIONS` as a single ordered constant (D-13) — four always-visible items, Note carries a badge.
- `TargetsSheet.tsx` reuses `ExerciseSlotRow`'s stepper anatomy verbatim; Save and "Also update my program" are distinct handlers.
- `WarmupSheet.tsx` (new this continuation) resolves its default working weight via `defaultWarmupWorkingWeightKg` (this session's first working set, else D-16 history, else blank/required), previews the real `warmupSets()`-derived count and copy, and calls `generateWarmupSets` on confirm — no percentage/rounding math anywhere in the component.
- `SessionActionSheet.tsx` mirrors `RoutineActionSheet`'s row shape for the fixed Swap/Remove/Reorder/Info list, plus a `RemoveExerciseDialog` carrying the exact Copywriting Contract copy.
- `ExercisePage.tsx`'s stateful wrapper wires all five sheets into the `actionBarSlot` render-prop, and is now the component `workout.tsx`'s pager actually renders — every action bar item, every sheet, and the "W" badge (fed real `set_type` data via `ResolvedSetRow`) are reachable from the running screen.
- `workout.tsx`'s "Add Exercise" chip opens the unmodified Phase 4 `ExercisePickerModal` in a real Modal overlay; confirming calls `addExerciseToSession` and reloads.
- `session-query.ts`'s `loadSessionTree` now filters `removed_at IS NULL`, so `removeSessionExercise` actually has a visible effect on the live strip and pager for the first time.
- `apps/mobile/package.json` declares `@fitness/pr-rules` as a workspace dependency (orchestrator-authorised carve-out of the wave's dependency freeze); `pnpm-lock.yaml` updated accordingly.
- 118 new/updated unit tests this continuation on top of the original 92 (210 total across this plan's suites); full mobile suite (64 suites / 1176 tests), `pnpm --filter mobile typecheck`, and `pnpm --filter mobile lint` are all green.

## Task Commits

Each unit of completed work was committed atomically:

1. **Session-scoped mutations data layer (Task 1 writes + Task 3 writes, same module)** - `1e0e906` (feat)
2. **Task 1: exercise action bar and mid-workout targets/note sheets** - `98cf981` (feat)
3. **Task 3: session action sheet and ExercisePage warm-up badge + full wiring** - `3663017` (feat)
4. **WINDOWS.md ledger entries for deferred/blocked items** - `ba0176d` (docs)
5. **Link @fitness/pr-rules into apps/mobile (dependency freeze carve-out)** - `9129823` (chore)
6. **Task 2: auto-calculated warm-up sets, generateWarmupSets + WarmupSheet.tsx** - `f8f3b95` (feat)
7. **Wire ExercisePage into the live workout screen** - `3d12444` (fix)
8. **Add the mid-session-add e2e case** - `4aa04ca` (test)
9. **Resolve WINDOWS #113/#114/#115, log the cycleId follow-up gap** - `d985d57` (docs)

**Plan metadata:** this SUMMARY.md's own commit follows.

## Files Created/Modified

- `apps/mobile/lib/db/session-mutations.ts` - every session-scoped write this plan's surfaces perform, including `generateWarmupSets`
- `apps/mobile/components/ExerciseActionBar.tsx` - `EXERCISE_ACTIONS`, `ExerciseActionBarView`, `ExerciseActionBar`
- `apps/mobile/components/TargetsSheet.tsx` - `TargetsSheetView`, `TargetsSheet`
- `apps/mobile/components/NoteSheet.tsx` - `NoteSheetView`, `NoteSheet`
- `apps/mobile/components/WarmupSheet.tsx` - `WarmupSheetView`, `WarmupSheet` (new this continuation)
- `apps/mobile/components/SessionActionSheet.tsx` - `SESSION_EXERCISE_ACTIONS`, `SessionActionSheetView`, `SessionActionSheet`, `RemoveExerciseDialog`
- `apps/mobile/components/ExercisePage.tsx` - "W" badge rendering, `setType` field, fully-wired stateful `ExercisePage` wrapper (now including the Warm-up sheet)
- `apps/mobile/components/ExerciseSlotRow.tsx` - exports `renderTargetStepper`/`TargetStepperProps` for `TargetsSheet`'s reuse
- `apps/mobile/lib/db/log-set.ts` - `updateLoggedSet` gains an optional `setType` patch
- `apps/mobile/lib/db/session-query.ts` - `defaultWarmupWorkingWeightKg`, `SessionExerciseRow.routineExerciseId`/`.notes`, `removed_at IS NULL` filter on `loadSessionTree`
- `apps/mobile/app/(tabs)/workout.tsx` - renders `ExercisePage` (not `ExercisePageView`), `pageDataByExercise` view-model, Add Exercise picker wiring, `setType` threaded through `buildSetRows`
- `apps/mobile/package.json` / `pnpm-lock.yaml` - `@fitness/pr-rules` workspace dependency link
- `apps/mobile/e2e/workout-screen.spec.ts` - mid-session-add-exercise case (written, not executed — WINDOWS #122)
- `apps/mobile/lib/db/__tests__/session-mutations.test.ts`, `apps/mobile/lib/db/__tests__/session-query.test.ts`, `apps/mobile/components/__tests__/{ExerciseActionBar,TargetsSheet,SessionActionSheet,WarmupSheet}.test.tsx`, `apps/mobile/app/(tabs)/__tests__/workout.test.tsx` - 210 total tests across this plan
- `.planning/WINDOWS.md` - #113/#114/#115 resolved to fixed; #122 (unrun-verify) and #123 (cycleId deviation) appended; #116-#118 unchanged

## Decisions Made

See `key-decisions` in the frontmatter above for the full, current list (the original session's Task-2-halted rationale has been superseded — Task 2 is implemented in this continuation).

## Deviations from Plan

### Auto-fixed Issues (original session)

**1. [Rule 3 - Blocking] `packages/api-contracts` and `packages/pr-rules` had no `dist/` build output**
- **Found during:** first typecheck run
- **Fix:** Ran `pnpm build` inside `packages/api-contracts` (build step, no code change).

**2. [Rule 1 - Bug, self-caught before commit] Widening `ThemeColors` broke 10 unrelated test files**
- **Found during:** Task 3 (`SessionActionSheet.tsx` needed a destructive icon color)
- **Fix:** Reverted `theme-colors.ts`; resolved the two colors locally inside `SessionActionSheet.tsx`.

### Auto-fixed Issues (this continuation)

**3. [Rule 1 - Bug] `SessionExerciseRow` widening broke an existing test fixture**
- **Found during:** typecheck after adding `routineExerciseId`/`notes` to `SessionExerciseRow`
- **Issue:** `workout.test.tsx`'s `EXERCISE` fixture was missing the two new required fields.
- **Fix:** Added `routineExerciseId: null, notes: null` to the fixture.
- **Verification:** `pnpm --filter mobile typecheck` clean; full suite green.
- **Committed in:** `f8f3b95`

**4. [Rule 1 - Bug] `renderCurrentExercisePage` test helper broke when `renderExercise` started returning a stateful `<ExercisePage>` instead of `<ExercisePageView>`**
- **Found during:** wiring `workout.tsx` to render `ExercisePage`
- **Issue:** The helper called `ExercisePageView(pageElement.props)` directly; `<ExercisePage>`'s own props don't carry `colors`/`actionBarSlot` (resolved internally via `useThemeColors()`), so this would have rendered with `colors: undefined`.
- **Fix:** Per this codebase's established "never direct-invoke a stateful wrapper" convention, the helper now reads only the SetRowView-facing pass-through props off the raw `<ExercisePage>` element and feeds them into `ExercisePageView` with the same `COLORS` fixture every other hook-free view in this file already uses.
- **Verification:** All four `renderCurrentExercisePage`-based tests pass unchanged in behavior.
- **Committed in:** `3d12444`

**Task 2 is no longer a halt.** The original session's halted-Task-2 deviation is resolved by this continuation's explicit dependency-freeze carve-out (see Decisions Made) — not re-listed as an open deviation.

---

**Total deviations:** 4 auto-fixed (2 in the original session, 2 in this continuation) + 0 currently halted.
**Impact on plan:** All auto-fixes were necessary corrections with no scope creep, directly caused by this plan's own structural changes.

## Issues Encountered

- (Original session) Jest hoisting rule required renaming a mock-factory variable to `mockIdCounter`; `TargetsSheet.test.tsx` needed `@/lib/db/powersync` mocked to avoid parsing the real `@powersync/react-native` ESM chain.
- (This continuation) `session-mutations.test.ts`'s generic `inMemoryDb` aggregate mock hardcodes `row.orderIndex` for its `MAX(...)` special case — it does not correctly compute `MAX(set_index)` for `logSet`'s own aggregate query. This is a pre-existing test-infrastructure limitation (not introduced this session); it does not affect any assertion in the new `generateWarmupSets` tests, which check insertion order and row shape rather than the resulting `set_index` values, but is worth a future test-infra fix if a test ever needs to assert real `set_index` ordering through this mock.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The mutation layer (`session-mutations.ts`), every component, and the live-screen wiring built across both sessions are complete, typechecked, and unit-tested — LOG-14 through LOG-17 are now true end-to-end at the unit/wiring level, not just at the component-unit level as the original session left them.
- 05-08 and 05-10 (both depend on 05-06) can treat this plan as `status: complete` — the previously-flagged `status: halted` from the original session's Known Gaps no longer applies.
- `pnpm --filter mobile test` (64 suites / 1176 tests), `pnpm --filter mobile typecheck`, and `pnpm --filter mobile lint` are all green in this worktree.
- D-33's single-funnel invariant holds: a source scan of `apps/mobile/lib/db/` for `insert(workoutSession)` returns exactly one match, in `log-set.ts`.
- **Remaining known gaps, tracked in `.planning/WINDOWS.md` (open):**
  - **#116** — Session Action Sheet's Reorder row has no drag UI this phase.
  - **#117** — Swap reuses `ExercisePickerModal` rather than `SwapSuggestionList`; minor copy mismatch against the plan's self-contradictory action text.
  - **#118** — Note is wired only at the exercise level; set/session-level triggers are a future plan's job.
  - **#122** — The new mid-session-add e2e case was written but not executed (browser-testing-only-on-request); needs a real `pnpm --filter mobile test:e2e:durability` run, in particular to confirm the `ExercisePickerModal`/harness `useProductionDb()` catalog-routing technique actually works.
  - **#123** — `cycleId` is not persisted on a live session; `TargetsSheet`'s write-back for a programmed exercise always targets the base `routine_exercise` row rather than a cycle-specific override, until cycle identity is threaded through session creation.

## Self-Check: PASSED

All files created/modified this continuation confirmed present via `git ls-files` (`apps/mobile/components/WarmupSheet.tsx`, `apps/mobile/components/__tests__/WarmupSheet.test.tsx`, and the modified `session-mutations.ts`/`session-query.ts`/`workout.tsx`/`ExercisePage.tsx`/`package.json`/`pnpm-lock.yaml`/`e2e/workout-screen.spec.ts`/test files/`WINDOWS.md`). All 9 commit hashes (`1e0e906`, `98cf981`, `3663017`, `ba0176d`, `9129823`, `f8f3b95`, `3d12444`, `4aa04ca`, `d985d57`) confirmed present via `git log`. No missing items.

---
*Phase: 05-in-gym-session-logging*
*Completed: 2026-08-24*
