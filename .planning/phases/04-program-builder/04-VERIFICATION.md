---
phase: 04-program-builder
verified: 2026-08-22T14:00:18Z
verified_against_commit: e0718ed
status: gaps_found
score: 3/4 roadmap success criteria verified (9/11 requirements met, 2 partially met)
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "PROG-07 — User can duplicate, archive, and restore programs AND individual workouts"
    status: partial
    reason: >-
      The program half is fully shipped and reachable. The "individual workouts" half is not.
      duplicateDay is implemented, tested and exported but has ZERO UI call sites — no screen,
      action sheet or control in the shipped app invokes it. Archive/restore of an individual
      workout (routine_day) does not exist in any form: routine_day carries no archived_at column
      and the only day-level removal is a hard delete. REQUIREMENTS.md marks PROG-07 "Complete";
      that is an overclaim. 04-11-PLAN.md carries this as an explicitly UNRESOLVED planner
      assumption (A-PROG-07) that was never resolved with the user.
    artifacts:
      - path: "apps/mobile/lib/db/programs/duplicate-routine.ts"
        issue: "duplicateDay (lines 128-238) is orphaned — grep across apps/mobile/app and apps/mobile/components returns 0 non-test references"
      - path: "apps/mobile/app/programs/library.tsx"
        issue: "actionsForRow enumerates Activate / Duplicate / Rename / Archive|Restore — all program-scoped; no day-scoped action exists"
      - path: "apps/mobile/app/(tabs)/programs.tsx"
        issue: "The day-page header offers Rename and Remove only — no Duplicate Day control"
      - path: "apps/api/src/db/schema/program.ts"
        issue: "routineDay has no archivedAt column, so archive/restore of an individual workout is not representable"
    missing:
      - "A 'Duplicate Day' control on the day page (or day action sheet) wired to duplicateDay"
      - "An explicit, user-confirmed resolution of A-PROG-07: either add routine_day.archived_at + filtered read paths, or amend PROG-07's wording so 'individual workouts' means logged sessions (already safe via PROG-11)"
      - "Correct REQUIREMENTS.md PROG-07 from Complete to Partial until one of the above lands"
  - truth: "PROG-06 — User can schedule planned time off within a program"
    status: partial
    reason: >-
      Creating a time-off cycle works and is validated (validateCycle rejects a time_off cycle with
      no duration). But setCycleDuration is orphaned — no UI calls it — and the shipped Edit Cycle
      form offers a "Make Time off" kind switch that calls setCycleKind ONLY. Converting an existing
      training/deload cycle to time_off therefore produces a cycle with durationDays === null, which
      resolveNextUp silently skips (pushed onto skippedTimeOffCycleIds and stepped over). The user
      gets a time-off chip in the strip that the Home card will never honour, with no way to give it
      a duration short of deleting and recreating it.
    artifacts:
      - path: "apps/mobile/lib/db/programs/cycles.ts"
        issue: "setCycleDuration (line 89) is orphaned — 0 UI call sites"
      - path: "apps/mobile/app/(tabs)/programs.tsx"
        issue: "handleSetCycleKind (line ~396) calls setCycleKind only; the editing form renders no duration field, unlike the creation form which does"
      - path: "apps/mobile/lib/programs/next-up.ts"
        issue: "resolveNextUp lines ~152-156 skip a time_off cycle whose durationDays is null — correct defensive handling, but it is now reachable from an ordinary UI action"
    missing:
      - "A 'Days off' field in the Edit Cycle form, wired to setCycleDuration"
      - "Or: block the kind switch to time_off until a duration is supplied, reusing validateCycle"
  - truth: "routine.status can advance from 'draft' to 'ready'"
    status: failed
    reason: >-
      markRoutineReady is implemented and unit-tested but has no UI call site. createRoutine and
      duplicateRoutine both hardcode status 'draft'. Nothing in the shipped app can produce a
      'ready' routine, so library.tsx's partitionRoutines 'ready' bucket and its "Ready" subtitle
      word are unreachable, and every program the user ever sees reads "Draft" forever. Not a
      numbered PROG requirement, but D-15 defines status as the "finished authoring" fact and the
      UI-SPEC Correction Note mandates rendering it, so the shipped app displays a state the user
      cannot change. Already recorded as WINDOWS #89.
    artifacts:
      - path: "apps/mobile/lib/db/programs/lifecycle.ts"
        issue: "markRoutineReady (line ~110) is orphaned — 0 UI call sites"
      - path: "apps/mobile/app/programs/library.tsx"
        issue: "partitionRoutines' `ready` branch (line 64) and formatLibraryRowSubtitle's Title-Case status are dead paths in practice"
    missing:
      - "A 'Mark Ready' action in RoutineActionSheet wired to markRoutineReady, OR"
      - "An explicit decision that status advances implicitly (e.g. on first activation), OR"
      - "Removal of the status word from the library row if the draft/ready distinction is not going to be user-facing"
