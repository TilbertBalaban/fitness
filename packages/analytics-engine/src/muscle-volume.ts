import { countsTowardWorkingVolume, MUSCLE_GROUPS, type SetType } from '@fitness/api-contracts';

export interface MuscleVolumeSetInput {
  setType: SetType;
  completed: boolean;
  weightKg: number | null;
  reps: number;
}

// Both the mapping list and the caller resolve muscle ids before this boundary — this module
// holds no muscle vocabulary of its own beyond MUSCLE_GROUPS for ordering, and performs no lookup.
// Secondary mappings are included deliberately (D-04): a bench press contributes to triceps too,
// at triceps' own weightFactor, and that is a different quantity from Phase 9's primary-only
// "muscles trained" count.
export interface MuscleVolumeMappingInput {
  muscleGroupId: string;
  weightFactor: number;
}

export interface MuscleVolumeExerciseInput {
  exerciseId: string;
  muscleMappings: MuscleVolumeMappingInput[];
  sets: MuscleVolumeSetInput[];
}

export interface MuscleVolumeSessionInput {
  sessionId: string;
  localDate: string;
  exercises: MuscleVolumeExerciseInput[];
}

export interface MuscleVolumeCell {
  muscleGroupId: string;
  localDate: string;
  weightedVolumeKg: number;
  weightedSets: number;
  setCount: number;
}

// Volume uses countsTowardWorkingVolume, never countsTowardRecords (D-07) — the records predicate
// is a different, stricter question this module never answers.
function isQualifyingSet(set: MuscleVolumeSetInput): boolean {
  return set.completed && countsTowardWorkingVolume(set.setType);
}

const MUSCLE_GROUP_ORDER = new Map<string, number>(MUSCLE_GROUPS.map((id, index) => [id, index]));

function compareCells(a: MuscleVolumeCell, b: MuscleVolumeCell): number {
  if (a.localDate !== b.localDate) return a.localDate < b.localDate ? -1 : 1;

  const orderA = MUSCLE_GROUP_ORDER.get(a.muscleGroupId);
  const orderB = MUSCLE_GROUP_ORDER.get(b.muscleGroupId);
  if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
  // A muscle id outside MUSCLE_GROUPS sorts last, by id, rather than throwing.
  if (orderA !== undefined) return -1;
  if (orderB !== undefined) return 1;
  return a.muscleGroupId < b.muscleGroupId ? -1 : a.muscleGroupId > b.muscleGroupId ? 1 : 0;
}

// The one pure weighted-volume aggregation shared by the server writer (this plan) and the client
// reader (10-03). A cell is dropped entirely when its setCount would be 0 rather than returned as
// a zero row — a muscle with no logged work is absent, not untrained-at-zero (D-10).
export function muscleVolumeCells(sessions: MuscleVolumeSessionInput[]): MuscleVolumeCell[] {
  const cells = new Map<string, MuscleVolumeCell>();

  for (const session of sessions) {
    for (const exercise of session.exercises) {
      // An exercise with no muscle mappings at all produces no cells rather than a cell under a
      // synthetic id.
      if (exercise.muscleMappings.length === 0) continue;

      const qualifyingSets = exercise.sets.filter(isQualifyingSet);
      if (qualifyingSets.length === 0) continue;

      for (const mapping of exercise.muscleMappings) {
        const key = `${mapping.muscleGroupId}:${session.localDate}`;
        const cell = cells.get(key) ?? {
          muscleGroupId: mapping.muscleGroupId,
          localDate: session.localDate,
          weightedVolumeKg: 0,
          weightedSets: 0,
          setCount: 0,
        };

        for (const set of qualifyingSets) {
          // A null weightKg (a bodyweight muscle) contributes zero to weighted volume but still
          // increments the cell's set count and weighted set total — the muscle was trained, not
          // untrained.
          cell.weightedVolumeKg += (set.weightKg ?? 0) * set.reps * mapping.weightFactor;
          cell.weightedSets += mapping.weightFactor;
          cell.setCount += 1;
        }

        cells.set(key, cell);
      }
    }
  }

  return [...cells.values()].sort(compareCells);
}
