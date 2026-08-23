import { eq, inArray } from 'drizzle-orm';
import { getPowerSync, type WriteDb } from './powersync';
import { loadExerciseNameMap } from './programs/load-program';
import { loggedSet, sessionExercise, workoutSession } from './schema';

const IN_PROGRESS = 'in_progress';

export interface SessionExerciseRow {
  id: string;
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  orderIndex: number;
  supersetGroupId: string | null;
  targetSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRir: number | null;
  targetRestSeconds: number | null;
}

export interface LoggedSetRow {
  id: string;
  sessionExerciseId: string;
  setIndex: number;
  setType: string;
  weightKg: string | null;
  reps: number;
  rir: number | null;
  completed: boolean;
  loggedAt: string;
}

export interface LiveSessionRow {
  id: string;
  routineDayId: string | null;
  status: string;
  startedAt: string;
}

export interface LiveSessionData {
  session: LiveSessionRow;
  exercises: SessionExerciseRow[];
  setsByExerciseId: Record<string, LoggedSetRow[]>;
}

// The batched read path this screen (and every later plan that reads a live session) shares —
// three selects here, never a query inside a loop over exercises. Exercise names are resolved
// through loadExerciseNameMap (load-program.ts's own union of the localOnly seeded catalog and
// the synced custom-exercise table) rather than a fourth select against `exercise` alone, which
// would silently render "Unknown exercise" for every seeded-catalog exercise — the overwhelming
// majority of real sessions (PITFALLS §13 discipline is about query COUNT, not about which table
// a name happens to live in).
export async function loadSessionTree(
  sessionId: string,
  db: WriteDb = getPowerSync(),
): Promise<LiveSessionData | null> {
  const [sessionRow] = await db
    .select({
      id: workoutSession.id,
      routineDayId: workoutSession.routineDayId,
      status: workoutSession.status,
      startedAt: workoutSession.startedAt,
    })
    .from(workoutSession)
    .where(eq(workoutSession.id, sessionId));

  if (!sessionRow) return null;

  const exerciseRows = await db
    .select({
      id: sessionExercise.id,
      sessionId: sessionExercise.sessionId,
      exerciseId: sessionExercise.exerciseId,
      orderIndex: sessionExercise.orderIndex,
      supersetGroupId: sessionExercise.supersetGroupId,
      targetSets: sessionExercise.targetSets,
      targetRepMin: sessionExercise.targetRepMin,
      targetRepMax: sessionExercise.targetRepMax,
      targetRir: sessionExercise.targetRir,
      targetRestSeconds: sessionExercise.targetRestSeconds,
    })
    .from(sessionExercise)
    .where(eq(sessionExercise.sessionId, sessionId))
    .orderBy(sessionExercise.orderIndex);

  const sessionExerciseIds = exerciseRows.map((row) => row.id);
  const setRows = sessionExerciseIds.length
    ? await db
        .select({
          id: loggedSet.id,
          sessionExerciseId: loggedSet.sessionExerciseId,
          setIndex: loggedSet.setIndex,
          setType: loggedSet.setType,
          weightKg: loggedSet.weightKg,
          reps: loggedSet.reps,
          rir: loggedSet.rir,
          completed: loggedSet.completed,
          loggedAt: loggedSet.loggedAt,
        })
        .from(loggedSet)
        .where(inArray(loggedSet.sessionExerciseId, sessionExerciseIds))
    : [];

  const names = await loadExerciseNameMap(db);

  const setsByExerciseId = new Map<string, LoggedSetRow[]>();
  for (const row of setRows) {
    const forExercise = setsByExerciseId.get(row.sessionExerciseId) ?? [];
    forExercise.push(row);
    setsByExerciseId.set(row.sessionExerciseId, forExercise);
  }
  for (const rows of setsByExerciseId.values()) {
    rows.sort((a, b) => a.setIndex - b.setIndex);
  }

  const exercises: SessionExerciseRow[] = exerciseRows.map((row) => ({
    ...row,
    exerciseName: names.get(row.exerciseId) ?? 'Unknown exercise',
  }));

  return {
    session: sessionRow,
    exercises,
    setsByExerciseId: Object.fromEntries(setsByExerciseId),
  };
}

// The one open session on this device, or null — mirrors loadNextUp's cost-nothing early-out for
// a signed-out render, but deliberately does NOT filter by workout_session.user_id: that column
// is stamped server-side on sync push only (sync.service.ts's toWorkoutSessionValues — "userId
// always comes from the session, never from data"), so a session started this instant, still
// offline, carries a null user_id locally. Filtering on it here would make D-01's "durable and
// resumable with no signal" false the moment it mattered most. The local database holds one
// account's data at a time, so status alone identifies "my" open session; if two devices on the
// same account both start one offline, taking the most recently started row is a deliberate,
// documented v1 gap (RESEARCH.md's same-device double-start guard belongs to a later plan's
// startSession call site, not this reader).
export async function loadLiveSession(
  userId: string | null,
  db: WriteDb = getPowerSync(),
): Promise<LiveSessionData | null> {
  if (!userId) return null;

  const rows = await db
    .select({ id: workoutSession.id, startedAt: workoutSession.startedAt })
    .from(workoutSession)
    .where(eq(workoutSession.status, IN_PROGRESS));

  if (rows.length === 0) return null;

  const [latest] = rows
    .slice()
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));

  return loadSessionTree(latest.id, db);
}
