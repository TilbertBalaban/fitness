import { countsTowardWorkingVolume, type SetType } from '@fitness/api-contracts';
import { rollingWindowStart } from './bucketing';
import { PROGRESS_WINDOW_DAYS } from './constants';

// The UI-SPEC pins this order and the first track is the card's visual anchor, so the order is
// data rather than layout — a card that renders `tracks` in the order it receives them cannot
// drift from the spec by reordering its own JSX.
export const WEEKLY_TRACK_IDS = ['sets', 'exercises', 'muscles'] as const;
export type WeeklyTrackId = (typeof WEEKLY_TRACK_IDS)[number];

export interface WeeklyTrack {
  id: WeeklyTrackId;
  achieved: number;
  target: number | null;
}

export interface WeeklyProgressResult {
  hasActivity: boolean;
  tracks: WeeklyTrack[];
}

export interface WeeklyProgressSetInput {
  id: string;
  setType: SetType;
  completed: boolean;
  parentSetId: string | null;
}

// Only PRIMARY muscle group ids cross this boundary. A secondary mapping is structurally
// unrepresentable here rather than filtered out downstream, and the ids arrive already resolved by
// 09-04's reader — this module performs no lookup and holds no muscle vocabulary of its own.
export interface WeeklyProgressExerciseInput {
  exerciseId: string;
  primaryMuscleGroupIds: string[];
  sets: WeeklyProgressSetInput[];
}

export interface WeeklyProgressSessionInput {
  sessionId: string;
  localDate: string;
  exercises: WeeklyProgressExerciseInput[];
}

// A slot carries its RESOLVED set target — per-cycle override resolution (resolveTarget) happens
// in the reader — AND the primary muscle group ids of its exercise. Both fields are named here
// rather than left implicit because the muscles TARGET cannot be computed without the programmed
// exercises' muscle ids; a contract that only carried targetSets would force its caller to
// reverse-engineer the missing half.
export interface ProgramTargetSlotInput {
  exerciseId: string;
  targetSets: number | null;
  primaryMuscleGroupIds: string[];
}

export interface ProgramTargetDayInput {
  slots: ProgramTargetSlotInput[];
}

// One full pass of this day list is a week's prescribed work (D-08).
export interface ProgramTargetInput {
  days: ProgramTargetDayInput[];
}

export interface WeeklyProgressInput {
  todayLocalDate: string;
  sessions: WeeklyProgressSessionInput[];
  programTarget: ProgramTargetInput | null;
}

interface Achieved {
  sets: number;
  exerciseIds: Set<string>;
  muscleGroupIds: Set<string>;
}

interface Targets {
  sets: number | null;
  exercises: number | null;
  muscles: number | null;
}

// The exercise strip's own predicate, imported rather than re-derived: a parent row, not a
// warm-up, completed. This is the fifth surface in the app to apply that trio, and it must agree
// with ExerciseStrip.countCompletedWorkingSets exactly — two visible definitions of "a set" in one
// app is a correctness bug, not a cosmetic one. A drop set with two children is ONE set here for
// the same reason it is one set on the strip.
function isQualifyingSet(set: WeeklyProgressSetInput): boolean {
  return set.parentSetId === null && countsTowardWorkingVolume(set.setType) && set.completed;
}

function achievedInWindow(sessions: WeeklyProgressSessionInput[], todayLocalDate: string): Achieved {
  const windowStart = rollingWindowStart(todayLocalDate, PROGRESS_WINDOW_DAYS);
  const achieved: Achieved = { sets: 0, exerciseIds: new Set(), muscleGroupIds: new Set() };

  for (const session of sessions) {
    // Both ends inclusive, and a "YYYY-MM-DD" string compares chronologically as it compares
    // lexicographically. Never a calendar week (D-07).
    if (session.localDate < windowStart || session.localDate > todayLocalDate) continue;

    for (const exercise of session.exercises) {
      const qualifying = exercise.sets.filter(isQualifyingSet).length;
      if (qualifying === 0) continue;

      achieved.sets += qualifying;
      achieved.exerciseIds.add(exercise.exerciseId);
      for (const muscleGroupId of exercise.primaryMuscleGroupIds) achieved.muscleGroupIds.add(muscleGroupId);
    }
  }

  return achieved;
}

// [CLAUDE'S CALL] The sets target is null only when NO slot in the program expresses one. Where
// some slots are targeted and others are not, the target is the sum of the ones that are: a
// program with nine of ten slots targeted expresses a real weekly prescription, and nulling the
// whole denominator over one untargeted accessory hides more from the lifter than it protects.
// Where the program genuinely expresses nothing — absent, no days, or no targeted slot at all —
// the track carries a null target and the card shows the achieved figure with no denominator and
// no bar, exactly as D-08 requires: show what was achieved rather than invent a denominator.
// Reversible.
function targetsFrom(programTarget: ProgramTargetInput | null): Targets {
  if (programTarget === null) return { sets: null, exercises: null, muscles: null };

  let setsTotal = 0;
  let targetedSlotCount = 0;
  const exerciseIds = new Set<string>();
  const muscleGroupIds = new Set<string>();

  for (const day of programTarget.days) {
    for (const slot of day.slots) {
      exerciseIds.add(slot.exerciseId);
      for (const muscleGroupId of slot.primaryMuscleGroupIds) muscleGroupIds.add(muscleGroupId);
      if (slot.targetSets === null) continue;
      setsTotal += slot.targetSets;
      targetedSlotCount += 1;
    }
  }

  // A zero distinct count is a program that prescribes nothing on that track, which is an absent
  // denominator and not a denominator of zero.
  return {
    sets: targetedSlotCount === 0 ? null : setsTotal,
    exercises: exerciseIds.size === 0 ? null : exerciseIds.size,
    muscles: muscleGroupIds.size === 0 ? null : muscleGroupIds.size,
  };
}

export function weeklyProgress({
  todayLocalDate,
  sessions,
  programTarget,
}: WeeklyProgressInput): WeeklyProgressResult {
  const achieved = achievedInWindow(sessions, todayLocalDate);

  // All three tracks derive from the same session population, so a single logged set makes all
  // three non-zero: the card is genuinely all-or-nothing and there is no partially-empty case to
  // model. Returning no tracks at all — rather than three zeroed ones — is what makes a row of
  // zero bars unrepresentable rather than merely discouraged (D-09).
  if (achieved.sets === 0) return { hasActivity: false, tracks: [] };

  const targets = targetsFrom(programTarget);

  return {
    hasActivity: true,
    tracks: [
      { id: 'sets', achieved: achieved.sets, target: targets.sets },
      { id: 'exercises', achieved: achieved.exerciseIds.size, target: targets.exercises },
      { id: 'muscles', achieved: achieved.muscleGroupIds.size, target: targets.muscles },
    ],
  };
}
