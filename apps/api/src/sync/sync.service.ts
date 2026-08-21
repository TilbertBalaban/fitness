import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  SYNCED_TABLES,
  LOAD_TYPES as LOAD_TYPE_TUPLE,
  EQUIPMENT_TYPES as EQUIPMENT_TYPE_TUPLE,
  MOVEMENT_PATTERNS as MOVEMENT_PATTERN_TUPLE,
  ROUTINE_STATUSES as ROUTINE_STATUS_TUPLE,
  WEIGHT_UNITS as WEIGHT_UNIT_TUPLE,
  CYCLE_KINDS as CYCLE_KIND_TUPLE,
  type SyncCrudOp,
  type SyncPushResponse,
  type SyncRejectionReason,
} from '@fitness/api-contracts';
import { DRIZZLE, type Database } from '../db/drizzle.module';
import {
  workoutSession,
  sessionExercise,
  loggedSet,
  exercise,
  userExercisePreference,
  routine,
  routineDay,
  routineExercise,
  routineCycle,
  userPreference,
} from '../db/schema';
import { resolveConflict } from './conflict-policy';
import { recordConflict, recordTombstone, isTombstoned } from './conflict-log';
import {
  EXERCISE_PATCH_FIELDS,
  LOGGED_SET_PATCH_FIELDS,
  patchAwareSet,
  ROUTINE_CYCLE_PATCH_FIELDS,
  ROUTINE_DAY_PATCH_FIELDS,
  ROUTINE_EXERCISE_PATCH_FIELDS,
  ROUTINE_PATCH_FIELDS,
  SESSION_EXERCISE_PATCH_FIELDS,
  USER_EXERCISE_PREFERENCE_PATCH_FIELDS,
  USER_PREFERENCE_PATCH_FIELDS,
  WORKOUT_SESSION_PATCH_FIELDS,
  type ExerciseValues,
  type LoggedSetValues,
  type RoutineCycleValues,
  type RoutineDayValues,
  type RoutineExerciseValues,
  type RoutineValues,
  type SessionExerciseValues,
  type UserExercisePreferenceValues,
  type UserPreferenceValues,
  type WorkoutSessionValues,
} from './patch-update-set';

const TABLE_MAP = {
  workout_session: workoutSession,
  session_exercise: sessionExercise,
  logged_set: loggedSet,
  exercise: exercise,
  user_exercise_preference: userExercisePreference,
  routine: routine,
  routine_day: routineDay,
  routine_exercise: routineExercise,
  user_preference: userPreference,
  routine_cycle: routineCycle,
} as const;

type MappedTable = keyof typeof TABLE_MAP;

function isMappedTable(type: string): type is MappedTable {
  return type in TABLE_MAP;
}

// exercise/routine carry archived_at and are never hard-deleted — archiving one must leave its
// past logged sets intact and correctly attributed. Checked ahead of isMappedTable so this fires
// even for tables SYNCED_TABLES recognizes but TABLE_MAP does not (T-02-05). Deliberately does
// NOT include user_exercise_preference — clearing a preference by deleting its row is legitimate,
// unlike exercise/routine which carry logged history other tables reference by id.
const HARD_DELETE_FORBIDDEN = new Set(['exercise', 'routine']);

// exercise, user_exercise_preference and user_preference are singleton aggregate roots: each is
// exactly one op with no synced children (session_exercise.exercise_id is a foreign-key reference
// for reads, never a sync-parent relationship; user_preference.active_routine_id is a cross-table
// pointer checked separately below, never a sync-parent relationship either). Every branch below
// keys off this set rather than repeating three string comparisons (RESEARCH.md Pattern 2).
const SINGLETON_ROOT_TYPES = new Set<string>(['exercise', 'user_exercise_preference', 'user_preference']);

// An aggregate root owns synced children and is looked up in its own table; a singleton root
// (SINGLETON_ROOT_TYPES) owns none; everything else chains to a root through rootFamilyOf.
// workout_session and routine are the two aggregate-root families today — routine_day and
// routine_exercise (04-02) will chain to 'routine' the same way session_exercise/logged_set chain
// to 'workout_session'. Every later table this phase adds keys off AGGREGATE_ROOT_TYPES /
// ROOT_TABLE_BY_TYPE / rootFamilyOf rather than adding another hardcoded type comparison.
const AGGREGATE_ROOT_TYPES = new Set<string>(['workout_session', 'routine']);

// Every self-rooting type's own table, keyed by its op.type string — the single place root
// resolution, ownership lookup and capturedRootSeq all read from to find "the table this root id
// lives in" without repeating a type comparison.
const ROOT_TABLE_BY_TYPE = {
  workout_session: workoutSession,
  routine: routine,
  exercise: exercise,
  user_exercise_preference: userExercisePreference,
  user_preference: userPreference,
} as const;
type RootTableType = keyof typeof ROOT_TABLE_BY_TYPE;

// The root type an op chains to — session_exercise/logged_set resolve through workout_session;
// routine_day/routine_exercise/routine_cycle resolve through routine, two hops deep for
// routine_exercise; every self-rooting type (aggregate or singleton) resolves to itself.
function rootFamilyOf(type: string): string {
  if (type === 'session_exercise' || type === 'logged_set') return 'workout_session';
  if (type === 'routine_day' || type === 'routine_exercise' || type === 'routine_cycle') return 'routine';
  return type;
}

// Parents apply before children within an aggregate — PowerSync's crud queue can genuinely
// deliver ops in an order the app did not intend, so this is an explicit sort, not an assumption
// (PITFALLS §4). exercise/user_exercise_preference/routine never have children to order against
// in this plan, so rank 0 is safe: aggregates are keyed by distinct root id, and a workout_session
// aggregate never shares a key with an exercise, user_exercise_preference or routine aggregate.
const AGGREGATE_RANK: Record<MappedTable, number> = {
  workout_session: 0,
  session_exercise: 1,
  logged_set: 2,
  exercise: 0,
  user_exercise_preference: 0,
  routine: 0,
  routine_day: 1,
  routine_exercise: 2,
  user_preference: 0,
  routine_cycle: 1,
};

const SESSION_STATUSES = new Set(['in_progress', 'completed', 'discarded']);
const SET_TYPES = new Set(['normal', 'warmup', 'drop', 'myorep', 'partial', 'failure', 'amrap']);
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Built from the shared @fitness/api-contracts tuples, never retyped literals, so the
// client-facing invalid_field rejection and the Postgres CHECK constraint can never drift apart.
const LOAD_TYPES = new Set<string>(LOAD_TYPE_TUPLE);
const EQUIPMENT_TYPES = new Set<string>(EQUIPMENT_TYPE_TUPLE);
const MOVEMENT_PATTERNS = new Set<string>(MOVEMENT_PATTERN_TUPLE);
const ROUTINE_STATUSES = new Set<string>(ROUTINE_STATUS_TUPLE);
const WEIGHT_UNITS = new Set<string>(WEIGHT_UNIT_TUPLE);
const CYCLE_KINDS = new Set<string>(CYCLE_KIND_TUPLE);

interface WorkoutSessionOpData {
  routine_day_id?: string | null;
  equipment_profile_id?: string | null;
  started_at?: string;
  ended_at?: string | null;
  status?: string;
  device_id?: string | null;
  timezone?: string;
  local_date?: string;
}

interface SessionExerciseOpData {
  session_id?: string;
  exercise_id?: string;
  order_index?: number;
  superset_group_id?: string | null;
  routine_exercise_id?: string | null;
  target_sets?: number | null;
  target_rep_min?: number | null;
  target_rep_max?: number | null;
  target_rir?: number | null;
  target_rest_seconds?: number | null;
}

interface LoggedSetOpData {
  session_exercise_id?: string;
  set_index?: number;
  set_type?: string;
  weight_kg?: string | number | null;
  reps?: number;
  rir?: number | null;
  side?: string | null;
  completed?: boolean;
  parent_set_id?: string | null;
  rest_taken_seconds?: number | null;
  logged_at?: string;
}

interface ExerciseOpData {
  name?: string;
  aliases?: string[] | null;
  movement_pattern?: string | null;
  equipment_required?: string | null;
  load_type?: string;
  unilateral?: boolean;
  instructions_text?: string | null;
  cue_text?: string | null;
  image_urls?: string[] | null;
  is_custom?: boolean;
  variation_of_id?: string | null;
  bodyweight_contribution_pct?: string | number | null;
  archived_at?: unknown;
}

