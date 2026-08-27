import { and, eq, sql } from 'drizzle-orm';
import * as unitsContract from '@fitness/api-contracts';
import { EMPTY_TARGET, resolveTarget, type ResolvedTarget } from '@fitness/api-contracts';
import { captureCalendarDay } from '../calendar-day';
import { ensureDefaultEquipmentProfile } from './equipment-profiles';
import { generateClientId } from './id';
import { getPowerSync, type WriteDb, type WriteHandle, type WriteTx } from './powersync';
import { loggedSet, routineExercise, routineExerciseCycleTarget, sessionExercise, workoutSession } from './schema';

export interface StartSessionInput {
  routineDayId?: string | null;
  // The program cycle this session was started against, stamped once here and never rewritten by
  // any read path (LOG-15, D-06's stamp-once pattern). Absent/null means a one-off or backfilled
  // session with no cycle.
  cycleId?: string | null;
  equipmentProfileId?: string | null;
  deviceId?: string | null;
  now?: Date;
}

// Stamps timezone and local_date once, here, from the device's IANA zone (LOG-22) at creation.
// `setSessionDate` below is the single deliberate exception permitted to rewrite them afterwards —
// choosing or editing a session's date (LOG-21) is exactly the case D-06's stamp-once rule cannot
// serve. A second writer of these two columns anywhere else in this codebase is a defect: every
// read path (History's ordering, rotation's resolveNextUp) assumes exactly these two functions
// ever touch them, and a third writer reopens the timezone bug PITFALLS §12 already fixed once.
export async function startSession(
  input: StartSessionInput = {},
  db: WriteHandle = getPowerSync(),
): Promise<string> {
  const id = generateClientId();
  const startedAt = input.now ?? new Date();
  const { timezone, localDate } = captureCalendarDay(startedAt);

  await db.insert(workoutSession).values({
    id,
    routineDayId: input.routineDayId ?? null,
    cycleId: input.cycleId ?? null,
    equipmentProfileId: input.equipmentProfileId ?? null,
    startedAt: startedAt.toISOString(),
    endedAt: null,
    status: 'in_progress',
    deviceId: input.deviceId ?? null,
    timezone: timezone,
    localDate: localDate,
  });

  return id;
}

export interface AddSessionExerciseInput {
  sessionId: string;
  exerciseId: string;
  orderIndex: number;
  supersetGroupId?: string | null;
  routineExerciseId?: string | null;
  // Passed in, never derived here: deriving the session's cycle would mean reading the routine's
  // cycle list and the user's session history from a write helper, duplicating the position
  // arithmetic that owns that question.
  cycleId?: string | null;
}

type Prescription = ResolvedTarget;

const EMPTY_PRESCRIPTION: Prescription = EMPTY_TARGET;

// Two selects, never five: one for the base row, one for the cycle's override. The unique
// (routine_exercise_id, cycle_id) pair means the second select returns at most one row.
async function resolvePrescriptionForCycle(
  routineExerciseId: string,
  cycleId: string | null | undefined,
  db: WriteHandle,
): Promise<Prescription> {
  const [base] = await db
    .select({
      targetSets: routineExercise.targetSets,
      targetRepMin: routineExercise.targetRepMin,
      targetRepMax: routineExercise.targetRepMax,
      targetRir: routineExercise.targetRir,
      targetRestSeconds: routineExercise.targetRestSeconds,
    })
    .from(routineExercise)
    .where(eq(routineExercise.id, routineExerciseId));

  if (!cycleId) {
    return base ?? EMPTY_PRESCRIPTION;
  }

  const [override] = await db
    .select({
      targetSets: routineExerciseCycleTarget.targetSets,
      targetRepMin: routineExerciseCycleTarget.targetRepMin,
      targetRepMax: routineExerciseCycleTarget.targetRepMax,
      targetRir: routineExerciseCycleTarget.targetRir,
      targetRestSeconds: routineExerciseCycleTarget.targetRestSeconds,
    })
    .from(routineExerciseCycleTarget)
    .where(
      and(
        eq(routineExerciseCycleTarget.routineExerciseId, routineExerciseId),
        eq(routineExerciseCycleTarget.cycleId, cycleId),
      ),
    );

  return resolveTarget(base ?? EMPTY_TARGET, override ?? null);
}

// Copies the prescription onto the row once, here, and stores routine_exercise_id for
// traceability only — every later read of the prescription reads this snapshot, never
// routine_exercise again (D-05).
export async function addSessionExercise(
  input: AddSessionExerciseInput,
  db: WriteHandle = getPowerSync(),
): Promise<string> {
  const id = generateClientId();

  const prescription = input.routineExerciseId
    ? await resolvePrescriptionForCycle(input.routineExerciseId, input.cycleId, db)
    : EMPTY_PRESCRIPTION;

  await db.insert(sessionExercise).values({
    id,
    sessionId: input.sessionId,
    exerciseId: input.exerciseId,
    orderIndex: input.orderIndex,
    supersetGroupId: input.supersetGroupId ?? null,
    routineExerciseId: input.routineExerciseId ?? null,
    ...prescription,
  });

  return id;
}

export interface LogSetWeightInput {
  value: string | null;
  unit: unitsContract.WeightUnit;
}

export interface LogSetInput {
  sessionExerciseId: string;
  setType?: string;
  weight: LogSetWeightInput;
  reps: number;
  rir?: number | null;
  side?: string | null;
  completed?: boolean;
  parentSetId?: string | null;
  restTakenSeconds?: number | null;
  now?: Date;
}

