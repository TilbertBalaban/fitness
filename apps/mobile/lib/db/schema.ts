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
  cycleId: text('cycle_id'),
  equipmentProfileId: text('equipment_profile_id'),
  unavailableEquipment: text('unavailable_equipment'),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  status: text('status').notNull(),
  deviceId: text('device_id'),
  timezone: text('timezone').notNull(),
  localDate: text('local_date').notNull(),
  notes: text('notes'),
  name: text('name'),
  pausedAt: text('paused_at'),
  accumulatedPausedSeconds: integer('accumulated_paused_seconds').notNull().default(0),
  restTargetAt: text('rest_target_at'),
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
  targetRir: integer('target_rir'),
  targetRestSeconds: integer('target_rest_seconds'),
  notes: text('notes'),
  removedAt: text('removed_at'),
});

export const loggedSet = sqliteTable('logged_set', {
  id: text('id').primaryKey(),
  sessionExerciseId: text('session_exercise_id').notNull(),
  setIndex: integer('set_index').notNull(),
  setType: text('set_type').notNull(),
  // Nullable, not notNull: a bodyweight exercise carries no external load, and toCanonicalKg
  // passes a null weight straight through rather than coercing it to zero (D-04, PLAT-08).
  weightKg: text('weight_kg'),
  reps: integer('reps').notNull(),
  rir: integer('rir'),
  side: text('side'),
  completed: integer('completed', { mode: 'boolean' }).notNull(),
  parentSetId: text('parent_set_id'),
  restTakenSeconds: integer('rest_taken_seconds'),
  loggedAt: text('logged_at').notNull(),
  notes: text('notes'),
});

export const routine = sqliteTable('routine', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  name: text('name').notNull(),
  goal: text('goal'),
  status: text('status').notNull(),
  progressionFrozen: integer('progression_frozen', { mode: 'boolean' }).notNull(),
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
  archivedAt: text('archived_at'),
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
  targetRir: integer('target_rir'),
  targetRestSeconds: integer('target_rest_seconds'),
  progressionSchemeId: text('progression_scheme_id'),
  notes: text('notes'),
});

export const routineCycle = sqliteTable('routine_cycle', {
  id: text('id').primaryKey(),
  routineId: text('routine_id').notNull(),
  orderIndex: integer('order_index').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  durationDays: integer('duration_days'),
});

// A sparse per-cycle override — mirrors apps/api/src/db/schema/program.ts's routineExerciseCycleTarget
// exactly. Two parent columns, neither of them user_id: this table hangs off routineExercise AND
// routineCycle at once, resolved through resolveTarget (packages/api-contracts/src/program.ts).
export const routineExerciseCycleTarget = sqliteTable('routine_exercise_cycle_target', {
  id: text('id').primaryKey(),
  routineExerciseId: text('routine_exercise_id').notNull(),
  cycleId: text('cycle_id').notNull(),
  targetSets: integer('target_sets'),
  targetRepMin: integer('target_rep_min'),
  targetRepMax: integer('target_rep_max'),
  targetRir: integer('target_rir'),
  targetRestSeconds: integer('target_rest_seconds'),
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
  bodyweightContributionPct: text('bodyweight_contribution_pct'),
  isCustom: integer('is_custom', { mode: 'boolean' }).notNull(),
  variationOfId: text('variation_of_id'),
  source: text('source').notNull(),
  archivedAt: text('archived_at'),
  serverSeq: integer('server_seq'),
});

// Global seeded taxonomy, delivered by the bundled first-install snapshot (D-01/D-06), not by
// sync — registered as localOnly in apps/mobile/lib/db/powersync.ts so it generates zero
// ps_crud entries.
export const muscleGroup = sqliteTable('muscle_group', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  bodyRegion: text('body_region').notNull(),
});

