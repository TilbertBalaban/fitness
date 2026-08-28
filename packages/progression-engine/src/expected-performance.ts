// The even-width tie-break (e.g. rep-range 6-9) is this package's own decision, not inherited.
// The sibling packages document two OPPOSITE rounding conventions for the same kind of halfway
// case — @fitness/plate-math's achievability.ts resolves ties down, @fitness/pr-rules' warmup.ts
// resolves them toward positive infinity — so silently reusing either here would leave a reader
// assuming the wrong one. 'up' is chosen so an even-width range's midpoint favours the harder rep
// target, matching this package's round-down-on-load / round-up-on-reps asymmetry (D-13).
export const REP_RANGE_MIDPOINT_TIE_BREAK = 'up';

export function repRangeMidpoint(targetRepMin: number, targetRepMax: number): number {
  const width = targetRepMax - targetRepMin;
  return targetRepMin + Math.ceil(width / 2);
}

export interface ExpectedPerformancePrescription {
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRir: number | null;
}

export function expectedPerformance(prescription: ExpectedPerformancePrescription): number | null {
  const { targetRepMin, targetRepMax, targetRir } = prescription;
  if (targetRepMin === null || targetRepMax === null || targetRir === null) return null;
  if (!Number.isFinite(targetRepMin) || !Number.isFinite(targetRepMax) || !Number.isFinite(targetRir)) return null;
  if (targetRepMin < 0 || targetRepMax < 0 || targetRir < 0) return null;
  if (targetRepMin > targetRepMax) return null;
  return repRangeMidpoint(targetRepMin, targetRepMax) + targetRir;
}
