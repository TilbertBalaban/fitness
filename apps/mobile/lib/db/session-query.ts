import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { WORKING_SET_TYPE, WORKOUT_SESSION_STATUSES } from '@fitness/api-contracts';
import { getPowerSync, type WriteDb } from './powersync';
import { loadExerciseNameMap } from './programs/load-program';
import { loggedSet, sessionExercise, workoutSession } from './schema';

// D-09: destructured by position, never re-quoted as a bare string literal below (mirrors
// session-lifecycle.ts's own OPEN_STATUSES) — a paused session is still the live session (D-29's
// pause is a status transition, not a departure from "in progress"), so loadLiveSession must find
// it by either status, never IN_PROGRESS alone.
const [IN_PROGRESS_STATUS, PAUSED_STATUS] = WORKOUT_SESSION_STATUSES;
const LIVE_STATUSES = [IN_PROGRESS_STATUS, PAUSED_STATUS];

export interface SessionExerciseRow {
  id: string;
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  orderIndex: number;
  supersetGroupId: string | null;
  routineExerciseId: string | null;
  notes: string | null;
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
  notes: string | null;
}

export interface LiveSessionRow {
  id: string;
  routineDayId: string | null;
  // The program cycle this session was started against, read back exactly as startSession stamped
  // it — never recomputed here (LOG-15, D-06). Feeds TargetsSheet's write-back resolution at both
  // screen call sites so a restored session (force-quit, relaunch) still resolves against the
  // cycle it actually started in.
  cycleId: string | null;
  status: string;
  startedAt: string;
  pausedAt: string | null;
  accumulatedPausedSeconds: number;
  restTargetAt: string | null;
  // Read by 05-10's editing screen (the header line and SessionDateField's current value) — carried
  // here rather than a second query, since loadSessionTree already selects this session's one row.
  timezone: string;
  localDate: string;
  // The session-level note (LOG-16) — read back the same way SessionExerciseRow.notes already is,
  // one table up. Feeds the session Menu's "Session Note" row and its dot.
  notes: string | null;
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
      cycleId: workoutSession.cycleId,
      status: workoutSession.status,
      startedAt: workoutSession.startedAt,
      pausedAt: workoutSession.pausedAt,
      accumulatedPausedSeconds: workoutSession.accumulatedPausedSeconds,
      restTargetAt: workoutSession.restTargetAt,
      timezone: workoutSession.timezone,
      localDate: workoutSession.localDate,
      notes: workoutSession.notes,
    })
    .from(workoutSession)
    .where(eq(workoutSession.id, sessionId));

  if (!sessionRow) return null;

  // removed_at IS NULL — a removed exercise (LOG-14/T-05-06-03) drops out of the live strip and
  // pager here, the one read this whole session-query module funnels through for both; the finish
  // summary and history detail (not yet built) read past this filter, per removeSessionExercise's
  // own documented promise in session-mutations.ts.
  const exerciseRows = await db
    .select({
      id: sessionExercise.id,
      sessionId: sessionExercise.sessionId,
      exerciseId: sessionExercise.exerciseId,
      orderIndex: sessionExercise.orderIndex,
      supersetGroupId: sessionExercise.supersetGroupId,
      routineExerciseId: sessionExercise.routineExerciseId,
      notes: sessionExercise.notes,
      targetSets: sessionExercise.targetSets,
      targetRepMin: sessionExercise.targetRepMin,
      targetRepMax: sessionExercise.targetRepMax,
      targetRir: sessionExercise.targetRir,
      targetRestSeconds: sessionExercise.targetRestSeconds,
    })
    .from(sessionExercise)
    .where(and(eq(sessionExercise.sessionId, sessionId), isNull(sessionExercise.removedAt)))
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
          notes: loggedSet.notes,
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
    .where(inArray(workoutSession.status, LIVE_STATUSES));

  if (rows.length === 0) return null;

  const [latest] = rows
    .slice()
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));

  return loadSessionTree(latest.id, db);
}

export interface PreviousSetReference {
  weightKg: string | null;
  reps: number;
  sessionId: string;
  loggedAt: string;
}

// set_index position never implies set_type (RESEARCH.md Pitfall 2) — warm-up rows are excluded
// from every reference lookup below by filtering on this literal, not by index range.
const WORKING_SET_TYPE_EXCLUSION = 'warmup';

interface PickableSetRow {
  sessionExerciseId: string;
  loggedAt: string;
  id: string;
}