deferred: []
human_verification:
  - test: "Open the Programs tab on a real iOS or Android build; add three exercises to a day and drag the middle one to the top using the grip."
    expected: "The row follows the finger, drops into position, and the new order survives a screen re-entry. An interrupted drag springs back with nothing persisted."
    why_human: "Native gesture behaviour (react-native-gesture-handler + reanimated) cannot be exercised here — no Xcode, no Android SDK on this machine (WINDOWS, ROADMAP Phase 999.1). Only computeDropTarget/neighboursForIndex arithmetic and the handle's rendered shape are unit-tested."
  - test: "In a browser, swipe/drag between day pages in the DayDeck and drag-reorder an exercise with the pointer-based DragHandle.web.tsx."
    expected: "Paging works without a visible tab bar; the pointer drag reorders and persists."
    why_human: "Browser/E2E-browser testing is forbidden by .claude/CLAUDE.md unless the user explicitly asks. `expo export --platform web` succeeds (re-run and confirmed), which proves the bundle builds, not that the interaction works."
  - test: "Restart the PowerSync Service against ops/powersync/sync-rules.yaml, then create a routine_cycle and a routine_exercise_cycle_target on device A and confirm both arrive on device B."
    expected: "Both rows stream down; deleting a cycle on A removes the override on B and it does not resurrect."
    why_human: "The Service was never restarted against the updated rules during this phase (WINDOWS #60, #67). Pull-side delivery of routine_cycle and routine_exercise_cycle_target is asserted structurally only. Push-side and tombstone behaviour ARE observed (api e2e, 207/207 green, plus this verifier's own cascade probe)."
  - test: "Two devices, both offline, each activate a different program; reconnect both."
    expected: "Exactly one active program after both pushes land."
    why_human: "WINDOWS #59 — no second device or runtime available. The single-device overwrite case is covered by e2e; the genuine race is unrun."
  - test: "Visual review of the cycle strip's three chip tones, the '· this cycle' override marker and the Reset to base action at default and maximum OS font scale."
    expected: "Deload reads dashed, time off recedes at 0.6 opacity with a muted underline when selected, and the rep-range stepper pair wraps rather than shrinking below 48x48."
    why_human: "Visual/typographic behaviour at accessibility font scales is not observable from unit tests."
---

# Phase 4: Program Builder — Verification Report

**Phase Goal:** The user can author the program they actually train, with the targets the progression engine will later read.
**Verified:** 2026-08-22T14:00:18Z against commit `e0718ed`
**Status:** gaps_found
**Re-verification:** No — initial verification.

---

## Method and Environment Note

**Phase mode is `mvp` in ROADMAP.md, but the Phase 4 goal is not a User Story.** `gsd-tools query
user-story.validate` returns `valid: false` on it (missing all three of the `As a` / `I want to` /
`so that` slots). MVP-mode verification produces a User Flow Coverage table keyed on the story's
`so that` clause; with no story there is no clause to key on. This report therefore uses **standard
goal-backward verification** against the four ROADMAP Success Criteria and the eleven PROG
requirements. Either set `mode: mvp` aside for this phase or run `/gsd mvp-phase 4` to give it a
real User Story — as it stands the roadmap declares a verification mode the phase cannot support.

