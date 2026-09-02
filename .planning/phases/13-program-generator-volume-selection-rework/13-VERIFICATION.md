---
phase: 13-program-generator-volume-selection-rework
verified: 2026-09-02T00:00:00Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# Phase 13: Program Generator Volume & Selection Rework Verification Report

**Phase Goal:** A generated program fits its session budget in every cycle, spreads each muscle
group's weekly volume across a capped number of sets per exercise by adding a second exercise when
needed, varies exercises for a muscle group across the days of the week, prefers compound and
movement-pattern-covering exercises over hash tie-breaks, and scales the RIR ladder with days per
week.

**Verified:** 2026-09-02
**Status:** passed
**Re-verification:** No — initial verification

**Amendments verified against (not the original PLAN wording):**
- D-04 fit order (commit `484ddbd`): remove overflow exercises first (a group's second-or-later
  slot), then reduce sets to a floor of `MIN_SETS_PER_EXERCISE = 3`, then remove first exercises by
  small→medium→large volume-class priority.
- D-07 tier 2 (commit `808260d`): movement class read from `movementPattern`
  (`compound`/`isolation`/`unclassified`), not a count of secondary mappings.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GEN-VOL-01: no slot exceeds `MAX_SETS_PER_EXERCISE` (5) in any cycle; an over-cap group gets a second exercise, exercise count stable across cycles | ✓ VERIFIED | `volume-split.ts` (`splitSessionSets`, hardest-cycle sizing in `generate.ts` Stage 1/PLAN); `regression-2day-60min.test.ts` "never assigns more than MAX_SETS_PER_EXERCISE sets" passes against real-catalog data (live run, 8/8 green) |
