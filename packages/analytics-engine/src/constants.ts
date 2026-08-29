// R21: every window length, bucket size and range this phase uses lives here as a named export, so
// no numeric literal for a time span survives at a call site.

// D-07's rolling window. Consumed by the Last 7 Days card (ANLY-08).
export const PROGRESS_WINDOW_DAYS = 7;

// The History trend card's window (ANLY-07).
export const TREND_WEEKS = 12;

// The bucket size every trend surface aggregates into (ANLY-07).
export const TREND_BUCKET_DAYS = 7;

// The Exercise Performance screen's default range (ANLY-06).
export const PER_SESSION_RANGE_DAYS = 90;

export const PERFORMANCE_METRICS = ['heaviest', 'e1rm', 'volume'] as const;
export type PerformanceMetricId = (typeof PERFORMANCE_METRICS)[number];

export const PERFORMANCE_RANGES = ['3m', '1y', 'all'] as const;
export type PerformanceRangeId = (typeof PERFORMANCE_RANGES)[number];

// `null` is an unbounded range, not a missing value — `all` reads every session ever logged.
export const PERFORMANCE_RANGE_DAYS: Record<PerformanceRangeId, number | null> = {
  '3m': PER_SESSION_RANGE_DAYS,
  '1y': 365,
  all: null,
};

export const HISTORY_TREND_METRICS = ['volume', 'sets', 'workouts'] as const;
export type HistoryTrendMetricId = (typeof HISTORY_TREND_METRICS)[number];