**What was actually executed for this report** (not read, executed):

| Check | Command | Result |
|---|---|---|
| Mobile unit suite | `pnpm jest` in `apps/mobile` | 43 suites / 793 tests passed |
| api-contracts suite | `pnpm test` in `packages/api-contracts` | 4 suites / 92 tests passed |
| API e2e against live Postgres | `pnpm test:e2e` in `apps/api` | 19 suites / 207 tests passed (74s) |
| Typecheck + lint | `npx turbo run typecheck lint` | 7/7 tasks successful |
| Web bundle | `npx expo export --platform web` | Exported; `/(tabs)/programs`, `/programs/library`, `/programs/new` all present in the route manifest |
| **Cascade probe (verifier-authored)** | temporary e2e spec, day DELETE with an override present | **PASSED** — see Probe Execution below; temp file removed, tree clean |

**Not executed, deliberately:** no native build (no Xcode/Android SDK), no browser driving
(forbidden by `.claude/CLAUDE.md` absent an explicit request). Every UI surface in this phase is
therefore verified by unit tests + typecheck + a successful web export only. That is a real
limitation of the evidence, not a formality — see Human Verification.

---

## Goal Achievement — ROADMAP Success Criteria

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| 1 | User can build a program from scratch with named days, ordered exercises, and per-exercise set/rep-range/RIR/rest targets | ✓ VERIFIED | Complete reachable path: `programs/new.tsx` "Start Blank" → `createRoutine` → router pushes `/(tabs)/programs?routineId=…`; "Add Day" + name field → `addDay`; "Add Exercises" → `ExercisePickerModal` → `addExercisesToDay`; grip drag **and** an expanded-row "Move up"/"Move down" pair → `handleReorderExercise` → `moveExercise`; five steppers on `ExerciseSlotRow` → `setExerciseTargets`. Every write lands in local SQLite via `getPowerSync()`. |
| 2 | User can organize the program into cycles with per-cycle targets, place a deload at the start or end of a cycle, and schedule time off | ⚠️ PARTIALLY MET | Cycles, per-cycle overrides, and deload placement are fully wired. **Time off is authorable only at creation** — converting an existing cycle to `time_off` via the Edit Cycle form yields `durationDays = null`, which `resolveNextUp` silently skips, and `setCycleDuration` has no UI call site. See gap 2. |
| 3 | User can activate, freeze, duplicate, archive, and restore programs, and see the active program's upcoming workouts with its targets | ✓ VERIFIED | `library.tsx` → `RoutineActionSheet` wires Activate/Duplicate/Rename/Archive/Restore to `activateRoutine` / `duplicateRoutine` / `renameRoutine` / `archiveRoutine` / `restoreRoutine`, with `ArchiveDialog` confirmation on the two destructive-ish paths. Freeze is the "Update Program" `Switch` on the active-program screen → `setProgressionFrozen`. Home renders `NextUpCard` from `loadNextUp` (real queries) → `resolveNextUp`. Note this criterion says *programs* — the "individual workouts" wording lives only in PROG-07, which is where it fails. |
| 4 | Editing a program never changes what any already-logged workout shows | ✓ VERIFIED | Snapshot-on-use is implemented (`log-set.ts` `resolvePrescriptionForCycle` + `addSessionExercise` copying five columns onto `session_exercise`) and **behaviourally proven twice**: 7 unit regressions in `log-set.test.ts` ("PROG-11 — editing a program never changes a logged session") and 6 e2e regressions against live Postgres in `program-sync.e2e-spec.ts` (base rewrite, override edit, override delete, day delete, routine archive). Both suites green in this run. |

**Score: 3/4 success criteria verified, 1 partially met.**

---

## Requirements Coverage

