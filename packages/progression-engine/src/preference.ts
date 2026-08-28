import type { ProgressionPreference } from '@fitness/api-contracts';
import type { NormalizedPerformance } from './result';

export type ProgressionStep =
  | { kind: 'advance_reps'; reps: number }
  | { kind: 'raise_load'; reps: number };

export interface ProgressionStepPrescription {
  targetRepMin: number;
  targetRepMax: number;
}

export interface ResolveProgressionStepInput {
  performance: Pick<NormalizedPerformance, 'reps'>;
  prescription: ProgressionStepPrescription;
  preference: ProgressionPreference;
}

// D-07's one branch point: what kind of step a surplus performance earns, never what weight that
// step lands on (the caller snaps `raise_load` through @fitness/plate-math; this function knows
// nothing about achievability). Every `raise_load` reps value here is `targetRepMin` — the guard
// that keeps either mode from ratcheting weight upward without limit (08-RESEARCH.md Pitfall 1)
// lives in this one place, stated once: a load increase that kept the rep target would have no
// ceiling.
export function resolveProgressionStep({ performance, prescription, preference }: ResolveProgressionStepInput): ProgressionStep {
  const { targetRepMin, targetRepMax } = prescription;

  if (preference === 'widen_rep_range_first') {
    // Textbook double progression: stay at the same load and widen into the rep range one rep at
    // a time until the achieved rep count has reached the top of the range. Never asks for a
    // heavier weight while there is still room left in the prescribed range, which is what makes
    // this the gentler default for a lifter whose plate inventory is coarse.
    if (performance.reps >= targetRepMax) {
      return { kind: 'raise_load', reps: targetRepMin };
    }
    return { kind: 'advance_reps', reps: Math.min(performance.reps + 1, targetRepMax) };
  }

  // match_previous_weight: reach for a heavier weight on the first surplus rather than banking it
  // as extra reps at the same load — the lifter would rather the weight change than keep proving
  // the same weight for longer. The caller still verifies the raise is achievable and falls back
  // to the identical rep advance above when the gym's increments can't yet support it, so this
  // mode still lands on an advancing rep target whenever achievability, not preference, is what's
  // holding the load back.
  return { kind: 'raise_load', reps: targetRepMin };
}
