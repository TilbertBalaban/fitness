---
phase: 04-program-builder
plan: 08
subsystem: ui
tags: [react-native, expo, nativewind, powersync, drizzle, local-first, program-builder, cycles]

# Dependency graph
requires:
  - phase: 04-program-builder (04-02)
    provides: loadProgramTree's one-query-per-table read path, the gap-based order_index primitives, and days.ts's computeReorder / WriteDb write-seam patterns this plan's cycle helpers reuse
  - phase: 04-program-builder (04-03)
    provides: ExerciseSlotRow's stepper anatomy and targets.ts's validateTargets, which per-cycle overrides run through unchanged
  - phase: 04-program-builder (04-05)
    provides: The DayDeck the cycle strip is pinned above, and the ExerciseSlotRow drag-handle/Move-up-down structure this plan extends
  - phase: 04-program-builder (04-06)
    provides: routine_cycle and the CYCLE_KINDS tuple
  - phase: 04-program-builder (04-07)
    provides: routine_exercise_cycle_target, resolveTarget/EMPTY_TARGET/isEmptyOverride, and the three server-side cascade-tombstone paths this plan deliberately does not duplicate on the client
provides:
  - apps/mobile/lib/db/programs/cycles.ts — validateCycle/addCycle/renameCycle/setCycleKind/setCycleDuration/moveCycle/removeCycle plus setCycleTarget/clearCycleTarget, the write path the override table's sparseness depends on
  - apps/mobile/components/CycleStrip.tsx — the D-22 pinned single-select chip strip, with cycleChipLabel/cycleChipTone/cycleChipAccessibilityLabel as pure, assertable presentation helpers
  - ProgramTree.cycles and ProgramSlot.overridesByCycleId, loaded in two more flat selects that keep the builder at five queries per program open
  - selectedCycleOf/resolveSlotTargets/overriddenFields/overrideDelta in programs.tsx — the screen's cycle-aware resolution and the base-vs-override write routing
affects: [04-09-next-up-card, 04-10-log-set-session-snapshot, 04-11-program-library, phase-8-progression-engine]

# Actuals (#2632)
actuals:
  tokens: 23992
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A per-cycle override is written as a DELTA against the base (overrideDelta), never as a five-column copy of the resolved values — a field equal to the base stays null, which is what lets isEmptyOverride later delete a row that no longer overrides anything"
    - "Kind and selection are orthogonal visual dimensions on a chip: kind is drawn with icon + border-style + opacity, selection with the accent, and neither is ever expressed through the other — so no second semantic hex is introduced for a non-destructive distinction"
    - "A screen that can write to two different tables branches on ONE piece of view state and calls a different single-purpose helper per branch, each incapable of reaching the other's table — mis-routing becomes a structural impossibility rather than a runtime risk"

key-files:
  created:
    - apps/mobile/lib/db/programs/cycles.ts
    - apps/mobile/lib/db/__tests__/cycles.test.ts
    - apps/mobile/components/CycleStrip.tsx
    - apps/mobile/components/__tests__/CycleStrip.test.tsx
  modified:
    - apps/mobile/lib/db/programs/load-program.ts
    - apps/mobile/lib/db/__tests__/programs.test.ts
    - apps/mobile/components/ExerciseSlotRow.tsx
    - apps/mobile/components/__tests__/ExerciseSlotRow.test.tsx
    - apps/mobile/app/(tabs)/programs.tsx
    - apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts
    - apps/mobile/lib/db/programs/days.ts

