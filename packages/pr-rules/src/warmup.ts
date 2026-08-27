// The 40/60/80 percent, 10/5/3 rep warm-up scheme is this project's own evidence-informed
// convention, not MacroFactor's undocumented internal formula — no public specification exists
// (PITFALLS.md Pitfall 8). Phase 6 adds an optional achievable-load rounder alongside this
// increment rather than replacing it: this value is now the last-resort fallback for a caller
// with no resolvable gym profile, never the app's general increment — RESEARCH.md's Open
// Question 3 recommends keeping it as documented insurance, and D-19's seed-on-first-need means
// it should never actually be reached in normal operation.
export const DEFAULT_ROUNDING_INCREMENT_KG = 2.5;

export const WARMUP_STEPS = [
  { fraction: 0.4, reps: 10 },
  { fraction: 0.6, reps: 5 },
  { fraction: 0.8, reps: 3 },
] as const;

export function roundToIncrement(value: number, increment: number): number {
  // Math.round ties toward +Infinity for positive inputs, which is exactly the "halfway
  // rounds up" rule this function needs — pinned here by a test rather than left as an
  // unstated assumption, because a silent round-down produces a warm-up one plate light.
  return Math.round(value / increment) * increment;
}

export interface WarmupSet {
  weightKg: number;
  reps: number;
}

export function warmupSets(
  workingWeightKg: number | null,
  roundingIncrementKg: number = DEFAULT_ROUNDING_INCREMENT_KG,
  roundWeight?: (rawKg: number) => number
): WarmupSet[] {
  if (
    workingWeightKg === null ||
    !Number.isFinite(workingWeightKg) ||
    workingWeightKg <= 0
  ) {
    return [];
  }

  const sets: WarmupSet[] = [];
  for (const step of WARMUP_STEPS) {
    const rawKg = workingWeightKg * step.fraction;
    const weightKg = roundWeight ? roundWeight(rawKg) : roundToIncrement(rawKg, roundingIncrementKg);
    if (weightKg <= 0) continue;
    sets.push({ weightKg, reps: step.reps });
  }

  return sets;
}
