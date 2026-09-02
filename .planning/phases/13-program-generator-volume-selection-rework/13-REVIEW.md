---
phase: 13-program-generator-volume-selection-rework
reviewed: 2026-09-02T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - apps/mobile/lib/programs/__tests__/generation-wizard.test.ts
  - apps/mobile/lib/programs/generation-wizard.ts
  - docs/volume-rir-landmarks.md
  - packages/program-generator/src/__fixtures__/catalog-2day-regression.ts
  - packages/program-generator/src/__fixtures__/parity.ts
  - packages/program-generator/src/__tests__/determinism.test.ts
  - packages/program-generator/src/__tests__/generate.test.ts
  - packages/program-generator/src/__tests__/regression-2day-60min.test.ts
  - packages/program-generator/src/__tests__/session-fit.test.ts
  - packages/program-generator/src/__tests__/session-length.test.ts
  - packages/program-generator/src/__tests__/slot-fill.test.ts
  - packages/program-generator/src/__tests__/volume-landmarks.test.ts
  - packages/program-generator/src/__tests__/volume-split.test.ts
  - packages/program-generator/src/generate.ts
  - packages/program-generator/src/session-fit.ts
  - packages/program-generator/src/session-length.ts
  - packages/program-generator/src/slot-fill.ts
  - packages/program-generator/src/volume-landmarks.ts
  - packages/program-generator/src/volume-split.ts
  - scripts/derive-generator-regression-fixture.cjs
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-09-02T00:00:00Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Phase 13 replaces the linear per-cycle volume math with a four-stage pipeline (PLAN/FIT/PICK/PER-CYCLE)
in `generate.ts`, a documented three-phase session-fit concession order in `session-fit.ts`, a
frequency-aware RIR ladder in `volume-landmarks.ts`, and tiered candidate scoring in `slot-fill.ts`.
The implementation is unusually well-documented (every non-obvious decision cites a design ID and is
cross-referenced in `docs/volume-rir-landmarks.md`), and the test suite is broad — determinism,
byte-identity, degradation reporting, and a regression fixture derived from the real seeded catalog
are all covered.

I traced the full PLAN→FIT→PICK→PER-CYCLE data flow in `generate.ts` against `session-fit.ts`,
`slot-fill.ts`, and `volume-split.ts`, verified the session-fit victim-selection functions
(`pickOverflowVictim`/`pickReductionVictim`/`pickRemovalVictim`) against their test cases by hand,
and exhaustively simulated `weeklySetTarget`/`applyEmphasis`/`distributeSets` across every
(experience level, volume class, frequency 1-6, cycle count 2-8) combination to check a specific
suspected invariant violation (see WR-01) — it does not currently trigger with the shipped
`EXPERIENCE_VOLUME_BAND` table, but the code carries no guard or test that would catch a future
regression of that invariant. No BLOCKER-level defect (crash, data loss, security issue) was found.
Two WARNING-level robustness/coverage gaps and two INFO-level maintainability items are below.

## Warnings

### WR-01: `distributeSets` call in generate.ts's PER-CYCLE stage has an unenforced cross-cycle invariant

**File:** `packages/program-generator/src/generate.ts:262` (and `packages/program-generator/src/volume-split.ts:23-27`)
**Issue:**
`distributeSets(totalSets, exerciseCount)` floors every entry at 1 regardless of `totalSets`
(documented and tested: `distributeSets(1, 2)` returns `[1, 1]`, summing to 2, not 1). In
`generate.ts`'s PER-CYCLE stage, `exerciseCount` (`groupSlots.length`) is fixed by the exercise
split decided against the **hardest** training cycle's set count, while `totalSets` (`sessionSets`)
is recomputed independently for every cycle, including early, low-volume ones. If a muscle group's
per-cycle session-set count at an early cycle ever drops below the exercise count the split decided
at the hardest cycle, `distributeSets` silently inflates that cycle's total prescribed sets for the
group (e.g. a group with 2 slots and an early-cycle target of 1 set gets 1+1=2 sets, double the
intended weekly volume for that muscle group at that cycle).

