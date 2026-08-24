// The 40/60/80 percent, 10/5/3 rep warm-up scheme is this project's own evidence-informed
// convention, not MacroFactor's undocumented internal formula — no public specification exists
// (PITFALLS.md Pitfall 8). Phase 6 replaces roundingIncrementKg with the active gym profile's
// real plate increments behind this same signature.
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
  roundingIncrementKg: number = DEFAULT_ROUNDING_INCREMENT_KG
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
    const weightKg = roundToIncrement(workingWeightKg * step.fraction, roundingIncrementKg);
    if (weightKg <= 0) continue;
    sets.push({ weightKg, reps: step.reps });
  }

  return sets;
}