| Req | Description | Status | Evidence |
|---|---|---|---|
| PROG-01 | Build a program from scratch with named training days | ✓ MET | `new.tsx` → `createRoutine`; `programs.tsx` "Add Day" → `addDay` (name required, trimmed at the write boundary); rename via tap-on-day-name → `renameDay` |
| PROG-02 | Add, remove, reorder exercises within a training day | ✓ MET | `addExercisesToDay` (multi-select picker), `removeExercise`, and two reorder affordances (`DragHandle` gesture + Move up/down) both funnelling to the single `moveExercise` write path |
| PROG-03 | Per-exercise targets: sets, rep range, RIR target, rest duration | ✓ MET | `ExerciseSlotRow` renders exactly five steppers (sets, repMin, repMax, RIR 0–6 single, rest 15s step); `stepRepMin`/`stepRepMax` make min>max unreachable (R5); `setExerciseTargets` persists |
| PROG-04 | Organize a program into cycles, each with its own targets | ✓ MET | `routine_cycle` table + `CycleStrip` + `routine_exercise_cycle_target` sparse overrides. Selecting a chip re-resolves every slot through `resolveTarget`; editing while a cycle is selected routes to `setCycleTarget` with an `overrideDelta`, never to the base row |
| PROG-05 | Place a deload at the start or end of a cycle | ✓ MET | `kind: 'deload'` at creation, plus "Earlier"/"Later" in the Edit Cycle form → `moveCycle` → shared `computeReorder`. Position is `order_index`, per D-12 |
| PROG-06 | Schedule planned time off within a program | ⚠️ PARTIAL | Creation path complete and validated. Conversion path produces an inert null-duration cycle; `setCycleDuration` orphaned. See gap 2 |
| PROG-07 | Duplicate, archive, and restore programs **and individual workouts** | ⚠️ PARTIAL | Program half complete. Individual-workout half absent: `duplicateDay` orphaned, no `routine_day.archived_at` at all. See gap 1. **REQUIREMENTS.md marks this Complete — incorrect** |
| PROG-08 | Set which program is active | ✓ MET | `activateRoutine` writes `user_preference.active_routine_id` (D-14 single-column pointer, so two-actives is structurally unrepresentable). Reached from the library action sheet; hidden on the already-active and archived rows |
| PROG-09 | View the active program's upcoming workouts with target muscles and per-cycle rep/RIR targets | ✓ MET AS NARROWED | Home `NextUpCard`: day name + cycle name heading, read-only muscle chips from a real `exercise_muscle_mapping` ⋈ `muscle_group` read, one line per exercise `"{name}: {sets} × {min}–{max} reps @ {rir} RIR"` with `—` for nulls. Narrowed from plural to one card — see the judgment below |
| PROG-10 | Freeze a program so progression stops modifying it | ✓ MET | `routine.progression_frozen` boolean, orthogonal to status and to the active pointer; "Update Program" switch on the active-program screen only; e2e proves a PATCH naming only `progression_frozen` leaves status/archived_at/name untouched |
| PROG-11 | Edit a program without corrupting any workout already logged against it | ✓ MET | See SC4 |

No orphaned requirements: all eleven PROG ids are claimed across the eleven plans' `requirements:` frontmatter.

---

## PROG-09 Narrowing — Explicit Judgment (asked for directly)

**The narrowing is acceptable in substance, but its stated authority does not support it, and I would not let it stand as written.**

The UI-SPEC's Home card section says the single-card scope is justified because "D-27's own decision
text ('the next workout and its resolved targets') narrows this to one card." Read D-27 in
`04-CONTEXT.md`: it is a **placement** decision — *"Upcoming workouts appear on the Home tab, not the
Programs tab."* Its body sentence "Home leads with 'next up' — the next workout and its resolved
targets" is describing what Home *leads with*, not capping what Home may contain. Using a placement
decision as the authority for a scope reduction is authority drift, and it is the kind of drift that
becomes invisible once REQUIREMENTS.md says "Complete".

Why I still call it MET rather than FAILED:

1. The load-bearing user need behind PROG-09 — "what am I training next, and what are the numbers" —
   is fully served, including the per-cycle resolution the requirement names explicitly.
2. The full upcoming sequence *is* visible to the user, on the Programs tab: the day deck shows every
   day with its resolved targets for the selected cycle. What is missing is a Home-side
   schedule-order list, not the information itself.
3. `resolveNextUp` already computes cycle position and rotation, so extending to N cards later is
   additive, not a rework.

