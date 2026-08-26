import { and, eq, sql } from 'drizzle-orm';
import { isEmptyOverride, WARMUP_SET_TYPE, type ResolvedTarget, type TargetOverride } from '@fitness/api-contracts';
import { warmupSets } from '@fitness/pr-rules';
import { addSessionExercise, logSet } from './log-set';
import { getPowerSync, type WriteDb, type WriteHandle, type WriteTx } from './powersync';
import { loggedSet, routineExercise, routineExerciseCycleTarget, sessionExercise, workoutSession } from './schema';

// The module every session-scoped write these action-bar/overflow surfaces perform lives behind
// (05-06's own boundary) — D-33's single-funnel invariant only names the workout_session insert
// path (owned by log-set.ts's startSession), so this file never inserts a workout_session row and
// reuses addSessionExercise/logSet for the two inserts it does need rather than duplicating them.

export type NoteLevel = 'set' | 'exercise' | 'session';

function normalizeNote(text: string | null): string | null {
  if (text === null) return null;
  const trimmed = text.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export interface SetNoteInput {
  level: NoteLevel;
  id: string;
  text: string | null;
}

// Three independent writes to the three notes columns 05-02 added to logged_set/session_exercise/
// workout_session — a write to one never reads or touches the other two. An empty or
// all-whitespace string is normalised to null before the write so "no note" has exactly one
// representation (LOG-16).
export async function setNote({ level, id, text }: SetNoteInput, db: WriteDb = getPowerSync()): Promise<void> {
  const notes = normalizeNote(text);
  if (level === 'set') {
    await db.update(loggedSet).set({ notes }).where(eq(loggedSet.id, id));
  } else if (level === 'exercise') {
    await db.update(sessionExercise).set({ notes }).where(eq(sessionExercise.id, id));
  } else {
    await db.update(workoutSession).set({ notes }).where(eq(workoutSession.id, id));
  }
}

// Writes only the five target_* columns on the frozen session_exercise snapshot — the row set
// rows already read (D-14, LOG-15). The program authored in Phase 4 is never touched here; that is
// writeBackTargets's job, a distinct, explicitly separate call.
export async function setSessionExerciseTargets(
  sessionExerciseId: string,
  targets: ResolvedTarget,
  db: WriteHandle = getPowerSync(),
): Promise<void> {
  await db
    .update(sessionExercise)
    .set({
      targetSets: targets.targetSets,
      targetRepMin: targets.targetRepMin,
      targetRepMax: targets.targetRepMax,
      targetRir: targets.targetRir,
      targetRestSeconds: targets.targetRestSeconds,
    })
    .where(eq(sessionExercise.id, sessionExerciseId));
}

export type WriteBackField = keyof ResolvedTarget;

export interface ResolveWriteBackTargetInput {
  routineExerciseId: string;
  cycleId: string | null;
  field: WriteBackField;
}

export type WriteBackDestination = { kind: 'override'; id: string } | { kind: 'base' };

const TARGET_FIELDS: WriteBackField[] = ['targetSets', 'targetRepMin', 'targetRepMax', 'targetRir', 'targetRestSeconds'];

// The write-side mirror of log-set.ts's resolvePrescriptionForCycle `override ?? base` read: an
// override row for this (routine_exercise_id, cycle_id) pair whose value for this field is
// non-null wins; anything else (no row, or a null on that field) falls to the base routine_exercise
// row. The two resolutions must agree — a write-back that disagreed would land on a row the
// displayed value did not actually come from, silently hiding the user's edit behind a shadowing
// override next cycle (D-15).
export async function resolveWriteBackTarget(
  { routineExerciseId, cycleId, field }: ResolveWriteBackTargetInput,
  db: WriteDb = getPowerSync(),
): Promise<WriteBackDestination> {
  if (!cycleId) return { kind: 'base' };

  const [override] = await db
    .select({ id: routineExerciseCycleTarget.id, value: routineExerciseCycleTarget[field] })
    .from(routineExerciseCycleTarget)
    .where(
      and(
        eq(routineExerciseCycleTarget.routineExerciseId, routineExerciseId),
        eq(routineExerciseCycleTarget.cycleId, cycleId),
      ),
    );

  if (override && override.value !== null) {
    return { kind: 'override', id: override.id };
  }
  return { kind: 'base' };
}

export interface WriteBackTargetsInput {
  routineExerciseId: string;
  cycleId: string | null;
  targets: ResolvedTarget;
}

// Resolves per field through resolveWriteBackTarget and applies each — this never inserts a new
// routine_exercise_cycle_target row: resolveWriteBackTarget only ever names an EXISTING override
// row's id or 'base', by construction, so there is no path here that would create an override row
// overriding nothing. (isEmptyOverride from @fitness/api-contracts is the guard a hypothetical
// insert path would need; kept unimported here since none exists.)
export async function writeBackTargets(
  { routineExerciseId, cycleId, targets }: WriteBackTargetsInput,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  const baseUpdates: TargetOverride = {};
  const overrideUpdatesByRowId = new Map<string, TargetOverride>();

  for (const field of TARGET_FIELDS) {
    const destination = await resolveWriteBackTarget({ routineExerciseId, cycleId, field }, db);
    if (destination.kind === 'base') {
      baseUpdates[field] = targets[field];
    } else {
      const bucket = overrideUpdatesByRowId.get(destination.id) ?? {};
      bucket[field] = targets[field];
      overrideUpdatesByRowId.set(destination.id, bucket);
    }
  }

  if (Object.keys(baseUpdates).length > 0) {
    await db.update(routineExercise).set(baseUpdates).where(eq(routineExercise.id, routineExerciseId));
  }

  for (const [rowId, updates] of overrideUpdatesByRowId) {
    await db.update(routineExerciseCycleTarget).set(updates).where(eq(routineExerciseCycleTarget.id, rowId));
  }
}

export interface AddExerciseToSessionInput {
  sessionId: string;
  exerciseIds: string[];
}

// Appends one session_exercise per selected exercise, one add call per id — never deduplicated:
// selecting the same exercise twice is a legitimate, distinct add (two rows, two client-generated
// ids, consecutive order_index values), because doing an exercise twice in one session is a
// legitimate thing to do (LOG-14 idempotency truth). No routineExerciseId is passed, so
// addSessionExercise's own EMPTY_PRESCRIPTION path applies and every target renders as the em dash.
export async function addExerciseToSession(
  { sessionId, exerciseIds }: AddExerciseToSessionInput,
  db: WriteDb = getPowerSync(),
): Promise<string[]> {
  const [row] = await db
    .select({ maxOrder: sql<number | null>`max(${sessionExercise.orderIndex})` })
    .from(sessionExercise)
    .where(eq(sessionExercise.sessionId, sessionId));
  let nextOrderIndex = (row?.maxOrder ?? -1) + 1;

  const ids: string[] = [];
  for (const exerciseId of exerciseIds) {
    const id = await addSessionExercise({ sessionId, exerciseId, orderIndex: nextOrderIndex }, db);
    ids.push(id);
    nextOrderIndex += 1;
  }
  return ids;
}

export interface SwapSessionExerciseInput {
  sessionExerciseId: string;
  newExerciseId: string;
}

// Updates exercise_id on the row in place — order_index and every logged_set already attached to
// it (via session_exercise_id, untouched by this update) survive the swap unchanged.
export async function swapSessionExercise(
  { sessionExerciseId, newExerciseId }: SwapSessionExerciseInput,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  await db.update(sessionExercise).set({ exerciseId: newExerciseId }).where(eq(sessionExercise.id, sessionExerciseId));
}

// Stamps removed_at with the current time — never a delete, and never touches logged_set. This is
// what makes the confirmation copy true: "Any sets already logged for this exercise stay in your
// history." Every live-session read added by this phase filters removed_at IS NULL; history and
// the finish summary read past it.
export async function removeSessionExercise(sessionExerciseId: string, db: WriteDb = getPowerSync()): Promise<void> {
  await db
    .update(sessionExercise)
    .set({ removedAt: new Date().toISOString() })
    .where(eq(sessionExercise.id, sessionExerciseId));
}

export interface GenerateWarmupSetsInput {
  sessionExerciseId: string;
  workingWeightKg: number | null;
  roundingIncrementKg?: number;
}

// LOG-17: deletes the exercise's existing UNCOMPLETED warm-up rows, then inserts one logged_set
// row per warmupSets() entry through the existing logSet helper — a second tap regenerates rather
// than appends, so an exercise can never end up with two ladders; a completed warm-up row from an
// earlier generation is left alone, since the user did it. Writes no percentage or rounding
// arithmetic itself — @fitness/pr-rules's warmupSets() is the only source of the ladder.
export async function generateWarmupSets(
  { sessionExerciseId, workingWeightKg, roundingIncrementKg }: GenerateWarmupSetsInput,
  db: WriteDb = getPowerSync(),
): Promise<string[]> {
  await db
    .delete(loggedSet)
    .where(
      and(
        eq(loggedSet.sessionExerciseId, sessionExerciseId),
        eq(loggedSet.setType, WARMUP_SET_TYPE),
        eq(loggedSet.completed, false),
      ),
    );

  const ladder = warmupSets(workingWeightKg, roundingIncrementKg);
  const ids: string[] = [];
  for (const set of ladder) {
    const id = await logSet(
      {
        sessionExerciseId,
        setType: WARMUP_SET_TYPE,
        weight: { value: String(set.weightKg), unit: 'kg' },
        reps: set.reps,
        completed: false,
      },
      db,
    );
    ids.push(id);
  }
  return ids;
}

// Rewrites order_index across the session's non-removed rows in one pass, in the order the caller
// hands back — the caller (a drag interaction, or any future reorder UI) owns the ordering
// decision; this function only ever persists it.
// All order_index writes land in a single transaction (mirroring duplicateSession's shape in
// history-mutations.ts) so an interruption partway through can never leave two exercises sharing
// a position — the same all-or-nothing guarantee WR-02 established there.
export async function reorderSessionExercises(
  sessionId: string,
  orderedIds: string[],
  db: WriteDb = getPowerSync(),
): Promise<void> {
  await db.transaction(async (tx: WriteTx) => {
    for (let index = 0; index < orderedIds.length; index += 1) {
      await tx
        .update(sessionExercise)
        .set({ orderIndex: index })
        .where(and(eq(sessionExercise.id, orderedIds[index]), eq(sessionExercise.sessionId, sessionId)));
    }
  });
}
