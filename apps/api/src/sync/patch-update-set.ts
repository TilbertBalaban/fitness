// Pure, Nest-free field-presence filter, in the shape of conflict-policy.ts. A PATCH must write
// only the columns it actually named; a PUT keeps today's full-column replace (D-03 / Decision 2
// shape).

import type { SyncCrudOp } from '@fitness/api-contracts';

export interface WorkoutSessionValues {
  id: string;
  userId: string;
  routineDayId: string | null;
  equipmentProfileId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  status: string;
  deviceId: string | null;
  timezone: string;
  localDate: string;
}

export interface SessionExerciseValues {
  id: string;
  sessionId: string;
  exerciseId: string;
  orderIndex: number;
  supersetGroupId: string | null;
  routineExerciseId: string | null;
  targetSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRirMin: number | null;
  targetRirMax: number | null;
  targetRestSeconds: number | null;
}

export interface LoggedSetValues {
  id: string;
  sessionExerciseId: string;
  setIndex: number;
  setType: string;
  weightKg: string | null;
  reps: number;
  rir: number | null;
  side: string | null;
  completed: boolean;
  parentSetId: string | null;
  restTakenSeconds: number | null;
  loggedAt: Date;
}

// A mapped type over keyof V, so every property of V is a required key here — adding a column to
// a values interface without classifying it in the matching map is a compile error, not a
// silently-always-written column. That compile error is the exhaustiveness gate this module
// exists to provide; it is the exact way this defect was introduced (the prior weight-only guard
// covered exactly one column and nothing stopped the other eight logged_set columns, or either of
// the other two tables, from going unclassified).
export type PatchFieldMap<V> = { [K in keyof V]: string | null };

export const WORKOUT_SESSION_PATCH_FIELDS: PatchFieldMap<WorkoutSessionValues> = {
  id: null,
  userId: null,
  routineDayId: 'routine_day_id',
  equipmentProfileId: 'equipment_profile_id',
  startedAt: 'started_at',
  endedAt: 'ended_at',
  status: 'status',
  deviceId: 'device_id',
  timezone: 'timezone',
  localDate: 'local_date',
};

export const SESSION_EXERCISE_PATCH_FIELDS: PatchFieldMap<SessionExerciseValues> = {
  id: null,
  sessionId: null,
  exerciseId: 'exercise_id',
  orderIndex: 'order_index',
  supersetGroupId: 'superset_group_id',
  routineExerciseId: 'routine_exercise_id',
  targetSets: 'target_sets',
  targetRepMin: 'target_rep_min',
  targetRepMax: 'target_rep_max',
  targetRirMin: 'target_rir_min',
  targetRirMax: 'target_rir_max',
  targetRestSeconds: 'target_rest_seconds',
};

export const LOGGED_SET_PATCH_FIELDS: PatchFieldMap<LoggedSetValues> = {
  id: null,
  sessionExerciseId: null,
  setIndex: 'set_index',
  setType: 'set_type',
  weightKg: 'weight_kg',
  reps: 'reps',
  rir: 'rir',
  side: 'side',
  completed: 'completed',
  parentSetId: 'parent_set_id',
  restTakenSeconds: 'rest_taken_seconds',
  loggedAt: 'logged_at',
};

// The values object is keyed by Drizzle property names (camelCase); op.data is keyed by wire
// names (snake_case — packages/api-contracts/src/sync.ts's SyncCrudOp). A presence check that
// compared a column key directly against op.data would match nothing on every column, drop the
// entire update set, and turn every PATCH into a silent no-op — passing any test that only asserts
// "the untouched fields survived" while quietly discarding the user's edit. Checked on raw key
// presence in op.data, never on the mapped value, so an explicit null or zero stays distinguishable
// from an absent key (carried forward from the weight-only guard this generalizes).
export function patchAwareSet<V extends object>(
  op: SyncCrudOp,
  values: V,
  fields: PatchFieldMap<V>,
): Partial<V> {
  if (op.op !== 'PATCH') return values;
  const data = (op.data ?? {}) as Record<string, unknown>;
  const set: Partial<V> = {};
  for (const key of Object.keys(values) as (keyof V)[]) {
    const wireKey = fields[key];
    if (wireKey === null || wireKey in data) {
      set[key] = values[key];
    }
  }
  return set;
}
