import type { ExperienceLevel, MuscleGroupId } from '@fitness/api-contracts';
import { GENERATION_INPUT_LIMITS } from './result';

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
// the rep band, the cycle index and daysPerWeek pick the RIR, and the landmark table picks the
// sets — three independent axes, never one number doing two of those jobs.
//
// D-09: fewer weekly sessions mean more recovery between them, so a lower-frequency week's ladder
// ends nearer failure than a higher-frequency week's — a 2-day week reaches RIR 0 by its last
// training cycle, a 6-day week never goes below RIR 1. This project's own design decision, not
// sourced from MacroFactor (which publishes none of this math either); provenance recorded in
// docs/volume-rir-landmarks.md.
export const RIR_LADDER_BY_DAYS_PER_WEEK: Record<number, readonly number[]> = {
  2: [2, 1, 0, 0],
  3: [2, 1, 1, 0],
  4: [3, 2, 1, 1],
  5: [3, 2, 2, 1],
  6: [3, 2, 2, 1],
};

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

// T-13-01: daysPerWeek is clamped into GENERATION_INPUT_LIMITS' declared range before the lookup
// and falls back to the 4-day ladder if the clamped key is still absent, so no input that passes
// isGenerationInput — or any future widening of that range — can index this table with undefined.
// Within the resolved ladder, the same floor-at-the-last-member behaviour as before applies for a
// cycle index past the end.
export function rirForCycle(cycleIndex: number, daysPerWeek: number): number {
  const clampedDaysPerWeek = Math.min(
    Math.max(daysPerWeek, GENERATION_INPUT_LIMITS.minDaysPerWeek),
    GENERATION_INPUT_LIMITS.maxDaysPerWeek,
  );
  const ladder = RIR_LADDER_BY_DAYS_PER_WEEK[clampedDaysPerWeek] ?? RIR_LADDER_BY_DAYS_PER_WEEK[4]!;
  const index = Math.min(cycleIndex, ladder.length - 1);
  return ladder[index]!;
}
