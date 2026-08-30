import { and, desc, eq } from 'drizzle-orm';
import { type BodyMetricKind } from '@fitness/api-contracts';
import { captureCalendarDay } from '../calendar-day';
import { generateClientId } from './id';
import { getPowerSync, type WriteDb } from './powersync';
import { bodyMetric } from './schema';

export interface LogMetricInput {
  userId: string;
  kind: BodyMetricKind;
  value: string;
}

export interface BodyMetricRow {
  id: string;
  kind: string;
  value: string;
  recordedAt: string;
  timezone: string;
  localDate: string;
}

// A blind insert, never read-then-insert — D-09 keeps every entry of a kind on a day, so a second
// weigh-in the same day is a second row, not a guarded no-op (unlike exclusions.ts's addExclusion,
// which dedupes on a (user, exercise) pair that must stay singular). captureCalendarDay is called
// here rather than accepted as an input so every call site gets the same day-attribution rule every
// other write in this codebase uses (D-04) — never re-derived from a caller's own Date math.
export async function logMetric(input: LogMetricInput, db: WriteDb = getPowerSync()): Promise<string> {
  const id = generateClientId();
  const { timezone, localDate } = captureCalendarDay(new Date());

  await db.insert(bodyMetric).values({
    id,
    userId: input.userId,
    kind: input.kind,
    value: input.value,
    recordedAt: new Date().toISOString(),
    timezone,
    localDate,
  });

  return id;
}

// The most recent row for a kind, by recordedAt — feeds the quick weigh-in sheet's "default to the
// last recorded value" behaviour (D-29) and the entry sheet's own read. Returns undefined when the
// user has never logged this kind.
export async function loadLatestMetric(
  userId: string,
  kind: BodyMetricKind,
  db: WriteDb = getPowerSync(),
): Promise<BodyMetricRow | undefined> {
  const [row] = await db
    .select({
      id: bodyMetric.id,
      kind: bodyMetric.kind,
      value: bodyMetric.value,
      recordedAt: bodyMetric.recordedAt,
      timezone: bodyMetric.timezone,
      localDate: bodyMetric.localDate,
    })
    .from(bodyMetric)
    .where(and(eq(bodyMetric.userId, userId), eq(bodyMetric.kind, kind)))
    .orderBy(desc(bodyMetric.recordedAt))
    .limit(1);

  return row;
}
