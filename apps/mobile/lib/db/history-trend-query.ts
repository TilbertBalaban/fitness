import { and, eq, gte, inArray } from 'drizzle-orm';
import { rollingWindowStart, TREND_BUCKET_DAYS, TREND_WEEKS, type TrendSessionInput } from '@fitness/analytics-engine';
import type { SetType, WorkoutSessionStatus } from '@fitness/api-contracts';
import { getPowerSync, type WriteDb } from './powersync';
import { loggedSet, sessionExercise, workoutSession } from './schema';

const COMPLETED_STATUS: WorkoutSessionStatus = 'completed';

// Exactly the shape historyTrendSeries declares, aliased rather than re-declared: a second
// structurally-identical interface here would let the two drift apart silently, and the whole
// value of this reader is that it hands the pure layer something it already understands.
export type HistoryTrendData = TrendSessionInput[];

export interface LoadHistoryTrendInput {
  userId: string | null;
  todayLocalDate: string;
}

// The window's first day, derived backwards from the supplied day (D-10) and sized entirely by the
// package's own constants (R21) — the trend's bucket count times its bucket size. Exported so the
// span is asserted directly rather than inferred from a query's bound parameter.
export function historyTrendWindowStart(todayLocalDate: string): string {
  return rollingWindowStart(todayLocalDate, TREND_WEEKS * TREND_BUCKET_DAYS);
}

// Three queries, never one per session: the completed sessions inside the window, their
// session_exercise rows, then ONE logged_set read over exactly those ids. A per-session loop is the
// N+1 shape every sibling reader's comment already forbids.
//
// Every set row is returned UNFILTERED — warm-ups, drop-set children and incomplete rows included.
// The trend's volume metric counts drop-set children and its set count does not, so a filter here
// would force one of the two answers to be wrong; only the pure layer knows which metric is being
// asked for, and it is the single place the two populations are kept apart.
//
// Deliberately does not filter workout_session.user_id: that column is stamped server-side on sync
// push only, so an offline-completed session carries a null locally. The guard is "is anyone signed
// in at all", exactly as history-query.ts documents.
export async function loadHistoryTrend(
  { userId, todayLocalDate }: LoadHistoryTrendInput,
  db: WriteDb = getPowerSync(),
): Promise<HistoryTrendData> {
  if (!userId) return [];

  const sessionRows = await db
    .select({ sessionId: workoutSession.id, localDate: workoutSession.localDate })
    .from(workoutSession)
    .where(
      and(
        eq(workoutSession.status, COMPLETED_STATUS),
        gte(workoutSession.localDate, historyTrendWindowStart(todayLocalDate)),
      ),
    )
    .orderBy(workoutSession.localDate, workoutSession.id);

  if (sessionRows.length === 0) return [];

  const sessions: HistoryTrendData = sessionRows.map((row) => ({
    sessionId: row.sessionId,
    localDate: row.localDate,
    sets: [],
  }));
  const sessionsById = new Map(sessions.map((session) => [session.sessionId, session]));

  const exerciseRows = await db
    .select({ id: sessionExercise.id, sessionId: sessionExercise.sessionId })
    .from(sessionExercise)
    .where(
      inArray(
        sessionExercise.sessionId,
        sessionRows.map((row) => row.sessionId),
      ),
    );

  if (exerciseRows.length === 0) return sessions;

  const setRows = await db
    .select({
      id: loggedSet.id,
      sessionExerciseId: loggedSet.sessionExerciseId,
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
        exerciseRows.map((row) => row.id),
      ),
    );

  const sessionIdByExerciseId = new Map(exerciseRows.map((row) => [row.id, row.sessionId]));

  for (const row of setRows) {
    const sessionId = sessionIdByExerciseId.get(row.sessionExerciseId);
    if (sessionId === undefined) continue;
    sessionsById.get(sessionId)?.sets.push({
      id: row.id,
      setType: row.setType as SetType,
      weightKg: row.weightKg,
      reps: row.reps,
      completed: row.completed,
      parentSetId: row.parentSetId,
    });
  }

  return sessions;
}
