// Pure, Nest-free field-presence filter, in the shape of conflict-policy.ts. A PATCH must write
// only the columns it actually named; a PUT keeps today's full-column replace (D-03 / Decision 2
// shape).

import type { SyncCrudOp } from '@fitness/api-contracts';

export interface WorkoutSessionValues {
  id: string;
  userId: string;
  routineDayId: string | null;
  cycleId: string | null;
  equipmentProfileId: string | null;
  unavailableEquipment: unknown;
  startedAt: Date;
  endedAt: Date | null;
  status: string;
  deviceId: string | null;
  timezone: string;
  localDate: string;
  notes: string | null;
  name: string | null;
  pausedAt: Date | null;
  accumulatedPausedSeconds: number;
  restTargetAt: Date | null;
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
  targetRir: number | null;
  targetRestSeconds: number | null;
  notes: string | null;
  removedAt: Date | null;
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
  notes: string | null;
}

export interface ExerciseValues {
  id: string;
  userId: string | null;
  name: string;
  aliases: string[] | null;
  movementPattern: string | null;
  equipmentRequired: string | null;
  loadType: string;
  unilateral: boolean;
  instructionsText: string | null;
  cueText: string | null;
  imageUrls: string[] | null;
  isCustom: boolean;
  variationOfId: string | null;
  source: string;
  bodyweightContributionPct: string | null;
  archivedAt: Date | null;
}

export interface UserExercisePreferenceValues {
  id: string;
  userId: string;
  exerciseId: string;
  archivedAt: Date | null;
  neverSuggest: boolean;
  updatedAt: Date;
}

export interface RoutineValues {
  id: string;
  userId: string;
  name: string;
  goal: string | null;
  status: string;
  progressionFrozen: boolean;
  source: string;
  createdFromTemplateId: string | null;
  archivedAt: Date | null;
}

export interface UserPreferenceValues {
  id: string;
  userId: string;
  weightUnit: string;
  defaultEquipmentProfileId: string | null;
  activeRoutineId: string | null;
  autoAdvanceEnabled: boolean;
  warmupSetsEnabled: boolean;
}

// value is typed string, not number, for the same reason weightKg is: Drizzle surfaces numeric
// as a string, and a value that never becomes a binary float cannot accumulate conversion error
// across a lifetime of aggregation (D-04).
export interface PersonalRecordValues {
  id: string;
  userId: string;
  exerciseId: string;
  prType: string;
  value: string;
  loggedSetId: string | null;
  achievedAt: Date;
  reconciledAt: Date | null;
}

export interface RoutineDayValues {
  id: string;
  routineId: string;
  orderIndex: number;
  name: string;
  isRestDay: boolean;
  archivedAt: Date | null;
}

export interface RoutineExerciseValues {
  id: string;
  routineDayId: string;
  exerciseId: string;
  orderIndex: number;
  supersetGroupId: string | null;
  targetSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRir: number | null;
  targetRestSeconds: number | null;
  progressionSchemeId: string | null;
  notes: string | null;
}

export interface RoutineCycleValues {
  id: string;
  routineId: string;
  orderIndex: number;
  name: string;
  kind: string;
  durationDays: number | null;
}

export interface RoutineExerciseCycleTargetValues {
  id: string;
  routineExerciseId: string;
  cycleId: string;
  targetSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRir: number | null;
  targetRestSeconds: number | null;
}

export interface EquipmentProfileValues {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  barbellWeightKg: string | null;
  availablePlates: unknown;
  dumbbellIncrementsKg: unknown;
  machineAvailability: unknown;
  nativeUnit: string;
  archivedAt: Date | null;
}

// A mapped type over keyof V, so every property of V is a required key here — adding a column to
// a values interface without classifying it in the matching map is a compile error, not a
// silently-always-written column. That compile error is the exhaustiveness gate this module
// exists to provide; it is the exact way this defect was introduced (the prior weight-only guard
// covered exactly one column and nothing stopped the other eight logged_set columns, or either of
// the other two tables, from going unclassified).
//
// READ THE MAPPING DIRECTION BEFORE ADDING A COLUMN. A wire name means "write this column only
// when the PATCH names it". `null` means the OPPOSITE of "never written": it means the column is
// server-derived and is written UNCONDITIONALLY on every PATCH, from whatever the to*Values
// builder produced. So `null` is safe only where that builder ignores the client — an
// authenticated-session userId, a forced constant, or a database-first resolver. A `null` mapping
// on a column whose builder reads op.data is a hole, not a guard: it hands the client an
// always-applied write on a column the map appears to protect (that is precisely how a PATCH was
// able to re-target user_exercise_preference.exercise_id).
export type PatchFieldMap<V> = { [K in keyof V]: string | null };

