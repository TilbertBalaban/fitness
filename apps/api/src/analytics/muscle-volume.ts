import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type {
  MuscleVolumeCell,
  MuscleVolumeExerciseInput,
  MuscleVolumeSessionInput,
  MuscleVolumeSetInput,
} from '@fitness/analytics-engine';
import type { Database } from '../db/drizzle.module';
import { exerciseMuscleMapping } from '../db/schema/catalog';
import { workoutSession, sessionExercise, loggedSet } from '../db/schema/session';
import { muscleVolumeRollup, rollupId } from '../db/schema/analytics';

// Accepts either the pool-backed Database or the transaction handle db.transaction hands its
// callback (conflict-log.ts's own QueryExecutor establishes this narrowing) — widened here to
// also include `delete`, which writeRollupCells needs for its delete-then-insert.
type QueryExecutor = Pick<Database, 'select' | 'insert' | 'delete'>;

// weight_kg and weight_factor arrive as Drizzle decimal strings — parsed once, at this one
// boundary, with a non-finite result dropped rather than coerced into a silent NaN (T-10-03).
function parseFiniteNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Four selects regardless of row counts — never a query per session, per exercise or per set.
export async function loadSessionsForDates(
  tx: QueryExecutor,
  userId: string,
  localDates: string[],
): Promise<MuscleVolumeSessionInput[]> {
  if (localDates.length === 0) return [];

  const sessions = await tx
    .select({ id: workoutSession.id, localDate: workoutSession.localDate })
    .from(workoutSession)
    .where(
      and(
        eq(workoutSession.userId, userId),
        eq(workoutSession.status, 'completed'),
        inArray(workoutSession.localDate, localDates),
      ),
    );

  const sessionIds = sessions.map((session) => session.id);
  const sessionExercises = sessionIds.length
    ? await tx
        .select({ id: sessionExercise.id, sessionId: sessionExercise.sessionId, exerciseId: sessionExercise.exerciseId })
        .from(sessionExercise)
        .where(and(inArray(sessionExercise.sessionId, sessionIds), isNull(sessionExercise.removedAt)))
    : [];

  const sessionExerciseIds = sessionExercises.map((row) => row.id);
  const loggedSets = sessionExerciseIds.length
    ? await tx
        .select({
          sessionExerciseId: loggedSet.sessionExerciseId,
          setType: loggedSet.setType,
          completed: loggedSet.completed,
          weightKg: loggedSet.weightKg,
          reps: loggedSet.reps,
        })
        .from(loggedSet)
        .where(inArray(loggedSet.sessionExerciseId, sessionExerciseIds))
    : [];

  const exerciseIds = [...new Set(sessionExercises.map((row) => row.exerciseId))];
  const mappings = exerciseIds.length
    ? await tx
        .select({
          exerciseId: exerciseMuscleMapping.exerciseId,
          muscleGroupId: exerciseMuscleMapping.muscleGroupId,
          weightFactor: exerciseMuscleMapping.weightFactor,
        })
        .from(exerciseMuscleMapping)
        .where(inArray(exerciseMuscleMapping.exerciseId, exerciseIds))
    : [];

  const mappingsByExerciseId = new Map<string, { muscleGroupId: string; weightFactor: number }[]>();
  for (const row of mappings) {
    const weightFactor = parseFiniteNumber(row.weightFactor);
    if (weightFactor === null) continue;
    const list = mappingsByExerciseId.get(row.exerciseId) ?? [];
    list.push({ muscleGroupId: row.muscleGroupId, weightFactor });
    mappingsByExerciseId.set(row.exerciseId, list);
  }

  const setsBySessionExerciseId = new Map<string, MuscleVolumeSetInput[]>();
  for (const row of loggedSets) {
    const list = setsBySessionExerciseId.get(row.sessionExerciseId) ?? [];
    list.push({
      setType: row.setType as MuscleVolumeSetInput['setType'],
      completed: row.completed,
      weightKg: parseFiniteNumber(row.weightKg),
      reps: row.reps,
    });
    setsBySessionExerciseId.set(row.sessionExerciseId, list);
  }

  const exercisesBySessionId = new Map<string, MuscleVolumeExerciseInput[]>();
  for (const row of sessionExercises) {
    const list = exercisesBySessionId.get(row.sessionId) ?? [];
    list.push({
      exerciseId: row.exerciseId,
      muscleMappings: mappingsByExerciseId.get(row.exerciseId) ?? [],
      sets: setsBySessionExerciseId.get(row.id) ?? [],
    });
    exercisesBySessionId.set(row.sessionId, list);
  }

  return sessions.map((session) => ({
    sessionId: session.id,
    localDate: session.localDate,
    exercises: exercisesBySessionId.get(session.id) ?? [],
  }));
}

// Delete-then-insert over the affected dates is what makes a vacated cell disappear instead of
// lingering, and keeps the statement count invariant in the number of cells rather than in how
// many rows previously existed.
export async function writeRollupCells(
  tx: QueryExecutor,
  userId: string,
  localDates: string[],
  cells: MuscleVolumeCell[],
): Promise<void> {
  if (localDates.length === 0) return;

  await tx
    .delete(muscleVolumeRollup)
    .where(and(eq(muscleVolumeRollup.userId, userId), inArray(muscleVolumeRollup.localDate, localDates)));

  if (cells.length === 0) return;

  await tx.insert(muscleVolumeRollup).values(
    cells.map((cell) => ({
      id: rollupId(userId, cell.muscleGroupId, cell.localDate),
      userId,
      muscleGroupId: cell.muscleGroupId,
      localDate: cell.localDate,
      weightedVolumeKg: cell.weightedVolumeKg.toString(),
      weightedSets: cell.weightedSets.toString(),
      setCount: cell.setCount,
      serverSeq: sql`nextval('sync_seq')`,
    })),
  );
}
