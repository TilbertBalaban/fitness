---
phase: 05-in-gym-session-logging
plan: 15
subsystem: mobile-e2e
tags: [react-native-web, powersync, reorder-drag, drag-and-drop, session-action-sheet, durability-harness, playwright]

# Dependency graph
requires:
  - phase: 05-in-gym-session-logging
    provides: "05-13's UI-SPEC Amendment A.3/E12 contract for ReorderExercisesSheet, 05-12's db-threading precedent (a722ce4, WINDOWS #134) and 05-14's continuation of it (WINDOWS #135) for sheets that write through session-mutations.ts"
provides:
  - "ReorderExercisesSheet/ReorderExercisesSheetView — a real drag-and-drop reorder surface reachable from SessionActionSheet's Reorder row, closing WINDOWS #116's documented no-op"
  - "reorderSessionExercises wrapped in a single db.transaction (WR-02-style all-or-nothing guarantee)"
  - "computeDropTarget's optional rowHeight parameter, letting a caller's own measured row height (rather than Phase 4's fixed SLOT_ROW_HEIGHT) govern the drop arithmetic"
  - "reorder-exercises.spec.ts: a browser-real, registered proof that a real pointer drag through DragHandle.web.tsx commits a new order_index sequence, is idempotent on a zero-translation re-drop, and never touches a removed exercise"
affects: [05-16, ExercisePage, DragHandle, SessionActionSheet]

# Actuals (#2632)
actuals:
  tokens: 11800
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "reorderSessionExercises's db-threading follows the exact optional-db-with-getPowerSync()-default pattern 05-12/05-14 established for TargetsSheet/NoteSheet — the same getPowerSync()-default gap, fixed the same way, for the same reason (durability-harness database isolation)."
    - "computeDropTarget's rowHeight parameter is optional with a preserved default (SLOT_ROW_HEIGHT), the same reversible-extension shape Task 1 used for the transaction wrapper — new capability added without touching any existing caller's behavior."
    - "The ordered-array reconstruction a drop implies (applyReorder, the inverse of reorder-drag.ts's neighboursForIndex) is kept as an exported pure function on the sheet's own module, not inlined in the stateful wrapper — this is what makes 'a drop calls the mutation with the expected ordered id array' testable by direct invocation without mounting hooks or a database, matching this codebase's established TargetsSheet.test.tsx convention of never rendering a stateful sheet wrapper in a unit test."

key-files:
  created:
    - apps/mobile/components/ReorderExercisesSheet.tsx
    - apps/mobile/components/__tests__/ReorderExercisesSheet.test.tsx
    - apps/mobile/e2e/reorder-exercises.spec.ts
  modified:
    - apps/mobile/lib/programs/reorder-drag.ts
    - apps/mobile/lib/db/session-mutations.ts
    - apps/mobile/lib/db/__tests__/session-mutations.test.ts
    - apps/mobile/lib/programs/__tests__/reorder-drag.test.ts
    - apps/mobile/components/ExercisePage.tsx
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/components/EditingWorkoutScreen.tsx
    - apps/mobile/components/DragHandle.tsx
    - apps/mobile/components/DragHandle.web.tsx
    - apps/mobile/playwright.config.ts