key-decisions:
  - "computeReorder and its SiblingRow type were promoted from private to exported in days.ts so moveCycle reuses the gap/renumber arithmetic instead of copying it. The plan's own action text said moveCycle 'copies exactly' moveDay's structure, which would have meant a third copy of the same twenty lines; a one-word additive export keeps the arithmetic in one place, matching the single-resolveTarget discipline 04-07 established for target merging. days.ts is an eleventh file beyond the plan's files_modified — recorded as a deviation below."
  - "The per-cycle override marker is a text suffix ('· this cycle', exported as CYCLE_OVERRIDE_MARKER) rendered beside the stepper's own label, with accessibilityLabel '{Field} overridden for this cycle'. 04-UI-SPEC.md is silent on how a cycle-specific number is distinguished; the plan required only that it be visible and 'perceivable without relying on colour alone'. Text was chosen over a coloured treatment because the UI-SPEC reserves accent for selection/CTAs and a second semantic hex for destructive actions only, leaving no palette slot for 'overridden'. Bounded and reversible — swapping in a different visual treatment touches one function."
  - "The strip's 'Edit Cycle' control renders inline in the strip, after the chips and only while a cycle is selected, calling onEditCycle(selectedCycleId). The plan gave CycleStrip an onEditCycle prop without saying how the user reaches it; a long-press would be undiscoverable, and a separate screen-level control would leave the prop dead. The control reuses the existing text-Pressable pattern already shipped for 'Add Exercises' and introduces no new visual language."
  - "setCycleKind and setCycleDuration each read the cycle row before writing, so a cycle can never become durationless time off through a path that skipped addCycle's duration check. Switching a time-off cycle back to training deliberately LEAVES its duration_days intact rather than nulling it: validateCycle treats a duration on a training cycle as valid, and silently discarding a number the user typed on a kind toggle is worse than a harmless unused column."
  - "loadProgramTree stores each override as a full five-key object (nulls included) rather than only the keys the row sets. The row shape and the map value shape then match exactly, resolveTarget already reads null as inherit, and overriddenFields does the non-null filtering at the one place that needs it."

patterns-established:
  - "Pattern: a chip row whose empty state is ABSENCE, not an empty container — CycleStrip returns null for zero cycles, the same rule FilterChipRow already applies to a facet with no values. The strip only exists once the user has created a cycle, so a non-periodized program never sees cycle chrome at all."
  - "Pattern: a UI-owned selection that drives resolution but is structurally incapable of moving an unrelated piece of state — DayDeck owns its page index internally and receives only `days`/`renderDay`, so no cycle-strip press can reset which day is on screen, by construction rather than by discipline."

requirements-completed: [PROG-04, PROG-05, PROG-06]

coverage:
  - id: D1
    description: "Cycle CRUD at the write boundary — a cycle cannot be created blank-named, with an unknown kind, or as time off without a duration of at least one day; each helper writes through the injectable db seam and issues exactly one logical mutation"
    requirement: "PROG-05"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/cycles.test.ts#validateCycle (4 cases), addCycle (7 cases + 2 seam cases), renameCycle, setCycleKind (4 cases), setCycleDuration (4 cases), moveCycle (2 cases), removeCycle"
        status: pass
    human_judgment: false
  - id: D2
    description: "A deload or time-off cycle is a kind at an order_index, not a separate column — the first cycle added to an empty routine takes the lowest index (deload at the start) and moveCycle repositions with the same gap arithmetic days and exercises use"
    requirement: "PROG-05"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/cycles.test.ts#gives the first cycle of an empty routine the lowest index, moveCycle issues exactly one update / renumbers in one pass"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/programs.test.ts#sorts cycles with sortByOrderThenId, breaking a tied orderIndex to ascending id"
        status: pass
    human_judgment: false
  - id: D3
    description: "Scheduling time off requires a duration in days before it can be saved — zero days is refused, one day is accepted, and a kind change cannot sneak a durationless time-off cycle in behind the check"
    requirement: "PROG-06"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/cycles.test.ts#refuses zero days off and accepts one, refuses a time-off cycle with no duration, refuses to make a durationless cycle time off"
        status: pass
    human_judgment: false
  - id: D4
    description: "setCycleTarget writes, updates, or deletes based on whether the override actually overrides anything — an existing (exercise, cycle) pair is updated rather than duplicated, an all-null override deletes its row, and a zero is written as a value"
    requirement: "PROG-04"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/cycles.test.ts#setCycleTarget (7 cases + 2 seam cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Opening a program with cycles and overrides issues exactly five local queries — one per table — regardless of how many days, exercises, cycles or overrides it holds"
    requirement: "PROG-04"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/programs.test.ts#issues exactly five selects — one per table — for a 3-day, 12-exercise, 4-cycle, 7-override routine"
        status: pass
    human_judgment: false
  - id: D6
    description: "The cycle strip renders training, deload and time-off chips as three mutually distinct tones with no second hex, single-select, 48x48, never truncating, and renders nothing at all for a routine with zero cycles"
    requirement: "PROG-05"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/CycleStrip.test.tsx#cycleChipTone (3 cases), CycleStripView (9 cases), cycleChipLabel (4 cases)"
        status: pass
    human_judgment: true
    rationale: "The tone table is asserted structurally (three distinct descriptors, dashed border, reduced opacity, no accent on time off), but whether the resulting strip actually reads as the shape of a block at a glance is a visual judgment. No native or browser rendering was performed — see WINDOWS entries below."
  - id: D7
    description: "Picking a cycle re-renders the same days with that cycle's resolved targets, resolving through the shared resolveTarget and never through an inlined `override ?? base`; a stale selection degrades to the base rather than throwing"
    requirement: "PROG-04"
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts#selectedCycleOf (4 cases), resolveSlotTargets (4 cases)"
        status: pass
      - kind: other
        ref: "test \"$(grep -rl 'export function resolveTarget' packages apps | wc -l | tr -d ' ')\" = \"1\" — resolveTarget is still defined in exactly one file across the workspace"
        status: pass
    human_judgment: false
  - id: D8
    description: "A target edit lands on the base prescription or on a cycle override according to the selection, never both, and an override is stored as the delta from the base rather than a five-column copy"
    requirement: "PROG-04"
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts#overrideDelta (4 cases)"
        status: pass
    human_judgment: false
  - id: D9
    description: "A resolved target coming from an override is visibly marked as cycle-specific and a Reset to base control clears it; both are absent when no cycle is selected"
    requirement: "PROG-04"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/ExerciseSlotRow.test.tsx#ExerciseSlotRowView — per-cycle override marking and reset (5 cases)"
        status: pass
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts#overriddenFields (4 cases)"
        status: pass
    human_judgment: false
  - id: D10
    description: "Switching cycles does not change which day is on screen — the deck index and the cycle selection are independent state"
    requirement: "PROG-04"
    verification:
      - kind: other
        ref: "Structural: DayDeck owns its page index in its own useState and receives only `days`/`renderDay` from programs.tsx (grep -A4 '<DayDeck' apps/mobile/app/(tabs)/programs.tsx), so no selectedCycleId change can reach it"
        status: pass
    human_judgment: true
    rationale: "The independence is structural and verifiable by inspection, but observing that the day genuinely stays put across a chip press requires running the app. Not done — no Xcode, no Android SDK, and browser verification is out of scope per CLAUDE.md."

