import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { formatWeight, type PrType, type WeightUnit } from '@fitness/api-contracts';
import { pluralizeCount } from '@/lib/analytics/chart-labels';
import { getPowerSync, type WriteDb } from './powersync';
import { loggedSet, personalRecord } from './schema';
import { loadExerciseNameMap } from './programs/load-program';

// The same fallback session-query.ts, summary-query.ts and the performance screen already use, so
// an exercise id absent from the catalog renders one recognisable label app-wide. An archived
// exercise does not erase the record it produced.
const UNKNOWN_EXERCISE_NAME = 'Unknown exercise';

export interface RecordListRow {
  id: string;
  exerciseId: string;
  exerciseName: string;
  prType: PrType;
  // The stored three-decimal string, carried through unparsed. Its MEANING differs per metric —
  // see formatRecordValue below before doing arithmetic on it.
  value: string;
  // The weight of the logged_set that achieved this record. Null when the record carries no
  // originating set id, or when that set has not been synced to this device. Only the most-reps
  // metric needs it: personal_record has no weight column at all, and that metric's own `value` is
  // a rep count, so the weight the row must display lives nowhere else.
  setWeightKg: string | null;
  achievedAt: string;
}

export interface RecordsCursor {
  achievedAt: string;
  id: string;
}

export interface RecordsPage {
  rows: RecordListRow[];
  nextCursor: RecordsCursor | null;
}

export interface LoadRecordsPageInput {
  userId: string | null;
  prType: PrType;
  limit: number;
  cursor?: RecordsCursor | null;
}

const EMPTY_PAGE: RecordsPage = { rows: [], nextCursor: null };

// Reads the PERSISTED personal_record table that PR detection already wrote (D-01) — it recomputes
// nothing, and imports none of the pr-rules helpers by design. A second record implementation here
// would immediately be able to disagree with the badge a lifter has already been shown, and the two
// could not be reconciled after either had rendered.
//
// Three batched reads, never one per row (PITFALLS §13): one page of personal_record filtered by
// the selected metric, one loadExerciseNameMap for the names, and one logged_set read over exactly
// the page's non-null originating set ids. A per-row lookup is the N+1 shape every sibling reader
// in this module family already forbids.
//
// The cursor is the (achieved_at, id) pair, never an OFFSET: an OFFSET counts rows from the top of
// the CURRENT result set on every call, so a record arriving from another device between two page
// fetches shifts every row after it by one position, silently duplicating or skipping a row at the
// page boundary. A keyset cursor names the last row already seen and asks only for rows strictly
// after it in the same (achieved_at DESC, id DESC) order, which a new row can never retroactively
// satisfy for a page already returned.
//
// Deliberately does not add a `personal_record.user_id` filter, for the reason history-query.ts
// documents at length: that column is stamped server-side on sync push only, so a record written
// offline carries a null locally. The guard is "is anyone signed in at all", not per-row ownership.
export async function loadRecordsPage(
  { userId, prType, limit, cursor }: LoadRecordsPageInput,
  db: WriteDb = getPowerSync(),
): Promise<RecordsPage> {
  if (!userId) return EMPTY_PAGE;

  const metricFilter = eq(personalRecord.prType, prType);
  const whereClause = cursor
    ? and(
        metricFilter,
        or(
          lt(personalRecord.achievedAt, cursor.achievedAt),
          and(eq(personalRecord.achievedAt, cursor.achievedAt), lt(personalRecord.id, cursor.id)),
        ),
      )
    : metricFilter;

  const pageRows = await db
    .select({
      id: personalRecord.id,
      exerciseId: personalRecord.exerciseId,
      prType: personalRecord.prType,
      value: personalRecord.value,
      loggedSetId: personalRecord.loggedSetId,
      achievedAt: personalRecord.achievedAt,
    })
    .from(personalRecord)
    .where(whereClause)
    .orderBy(desc(personalRecord.achievedAt), desc(personalRecord.id))
    .limit(limit);

  if (pageRows.length === 0) return EMPTY_PAGE;

  const names = await loadExerciseNameMap(db);

  const loggedSetIds = [...new Set(pageRows.map((row) => row.loggedSetId).filter((id): id is string => id !== null))];
  const setRows = loggedSetIds.length
    ? await db.select({ id: loggedSet.id, weightKg: loggedSet.weightKg }).from(loggedSet).where(inArray(loggedSet.id, loggedSetIds))
    : [];
  const weightBySetId = new Map(setRows.map((row) => [row.id, row.weightKg]));

  const rows: RecordListRow[] = pageRows.map((row) => ({
    id: row.id,
    exerciseId: row.exerciseId,
    exerciseName: names.get(row.exerciseId) ?? UNKNOWN_EXERCISE_NAME,
    prType: row.prType as PrType,
    value: row.value,
    setWeightKg: row.loggedSetId === null ? null : (weightBySetId.get(row.loggedSetId) ?? null),
    achievedAt: row.achievedAt,
  }));

  const last = pageRows[pageRows.length - 1];
  const nextCursor = pageRows.length === limit ? { achievedAt: last.achievedAt, id: last.id } : null;

  return { rows, nextCursor };
}

// THE TRAP IN THIS FILE. All four metrics persist through the same numeric(10,3) column and the
// same `value.toFixed(3)` convention (personal-record.ts's formatPrValue), so every stored value
// LOOKS like a weight — but only three of them are one:
//
//   heaviest_weight     a weight in kilograms
//   best_e1rm           an estimate in kilograms
//   best_set_volume     a weight-times-reps product, still on the kilogram scale
//   most_reps_at_weight a REP COUNT — not a weight, and not on the kilogram scale at all
//
// A reader who assumes the column always holds kilograms produces a plausible, silently wrong
// number for the fourth. The rep count must be rounded back to a whole number before rendering
// (it was written as "12.000"), and the weight it was achieved AT is not on the record row at all
// — it comes from the originating logged set, resolved in batch by loadRecordsPage above.
//
// When that set is absent or carries no weight, the rep count renders alone. Deliberately NOT a
// dash: the em-dash convention means "no value", and here the weight simply is not part of what
// this row records.
export function formatRecordValue(
  row: Pick<RecordListRow, 'prType' | 'value' | 'setWeightKg'>,
  unit: WeightUnit,
): string {
  if (row.prType !== 'most_reps_at_weight') return formatWeight(row.value, unit);

  const reps = pluralizeCount(Math.round(Number(row.value)), 'rep', 'reps');
  if (row.setWeightKg === null) return reps;
  return `${reps} @ ${formatWeight(row.setWeightKg, unit)}`;
}