// Seeded catalog rows only (is_custom=false, user_id=null equivalent) — split out of `exercise`
// to close WINDOWS #32: PowerSync installs CRUD triggers per table, not per row, so writing
// seeded rows into the ordinary synced `exercise` table generated a real ps_crud entry per row
// regardless of user_id being null. Registered as localOnly in powersync.ts/powersync.web.ts, so
// loadCatalogSnapshot's writes here never reach the sync protocol. Custom (user-authored)
// exercises stay in `exercise` and sync normally; readers union both tables (see
// apps/mobile/app/exercises/index.tsx, [id].tsx).
export const seededExercise = sqliteTable('seeded_exercise', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  aliases: text('aliases'),
  movementPattern: text('movement_pattern'),
  equipmentRequired: text('equipment_required'),
  loadType: text('load_type').notNull(),
  unilateral: integer('unilateral', { mode: 'boolean' }).notNull(),
  instructionsText: text('instructions_text'),
  cueText: text('cue_text'),
  imageUrls: text('image_urls'),
  bodyweightContributionPct: text('bodyweight_contribution_pct'),
  variationOfId: text('variation_of_id'),
  source: text('source').notNull(),
  // Added for 03-05's refresh path (Rule 2 — missing critical functionality): a hard delete on a
  // seeded row this device once used in a logged session would leave session_exercise.exercise_id
  // dangling with no reference-check backstop, the exact PITFALLS.md §11 failure mode the server
  // side's archive-not-delete design already guards against. A catalog refresh stamps archivedAt on
  // a row that vanishes from a newer artifact instead of deleting it; never present in the bundled
  // first-install snapshot's insert path, only set later by refresh-catalog.ts.
  archivedAt: text('archived_at'),
});

// Per-user archive/never-suggest state on any exercise (seeded or custom) — mirrors
// apps/api/src/db/schema/catalog.ts's userExercisePreference exactly. A normal synced table
// (not localOnly): every user's own preference row is real per-user state that must survive
// across devices, unlike the shared seeded catalog content above.
export const userExercisePreference = sqliteTable('user_exercise_preference', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  archivedAt: text('archived_at'),
  neverSuggest: integer('never_suggest', { mode: 'boolean' }).notNull(),
  updatedAt: text('updated_at').notNull(),
  serverSeq: integer('server_seq'),
});

// Composite-PK on Postgres; PowerSync requires a single TEXT PRIMARY KEY on every managed table,
// so id is derived deterministically as `${exercise_id}:${muscle_group_id}` at load time — that
// determinism is what makes loadCatalogSnapshot's upsert idempotent across re-runs.
export const exerciseMuscleMapping = sqliteTable('exercise_muscle_mapping', {
  id: text('id').primaryKey(),
  exerciseId: text('exercise_id').notNull(),
  muscleGroupId: text('muscle_group_id').notNull(),
  role: text('role').notNull(),
  weightFactor: text('weight_factor').notNull(),
});

// Singleton row (id is always the literal 'singleton') tracking which catalog_version has been
// applied locally — loadCatalogSnapshot compares against this to skip a no-op reload.
export const catalogMeta = sqliteTable('catalog_meta', {
  id: text('id').primaryKey(),
  catalogVersion: text('catalog_version').notNull(),
  appliedAt: text('applied_at').notNull(),
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

// id is the primary key (not userId) and is deterministically equal to user_id — mirrors
// apps/api/src/db/schema/preference.ts's option-a wire contract; applyBatch/PowerSync both key
// every managed table on a single TEXT id column.
export const userPreference = sqliteTable('user_preference', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  weightUnit: text('weight_unit').notNull(),
  defaultEquipmentProfileId: text('default_equipment_profile_id'),
  activeRoutineId: text('active_routine_id'),
  autoAdvanceEnabled: integer('auto_advance_enabled', { mode: 'boolean' }).notNull().default(true),
  warmupSetsEnabled: integer('warmup_sets_enabled', { mode: 'boolean' }).notNull().default(true),
  serverSeq: integer('server_seq'),
});

export const drizzleSchema = {
  workoutSession,
  sessionExercise,
  loggedSet,
  routine,
  routineDay,
  routineExercise,
  routineCycle,
  routineExerciseCycleTarget,
  equipmentProfile,
  exercise,
  userExercisePreference,
  personalRecord,
  bodyMetric,
  progressPhoto,
  userPreference,
  muscleGroup,
  seededExercise,
  exerciseMuscleMapping,
  catalogMeta,
};
