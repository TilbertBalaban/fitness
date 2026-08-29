import type { ExperienceLevel, MuscleGroupId } from '@fitness/api-contracts';

// D-15: MacroFactor's own landmark math is not public. Every constant in this module is this
// project's own design decision, informed by published volume-landmark and autoregulation
// literature rather than copied from it — provenance recorded in docs/volume-rir-landmarks.md.

export type VolumeClass = 'large' | 'medium' | 'small';

export const MUSCLE_GROUP_VOLUME_CLASS: Record<MuscleGroupId, VolumeClass> = {
  chest: 'large',
  lats: 'large',
  upper_back_traps: 'large',
  quads: 'large',
  hamstrings: 'large',
  glutes: 'large',
  front_delts: 'medium',
  side_delts: 'medium',
  rear_delts: 'medium',
  biceps: 'medium',
  triceps: 'medium',
  abs: 'medium',
  adductors: 'medium',
  calves: 'medium',
  lower_back: 'small',
  forearms: 'small',
  obliques: 'small',
  abductors: 'small',
  neck: 'small',
};

export interface VolumeBand {
  mev: number;
  mav: number;
}

export const EXPERIENCE_VOLUME_BAND: Record<ExperienceLevel, Record<VolumeClass, VolumeBand>> = {
  beginner: { large: { mev: 8, mav: 12 }, medium: { mev: 6, mav: 10 }, small: { mev: 4, mav: 6 } },
  intermediate: { large: { mev: 10, mav: 18 }, medium: { mev: 8, mav: 14 }, small: { mev: 4, mav: 8 } },
  advanced: { large: { mev: 12, mav: 22 }, medium: { mev: 10, mav: 16 }, small: { mev: 6, mav: 10 } },
};

export interface RepRange {
  min: number;
  max: number;
}

export const REP_RANGE_BY_GOAL: Record<'strength' | 'hypertrophy' | 'endurance', RepRange> = {
  strength: { min: 4, max: 6 },
  hypertrophy: { min: 8, max: 12 },
  endurance: { min: 15, max: 20 },
};

export const REST_SECONDS_BY_GOAL: Record<'strength' | 'hypertrophy' | 'endurance', number> = {
  strength: 180,
  hypertrophy: 120,
  endurance: 60,
};

// Descending across training cycles within a block (easier -> harder), per D-17. The goal picks
// the rep band, the cycle index picks the RIR, and the landmark table picks the sets — three
// independent axes, never one number doing two of those jobs.
export const RIR_PROGRESSION = [3, 2, 1, 1] as const;

function volumeBandFor(experienceLevel: ExperienceLevel, muscleGroupId: MuscleGroupId): VolumeBand {
  const volumeClass = MUSCLE_GROUP_VOLUME_CLASS[muscleGroupId];
  return EXPERIENCE_VOLUME_BAND[experienceLevel][volumeClass];
}

// Ramps linearly from the band's mev at cycle 0 to its mav at the last training cycle, rounded so
// the first cycle is exactly mev and the last is exactly mav. A trainingCycleCount of 1 returns
// mev — there is no "last cycle" to ramp toward.
export function weeklySetTarget(
  experienceLevel: ExperienceLevel,
  muscleGroupId: MuscleGroupId,
  cycleIndex: number,
  trainingCycleCount: number,
): number {
  const band = volumeBandFor(experienceLevel, muscleGroupId);
  if (trainingCycleCount <= 1) return band.mev;

  const fraction = cycleIndex / (trainingCycleCount - 1);
  return Math.round(band.mev + (band.mav - band.mev) * fraction);
}

// The ladder floors at RIR_PROGRESSION's final member rather than going negative or undefined for
// a cycle index past the end of the tuple.
export function rirForCycle(cycleIndex: number): number {
  const index = Math.min(cycleIndex, RIR_PROGRESSION.length - 1);
  return RIR_PROGRESSION[index]!;
}