# Metrics
duration: 22min
completed: 2026-08-21
status: complete
---

# Phase 4 Plan 08: Cycle Strip, Per-Cycle Targets and the Override Write Path Summary

**The builder now shows a block as a row of cycle chips above its days, and picking a chip re-renders the same days with that cycle's resolved numbers — with a target edit landing on the base or on a sparse override depending on what is selected, never both.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-21T15:21:00Z
- **Completed:** 2026-08-21T15:43:00Z
- **Tasks:** 3 of 3
- **Files modified:** 11 (4 created, 7 modified)

## Accomplishments

- `routine_cycle` and `routine_exercise_cycle_target` — both shipped as tables in 04-06/04-07 but unreachable from the app — are now fully authorable from the Programs tab.
- `setCycleTarget` is the write path that keeps the override table sparse: it updates an existing `(exercise, cycle)` pair rather than inserting a duplicate the server's unique constraint would reject, and it **deletes** rather than writing an override whose every field is null. Without that branch a six-cycle program accumulates one row per exercise per cycle — the per-week duplication D-02 exists to forbid.
- The tree still opens in five queries with cycles and overrides included, asserted by call count rather than left to review. Switching cycles is five reads regardless of program size.
- The three chip kinds are drawn with icon, border style and opacity — no second semantic hex — and selection is drawn with the accent uniformly, except for time off, which never takes the accent because accent means "trainable content ahead."

## Task Commits

Each task was committed atomically:

1. **Task 1: Cycle write helpers, and an override that deletes itself when it overrides nothing** — `c9d3731` (feat)
2. **Task 2: The strip, and a program tree that carries its cycles and overrides** — `6fcfce1` (feat)
3. **Task 3: The strip drives what the days show, and targets can be set per cycle** — `0a769d8` (feat)

_All three tasks were `tdd="true"`: the test file was written and run RED before the implementation existed, then run GREEN. RED and GREEN were committed together per task rather than as separate `test(...)`/`feat(...)` commits — see Deviations._

