---
phase: 07-advanced-set-types
verified: 2026-08-28T21:40:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification_deferred_to: "ROADMAP Phase 999.2 — Human verification sweep (web target)"
human_verification_deferred_at: 2026-08-28
human_verification:
  - test: "Log 5 consecutive plain working sets on the web target (no set-type change, no grouping, no per-side, no superset) and compare the tap sequence and perceived responsiveness against the shipped Phase 5 flow."
    expected: "Matches Roadmap SC1's second clause — logging a plain working set costs no more taps and is not perceptibly slower than before this phase existed."
    why_human: "Perceived-latency judgement has no automated timing harness (07-VALIDATION.md's own Manual-Only Verifications table says so explicitly). Structural evidence is strong — SetRow.test.tsx's own case 'renders with no onLongPress, no accessibilityActions and no badges when none of the new props are supplied' proves a plain row's render output is byte-identical to its Phase 5 self, and no new field/decision sits on the checkmark-completion path — but the subjective 'no slower' feel itself needs a human on a real browser. Deferred to ROADMAP Phase 999.2."
  - test: "On the web target, log a drop set, a myorep cluster (activation set plus rest-pause mini-sets), and a full set followed by partials; confirm each group reads as one logical set at a glance (indentation, badge glyph, blank child set-number column)."
    expected: "Matches Roadmap SC2 and 07-VALIDATION.md's Manual-Only 'grouped sets read as one logical set at a glance' row."
    why_human: "Visual grouping legibility is a judgement call, not a DOM-structure assertion. The DOM structure itself is proven: advanced-sets.spec.ts's drop-set case asserts a real browser render (blank set-number column, 'Sub-entry type' row) plus the database-level parent_set_id read-back after a reload. Myorep and partial specifically have no dedicated e2e case in this phase (only Drop Set was exercised end-to-end; myorep/partial/failure are unit- and structurally-verified only). Deferred to ROADMAP Phase 999.2."
  - test: "On the web target, tap a completed set's number, pick Failure, and confirm the row keeps its weight/reps, shows an F badge, and reads 0 RIR with no further input."
    expected: "Matches SETS-04 and 07-04-SUMMARY.md's own deferred human-check."
    why_human: "writeSetTypeEffect's Failure branch (setType + FAILURE_SET_RIR in one write, confirmed by direct code read at ExercisePage.tsx:376) has no ExercisePage-level render test in this phase (a documented, inherited gap — 07-01-SUMMARY.md, 07-04-SUMMARY.md D9) and no e2e case exercises it (advanced-sets.spec.ts covers Drop Set, per-side, and superset only). Deferred to ROADMAP Phase 999.2."
  - test: "On the web target, open an exercise's overflow sheet, tap Superset, confirm both chips show the link glyph and the page header shows the partner pill with correct light/dark colors; tap Detach and confirm both disappear."
    expected: "Matches SETS-07/08 and 07-07-SUMMARY.md's own deferred human-check for visual color/contrast, beyond what the e2e spec's role-based selectors assert."
    why_human: "advanced-sets.spec.ts's superset case already proves the functional behavior in a real browser (pairing forms, rest suppresses on the non-final member, rest resumes on the final member, detach un-suppresses the survivor) — this item is scoped to the remaining purely visual confirmation (glyph inset position, chip color in light/dark) the role-based Playwright assertions do not check. Deferred to ROADMAP Phase 999.2."
---

# Phase 7: Advanced Set Types Verification Report

