import { PrType, WARMUP_SET_TYPE } from '@fitness/api-contracts';
import { estimated1RM } from './estimated-1rm';

export interface PriorBest {
  heaviestWeight: number | null;
  bestE1rm: number | null;
  mostRepsAtWeight: Map<number, number>;
  bestSetVolume: number | null;
}

export interface CandidateSet {
  weightKg: number | null;
  reps: number;
  setType: string;
  completed: boolean;
}

export interface DetectedPr {
  prType: PrType;
  value: number;
}

export function emptyPriorBest(): PriorBest {
  return {
    heaviestWeight: null,
    bestE1rm: null,
    mostRepsAtWeight: new Map(),
    bestSetVolume: null,
  };
}

export function foldPriorBest(sets: CandidateSet[]): PriorBest {
  const priorBest = emptyPriorBest();

  for (const set of sets) {
    if (set.setType === WARMUP_SET_TYPE || !set.completed || set.weightKg === null) continue;

    const { weightKg, reps } = set;

    if (priorBest.heaviestWeight === null || weightKg > priorBest.heaviestWeight) {
      priorBest.heaviestWeight = weightKg;
    }

    const e1rm = estimated1RM(weightKg, reps);
    if (e1rm !== null && (priorBest.bestE1rm === null || e1rm > priorBest.bestE1rm)) {
      priorBest.bestE1rm = e1rm;
    }

    const priorRepsAtWeight = priorBest.mostRepsAtWeight.get(weightKg);
    if (priorRepsAtWeight === undefined || reps > priorRepsAtWeight) {
      priorBest.mostRepsAtWeight.set(weightKg, reps);
    }

    const volume = weightKg * reps;
    if (priorBest.bestSetVolume === null || volume > priorBest.bestSetVolume) {
      priorBest.bestSetVolume = volume;
    }
  }

  return priorBest;
}

export function detectPrs(candidate: CandidateSet, priorBest: PriorBest): DetectedPr[] {
  if (candidate.setType === WARMUP_SET_TYPE || !candidate.completed || candidate.weightKg === null) {
    return [];
  }

  const { weightKg, reps } = candidate;
  const results: DetectedPr[] = [];

  // A tie is not a PR — only a strict improvement counts. "Ties or beats" was a plausible
  // reading of D-30 too, so this choice is pinned here rather than left implicit.
  if (priorBest.heaviestWeight === null || weightKg > priorBest.heaviestWeight) {
    results.push({ prType: 'heaviest_weight', value: weightKg });
  }

  const e1rm = estimated1RM(weightKg, reps);
  if (e1rm !== null && (priorBest.bestE1rm === null || e1rm > priorBest.bestE1rm)) {
    results.push({ prType: 'best_e1rm', value: e1rm });
  }

  // "No entry exists" only means a PR when there is no history at ANY weight (a true
  // first-ever set) — a non-empty map missing this exact weight is not a record, it's an
  // untested weight. 100kg x 8 must not count against a prior 90kg x 12 (LOG-18 adjacency).
  const priorRepsAtWeight = priorBest.mostRepsAtWeight.get(weightKg);
  const isFirstEverSet = priorBest.mostRepsAtWeight.size === 0;
  if (isFirstEverSet || (priorRepsAtWeight !== undefined && reps > priorRepsAtWeight)) {
    results.push({ prType: 'most_reps_at_weight', value: reps });
  }

  const volume = weightKg * reps;
  if (priorBest.bestSetVolume === null || volume > priorBest.bestSetVolume) {
    results.push({ prType: 'best_set_volume', value: volume });
  }

  return results;
}