## Files Created/Modified

- `apps/mobile/lib/db/programs/cycles.ts` (new) — cycle CRUD plus the two override writes, each behind `db: WriteDb = getPowerSync()`, each one logical mutation.
- `apps/mobile/lib/db/__tests__/cycles.test.ts` (new) — 47 tests, including both sides of every boundary (`durationDays: 0` vs `1`, `{targetSets: 0}` vs `{}`, existing row vs none).
- `apps/mobile/components/CycleStrip.tsx` (new) — the pinned strip, split hook-free `CycleStripView` / stateful `CycleStrip`, with zero database calls.
- `apps/mobile/components/__tests__/CycleStrip.test.tsx` (new) — 17 tests.
- `apps/mobile/lib/db/programs/load-program.ts` — two more flat selects; `ProgramCycle`, `ProgramTree.cycles`, `ProgramSlot.overridesByCycleId`; dangling overrides dropped at load.
- `apps/mobile/lib/db/__tests__/programs.test.ts` — the query-count assertion moved from three to five; four new cycle/override cases.
- `apps/mobile/components/ExerciseSlotRow.tsx` — per-field override marker, `Reset to base`, and a `resolved` prop so the row displays the selected cycle's numbers without merging anything itself.
- `apps/mobile/components/__tests__/ExerciseSlotRow.test.tsx` — 5 new cases.
- `apps/mobile/app/(tabs)/programs.tsx` — the strip above the deck, the add/edit-cycle forms, and the base-vs-override write routing.
- `apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts` — 16 new cases across the four new pure helpers.
- `apps/mobile/lib/db/programs/days.ts` — `computeReorder`/`SiblingRow` promoted to exports (see Deviations).

## Decisions Made

See the `key-decisions` block in the frontmatter. In brief:

1. `computeReorder` exported from `days.ts` and reused by `moveCycle`, instead of a third copy of the reorder arithmetic.
2. The override marker is text (`· this cycle`), not colour — the UI-SPEC leaves no palette slot for "overridden".
3. `Edit Cycle` lives inline in the strip, visible only while a cycle is selected.
4. `setCycleKind`/`setCycleDuration` read before writing so a durationless time-off cycle is unreachable; switching away from time off keeps the duration rather than silently discarding it.
5. Override map values carry all five keys, nulls included, matching the row shape.

## Deviations from Plan

### 1. [Rule 3 - Blocking] `@fitness/api-contracts` had no build output in a fresh worktree

- **Found during:** Baseline verification, before Task 1
- **Issue:** 14 of 35 mobile suites failed with `Cannot find module '@fitness/api-contracts'`. The workspace symlink resolves correctly, but the package's `main` points at `./dist/index.js` and `dist/` is gitignored — so a freshly created worktree has the source but not the build.
- **Fix:** `pnpm --filter @fitness/api-contracts build` before establishing the baseline. No source change; nothing committed.
- **Verification:** Baseline then reported the documented 495 tests / 35 suites.
- **Note for the orchestrator:** every worktree-isolated executor in this repo that imports `@fitness/api-contracts` will hit this. It is a worktree-setup gap, not a code defect.

### 2. [Design call, autonomous] An eleventh file: `apps/mobile/lib/db/programs/days.ts`

- **Found during:** Task 1
- **Issue:** `moveCycle` needs exactly the sort/midpoint/renumber sequence `moveDay` and `moveExercise` already share through a private `computeReorder`. The plan's action text prescribed copying that structure into `cycles.ts`.
- **Fix:** Added the `export` keyword to `computeReorder` and its `SiblingRow` interface in `days.ts`, and imported them in `cycles.ts`. Two lines changed, no behaviour change, and `moveDay`/`moveExercise` are untouched.
- **Files modified:** `apps/mobile/lib/db/programs/days.ts`
- **Verification:** `pnpm --filter mobile test -- programs` — the existing `moveDay`/`moveExercise` suites are green unchanged.
- **Committed in:** `c9d3731`
- **Why it is reported:** `days.ts` is not in the plan's `files_modified`. It is not owned by 04-09's concurrent executor.

### 3. [Design call, autonomous] The UI-SPEC does not settle the override marker

