---
phase: 04-program-builder
plan: 11
subsystem: program-builder
status: complete
tags: [program-library, lifecycle, duplication, routing, freeze-toggle]

requires:
  - 04-08 (loadProgramTree's five-query read, the cycle strip and day deck the active-program tab renders)
  - 04-04 (user_preference.active_routine_id, routine.progression_frozen, ROUTINE_STATUSES)
  - 04-01 (createRoutine, the four-state screen derivation and skeleton/error patterns every screen here reuses)
provides:
  - The program lifecycle write layer (activate / clear / freeze / archive / restore / mark-ready / rename)
  - duplicateRoutine and duplicateDay — the only deep-copy implementation in the codebase
  - The guarded /programs segment, its library screen and the New Program flow
  - freezeSwitchLabel and the Update Program switch Phase 8's progression engine will gate on
affects:
  - apps/mobile/app/(tabs)/programs.tsx (narrowed from "all programs" to "the active program")
  - apps/mobile/components/ArchiveDialog.tsx (additive `subject` prop)
  - apps/mobile/lib/navigation/root-stack.tsx (one new protected registration)

tech-stack:
  added: []
  patterns:
    - "One id map per source table, every copied foreign key rewritten through the map that owns it"
    - "Segment layout as the authorization boundary — one protected root registration covers every route beneath it (T-03-58 / T-04-52)"
    - "Two-section list where each section is omitted when empty, mirroring DetailSection"

key-files:
  created:
    - apps/mobile/lib/db/programs/lifecycle.ts
    - apps/mobile/lib/db/programs/duplicate-routine.ts
    - apps/mobile/lib/db/__tests__/lifecycle.test.ts
    - apps/mobile/lib/db/__tests__/duplicate-routine.test.ts
    - apps/mobile/app/programs/_layout.tsx
    - apps/mobile/app/programs/library.tsx
    - apps/mobile/app/programs/new.tsx
    - apps/mobile/app/programs/__tests__/library-screen.test.ts
    - apps/mobile/components/RoutineActionSheet.tsx
  modified:
    - apps/mobile/app/(tabs)/programs.tsx
    - apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts
    - apps/mobile/lib/navigation/root-stack.tsx
    - apps/mobile/lib/navigation/__tests__/route-guard.test.ts
    - apps/mobile/components/ArchiveDialog.tsx

decisions:
  - "Delete Draft is NOT shipped. The server rejects every routine DELETE unconditionally (HARD_DELETE_FORBIDDEN in sync.service.ts), so a client-side hard delete would emit an op the server rejects and the row would resurrect on the next sync. Archive is offered for every program instead."
  - "loadLibraryRoutines is a new sibling loader in lifecycle.ts rather than an includeArchived option on loadRoutines — create-routine.ts is outside this plan's declared scope and the library needs two extra columns (archived_at, progression_frozen) its RoutineSummary does not carry."
  - "ArchiveDialog gained an additive `subject: 'exercise' | 'program'` prop rather than a second dialog component, so the plan's reuse criterion holds and the UI-SPEC's program copy (including 'Restore', not 'Unarchive') lands verbatim."
  - "The Programs tab honours an explicit ?routineId param over the active pointer, so a fresh duplicate opens into its own tree; the freeze switch still renders only when the displayed program IS the active one."
  - "The Update Program switch reads ON when the program is NOT frozen, matching the MacroFactor control it is modeled on — the label names what progression may do, not what has been disabled."
  - "duplicateRoutine writes supersetGroupId / progressionSchemeId / notes as null because loadProgramTree does not return them; all three are provably always null today (addExercisesToDay is their only writer and hardcodes them)."

metrics:
  duration: ~75 minutes
  completed: 2026-08-22
  tasks: 3
  commits: 3

actuals:
  tokens: 32000
  tasks: 3
  commits: 3
---

# Phase 4 Plan 11: Program Library Summary

Programs gain a lifecycle — activate, freeze, duplicate, archive, restore — behind a guarded `/programs` segment, and the Programs tab narrows to the single active program with an always-visible "Update Program" switch.

## What Shipped

**Task 1 — lifecycle writes and a deep copy that cannot point at its source** (`d5f8325`)

`apps/mobile/lib/db/programs/lifecycle.ts` exports `loadActiveRoutineId`, `loadProgressionFrozen`, `activateRoutine`, `clearActiveRoutine`, `setProgressionFrozen`, `archiveRoutine`, `restoreRoutine`, `markRoutineReady`, `renameRoutine` and `loadLibraryRoutines`. Each is a single-purpose write against an explicitly-passed database with the established `db: WriteDb = getPowerSync()` fallback seam.

Two invariants are asserted rather than assumed:

- `archiveRoutine` writes a timestamp and, in the same call, clears `user_preference.active_routine_id` when it named the archived routine. "Archived AND active" is therefore unrepresentable rather than merely discouraged. Grep-asserted to contain no delete against `routine`.
- `setProgressionFrozen` writes exactly one column, asserted by inspecting the recorded update payload — `Object.keys(values)` must equal `['progressionFrozen']`. Freezing the active program leaves both `status` and the pointer untouched, so `active AND frozen` survives (D-16).

`apps/mobile/lib/db/programs/duplicate-routine.ts` exports `duplicateRoutine` and `duplicateDay`. The whole correctness argument is the id maps: one per source table, every copied foreign key rewritten through the map that owns it. The catching test collects the source id set and asserts that **no inserted foreign key is a member of it** — the only assertion that finds a missed map entry, which is otherwise invisible until the user edits one copy and both change. A second test asserts the override rows' *two* parents (`routine_exercise_id` AND `cycle_id`) are both remapped, and that two distinct source cycles do not collapse into one.

`duplicateDay` deliberately leaves `cycleId` **unchanged**: a duplicated day lives in the same program and therefore under the same cycles, so remapping there would point every copied override at a cycle that does not exist.

Query count is bounded and proven: the same number of selects for a 3-exercise and a 30-exercise source, achieved by reading through `loadProgramTree`'s fixed five queries and passing an empty exercise-name map to short-circuit the two name-map selects a copy never needs.

**Task 2 — a guarded `/programs` segment** (`f791f14`)

`app/programs/_layout.tsx` copies `exercises/_layout.tsx` exactly, including its instruction not to add a guard: once the segment layout exists, `library` and `new` stop being root-stack siblings and become children of one `programs` route, which `root-stack.tsx`'s single `<Stack.Screen name="programs" />` inside `Stack.Protected guard={signedIn}` then covers. The route-guard suite proves this both ways — Case A asserts the nesting exists, Case B removes the layout from the key list and asserts both routes hoist to the root stack as unmatched `programs/`-prefixed siblings.

`library.tsx` exports `deriveLibraryScreenState`, `partitionRoutines`, `formatLibraryRowSubtitle`, `buildLibraryListItems` and `actionsForRow`. `partitionRoutines` classifies archived over active unconditionally, so a stale pointer arriving from another device cannot present an archived program as the one being run. `buildLibraryListItems` is where the UI-SPEC's "each section rendered only when non-empty" rule lives, and where the "at most one Active badge across the whole screen" invariant is assertable without a renderer.

`new.tsx` exports `newProgramOptions`, returning both choices always — duplicate marked unavailable with copy rather than omitted, so the feature is discoverable before it is usable.

**Task 3 — the active-program tab and the freeze switch** (`16bf653`)

`deriveProgramsScreenState` gains a `'no-active'` branch, distinct from `'empty'`: "you have nothing" and "you have not chosen" are different problems with different fixes, and collapsing them would send a user with five programs to the create screen. A pointer naming a routine absent from the list (archived on another device) also reads as `no-active` rather than as a program that cannot be rendered.

The freeze control is a `Switch` inside a 48pt `Pressable` label row, rendered unconditionally on the active program and never behind a menu. It is ON when the program is **not** frozen — "Update Program" names what progression is allowed to do. No confirmation in either direction (UI-SPEC § Confirmations: a reversible boolean is not a destructive action). No progression behaviour is implemented behind it; this phase fixes only the flag and the contract Phase 8 inherits.

## Verification

Actual runner output, pasted:

```
pnpm --filter mobile test
Test Suites: 40 passed, 40 total
Tests:       710 passed, 710 total
```
Baseline at the base commit was **37 suites / 601 tests**; this plan adds 3 suites and 109 tests.

```
pnpm --filter mobile typecheck
$ tsc --noEmit
(no output, exit 0)
```

```
pnpm --filter mobile build
/programs/library (18KB)
/programs/new (18KB)
Exported: dist
```
Both new routes register and bundle for web — the failure mode that would not have surfaced in Jest.

Unchanged neighbours, confirmed against their baselines:

```
pnpm --filter @fitness/api-contracts test
Test Suites: 4 passed, 4 total
Tests:       92 passed, 92 total
```

```
pnpm --filter api test
Test Suites: 3 passed, 3 total
Tests:       50 passed, 50 total
```

`grep -rl 'export function resolveTarget' packages apps | wc -l` → **1**. Still exactly one implementation of `override ?? base`.

**The api e2e suite (baseline 207 / 19) was deliberately not run.** It requires a live Postgres, and 04-10's executor is running concurrently against the same machine — an e2e run that truncates shared tables mid-flight would corrupt that agent's run. This plan touches zero files under `apps/api/`, so the suite has nothing to regress. Recorded as an unrun-verify entry below rather than claimed as passing.

## Deviations from Plan

### 1. [Rule 4 → resolved by shipped-server constraint] "Delete Draft" from the UI-SPEC is NOT shipped

- **Found during:** Task 2, reading the UI-SPEC's § Confirmations table.
- **Issue:** The UI-SPEC mandates a **Delete Draft** action ("This draft has no logged workouts. Deleting it can't be undone.") for `status = 'draft'` programs never logged against, as a real hard delete per D-05's carve-out. `apps/api/src/sync/sync.service.ts:82` defines `HARD_DELETE_FORBIDDEN = new Set(['exercise', 'routine'])` and rejects **every** routine DELETE with `invalid_field`, with no draft/logged nuance. A client-side delete would therefore emit an op the server rejects, leaving the row on the server to resurrect on the next sync — a worse outcome than not offering the action.
- **Decision:** Archive is offered for every program, draft or not. Delete Draft is deferred until the server can distinguish a never-logged draft from a routine with history.
- **Why this is not a UI/UX call requiring a checkpoint:** the plan's own prohibition ("Archiving or discarding a program never deletes a row") and the shipped server independently forbid it; the UI-SPEC is the only artifact that permits it, and it cannot be honoured without a server change outside this plan's twelve declared files. This is reported rather than silently absorbed — **it is the one place the shipped UI is narrower than the UI-SPEC.**

### 2. [Rule 3 - Blocking] `RoutineActionSheet` did not exist and had to be created

- **Found during:** Task 2.
- **Issue:** The UI-SPEC's component inventory lists `RoutineActionSheet` as a component "this phase adds", but no earlier plan created it and it is not in this plan's `files_modified`. The UI-SPEC binds the "•••" trigger to it.
- **Fix:** Created `apps/mobile/components/RoutineActionSheet.tsx`, copying `ArchiveDialog`'s overlay and 48×48 control geometry rather than introducing a second modal language. Its action list is passed in from `actionsForRow` rather than derived inside, so which actions apply is computed exactly once.

### 3. [Rule 3 - Blocking] `ArchiveDialog` gained an additive `subject` prop

- **Found during:** Task 2. `ArchiveDialog.tsx` is not in `files_modified`.
- **Issue:** Its copy is hardcoded to "Archive Exercise" / "Unarchive Exercise". The UI-SPEC's § Confirmations specifies different program copy, including **"Restore"** rather than "Unarchive" as the verb.
- **Fix:** Added `subject?: 'exercise' | 'program'`, defaulting to `'exercise'`. Every existing call site and the shipped `ArchiveDialog.test.tsx` are unchanged and green. The plan's own read_first note asked for this decision to be recorded: **the noun was parameterised, not duplicated into a second component.**

### 4. `newProgramOptions` returns both options, not one

- **Found during:** Task 3 helper design.
- **Issue:** The plan's behavior line says `newProgramOptions([])` "returns one option, `blank`, and marks the duplicate option unavailable" — internally contradictory. The UI-SPEC settles it: duplicate is "disabled with inline copy explaining why", i.e. rendered.
- **Fix:** Both options are always returned with an `available` flag; the test asserts the *available* set is exactly `['blank']` while the duplicate option is present and carries `NO_DUPLICATE_SOURCE_COPY`.

### 5. `partitionRoutines` keeps its four-key shape; the screen renders two sections

- **Issue:** The plan's tests fix `partitionRoutines` at `{ active, drafts, ready, archived }` and its action text asks for four section headings. The UI-SPEC mandates exactly **two** sections, "Your Programs" and "Archived".
- **Fix:** The pure helper keeps its four-way classification (it drives the badge and the within-section ordering, and its tested contract is unchanged); `buildLibraryListItems` composes those four groups into the UI-SPEC's two rendered sections, active first. The UI-SPEC wins where they conflict — on what is rendered.

### 6. `new.tsx` shipped in Task 2's commit rather than Task 3's

- **Reason:** Task 2's route-guard test asserts the segment's children are exactly `['library', 'new']`. The route must exist for that assertion to be meaningful, so `new.tsx` and its `newProgramOptions` tests landed with the segment. Task 3's commit is purely the tab.

### 7. `markRoutineReady` ships without a call site

- The plan requires it (exported, tested, writing `status` from the shared vocabulary). The UI-SPEC's action sheet enumerates exactly four actions — Activate, Duplicate, Rename, Archive-or-Restore — and does **not** include a ready transition. Adding an unspecified user-facing control would be exactly the kind of UI decision this run was told to surface rather than make, so the helper ships unwired. Recorded as a WINDOWS `deviation` below.

### 8. `deriveProgramsScreenState`'s existing assertions were updated

- Its input grew `activeRoutineId`, so the pre-existing `{failed:false, routines:[oneRoutine]} → 'populated'` case now correctly reads `'no-active'`. The three affected assertions were updated to pass a pointer, not deleted.

## Known Stubs

None. Every exported symbol has a real implementation; the only unwired export is `markRoutineReady` (deviation 7), which is fully implemented and tested but has no UI control by design.

## Threat Flags

None. Every surface added here is inside the existing signed-in guard, and the one new write path that could destroy data (delete) was deliberately not built — see deviation 1.

## Threat Model Coverage

| Threat | Disposition | How |
|---|---|---|
| T-04-52 (unguarded `/programs` on a signed-out session) | mitigated | Segment layout + one protected registration; asserted by the route-guard suite both with and without the layout, plus a grep proving no guard exists inside the segment |
| T-04-53 (duplicated rows pointing at the source) | mitigated | Source-id-membership assertion over every inserted foreign key |
| T-04-54 (archive implemented as a delete) | mitigated | `archiveRoutine` writes a timestamp; grep-asserted no delete against `routine`; server rejects independently |
| T-04-55 (archived program left active) | mitigated | Pointer cleared in the same call; `partitionRoutines` classifies archived over active regardless |
| T-04-56 (freeze collapsing into status or the pointer) | mitigated | Update payload key-set asserted to be exactly `['progressionFrozen']` |
| T-04-57 (duplicate on a large program) | mitigated | Select count proven identical for 3-exercise and 30-exercise sources |
| T-04-SC (package installs) | accepted | No package installed |

## Self-Check: PASSED

All nine created files exist on disk; all three commit hashes resolve in `git log`.

## Deferred WINDOWS Entries

The orchestrator should file these after merge (the ledger verbs were not called — 04-10's executor is running concurrently and the auto-incrementing ids would collide).

- **kind:** unrun-verify — **file:** `apps/mobile/app/programs/library.tsx` — **description:** The program library, the New Program fork and the freeze switch have been observed on neither iOS nor Android; this machine has no Xcode and no Android SDK. Web observation was also not performed (CLAUDE.md forbids launching a browser unless explicitly asked). Correctness rests on unit tests, typecheck and a successful web export, not on having seen the screens.
- **kind:** unrun-verify — **file:** `apps/api/test/program-sync.e2e-spec.ts` — **description:** The api e2e suite (baseline 207 / 19) was not run, because it needs a live Postgres shared with a concurrently-executing sibling agent. This plan changes zero files under `apps/api/`.
- **kind:** deviation — **file:** `apps/mobile/app/programs/_layout.tsx` — **description:** Security-relevant: authorization for every `/programs/*` route comes from the root layout's single protected `programs` registration, not from anything inside the segment. Mirrors the T-03-58 entry recorded for `/exercises`. Deleting `_layout.tsx` silently hoists both routes out of the guard — the route-guard suite's Case B is the tripwire.
- **kind:** deviation — **file:** `apps/mobile/app/programs/library.tsx` — **description:** The UI-SPEC's "Delete Draft" action is not shipped. The server's `HARD_DELETE_FORBIDDEN` rejects every routine DELETE with no draft/never-logged nuance, so a client delete would resurrect the row on next sync. Needs a server-side change (allow routine DELETE when no `workout_session.routine_day_id` references any of its days) before the UI can offer it.
- **kind:** deviation — **file:** `apps/mobile/lib/db/programs/duplicate-routine.ts` — **description:** `duplicateRoutine` writes `supersetGroupId`, `progressionSchemeId` and `notes` as null rather than copying them, because `loadProgramTree`'s `ProgramSlot` does not carry them. Harmless today (all three are always null — `addExercisesToDay` is their only writer and hardcodes them), but the moment any phase makes one writable, this becomes silent data loss on duplication. The fix is to widen `ProgramSlot` so every tree consumer sees them, not to add a second read here.
- **kind:** deviation — **file:** `apps/mobile/lib/db/programs/lifecycle.ts` — **description:** `markRoutineReady` is implemented and tested but has no UI call site: the UI-SPEC's action sheet enumerates four actions and does not include a draft→ready transition, and adding an unspecified user-facing control was out of bounds for this run.
