import { CANONICAL_KG_SCALE, formatWeight, type WeightUnit } from '@fitness/api-contracts';
import { E1RM_MAX_VALID_REPS, estimated1RM } from '@fitness/pr-rules';

// Built by interpolating the imported cap so the copy and the rule can never drift apart.
export const E1RM_ABOVE_CAP_COPY = `Not meaningful above ${E1RM_MAX_VALID_REPS} reps`;

export type E1rmDisplay =
  | { kind: 'value'; display: string }
  // Weighted sets exist and every one is above the rep cap. Distinct from `unavailable` on
  // purpose: claiming the rep cap as the reason when the real reason is that nothing was logged is
  // a wrong explanation, which is worse than none.
  | { kind: 'above-cap' }
  | { kind: 'unavailable' };

export interface E1rmCandidateSet {
  weightKg: string | null;
  reps: number;
}

export interface E1rmDisplayInput {
  // The caller chooses the population and this function applies no set-type predicate of its own:
  // the workout summary passes the rows it already renders, the performance screen passes
  // record-eligible rows. Filtering inside would silently change the shipped summary cell's value.
  sets: E1rmCandidateSet[];
  unit: WeightUnit;
  estimate?: (weightKg: number, reps: number) => number | null;
}

export function resolveE1rmDisplay({ sets, unit, estimate = estimated1RM }: E1rmDisplayInput): E1rmDisplay {
  try {
    let best: number | null = null;
    let sawWeightedSet = false;
    let sawAboveCapSet = false;

    for (const set of sets) {
      if (set.weightKg === null) continue;
      const weight = Number(set.weightKg);
      if (!Number.isFinite(weight)) continue;
      sawWeightedSet = true;
      if (set.reps > E1RM_MAX_VALID_REPS) sawAboveCapSet = true;
      const value = estimate(weight, set.reps);
      if (value !== null && (best === null || value > best)) best = value;
    }

    if (best !== null) {
      // The one place this package emits a display string rather than a number: the UI-SPEC pins
      // `display: string` on the union, and reproducing this formatter at three call sites is a
      // worse trade than one documented exception. Same toFixed-then-formatWeight path the shipped
      // workout summary already uses.
      return { kind: 'value', display: formatWeight(best.toFixed(CANONICAL_KG_SCALE), unit) };
    }
    if (sawWeightedSet && sawAboveCapSet) return { kind: 'above-cap' };
    return { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}
