import { expectedPerformance } from './expected-performance';
import { beatsPriorRepsAtSameLoad, isFailurePerformance } from './failure-progression';
import { normalizeHistory } from './normalize-history';
import { achievedPerformanceFor, classifyPerformance } from './rir-band';
import { countConsecutiveShortfalls, offeredReductionFor } from './shortfall';
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

  // PRGR-03: the midpoint-plus-RIR formula has no meaning at zero reps in reserve, so a failure
  // set decides here instead — beat the prior failure set's reps at the same stored load, or
  // hold. This branch never raises load, so it cannot become a second way around the
  // load-increase-pairs-with-a-rep-reset rule the branches below enforce.
  if (isFailurePerformance(topSet)) {
    const beat = beatsPriorRepsAtSameLoad(normalized);
    return {
      kind: 'recommendation',
      weightKg: topSet.weightKg,
      reps: beat ? Math.min(topSet.reps + 1, targetRepMax) : topSet.reps,
      rir: targetRir,
      basis: beat ? 'failure_rep_increase' : 'hold',
      offeredReduction: null,
    };
  }

  const achieved = achievedPerformanceFor(topSet);
  const verdict = classifyPerformance(achieved, expected);
  const cappedRepIncrease = Math.min(topSet.reps + 1, targetRepMax);

  // PRGR-09/D-05: a shortfall holds the prescription outright — the weight and reps below are
  // identical to the plain within-band hold. The streak and its offer ride on `offeredReduction`
  // alone; they never change the recommendation itself.
  if (verdict === 'shortfall') {
    const streak = countConsecutiveShortfalls(normalized, input.prescription);
    return {
      kind: 'recommendation',
      weightKg: topSet.weightKg,
      reps: targetRepMin,
      rir: targetRir,
      basis: 'shortfall_hold',
      offeredReduction: offeredReductionFor({
        streak,
        weightKg: topSet.weightKg,
        reps: targetRepMin,
        equipmentType: input.equipmentType,
        inventory: input.inventory,
      }),
    };
  }

  if (topSet.weightKg === null) {
    // PLAT-08: a bodyweight movement has no load axis to raise — it progresses on reps alone,
    // whether or not it beat expected performance.
    return {
      kind: 'recommendation',
      weightKg: null,
      reps: verdict === 'surplus' ? cappedRepIncrease : targetRepMin,
      rir: targetRir,
      basis: verdict === 'surplus' ? 'rep_increase' : 'hold',
      offeredReduction: null,
    };
  }

  if (verdict !== 'surplus') {
    return {
      kind: 'recommendation',
      weightKg: topSet.weightKg,
      reps: targetRepMin,
      rir: targetRir,
      basis: 'hold',
      offeredReduction: null,
    };
  }

  const idealKg = idealNextLoadKg(topSet.weightKg, achieved - expected);
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
