import type { MuscleGroupId, MuscleRole } from '@fitness/api-contracts';

// Both the generator (generate-corpus.ts) and the performance suite
// (test/seeded-corpus-perf.e2e-spec.ts) import from here — a change to the corpus shape cannot
// silently invalidate the budget it is measured against (roadmap criterion 3). The muscle-mapping
// table below is part of this same shape for exactly the same reason: it is what makes the rollup
// path (and therefore the reconcile budget declared in PERF_BUDGET below) compute anything
// nontrivial at all — change the mappings and the budget is measuring a different corpus.
export const CORPUS_SHAPE = {
  spanMonths: 18,
  sessionsPerWeek: 4,
  setsPerSession: 15,
  seed: 20260817,
} as const;

// [ASSUMED] per 02-RESEARCH.md Decision 8 (assumption A1) — the researcher's reasoned starting
// point, not measured against a competitor or real usage. Kept as one exported constant so
// changing a target is a one-line edit rather than a hunt through the test suite.
export const PERF_BUDGET = {
  pushSessionBatchMs: 2000,
  pushSingleSetMs: 500,
  fullReadMs: 5000,
  maxQueriesPerSessionRead: 3,
  // [ASSUMED] no prior art in this repo and no external spec. Reasoned starting point: ~7
  // statements for the rollup half (four batched reads, one delete, one insert, one watermark
  // upsert) plus ~6 for the record half (three batched reads, one update family, one insert, one
  // delete), plus headroom. Treat the first real run against the seeded corpus as the calibration
  // point — if the measured count exceeds this, record the measured number and the reason before
  // adjusting; a silently widened ceiling is a budget that has stopped budgeting.
  maxQueriesPerReconcile: 24,
} as const;

export interface CorpusMuscleMapping {
  muscleGroupId: MuscleGroupId;
  role: MuscleRole;
  weightFactor: number;
}

// A plausible strength-training taxonomy for the corpus's ten seed-ex-* exercises — not the
// shipped catalog, and not clinically authoritative. It exists so the rollup path has real,
// weighted, secondary-inclusive volume to compute: at least one secondary mapping per exercise at
// a fractional weight factor, so D-04's weighting is genuinely exercised rather than passing
// vacuously against an empty join.
export const CORPUS_MUSCLE_MAPPINGS: Record<string, CorpusMuscleMapping[]> = {
  'seed-ex-back-squat': [
    { muscleGroupId: 'quads', role: 'primary', weightFactor: 1.0 },
    { muscleGroupId: 'glutes', role: 'secondary', weightFactor: 0.5 },
  ],
  'seed-ex-bench-press': [
    { muscleGroupId: 'chest', role: 'primary', weightFactor: 1.0 },
    { muscleGroupId: 'triceps', role: 'secondary', weightFactor: 0.5 },
    { muscleGroupId: 'front_delts', role: 'secondary', weightFactor: 0.3 },
  ],
  'seed-ex-deadlift': [
    { muscleGroupId: 'hamstrings', role: 'primary', weightFactor: 1.0 },
    { muscleGroupId: 'glutes', role: 'secondary', weightFactor: 0.5 },
    { muscleGroupId: 'lower_back', role: 'secondary', weightFactor: 0.3 },
  ],
  'seed-ex-overhead-press': [
    { muscleGroupId: 'front_delts', role: 'primary', weightFactor: 1.0 },
    { muscleGroupId: 'triceps', role: 'secondary', weightFactor: 0.5 },
  ],
  'seed-ex-dumbbell-row': [
    { muscleGroupId: 'lats', role: 'primary', weightFactor: 1.0 },
    { muscleGroupId: 'biceps', role: 'secondary', weightFactor: 0.5 },
  ],
  'seed-ex-pull-up': [
    { muscleGroupId: 'lats', role: 'primary', weightFactor: 1.0 },
    { muscleGroupId: 'biceps', role: 'secondary', weightFactor: 0.5 },
  ],
  'seed-ex-weighted-dip': [
    { muscleGroupId: 'chest', role: 'primary', weightFactor: 1.0 },
    { muscleGroupId: 'triceps', role: 'secondary', weightFactor: 0.5 },
  ],
  'seed-ex-assisted-pull-up': [
    { muscleGroupId: 'lats', role: 'primary', weightFactor: 1.0 },
    { muscleGroupId: 'biceps', role: 'secondary', weightFactor: 0.5 },
  ],
  'seed-ex-plank': [
    { muscleGroupId: 'abs', role: 'primary', weightFactor: 1.0 },
    { muscleGroupId: 'obliques', role: 'secondary', weightFactor: 0.5 },
  ],
  'seed-ex-farmers-carry': [
    { muscleGroupId: 'forearms', role: 'primary', weightFactor: 1.0 },
    { muscleGroupId: 'abs', role: 'secondary', weightFactor: 0.3 },
  ],
};