I verified by exhaustive simulation (every `EXPERIENCE_VOLUME_BAND` row × frequency 1-6 × cycle
count 2-8) that this cannot currently occur, because `EXPERIENCE_VOLUME_BAND`'s mav:mev ratio never
exceeds ~2x for any class/level, and `applyEmphasis` unconditionally clamps every cycle's sets into
`[mev, mav]` (`emphasis.ts:19`) — so the gap between an early cycle's session-set count and the
exercise count implied by the hardest cycle's is never large enough to trigger the floor-at-1
inflation. This is a real latent defect, though, not a hypothetical one: nothing in the code
(comment, assertion, or test) ties `MAX_SETS_PER_EXERCISE`/`EXPERIENCE_VOLUME_BAND` together to
keep it that way, so a future edit to widen any band's mav (a plausible, low-visibility tuning
change since these constants are explicitly "this project's own design decision, informed by...
literature") could silently double-prescribe volume for a muscle group's early training cycles
without any test catching it — none of the existing tests distribute sets against a mismatched
exercise count derived from a different cycle's totals.

**Fix:**
Add a property-based test (mirroring the manual simulation used to write this finding) that walks
every `(experienceLevel, volumeClass, frequency, trainingCycleCount, cycleIndex)` combination and
asserts `distributeSets`'s output sum never exceeds the cycle's own intended `sessionSets` when
`sessionSets < exerciseCount`, e.g.:
```ts
// packages/program-generator/src/__tests__/volume-landmarks.test.ts (or a new integration test)
for (const experienceLevel of EXPERIENCE_LEVELS) {
  for (const muscleGroupId of MUSCLE_GROUPS) {
    for (let frequency = 1; frequency <= 6; frequency += 1) {
      for (let trainingCycleCount = 2; trainingCycleCount <= 8; trainingCycleCount += 1) {
        const hardestSets = Math.max(1, Math.round(
          weeklySetTarget(experienceLevel, muscleGroupId, trainingCycleCount - 1, trainingCycleCount) / frequency,
        ));
        const exerciseCount = exerciseCountForSessionSets(hardestSets);
        for (let cycleIndex = 0; cycleIndex < trainingCycleCount; cycleIndex += 1) {
          const sessionSets = Math.max(1, Math.round(
            weeklySetTarget(experienceLevel, muscleGroupId, cycleIndex, trainingCycleCount) / frequency,
          ));
          if (sessionSets >= exerciseCount) {
            expect(distributeSets(sessionSets, exerciseCount).reduce((a, b) => a + b, 0)).toBe(sessionSets);
          }
        }
      }
    }
  }
}
```
Alternatively, cap `distributeSets`'s per-entry floor at `Math.min(1, Math.floor(totalSets / exerciseCount) || 1)` only where the mismatch is possible, or have `generate.ts` recompute `exerciseCount` from each cycle's own `sessionSets` (via `exerciseCountForSessionSets`) and take `Math.min` of that against the hardest-cycle-derived slot count, so a low-volume cycle can never be forced to over-fill floor-at-1 slots.

### WR-02: `pickRemovalVictim`'s large-class protection is silently defeated when the day's position-0 slot isn't large-class

**File:** `packages/program-generator/src/session-fit.ts:67-88`
**Issue:**
The comment above `pickRemovalVictim` states the intent: "a large-class slot is skipped while it is
the day's last remaining large-class slot and any non-large slot is still a candidate." The
implementation computes `largeCount` from `plans` (which includes the protected index-0 slot), and
skips a large candidate only while `largeCount <= 1`. This works correctly when index-0 itself is
large-class (its permanent survival keeps `largeCount` at least 1 forever, so removing all other
large candidates is safe — verified by the existing test at `session-fit.test.ts:106`). But when
index-0 is **not** large-class, nothing else stops the day's last actual large-class exercise from
being removed by the fallback path (`return sorted[0]!.index;` at line 87, reached once the "skip"
branch exhausts the sorted list with no non-large candidate left). In that scenario a day can end up
with **zero** large-class (i.e. the muscle groups the design explicitly deems highest-priority)
exercises at all, which the volume-class removal priority was specifically built to avoid. This
exact scenario — position-0 slot not large-class, forcing removal of the day's last large-class
slot — has no test coverage; only the case where index-0 is large-class is tested.

