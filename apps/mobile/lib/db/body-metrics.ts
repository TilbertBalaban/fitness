import { and, eq, desc } from 'drizzle-orm';
import { BODY_METRIC_KIND_ORDER, type BodyMetricKind } from '@fitness/api-contracts';
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

export interface TrackedKindSummary {
  kind: BodyMetricKind;
  value: string;
  localDate: string;
}

interface LatestKindRow {
  value: string;
  recordedAt: string;
  localDate: string;
}

// The one batched select over every row the user owns, grouped in JavaScript to the latest row per
// kind by recordedAt — never one query per kind (records-query.ts's no-N+1 rule). Both
// loadTrackedKindSummaries and loadTrackedKinds read through this single query; neither issues a
// second one.
async function loadLatestPerKind(userId: string, db: WriteDb): Promise<Map<string, LatestKindRow>> {
  const rows = await db
    .select({
      kind: bodyMetric.kind,
      value: bodyMetric.value,
      recordedAt: bodyMetric.recordedAt,
      localDate: bodyMetric.localDate,
    })
    .from(bodyMetric)
    .where(eq(bodyMetric.userId, userId));

  const latestByKind = new Map<string, LatestKindRow>();
  for (const row of rows) {
    const existing = latestByKind.get(row.kind);
    if (!existing || row.recordedAt > existing.recordedAt) {
      latestByKind.set(row.kind, row);
    }
  }
  return latestByKind;
}

// A kind is "tracked" the moment at least one row of it exists (UI-SPEC decision 8); the result is
// sorted by BODY_METRIC_KIND_ORDER so a caller never has to re-sort it.
export async function loadTrackedKindSummaries(userId: string, db: WriteDb = getPowerSync()): Promise<TrackedKindSummary[]> {
  const latestByKind = await loadLatestPerKind(userId, db);

  return BODY_METRIC_KIND_ORDER.filter((kind) => latestByKind.has(kind)).map((kind) => {
    const latest = latestByKind.get(kind)!;
    return { kind, value: latest.value, localDate: latest.localDate };
  });
}

// The D-07 "tracked kinds" set (UI-SPEC decision 8) — every kind with at least one row, derived
// from the same batched read loadTrackedKindSummaries performs, not a second query. Feeds
// TrackKindSheet's untracked-row filter and MetricEntrySheet's quick-measurement kind picker.
export async function loadTrackedKinds(userId: string, db: WriteDb = getPowerSync()): Promise<Set<BodyMetricKind>> {
  const latestByKind = await loadLatestPerKind(userId, db);
  return new Set(BODY_METRIC_KIND_ORDER.filter((kind) => latestByKind.has(kind)));
}

export interface MetricEntryListRow {
  id: string;
  kind: BodyMetricKind;
  value: string;
  recordedAt: string;
  localDate: string;
}

// The S6 entries list's own read — every entry for a kind, most recent first, INCLUDING a same-day
// second entry the chart's own loadBodyMetricTrend dedupes away (D-09: this is a genuinely
// different list from the chart's series). One batched select, ordered in SQL rather than JS, since
// there is no per-date reduction here.
export async function loadMetricEntries(
  userId: string,
  kind: BodyMetricKind,
  db: WriteDb = getPowerSync(),
): Promise<MetricEntryListRow[]> {
  const rows = await db
    .select({
      id: bodyMetric.id,
      kind: bodyMetric.kind,
      value: bodyMetric.value,
      recordedAt: bodyMetric.recordedAt,
      localDate: bodyMetric.localDate,
    })
    .from(bodyMetric)
    .where(and(eq(bodyMetric.userId, userId), eq(bodyMetric.kind, kind)))
    .orderBy(desc(bodyMetric.recordedAt));

  return rows.map((row) => ({ ...row, kind: row.kind as BodyMetricKind }));
}

export interface UpdateMetricInput {
  userId: string;
  id: string;
  value: string;
  // Present only when the caller also wants to change which kind the row belongs to — kind is
  // client-patchable (12-01's own root-lookup rationale), but the trend-detail edit sheet (S6) only
  // ever supplies value: an edit corrects the number, never the day it was logged.
  kind?: BodyMetricKind;
}

// Writes ONLY value (and kind, when supplied) — recordedAt/timezone/localDate stay exactly as
// originally captured, matching renameSession's own single-column-update shape (history-mutations.ts).
// An edit is a correction of the number, not a claim about when the measurement happened (D-10,
// this plan's own planner_assumptions #2): moving the timestamp would silently re-attribute the
// entry to a different day and change which point the chart plots. Scoped by BOTH id and userId
// (T-12-17) — the same ownership discipline progress-photos.ts's updatePhotoNote/deletePhoto use.
export async function updateMetric(input: UpdateMetricInput, db: WriteDb = getPowerSync()): Promise<void> {
  const patch: Partial<{ value: string; kind: BodyMetricKind }> = { value: input.value };
  if (input.kind !== undefined) patch.kind = input.kind;

  await db.update(bodyMetric).set(patch).where(and(eq(bodyMetric.id, input.id), eq(bodyMetric.userId, input.userId)));
}

export interface DeleteMetricInput {
  userId: string;
  id: string;
}

// A hard delete, matching the class excluded_exercise established — no separate correction concept
// exists for a logged metric (D-10). Scoped by both id and userId (T-12-17).
export async function deleteMetric(input: DeleteMetricInput, db: WriteDb = getPowerSync()): Promise<void> {
  await db.delete(bodyMetric).where(and(eq(bodyMetric.id, input.id), eq(bodyMetric.userId, input.userId)));
}
