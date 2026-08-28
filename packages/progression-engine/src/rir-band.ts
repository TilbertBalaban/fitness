import type { NormalizedPerformance } from './result';

// D-06 [CLAUDE'S CALL], 08-CONTEXT.md: this project's own number, not a published one — the
// closest published autoregulation model triggers on reps missed within a single set, a
// different axis entirely, and no source found states a band width for matching a self-reported
// reps-in-reserve against a target across sessions. One rep is the smallest band that absorbs
// ordinary imprecision in a self-reported RIR while still separating a genuine zero-in-reserve
// grinder from a three-in-reserve back-off set.
export const RIR_TOLERANCE_BAND = 1;

export type PerformanceVerdict = 'surplus' | 'within_band' | 'shortfall';

// PRGR-10: replaces the bare inequality the engine wrote before this plan — no caller compares
// achieved and expected performance directly again.
export function classifyPerformance(achieved: number, expected: number): PerformanceVerdict {
  const delta = achieved - expected;
  if (delta > RIR_TOLERANCE_BAND) return 'surplus';
  if (delta < -RIR_TOLERANCE_BAND) return 'shortfall';
  return 'within_band';
}

// A missing reps-in-reserve entry is treated as zero rather than discarding the set — a lifter
// who did not record reps in reserve still logged reps.
export function achievedPerformanceFor(performance: Pick<NormalizedPerformance, 'reps' | 'rir'>): number {
  return performance.reps + (performance.rir ?? 0);
}
