import { and, eq, gte, inArray } from 'drizzle-orm';
import type { SetType, WorkoutSessionStatus } from '@fitness/api-contracts';
import { getPowerSync, type WriteDb } from './powersync';
import { loggedSet, sessionExercise, workoutSession } from './schema';

const COMPLETED_STATUS: WorkoutSessionStatus = 'completed';

export interface ExerciseHistorySet {
  id: string;
  setType: SetType;
  weightKg: string | null;
  reps: number;
  completed: boolean;
  parentSetId: string | null;
}

export interface ExerciseHistorySession {
  sessionId: string;
  localDate: string;
  sets: ExerciseHistorySet[];
}

export interface LoadExerciseHistoryInput {
  exerciseId: string;
  userId: string | null;
  sinceLocalDate?: string | null;
}

// Two queries, never one per session: the joined session list, then ONE logged_set read over
// exactly those session_exercise ids. A per-session loop is the N+1 shape the sibling readers'
// comments already forbid.
//
// Deliberately applies no set-type or completed filter — the caller's metric chooses the
// population, and exerciseSeries keeps the records and working-volume predicates apart. Filtering
// here would collapse them into whichever one this reader happened to pick.
//
// Deliberately does not filter workout_session.user_id: that column is stamped server-side on sync
// push only, so an offline-completed session carries a null locally. The guard is "is anyone signed
// in at all," exactly as history-query.ts documents.
export async function loadExerciseHistory(
  { exerciseId, userId, sinceLocalDate }: LoadExerciseHistoryInput,
  db: WriteDb = getPowerSync(),
): Promise<ExerciseHistorySession[]> {
  if (!userId) return [];

  const filters = [eq(sessionExercise.exerciseId, exerciseId), eq(workoutSession.status, COMPLETED_STATUS)];
  if (sinceLocalDate) filters.push(gte(workoutSession.localDate, sinceLocalDate));

  const sessionRows = await db
    .select({
      sessionExerciseId: sessionExercise.id,
      sessionId: workoutSession.id,
      localDate: workoutSession.localDate,
    })
    .from(sessionExercise)
    .innerJoin(workoutSession, eq(workoutSession.id, sessionExercise.sessionId))
    .where(and(...filters))
    .orderBy(workoutSession.localDate, workoutSession.id);

  if (sessionRows.length === 0) return [];

  const setRows = await db
    .select({
      id: loggedSet.id,
      sessionExerciseId: loggedSet.sessionExerciseId,
      setIndex: loggedSet.setIndex,
      setType: loggedSet.setType,
      weightKg: loggedSet.weightKg,
      reps: loggedSet.reps,
      completed: loggedSet.completed,
      parentSetId: loggedSet.parentSetId,
    })
    .from(loggedSet)
    .where(
      inArray(
        loggedSet.sessionExerciseId,
        sessionRows.map((row) => row.sessionExerciseId),
      ),
    );

  const setsBySessionExerciseId = new Map<string, ExerciseHistorySet[]>();
  for (const row of setRows) {
    const list = setsBySessionExerciseId.get(row.sessionExerciseId) ?? [];
    list.push({
      id: row.id,
      setType: row.setType as SetType,
      weightKg: row.weightKg,
      reps: row.reps,
      completed: row.completed,
      parentSetId: row.parentSetId,
    });
    setsBySessionExerciseId.set(row.sessionExerciseId, list);
  }

  // One entry per SESSION, not per session_exercise row: the same exercise can appear twice in one
  // session (a superset re-entry, a re-added exercise), and two points on the same date for the
  // same session would read as two workouts.
  const bySessionId = new Map<string, ExerciseHistorySession>();
  for (const row of sessionRows) {
    const existing = bySessionId.get(row.sessionId) ?? { sessionId: row.sessionId, localDate: row.localDate, sets: [] };
    existing.sets.push(...(setsBySessionExerciseId.get(row.sessionExerciseId) ?? []));
    bySessionId.set(row.sessionId, existing);
  }

  return [...bySessionId.values()].sort((a, b) =>
    a.localDate === b.localDate ? a.sessionId.localeCompare(b.sessionId) : a.localDate.localeCompare(b.localDate),
  );
}