key-decisions:
  - "DragHandle.tsx/DragHandle.web.tsx gained an optional rowHeight prop (WINDOWS #137), despite the plan's own <verification> line naming both files as staying unmodified. E12's must-have that 'the drag unit is the measured row height, not a fixed constant' can only be true if the sheet's actual gesture path — the real stateful DragHandle, reused per the dispatch's explicit 'do not reinvent a drag surface' instruction — receives that measurement. The prop is additive and default-preserving (undefined at every existing ExerciseSlotRow call site), so Phase 4's reorder callers are byte-identical to before; all 53 existing DragHandle/ExerciseSlotRow unit tests still pass unchanged."
  - "ExercisePage.tsx's handleConfirmRemove now threads db into removeSessionExercise (WINDOWS #138) — the same getPowerSync()-default gap 05-12/05-14 found for TargetsSheet/NoteSheet, surfaced here because Task 3's own removed-exercise test case is the first to browser-test the Remove path against an isolated harness database. handleSwapPick's identical latent defect is untouched — no test in this plan exercises it."
  - "applyReorder (the ordered-array reconstruction a drop implies) is exported as a pure function on ReorderExercisesSheet.tsx rather than inlined in the stateful wrapper, so 'a drop produces the expected ordered id array' is testable by direct invocation, matching TargetsSheet.test.tsx's established convention of never rendering a stateful sheet wrapper in a unit test — the actual reorderSessionExercises call is proven only by the e2e spec."
  - "logSecondExerciseWorkingSet (the e2e spec's helper) switches to the LAST seeded exercise via the strip chip before logging a set, not the first — shouldAutoAdvance never advances past the last exercise (lib/session/auto-advance.ts), so this sidesteps WINDOWS #136 entirely rather than working around it, and doubles as the only way to give the two otherwise-identical 'Unknown exercise' rows distinct completion fractions in this harness."
  - "closeReorderSheet accepts an optional expected first-chip name and polls for it before returning — onDone's onExerciseChanged() reload is a separate async operation from closeSheet()'s own synchronous state update, and proceeding immediately produced an intermittent 'element is not stable'/'outside of viewport' click failure on the very next action-bar interaction. This is a real DOM-settling wait, not a fixed sleep."

requirements-completed: [LOG-14]

coverage:
  - id: D1
    description: "The Reorder row in SessionActionSheet opens ReorderExercisesSheet instead of dismissing as a no-op (WINDOWS #116); the sheet lists one row per non-removed exercise with a trailing DragHandle when two or more exist, none when one or zero exist, and an explicit empty-copy state with Done still enabled."
    requirement: LOG-14
    verification:
      - kind: unit
        ref: "components/__tests__/ReorderExercisesSheet.test.tsx — 'renders one row per exercise...', 'renders a drag handle per row when the list holds two or more...', 'renders no drag handle for a single-exercise list', 'renders the empty copy with Done still enabled...'"
        status: pass
      - kind: e2e
        ref: "e2e/reorder-exercises.spec.ts — 'dragging the second exercise above the first commits the new order', 'a removed exercise is neither listed nor renumbered'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dragging a row through the real DragHandle.web.tsx pointer-capture path commits a new order_index sequence via reorderSessionExercises, and the exercise strip's own order reflects it after Done."
    requirement: LOG-14
    verification:
      - kind: e2e
        ref: "e2e/reorder-exercises.spec.ts — 'dragging the second exercise above the first commits the new order'"
        status: pass
    human_judgment: false
  - id: D3
    description: "reorderSessionExercises wraps its order_index update loop in a single db.transaction (WR-02-style all-or-nothing guarantee), and calling it twice with the same ordered ids is idempotent — both proven by unit tests and by a real zero-translation re-drop in the browser."
    requirement: LOG-14
    verification:
      - kind: unit
        ref: "lib/db/__tests__/session-mutations.test.ts — 'runs all of its order_index updates inside exactly one transaction call', 'is idempotent — calling it twice with the same ordered ids...'"
        status: pass
      - kind: e2e
        ref: "e2e/reorder-exercises.spec.ts — 'reordering is idempotent'"
        status: pass
    human_judgment: false
  - id: D4
    description: "computeDropTarget's optional rowHeight parameter governs the drag unit (falling back to SLOT_ROW_HEIGHT when absent/zero/negative/non-finite), and Phase 4's existing DragHandle/ExerciseSlotRow callers are unaffected by its addition."
    requirement: LOG-14
    verification:
      - kind: unit
        ref: "lib/programs/__tests__/reorder-drag.test.ts — 'with no rowHeight, behaves byte-identically...', 'the same translationY resolves to different toIndex values...', 'a zero or negative rowHeight falls back to SLOT_ROW_HEIGHT...'; components/__tests__/DragHandle.test.tsx and components/__tests__/ExerciseSlotRow.test.tsx (53 pre-existing cases, all still passing)"
        status: pass
    human_judgment: false

duration: ~2h
completed: 2026-08-26
status: complete
---

# Phase 5 Plan 15: Reorder Exercises Sheet Summary

**A real drag-and-drop ReorderExercisesSheet — composing Phase 4's DragHandle and reorder-drag.ts exactly as 05-13's Amendment A.3 specified — replaces SessionActionSheet's documented Reorder no-op, backed by a transactional reorderSessionExercises and proven end to end with a real browser pointer drag against an isolated PowerSync database.**