interface UserExercisePreferenceOpData {
  exercise_id?: string;
  archived_at?: string | null;
  never_suggest?: boolean;
  updated_at?: string;
}

interface RoutineOpData {
  name?: string;
  goal?: string | null;
  status?: string;
  // Independent of status and of user_preference.active_routine_id (D-16) — a program that is
  // both active and frozen must be representable, which a single status enum could not express.
  progression_frozen?: boolean;
  source?: string;
  created_from_template_id?: string | null;
  archived_at?: string | null;
}

interface UserPreferenceOpData {
  weight_unit?: string;
  default_equipment_profile_id?: string | null;
  active_routine_id?: string | null;
  // Never read — accepted only so a present user_id key does not crash the presence check in
  // hasInvalidField/patchAwareSet. userId always comes from the session, never from data.
  user_id?: unknown;
}

interface RoutineDayOpData {
  routine_id?: string;
  order_index?: number;
  name?: string;
  is_rest_day?: boolean;
}

interface RoutineExerciseOpData {
  routine_day_id?: string;
  exercise_id?: string;
  order_index?: number;
  superset_group_id?: string | null;
  target_sets?: number | null;
  target_rep_min?: number | null;
  target_rep_max?: number | null;
  target_rir?: number | null;
  target_rest_seconds?: number | null;
  progression_scheme_id?: string | null;
  notes?: string | null;
}

interface RoutineCycleOpData {
  routine_id?: string;
  order_index?: number;
  name?: string;
  kind?: string;
  duration_days?: number | null;
}

function toWorkoutSessionValues(id: string, userId: string, data: Record<string, unknown> | null | undefined): WorkoutSessionValues {
  const d = (data ?? {}) as WorkoutSessionOpData;
  const startedAt = d.started_at ? new Date(d.started_at) : new Date();
  return {
    id,
    userId,
    routineDayId: d.routine_day_id ?? null,
    equipmentProfileId: d.equipment_profile_id ?? null,
    startedAt,
    endedAt: d.ended_at ? new Date(d.ended_at) : null,
    status: d.status ?? 'in_progress',
    deviceId: d.device_id ?? null,
    // Reaches storage only on the insert path: patchAwareSet (patch-update-set.ts) filters this
    // column out of every PATCH's update set that omits it, so an update to an existing row can no
    // longer clobber a real client-supplied timezone with this default (LOG-22).
    timezone: d.timezone ?? 'UTC',
    localDate: d.local_date ?? startedAt.toISOString().slice(0, 10),
  };
}

function toSessionExerciseValues(id: string, sessionId: string, data: Record<string, unknown> | null | undefined): SessionExerciseValues {
  const d = (data ?? {}) as SessionExerciseOpData;
  return {
    id,
    sessionId,
    exerciseId: d.exercise_id ?? '',
    orderIndex: d.order_index ?? 0,
    supersetGroupId: d.superset_group_id ?? null,
    routineExerciseId: d.routine_exercise_id ?? null,
    targetSets: d.target_sets ?? null,
    targetRepMin: d.target_rep_min ?? null,
    targetRepMax: d.target_rep_max ?? null,
    targetRir: d.target_rir ?? null,
    targetRestSeconds: d.target_rest_seconds ?? null,
  };
}

// A PUT omits `weight_kg` from `opData` entirely when the lifter recorded no external load
// (PowerSync's `CrudEntry` contract), so absent and explicit null are both "no external load" and
// both map to SQL NULL here — never the string "0", which would misrepresent a bodyweight set as
// a zero-kilogram lift (CR-02).
function normalizeWeightKg(value: string | number | null | undefined): string | null {
  return value === undefined || value === null ? null : String(value);
}

function toLoggedSetValues(id: string, sessionExerciseId: string, data: Record<string, unknown> | null | undefined): LoggedSetValues {
  const d = (data ?? {}) as LoggedSetOpData;
  return {
    id,
    sessionExerciseId,
    setIndex: d.set_index ?? 0,
    setType: d.set_type ?? 'normal',
    weightKg: normalizeWeightKg(d.weight_kg),
    reps: d.reps ?? 0,
    rir: d.rir ?? null,
    side: d.side ?? null,
    completed: d.completed ?? false,
    parentSetId: d.parent_set_id ?? null,
    restTakenSeconds: d.rest_taken_seconds ?? null,
    loggedAt: d.logged_at ? new Date(d.logged_at) : new Date(),
  };
}

// Mirrors normalizeWeightKg's rule: absent and explicit null are both null, never the string "0"
// or an empty string — a bodyweight-contribution fraction of exactly 0 must stay distinguishable
// from "not applicable to this exercise."
function normalizeBodyweightContributionPct(value: string | number | null | undefined): string | null {
  return value === undefined || value === null ? null : String(value);
}

// userId always comes from the authenticated session argument, never from data.user_id — a
// client cannot take ownership of a row it does not already own by naming a different owner in
// the payload (T-03-02 pattern, mirrored from toWorkoutSessionValues). isCustom/source/archivedAt
// are forced to the values a client-authored row always has; hasInvalidField rejects any op that
// tries to name archived_at or is_custom:false before this function ever runs.
function toExerciseValues(id: string, userId: string, data: Record<string, unknown> | null | undefined): ExerciseValues {
  const d = (data ?? {}) as ExerciseOpData;
  return {
    id,
    userId,
    name: d.name ?? '',
    aliases: d.aliases ?? null,
    movementPattern: d.movement_pattern ?? null,
    equipmentRequired: d.equipment_required ?? null,
    loadType: d.load_type ?? 'external_weight',
    unilateral: d.unilateral ?? false,
    instructionsText: d.instructions_text ?? null,
    cueText: d.cue_text ?? null,
    imageUrls: d.image_urls ?? null,
    isCustom: true,
    variationOfId: d.variation_of_id ?? null,
    source: 'user',
    bodyweightContributionPct: normalizeBodyweightContributionPct(d.bodyweight_contribution_pct),
    archivedAt: null,
  };
}

// userId always comes from the authenticated session argument, never from data — a PUT naming
// another user's user_id in its payload is stored against the pusher's own id regardless
// (T-03-02/T-03-13). exerciseId falls back to '' when absent, matching isInvalidSessionExercise's
// established empty-string-FK guard precedent: hasInvalidField rejects any op with a missing or
// empty exercise_id before this function ever runs, so the fallback is defense in depth, not the
// primary guard.
function toUserExercisePreferenceValues(
  id: string,
  userId: string,
  data: Record<string, unknown> | null | undefined,
): UserExercisePreferenceValues {
  const d = (data ?? {}) as UserExercisePreferenceOpData;
  return {
    id,
    userId,
    exerciseId: d.exercise_id ?? '',
    archivedAt: d.archived_at ? new Date(d.archived_at) : null,
    neverSuggest: d.never_suggest ?? false,
    updatedAt: d.updated_at ? new Date(d.updated_at) : new Date(),
  };
}

// userId always comes from the authenticated session argument, never from data.user_id — a
// client can only author its own routines (T-03-02 pattern, mirrored from toWorkoutSessionValues).
// source is forced to 'user' — the seed script's 'seed' rows are written by direct SQL, never
// through this path. Unlike exercise, archivedAt IS an accepted client field here — archiving a
// routine is a user action that must sync (D-05), whereas exercise's archive state lives in
// user_exercise_preference.
function toRoutineValues(id: string, userId: string, data: Record<string, unknown> | null | undefined): RoutineValues {
  const d = (data ?? {}) as RoutineOpData;
  return {
    id,
    userId,
    name: d.name ?? '',
    goal: d.goal ?? null,
    status: d.status ?? 'draft',
    progressionFrozen: d.progression_frozen ?? false,
    source: 'user',
    createdFromTemplateId: d.created_from_template_id ?? null,
    archivedAt: d.archived_at ? new Date(d.archived_at) : null,
  };
}

