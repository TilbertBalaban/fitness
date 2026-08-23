// Both Epley and Brzycki degrade above roughly 10-12 reps (PITFALLS.md Pitfall 8) — this cutoff
// is a deliberate project choice, not a validated study threshold. A summary printing a confident
// 1RM off a set of 20 is worse than one printing nothing, so estimated1RM returns null past it
// rather than a number nobody should trust.
export const E1RM_MAX_VALID_REPS = 10;

export function estimated1RM(weightKg: number, reps: number): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return null;
  if (weightKg <= 0 || reps <= 0) return null;
  if (reps > E1RM_MAX_VALID_REPS) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}
