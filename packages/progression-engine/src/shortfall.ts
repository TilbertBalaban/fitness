import type { EquipmentType } from '@fitness/api-contracts';
import { achievableLoadsForEquipmentType, nearestLoadable, type ResolvedInventory } from '@fitness/plate-math';
import { expectedPerformance, type ExpectedPerformancePrescription } from './expected-performance';
import { achievedPerformanceFor, classifyPerformance } from './rir-band';
import type { NormalizedPerformance, OfferedReduction } from './result';

// D-05 [CLAUDE'S CALL], 08-CONTEXT.md: this project's own number, not a published one. The
// roadmap and requirements both name a two-to-three-session range; three is the conservative end,
// erring toward the requirement this constant must never collide with — a reduced recommendation
// as a consequence of missing sessions is forbidden outright, so this threshold stays
// deliberately slow to trigger. No source found states a consecutive-session shortfall threshold
// for this axis; the closest published autoregulation model operates on a different one entirely.
export const SHORTFALL_STREAK_FOR_REDUCTION_OFFER = 3;

// Takes performances and the prescription and nothing else — no calendar input of any kind, no
// session-spacing argument, no clock read. A rule that decayed on how much real time separated
// sessions would necessarily produce a reduced recommendation after a layoff, which is exactly
// what is forbidden; recency here is positional — how many sessions ago, never how long ago. This
// absence is the single most load-bearing line in this package.
export function countConsecutiveShortfalls(
  history: NormalizedPerformance[],
  prescription: ExpectedPerformancePrescription,
): number {
  const expected = expectedPerformance(prescription);
  if (expected === null) return 0;

  let streak = 0;
  for (const performance of history) {
    const achieved = achievedPerformanceFor(performance);
    if (classifyPerformance(achieved, expected) !== 'shortfall') break;
    streak += 1;
  }
  return streak;
}

export interface OfferedReductionInput {
  streak: number;
  weightKg: string | null;
  reps: number;
  equipmentType: EquipmentType | null;
  inventory: ResolvedInventory | null;
}

// An offer, never applied — the recommendation this rides on keeps its own weight and reps
// unchanged whether or not this returns non-null. Below the threshold, or for a movement with no
// load axis to reduce, there is nothing to offer. The offered weight is resolved through the same
// achievability lookup the recommendation's own load path already uses, so an offer is always
// something the current gym can actually produce.
export function offeredReductionFor(input: OfferedReductionInput): OfferedReduction | null {
  if (input.streak < SHORTFALL_STREAK_FOR_REDUCTION_OFFER) return null;
  if (input.weightKg === null) return null;

  const achievable = achievableLoadsForEquipmentType(input.equipmentType, input.inventory);
  const reducedWeightKg = nearestLoadable(input.weightKg, achievable).lower;
  if (reducedWeightKg === null) return null;

  return { weightKg: reducedWeightKg, reps: input.reps };
}