| 2 | GEN-VOL-02: session fit evaluated against the hardest training cycle; reduces sets before removing exercises, per amended D-04 order (overflow removal → set reduction to floor 3 → priority removal); never drops the day's last large-class exercise while any other exercise remains | ✓ VERIFIED | `session-fit.ts` `fitDayToSessionLength` implements the exact amended 3-phase order (`pickOverflowVictim` → `pickReductionVictim` w/ floor 3 → `pickRemovalVictim` w/ large-guard); `session-fit.test.ts` pins the amended order with explicit "prefers removing the overflow exercise over reducing sets" and "reduces sets down to the floor of 3" cases (10/10 live); `regression-2day-60min.test.ts` "fits the hardest training cycle inside the 60-minute session" passes on real data |
| 3 | GEN-SEL-01: an exercise already used for a muscle group on an earlier day is not repicked while an unused alternative exists; per-day duplicate rule and week-exhaustion fallback both hold | ✓ VERIFIED | `generate.ts`'s `pickedByMuscleGroup` map declared outside `template.dayPatterns.forEach` (week-scoped); `slot-fill.ts`'s D-06 filter gate; `generate.test.ts` "does not reuse an exercise..." and "lets the same exercise appear on both days...(exhaustion)" pass; `regression-2day-60min.test.ts` "never uses an exercise for the same muscle group on both days" passes on real 870-exercise catalog data |
| 4 | GEN-SEL-02: selection prefers primary-mapped, then movement-class (compound-first for a group's first slot, isolation-first for its second, amended per `808260d`), then loadable (`MODEL_EQUIPMENT_TYPES` from `@fitness/plate-math`, 5 members incl. `ez_bar`), then movement-pattern coverage, over a seeded hash tie-break; a secondary-only mapping never beats a primary one | ✓ VERIFIED | `slot-fill.ts` `pickSlotExercise` filter chain (D-08 primary gate, unclassified gate) + tiered comparator (`movementClassRank`, `isLoadable`, `movementPatternNoveltyOf`, `weekNoveltyOf`, `seededRank`); `slot-fill.test.ts` has one case per tier/gate (19/19 live, incl. "ranks compound above isolation for a first pick...", "never picks an unclassified candidate...", "treats ez_bar as loadable...", "never lets a secondary-only mapping beat a primary mapping...") |
| 5 | GEN-RIR-01: RIR ladder keyed by `daysPerWeek` — 2-day reaches RIR 0 by the last training cycle, 6-day never below 1 | ✓ VERIFIED | `volume-landmarks.ts` `RIR_LADDER_BY_DAYS_PER_WEEK` (2:`[2,1,0,0]` … 6:`[3,2,2,1]`) and `rirForCycle(cycleIndex, daysPerWeek)` clamped via `GENERATION_INPUT_LIMITS`; `volume-landmarks.test.ts` pins concrete D-09 values; `regression-2day-60min.test.ts` "prescribes RIR 0 in the fourth training cycle" passes on real data |
| 6 | D-05: `day_trimmed` degradation sentence is true whether sets were reduced, exercises removed, or both; no new `DegradationEntry.kind` added | ✓ VERIFIED | `generation-wizard.ts` `describeDegradation`'s `day_trimmed` branch: "does fewer sets, fewer exercises, or both"; `generation-wizard.test.ts` case asserts both "set" and "exercise" appear case-insensitively; `DEGRADATION_KINDS` unchanged |
| 7 | D-09/D-01 provenance: `docs/volume-rir-landmarks.md` records the frequency-keyed RIR ladder and the per-exercise set cap as project-authored decisions, matching what actually shipped (post-amendment) | ✓ VERIFIED | Read the live document: `MAX_SETS_PER_EXERCISE`/`MIN_SETS_PER_EXERCISE` section states `MIN_SETS_PER_EXERCISE = 3` with the amendment note; `WORK_SECONDS_PER_SET`/`SESSION_OVERHEAD_MINUTES` "If wrong" paragraph names `fitDayToSessionLength`, describes the amended 3-phase order, and explicitly supersedes Phase 11's D-14; `RIR_LADDER_BY_DAYS_PER_WEEK` section states all five ladder rows verbatim |
| 8 | D-11: a regression test pins the reported scenario (2 days/60 min/intermediate/hypertrophy/auto/4 cycles/no inventory) against a fixture derived from the real seeded catalog, asserting all five D-11 properties | ✓ VERIFIED | `scripts/derive-generator-regression-fixture.cjs` deterministically derives `catalog-2day-regression.ts` (60 exercises/208 mappings) from `apps/api/src/seed/data/catalog-normalized.json`; re-ran the script live — output byte-identical (no git diff); `regression-2day-60min.test.ts` (8 cases) ran live and passed 8/8 |
| 9 | D-10: `generateProgram` stays pure and byte-deterministic; public types (`GenerationInput`, `GeneratedProgramTree`, `GeneratedSlot`, `DegradationEntry.kind`) unchanged | ✓ VERIFIED | `determinism.test.ts` (recursive source scan + byte-identical JSON) passes live; `regression-2day-60min.test.ts` "serializes byte-identically across two runs" passes; no changes to `result.ts`'s exported type shapes found in the diff-relevant files |

**Score:** 9/9 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/program-generator/src/volume-split.ts` | `MAX_SETS_PER_EXERCISE`, `MIN_SETS_PER_EXERCISE`, `splitSessionSets` etc. | ✓ VERIFIED | Present, exports match, `MIN_SETS_PER_EXERCISE = 3` (amended) |
| `packages/program-generator/src/session-fit.ts` | `fitDayToSessionLength`, `DaySlotPlan`, `SessionFitResult` | ✓ VERIFIED | Present, implements amended 3-phase concession order |
| `packages/program-generator/src/slot-fill.ts` | `pickSlotExercise`, `SlotPickContext`, `movementClassOf`, `isLoadable` | ✓ VERIFIED | Present, implements amended movement-class tier (`compoundnessOf` correctly removed) |
| `packages/program-generator/src/volume-landmarks.ts` | `RIR_LADDER_BY_DAYS_PER_WEEK`, `rirForCycle(cycleIndex, daysPerWeek)` | ✓ VERIFIED | Present, matches D-09 table |
| `packages/program-generator/src/generate.ts` | PLAN/FIT/PICK/PER-CYCLE day loop, week-scoped `pickedByMuscleGroup` | ✓ VERIFIED | Present, map declared before `template.dayPatterns.forEach` |
| `apps/mobile/lib/programs/generation-wizard.ts` | reworded `day_trimmed` sentence | ✓ VERIFIED | Present |
| `docs/volume-rir-landmarks.md` | RIR ladder + set-cap provenance sections | ✓ VERIFIED | Present, matches shipped (amended) code |
| `scripts/derive-generator-regression-fixture.cjs` | deterministic fixture derivation | ✓ VERIFIED | Present, re-run confirmed byte-identical |
| `packages/program-generator/src/__fixtures__/catalog-2day-regression.ts` | `CATALOG_2DAY_REGRESSION` | ✓ VERIFIED | Present, 60 exercises/208 mappings, not re-exported from `index.ts` |
| `packages/program-generator/src/__tests__/regression-2day-60min.test.ts` | D-11 regression suite | ✓ VERIFIED | Present, 8/8 passing live |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `generate.ts` day loop | `splitSessionSets` → `fitDayToSessionLength` → `pickSlotExercise` | Stage 1 (PLAN) → Stage 2 (FIT) → Stage 3 (PICK), operating on `DaySlotPlan` descriptors, not picked slots | ✓ WIRED | Confirmed by reading `generate.ts` lines 140-235 |
| `session-fit.ts` | `session-length.ts` | imports `estimateSlotMinutes`, `SESSION_OVERHEAD_MINUTES` | ✓ WIRED | Confirmed import at top of `session-fit.ts` |
| `generate.ts` | `volume-landmarks.ts` | `rirForCycle(trainingIndex, input.daysPerWeek)` at both base and per-cycle call sites | ✓ WIRED | Confirmed 2 call sites, both pass `input.daysPerWeek` |
| `slot-fill.ts` | `@fitness/plate-math` | `MODEL_EQUIPMENT_TYPES` import for `isLoadable` | ✓ WIRED | Confirmed import and usage; 5-member array (`barbell, ez_bar, dumbbell, machine, cable`) verified in `packages/plate-math/src/equippable.ts` |
| `generate.ts` | `slot-fill.ts` | `SlotPickContext` built per plan with `preferCompound: plan.groupExerciseIndex === 0`, `weekPickedIdsForGroup` from week map | ✓ WIRED | Confirmed in PICK stage |
| `scripts/derive-generator-regression-fixture.cjs` | `apps/api/src/seed/data/catalog-normalized.json` | reads real catalog, emits `GenerationCatalog`-shaped `.ts` fixture via `JSON.stringify` | ✓ WIRED | Re-ran script live; byte-identical to committed fixture |

### Behavioral Spot-Checks / Live Test Runs

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Package build | `pnpm --filter @fitness/program-generator build` | tsc succeeded | ✓ PASS |
| Workspace typecheck | `pnpm -w typecheck` | 14/14 tasks successful | ✓ PASS |
| Workspace test | `pnpm -w test` | 14/14 tasks successful (mobile 144/144 suites, 2331/2331 tests) | ✓ PASS |
| Package test (live, non-cached) | `pnpm --filter @fitness/program-generator test` | 14/14 suites, 160/160 tests | ✓ PASS |
| Fixture regeneration determinism | `node scripts/derive-generator-regression-fixture.cjs` (re-run) | `git status --porcelain` on the fixture path is empty after regeneration | ✓ PASS |
| D-11 real-catalog regression | contained within `pnpm --filter @fitness/program-generator test` | `regression-2day-60min.test.ts`: 8/8 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| GEN-VOL-01 | 13-01, 13-04 | Cap sets per exercise, second exercise for overflow | ✓ SATISFIED | `volume-split.ts`, `generate.ts` PLAN stage, `regression-2day-60min.test.ts` |
| GEN-VOL-02 | 13-01, 13-02, 13-04 | Hardest-cycle session fit, reduce-before-remove | ✓ SATISFIED | `session-fit.ts` (amended order), `generation-wizard.ts` copy, `regression-2day-60min.test.ts` |
| GEN-SEL-01 | 13-03, 13-04 | Week-level exercise variety | ✓ SATISFIED | `generate.ts` week map, `slot-fill.ts` D-06 gate, `regression-2day-60min.test.ts` |
| GEN-SEL-02 | 13-03, 13-04 | Tiered selection scoring, primary gate | ✓ SATISFIED | `slot-fill.ts` (amended movement-class tier), `slot-fill.test.ts` |
| GEN-RIR-01 | 13-01, 13-02, 13-04 | daysPerWeek-keyed RIR ladder | ✓ SATISFIED | `volume-landmarks.ts`, `docs/volume-rir-landmarks.md`, `regression-2day-60min.test.ts` |

REQUIREMENTS.md cross-check: all five IDs are marked `[x]` Complete and mapped to "Phase 13 — Program
Generator Volume & Selection Rework" in the requirements-to-phase table. No orphaned requirements
found for this phase (`grep -E "Phase 13"` in REQUIREMENTS.md returns exactly these five rows).

### Anti-Patterns Found

None. Scanned all touched production files (`volume-split.ts`, `session-fit.ts`, `slot-fill.ts`,
`generate.ts`, `volume-landmarks.ts`, `generation-wizard.ts`,
`scripts/derive-generator-regression-fixture.cjs`) for `TODO|FIXME|XXX|TBD|HACK|PLACEHOLDER` —
zero matches.

### Amendment Consistency Check

Two mid-execution amendments were verified against, not the original PLAN wording, per the
orchestrator's instruction:

1. **D-04 fit order (commit `484ddbd`):** `session-fit.ts` implements remove-overflow-first →
   reduce-to-floor-3 → priority-removal, exactly matching `13-CONTEXT.md`'s amended D-04 text and
   `13-01-SUMMARY.md`'s Amendment section. `docs/volume-rir-landmarks.md` was also updated by this
   same commit (confirmed via `git show --stat 484ddbd`, which touched
   `docs/volume-rir-landmarks.md` and `session-fit.test.ts`) and the live document reads correctly
   post-amendment.
   - Note: `13-02-SUMMARY.md` and `13-03-SUMMARY.md`'s "Next Phase Readiness" sections both flag
     the docs as still describing the *pre-amendment* values as of their own completion — this was
     accurate at the moment `13-02-SUMMARY.md` was written (commit `5aeaaf3` predates `484ddbd`),
     but `13-03-SUMMARY.md`'s flag is stale by the time it was written (chronologically after
     `484ddbd`). This is a documentation-lag artifact in the SUMMARY narrative, not a defect in the
     shipped code or docs — the live `docs/volume-rir-landmarks.md` file was independently read and
     confirmed correct for the amended behavior.
2. **D-07 tier 2 (commit `808260d`):** `slot-fill.ts` exports `movementClassOf` (not
   `compoundnessOf`, which no longer exists), reading `movementPattern` per the amended decision.
   `slot-fill.test.ts` was rewritten with movement-class cases replacing the compoundness case, as
   claimed in `13-03-SUMMARY.md`'s Amendment section.

Both amendments are fully and correctly implemented in the current codebase, tested, and documented.

### Human Verification Required

None. This phase is pure in-package TypeScript algorithm work with no UI surface, no device
dependency, and no I/O — every claim above was verified either by direct code reading or by a live
(non-cached) test/build run in this session.

### Gaps Summary

No gaps found. All 9 derived must-have truths (5 roadmap requirement IDs plus D-05, D-09/D-01
provenance, D-11 regression, and D-10 purity/determinism guarantees) are verified against the
current codebase, not against SUMMARY.md claims alone. Both mid-execution amendments (D-04 fit
order, D-07 tier 2) are correctly and completely reflected in source, tests, and provenance
documentation. The full workspace (`pnpm -w typecheck && pnpm -w test`) and the package's own test
suite were both run live during this verification and passed cleanly (14/14 workspace tasks;
14 suites/160 tests in the package; 144 suites/2331 tests in mobile).

---

*Verified: 2026-09-02*
*Verifier: Claude (gsd-verifier)*