// userId always comes from the authenticated session argument, never from data.user_id — a
// user_preference row's id IS its owner's id (the option-a wire contract), so ownership is
// resolved before this function ever runs; this function only shapes the row, it never decides
// who owns it. weightUnit falls back to 'kg' on insert (matching the schema's own notNull
// default-less column — a PUT must always name a valid unit, but a PATCH that omits it must not
// clobber an existing row's unit, which is patchAwareSet's job, not this function's).
function toUserPreferenceValues(
  id: string,
  userId: string,
  data: Record<string, unknown> | null | undefined,
): UserPreferenceValues {
  const d = (data ?? {}) as UserPreferenceOpData;
  return {
    id,
    userId,
    weightUnit: d.weight_unit ?? 'kg',
    defaultEquipmentProfileId: d.default_equipment_profile_id ?? null,
    activeRoutineId: d.active_routine_id ?? null,
  };
}

// routineId always comes from the resolver argument, never from data — a day's parent is the
// two-hop ownership chain's whole point (T-04-09); resolveRoutineIdForRoutineDay's
// database-linkage-first precedence is what actually enforces this, and ROUTINE_DAY_PATCH_FIELDS
// backs it up by never letting a PATCH write routineId. isRestDay falls back to false: D-19 keeps
// the column present and unused this phase — do not surface it and do not remove it.
function toRoutineDayValues(id: string, routineId: string, data: Record<string, unknown> | null | undefined): RoutineDayValues {
  const d = (data ?? {}) as RoutineDayOpData;
  return {
    id,
    routineId,
    orderIndex: d.order_index ?? 0,
    name: d.name ?? '',
    isRestDay: d.is_rest_day ?? false,
  };
}

// routineDayId always comes from the resolver argument, never from data — same reparenting
// guarantee as toRoutineDayValues, one hop deeper. exerciseId falls back to '' as defence in depth
// behind isInvalidRoutineExercise's empty-string-FK guard, mirroring toSessionExerciseValues.
function toRoutineExerciseValues(
  id: string,
  routineDayId: string,
  data: Record<string, unknown> | null | undefined,
): RoutineExerciseValues {
  const d = (data ?? {}) as RoutineExerciseOpData;
  return {
    id,
    routineDayId,
    exerciseId: d.exercise_id ?? '',
    orderIndex: d.order_index ?? 0,
    supersetGroupId: d.superset_group_id ?? null,
    targetSets: d.target_sets ?? null,
    targetRepMin: d.target_rep_min ?? null,
    targetRepMax: d.target_rep_max ?? null,
    targetRir: d.target_rir ?? null,
    targetRestSeconds: d.target_rest_seconds ?? null,
    progressionSchemeId: d.progression_scheme_id ?? null,
    notes: d.notes ?? null,
  };
}

