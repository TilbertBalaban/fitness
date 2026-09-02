// This project's own estimates — not measured, not sourced from MacroFactor (which publishes
// none of this math either). WORK_SECONDS_PER_SET is the assumed time actually under load plus
// transition; SESSION_OVERHEAD_MINUTES covers warm-up, changing between stations, and the walk
// to/from the gym floor.
//
// Phase 13 D-03: this module stays the single time model — the fit that spends this estimate
// against a session-length budget lives in session-fit.ts, not here, and it evaluates the estimate
// against the hardest training cycle's set counts, not cycle 1's alone.
export const WORK_SECONDS_PER_SET = 45;
export const SESSION_OVERHEAD_MINUTES = 10;

export function estimateSlotMinutes(targetSets: number, targetRestSeconds: number): number {
  return (targetSets * (WORK_SECONDS_PER_SET + targetRestSeconds)) / 60;
}
