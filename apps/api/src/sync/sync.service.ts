import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  SYNCED_TABLES,
  LOAD_TYPES as LOAD_TYPE_TUPLE,
  EQUIPMENT_TYPES as EQUIPMENT_TYPE_TUPLE,
  MOVEMENT_PATTERNS as MOVEMENT_PATTERN_TUPLE,
  type SyncCrudOp,
  type SyncPushResponse,
  type SyncRejectionReason,
} from '@fitness/api-contracts';
import { DRIZZLE, type Database } from '../db/drizzle.module';
import { workoutSession, sessionExercise, loggedSet, exercise, userExercisePreference } from '../db/schema';
import { resolveConflict } from './conflict-policy';
import { recordConflict, recordTombstone, isTombstoned } from './conflict-log';
import {
  EXERCISE_PATCH_FIELDS,
  LOGGED_SET_PATCH_FIELDS,
  patchAwareSet,
  SESSION_EXERCISE_PATCH_FIELDS,
  USER_EXERCISE_PREFERENCE_PATCH_FIELDS,
  WORKOUT_SESSION_PATCH_FIELDS,
  type ExerciseValues,
  type LoggedSetValues,
  type SessionExerciseValues,
  type UserExercisePreferenceValues,
  type WorkoutSessionValues,
} from './patch-update-set';

