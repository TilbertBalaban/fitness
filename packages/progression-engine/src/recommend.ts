import { expectedPerformance } from './expected-performance';
import { normalizeHistory } from './normalize-history';
import { compareCanonicalKg, idealNextLoadKg, snapToAchievable } from './snap';
import type { ProgressionResult, RecommendInput } from './result';

const CANONICAL_KG_PATTERN = /^\d+(\.\d+)?$/;

function isValidLoggedWeight(weightKg: string | null): boolean {
  return weightKg === null || CANONICAL_KG_PATTERN.test(weightKg);
}

// The public entry point (D-01). Guarded the way estimated1RM guards itself — a malformed row
// returns a typed `unavailable`, never a throw, because this runs on the screen a lifter is
// standing in front of mid-set.
export function recommendNextPrescription(input: RecommendInput): ProgressionResult {
  const { targetRepMin, targetRepMax, targetRir } = input.prescription;
  const expected = expectedPerformance(input.prescription);
  if (expected === null || targetRepMin === null || targetRepMax === null || targetRir === null) {
    return { kind: 'unavailable', reason: 'incomplete_prescription' };
  }

  const normalized = normalizeHistory(input.sessions);
  if (normalized.length === 0) {
    return { kind: 'no_history' };
  }

  if (
    input.equipmentType !== null &&
    input.inventory !== null &&
    input.inventory.unavailableEquipmentTypes.includes(input.equipmentType)
  ) {
    return { kind: 'unavailable', reason: 'equipment_unavailable' };
  }

  const topSet = normalized[0]!;

  // A malformed logged row (negative reps, a non-finite/non-canonical weight string) cannot yield
  // a trustworthy load — reusing `no_achievable_weight` here rather than throwing, since "we
  // cannot produce a valid weight from this input" is the accurate description of the failure.
  if (!Number.isFinite(topSet.reps) || topSet.reps < 0 || !isValidLoggedWeight(topSet.weightKg)) {
    return { kind: 'unavailable', reason: 'no_achievable_weight' };
  }
  if (topSet.rir !== null && (!Number.isFinite(topSet.rir) || topSet.rir < 0)) {
    return { kind: 'unavailable', reason: 'no_achievable_weight' };
  }

  const achieved = topSet.reps + (topSet.rir ?? 0);
  const surplusReps = achieved - expected;
  const cappedRepIncrease = Math.min(topSet.reps + 1, targetRepMax);

  if (topSet.weightKg === null) {
    // PLAT-08: a bodyweight movement has no load axis to raise — it progresses on reps alone,
    // whether or not it beat expected performance.
    return {
      kind: 'recommendation',
      weightKg: null,
      reps: surplusReps > 0 ? cappedRepIncrease : targetRepMin,
      rir: targetRir,
      basis: surplusReps > 0 ? 'rep_increase' : 'hold',
      offeredReduction: null,
    };
  }

  if (surplusReps <= 0) {
    return {
      kind: 'recommendation',
      weightKg: topSet.weightKg,
      reps: targetRepMin,
      rir: targetRir,
      basis: 'hold',
      offeredReduction: null,
    };
  }

  const idealKg = idealNextLoadKg(topSet.weightKg, surplusReps);
  const snappedKg = snapToAchievable({ targetKg: idealKg, equipmentType: input.equipmentType, inventory: input.inventory });
  if (snappedKg === null) {
    return { kind: 'unavailable', reason: 'no_achievable_weight' };
  }

  if (compareCanonicalKg(snappedKg, topSet.weightKg) > 0) {
    return {
      kind: 'recommendation',
      weightKg: snappedKg,
      reps: targetRepMin,
      rir: targetRir,
      basis: 'load_increase',
      offeredReduction: null,
    };
  }

  return {
    kind: 'recommendation',
    weightKg: topSet.weightKg,
    reps: cappedRepIncrease,
    rir: targetRir,
    basis: 'rep_increase',
    offeredReduction: null,
  };
}
