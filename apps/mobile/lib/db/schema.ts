import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Mirrors apps/api/src/db/schema/*.ts. Column names stay snake_case and identical to the Postgres
// tables so the two stay structurally comparable (schema-parity's client-side analog). server_seq
// is present locally as a nullable integer where the server owns it — the client only reads it.
// weight_kg is text, not real — SQLite has no decimal type, and storing the decimal as its exact
// string is what keeps the client half of D-04 true; a real column would reintroduce the binary
// float the Postgres side was chosen to avoid.
export const workoutSession = sqliteTable('workout_session', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  routineDayId: text('routine_day_id'),
  equipmentProfileId: text('equipment_profile_id'),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  status: text('status').notNull(),
  deviceId: text('device_id'),
  timezone: text('timezone').notNull(),
  localDate: text('local_date').notNull(),
  serverSeq: integer('server_seq'),
});

export const sessionExercise = sqliteTable('session_exercise', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  orderIndex: integer('order_index').notNull(),
  supersetGroupId: text('superset_group_id'),
  routineExerciseId: text('routine_exercise_id'),
  targetSets: integer('target_sets'),
  targetRepMin: integer('target_rep_min'),
  targetRepMax: integer('target_rep_max'),
  targetRirMin: integer('target_rir_min'),
  targetRirMax: integer('target_rir_max'),
  targetRestSeconds: integer('target_rest_seconds'),
});

export const loggedSet = sqliteTable('logged_set', {
  id: text('id').primaryKey(),
  sessionExerciseId: text('session_exercise_id').notNull(),
  setIndex: integer('set_index').notNull(),
  setType: text('set_type').notNull(),
  weightKg: text('weight_kg').notNull(),
  reps: integer('reps').notNull(),
  rir: integer('rir'),
  side: text('side'),
  completed: integer('completed', { mode: 'boolean' }).notNull(),
  parentSetId: text('parent_set_id'),
  restTakenSeconds: integer('rest_taken_seconds'),
  loggedAt: text('logged_at').notNull(),
});

export const routine = sqliteTable('routine', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  name: text('name').notNull(),
  goal: text('goal'),
  status: text('status').notNull(),
  source: text('source').notNull(),
  createdFromTemplateId: text('created_from_template_id'),
  archivedAt: text('archived_at'),
  serverSeq: integer('server_seq'),
});

export const routineDay = sqliteTable('routine_day', {
  id: text('id').primaryKey(),
  routineId: text('routine_id').notNull(),
  orderIndex: integer('order_index').notNull(),
  name: text('name').notNull(),
  isRestDay: integer('is_rest_day', { mode: 'boolean' }).notNull(),
});

export const routineExercise = sqliteTable('routine_exercise', {
  id: text('id').primaryKey(),
  routineDayId: text('routine_day_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  orderIndex: integer('order_index').notNull(),
  supersetGroupId: text('superset_group_id'),
  targetSets: integer('target_sets'),
  targetRepMin: integer('target_rep_min'),
  targetRepMax: integer('target_rep_max'),
  targetRirMin: integer('target_rir_min'),
  targetRirMax: integer('target_rir_max'),
  targetRestSeconds: integer('target_rest_seconds'),
  progressionSchemeId: text('progression_scheme_id'),
  notes: text('notes'),
});

export const equipmentProfile = sqliteTable('equipment_profile', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  name: text('name').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull(),
  barbellWeightKg: text('barbell_weight_kg'),
  availablePlates: text('available_plates'),
  dumbbellIncrementsKg: text('dumbbell_increments_kg'),
  machineAvailability: text('machine_availability'),
  nativeUnit: text('native_unit').notNull(),
  archivedAt: text('archived_at'),
  serverSeq: integer('server_seq'),
});

export const exercise = sqliteTable('exercise', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  name: text('name').notNull(),
  aliases: text('aliases'),
  movementPattern: text('movement_pattern'),
  equipmentRequired: text('equipment_required'),
  loadType: text('load_type').notNull(),
  unilateral: integer('unilateral', { mode: 'boolean' }).notNull(),
  instructionsText: text('instructions_text'),
  cueText: text('cue_text'),
  imageUrls: text('image_urls'),
  isCustom: integer('is_custom', { mode: 'boolean' }).notNull(),
  variationOfId: text('variation_of_id'),
  source: text('source').notNull(),
  archivedAt: text('archived_at'),
  serverSeq: integer('server_seq'),
});

export const personalRecord = sqliteTable('personal_record', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  exerciseId: text('exercise_id').notNull(),
  prType: text('pr_type').notNull(),
  value: text('value').notNull(),
  loggedSetId: text('logged_set_id'),
  achievedAt: text('achieved_at').notNull(),
  reconciledAt: text('reconciled_at'),
  serverSeq: integer('server_seq'),
});

export const bodyMetric = sqliteTable('body_metric', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  kind: text('kind').notNull(),
  value: text('value').notNull(),
  recordedAt: text('recorded_at').notNull(),
  timezone: text('timezone').notNull(),
  localDate: text('local_date').notNull(),
  serverSeq: integer('server_seq'),
});

export const progressPhoto = sqliteTable('progress_photo', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  takenAt: text('taken_at').notNull(),
  timezone: text('timezone').notNull(),
  localDate: text('local_date').notNull(),
  storageKey: text('storage_key').notNull(),
  note: text('note'),
  serverSeq: integer('server_seq'),
});

export const userPreference = sqliteTable('user_preference', {
  userId: text('user_id').primaryKey(),
  weightUnit: text('weight_unit').notNull(),
  defaultEquipmentProfileId: text('default_equipment_profile_id'),
  serverSeq: integer('server_seq'),
});

export const drizzleSchema = {
  workoutSession,
  sessionExercise,
  loggedSet,
  routine,
  routineDay,
  routineExercise,
  equipmentProfile,
  exercise,
  personalRecord,
  bodyMetric,
  progressPhoto,
  userPreference,
};
