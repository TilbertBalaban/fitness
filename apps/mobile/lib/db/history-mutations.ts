import { eq, inArray } from 'drizzle-orm';
import { addSessionExercise, startSession } from './log-set';
import { setSessionExerciseTargets } from './session-mutations';
import { getPowerSync, type WriteDb, type WriteTx } from './powersync';
import { loggedSet, sessionExercise, workoutSession } from './schema';

// Writes only workout_session.name — an empty or all-whitespace string normalises to null so an
// unnamed session falls back to its historyRowLabel date rendering rather than showing a blank row.
export async function renameSession(sessionId: string, name: string | null, db: WriteDb = getPowerSync()): Promise<void> {
  const trimmed = name?.trim() ?? '';
  await db
    .update(workoutSession)
    .set({ name: trimmed.length > 0 ? trimmed : null })
    .where(eq(workoutSession.id, sessionId));
}

export interface DuplicateSessionInput {
  sourceSessionId: string;
  now?: Date;
}

interface SourceSessionExerciseRow {
  id: string;
  exerciseId: string;
  orderIndex: number;
  supersetGroupId: string | null;
  routineExerciseId: string | null;
  targetSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRir: number | null;
  targetRestSeconds: number | null;
  removedAt: string | null;
}

// D-33's single funnel: the new session is created through startSession — the same call every
// other creation path uses, never a second `insert(workoutSession)` site — so timezone/local_date
// are stamped in exactly one place (D-06). Every session_exercise insert goes through
// addSessionExercise for the same reason (D-33 names it explicitly), even though that function
// recomputes its own prescription from routine_exercise/routine_exercise_cycle_target when a
// routineExerciseId is passed — the immediately-following setSessionExerciseTargets call then
// overwrites those five columns with the SOURCE row's frozen snapshot, which is the prescription
// D-05 promises every later read sees, not whatever routine_exercise holds today. No logged_set
// row is copied: duplicating a workout means doing it again, not claiming you already did it.
export async function duplicateSession(
  { sourceSessionId, now }: DuplicateSessionInput,
  db: WriteDb = getPowerSync(),
): Promise<string> {
  const sourceRows: SourceSessionExerciseRow[] = await db
    .select({
      id: sessionExercise.id,
      exerciseId: sessionExercise.exerciseId,
      orderIndex: sessionExercise.orderIndex,
      supersetGroupId: sessionExercise.supersetGroupId,
      routineExerciseId: sessionExercise.routineExerciseId,
      targetSets: sessionExercise.targetSets,
      targetRepMin: sessionExercise.targetRepMin,
      targetRepMax: sessionExercise.targetRepMax,
      targetRir: sessionExercise.targetRir,
      targetRestSeconds: sessionExercise.targetRestSeconds,
      removedAt: sessionExercise.removedAt,
    })
    .from(sessionExercise)
    .where(eq(sessionExercise.sessionId, sourceSessionId));

  const [source] = await db
    .select({
      routineDayId: workoutSession.routineDayId,
      equipmentProfileId: workoutSession.equipmentProfileId,
      deviceId: workoutSession.deviceId,
    })
    .from(workoutSession)
    .where(eq(workoutSession.id, sourceSessionId));

  const newSessionId = await startSession(
    {
      routineDayId: source?.routineDayId ?? null,
      equipmentProfileId: source?.equipmentProfileId ?? null,
      deviceId: source?.deviceId ?? null,
      now,
    },
    db,
  );

  const remaining = sourceRows.filter((row) => row.removedAt === null).sort((a, b) => a.orderIndex - b.orderIndex);

  for (const row of remaining) {
    const newSessionExerciseId = await addSessionExercise(
      {
        sessionId: newSessionId,
        exerciseId: row.exerciseId,
        orderIndex: row.orderIndex,
        supersetGroupId: row.supersetGroupId,
        routineExerciseId: row.routineExerciseId,
      },
      db,
    );

    await setSessionExerciseTargets(
      newSessionExerciseId,
      {
        targetSets: row.targetSets,
        targetRepMin: row.targetRepMin,
        targetRepMax: row.targetRepMax,
        targetRir: row.targetRir,
        targetRestSeconds: row.targetRestSeconds,
      },
      db,
    );
  }

  return newSessionId;
}

// The three deletes run inside ONE local transaction (T-05-09-02): an interruption between them
// can never leave a logged_set row pointing at a removed session_exercise, or a session_exercise
// row pointing at a removed session. Order is children-first purely for referential tidiness — the
// transaction is what makes it all-or-nothing, not the order.
export async function deleteSession(sessionId: string, db: WriteDb = getPowerSync()): Promise<void> {
  await db.transaction(async (tx: WriteTx) => {
    const exerciseRows = await tx
      .select({ id: sessionExercise.id })
      .from(sessionExercise)
      .where(eq(sessionExercise.sessionId, sessionId));
    const exerciseIds = exerciseRows.map((row) => row.id);

    if (exerciseIds.length > 0) {
      await tx.delete(loggedSet).where(inArray(loggedSet.sessionExerciseId, exerciseIds));
    }
    await tx.delete(sessionExercise).where(eq(sessionExercise.sessionId, sessionId));
    await tx.delete(workoutSession).where(eq(workoutSession.id, sessionId));
  });
}