const TABLE_MAP = {
  workout_session: workoutSession,
  session_exercise: sessionExercise,
  logged_set: loggedSet,
  exercise: exercise,
  user_exercise_preference: userExercisePreference,
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

// exercise and user_exercise_preference are singleton aggregate roots: each is exactly one op
// with no synced children (session_exercise.exercise_id is a foreign-key reference for reads,
// never a sync-parent relationship). Every branch below keys off this set rather than repeating
// two string comparisons (RESEARCH.md Pattern 2).
const SINGLETON_ROOT_TYPES = new Set<string>(['exercise', 'user_exercise_preference']);

// Parents apply before children within an aggregate — PowerSync's crud queue can genuinely
// deliver ops in an order the app did not intend, so this is an explicit sort, not an assumption
// (PITFALLS §4). exercise/user_exercise_preference never have children to order against, so rank
// 0 is safe: aggregates are keyed by distinct root id, and a workout_session aggregate never
// shares a key with an exercise or user_exercise_preference aggregate.
const AGGREGATE_RANK: Record<MappedTable, number> = {
  workout_session: 0,
  session_exercise: 1,
  logged_set: 2,
  exercise: 0,
  user_exercise_preference: 0,
};

const SESSION_STATUSES = new Set(['in_progress', 'completed', 'discarded']);
const SET_TYPES = new Set(['normal', 'warmup', 'drop', 'myorep', 'partial', 'failure', 'amrap']);
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Built from the shared @fitness/api-contracts tuples, never retyped literals, so the
// client-facing invalid_field rejection and the Postgres CHECK constraint can never drift apart.
const LOAD_TYPES = new Set<string>(LOAD_TYPE_TUPLE);
const EQUIPMENT_TYPES = new Set<string>(EQUIPMENT_TYPE_TUPLE);
const MOVEMENT_PATTERNS = new Set<string>(MOVEMENT_PATTERN_TUPLE);

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
  target_rir_min?: number | null;
  target_rir_max?: number | null;
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
    targetRirMin: d.target_rir_min ?? null,
    targetRirMax: d.target_rir_max ?? null,
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
// `set`) silently clobber an existing row's FK with an empty string (CR-04). order_index and the six
// target_* fields keep the "checked only when present" pattern the other validators use; each
// target_* column is nullable, so an explicit null is a legitimate "no prescription" value.
function isInvalidSessionExercise(data: SessionExerciseOpData): boolean {
  if (typeof data.exercise_id !== 'string' || data.exercise_id.length === 0) return true;
  if (data.order_index !== undefined && !isNonNegativeInteger(data.order_index)) return true;
  if (data.target_sets !== undefined && !isNonNegativeIntegerOrNull(data.target_sets)) return true;
  if (data.target_rep_min !== undefined && !isNonNegativeIntegerOrNull(data.target_rep_min)) return true;
  if (data.target_rep_max !== undefined && !isNonNegativeIntegerOrNull(data.target_rep_max)) return true;
  if (data.target_rir_min !== undefined && !isNonNegativeIntegerOrNull(data.target_rir_min)) return true;
  if (data.target_rir_max !== undefined && !isNonNegativeIntegerOrNull(data.target_rir_max)) return true;
  if (data.target_rest_seconds !== undefined && !isNonNegativeIntegerOrNull(data.target_rest_seconds)) return true;
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
    const remaining: SyncCrudOp[] = [];
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

    // Root resolution — null means "could not be determined from the batch or the database".
    // exercise/user_exercise_preference are singleton roots (SINGLETON_ROOT_TYPES): they resolve
    // to themselves exactly like workout_session, never falling into the else branch below, which
    // assumes every remaining type chains through session_exercise_id (the Pitfall 2 trap — an
    // exercise op landing there would resolve undefined and reject missing_parent with no signal
    // about the real cause).
    const rootByOpId = new Map<string, string | null>();
    for (const op of remaining) {
      if (op.type === 'workout_session' || SINGLETON_ROOT_TYPES.has(op.type)) {
        rootByOpId.set(op.op_id, op.id);
      } else if (op.type === 'session_exercise') {
        rootByOpId.set(op.op_id, resolveSessionIdForSessionExercise(op.id) ?? null);
      } else {
        const sessionExerciseId = resolveSessionExerciseIdForLoggedSet(op.id);
        rootByOpId.set(op.op_id, sessionExerciseId ? (resolveSessionIdForSessionExercise(sessionExerciseId) ?? null) : null);
      }
    }

    // A batch that fails to resolve is healed onto the batch's single other known root, matching
    // the realistic shape of one offline session pushed as one batch — a genuinely ambiguous or
    // multi-session batch never merges an orphan into the wrong aggregate. Restricted to roots
    // contributed by workout_session ops specifically: a batch containing only exercise ops would
    // otherwise make an exercise id the sole resolved root, and an orphaned logged_set in that
    // batch would then heal onto it — a singleton root is never a valid heal target (T-03-17).
    const workoutSessionHealCandidates = new Set(
      remaining
        .filter((op) => op.type === 'workout_session')
        .map((op) => rootByOpId.get(op.op_id))
        .filter((r): r is string => r !== null && r !== undefined),
    );
    const healRoot = workoutSessionHealCandidates.size === 1 ? [...workoutSessionHealCandidates][0] : null;

    const aggregates = new Map<string, Aggregate>();
    let orphanSeq = 0;
    for (const op of remaining) {
      const resolvedRoot = rootByOpId.get(op.op_id) ?? null;
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

    // Every root that is itself an exercise or user_exercise_preference op in this batch — built
    // from the self-rooted ops above so ownership resolution below knows which table to query
    // per root, without repeating the root-resolution branch logic.
    const singletonRootTypeByRootId = new Map<string, 'exercise' | 'user_exercise_preference'>();
    for (const op of remaining) {
      if (op.type === 'exercise' || op.type === 'user_exercise_preference') {
        singletonRootTypeByRootId.set(op.id, op.type);
      }
    }

    // Ownership is resolved once per aggregate, through the root — re-read from the database on
    // every push rather than trusted from a prior op, so an id already accepted once is never
    // treated as already-owned (T-02-01, T-02-03). One batched query per root type, never a
    // per-row lookup (T-03-18) — exercise/user_exercise_preference roots are split from
    // workout_session roots by type, since each lives in its own table.
    const nonPoisonedRoots = [...aggregates.values()]
      .filter((a) => !a.poisoned && a.root !== null)
      .map((a) => a.root as string);
    const workoutSessionRootIds = nonPoisonedRoots.filter((id) => !singletonRootTypeByRootId.has(id));
    const exerciseRootIds = nonPoisonedRoots.filter((id) => singletonRootTypeByRootId.get(id) === 'exercise');
    const userExercisePreferenceRootIds = nonPoisonedRoots.filter(
      (id) => singletonRootTypeByRootId.get(id) === 'user_exercise_preference',
    );

    const existingRoots = workoutSessionRootIds.length
      ? await this.db
          .select({ id: workoutSession.id, userId: workoutSession.userId })
          .from(workoutSession)
          .where(inArray(workoutSession.id, workoutSessionRootIds))
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
        (op) => op.id === root && (op.type === 'workout_session' || SINGLETON_ROOT_TYPES.has(op.type)),
      );

      // The existing row, if any, is always authoritative — a PUT for an id that already exists
      // under another user is a takeover attempt, not a fresh insert, regardless of who pushed it.
      let owner: string | null | undefined = existingOwnerByRoot.get(root);

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
        // against the value that was true before this push started (T-02-02).
        const [rootBefore] = await tx
          .select({ serverSeq: workoutSession.serverSeq })
          .from(workoutSession)
          .where(eq(workoutSession.id, root));
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
                    : toUserExercisePreferenceValues(op.id, userId, op.data);

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
          } else {
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