**Fix:** Add a regression test with position-0 as a medium/small-class slot and a single large-class
candidate, confirming (or intentionally accepting and documenting) that the large-class slot is
removed anyway once no other concession exists:
```ts
it('can strip the day of all large-class work when the protected slot itself is not large-class', () => {
  const plans = [
    plan({ muscleGroupId: 'biceps' as MuscleGroupId, volumeClass: 'medium' as VolumeClass, hardestCycleSets: 2, restSeconds: 60 }),
    plan({ muscleGroupId: 'chest' as MuscleGroupId, volumeClass: 'large' as VolumeClass, hardestCycleSets: 2, restSeconds: 60 }),
  ];
  const result = fitDayToSessionLength(plans, 3);
  // Document whichever behavior is intended here — currently 'biceps' survives alone.
});
```
If the intended behavior is actually "never remove the day's only remaining large-class slot,
period," the fix is to compute `largeCount` from `candidates` (not `plans`) and drop the
unconditional fallback return for the large-class case, instead falling through to a set-reduction
retry or accepting the day stays over budget.

## Info

### IN-01: Duplicated session-set computation between PLAN and PER-CYCLE stages

**File:** `packages/program-generator/src/generate.ts:151-160` and `:251-261`
**Issue:** The five-line block that resolves `frequency`, `emphasisLevel`, `volumeClass`, `band`,
and then calls `weeklySetTarget` + `applyEmphasis` + `Math.max(1, Math.round(... / frequency))` is
duplicated verbatim (differing only in which cycle index is passed and local variable names)
between the Stage 1 (PLAN) loop and the Stage 4 (PER-CYCLE) loop. Any future change to this
formula (e.g. a different rounding rule, or an added clamp) has to be made in two places, and
nothing enforces they stay in sync beyond code review.
**Fix:** Extract a shared helper, e.g.:
```ts
function sessionSetsFor(input: GenerationInput, muscleGroupId: MuscleGroupId, cycleIndex: number, frequency: number): number {
  const emphasisLevel = input.emphasis[muscleGroupId] ?? 'normal';
  const volumeClass = MUSCLE_GROUP_VOLUME_CLASS[muscleGroupId];
  const band = EXPERIENCE_VOLUME_BAND[input.experienceLevel][volumeClass];
  const weeklySets = applyEmphasis(
    weeklySetTarget(input.experienceLevel, muscleGroupId, cycleIndex, input.trainingCycleCount),
    emphasisLevel,
    band,
  );
  return Math.max(1, Math.round(weeklySets / frequency));
}
```
and call it from both stages.

### IN-02: `derive-generator-regression-fixture.cjs` can silently undercount a group's exercise pool

**File:** `scripts/derive-generator-regression-fixture.cjs:86-107`
**Issue:** `selectExerciseIds` iterates `TARGET_MUSCLE_GROUPS` in a fixed order and adds an
exercise id to the single shared `selected` set the first time it is chosen for any group. If a
real catalog exercise carries a `primary` mapping to more than one of the ten target groups (not
unreachable — compound movements are commonly co-primary across two groups in some datasets), it
is claimed by whichever group appears earlier in `TARGET_MUSCLE_GROUPS` and is then unavailable to
a later group's `taken < EXERCISES_PER_GROUP` loop, silently leaving that later group with fewer
than the intended 6 exercises and no warning printed. This is a dev-tooling script, not
production code, and I did not verify against the real `catalog-normalized.json` snapshot whether
this currently occurs — flagging as a latent gap rather than a confirmed defect.
**Fix:** Track `taken` counts as "attempted" rather than relying purely on the global `selected`
set, or emit a warning (`console.warn`) when any group ends up with fewer than
`EXERCISES_PER_GROUP` exercises, so a future re-run of the script surfaces the shortfall instead of
silently shipping a thinner fixture.

---

_Reviewed: 2026-09-02T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
