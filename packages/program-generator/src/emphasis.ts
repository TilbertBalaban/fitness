import type { EmphasisLevel } from '@fitness/api-contracts';

export const EMPHASIS_MULTIPLIERS: Record<EmphasisLevel, number> = {
  deprioritize: 0.7,
  normal: 1.0,
  emphasize: 1.3,
};

export interface VolumeBandLike {
  mev: number;
  mav: number;
}

// The multiply and the clamp are one expression, never split across two call sites or two
// statements — a stored unclamped intermediate is exactly the overreaching bug Pitfall 3
// describes. A value landing exactly on mev or mav is kept at that boundary: the interval is
// closed on both ends, so clamping never pushes a boundary value across it.
export function applyEmphasis(baseSets: number, level: EmphasisLevel, band: VolumeBandLike): number {
  return Math.min(Math.max(Math.round(baseSets * EMPHASIS_MULTIPLIERS[level]), band.mev), band.mav);
}