export const WORKOUT_SESSION_PATCH_FIELDS: PatchFieldMap<WorkoutSessionValues> = {
  id: null,
  userId: null,
  routineDayId: 'routine_day_id',
  cycleId: 'cycle_id',
  equipmentProfileId: 'equipment_profile_id',
  unavailableEquipment: 'unavailable_equipment',
  startedAt: 'started_at',
  endedAt: 'ended_at',
  status: 'status',
  deviceId: 'device_id',
  timezone: 'timezone',
  localDate: 'local_date',
  notes: 'notes',
  name: 'name',
  pausedAt: 'paused_at',
  accumulatedPausedSeconds: 'accumulated_paused_seconds',
  restTargetAt: 'rest_target_at',
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
  targetRir: 'target_rir',
  targetRestSeconds: 'target_rest_seconds',
  notes: 'notes',
  removedAt: 'removed_at',
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
  notes: 'notes',
};

// id/userId/isCustom/source are set once at insert and never client-patchable — ownership,
// custom-vs-seeded classification and provenance do not change after creation. archivedAt is
// never client-patchable on this table at all: archive state lives exclusively in
// user_exercise_preference (Pattern 3), and accepting archived_at here would reopen the
// two-code-path picker problem the schema was shaped to avoid. What enforces that is
// sync.service.ts's hasInvalidField, which rejects any op naming archived_at outright, plus
// toExerciseValues forcing the column to null — the map's null does not withhold the write, it
// applies the forced value every time.
export const EXERCISE_PATCH_FIELDS: PatchFieldMap<ExerciseValues> = {
  id: null,
  userId: null,
  name: 'name',
  aliases: 'aliases',
  movementPattern: 'movement_pattern',
  equipmentRequired: 'equipment_required',
  loadType: 'load_type',
  unilateral: 'unilateral',
  instructionsText: 'instructions_text',
  cueText: 'cue_text',
  imageUrls: 'image_urls',
  isCustom: null,
  variationOfId: 'variation_of_id',
  source: null,
  bodyweightContributionPct: 'bodyweight_contribution_pct',
  archivedAt: null,
};

// id/userId/exerciseId are all server-derived, so all three are written unconditionally: id from
// the op id, userId from the authenticated session, and exerciseId from
// dbExerciseIdByUserExercisePreferenceId (sync.service.ts) — the stored linkage, never the value
// the op claims. The identity guarantee ("a preference row never moves onto another movement")
// therefore lives in that resolver; a null here alone would have written the client's value.
export const USER_EXERCISE_PREFERENCE_PATCH_FIELDS: PatchFieldMap<UserExercisePreferenceValues> = {
  id: null,
  userId: null,
  exerciseId: null,
  archivedAt: 'archived_at',
  neverSuggest: 'never_suggest',
  updatedAt: 'updated_at',
};

// id/userId are fixed at insert — a routine's identity and ownership never move once created.
// archivedAt IS client-patchable here, unlike exercise: archiving a routine is a user action that
// must sync (D-05), whereas exercise's archive state lives in user_exercise_preference instead.
export const ROUTINE_PATCH_FIELDS: PatchFieldMap<RoutineValues> = {
  id: null,
  userId: null,
  name: 'name',
  goal: 'goal',
  status: 'status',
  progressionFrozen: 'progression_frozen',
  source: 'source',
  createdFromTemplateId: 'created_from_template_id',
  archivedAt: 'archived_at',
};

// id/userId are fixed at insert — a user_preference row's id and owner never move once created
// (id === userId, the option-a wire contract). weightUnit/defaultEquipmentProfileId/
// activeRoutineId are each independently patchable — activating a routine (PATCH naming only
// active_routine_id) must never touch weight_unit, and vice versa.
export const USER_PREFERENCE_PATCH_FIELDS: PatchFieldMap<UserPreferenceValues> = {
  id: null,
  userId: null,
  weightUnit: 'weight_unit',
  defaultEquipmentProfileId: 'default_equipment_profile_id',
  activeRoutineId: 'active_routine_id',
  autoAdvanceEnabled: 'auto_advance_enabled',
  warmupSetsEnabled: 'warmup_sets_enabled',
};

