import { eq, inArray } from 'drizzle-orm';
import { WORKOUT_SESSION_STATUSES } from '@fitness/api-contracts';
import { ensureDefaultEquipmentProfile } from './equipment-profiles';
import { addSessionExercise, startSession } from './log-set';
import { getPowerSync, type WriteDb } from './powersync';
import { workoutSession } from './schema';

// Destructured once, by position, rather than referenced as bare quoted status literals anywhere
// below — a source scan for any of the four WORKOUT_SESSION_STATUSES values finds nothing outside
// this one line (D-09). The tuple is append-only (session.ts's own contract), so these positions
// never shift.
const [IN_PROGRESS_STATUS, PAUSED_STATUS, COMPLETED_STATUS, DISCARDED_STATUS] = WORKOUT_SESSION_STATUSES;
const OPEN_STATUSES = [IN_PROGRESS_STATUS, PAUSED_STATUS];

export interface StartOneOffSessionInput {
  exerciseIds: string[];
  // Optional for the same reason StartWorkoutFromProgramInput.userId is (log-set.ts) — every
  // existing no-user caller keeps stamping equipmentProfileId null.
  userId?: string | null;
  now?: Date;
}

// D-33's second funnel entry point: routineDayId null routes through the exact same startSession
// call startWorkoutFromProgram uses (captureCalendarDay stamps timezone/local_date exactly once,
// inside startSession, never here), and addSessionExercise with no routineExerciseId takes its own
// EMPTY_PRESCRIPTION path — every target column on every session_exercise row lands null, which is
// what makes a one-off's rows render as em dashes rather than invented targets (LOG-02).
export async function startOneOffSession(
  { exerciseIds, userId, now }: StartOneOffSessionInput,
  db: WriteDb = getPowerSync(),
): Promise<string> {
  const equipmentProfileId = userId ? await ensureDefaultEquipmentProfile(userId, db) : null;
  const sessionId = await startSession({ routineDayId: null, equipmentProfileId, now }, db);

  for (const [index, exerciseId] of exerciseIds.entries()) {
    await addSessionExercise({ sessionId, exerciseId, orderIndex: index }, db);
  }

  return sessionId;
}

// D-29: a deliberate pause, distinct from and sharing no state with a crash. Leaves
// accumulated_paused_seconds untouched — that column only ever grows on resume, once the pause's
// own duration is known.
export async function pauseSession(sessionId: string, now: Date = new Date(), db: WriteDb = getPowerSync()): Promise<void> {
  await db
    .update(workoutSession)
    .set({ pausedAt: now.toISOString(), status: PAUSED_STATUS })
    .where(eq(workoutSession.id, sessionId));
}

// A resume with no open pause is a no-op rather than an error (T-05-07-03) — a double-tap or a
// replayed op cannot inflate accumulated_paused_seconds and silently shrink every future duration
// reading.
export async function resumeSession(sessionId: string, now: Date = new Date(), db: WriteDb = getPowerSync()): Promise<void> {
  const [row] = await db
    .select({ pausedAt: workoutSession.pausedAt, accumulatedPausedSeconds: workoutSession.accumulatedPausedSeconds })
    .from(workoutSession)
    .where(eq(workoutSession.id, sessionId));

  if (!row || row.pausedAt === null) return;

  const pausedSeconds = Math.max(0, Math.round((now.getTime() - new Date(row.pausedAt).getTime()) / 1000));

  await db
    .update(workoutSession)
    .set({
      pausedAt: null,
      accumulatedPausedSeconds: row.accumulatedPausedSeconds + pausedSeconds,
      status: IN_PROGRESS_STATUS,
    })
    .where(eq(workoutSession.id, sessionId));
}

// Closes any open pause first, via resumeSession's own no-op-safe logic, so a session finished
// while paused accounts for the final open interval before ended_at is stamped — then clears
// rest_target_at, since a completed session has nothing left to count down.
export async function completeSession(sessionId: string, now: Date = new Date(), db: WriteDb = getPowerSync()): Promise<void> {
  await resumeSession(sessionId, now, db);

  await db
    .update(workoutSession)
    .set({ endedAt: now.toISOString(), status: COMPLETED_STATUS, restTargetAt: null })
    .where(eq(workoutSession.id, sessionId));
}

// A status transition, never a row delete (D-28) — no requirement in this phase asks for a hard
// delete of an abandoned session, and everything already logged stays exactly where it is.
export async function discardSession(sessionId: string, db: WriteDb = getPowerSync()): Promise<void> {
  await db.update(workoutSession).set({ status: DISCARDED_STATUS }).where(eq(workoutSession.id, sessionId));
}

export interface InProgressSessionSummary {
  id: string;
  startedAt: string;
  status: string;
  pausedAt: string | null;
  accumulatedPausedSeconds: number;
}

// The Home banner's own narrow query (D-28): five columns, never the session tree, and no query at
// all for a signed-out render — mirrors loadNextUp/loadLiveSession's cheap early-out rather than
// filtering workout_session by user_id, which is stamped server-side only (D-06) and would make an
// offline-started session invisible to its own banner. At most one open session can exist per
// device; a same-account multi-device double-start takes the most recently started row, the same
// documented v1 gap loadLiveSession already accepts.
export async function loadInProgressSessionSummary(
  userId: string | null,
  db: WriteDb = getPowerSync(),
): Promise<InProgressSessionSummary | null> {
  if (!userId) return null;

  const rows = await db
    .select({
      id: workoutSession.id,
      startedAt: workoutSession.startedAt,
      status: workoutSession.status,
      pausedAt: workoutSession.pausedAt,
      accumulatedPausedSeconds: workoutSession.accumulatedPausedSeconds,
    })
    .from(workoutSession)
    .where(inArray(workoutSession.status, OPEN_STATUSES));

  if (rows.length === 0) return null;

  const [latest] = rows.slice().sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
  return latest;
}