export interface UpdateLoggedSetInput {
  id: string;
  weight?: LogSetWeightInput;
  reps?: number;
  rir?: number | null;
  completed?: boolean;
  // Added for 05-06's R7 set-number tap target: switching a row between the working and warm-up
  // set_type values (the only two this phase's picker offers — Phase 7 wires the rest into the
  // same tap target). Never renumbers set_index; changing type is not changing position.
  setType?: string;
}

// Patches exactly the columns the caller names — never a blanket rewrite of the row. This is what
// makes "changing RIR on an already-completed set writes only the rir column" (LOG-06) true by
// construction rather than by convention: the checkmark toggle passes only `completed`, and a
// single-field edit passes only that field, so `set_index`, and whichever of weight/reps/rir the
// caller omitted, are never present in the SQL SET clause at all.
export async function updateLoggedSet(input: UpdateLoggedSetInput, db: WriteDb = getPowerSync()): Promise<void> {
  const patch: Partial<{ weightKg: string | null; reps: number; rir: number | null; completed: boolean; setType: string }> = {};
  if (input.weight !== undefined) patch.weightKg = unitsContract.toCanonicalKg(input.weight.value, input.weight.unit);
  if (input.reps !== undefined) patch.reps = input.reps;
  if (input.rir !== undefined) patch.rir = input.rir;
  if (input.completed !== undefined) patch.completed = input.completed;
  if (input.setType !== undefined) patch.setType = input.setType;

  if (Object.keys(patch).length === 0) return;

  await db.update(loggedSet).set(patch).where(eq(loggedSet.id, input.id));
}

// Writes the row and returns — no network call, no batching, no deferral to a finish action. A
// set that only becomes durable when the workout is finished is a set lost to a force-quit.
export async function logSet(input: LogSetInput, db: WriteDb = getPowerSync()): Promise<string> {
  const id = generateClientId();
  const weightKg = unitsContract.toCanonicalKg(input.weight.value, input.weight.unit);
  const loggedAt = (input.now ?? new Date()).toISOString();

  // The select-max-then-insert must run as one local SQLite transaction (CR-02) — two
  // handleCheckmarkPress invocations fired in quick succession (a double-tap) would otherwise
  // both read the same max(set_index) before either insert lands, producing two logged_set rows
  // with an identical (session_exercise_id, set_index) pair. WriteTx serializes with any other
  // in-flight db.transaction() call on this connection, so the second call's select only starts
  // once the first call's insert has committed.
  await db.transaction(async (tx: WriteTx) => {
    const [maxRow] = await tx
      .select({ maxIndex: sql<number | null>`max(${loggedSet.setIndex})` })
      .from(loggedSet)
      .where(eq(loggedSet.sessionExerciseId, input.sessionExerciseId));
    const setIndex = (maxRow?.maxIndex ?? 0) + 1;

    await tx.insert(loggedSet).values({
      id,
      sessionExerciseId: input.sessionExerciseId,
      setIndex,
      setType: input.setType ?? 'normal',
      weightKg,
      reps: input.reps,
      rir: input.rir ?? null,
      side: input.side ?? null,
      completed: input.completed ?? false,
      parentSetId: input.parentSetId ?? null,
      restTakenSeconds: input.restTakenSeconds ?? null,
      loggedAt,
    });
  });

  return id;
}

export interface StartWorkoutFromProgramSlot {
  routineExerciseId: string;
  exerciseId: string;
  orderIndex: number;
}

export interface StartWorkoutFromProgramInput {
  routineDayId: string;
  cycleId: string | null;
  slots: StartWorkoutFromProgramSlot[];
  // Optional so every existing caller with no signed-in user (the durability harness) keeps
  // stamping equipmentProfileId null exactly as before this phase — a real screen call site
  // passes the authenticated userId and gets D-19's seed-on-first-need for free.
  userId?: string | null;
  now?: Date;
}

// The single funnel over startSession + addSessionExercise for "start today's programmed
// workout" (D-33 will later route two more entry points — a one-off start, and re-opening a
// stashed session — through this exact same startSession call, never a second insert path).
// Does not duplicate startSession's captureCalendarDay call: that stamping happens exactly once,
// inside startSession, here and everywhere else a session is created.
export async function startWorkoutFromProgram(
  input: StartWorkoutFromProgramInput,
  db: WriteDb = getPowerSync(),
): Promise<string> {
  const equipmentProfileId = input.userId ? await ensureDefaultEquipmentProfile(input.userId, db) : null;

  const sessionId = await startSession(
    { routineDayId: input.routineDayId, cycleId: input.cycleId, equipmentProfileId, now: input.now },
    db,
  );

  const ordered = [...input.slots].sort((a, b) => a.orderIndex - b.orderIndex);
  for (const slot of ordered) {
    await addSessionExercise(
      {
        sessionId,
        exerciseId: slot.exerciseId,
        orderIndex: slot.orderIndex,
        routineExerciseId: slot.routineExerciseId,
        cycleId: input.cycleId,
      },
      db,
    );
  }

  return sessionId;
}

// The single deliberate exception to D-06's stamp-once rule (D-33, PITFALLS §12): rewrites
// started_at, timezone and local_date together, in one write, through the SAME captureCalendarDay
// derivation startSession uses — never a second, inline timezone computation. All three columns
// move as a unit because they must agree with each other: started_at without the recalculated
// calendar pair would sort a session under one day while every read of local_date (History's
// ordering, resolveNextUp's rotation) still attributes it to another.
export async function setSessionDate(
  sessionId: string,
  date: Date,
  timezone: string,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  const { timezone: resolvedTimezone, localDate } = captureCalendarDay(date, timezone);

  await db
    .update(workoutSession)
    .set({ startedAt: date.toISOString(), timezone: resolvedTimezone, localDate: localDate })
    .where(eq(workoutSession.id, sessionId));
}