**Phase Goal:** The user can log how they actually train — supersets, drops, myoreps, partials, and
per-side work — without the common case getting slower.
**Verified:** 2026-08-28T21:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can change a set's type by tapping its set number, and logging a plain working set is no slower than before this phase existed | ✓ VERIFIED | `SetRow.tsx`'s set-number `Pressable` now wires `onSetNumberPress` → `ExercisePage.handleSetNumberPress` → the `SetTypePickerSheet` (grep-confirmed real call site, not test-only). `advanced-sets.spec.ts`'s drop-set case taps `'Set 1 type'` in a real browser and confirms the sheet opens and a Drop Set write lands. The "no slower" clause is structurally proven (a plain row renders with zero new elements — `SetRow.test.tsx`: "renders with no onLongPress, no accessibilityActions and no badges when none of the new props are supplied"; the checkmark-completion path gained no new field or decision) but its perceived-latency claim is inherently a human judgement — see Human Verification below (deferred to 999.2, not blocking). |
| 2 | User can log drop sets and myoreps as grouped sub-entries under one logical set, plus failure sets, partial reps, and warm-ups | ✓ VERIFIED | Real (non-test) call sites confirmed for `addSubEntry`/`removeSubEntry`/`clearSubEntries` (`ExercisePage.tsx:12,435,459,471`; `workout.tsx:36,1270,1352`), `groupKindFor`/`resolveGroupAddControls` wired into `ExercisePage.tsx`, `resolveSetTypeSelection`'s full seven-row dispatch table (drop/myorep/partial/failure/amrap/warmup/normal) wired via `handleSetTypeSelect`. `pnpm -w test`: 92/92 suites, 1721/1721 tests pass, including `set-row-builders.test.ts`, `SetTypePickerSheet.test.tsx`, `ChangeSetTypeDialog.test.tsx`, `set-groups.test.ts`. `advanced-sets.spec.ts`'s drop-set case proves the full picker-tap → child-write → reload → database-read (`parent_set_id`) round trip in a real browser against a real `@powersync/web` database. |
| 3 | Warm-up sets are excluded from working volume while still appearing in the session | ✓ VERIFIED | `countsTowardWorkingVolume`/`WORKING_VOLUME_EXCLUDED_SET_TYPES` (`packages/api-contracts/src/session.ts`) is the single source migrated into all five known call sites: `session-query.ts` (2), `history-query.ts`, `summary-query.ts`, `ExerciseStrip.tsx` — confirmed via `grep -c "!== 'warmup'"` == 0 across these files and `countsTowardWorkingVolume` reference counts as documented in 07-02/07-03-SUMMARY.md. `summary-query.test.ts` and `history-query.test.ts` pass; warm-up rows still render (unchanged `WARMUP_SET_TYPE` write path, `WarmupSheet.tsx` untouched). |
| 4 | User can superset two adjacent exercises and the rest timer starts only after both are done, then detach them again | ✓ VERIFIED | `formSuperset`/`detachSuperset` (first-ever writers of `session_exercise.superset_group_id`) called from `ExercisePage.handleFormSuperset`/`handleDetachSuperset` (real call sites, `ExercisePage.tsx:493,503`). D-13 rest-suppression and D-14 member-advance confirmed wired at both `handleCheckmarkPress` completion sites in `workout.tsx` via `isFinalGroupMember`/`nextSupersetMemberIndex`. `advanced-sets.spec.ts`'s superset case proves, in a real browser: pairing forms, the non-final member's completion schedules no rest, the final member's completion starts rest, Detach is reachable from the action sheet, and the survivor's next completion starts rest again exactly as an ungrouped exercise's would. **Non-blocking note:** a rejected `formSuperset`/`detachSuperset` write sets `setTypeError` but `SessionActionSheet` has no `errorMessage` prop to render it (WINDOWS #152, open) — see Anti-Patterns below; this is an explicitly documented UI-SPEC backstop (E4 "Error / failure"), not a silent regression, and does not block the success path this criterion describes. |
| 5 | User can log different weights and reps for left and right on a unilateral exercise | ✓ VERIFIED | `isPerSideMode`/`sideForNewSet`/`parentsAwaitingRightSide` (`per-side.ts`) wired into both of `workout.tsx`'s completion call sites (draft branch, existing-row toggle branch) and into `ExercisePage.tsx`'s action sheet (`enable-per-side`/`disable-per-side`, real call sites confirmed by grep). `advanced-sets.spec.ts`'s per-side case proves, in a real browser: toggling "Log Left/Right Separately", completing a set produces an automatic right-side child with no second tap, both L/R badges render, and the pair advances the exercise's own fraction (0/3 → 1/3) exactly once, not twice. |