// id/userId are server-derived and written unconditionally, mirroring toUserExercisePreferenceValues'
// ownership guarantee (T-05-03-01): userId always comes from the authenticated session, never from
// data.user_id. Every other field is genuinely client-owned and maps to its own wire key.
export const PERSONAL_RECORD_PATCH_FIELDS: PatchFieldMap<PersonalRecordValues> = {
  id: null,
  userId: null,
  exerciseId: 'exercise_id',
  prType: 'pr_type',
  value: 'value',
  loggedSetId: 'logged_set_id',
  achievedAt: 'achieved_at',
  reconciledAt: 'reconciled_at',
};

// id/routineId are written unconditionally because both are server-derived: routineId comes from
// resolveRoutineIdForRoutineDay, which returns the stored linkage in preference to the op's claim.
// That resolver, not this map, is the anti-reparenting guarantee (T-04-09) — the null here only
// says "take the resolved value every time", which is safe exactly because the resolver is
// database-first.
export const ROUTINE_DAY_PATCH_FIELDS: PatchFieldMap<RoutineDayValues> = {
  id: null,
  routineId: null,
  orderIndex: 'order_index',
  name: 'name',
  isRestDay: 'is_rest_day',
  archivedAt: 'archived_at',
};

// id/routineDayId are server-derived and written unconditionally — same shape as
// ROUTINE_DAY_PATCH_FIELDS, one level deeper, with resolveRoutineDayIdForRoutineExercise supplying
// the database-first value the anti-reparenting guarantee actually rests on (T-04-09).
// progressionSchemeId is carried through as a plain nullable
// passthrough: nothing in this phase reads it (D-11), it stays an unowned column here.
export const ROUTINE_EXERCISE_PATCH_FIELDS: PatchFieldMap<RoutineExerciseValues> = {
  id: null,
  routineDayId: null,
  exerciseId: 'exercise_id',
  orderIndex: 'order_index',
  supersetGroupId: 'superset_group_id',
  targetSets: 'target_sets',
  targetRepMin: 'target_rep_min',
  targetRepMax: 'target_rep_max',
  targetRir: 'target_rir',
  targetRestSeconds: 'target_rest_seconds',
  progressionSchemeId: 'progression_scheme_id',
  notes: 'notes',
};

// id/routineId are server-derived and written unconditionally — same shape as
// ROUTINE_DAY_PATCH_FIELDS (T-04-09/T-04-31), with resolveRoutineIdForRoutineCycle supplying the
// database-first value the anti-reparenting guarantee rests on.
export const ROUTINE_CYCLE_PATCH_FIELDS: PatchFieldMap<RoutineCycleValues> = {
  id: null,
  routineId: null,
  orderIndex: 'order_index',
  name: 'name',
  kind: 'kind',
  durationDays: 'duration_days',
};

// id/routineExerciseId/cycleId are server-derived and written unconditionally. Both parents are
// identity here, and neither may be reparented — the guarantee is sync.service.ts's dual-chain
// resolver precedence (database linkage wins over client-claimed for both parents independently),
// which is what makes writing them on every PATCH safe.
export const ROUTINE_EXERCISE_CYCLE_TARGET_PATCH_FIELDS: PatchFieldMap<RoutineExerciseCycleTargetValues> = {
  id: null,
  routineExerciseId: null,
  cycleId: null,
  targetSets: 'target_sets',
  targetRepMin: 'target_rep_min',
  targetRepMax: 'target_rep_max',
  targetRir: 'target_rir',
  targetRestSeconds: 'target_rest_seconds',
};

// id/userId are server-derived and written unconditionally, mirroring PERSONAL_RECORD_PATCH_FIELDS'
// ownership guarantee (T-06-01): userId always comes from the authenticated session, never from
// data.user_id. Every other field — including the three JSONB columns — is genuinely client-owned
// and maps to its own wire key; the JSONB columns carry pre-validated (hasInvalidField) JS values
// straight through, same as any other column here.
export const EQUIPMENT_PROFILE_PATCH_FIELDS: PatchFieldMap<EquipmentProfileValues> = {
  id: null,
  userId: null,
  name: 'name',
  isDefault: 'is_default',
  barbellWeightKg: 'barbell_weight_kg',
  availablePlates: 'available_plates',
  dumbbellIncrementsKg: 'dumbbell_increments_kg',
  machineAvailability: 'machine_availability',
  nativeUnit: 'native_unit',
  archivedAt: 'archived_at',
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
    // wireKey === null includes the column ALWAYS. See PatchFieldMap's contract above before
    // reading this as an exclusion.
    if (wireKey === null || wireKey in data) {
      set[key] = values[key];
    }
  }
  return set;
}