## Performance

- **Duration:** ~2h
- **Tasks:** 3 of 3 complete
- **Files modified:** 13 (3 net-new: `ReorderExercisesSheet.tsx`, its test file, `reorder-exercises.spec.ts`)

## Accomplishments

- `computeDropTarget` gained an optional `rowHeight` parameter (falling back to `SLOT_ROW_HEIGHT` when absent, zero, negative or non-finite), and `reorderSessionExercises` now wraps its `order_index` update loop in a single `db.transaction`, mirroring `duplicateSession`'s WR-02 shape — an interrupted reorder can no longer leave two exercises sharing a position.
- New `ReorderExercisesSheet`/`ReorderExercisesSheetView` (hook-free view + thin stateful wrapper, per this codebase's established split) renders one row per non-removed exercise — name over its `N/M` completion fraction, trailing `DragHandle` when two or more exist — with an explicit empty-list state ("No exercises to reorder", Done still enabled) and never truncates a name (R4).
- `ExercisePage`'s `'reorder'` overflow branch now opens the sheet instead of dismissing it; `SESSION_EXERCISE_ACTIONS`' fixed four-row arity and `SessionActionSheet.tsx`/`ExerciseSlotRow.tsx` are untouched.
- `reorder-exercises.spec.ts` (new, registered in `playwright.config.ts`) proves three cases against a real `@powersync/web` database, all driving the real sheet through DOM pointer events: a drag commits a new `order_index` order and updates the strip; a zero-translation re-drop is idempotent; a removed exercise is excluded from the sheet and its `order_index`/`removed_at` are untouched by a reorder.
- Two `getPowerSync()`-default gaps were found and fixed as part of making this real: `DragHandle`'s drop arithmetic (via a new optional `rowHeight` prop, WINDOWS #137) and `ExercisePage`'s Remove path (WINDOWS #138) — both the same class of defect 05-12/05-14 already fixed for `TargetsSheet`/`NoteSheet` (WINDOWS #134/#135).

## Task Commits

1. **Task 1: Make the drop arithmetic font-scale-aware and the commit transactional** — `a626c53` (feat)
2. **Task 2: Build the reorder sheet and mount it on the Reorder row** — `4552d12` (feat)
   - `a41f28c` (docs) — recorded WINDOWS #137 for the `DragHandle` `rowHeight` deviation
3. **Task 3: Prove a real drag in a real browser** — `b96a03f` (test)

## Files Created/Modified

- `apps/mobile/lib/programs/reorder-drag.ts` — `ComputeDropTargetInput.rowHeight` (optional, default-preserving)
- `apps/mobile/lib/db/session-mutations.ts` — `reorderSessionExercises` wrapped in `db.transaction`
- `apps/mobile/lib/db/__tests__/session-mutations.test.ts` — transaction-count, idempotency, sessionId-scoping cases; `getTransactionCount()` added to the shared in-memory fake
- `apps/mobile/lib/programs/__tests__/reorder-drag.test.ts` — `rowHeight` default/override/fallback cases
- `apps/mobile/components/ReorderExercisesSheet.tsx` — new component: `ReorderExercisesSheetView`, `ReorderExercisesSheet`, `applyReorder`
- `apps/mobile/components/__tests__/ReorderExercisesSheet.test.tsx` — new, 13 cases
- `apps/mobile/components/ExercisePage.tsx` — `sessionExercises` prop, `'reorder'` `ActiveSheet` member, the sheet mounted in `actionBarSlot`, `handleConfirmRemove` threads `db` (WINDOWS #138)
- `apps/mobile/app/(tabs)/workout.tsx`, `apps/mobile/components/EditingWorkoutScreen.tsx` — pass `sessionExercises={exercises}` to `ExercisePage`
- `apps/mobile/components/DragHandle.tsx`, `apps/mobile/components/DragHandle.web.tsx` — optional `rowHeight` prop threaded into `computeDropTarget` (WINDOWS #137)
- `apps/mobile/e2e/reorder-exercises.spec.ts` — new, three browser-real cases
- `apps/mobile/playwright.config.ts` — registered the new spec

## Decisions Made

See `key-decisions` in frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — missing critical functionality, WINDOWS #137] Threaded an optional `rowHeight` prop through `DragHandle.tsx`/`DragHandle.web.tsx`**
- **Found during:** Task 2, wiring the sheet's measured row height into the actual drag gesture
- **Issue:** The plan's own `<verification>` names `DragHandle.tsx`/`DragHandle.web.tsx` as staying unmodified, but E12's must-have ("the drag unit is the measured row height rather than a fixed constant") cannot be true unless the sheet's real gesture path — the stateful `DragHandle` itself, reused rather than reinvented per the dispatch's explicit instruction — receives that measurement. `DragHandleProps` had no such input; without it, the sheet's own `rowHeight` state would be dead plumbing.
- **Fix:** Added an optional `rowHeight?: number` to `DragHandleProps` in both files, threaded into each file's own `computeDropTarget` call. Undefined at every existing call site (`ExerciseSlotRow`), so Phase 4's reorder callers are byte-identical to before — the same reversible, default-preserving shape Task 1 used for `computeDropTarget` itself.
- **Files modified:** `apps/mobile/components/DragHandle.tsx`, `apps/mobile/components/DragHandle.web.tsx`
- **Verification:** `pnpm --filter mobile test -- components/__tests__/DragHandle.test.tsx components/__tests__/ExerciseSlotRow.test.tsx` — 53/53 pass unchanged; `pnpm --filter mobile typecheck` exits 0.
- **Committed in:** `4552d12` (Task 2 commit)
- **Recorded:** WINDOWS #137 (`deviation`).

**2. [Rule 1 — bug, WINDOWS #138] Threaded `db` through `ExercisePage`'s `handleConfirmRemove`**
- **Found during:** Task 3, first real run of "a removed exercise is neither listed nor renumbered"
- **Issue:** `handleConfirmRemove` called `removeSessionExercise(sessionExerciseId)` with no `db` argument, so the write always resolved the production `getPowerSync()` singleton instead of the harness's isolated per-test database — the identical defect class 05-12/05-14 found and fixed for `TargetsSheet`/`NoteSheet` (WINDOWS #134/#135), now surfaced by the first test in this phase to browser-test the Remove path. The removal silently landed in the wrong SQLite file; the spec's raw read never saw `removed_at` set, with no error anywhere in the interaction.
- **Fix:** `await removeSessionExercise(sessionExerciseId, db ?? getPowerSync())`, matching the pattern already used for Targets/Note/Reorder.
- **Files modified:** `apps/mobile/components/ExercisePage.tsx`
- **Verification:** `pnpm --filter mobile test:e2e:durability e2e/reorder-exercises.spec.ts` — 3/3 pass, run 3 times consecutively with no flake, plus once more as part of a full `durability` project run (see Issues Encountered).
- **Committed in:** `b96a03f` (Task 3 commit)
- **Recorded:** WINDOWS #138 (`deviation`). `handleSwapPick`'s `swapSessionExercise` call shares the identical latent defect but is unexercised by any test in this plan — left unfixed and flagged for whichever future plan first browser-tests the swap path.

---

**Total deviations:** 2 auto-fixed (1 Rule 2 — missing capability required by an explicit must-have, 1 Rule 1 — bug blocking this plan's own verification). Both are the same additive, default-preserving `db`/`rowHeight`-threading shape already established by 05-12/05-14/Task 1 of this plan — no architectural change, no new dependency.
**Impact on plan:** Both required for the plan's own acceptance criteria (E12's font-scale drag-unit must-have; a real passing removed-exercise e2e case). No scope creep beyond the two files each fix touched.

## Issues Encountered

**`ExercisePagerView`'s inactive page is present in the DOM but not the accessibility tree.** `session-notes.spec.ts`'s own comment ("both exercise pages present in the accessibility tree at once") describes a transient state, not a persistent one — by the time this spec's assertions run, only the CURRENTLY ACTIVE page's controls carry accessible names; the inactive page's buttons resolve with no name. `nth(1)`-scoping a role+name locator across both pages (this spec's first attempt, copying `session-notes.spec.ts`'s `.first()` idiom) therefore only ever finds ONE match. Fixed by switching to the second exercise via its strip chip (the one control visible for both pages regardless of which is active) before interacting with its now-active, now-named controls with no `nth()` scoping at all.

**A genuine UI-settling race, not a flake.** The second `openReorderSheet` call within the idempotency test intermittently failed with "element is not stable" / "outside of viewport" on the exercise action bar's "More" button. `onDone`'s `onExerciseChanged()` reload is a separate async operation from `closeSheet()`'s own synchronous state update — waiting only for the sheet to visually close proves nothing about whether the strip/pager has finished re-rendering with the new order. Fixed by having `closeReorderSheet` poll for the strip's expected first-chip name before returning — a real DOM signal tied to the actual state transition, not a fixed sleep, exactly the class of fix 05-12 used for `TargetsSheet`'s own Save/write-back race.

**`order_index` is not 0-based before any reorder.** `startWorkoutFromProgram` carries the seeded slots' own `orderIndex` values (1024, 2048 — `(index+1)*1024`) verbatim; only `reorderSessionExercises`'s own loop renumbers to 0-based positions. Discovered via a debug read while diagnosing the Remove-path bug above; no test in this spec asserted the wrong value as a result (post-reorder assertions correctly expect 0/1, since a reorder always renumbers), but it is worth flagging for any future spec that reads raw `order_index` before a reorder has ever run.

**The `pnpm -- ` forwarding quirk the dispatch warned about was avoided by using `--list` first**, confirming exactly 3 tests scoped before every real run.

**Full `durability` project run (all 30 specs) after this plan's changes** shows exactly the 11 pre-existing failures the dispatch named as "known-failing, not yours to fix" (`rest-timer` ×5, `session-edit` ×2, `session-lifecycle` ×1, `workout-screen` ×2, `workout-summary` ×1) — 22 passed, 11 failed, no new regressions introduced by this plan's changes.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- LOG-14's reorder half is closed: the Reorder row opens a real drag surface, commits through a transactional and idempotent `reorderSessionExercises`, and a removed exercise is proven excluded from both the list and the renumbering — all proven by a real, registered, three-times-green browser spec plus 66 new/updated unit test cases (13 in `ReorderExercisesSheet.test.tsx`, 6 in `session-mutations.test.ts`, 4 in `reorder-drag.test.ts`, plus the existing 53 `DragHandle`/`ExerciseSlotRow` cases confirmed unaffected).
- WINDOWS #116 (Reorder documented no-op) is closed.
- WINDOWS #134's `getPowerSync()`-default class of defect now has two more confirmed instances (`DragHandle`'s drop arithmetic via `rowHeight`, WINDOWS #137; `ExercisePage`'s Remove path, WINDOWS #138) fixed alongside `TargetsSheet`/`NoteSheet` (#134/#135). Only `WarmupSheet` and `ExercisePage`'s swap handler still carry it, unexercised by any test in this phase — worth flagging for whichever future plan first browser-tests those paths.
- WINDOWS #136 (LOG-13 auto-advance fires one set too early) remains open, unaffected by this plan — this spec's helper sidesteps it entirely by logging on the last exercise rather than working around it, which is itself indirect evidence supporting #136's diagnosis (advancing past a non-last exercise is exactly the behavior this spec had to avoid triggering).
- 05-16 (the phase's remaining "known-failing" e2e cleanup) can proceed against a full-suite baseline unchanged by this plan.

## Self-Check: PASSED

- FOUND: `apps/mobile/components/ReorderExercisesSheet.tsx`
- FOUND: `apps/mobile/components/__tests__/ReorderExercisesSheet.test.tsx`
- FOUND: `apps/mobile/e2e/reorder-exercises.spec.ts`
- FOUND: `apps/mobile/lib/programs/reorder-drag.ts`
- FOUND: `apps/mobile/lib/db/session-mutations.ts`
- FOUND: `apps/mobile/components/ExercisePage.tsx`
- FOUND: `apps/mobile/components/DragHandle.tsx`
- FOUND: `apps/mobile/components/DragHandle.web.tsx`
- FOUND: `apps/mobile/playwright.config.ts`
- FOUND: commit `a626c53` (Task 1)
- FOUND: commit `4552d12` (Task 2)
- FOUND: commit `a41f28c` (WINDOWS #137 docs)
- FOUND: commit `b96a03f` (Task 3)

---
*Phase: 05-in-gym-session-logging*
*Completed: 2026-08-26*
