import type { MuscleGroupId } from '@fitness/api-contracts';
import { MIN_SETS_PER_EXERCISE } from './volume-split';
import { estimateSlotMinutes, SESSION_OVERHEAD_MINUTES } from './session-length';
import type { VolumeClass } from './volume-landmarks';

export interface DaySlotPlan {
  muscleGroupId: MuscleGroupId;
  volumeClass: VolumeClass;
  // 0 for a muscle group's first exercise in the day, 1 for its second, and so on — the split's
  // own ordering, independent of the slot's position in the day as a whole.
  groupExerciseIndex: number;
  hardestCycleSets: number;
  restSeconds: number;
}

export interface SessionFitResult {
  plans: DaySlotPlan[];
  removedCount: number;
  setsRemovedCount: number;
  estimatedMinutes: number;
  overBudgetMinutes: number;
}

const VOLUME_CLASS_REMOVAL_PRIORITY: Record<VolumeClass, number> = { small: 0, medium: 1, large: 2 };

function totalMinutes(plans: readonly DaySlotPlan[]): number {
  const slotMinutes = plans.reduce((sum, plan) => sum + estimateSlotMinutes(plan.hardestCycleSets, plan.restSeconds), 0);
  return slotMinutes + SESSION_OVERHEAD_MINUTES;
}

// D-04 amendment phase 1: a group's second-or-later exercise (D-02) exists only to absorb volume
// the session cannot hold, so it is the first concession — never a set reduction on a group's
// first exercise. Later slots go before earlier ones; returns -1 when no overflow slot remains.
function pickOverflowVictim(plans: readonly DaySlotPlan[]): number {
  let victimIndex = -1;
  for (let index = 0; index < plans.length; index += 1) {
    if (plans[index]!.groupExerciseIndex > 0) {
      victimIndex = index;
    }
  }
  return victimIndex;
}

// D-04 amendment phase 2: highest hardestCycleSets first, ties broken toward the LAST such slot in
// day order — a set taken off the tallest slot each pass is what "reduce uniformly" means here
// (see session-fit.test.ts). Returns -1 when every slot is already at its own floor.
function pickReductionVictim(plans: readonly DaySlotPlan[], floors: readonly number[]): number {
  let victimIndex = -1;
  let victimSets = -Infinity;
  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index]!;
    if (plan.hardestCycleSets <= floors[index]!) continue;
    if (plan.hardestCycleSets >= victimSets) {
      victimSets = plan.hardestCycleSets;
      victimIndex = index;
    }
  }
  return victimIndex;
}

// D-04 amendment phase 3's removal priority, applied once every overflow exercise is gone and no
// remaining exercise can be reduced further: small volume class before medium before large, then
// later day position before earlier. The slot at day-order position 0 is never a candidate (it
// always survives, per the pre-existing "never empty for a non-empty input" rule) and a
// large-class slot is skipped while it is the day's last remaining large-class slot and any
// non-large slot is still a candidate.
function pickRemovalVictim(plans: readonly DaySlotPlan[]): number {
  const candidates = plans.map((plan, index) => ({ plan, index })).filter(({ index }) => index !== 0);
  if (candidates.length === 0) return -1;

  const largeCount = plans.filter((plan) => plan.volumeClass === 'large').length;

  const sorted = [...candidates].sort((a, b) => {
    const aClassTier = VOLUME_CLASS_REMOVAL_PRIORITY[a.plan.volumeClass];
    const bClassTier = VOLUME_CLASS_REMOVAL_PRIORITY[b.plan.volumeClass];
    if (aClassTier !== bClassTier) return aClassTier - bClassTier;

    return b.index - a.index;
  });

  for (const candidate of sorted) {
    if (candidate.plan.volumeClass === 'large' && largeCount <= 1) continue;
    return candidate.index;
  }
  // Every remaining candidate is the day's sole large-class slot with nothing non-large left to
  // prefer instead — remove it anyway rather than deadlocking the outer loop.
  return sorted[0]!.index;
}

// Replaces the old trimToSessionLength. Evaluates against the hardest training cycle's set counts
// (D-03) and, until the estimate fits the budget or nothing more can concede, applies D-04's
// amended three-phase order: (1) remove overflow exercises (a group's second-or-later slot) before
// touching any set count, (2) reduce sets one at a time down to each remaining slot's floor, (3)
// remove whole first exercises by volume-class priority. Neither mutates nor reorders its input
// array.
export function fitDayToSessionLength(plans: readonly DaySlotPlan[], sessionLengthMinutes: number): SessionFitResult {
  let working = plans.map((plan) => ({ ...plan }));
  let setsRemovedCount = 0;
  let removedCount = 0;

  while (totalMinutes(working) > sessionLengthMinutes) {
    const victimIndex = pickOverflowVictim(working);
    if (victimIndex === -1) break;
    working = working.filter((_, index) => index !== victimIndex);
    removedCount += 1;
  }

  // Computed against `working` AFTER overflow removal (never against the original `plans`): phase
  // 1 only removes slots, never reduces sets, so every survivor's hardestCycleSets here is still
  // its originally planned value — and array positions have shifted, so floors must be indexed
  // against the same (possibly shrunk) array pickReductionVictim below will walk.
  const floors = working.map((plan) => Math.min(MIN_SETS_PER_EXERCISE, plan.hardestCycleSets));

  while (totalMinutes(working) > sessionLengthMinutes) {
    const victimIndex = pickReductionVictim(working, floors);
    if (victimIndex === -1) break;
    const victim = working[victimIndex]!;
    working[victimIndex] = { ...victim, hardestCycleSets: victim.hardestCycleSets - 1 };
    setsRemovedCount += 1;
  }

  while (working.length > 1 && totalMinutes(working) > sessionLengthMinutes) {
    const victimIndex = pickRemovalVictim(working);
    if (victimIndex === -1) break;
    working = working.filter((_, index) => index !== victimIndex);
    removedCount += 1;
  }

  const estimatedMinutes = totalMinutes(working);
  const overBudgetMinutes = Math.max(0, estimatedMinutes - sessionLengthMinutes);

  return { plans: working, removedCount, setsRemovedCount, estimatedMinutes, overBudgetMinutes };
}