**Recommended action:** amend PROG-09's wording in REQUIREMENTS.md to say "the next workout" rather
than "upcoming workouts", and record the amendment. Do not leave a plural requirement marked Complete
against a singular implementation on the strength of a misquoted decision.

---

## Binding-Contract Conformance

### The five-column target tuple (D-25 as amended by the user)

Verified consistent at **five** everywhere. `grep -rn "rir_min|rirMin|rir_max|rirMax"` across
`apps`, `packages`, `ops`, `docs` returns **zero hits**.

| Location | Columns / fields | Status |
|---|---|---|
| `apps/api/src/db/schema/program.ts` — `routineExercise` | targetSets, targetRepMin, targetRepMax, targetRir, targetRestSeconds | ✓ 5 |
| `apps/api/src/db/schema/program.ts` — `routineExerciseCycleTarget` | same 5 | ✓ 5 |
| `apps/api/src/db/schema/session.ts` — `sessionExercise` | same 5 | ✓ 5 |
| `apps/mobile/lib/db/schema.ts` — routineExercise / routineExerciseCycleTarget / sessionExercise | same 5 | ✓ 5 |
| `packages/api-contracts/src/program.ts` — `ResolvedTarget`, `EMPTY_TARGET`, `resolveTarget`, `isEmptyOverride` | same 5, resolved in five explicit lines (no loop) | ✓ 5 |
| Sync apply path — `sync.service.ts` validators + `program-sync.e2e-spec.ts` | rejects `target_rep_min: 'eight'`, accepts five-null writes | ✓ 5 |
| `apps/mobile/app/(tabs)/programs.tsx` `TARGET_FIELDS` | same 5 | ✓ 5 |
| `apps/mobile/components/ExerciseSlotRow.tsx` | 5 steppers; RIR single, bounded 0–6 | ✓ 5 |
| `apps/mobile/app/(tabs)/index.tsx` Home card | same 5 via `resolveTarget` | ✓ 5 |
| `apps/mobile/lib/export/build-export-document.ts` | `target_rir_min`/`target_rir_max` collapsed to `target_rir` | ✓ 5 |
| `apps/api/src/seed/generate-corpus.ts` | same 5 | ✓ 5 |

`grep -rl 'export function resolveTarget' packages apps | wc -l` → **1**
(`packages/api-contracts/src/program.ts`). Its five consumers — the builder, the Home card, the
session snapshot in `log-set.ts`, `cycles.ts`, and the contract's own tests — all import it; there is
no second implementation of `override ?? base`.

### UI-SPEC conformance