- **Found during:** Task 3
- **Issue:** The plan requires that a cycle-specific number be "visibly distinguished" and "perceivable without relying on colour alone", but `04-UI-SPEC.md`'s Exercise Slot Row section says nothing about per-cycle override marking, and its Copywriting Contract has no row for it.
- **Fix:** A text suffix beside the field label, exported as `CYCLE_OVERRIDE_MARKER = '· this cycle'`, carrying `accessibilityLabel="{Field} overridden for this cycle"`. Label typography, muted foreground token, no new hex.
- **Files modified:** `apps/mobile/components/ExerciseSlotRow.tsx`
- **Verification:** `apps/mobile/components/__tests__/ExerciseSlotRow.test.tsx` — marker count and per-field identity asserted.
- **Committed in:** `0a769d8`
- **Escalation judgment:** the plan is `autonomous: true` and settles the behaviour; only the micro-copy was open, and every alternative palette treatment conflicts with a stated UI-SPEC reservation. Halting the plan on the choice of a five-character suffix was not proportionate. **If the user wants a different treatment, this is a one-function change.**

### 4. [Design call, autonomous] `onEditCycle` needed a discoverable affordance

- **Found during:** Task 2
- **Issue:** The plan gives `CycleStrip` an `onEditCycle` prop but never says how the user invokes it.
- **Fix:** An `Edit Cycle` text control rendered inside the strip, after the chips, only while a cycle is selected. Reuses the existing text-Pressable pattern.
- **Files modified:** `apps/mobile/components/CycleStrip.tsx`, `apps/mobile/app/(tabs)/programs.tsx`
- **Committed in:** `6fcfce1`, `0a769d8`

---

**Total deviations:** 4 (1 × Rule 3 environment fix, 3 × bounded design calls).
**Impact on plan:** no scope creep. One file beyond `files_modified`, changed by two lines, to avoid a third copy of shared arithmetic.

## TDD Gate Compliance

All three tasks carried `tdd="true"` and were executed RED-then-GREEN: each test file was written first and run against a missing or unextended implementation (Task 1: module-not-found; Task 2: module-not-found plus 7 failing `programs` cases; Task 3: 21 failing cases) before the implementation was written.

**Gate sequence warning:** the RED and GREEN states were **not committed separately**. Each task is a single `feat(04-08): …` commit containing both its test file and its implementation, so `git log` shows no `test(04-08): …` commit preceding each `feat`. The RED phase genuinely ran and genuinely failed — the failing output is quoted in the execution transcript — but it is not recoverable from git history. Future plans in this phase should commit the RED state before writing the implementation if the gate sequence needs to be auditable after the fact.

## Issues Encountered

- **The plan's own text carries stale six-target-field wording** ("update the existing row's six columns"). The shipped schema, `04-CONTEXT.md`'s amendment and `04-UI-SPEC.md` all say five, RIR singular. Five was implemented; no `target_rir_min`/`target_rir_max` was reintroduced.
- **Two pre-existing deep-equality assertions in `programs.test.ts` broke** when `ProgramTree` gained `cycles` and `ProgramSlot` gained `overridesByCycleId`. Both were updated in place rather than loosened — the assertions still deep-equal the whole object, which is what makes them worth having.

## Verification Results

Actual runner output, pasted rather than paraphrased.

Baseline at `889eb59` (after building `@fitness/api-contracts`):

```
Test Suites: 35 passed, 35 total
Tests:       495 passed, 495 total
```

After this plan:

```
$ pnpm --filter mobile test
Test Suites: 37 passed, 37 total
Tests:       584 passed, 584 total

$ pnpm --filter mobile typecheck
$ tsc --noEmit        (exit 0, no diagnostics)

$ pnpm --filter mobile build
Exported: dist       (exit 0)
```

Per-suite:

```
$ pnpm --filter mobile test -- cycles
Test Suites: 1 passed, 1 total
Tests:       47 passed, 47 total

$ pnpm --filter mobile test -- CycleStrip
Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total

$ pnpm --filter mobile test -- programs
Test Suites: 3 passed, 3 total
Tests:       70 passed, 70 total

$ pnpm --filter mobile test -- ExerciseSlotRow
Test Suites: 1 passed, 1 total
Tests:       29 passed, 29 total
```

Grep assertions from the plan's `<verify>` blocks:

