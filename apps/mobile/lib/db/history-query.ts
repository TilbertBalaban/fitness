import { and, countDistinct, desc, eq, inArray, lt, notInArray, or, sql } from 'drizzle-orm';
import { WORKING_VOLUME_EXCLUDED_SET_TYPES, type WorkoutSessionStatus } from '@fitness/api-contracts';
import { getPowerSync, type WriteDb } from './powersync';
import { loggedSet, sessionExercise, workoutSession } from './schema';

const COMPLETED_STATUS: WorkoutSessionStatus = 'completed';

export interface HistorySessionRow {
  id: string;
  name: string | null;
  localDate: string;
  startedAt: string;
  endedAt: string | null;
  accumulatedPausedSeconds: number;
  exerciseCount: number;
  completedSetCount: number;
}

export interface HistoryCursor {
  startedAt: string;
  id: string;
}

export interface HistoryPage {
  rows: HistorySessionRow[];
  nextCursor: HistoryCursor | null;
}

export interface LoadHistoryPageInput {
  userId: string | null;
  limit: number;
  cursor?: HistoryCursor | null;
}

const EMPTY_PAGE: HistoryPage = { rows: [], nextCursor: null };

// Two queries, never one per row (PITFALLS §13, LOG-20): a keyset-paginated page of
// workout_session rows, then ONE grouped aggregate over exactly that page's session ids. A
// discarded session is excluded (the user explicitly threw it away) and an in-progress/paused one
// is excluded (it lives on the Home banner per D-28 until it is finished or discarded) — the
// remaining `status = 'completed'` filter is the whole shown/hidden rule for this list.
//
// The cursor is the (started_at, id) pair, never an OFFSET: an OFFSET counts rows from the top of
// the CURRENT result set on every call, so a session inserted between two page fetches shifts
// every row after it by one position, silently duplicating or skipping a row at the page boundary.
// A keyset cursor names the last row already seen and asks only for rows strictly after it in the
// same (started_at DESC, id DESC) order, which a new row can never retroactively satisfy for a
// page already returned.
//
// Deliberately does not add a `workout_session.user_id` filter: that column is stamped
// server-side on sync push only (session-query.ts's loadLiveSession/previousSetReference), so an
// offline-completed session can carry a null user_id locally. This mirrors every other reader in
// this module family — the guard is "is anyone signed in at all," not a per-row ownership filter,
// because the local database holds one account's data at a time.
export async function loadHistoryPage(
  { userId, limit, cursor }: LoadHistoryPageInput,
  db: WriteDb = getPowerSync(),
): Promise<HistoryPage> {
  if (!userId) return EMPTY_PAGE;

  const statusFilter = eq(workoutSession.status, COMPLETED_STATUS);
  const whereClause = cursor
    ? and(
        statusFilter,
        or(
          lt(workoutSession.startedAt, cursor.startedAt),
          and(eq(workoutSession.startedAt, cursor.startedAt), lt(workoutSession.id, cursor.id)),
        ),
      )
    : statusFilter;

  const pageRows = await db
    .select({
      id: workoutSession.id,
      name: workoutSession.name,
      localDate: workoutSession.localDate,
      startedAt: workoutSession.startedAt,
      endedAt: workoutSession.endedAt,
      accumulatedPausedSeconds: workoutSession.accumulatedPausedSeconds,
    })
    .from(workoutSession)
    .where(whereClause)
    .orderBy(desc(workoutSession.startedAt), desc(workoutSession.id))
    .limit(limit);

  if (pageRows.length === 0) return EMPTY_PAGE;

  const sessionIds = pageRows.map((row) => row.id);

  // A removed exercise (session_exercise.removed_at) is NOT filtered out here — removal never
  // destroyed its logged sets (05-06), and the user did those sets, so they still count.
  const completedWorkingSet = and(eq(loggedSet.completed, true), notInArray(loggedSet.setType, WORKING_VOLUME_EXCLUDED_SET_TYPES));
  const countRows = await db
    .select({
      sessionId: sessionExercise.sessionId,
      exerciseCount: countDistinct(sessionExercise.id),
      completedSetCount: sql<number>`count(case when ${completedWorkingSet} then 1 end)`,
    })
    .from(sessionExercise)
    .leftJoin(loggedSet, eq(loggedSet.sessionExerciseId, sessionExercise.id))
    .where(inArray(sessionExercise.sessionId, sessionIds))
    .groupBy(sessionExercise.sessionId);

  const countsBySessionId = new Map(countRows.map((row) => [row.sessionId, row]));

  const rows: HistorySessionRow[] = pageRows.map((row) => {
    const counts = countsBySessionId.get(row.id);
    return {
      ...row,
      exerciseCount: counts?.exerciseCount ?? 0,
      completedSetCount: counts?.completedSetCount ?? 0,
    };
  });

  const last = pageRows[pageRows.length - 1];
  const nextCursor = pageRows.length === limit ? { startedAt: last.startedAt, id: last.id } : null;

  return { rows, nextCursor };
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_ABBREVIATIONS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Formats the stamped local_date string directly — split-and-index arithmetic on the "YYYY-MM-DD"
// string plus a UTC-anchored Date used only for its day-of-week table lookup, never a call that
// resolves the READING device's timezone (D-06, PITFALLS §12). `new Date(year, month, day)` or a
// `toLocaleDateString` call here would silently re-derive the day from the device's own clock and
// zone, which is exactly the recomputation this function exists to avoid — the label must render
// identically no matter which timezone happens to open the app.
function formatHistoryDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAY_NAMES[weekdayIndex]}, ${MONTH_ABBREVIATIONS[month - 1]} ${day}`;
}

// The session's name when set, otherwise its formatted local_date — so an unnamed session never
// renders a blank row label.
export function historyRowLabel(row: Pick<HistorySessionRow, 'name' | 'localDate'>): string {
  const trimmed = row.name?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : formatHistoryDate(row.localDate);
}