**Score:** 5/5 truths verified (0 present-behavior-unverified — the SC1 latency clause and remaining
visual-legibility items are judgement calls routed to Human Verification below, per this project's
`human_verify_mode: end-of-phase` and `999.2` deferral policy, not a structural verification gap).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/mobile/components/SetTypePickerSheet.tsx` | D-01's seven-row bottom sheet | ✓ VERIFIED | Exists, exports `SetTypePickerSheetView`/`resolveSetTypeSelection`/`FAILURE_SET_RIR`; wired into `ExercisePage.tsx:611`. |
| `apps/mobile/components/ChangeSetTypeDialog.tsx` | D-09's destructive group-clear confirm | ✓ VERIFIED | Exists; wired into `ExercisePage.tsx:623`; gates every `clearSubEntries` call (`ExercisePage.tsx:435`). |
| `apps/mobile/lib/db/set-groups.ts` | `addSubEntry`/`removeSubEntry`/`clearSubEntries` mutation seam | ✓ VERIFIED | Exists; all three real (non-test) call sites confirmed in `ExercisePage.tsx` and `workout.tsx`. |
| `apps/mobile/lib/session/superset.ts` | Superset group predicate module | ✓ VERIFIED | Exists; `isFinalGroupMember`/`nextSupersetMemberIndex` wired into `workout.tsx`'s `handleCheckmarkPress`. |
| `apps/mobile/lib/session/per-side.ts` | Per-side mode/stamp/pairing predicates | ✓ VERIFIED | Exists; wired into `workout.tsx` and `ExercisePage.tsx` (grep-confirmed, see truth #5 evidence). |
| `apps/mobile/lib/db/session-mutations.ts` (`formSuperset`/`detachSuperset`) | Session-scoped superset formation/detach | ✓ VERIFIED | First-ever writers of `superset_group_id`; wired into `ExercisePage.tsx:493,503`. |
| `packages/api-contracts/src/session.ts` (`countsTowardWorkingVolume`/`countsTowardRecords`) | D-17/D-18 named predicates | ✓ VERIFIED | Published and migrated into all known call sites (5 of 5). |
| `apps/mobile/e2e/advanced-sets.spec.ts` | The phase's e2e proof | ✓ VERIFIED | Exists, registered in `playwright.config.ts`'s `durability` project; 3/3 specs pass in a real browser against real `@powersync/web`. |
| `apps/api/test/poison-pill.e2e-spec.ts` (T-7-01/T-7-02 block) | Sync-boundary containment proof | ✓ VERIFIED | 17/17 tests pass against live Postgres, including the two new threat cases and the five-set-type acceptance case. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `SetRow.tsx` set-number `Pressable` | `SetTypePickerSheet` | `onSetNumberPress` → `ExercisePage.handleSetNumberPress` | ✓ WIRED | Grep-confirmed non-test call site; exercised live by `advanced-sets.spec.ts`. |
| `SetGroupAddControl` "+ Add {type}" | `set-groups.ts#addSubEntry` | `onAddSubEntry` → `ExercisePage.handleAddSubEntry` | ✓ WIRED | `ExercisePage.tsx:184,459`. |
| `SessionActionSheet` Superset/Detach rows | `session-mutations.ts#formSuperset`/`detachSuperset` | `handleSessionAction` → `handleFormSuperset`/`handleDetachSuperset` | ✓ WIRED | `ExercisePage.tsx:493,503`; e2e-proven. |
| `SessionActionSheet` per-side rows | `workout.tsx` completion path | `onSetPerSideOverride` → `perSideOverrideByExercise` state → `sideForNewSet`/`parentsAwaitingRightSide` | ✓ WIRED | `workout.tsx:1245,1267,1349`; e2e-proven. |
| `handleCheckmarkPress` (both call sites) | `shouldAutoAdvance` / superset member-advance | Parent-row filter (D-19) evaluated before `shouldAutoAdvance`; `nextSupersetMemberIndex` evaluated first, short-circuiting on a non-final member | ✓ WIRED | `workout.test.tsx` behavior cases pass; e2e per-side/superset cases corroborate the counting/advance rule live. |
| Query layer (`session-query.ts`, `history-query.ts`, `summary-query.ts`, `ExerciseStrip.tsx`) | `@fitness/api-contracts#countsTowardWorkingVolume` | `WORKING_VOLUME_EXCLUDED_SET_TYPES` import, `notInArray`/predicate call | ✓ WIRED | Zero remaining bare `!== 'warmup'` literals in these four files (grep-confirmed per 07-02/07-03-SUMMARY.md's own acceptance criteria, re-verified). |
| `personal-records.ts` (`foldPriorBest`/`detectPrs`) | `@fitness/api-contracts#countsTowardRecords` | Guard replaces the old `WARMUP_SET_TYPE`-only check | ✓ WIRED | `personal-records.test.ts` passes, including the partial-never-a-PR case. |

### Data-Flow Trace

| Artifact | Data Path | Produces Real Data | Status |
|----------|-----------|---------------------|--------|
| Drop-set child row | `SetTypePickerSheet` tap → `logSet`/`addSubEntry` write → PowerSync → SQLite → browser reload → `readLoggedSetsWithGrouping` | Yes — `parent_set_id` read back from the database (not rendered text alone) after a real reload, matching the parent's real id | ✓ FLOWING |
| Per-side right child | Checkmark tap → `sideForNewSet`/`parentsAwaitingRightSide` → `addSubEntry` write → strip fraction re-render | Yes — the strip fraction moves from 0/3 to 1/3 for exactly the toggled exercise, the other exercise's fraction is untouched, in a real browser | ✓ FLOWING |
| Superset rest suppression/resumption | `formSuperset` write → `isFinalGroupMember` → `handleCheckmarkPress`'s rest-scheduling gate → header Rest bar visibility | Yes — the Rest bar's presence/absence is asserted directly against real UI state across form → non-final completion → final completion → detach → next completion | ✓ FLOWING |
| `completedWorkingSetCount` (workout summary) | `summary-query.ts` → `countsTowardWorkingVolume` filter → parent-only count | Yes — a drop set's parent+2 children report count=1 while `totalReps`/`volumeKg` include all 3 rows (`summary-query.test.ts`) | ✓ FLOWING |

### Behavioral Spot-Checks / Full Suite Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck + lint across all 6 packages (fresh, `--force`, no cache) | `npx turbo run typecheck lint --force` | 11/11 tasks pass, 0 cached | ✓ PASS |
| Full workspace unit suite (fresh, `--force`) | `npx turbo run test --force` | 8/8 packages pass; mobile 92/92 suites, 1721/1721 tests | ✓ PASS |
| API e2e suite against live Postgres | `cd apps/api && pnpm test:e2e` | 22/22 suites, 269/269 tests pass | ✓ PASS |
| Sync-boundary containment (poison-pill, incl. T-7-01/T-7-02) | `pnpm test:e2e -- poison-pill` (apps/api) | 17/17 tests pass | ✓ PASS |
| Durability + advanced-sets e2e (real browser, real `@powersync/web`) | `pnpm --filter mobile test:e2e:durability` | 51/51 specs pass, exit 0 — including `reorder-exercises.spec.ts`'s "reordering is idempotent" (WINDOWS #153, confirmed genuinely fixed, not merely re-flaked around) | ✓ PASS |

### Probe Execution

SKIPPED — no `scripts/*/tests/probe-*.sh` files exist in this repository, and neither the PLAN files
nor the success criteria for this phase reference probe-based verification.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| SETS-01 | 07-01, 07-04 | Change a set's type by tapping its set number | ✓ SATISFIED | `SetTypePickerSheet` + `resolveSetTypeSelection`'s full behavior table, wired, e2e-proven for the Drop Set row. |
| SETS-02 | 07-01, 07-03, 07-05, 07-09 | Drop set as grouped sub-entries | ✓ SATISFIED | `addSubEntry`/`SetGroupAddControl`, D-10 parent-only counting, e2e reload proof against the real database. |
| SETS-03 | 07-05 | Myorep as activation set + rest-pause mini-sets | ✓ SATISFIED | `groupKindFor`'s myorep-parent-is-the-activation-set rule, `resolveGroupAddControls`'s parent-completion visibility gate — unit-verified (no dedicated e2e case; see Human Verification). |
| SETS-04 | 07-04 | Failure set at 0 RIR, labelled distinctly | ✓ SATISFIED | `FAILURE_SET_RIR` write in `writeSetTypeEffect`'s retype branch, unit-pinned — no dedicated e2e case (see Human Verification). |
| SETS-05 | 07-05 | Partial reps distinct from full reps | ✓ SATISFIED | `groupKindFor`'s partial-children-derive-kind path, same `addSubEntry`/`SetGroupAddControl` mechanism as drops — unit-verified, no dedicated e2e case (see Human Verification). |
| SETS-06 | 07-01, 07-02, 07-03 | Warm-ups excluded from working volume | ✓ SATISFIED | `countsTowardWorkingVolume` migrated into all 5 known call sites, tested. |
| SETS-07 | 07-06, 07-07, 07-09 | Superset two adjacent exercises, rest starts after both | ✓ SATISFIED | `formSuperset`, D-13/D-14 wiring, e2e-proven end to end. |
| SETS-08 | 07-06, 07-07, 07-09 | Detach an exercise from a superset | ✓ SATISFIED | `detachSuperset`, D-24 survivor behavior, e2e-proven. |
| SETS-09 | 07-06, 07-08, 07-09 | Per-side weights/reps for left/right | ✓ SATISFIED | `per-side.ts`, e2e-proven end to end including the counting rule. |

No orphaned requirements — REQUIREMENTS.md's Phase 7 row set (SETS-01…SETS-09) is fully accounted
for across the nine plans' declared `requirements` fields.

### Prohibitions Checked (PLAN frontmatter `must_haves.prohibitions`)

| Prohibition | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| MUST NOT make a plain, non-grouped, non-per-side set row cost an extra tap/field/decision/visible element | 07-01 | ✓ RESOLVED | `SetRow.test.tsx`: a plain row renders with zero new props' effects; no new field sits on the checkmark-completion path. |
| MUST NOT let a partial set produce a `heaviest_weight`/`best_e1rm` PR | 07-02 | ✓ RESOLVED | `personal-records.test.ts`: a completed partial contributes to no prior-best field; a heavier partial does not consume the record for a later full set. |
| MUST NOT rewrite/round/alter a typed weight, reps, or RIR value when changing set type (Failure's own RIR write excepted) | 07-04 | ✓ RESOLVED | `writeSetTypeEffect`'s retype branch (`ExercisePage.tsx:376`) patches only `setType` (+`rir` for Failure) via `updateLoggedSet`'s named-columns-only discipline; the insert-child branch writes a brand-new blank row, never touching the parent. |
| MUST NOT delete a logged sub-entry (group destruction) without naming the count and requiring an explicit confirm | 07-04 | ✓ RESOLVED | `clearSubEntries` (whole-group destruction on a retype-to-normal) only ever runs behind `ChangeSetTypeDialog`'s confirm (`ExercisePage.tsx:435`). Note: 07-05's later, separately-designed per-child `removeSubEntry` (single mini-set removal) is deliberately un-confirmed by design — scoped outside this D-09 prohibition, which names group destruction specifically. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/mobile/components/ExercisePage.tsx` / `SessionActionSheet.tsx` | n/a | A rejected `formSuperset`/`detachSuperset` write sets `setTypeError` but `SessionActionSheet` has no `errorMessage` prop to render it — the sheet stays open with no visible failure indication. | ℹ️ Info (non-blocking) | Explicitly documented as an open backstop in `07-UI-SPEC.md`'s E4 table ("Error / failure — ⚠ backstop... needs a held-out UI-state test") and in WINDOWS.md #152 (open). Does not affect the success path SETS-07/08 describe; local-write failures are rare (no network involved). Recommend closing in a future pass per the UI-SPEC's own note. |
| `apps/mobile/components/EditingWorkoutScreen.tsx` | ~180 | The past-workout editing screen's `ExercisePage` instance can still show the "Log Left/Right Separately"/"Log as One Side" rows (gated correctly by real logged-set data via `isPerSideMode`), but tapping either calls a no-op setter (`onSetPerSideOverride={() => {}}`) supplied by this screen — the sheet closes with no visible effect. | ℹ️ Info (non-blocking) | Confirmed the equivalent Superset/Detach rows are correctly hidden here (their visibility predicates resolve to false against an intentionally empty `sessionExerciseRows`), so this is narrower than it first appears — only the two per-side toggle rows are reachable-but-inert, in a screen D-32 already scopes out of live-session machinery. No data corruption or crash; a minor UX polish item, not a SETS-09 blocker (the toggle's actual job — governing future sets in a live session — is unaffected). |
| — | — | No debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) found in any of the 23 files this phase created or modified. | — | Clean. |

### Human Verification Required

Deferred to **ROADMAP Phase 999.2** (human verification sweep, web target) per this project's standing
policy and the phase's own `human_verify_mode: end-of-phase` convention. All four items below are
judgement calls on top of fully automated, passing evidence — none block this phase's completion.

### 1. Plain-set logging is not perceptibly slower

**Test:** Log 5 consecutive plain working sets on the web target — no set-type change, no grouping, no per-side, no superset.
**Expected:** Matches Roadmap SC1's second clause — no added taps, no perceptible slowdown versus the shipped Phase 5 flow.
**Why human:** No automated timing harness exists for perceived latency (07-VALIDATION.md's own admission). Structural evidence (byte-identical plain-row render, unit-tested) is strong but not a substitute for a human's felt-latency judgement.

### 2. Grouped-set visual legibility (myorep, partial — beyond the e2e-proven drop set)

**Test:** Log a drop set, a myorep cluster, and a full-set-plus-partials on the web target; confirm each reads as one logical set at a glance.
**Expected:** Matches SC2 and 07-VALIDATION's Manual-Only "grouped sets read as one logical set at a glance" row.
**Why human:** `advanced-sets.spec.ts` proves the drop-set case end to end in a real browser (including a database-level `parent_set_id` read-back); myorep and partial share the identical mechanism but have no dedicated e2e case in this phase, only unit coverage.

### 3. Failure-set end-to-end visual confirmation

**Test:** Tap a completed set's number, pick Failure, confirm weight/reps persist, an F badge shows, and RIR reads 0.
**Expected:** Matches SETS-04.
**Why human:** The write path is unit-pinned (`FAILURE_SET_RIR`) and structurally verified, but has no ExercisePage-level render test or e2e case in this phase.

### 4. Superset chip/pill visual styling (light/dark)

**Test:** Form a superset, confirm the link glyph and partner pill render with correct light/dark colors and inset positioning.
**Expected:** Matches SETS-07/08's visual contract in `07-UI-SPEC.md`.
**Why human:** Functional behavior (pairing, rest suppression/resumption, detach) is already e2e-proven in a real browser via role-based selectors; this item is scoped to the remaining purely visual confirmation those selectors don't check.

---

*Verified: 2026-08-28T21:40:00Z*
*Verifier: Claude (gsd-verifier)*
