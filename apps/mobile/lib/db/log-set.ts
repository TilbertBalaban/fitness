import { and, eq, sql } from 'drizzle-orm';
import * as unitsContract from '@fitness/api-contracts';
import { EMPTY_TARGET, resolveTarget, type ResolvedTarget } from '@fitness/api-contracts';
import { captureCalendarDay } from '../calendar-day';
import { generateClientId } from './id';
import { getPowerSync, type WriteDb } from './powersync';
import { loggedSet, routineExercise, routineExerciseCycleTarget, sessionExercise, workoutSession } from './schema';

export interface StartSessionInput {
  routineDayId?: string | null;
  equipmentProfileId?: string | null;
  deviceId?: string | null;
  now?: Date;
}

// Stamps timezone and local_date once, here, from the device's IANA zone (LOG-22) — nothing else
// in this codebase ever writes those two columns, and no read path recomputes them (PITFALLS §12).
export async function startSession(
  input: StartSessionInput = {},
  db: WriteDb = getPowerSync(),
): Promise<string> {
  const id = generateClientId();
  const startedAt = input.now ?? new Date();
  const { timezone, localDate } = captureCalendarDay(startedAt);

  await db.insert(workoutSession).values({
    id,
    routineDayId: input.routineDayId ?? null,
    equipmentProfileId: input.equipmentProfileId ?? null,
    startedAt: startedAt.toISOString(),
    endedAt: null,
    status: 'in_progress',
    deviceId: input.deviceId ?? null,
    timezone,
    localDate,
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
  db: WriteDb,
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
  db: WriteDb = getPowerSync(),
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

// Writes the row and returns — no network call, no batching, no deferral to a finish action. A
// set that only becomes durable when the workout is finished is a set lost to a force-quit.
export async function logSet(input: LogSetInput, db: WriteDb = getPowerSync()): Promise<string> {
  const id = generateClientId();

  const [maxRow] = await db
    .select({ maxIndex: sql<number | null>`max(${loggedSet.setIndex})` })
    .from(loggedSet)
    .where(eq(loggedSet.sessionExerciseId, input.sessionExerciseId));
  const setIndex = (maxRow?.maxIndex ?? 0) + 1;

  const weightKg = unitsContract.toCanonicalKg(input.weight.value, input.weight.unit);

  await db.insert(loggedSet).values({
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
    loggedAt: (input.now ?? new Date()).toISOString(),
  });

  return id;
}
