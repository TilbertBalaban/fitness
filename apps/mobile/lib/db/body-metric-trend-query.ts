import { and, eq, gte } from 'drizzle-orm';
import { rollingWindowStart } from '@fitness/analytics-engine';
import type { BodyMetricKind } from '@fitness/api-contracts';
import { getPowerSync, type WriteDb } from './powersync';
import { bodyMetric } from './schema';

// R32: every window value, day count and chip label lives here, never as a literal at a call site.
export const BODY_METRIC_TREND_WINDOWS = ['1m', '3m', '1y', 'all'] as const;
export type BodyMetricTrendWindow = (typeof BODY_METRIC_TREND_WINDOWS)[number];

export const BODY_METRIC_TREND_WINDOW_DAYS: Record<BodyMetricTrendWindow, number | null> = {
  '1m': 30,
  '3m': 90,
  '1y': 365,
  all: null,
};

export const BODY_METRIC_TREND_WINDOW_CHIP_LABELS: Record<BodyMetricTrendWindow, string> = {
  '1m': '1 Month',
  '3m': '3 Months',
  '1y': '1 Year',
  all: 'All Time',
};

// `null` for `all` reaches the reader as no date predicate at all, never a distant sentinel date —
// the same discipline exercise-performance.tsx's rangeStartLocalDate follows. Derived from
// analytics-engine's own local-date string arithmetic (rollingWindowStart), never a `Date`
// constructed on the reading device (historyTrendWindowStart's own idiom).
export function bodyMetricWindowStart(todayLocalDate: string, window: BodyMetricTrendWindow): string | null {
  const days = BODY_METRIC_TREND_WINDOW_DAYS[window];
  return days === null ? null : rollingWindowStart(todayLocalDate, days);
}

export interface BodyMetricTrendPoint {
  date: string;
  value: string;
}

export interface LoadBodyMetricTrendInput {
  userId: string | null;
  kind: BodyMetricKind;
  windowStart: string | null;
}

// ONE batched select over body_metric, deduped in JavaScript to the latest row per local_date
// (D-09: a second same-day entry replaces the first in the chart, but both stay in body-metrics.ts's
// own unfiltered entries read). A local_date with no row produces no point — the series is sparse,
// never zero-filled (D-13). `windowStart: null` reads every row the kind has ever had; the screen
// calls this once that way and filters the windowed view in JavaScript, rather than re-querying per
// chip press (records-query.ts's no-N+1 posture).
export async function loadBodyMetricTrend(
  { userId, kind, windowStart }: LoadBodyMetricTrendInput,
  db: WriteDb = getPowerSync(),
): Promise<BodyMetricTrendPoint[]> {
  if (!userId) return [];

  const whereClause =
    windowStart === null
      ? and(eq(bodyMetric.userId, userId), eq(bodyMetric.kind, kind))
      : and(eq(bodyMetric.userId, userId), eq(bodyMetric.kind, kind), gte(bodyMetric.localDate, windowStart));

  const rows = await db
    .select({ localDate: bodyMetric.localDate, value: bodyMetric.value, recordedAt: bodyMetric.recordedAt })
    .from(bodyMetric)
    .where(whereClause);

  const latestByDate = new Map<string, { value: string; recordedAt: string }>();
  for (const row of rows) {
    const existing = latestByDate.get(row.localDate);
    if (!existing || row.recordedAt > existing.recordedAt) {
      latestByDate.set(row.localDate, { value: row.value, recordedAt: row.recordedAt });
    }
  }

  return [...latestByDate.entries()]
    .sort(([leftDate], [rightDate]) => (leftDate < rightDate ? -1 : leftDate > rightDate ? 1 : 0))
    .map(([date, latest]) => ({ date, value: latest.value }));
}