// Deterministic tie-break shared by previousSetReference and previousSetReferencesForSession:
// greater started_at wins; a tie resolves by greater logged_at; a remaining tie resolves by the
// greater id. Factored once so the two functions can never drift onto different orderings.
function pickMostRecent<T extends PickableSetRow>(
  rows: T[],
  sessionIdBySessionExerciseId: Map<string, string>,
  startedAtBySessionId: Map<string, string>,
): T {
  const [winner] = rows.slice().sort((a, b) => {
    const startedAtA = startedAtBySessionId.get(sessionIdBySessionExerciseId.get(a.sessionExerciseId) ?? '') ?? '';
    const startedAtB = startedAtBySessionId.get(sessionIdBySessionExerciseId.get(b.sessionExerciseId) ?? '') ?? '';
    if (startedAtA !== startedAtB) return startedAtA < startedAtB ? 1 : -1;
    if (a.loggedAt !== b.loggedAt) return a.loggedAt < b.loggedAt ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
  return winner;
}

export interface PreviousSetReferenceInput {
  exerciseId: string;
  setIndex: number;
  beforeSessionId: string;
  userId: string | null;
}

// D-16's one named history-lookup function — read by the row, by the summary's did-you-beat-it
// comparison, and later replaced wholesale by Phase 8's recommendation, so keeping every prefill
// caller behind this one call site is what makes that swap a single-function change.
//
// Resolves the most recent PRIOR session's logged_set row for this exercise at the SAME
// set_index — never `ORDER BY logged_at DESC LIMIT 1` across every set (RESEARCH.md Pitfall 1),
// which would make set 3 prefill from whatever set was most recently touched, regardless of its
// position. Deliberately does not filter workout_session by user_id — mirrors loadLiveSession's
// own documented reasoning: the local database holds one account's data at a time, and a session
// old enough to be "previous" has almost always already synced by the time a new one starts, but
// a user_id filter would still make a rare, fully-offline multi-session history invisible to
// itself, the exact failure mode Task 1 already fixed once for the live session itself. userId is
// kept only as the same early-return guard every other reader in this file uses.
export async function previousSetReference(
  { exerciseId, setIndex, beforeSessionId, userId }: PreviousSetReferenceInput,
  db: WriteDb = getPowerSync(),
): Promise<PreviousSetReference | null> {
  if (!userId) return null;

  const candidateExercises = await db
    .select({ id: sessionExercise.id, sessionId: sessionExercise.sessionId })
    .from(sessionExercise)
    .where(eq(sessionExercise.exerciseId, exerciseId));

  const priorCandidates = candidateExercises.filter((row) => row.sessionId !== beforeSessionId);
  if (priorCandidates.length === 0) return null;

  const sessionRows = await db
    .select({ id: workoutSession.id, startedAt: workoutSession.startedAt })
    .from(workoutSession)
    .where(inArray(workoutSession.id, priorCandidates.map((row) => row.sessionId)));
  const startedAtBySessionId = new Map(sessionRows.map((row) => [row.id, row.startedAt]));
  const sessionIdBySessionExerciseId = new Map(priorCandidates.map((row) => [row.id, row.sessionId]));

  const setRows = await db
    .select({
      id: loggedSet.id,
      sessionExerciseId: loggedSet.sessionExerciseId,
      weightKg: loggedSet.weightKg,
      reps: loggedSet.reps,
      loggedAt: loggedSet.loggedAt,
    })
    .from(loggedSet)
    .where(
      and(
        inArray(
          loggedSet.sessionExerciseId,
          priorCandidates.map((row) => row.id),
        ),
        eq(loggedSet.setIndex, setIndex),
        ne(loggedSet.setType, WORKING_SET_TYPE_EXCLUSION),
      ),
    );

  if (setRows.length === 0) return null;

  const winner = pickMostRecent(setRows, sessionIdBySessionExerciseId, startedAtBySessionId);
  const sessionId = sessionIdBySessionExerciseId.get(winner.sessionExerciseId) ?? '';

  return { weightKg: winner.weightKg, reps: winner.reps, sessionId, loggedAt: winner.loggedAt };
}

export type PreviousSetReferenceMap = Record<string, PreviousSetReference>;

export function referenceKey(sessionExerciseId: string, setIndex: number): string {
  return `${sessionExerciseId}:${setIndex}`;
}

// Resolves every row of the open session in one batched pass — every existing set shows its own
// same-set_index comparison beneath it (05-UI-SPEC §Set Row), and the trailing draft row needs one
// more for the next set_index, so the screen calls this once per session load rather than calling
// previousSetReference once per row inside a render loop (PITFALLS §13).
export async function previousSetReferencesForSession(
  sessionId: string,
  db: WriteDb = getPowerSync(),
): Promise<PreviousSetReferenceMap> {
  const exerciseRows = await db
    .select({ id: sessionExercise.id, exerciseId: sessionExercise.exerciseId })
    .from(sessionExercise)
    .where(eq(sessionExercise.sessionId, sessionId));
  if (exerciseRows.length === 0) return {};

  const existingSets = await db
    .select({ sessionExerciseId: loggedSet.sessionExerciseId, setIndex: loggedSet.setIndex })
    .from(loggedSet)
    .where(
      inArray(
        loggedSet.sessionExerciseId,
        exerciseRows.map((row) => row.id),
      ),
    );

  const indicesBySessionExerciseId = new Map<string, Set<number>>();
  for (const row of exerciseRows) indicesBySessionExerciseId.set(row.id, new Set([1]));
  for (const row of existingSets) {
    const indices = indicesBySessionExerciseId.get(row.sessionExerciseId) ?? new Set<number>();
    indices.add(row.setIndex);
    indices.add(row.setIndex + 1);
    indicesBySessionExerciseId.set(row.sessionExerciseId, indices);
  }

  const exerciseIds = [...new Set(exerciseRows.map((row) => row.exerciseId))];
  const priorExerciseRows = await db
    .select({ id: sessionExercise.id, sessionId: sessionExercise.sessionId, exerciseId: sessionExercise.exerciseId })
    .from(sessionExercise)
    .where(inArray(sessionExercise.exerciseId, exerciseIds));
  const priorCandidates = priorExerciseRows.filter((row) => row.sessionId !== sessionId);
  if (priorCandidates.length === 0) return {};

  const priorSessionRows = await db
    .select({ id: workoutSession.id, startedAt: workoutSession.startedAt })
    .from(workoutSession)
    .where(
      inArray(
        workoutSession.id,
        [...new Set(priorCandidates.map((row) => row.sessionId))],
      ),
    );
  const startedAtBySessionId = new Map(priorSessionRows.map((row) => [row.id, row.startedAt]));
  const sessionIdByPriorExerciseId = new Map(priorCandidates.map((row) => [row.id, row.sessionId]));
  const exerciseIdByPriorExerciseId = new Map(priorCandidates.map((row) => [row.id, row.exerciseId]));

  const priorSetRows = await db
    .select({
      id: loggedSet.id,
      sessionExerciseId: loggedSet.sessionExerciseId,
      setIndex: loggedSet.setIndex,
      weightKg: loggedSet.weightKg,
      reps: loggedSet.reps,
      loggedAt: loggedSet.loggedAt,
    })
    .from(loggedSet)
    .where(
      and(
        inArray(
          loggedSet.sessionExerciseId,
          priorCandidates.map((row) => row.id),
        ),
        ne(loggedSet.setType, WORKING_SET_TYPE_EXCLUSION),
      ),
    );

  const result: PreviousSetReferenceMap = {};
  for (const row of exerciseRows) {
    const indices = indicesBySessionExerciseId.get(row.id) ?? new Set<number>();
    for (const setIndex of indices) {
      const candidates = priorSetRows.filter(
        (setRow) => setRow.setIndex === setIndex && exerciseIdByPriorExerciseId.get(setRow.sessionExerciseId) === row.exerciseId,
      );
      if (candidates.length === 0) continue;

      const winner = pickMostRecent(candidates, sessionIdByPriorExerciseId, startedAtBySessionId);
      const winnerSessionId = sessionIdByPriorExerciseId.get(winner.sessionExerciseId) ?? '';
      result[referenceKey(row.id, setIndex)] = {
        weightKg: winner.weightKg,
        reps: winner.reps,
        sessionId: winnerSessionId,
        loggedAt: winner.loggedAt,
      };
    }
  }

  return result;
}

export interface DefaultWarmupWorkingWeightInput {
  sessionExerciseId: string;
  exerciseId: string;
  beforeSessionId: string;
  userId: string | null;
}

// The Warm-up sheet's working-weight default (LOG-17): the exercise's own first logged working
// set in THIS session if one exists, else the D-16 cross-session same-position prefill
// previousSetReference already resolves for set 1, else null (the sheet's own required-field
// case). Never percentage/rounding arithmetic — this only resolves WHICH weight
// @fitness/pr-rules's warmupSets() scales off.
export async function defaultWarmupWorkingWeightKg(
  { sessionExerciseId, exerciseId, beforeSessionId, userId }: DefaultWarmupWorkingWeightInput,
  db: WriteDb = getPowerSync(),
): Promise<string | null> {
  const workingRows = await db
    .select({ setIndex: loggedSet.setIndex, weightKg: loggedSet.weightKg })
    .from(loggedSet)
    .where(and(eq(loggedSet.sessionExerciseId, sessionExerciseId), eq(loggedSet.setType, WORKING_SET_TYPE)));

  const [firstWorking] = workingRows.slice().sort((a, b) => a.setIndex - b.setIndex);
  if (firstWorking?.weightKg) return firstWorking.weightKg;

  const reference = await previousSetReference({ exerciseId, setIndex: 1, beforeSessionId, userId }, db);
  return reference?.weightKg ?? null;
}