// routineId always comes from the resolver argument, never from data — same reparenting
// guarantee as toRoutineDayValues, one hop shallower than toRoutineExerciseValues (T-04-31).
// kind falls back to 'training' and name falls back to '' on insert; both are validated present
// and in-vocabulary by isInvalidRoutineCycle before this function ever runs on a PUT, so the
// fallback is defence in depth, matching toRoutineDayValues' own precedent.
function toRoutineCycleValues(id: string, routineId: string, data: Record<string, unknown> | null | undefined): RoutineCycleValues {
  const d = (data ?? {}) as RoutineCycleOpData;
  return {
    id,
    routineId,
    orderIndex: d.order_index ?? 0,
    name: d.name ?? '',
    kind: d.kind ?? 'training',
    durationDays: d.duration_days ?? null,
  };
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isNonNegativeDecimal(value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
}

// weight_kg only — an explicit null represents "no external load" and must validate, but this
// exception must never leak onto reps or set_index, which stay non-nullable integer columns.
function isNonNegativeDecimalOrNull(value: unknown): boolean {
  return value === null || isNonNegativeDecimal(value);
}

function isNonNegativeIntegerOrNull(value: unknown): boolean {
  return value === null || isNonNegativeInteger(value);
}

// session_exercise.exercise_id is a NOT NULL foreign key (apps/api/src/db/schema/session.ts) —
// unlike every other field here, absent is invalid the same as empty, because toSessionExerciseValues'
// `d.exercise_id ?? ''` fallback would otherwise insert or (via the unconditional onConflictDoUpdate
// `set`) silently clobber an existing row's FK with an empty string (CR-04). order_index and the five
// target_* fields keep the "checked only when present" pattern the other validators use; each
// target_* column is nullable, so an explicit null is a legitimate "no prescription" value.
function isInvalidSessionExercise(data: SessionExerciseOpData): boolean {
  if (typeof data.exercise_id !== 'string' || data.exercise_id.length === 0) return true;
  if (data.order_index !== undefined && !isNonNegativeInteger(data.order_index)) return true;
  if (data.target_sets !== undefined && !isNonNegativeIntegerOrNull(data.target_sets)) return true;
  if (data.target_rep_min !== undefined && !isNonNegativeIntegerOrNull(data.target_rep_min)) return true;
  if (data.target_rep_max !== undefined && !isNonNegativeIntegerOrNull(data.target_rep_max)) return true;
  if (data.target_rir !== undefined && !isNonNegativeIntegerOrNull(data.target_rir)) return true;
  if (data.target_rest_seconds !== undefined && !isNonNegativeIntegerOrNull(data.target_rest_seconds)) return true;
  return false;
}

// order_index and name are each checked only when present — a PATCH naming only order_index (the
// reorder case) must not be rejected for omitting name.
function isInvalidRoutineDay(data: RoutineDayOpData): boolean {
  if (data.name !== undefined && !(typeof data.name === 'string' && data.name.trim().length > 0)) return true;
  if (data.order_index !== undefined && !isNonNegativeInteger(data.order_index)) return true;
  return false;
}

// exercise_id absent-is-invalid mirrors isInvalidSessionExercise's precedent exactly: every
// non-DELETE op (PUT or PATCH) must name a non-empty exercise_id, because toRoutineExerciseValues'
// `d.exercise_id ?? ''` fallback would otherwise clobber the NOT NULL FK through the unconditional
// onConflictDoUpdate set. order_index and the five target_* fields are checked only when present —
// each target_* column is nullable, so an explicit null is a legitimate "no prescription" value.
// target_rep_min <= target_rep_max is deliberately NOT validated here: invalid_field is terminal
// and would silently discard a legitimate offline write, so range ordering is the builder's job
// (client-side, Task 2), and the server validates shape only.
function isInvalidRoutineExercise(data: RoutineExerciseOpData): boolean {
  if (typeof data.exercise_id !== 'string' || data.exercise_id.length === 0) return true;
  if (data.order_index !== undefined && !isNonNegativeInteger(data.order_index)) return true;
  if (data.target_sets !== undefined && !isNonNegativeIntegerOrNull(data.target_sets)) return true;
  if (data.target_rep_min !== undefined && !isNonNegativeIntegerOrNull(data.target_rep_min)) return true;
  if (data.target_rep_max !== undefined && !isNonNegativeIntegerOrNull(data.target_rep_max)) return true;
  if (data.target_rir !== undefined && !isNonNegativeIntegerOrNull(data.target_rir)) return true;
  if (data.target_rest_seconds !== undefined && !isNonNegativeIntegerOrNull(data.target_rest_seconds)) return true;
  return false;
}

// kind is checked only when present, matching the exercise/routine load_type/status precedent —
// but a PUT's toRoutineCycleValues fallback ('training') means an absent kind on insert is never
// actually a gap. name is checked the same way isInvalidRoutineDay checks its own name field.
// duration_days is deliberately NOT required when kind is 'time_off' — that completeness rule is
// the builder's job (04-08), and a terminal invalid_field rejection here would silently discard a
// legitimate offline write (T-04-30).
function isInvalidRoutineCycle(data: RoutineCycleOpData): boolean {
  if (data.kind !== undefined && !(typeof data.kind === 'string' && CYCLE_KINDS.has(data.kind))) return true;
  if (data.name !== undefined && !(typeof data.name === 'string' && data.name.trim().length > 0)) return true;
  if (data.order_index !== undefined && !isNonNegativeInteger(data.order_index)) return true;
  if (data.duration_days !== undefined && !isNonNegativeIntegerOrNull(data.duration_days)) return true;
  return false;
}

// Validated against the column each field targets before applying (T-02-05). An op failing
// validation is rejected invalid_field and never reaches the apply phase.
function hasInvalidField(op: SyncCrudOp): boolean {
  if (op.op === 'DELETE') return false;
  const data = (op.data ?? {}) as Record<string, unknown>;

  if (op.type === 'workout_session') {
    if (data.status !== undefined && !(typeof data.status === 'string' && SESSION_STATUSES.has(data.status))) {
      return true;
    }
    if (data.local_date !== undefined && !(typeof data.local_date === 'string' && LOCAL_DATE_RE.test(data.local_date))) {
      return true;
    }
    return false;
  }

  if (op.type === 'logged_set') {
    if (data.weight_kg !== undefined && !isNonNegativeDecimalOrNull(data.weight_kg)) return true;
    if (data.reps !== undefined && !isNonNegativeInteger(data.reps)) return true;
    if (data.set_index !== undefined && !isNonNegativeInteger(data.set_index)) return true;
    if (data.set_type !== undefined && !(typeof data.set_type === 'string' && SET_TYPES.has(data.set_type))) {
      return true;
    }
    return false;
  }

  if (op.type === 'session_exercise') {
    return isInvalidSessionExercise(data as SessionExerciseOpData);
  }

  if (op.type === 'exercise') {
    const d = data as ExerciseOpData;
    if (d.load_type !== undefined && !(typeof d.load_type === 'string' && LOAD_TYPES.has(d.load_type))) {
      return true;
    }
    // Archive state lives exclusively in user_exercise_preference (Pattern 3) — accepting
    // archived_at directly on exercise would reopen the two-code-path picker problem the schema
    // was shaped to avoid. Rejected on presence alone, regardless of value.
    if ('archived_at' in data) return true;
    if (
      d.equipment_required !== undefined &&
      d.equipment_required !== null &&
      !(typeof d.equipment_required === 'string' && EQUIPMENT_TYPES.has(d.equipment_required))
    ) {
      return true;
    }
    if (
      d.movement_pattern !== undefined &&
      d.movement_pattern !== null &&
      !(typeof d.movement_pattern === 'string' && MOVEMENT_PATTERNS.has(d.movement_pattern))
    ) {
      return true;
    }
    if (d.name !== undefined && !(typeof d.name === 'string' && d.name.trim().length > 0)) return true;
    // A client may only create custom rows — is_custom:false would claim seeded-catalog
    // provenance for a client-authored write, which toExerciseValues never actually stores
    // (isCustom is forced true), but rejecting the attempt up front keeps the contract honest.
    if (d.is_custom === false) return true;
    return false;
  }

  if (op.type === 'user_exercise_preference') {
    const d = data as UserExercisePreferenceOpData;
    if (typeof d.exercise_id !== 'string' || d.exercise_id.length === 0) return true;
    if (d.never_suggest !== undefined && typeof d.never_suggest !== 'boolean') return true;
    return false;
  }

  if (op.type === 'routine') {
    const d = data as RoutineOpData;
    if (d.status !== undefined && !(typeof d.status === 'string' && ROUTINE_STATUSES.has(d.status))) {
      return true;
    }
    // source is not validated here — toRoutineValues forces it, exactly as it forces isCustom
    // for exercise.
    if (d.name !== undefined && !(typeof d.name === 'string' && d.name.trim().length > 0)) return true;
    if (d.progression_frozen !== undefined && typeof d.progression_frozen !== 'boolean') return true;
    return false;
  }

  if (op.type === 'routine_day') {
    return isInvalidRoutineDay(data as RoutineDayOpData);
  }

  if (op.type === 'routine_exercise') {
    return isInvalidRoutineExercise(data as RoutineExerciseOpData);
  }

  if (op.type === 'routine_cycle') {
    return isInvalidRoutineCycle(data as RoutineCycleOpData);
  }

  if (op.type === 'user_preference') {
    const d = data as UserPreferenceOpData;
    if (d.weight_unit !== undefined && !(typeof d.weight_unit === 'string' && WEIGHT_UNITS.has(d.weight_unit))) {
      return true;
    }
    if (
      d.active_routine_id !== undefined &&
      d.active_routine_id !== null &&
      typeof d.active_routine_id !== 'string'
    ) {
      return true;
    }
    return false;
  }

  return false;
}

interface Aggregate {
  root: string | null;
  ops: SyncCrudOp[];
  poisoned: boolean;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Resolves ownership through the owning chain to workout_session.user_id for every op in an
  // aggregate — a child is never trusted because its own id was accepted (T-02-01, T-02-03).
  // Groups by aggregate (workout_session + its session_exercise + its logged_set rows) and
  // applies each aggregate inside one transaction, so a partial push never leaves a set pointing
  // at a parent that does not exist (PITFALLS §4).
  async applyBatch(userId: string, batch: SyncCrudOp[]): Promise<SyncPushResponse> {
    const applied: string[] = [];
    const rejected: { op_id: string; reason: SyncRejectionReason }[] = [];
    let highestServerSeq = 0n;

    const workable: SyncCrudOp[] = [];
    for (const op of batch) {
      if (op.op === 'DELETE' && HARD_DELETE_FORBIDDEN.has(op.type)) {
        rejected.push({ op_id: op.op_id, reason: 'invalid_field' });
        continue;
      }
      if (!(SYNCED_TABLES as readonly string[]).includes(op.type) || !isMappedTable(op.type)) {
        rejected.push({ op_id: op.op_id, reason: 'unknown_table' });
        continue;
      }
      if (hasInvalidField(op)) {
        rejected.push({ op_id: op.op_id, reason: 'invalid_field' });
        continue;
      }
      workable.push(op);
    }

    if (workable.length === 0) {
      return { applied, rejected, server_seq: highestServerSeq.toString() };
    }

    // A DELETE for a row this user has already tombstoned has no aggregate root left to resolve —
    // its own row is gone, so there is nothing in the batch or the database to chain back to a
    // session. Short-circuited here, ahead of root resolution, so a second delete of the same id
    // stays idempotent instead of failing missing_parent.
    const deleteOpsInBatch = workable.filter((op) => op.op === 'DELETE');
    const alreadyTombstonedKeys = new Set<string>();
    if (deleteOpsInBatch.length) {
      const results = await Promise.all(
        deleteOpsInBatch.map((op) => isTombstoned(this.db, op.type, op.id, userId)),
      );
      deleteOpsInBatch.forEach((op, index) => {
        if (results[index]) alreadyTombstonedKeys.add(`${op.type}:${op.id}`);
      });
    }
    let remaining: SyncCrudOp[] = [];
    for (const op of workable) {
      if (op.op === 'DELETE' && alreadyTombstonedKeys.has(`${op.type}:${op.id}`)) {
        applied.push(op.op_id);
        continue;
      }
      remaining.push(op);
    }
    if (remaining.length === 0) {
      return { applied, rejected, server_seq: highestServerSeq.toString() };
    }

    // user_preference.active_routine_id is a cross-table pointer, not a sync-parent relationship
    // (SINGLETON_ROOT_TYPES), so it is never resolved through the aggregate-root machinery below —
    // checked once here, batched as a single inArray query over every active_routine_id named in
    // this batch (never one query per op, T-04-18). A pointer to a routine the user does not own
    // is rejected before the op ever reaches the apply loop: storing it would leak that routine's
    // existence to the pusher and point the Home tab's query at a row it can never read.
    const userPreferenceOpsNamingPointer = remaining.filter(
      (op) => op.type === 'user_preference' && op.op !== 'DELETE',
    );
    const activeRoutineIdsToCheck = new Set<string>();
    for (const op of userPreferenceOpsNamingPointer) {
      const activeRoutineId = (op.data as UserPreferenceOpData | null | undefined)?.active_routine_id;
      if (typeof activeRoutineId === 'string') activeRoutineIdsToCheck.add(activeRoutineId);
    }
    if (activeRoutineIdsToCheck.size > 0) {
      const ownerRows = await this.db
        .select({ id: routine.id, userId: routine.userId })
        .from(routine)
        .where(inArray(routine.id, [...activeRoutineIdsToCheck]));
      const routineOwnerById = new Map(ownerRows.map((row) => [row.id, row.userId]));

      const filteredRemaining: SyncCrudOp[] = [];
      for (const op of remaining) {
        if (op.type === 'user_preference' && op.op !== 'DELETE') {
          const activeRoutineId = (op.data as UserPreferenceOpData | null | undefined)?.active_routine_id;
          if (typeof activeRoutineId === 'string' && routineOwnerById.get(activeRoutineId) !== userId) {
            rejected.push({ op_id: op.op_id, reason: 'not_owner' });
            continue;
          }
        }
        filteredRemaining.push(op);
      }
      remaining = filteredRemaining;
      if (remaining.length === 0) {
        return { applied, rejected, server_seq: highestServerSeq.toString() };
      }
    }

    const sessionExerciseOps = remaining.filter((op) => op.type === 'session_exercise');
    const loggedSetOps = remaining.filter((op) => op.type === 'logged_set');
    const sessionExerciseSessionIdFromData = new Map<string, string>();
    for (const op of sessionExerciseOps) {
      const sessionId = (op.data as SessionExerciseOpData | null | undefined)?.session_id;
      if (sessionId) sessionExerciseSessionIdFromData.set(op.id, sessionId);
    }
    const loggedSetSessionExerciseIdFromData = new Map<string, string>();
    for (const op of loggedSetOps) {
      const sessionExerciseId = (op.data as LoggedSetOpData | null | undefined)?.session_exercise_id;
      if (sessionExerciseId) loggedSetSessionExerciseIdFromData.set(op.id, sessionExerciseId);
    }

    // Read every existing parent this batch might touch or reference in two batched queries —
    // never a per-row lookup (an N+1 shape plan 02-07's query-count assertion will fail on).
    // logged_set is resolved first: a DELETE (and, in principle, any op omitting
    // session_exercise_id from its data) carries no client-claimed parent at all, so its root can
    // only be found through this existing row's real linkage — never through op.data.
    const loggedSetIdsToCheck = new Set(loggedSetOps.map((op) => op.id));
    const dbLoggedSets = loggedSetIdsToCheck.size
      ? await this.db
          .select({ id: loggedSet.id, sessionExerciseId: loggedSet.sessionExerciseId })
          .from(loggedSet)
          .where(inArray(loggedSet.id, [...loggedSetIdsToCheck]))
      : [];
    const dbSessionExerciseIdByLoggedSetId = new Map(dbLoggedSets.map((row) => [row.id, row.sessionExerciseId]));

    // Every session_exercise id a session_exercise op OWNS, plus every one a logged_set op
    // references (from its own data or, for an existing set, from the database row just read
    // above), so an existing row's real linkage is always known.
    const sessionExerciseIdsToCheck = new Set<string>([
      ...sessionExerciseOps.map((op) => op.id),
      ...loggedSetSessionExerciseIdFromData.values(),
      ...dbSessionExerciseIdByLoggedSetId.values(),
    ]);
    const dbSessionExercises = sessionExerciseIdsToCheck.size
      ? await this.db
          .select({ id: sessionExercise.id, sessionId: sessionExercise.sessionId })
          .from(sessionExercise)
          .where(inArray(sessionExercise.id, [...sessionExerciseIdsToCheck]))
      : [];
    const dbSessionIdBySessionExerciseId = new Map(dbSessionExercises.map((row) => [row.id, row.sessionId]));

    // Existing linkage always wins over a client-claimed value — an id that already exists cannot
    // be reparented onto a different aggregate by simply claiming a different parent in this push
    // (T-02-03); only a brand-new row (no existing linkage) trusts the client-supplied parent.
    function resolveSessionIdForSessionExercise(sessionExerciseId: string): string | undefined {
      return dbSessionIdBySessionExerciseId.get(sessionExerciseId) ?? sessionExerciseSessionIdFromData.get(sessionExerciseId);
    }
    function resolveSessionExerciseIdForLoggedSet(loggedSetOpId: string): string | undefined {
      return dbSessionExerciseIdByLoggedSetId.get(loggedSetOpId) ?? loggedSetSessionExerciseIdFromData.get(loggedSetOpId);
    }

    // Mirrors the session_exercise/logged_set batched-parent-read shape one level deeper — the
    // routine_exercise -> routine_day -> routine chain is the deepest ownership walk in this
    // codebase (T-04-08). routine_cycle chains to 'routine' the same single hop routine_day does,
    // kept as its own separate inArray query below rather than folded into routine_day's — they
    // are different tables.
    const routineDayOps = remaining.filter((op) => op.type === 'routine_day');
    const routineExerciseOps = remaining.filter((op) => op.type === 'routine_exercise');
    const routineCycleOps = remaining.filter((op) => op.type === 'routine_cycle');
    const routineDayRoutineIdFromData = new Map<string, string>();
    for (const op of routineDayOps) {
      const routineId = (op.data as RoutineDayOpData | null | undefined)?.routine_id;
      if (routineId) routineDayRoutineIdFromData.set(op.id, routineId);
    }
    const routineExerciseRoutineDayIdFromData = new Map<string, string>();
    for (const op of routineExerciseOps) {
      const routineDayId = (op.data as RoutineExerciseOpData | null | undefined)?.routine_day_id;
      if (routineDayId) routineExerciseRoutineDayIdFromData.set(op.id, routineDayId);
    }
    const routineCycleRoutineIdFromData = new Map<string, string>();
    for (const op of routineCycleOps) {
      const routineId = (op.data as RoutineCycleOpData | null | undefined)?.routine_id;
      if (routineId) routineCycleRoutineIdFromData.set(op.id, routineId);
    }

    const routineExerciseIdsToCheck = new Set(routineExerciseOps.map((op) => op.id));
    const dbRoutineExercises = routineExerciseIdsToCheck.size
      ? await this.db
          .select({ id: routineExercise.id, routineDayId: routineExercise.routineDayId })
          .from(routineExercise)
          .where(inArray(routineExercise.id, [...routineExerciseIdsToCheck]))
      : [];
    const dbRoutineDayIdByRoutineExerciseId = new Map(dbRoutineExercises.map((row) => [row.id, row.routineDayId]));

    const routineDayIdsToCheck = new Set<string>([
      ...routineDayOps.map((op) => op.id),
      ...routineExerciseRoutineDayIdFromData.values(),
      ...dbRoutineDayIdByRoutineExerciseId.values(),
    ]);
    const dbRoutineDays = routineDayIdsToCheck.size
      ? await this.db
          .select({ id: routineDay.id, routineId: routineDay.routineId })
          .from(routineDay)
          .where(inArray(routineDay.id, [...routineDayIdsToCheck]))
      : [];
    const dbRoutineIdByRoutineDayId = new Map(dbRoutineDays.map((row) => [row.id, row.routineId]));

    // Same database-wins-over-client-claimed precedence as resolveSessionIdForSessionExercise —
    // the anti-reparenting guarantee (T-04-09): a routine_exercise already stored under day D1
    // cannot be moved to D2 by a push that simply names a different routine_day_id.
    function resolveRoutineIdForRoutineDay(dayId: string): string | undefined {
      return dbRoutineIdByRoutineDayId.get(dayId) ?? routineDayRoutineIdFromData.get(dayId);
    }
    function resolveRoutineDayIdForRoutineExercise(routineExerciseOpId: string): string | undefined {
      return dbRoutineDayIdByRoutineExerciseId.get(routineExerciseOpId) ?? routineExerciseRoutineDayIdFromData.get(routineExerciseOpId);
    }

    // One hop, the same anti-reparenting guarantee as resolveRoutineIdForRoutineDay (T-04-31): a
    // routine_cycle already stored under routine R1 cannot be moved to R2 by naming a different
    // routine_id, because database linkage always wins over the client-claimed value.
    const routineCycleIdsToCheck = new Set(routineCycleOps.map((op) => op.id));
    const dbRoutineCycles = routineCycleIdsToCheck.size
      ? await this.db
          .select({ id: routineCycle.id, routineId: routineCycle.routineId })
          .from(routineCycle)
          .where(inArray(routineCycle.id, [...routineCycleIdsToCheck]))
      : [];
    const dbRoutineIdByRoutineCycleId = new Map(dbRoutineCycles.map((row) => [row.id, row.routineId]));
    function resolveRoutineIdForRoutineCycle(cycleOpId: string): string | undefined {
      return dbRoutineIdByRoutineCycleId.get(cycleOpId) ?? routineCycleRoutineIdFromData.get(cycleOpId);
    }

    // Root resolution — null means "could not be determined from the batch or the database".
    // Every AGGREGATE_ROOT_TYPES / SINGLETON_ROOT_TYPES member resolves to itself, never falling
    // into the trailing else branch, which assumes every remaining type chains through
    // session_exercise_id (the Pitfall 2 trap — a routine-family op landing there would resolve
    // undefined and reject missing_parent with no signal about the real cause). routine_day
    // resolves through resolveRoutineIdForRoutineDay directly; routine_exercise walks the full
    // two-hop chain, returning null when either hop fails rather than falling into the else branch.
    const rootByOpId = new Map<string, string | null>();
    for (const op of remaining) {
      if (AGGREGATE_ROOT_TYPES.has(op.type) || SINGLETON_ROOT_TYPES.has(op.type)) {
        rootByOpId.set(op.op_id, op.id);
      } else if (op.type === 'session_exercise') {
        rootByOpId.set(op.op_id, resolveSessionIdForSessionExercise(op.id) ?? null);
      } else if (op.type === 'routine_day') {
        rootByOpId.set(op.op_id, resolveRoutineIdForRoutineDay(op.id) ?? null);
      } else if (op.type === 'routine_exercise') {
        const routineDayId = resolveRoutineDayIdForRoutineExercise(op.id);
        rootByOpId.set(op.op_id, routineDayId ? (resolveRoutineIdForRoutineDay(routineDayId) ?? null) : null);
      } else if (op.type === 'routine_cycle') {
        rootByOpId.set(op.op_id, resolveRoutineIdForRoutineCycle(op.id) ?? null);
      } else {
        const sessionExerciseId = resolveSessionExerciseIdForLoggedSet(op.id);
        rootByOpId.set(op.op_id, sessionExerciseId ? (resolveSessionIdForSessionExercise(sessionExerciseId) ?? null) : null);
      }
    }

    // A batch that fails to resolve is healed onto the batch's single other known root WITHIN THE
    // SAME AGGREGATE FAMILY, matching the realistic shape of one offline session (or one routine
    // op) pushed as one batch — a genuinely ambiguous or multi-aggregate batch never merges an
    // orphan into the wrong family. healRootByFamily is keyed by root family (rootFamilyOf's
    // output), one entry per AGGREGATE_ROOT_TYPES member, each value being that family's single
    // resolved root in this batch or null when the batch contributed zero or more than one — so an
    // orphaned session_exercise can never heal onto a routine root and vice versa. A singleton root
    // is never a valid heal target (T-03-17), because SINGLETON_ROOT_TYPES members are never keys
    // of this map.
    const healRootByFamily = new Map<string, string | null>();
    for (const familyType of AGGREGATE_ROOT_TYPES) {
      const candidates = new Set(
        remaining
          .filter((op) => op.type === familyType)
          .map((op) => rootByOpId.get(op.op_id))
          .filter((r): r is string => r !== null && r !== undefined),
      );
      healRootByFamily.set(familyType, candidates.size === 1 ? [...candidates][0] : null);
    }

    const aggregates = new Map<string, Aggregate>();
    let orphanSeq = 0;
    for (const op of remaining) {
      const resolvedRoot = rootByOpId.get(op.op_id) ?? null;
      const healRoot = healRootByFamily.get(rootFamilyOf(op.type)) ?? null;
      const effectiveRoot = resolvedRoot ?? healRoot;
      const key = effectiveRoot ?? `__orphan_${orphanSeq++}`;
      const existing = aggregates.get(key);
      if (existing) {
        existing.ops.push(op);
        if (resolvedRoot === null) existing.poisoned = true;
      } else {
        aggregates.set(key, { root: effectiveRoot, ops: [op], poisoned: resolvedRoot === null });
      }
    }

    // Every root type an op in this batch self-roots as (aggregate or singleton) — built once so
    // ownership resolution below and capturedRootSeq know which table to query per root, without
    // repeating the root-resolution branch logic. A root id resolved via the session_exercise/
    // logged_set child-chain fallback defaults to workout_session wherever this map is read (both
    // resolve exclusively to that family). routine_day/routine_exercise are the one case that
    // fallback default would get wrong: a batch containing ONLY a routine_day or routine_exercise
    // op (no literal 'routine' op) still resolves its root to a real routine id — recorded here
    // explicitly so existingOwnerByRoot's table split below queries `routine`, not
    // `workout_session`, for that root (the not_owner cross-user routine_day/routine_exercise
    // cases depend on this).
    const rootTypeByRootId = new Map<string, RootTableType>();
    for (const op of remaining) {
      if (AGGREGATE_ROOT_TYPES.has(op.type) || SINGLETON_ROOT_TYPES.has(op.type)) {
        rootTypeByRootId.set(op.id, op.type as RootTableType);
      } else if (op.type === 'routine_day' || op.type === 'routine_exercise' || op.type === 'routine_cycle') {
        const resolvedRoot = rootByOpId.get(op.op_id);
        if (resolvedRoot) rootTypeByRootId.set(resolvedRoot, 'routine');
      }
    }

    // Ownership is resolved once per aggregate, through the root — re-read from the database on
    // every push rather than trusted from a prior op, so an id already accepted once is never
    // treated as already-owned (T-02-01, T-02-03). One batched query per root table, never a
    // per-row lookup (T-03-18) — every ROOT_TABLE_BY_TYPE member is split from the rest by type,
    // since each lives in its own table.
    const nonPoisonedRoots = [...aggregates.values()]
      .filter((a) => !a.poisoned && a.root !== null)
      .map((a) => a.root as string);
    const workoutSessionRootIds = nonPoisonedRoots.filter(
      (id) => (rootTypeByRootId.get(id) ?? 'workout_session') === 'workout_session',
    );
    const routineRootIds = nonPoisonedRoots.filter((id) => rootTypeByRootId.get(id) === 'routine');
    const exerciseRootIds = nonPoisonedRoots.filter((id) => rootTypeByRootId.get(id) === 'exercise');
    const userExercisePreferenceRootIds = nonPoisonedRoots.filter(
      (id) => rootTypeByRootId.get(id) === 'user_exercise_preference',
    );

    const existingRoots = workoutSessionRootIds.length
      ? await this.db
          .select({ id: workoutSession.id, userId: workoutSession.userId })
          .from(workoutSession)
          .where(inArray(workoutSession.id, workoutSessionRootIds))
      : [];
    const existingRoutineRoots = routineRootIds.length
      ? await this.db.select({ id: routine.id, userId: routine.userId }).from(routine).where(inArray(routine.id, routineRootIds))
      : [];
    // exercise.userId is nullable, unlike workoutSession.userId — a seeded row's stored value is
    // NULL, which must be distinguished below from "no such row" (T-03-01, the crux of this plan).
    const existingExerciseRoots = exerciseRootIds.length
      ? await this.db
          .select({ id: exercise.id, userId: exercise.userId })
          .from(exercise)
          .where(inArray(exercise.id, exerciseRootIds))
      : [];
    const existingUserExercisePreferenceRoots = userExercisePreferenceRootIds.length
      ? await this.db
          .select({ id: userExercisePreference.id, userId: userExercisePreference.userId })
          .from(userExercisePreference)
          .where(inArray(userExercisePreference.id, userExercisePreferenceRootIds))
      : [];
    const existingOwnerByRoot = new Map<string, string | null>([
      ...existingRoots.map((row): [string, string | null] => [row.id, row.userId]),
      ...existingRoutineRoots.map((row): [string, string | null] => [row.id, row.userId]),
      ...existingExerciseRoots.map((row): [string, string | null] => [row.id, row.userId]),
      ...existingUserExercisePreferenceRoots.map((row): [string, string | null] => [row.id, row.userId]),
    ]);

    for (const aggregate of aggregates.values()) {
      if (aggregate.poisoned || aggregate.root === null) {
        for (const op of aggregate.ops) rejected.push({ op_id: op.op_id, reason: 'missing_parent' });
        continue;
      }

      const root = aggregate.root;
      const rootOp = aggregate.ops.find(
        (op) => op.id === root && (AGGREGATE_ROOT_TYPES.has(op.type) || SINGLETON_ROOT_TYPES.has(op.type)),
      );

      // A user_preference row's id IS its owner's id (the option-a wire contract) — its owner is
      // resolved to the root id directly, with no database read, and never routed through
      // existingOwnerByRoot's "row absent means adoptable" path below, which would let a push
      // claim another user's preference row before it exists (T-04-17). The existing row, if any,
      // is otherwise always authoritative — a PUT for an id that already exists under another user
      // is a takeover attempt, not a fresh insert, regardless of who pushed it.
      let owner: string | null | undefined =
        rootTypeByRootId.get(root) === 'user_preference' ? root : existingOwnerByRoot.get(root);

      // A stored owner of null (only possible for exercise, whose userId column is nullable) means
      // a shared/seeded row exists and nobody owns it — never adoptable by the pushing user. This
      // must be checked and rejected before the owner === undefined branch below: Map.get returns
      // undefined for "no such row" and the stored value (here, null) for "row exists, no owner" —
      // conflating the two would let a client silently take ownership of a shared catalog row
      // (T-03-01, the single most safety-critical branch in this plan).
      if (owner === null) {
        for (const op of aggregate.ops) rejected.push({ op_id: op.op_id, reason: 'not_owner' });
        continue;
      }

      if (owner === undefined && rootOp && rootOp.op !== 'DELETE') {
        owner = userId;
      }

      if (owner === undefined) {
        for (const op of aggregate.ops) rejected.push({ op_id: op.op_id, reason: 'missing_parent' });
        continue;
      }
      if (owner !== userId) {
        for (const op of aggregate.ops) rejected.push({ op_id: op.op_id, reason: 'not_owner' });
        continue;
      }

      const orderedOps = [...aggregate.ops].sort((a, b) => AGGREGATE_RANK[a.type as MappedTable] - AGGREGATE_RANK[b.type as MappedTable]);

      // appliedBefore/rejectedBefore snapshot this aggregate's starting point in the shared
      // applied/rejected arrays. The transaction below is a real Postgres transaction — a caught
      // error means every write inside it already rolled back — but applied.push(...) runs as a
      // side effect *inside* that callback, so a throw partway through can leave op ids in
      // `applied` for writes the database itself undid. On catch, applied is rewound to its
      // pre-attempt length so it never reports a rolled-back write as a success (CR-04's error
      // boundary must not trade a 500 for a false "applied").
      const appliedBefore = applied.length;
      const rejectedBefore = rejected.length;
      try {
        await this.db.transaction(async (tx) => {
        // Merge order resolves through the aggregate root, never a per-child column (02-02's
        // "no server_seq on a child row" decision) — captured once, before any op in this
        // transaction touches it, so a conflict logged later in the same loop always compares
        // against the value that was true before this push started (T-02-02). Reads whichever
        // root table this root actually lives in (ROOT_TABLE_BY_TYPE), falling back to
        // workout_session when the root type is not known — the pre-existing behavior for a root
        // row that does not exist yet.
        const rootTableType = rootTypeByRootId.get(root) ?? 'workout_session';
        const rootTable = ROOT_TABLE_BY_TYPE[rootTableType];
        const [rootBefore] = await tx
          .select({ serverSeq: rootTable.serverSeq })
          .from(rootTable)
          .where(eq(rootTable.id, root));
        const capturedRootSeq = rootBefore?.serverSeq ?? 0;

        for (const op of orderedOps) {
          const table = TABLE_MAP[op.type as MappedTable];

          if (op.op !== 'DELETE') {
            // A PUT/PATCH for a tombstoned id is a stale offline write racing a delete that has
            // already landed — reject it rather than resurrecting the row (02-CONTEXT.md's
            // push-side race; PowerSync's own delete-as-tombstone only covers the pull direction).
            if (await isTombstoned(tx, op.type, op.id, userId)) {
              rejected.push({ op_id: op.op_id, reason: 'deleted' });
              continue;
            }
          }

          const existingRow = await tx.select().from(table).where(eq(table.id, op.id)).for('update');

          if (op.op === 'DELETE') {
            // Gathered before the delete: the FK cascade removes these rows at the database level
            // the moment the parent is deleted, so their ids must be read first or there is
            // nothing left to tombstone.
            let childSessionExercises: { id: string }[] = [];
            let childLoggedSets: { id: string }[] = [];
            let childRoutineExercises: { id: string }[] = [];
            if (op.type === 'workout_session' && existingRow.length > 0) {
              childSessionExercises = await tx
                .select({ id: sessionExercise.id })
                .from(sessionExercise)
                .where(eq(sessionExercise.sessionId, op.id));
              const childSessionExerciseIds = childSessionExercises.map((row) => row.id);
              childLoggedSets = childSessionExerciseIds.length
                ? await tx
                    .select({ id: loggedSet.id })
                    .from(loggedSet)
                    .where(inArray(loggedSet.sessionExerciseId, childSessionExerciseIds))
                : [];
            }
            // routine_day -> routine_exercise cascades at the database level (FK onDelete:
            // 'cascade', apps/api/src/db/schema/program.ts) the moment the day is deleted, so
            // these ids must be read first or there is nothing left to tombstone. Neither
            // workout_session.routine_day_id nor session_exercise.routine_exercise_id carries a
            // foreign key (apps/api/src/db/schema/session.ts — both are plain text columns), so
            // deleting a day or its exercises leaves those historical references dangling but
            // never breaks a logged workout.
            if (op.type === 'routine_day' && existingRow.length > 0) {
              childRoutineExercises = await tx
                .select({ id: routineExercise.id })
                .from(routineExercise)
                .where(eq(routineExercise.routineDayId, op.id));
            }

            if (existingRow.length > 0) {
              await tx.delete(table).where(eq(table.id, op.id));
            }
            const seqResult = await tx.execute<{ seq: string }>(sql`select nextval('sync_seq') as seq`);
            const seqValue = BigInt(seqResult.rows[0].seq);
            if (seqValue > highestServerSeq) highestServerSeq = seqValue;

            // Idempotent regardless of whether existingRow was found this time — a second delete
            // of an id already tombstoned must still succeed without adding a second row.
            await recordTombstone(tx, { userId, table: op.type, rowId: op.id, deletedServerSeq: Number(seqValue) });
            for (const child of childSessionExercises) {
              await recordTombstone(tx, { userId, table: 'session_exercise', rowId: child.id, deletedServerSeq: Number(seqValue) });
            }
            for (const child of childLoggedSets) {
              await recordTombstone(tx, { userId, table: 'logged_set', rowId: child.id, deletedServerSeq: Number(seqValue) });
            }
            for (const child of childRoutineExercises) {
              await recordTombstone(tx, { userId, table: 'routine_exercise', rowId: child.id, deletedServerSeq: Number(seqValue) });
            }

            applied.push(op.op_id);
            continue;
          }

          // Every op that targets an existing row is routed through resolveConflict before it is
          // written — insert/overwrite is decided identically whether or not the table logs.
          const decision = resolveConflict(op.type, existingRow[0] as Record<string, unknown> | undefined, op);
          if (decision.logConflict && op.type === 'logged_set') {
            const stored = existingRow[0] as unknown as {
              weightKg: string | null;
              reps: number;
              rir: number | null;
              setIndex: number;
              completed: boolean;
            };
            const incoming = (op.data ?? {}) as LoggedSetOpData;
            const losingValue = {
              weight_kg: stored.weightKg,
              reps: stored.reps,
              rir: stored.rir,
              set_index: stored.setIndex,
              completed: stored.completed,
            };
            const winningValue = {
              // A real null, not String(null)'s four-character spelling — an explicit null weight
              // must serialise into sync_conflict_log as JSON null (CR-02).
              weight_kg: incoming.weight_kg !== undefined ? normalizeWeightKg(incoming.weight_kg) : stored.weightKg,
              reps: incoming.reps ?? stored.reps,
              rir: incoming.rir !== undefined ? incoming.rir : stored.rir,
              set_index: incoming.set_index ?? stored.setIndex,
              completed: incoming.completed !== undefined ? incoming.completed : stored.completed,
            };
            const seqResult = await tx.execute<{ seq: string }>(sql`select nextval('sync_seq') as seq`);
            const winningServerSeq = BigInt(seqResult.rows[0].seq);
            if (winningServerSeq > highestServerSeq) highestServerSeq = winningServerSeq;
            await recordConflict(tx, {
              userId,
              table: op.type,
              rowId: op.id,
              losingValue,
              winningValue,
              losingServerSeq: Number(capturedRootSeq),
              winningServerSeq: Number(winningServerSeq),
            });
          }

          const values =
            op.type === 'workout_session'
              ? toWorkoutSessionValues(op.id, userId, op.data)
              : op.type === 'session_exercise'
                ? toSessionExerciseValues(op.id, resolveSessionIdForSessionExercise(op.id) ?? root, op.data)
                : op.type === 'logged_set'
                  ? toLoggedSetValues(op.id, resolveSessionExerciseIdForLoggedSet(op.id) ?? '', op.data)
                  : op.type === 'exercise'
                    ? toExerciseValues(op.id, userId, op.data)
                    : op.type === 'user_exercise_preference'
                      ? toUserExercisePreferenceValues(op.id, userId, op.data)
                      : op.type === 'routine'
                        ? toRoutineValues(op.id, userId, op.data)
                        : op.type === 'routine_day'
                          ? toRoutineDayValues(op.id, resolveRoutineIdForRoutineDay(op.id) ?? root, op.data)
                          : op.type === 'routine_exercise'
                            ? toRoutineExerciseValues(op.id, resolveRoutineDayIdForRoutineExercise(op.id) ?? '', op.data)
                            : op.type === 'routine_cycle'
                              ? toRoutineCycleValues(op.id, resolveRoutineIdForRoutineCycle(op.id) ?? root, op.data)
                              : toUserPreferenceValues(op.id, userId, op.data);

          if (op.type === 'workout_session') {
            const nextSeq = sql`nextval('sync_seq')`;
            const workoutSessionValues = values as WorkoutSessionValues;
            const [{ serverSeq }] = await tx
              .insert(workoutSession)
              .values({ ...workoutSessionValues, serverSeq: nextSeq })
              .onConflictDoUpdate({
                target: workoutSession.id,
                set: { ...patchAwareSet(op, workoutSessionValues, WORKOUT_SESSION_PATCH_FIELDS), serverSeq: nextSeq },
              })
              .returning({ serverSeq: workoutSession.serverSeq });
            const seqValue = BigInt(serverSeq);
            if (seqValue > highestServerSeq) highestServerSeq = seqValue;
          } else if (op.type === 'session_exercise') {
            const sessionExerciseValues = values as SessionExerciseValues;
            await tx
              .insert(sessionExercise)
              .values(sessionExerciseValues)
              .onConflictDoUpdate({
                target: sessionExercise.id,
                set: patchAwareSet(op, sessionExerciseValues, SESSION_EXERCISE_PATCH_FIELDS),
              });
          } else if (op.type === 'logged_set') {
            const loggedSetValues = values as LoggedSetValues;
            await tx
              .insert(loggedSet)
              .values(loggedSetValues)
              .onConflictDoUpdate({ target: loggedSet.id, set: patchAwareSet(op, loggedSetValues, LOGGED_SET_PATCH_FIELDS) });
          } else if (op.type === 'exercise') {
            const nextSeq = sql`nextval('sync_seq')`;
            const exerciseValues = values as ExerciseValues;
            const [{ serverSeq }] = await tx
              .insert(exercise)
              .values({ ...exerciseValues, serverSeq: nextSeq })
              .onConflictDoUpdate({
                target: exercise.id,
                set: { ...patchAwareSet(op, exerciseValues, EXERCISE_PATCH_FIELDS), serverSeq: nextSeq },
              })
              .returning({ serverSeq: exercise.serverSeq });
            const seqValue = BigInt(serverSeq);
            if (seqValue > highestServerSeq) highestServerSeq = seqValue;
          } else if (op.type === 'user_exercise_preference') {
            const nextSeq = sql`nextval('sync_seq')`;
            const userExercisePreferenceValues = values as UserExercisePreferenceValues;
            const [{ serverSeq }] = await tx
              .insert(userExercisePreference)
              .values({ ...userExercisePreferenceValues, serverSeq: nextSeq })
              .onConflictDoUpdate({
                target: userExercisePreference.id,
                set: {
                  ...patchAwareSet(op, userExercisePreferenceValues, USER_EXERCISE_PREFERENCE_PATCH_FIELDS),
                  serverSeq: nextSeq,
                },
              })
              .returning({ serverSeq: userExercisePreference.serverSeq });
            const seqValue = BigInt(serverSeq);
            if (seqValue > highestServerSeq) highestServerSeq = seqValue;
          } else if (op.type === 'routine_day') {
            // No serverSeq: routine_day is a child of the routine aggregate root, never a root
            // itself (aggregate-root rule, 02-02) — mirrors the session_exercise insert shape.
            const routineDayValues = values as RoutineDayValues;
            await tx
              .insert(routineDay)
              .values(routineDayValues)
              .onConflictDoUpdate({
                target: routineDay.id,
                set: patchAwareSet(op, routineDayValues, ROUTINE_DAY_PATCH_FIELDS),
              });
          } else if (op.type === 'routine_exercise') {
            // No serverSeq — same rule, one level deeper.
            const routineExerciseValues = values as RoutineExerciseValues;
            await tx
              .insert(routineExercise)
              .values(routineExerciseValues)
              .onConflictDoUpdate({
                target: routineExercise.id,
                set: patchAwareSet(op, routineExerciseValues, ROUTINE_EXERCISE_PATCH_FIELDS),
              });
          } else if (op.type === 'routine_cycle') {
            // No serverSeq — a child of the routine aggregate root, one hop shallower than
            // routine_exercise, mirroring the routine_day insert shape.
            const routineCycleValues = values as RoutineCycleValues;
            await tx
              .insert(routineCycle)
              .values(routineCycleValues)
              .onConflictDoUpdate({
                target: routineCycle.id,
                set: patchAwareSet(op, routineCycleValues, ROUTINE_CYCLE_PATCH_FIELDS),
              });
          } else if (op.type === 'routine') {
            // routine — the aggregate root the tracer proves. Carries server_seq like exercise and
            // user_exercise_preference (it is an aggregate root), unlike session_exercise/logged_set.
            const nextSeq = sql`nextval('sync_seq')`;
            const routineValues = values as RoutineValues;
            const [{ serverSeq }] = await tx
              .insert(routine)
              .values({ ...routineValues, serverSeq: nextSeq })
              .onConflictDoUpdate({
                target: routine.id,
                set: { ...patchAwareSet(op, routineValues, ROUTINE_PATCH_FIELDS), serverSeq: nextSeq },
              })
              .returning({ serverSeq: routine.serverSeq });
            const seqValue = BigInt(serverSeq);
            if (seqValue > highestServerSeq) highestServerSeq = seqValue;
          } else {
            // user_preference — a fourth singleton root (SINGLETON_ROOT_TYPES), inserted/upserted
            // the same shape as user_exercise_preference: server_seq on insert and on the conflict
            // set, since a singleton root carries its own server_seq like any other aggregate root.
            const nextSeq = sql`nextval('sync_seq')`;
            const userPreferenceValues = values as UserPreferenceValues;
            const [{ serverSeq }] = await tx
              .insert(userPreference)
              .values({ ...userPreferenceValues, serverSeq: nextSeq })
              .onConflictDoUpdate({
                target: userPreference.id,
                set: { ...patchAwareSet(op, userPreferenceValues, USER_PREFERENCE_PATCH_FIELDS), serverSeq: nextSeq },
              })
              .returning({ serverSeq: userPreference.serverSeq });
            const seqValue = BigInt(serverSeq);
            if (seqValue > highestServerSeq) highestServerSeq = seqValue;
          }

          applied.push(op.op_id);
        }
        });
      } catch (error) {
        // The transaction already rolled back every write it made — this catch's job is only to
        // let the loop over aggregates.values() survive and continue to the next one (CR-04). An
        // op already rejected earlier in this same attempt (e.g. a tombstone race) keeps that
        // reason rather than being overwritten.
        applied.length = appliedBefore;
        const alreadyRejected = new Set(rejected.slice(rejectedBefore).map((r) => r.op_id));
        for (const op of aggregate.ops) {
          if (!alreadyRejected.has(op.op_id)) {
            rejected.push({ op_id: op.op_id, reason: 'invalid_field' });
          }
        }
        this.logger.error(
          `applyBatch: aggregate root=${root} failed and was rolled back (opIds=${aggregate.ops.map((op) => op.op_id).join(',')})`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return { applied, rejected, server_seq: highestServerSeq.toString() };
  }
}