| Contract item | Status | Note |
|---|---|---|
| Cycle strip: three chip tones, kind and selection orthogonal | ✓ | `CYCLE_TONES` map: dashed border for deload, `moon-outline` + 0.6 opacity + muted-underline selection for time_off |
| Cycle strip absent (not empty) at zero cycles | ✓ | Plus an "Add Cycle" link so the strip is reachable from nothing |
| Inline "Edit Cycle" text button, visible only while a cycle is selected (2026-08-21 amendment) | ✓ | `CycleStrip.tsx` line ~124 |
| Exercise slot row: five fields, `—` for null, "No targets set." when all null | ✓ | |
| `· this cycle` override marker + "Reset to base" (2026-08-21 amendment) | ✓ | `CYCLE_OVERRIDE_MARKER`; reset → `clearCycleTarget` |
| Drag handle: two platform files, identical appearance, `accessibilityLabel="Reorder {name}"`, visible only at ≥2 exercises | ✓ | `canReorder` computed once by the day page and passed down |
| Picker: selections persist across search/filter changes | ✓ | `catalogRows={catalog?.rows ?? []}` — the **full** catalog is passed to `orderedSelection`, not the filtered set. This is the exact thing that is easiest to get wrong here, and it is right |
| Home card: no "Start Workout" action this phase | ✓ | |
| Home card: deleted-logged-day falls back silently to first day of current cycle | ✓ | `lastLoggedDayIndex` returns null → `dayIndex = 0` (WINDOWS #80 records the UI-SPEC overriding 04-10-PLAN here) |
| Library: two sections, Active badge, `•••` action trigger, archived receded | ✓ | |
| **"Delete Draft" action** | ✗ NOT SHIPPED | Known and recorded (WINDOWS #87): the server's `HARD_DELETE_FORBIDDEN` rejects every routine DELETE unconditionally, so the client would emit an op that resurrects the row. Needs a server-side carve-out first. Not counted as a new gap |

---

## Local-First and Sync

| Property | Status | Evidence |
|---|---|---|
| Writes succeed offline | ✓ VERIFIED (structurally) | Every one of the eight write modules under `apps/mobile/lib/db/programs/` resolves `getPowerSync()` and writes local SQLite. `grep` for `fetch(` / `axios` / `http` across the programs lib returns **zero** — there is no network on the authoring write path. Reconciliation is PowerSync's queue, established in Phase 2 |
| Gap-based `order_index`; one drag rewrites one row | ✓ VERIFIED (behaviourally) | `ORDER_INDEX_GAP = 1024`; `computeReorder` writes a single midpoint when a slot exists, and renumbers only rows whose index actually changed when the gap is exhausted. `programs.test.ts` asserts exactly one update in the normal case and exactly two (x and c, not all four) in the renumber case |
| Overrides resolve per-field, `override ?? base`, null = inherit | ✓ VERIFIED | One `resolveTarget`; `program.test.ts` asserts `{targetSets: null}` inherits the base rather than clearing it; `isEmptyOverride` treats `0` as a value |
| Sparse overrides — an all-null override row is deleted, not stored | ✓ VERIFIED | `isEmptyOverride` gate in `cycles.ts`; unique `(routine_exercise_id, cycle_id)` constraint makes the override singular |
| Deleted overrides do not resurrect — all three cascade paths | ✓ VERIFIED | See Probe Execution |
| Pull-side delivery of the two new tables | ? UNVERIFIABLE HERE | PowerSync Service never restarted against the updated `sync-rules.yaml` (WINDOWS #60, #67). The queries are structurally identical to the already-verified `routine_day` query. **Unverifiable, not broken** |
| Two-device offline activation race | ? UNVERIFIABLE HERE | WINDOWS #59. Single-device overwrite is e2e-covered |

### Cascade tombstones — all three paths

| Path | Implementation | Test |
|---|---|---|
| `routine_cycle` DELETE → override tombstones | `sync.service.ts` ~1336 | ✓ e2e: "deleting the cycle applies, cascades away the override rows, and writes one sync_tombstone row per cascaded override" |
| `routine_exercise` DELETE → override tombstones | `sync.service.ts` ~1330 | ✓ e2e: "deleting the exercise applies, cascades away its override rows…" |
| `routine_day` → exercise → override (transitive, three-level) | `sync.service.ts` 1308–1325 | **No shipped test.** The existing day-delete e2e seeds no override, so it asserts 2 tombstones, never 3. Verifier ran a probe — see below |

---

## Probe Execution

| Probe | Command | Result | Status |
|---|---|---|---|
| Transitive day → exercise → override cascade tombstone | Verifier-authored temporary spec `apps/api/test/zz-verifier-probe.e2e-spec.ts`, run via `npx jest --config ./test/jest-e2e.json --runInBand -t "VERIFIER PROBE"` against live Postgres | `✓ deleting the day tombstones the cascaded exercise AND its cascaded override (269 ms)` — asserted `routineExerciseCycleTargetRow(cetId)` undefined and `tombstoneCount([dayId, routineExerciseId, cetId]) === 3` | **PASS** |

The probe file was deleted immediately after the run; `git status --porcelain` is clean apart from the
pre-existing untracked `.claude/worktrees/`. No source was modified.

**Recommendation:** land that probe as a permanent test in `program-sync.e2e-spec.ts`. The three-level
cascade is the single most fragile piece of the override model and it currently ships untested — it
worked when I ran it, but nothing in CI will notice if it stops.

---

## Anti-Patterns Found

`grep -nE "TODO|FIXME|XXX|TBD|HACK|PLACEHOLDER|not yet implemented|coming soon"` across all 79 files
in the phase diff: **zero real hits** (one false positive on a base64 integrity hash in
`pnpm-lock.yaml`). No debt markers, no stub returns, no console-log-only implementations.

The problems in this phase are not code smells — they are **orphaned functions**. Full inventory of
implemented, tested, exported program functions with zero UI call sites:

| Function | File | Consequence |
|---|---|---|
| `duplicateDay` | `lib/db/programs/duplicate-routine.ts` | PROG-07's "individual workouts" duplicate half is unreachable — **gap 1** |
| `markRoutineReady` | `lib/db/programs/lifecycle.ts` | `status` can never leave `'draft'` — **gap 3** (WINDOWS #89) |
| `setCycleDuration` | `lib/db/programs/cycles.ts` | A converted time-off cycle can never be given a duration — **gap 2** |
| `moveDay` | `lib/db/programs/days.ts` | Days cannot be reordered from the UI. Day order drives the next-up rotation, so a program's rotation order is fixed at day-creation order forever. Not required by any SC or PROG, so **noted, not gapped** |

---

## Known Limitations Carried Forward (recorded, not rediscovered)

- No native observation anywhere in this phase (no Xcode, no Android SDK); browser/E2E-browser
  testing forbidden absent an explicit request. UI verified by unit tests + typecheck + web export.
- PowerSync Service never restarted against the updated sync rules — pull-side delivery asserted
  structurally (WINDOWS #60, #67).
- "Delete Draft" absent because the server's `HARD_DELETE_FORBIDDEN` rejects all routine DELETEs
  (WINDOWS #87).
- `duplicateRoutine` nulls `supersetGroupId` / `progressionSchemeId` / `notes` (WINDOWS #88).

One process observation worth a line, since "lint clean" appears in the phase claims: both
`api:lint` and `mobile:lint` are defined as `tsc --noEmit`, i.e. **there is no ESLint pass anywhere in
the pipeline** — "typecheck and lint clean" means the type checker ran twice. Out of scope for
Phase 4, but it should not be read as style/quality enforcement.

---

## Gaps Summary

The phase's schema work, sync work, contract work and history-safety work are genuinely strong. The
five-column tuple is consistent across eleven surfaces with zero drift; `resolveTarget` is a single
implementation with five real consumers; the override table is sparse, dual-parent-validated and
uniquely constrained; PROG-11 is proven twice over, once in unit tests and once against live
Postgres; and the three cascade tombstone paths are all implemented and — after this verifier's own
probe — all now behaviourally proven.

What is missing is not depth, it is **reach**. Three capabilities were built as library functions and
never given a way in:

1. **PROG-07's "individual workouts" half never shipped.** `duplicateDay` is complete, correct and
   tested — and unreachable. Archive/restore of an individual workout does not exist even as a data
   model. The plan flagged this as an *unresolved* assumption (A-PROG-07) and it was never resolved;
   REQUIREMENTS.md nonetheless marks PROG-07 Complete. That mark is wrong today.
2. **PROG-06's edit path is broken in a way the creation path is not.** The Edit Cycle form lets a
   user turn any cycle into time off but gives it no duration, and `resolveNextUp` will then step
   straight over it. `setCycleDuration` exists to fix exactly this and is never called.
3. **`status` is a one-way door into `'draft'`.** Every program the user will ever see reads "Draft".

None of these break anything already built, and none require rework — each is a control wired to an
existing, tested function (plus one genuine product decision on what "archive an individual workout"
should mean). But three requirement-bearing capabilities that cannot be reached from the app is not
a phase whose goal is achieved, and the deeper pattern is worth naming: **this phase's plans verified
functions, and the requirements ledger was updated from those functions rather than from the
screens.** The remedy is not more tests — it is a reachability pass before a requirement is marked
Complete.

**Overall verdict: the phase goal is substantially but not fully achieved. Do not mark PROG-06 or
PROG-07 Complete, and close the three gaps above before Phase 5 builds session logging on top of
this program model.**

---

_Verified: 2026-08-22T14:00:18Z_
_Verifier: Claude (gsd-verifier)_
