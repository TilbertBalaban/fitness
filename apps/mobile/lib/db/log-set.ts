import { eq, sql } from 'drizzle-orm';
import { captureCalendarDay } from '../calendar-day';
import { generateClientId } from './id';
import { getPowerSync } from './powersync';
import { loggedSet, routineExercise, sessionExercise, workoutSession } from './schema';

export interface StartSessionInput {
  routineDayId?: string | null;
  equipmentProfileId?: string | null;
  deviceId?: string | null;
  now?: Date;
}

// Stamps timezone and local_date once, here, from the device's IANA zone (LOG-22) — nothing else
// in this codebase ever writes those two columns, and no read path recomputes them (PITFALLS §12).
export async function startSession(input: StartSessionInput = {}): Promise<string> {
  const db = getPowerSync();
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
}

interface Prescription {
  targetSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRirMin: number | null;
  targetRirMax: number | null;
  targetRestSeconds: number | null;
}

const EMPTY_PRESCRIPTION: Prescription = {
  targetSets: null,
  targetRepMin: null,
  targetRepMax: null,
  targetRirMin: null,
  targetRirMax: null,
  targetRestSeconds: null,
};

// Copies the prescription onto the row once, here, and stores routine_exercise_id for
// traceability only — every later read of the prescription reads this snapshot, never
// routine_exercise again (D-05).
export async function addSessionExercise(input: AddSessionExerciseInput): Promise<string> {
  const db = getPowerSync();
  const id = generateClientId();

  let prescription = EMPTY_PRESCRIPTION;
  if (input.routineExerciseId) {
    const [row] = await db
      .select({
        targetSets: routineExercise.targetSets,
        targetRepMin: routineExercise.targetRepMin,
        targetRepMax: routineExercise.targetRepMax,
        targetRirMin: routineExercise.targetRirMin,
        targetRirMax: routineExercise.targetRirMax,
        targetRestSeconds: routineExercise.targetRestSeconds,
      })
      .from(routineExercise)
      .where(eq(routineExercise.id, input.routineExerciseId));
    if (row) prescription = row;
  }

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

export interface LogSetInput {
  sessionExerciseId: string;
  setType?: string;
  weightKg: string;
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
export async function logSet(input: LogSetInput): Promise<string> {
  const db = getPowerSync();
  const id = generateClientId();

  const [maxRow] = await db
    .select({ maxIndex: sql<number | null>`max(${loggedSet.setIndex})` })
    .from(loggedSet)
    .where(eq(loggedSet.sessionExerciseId, input.sessionExerciseId));
  const setIndex = (maxRow?.maxIndex ?? 0) + 1;

  await db.insert(loggedSet).values({
    id,
    sessionExerciseId: input.sessionExerciseId,
    setIndex,
    setType: input.setType ?? 'normal',
    weightKg: input.weightKg,
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