```
$ grep -c "isEmptyOverride" apps/mobile/lib/db/programs/cycles.ts        -> 2
$ grep -c "CYCLE_KINDS" apps/mobile/lib/db/programs/cycles.ts            -> 3
$ grep -c "db: WriteDb = getPowerSync()" apps/mobile/lib/db/programs/cycles.ts -> 8
$ grep -c "insert\|update\|delete" apps/mobile/components/CycleStrip.tsx -> 0
$ grep -c "resolveTarget" "apps/mobile/app/(tabs)/programs.tsx"          -> 2
$ grep -rl 'export function resolveTarget' packages apps | wc -l         -> 1
      (packages/api-contracts/src/program.ts)
```

**Not run:** `pnpm --filter @fitness/api-contracts test`, `pnpm --filter api test` and the api e2e suite. This plan touches no file in `packages/api-contracts/src` or `apps/api`, and the api e2e suite is partly owned by 04-09's concurrent executor. Their stated baselines (92/4, 50/3, 201/19) are therefore unverified by this executor rather than claimed as green.

## Known Stubs

None. Every control the strip and the row render is wired to a real write path.

## Deferred WINDOWS Entries

The ledger verbs were not called — 04-09's executor runs concurrently against the same file and the ids collide. File these sequentially after merge:

- **kind:** unrun-verify — **file:** `apps/mobile/components/CycleStrip.tsx` — **description:** The pinned cycle strip and its three chip tones (training / dashed-border deload / reduced-opacity time off) have been asserted structurally in Jest but rendered on neither iOS nor Android. No Xcode, no Android SDK on this machine.
- **kind:** unrun-verify — **file:** `apps/mobile/app/(tabs)/programs.tsx` — **description:** "Switching cycles keeps the day you were on" is verified structurally only (DayDeck owns its page index and receives no index prop). The interaction itself has been observed on no platform — not native (no toolchain) and not in a browser (out of scope per CLAUDE.md).
- **kind:** unrun-verify — **file:** `apps/mobile/components/ExerciseSlotRow.tsx` — **description:** The override marker's rendered legibility beside a stepper label at large OS font scales is untested — no renderer, no device. Only its presence, count and per-field identity are asserted.
- **kind:** deviation — **file:** `apps/mobile/lib/db/programs/days.ts` — **description:** `computeReorder`/`SiblingRow` promoted from private to exported so `moveCycle` reuses the reorder arithmetic. One file beyond 04-08's declared `files_modified`; two lines changed, no behaviour change.
- **kind:** deviation — **file:** `apps/mobile/components/ExerciseSlotRow.tsx` — **description:** The per-cycle override marker ('· this cycle') and the strip's inline 'Edit Cycle' control are executor design calls on points 04-UI-SPEC.md leaves open. Both are bounded and reversible; flag for the user if a different treatment is wanted.
- **kind:** deviation — **file:** `packages/api-contracts/package.json` — **description:** A fresh git worktree cannot run the mobile suite until `pnpm --filter @fitness/api-contracts build` is run, because `main` points at a gitignored `dist/`. Every worktree-isolated executor importing this package hits it. Worth a `prepare`/`predev` hook or a source-entry `exports` map.

## User Setup Required

None — no external service configuration, no new package installed.

## Next Phase Readiness

- **04-09 (next-up card)** and **04-10 (session snapshot)** can consume `ProgramSlot.overridesByCycleId` and resolve through the same `resolveTarget`. The shared-resolver count is still exactly 1.
- **04-11 (program library)** is unaffected — this plan touched only the active-program branch of `programs.tsx`.
- **Open for a later plan:** nothing in this phase yet answers "which cycle am I currently IN" — `selectedCycleId` is browsing state, not the user's position in the block. The Home tab's next-up card (D-27/D-20) needs a real position resolver, and `time_off`'s `durationDays` is stored but not yet interpreted as calendar time by anything.

## Self-Check: PASSED

All 11 files claimed in `key-files` exist on disk, and all three task commits exist in this
worktree's history:

- `c9d3731` feat(04-08): cycle write helpers and self-deleting per-cycle overrides
- `6fcfce1` feat(04-08): cycle strip and a program tree carrying cycles and overrides
- `0a769d8` feat(04-08): strip selection drives day targets and the override write path

No commit in this plan deleted a tracked file, and the working tree is clean apart from the
metadata commit that carries this summary.

---
*Phase: 04-program-builder*
*Completed: 2026-08-21*
