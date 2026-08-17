// Both the generator (generate-corpus.ts) and the performance suite
// (test/seeded-corpus-perf.e2e-spec.ts) import from here — a change to the corpus shape cannot
// silently invalidate the budget it is measured against (roadmap criterion 3).
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
} as const;
