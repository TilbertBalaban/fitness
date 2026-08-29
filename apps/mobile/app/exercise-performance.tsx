import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import {
  addDaysToLocalDate,
  bucketIndexForLocalDate,
  exerciseSeries,
  PERFORMANCE_METRICS,
  PERFORMANCE_RANGE_DAYS,
  PERFORMANCE_RANGES,
  rollingWindowStart,
  trailingBuckets,
  TREND_BUCKET_DAYS,
  type PerformanceMetricId,
  type PerformanceRangeId,
  type SeriesPoint,
} from '@fitness/analytics-engine';
import { formatWeight, type WeightUnit } from '@fitness/api-contracts';
import { E1RM_MAX_VALID_REPS } from '@fitness/pr-rules';
import { NavBackButton } from '@/components/NavBackButton';
import { SegmentedChipRow, type SegmentedChipOption } from '@/components/SegmentedChipRow';
import { resolveChartWidth, TREND_CHART_HEIGHT, TrendChart, type TrendPoint } from '@/components/TrendChart';
import { authClient } from '@/lib/auth-client';
import { formatChartDateLabel, pluralizeCount } from '@/lib/analytics/chart-labels';
import { captureCalendarDay } from '@/lib/calendar-day';
import { loadExerciseHistory, type ExerciseHistorySession } from '@/lib/db/exercise-history-query';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { loadWeightUnit } from '@/lib/db/preferences';
import { loadExerciseNameMap } from '@/lib/db/programs/load-program';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

const MIDDLE_DOT = ' · ';
const DEFAULT_WEIGHT_UNIT: WeightUnit = 'kg';

const METRIC_OPTIONS: SegmentedChipOption[] = [
  { id: 'heaviest', label: 'Heaviest Weight' },
  { id: 'e1rm', label: 'Est. 1RM' },
  { id: 'volume', label: 'Total Volume' },
];

const METRIC_ANNOUNCEMENTS: Record<PerformanceMetricId, string> = {
  heaviest: 'Heaviest weight',
  e1rm: 'Estimated 1RM',
  volume: 'Total volume',
};

interface PerformanceRangeCopy {
  chipLabel: string;
  // Completes the chart's announced sentence: "Heaviest weight over Last 3 months."
  announcement: string;
  emptyHeading: string;
  // Whether this range plots weekly bests rather than one point per session. A data property, not
  // a second code path — the chart's contract is identical either way.
  bucketed: boolean;
}

const RANGE_COPY: Record<PerformanceRangeId, PerformanceRangeCopy> = {
  '3m': {
    chipLabel: '3 months',
    announcement: 'Last 3 months',
    emptyHeading: 'Nothing logged in the last 3 months',
    bucketed: false,
  },
  '1y': { chipLabel: '1 year', announcement: 'Last year', emptyHeading: 'Nothing logged in the last year', bucketed: true },
  all: {
    chipLabel: 'All time',
    announcement: 'All time',
    // Unreachable: an unbounded range cannot be empty while history exists anywhere. Spelled out
    // rather than asserted away so the record stays total and a later reader is not left guessing.
    emptyHeading: 'Nothing logged for this exercise',
    bucketed: true,
  },
};

const RANGE_OPTIONS: SegmentedChipOption[] = PERFORMANCE_RANGES.map((id) => ({ id, label: RANGE_COPY[id].chipLabel }));

export type ExercisePerformanceState =
  | 'error'
  | 'loading'
  | 'no-history'
  | 'nothing-in-range'
  | 'e1rm-above-cap'
  | 'ready';

export interface ExercisePerformanceStateInput {
  failed: boolean;
  sessions: unknown[] | null;
  metric: PerformanceMetricId;
  pointCount: number;
  droppedAboveCapCount: number;
  hasHistoryOutsideRange: boolean;
}

// Every branch this screen renders is decided here and none is inferred inline — the same
// classifier split deriveHistoryScreenState established. `error` beats everything: a failed read
// cannot be reported as an empty history, because the two call for opposite user actions.
export function deriveExercisePerformanceState({
  failed,
  sessions,
  metric,
  pointCount,
  droppedAboveCapCount,
  hasHistoryOutsideRange,
}: ExercisePerformanceStateInput): ExercisePerformanceState {
  if (failed) return 'error';
  if (sessions === null) return 'loading';
  // Two different emptinesses with two opposite remedies — "log a set of this" versus "widen the
  // range" — so they get two branches. Only the second keeps the switches on screen.
  if (sessions.length === 0) return hasHistoryOutsideRange ? 'nothing-in-range' : 'no-history';
  if (pointCount > 0) return 'ready';
  // Only the estimate metric may blame the rep cap, and only when the cap is what actually dropped
  // every session. Claiming it anywhere else would be a wrong explanation, which is worse than none.
  if (metric === 'e1rm' && droppedAboveCapCount > 0) return 'e1rm-above-cap';
  return 'no-history';
}

function resolveMetric(raw: string | undefined): PerformanceMetricId {
  return PERFORMANCE_METRICS.includes(raw as PerformanceMetricId) ? (raw as PerformanceMetricId) : PERFORMANCE_METRICS[0];
}

function resolveRange(raw: string): PerformanceRangeId {
  return PERFORMANCE_RANGES.includes(raw as PerformanceRangeId) ? (raw as PerformanceRangeId) : PERFORMANCE_RANGES[0];
}

// The clock is read here, at the screen, and every boundary below is derived from the resulting
// stamped date — the pure package holds no clock (D-10).
function todayLocalDate(): string {
  return captureCalendarDay(new Date()).localDate;
}

// `null` is the genuinely unbounded all-time range and reaches the reader as no date predicate at
// all, never as a distant sentinel date.
function rangeStartLocalDate(range: PerformanceRangeId, today: string): string | null {
  const days = PERFORMANCE_RANGE_DAYS[range];
  return days === null ? null : rollingWindowStart(today, days);
}

// Walks back in whole buckets until the earliest point is covered, reusing the package's own date
// arithmetic rather than keeping a second copy of it here. Only the unbounded range needs this —
// every other range divides its day count. A decade is ~520 cheap string steps.
function bucketCountCovering(earliestLocalDate: string, today: string, bucketDays: number): number {
  let count = 1;
  let start = addDaysToLocalDate(today, -(bucketDays - 1));
  while (start > earliestLocalDate) {
    count += 1;
    start = addDaysToLocalDate(start, -bucketDays);
  }
  return count;
}

// One point per weekly bucket, carrying the BEST value in it and never the mean. Every metric on
// this screen is a best-metric: averaging a good session with a bad one produces a number the
// lifter never achieved, and printing it would be the chart lying about their training. A bucket
// holding no qualifying session is absent from the series rather than drawn at zero (D-09).
export function bucketWeeklyBests(points: SeriesPoint[], today: string, rangeDays: number | null): SeriesPoint[] {
  if (points.length === 0) return [];

  const earliest = points.reduce((oldest, point) => (point.localDate < oldest ? point.localDate : oldest), points[0].localDate);
  const bucketCount =
    rangeDays === null
      ? bucketCountCovering(earliest, today, TREND_BUCKET_DAYS)
      : Math.ceil(rangeDays / TREND_BUCKET_DAYS);
  const buckets = trailingBuckets({ todayLocalDate: today, bucketCount, bucketDays: TREND_BUCKET_DAYS });

  const bestByBucket = new Map<number, SeriesPoint>();
  for (const point of points) {
    const index = bucketIndexForLocalDate(point.localDate, buckets);
    if (index === null) continue;
    const current = bestByBucket.get(index);
    if (current === undefined || point.value > current.value) bestByBucket.set(index, point);
  }

  return [...bestByBucket.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, point]) => ({ ...point, key: buckets[index].key, localDate: buckets[index].startLocalDate }));
}

// Two series shapes, one chart contract. The shortest range keeps one point per session because at
// that density individual sessions are the useful grain; the longer two would be unreadable that
// way and bucket instead.
export function resolveSeriesPoints(points: SeriesPoint[], range: PerformanceRangeId, today: string): SeriesPoint[] {
  if (!RANGE_COPY[range].bucketed) return points;
  return bucketWeeklyBests(points, today, PERFORMANCE_RANGE_DAYS[range]);
}

function formatMetricValue(metric: PerformanceMetricId, value: number, unit: WeightUnit): string {
  return formatWeight(value.toFixed(3), unit);
}

export interface ExercisePerformanceScreenViewProps {
  state: ExercisePerformanceState;
  exerciseName: string;
  metric: PerformanceMetricId;
  onSelectMetric: (id: string) => void;
  range: PerformanceRangeId;
  onSelectRange: (id: string) => void;
  points: TrendPoint[];
  droppedAboveCapCount: number;
  colors: ThemeColors;
  chartWidth: number;
}

function EmptyState({ heading, body }: { heading: string; body: string }) {
  return (
    <View className="gap-xs">
      <Text className="text-heading font-semibold text-foreground">{heading}</Text>
      <Text className="text-body font-normal text-foreground-muted">{body}</Text>
    </View>
  );
}

// Hook-free so a test and the durability harness can render it directly. Every string below comes
// from the UI-SPEC's Copywriting Contract verbatim, with the rep-cap numeral interpolated from the
// imported constant rather than spelled out — the Contract's own last row requires that.
export function ExercisePerformanceScreenView({
  state,
  exerciseName,
  metric,
  onSelectMetric,
  range,
  onSelectRange,
  points,
  droppedAboveCapCount,
  colors,
  chartWidth,
}: ExercisePerformanceScreenViewProps) {
  // Hidden only when there is genuinely nothing to switch between. A range that happens to be
  // empty must keep both switches reachable — that is the only way out of it.
  const switchesVisible = state === 'ready' || state === 'e1rm-above-cap' || state === 'nothing-in-range';
  const latest = points.length > 0 ? points[points.length - 1] : null;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ gap: 24, padding: 24 }}>
      <Text className="text-heading font-semibold text-foreground">{exerciseName}</Text>

      {switchesVisible ? (
        <>
          <SegmentedChipRow
            groupLabel="Performance metric"
            options={METRIC_OPTIONS}
            selectedId={metric}
            onSelect={onSelectMetric}
          />
          <SegmentedChipRow groupLabel="Time range" options={RANGE_OPTIONS} selectedId={range} onSelect={onSelectRange} />
        </>
      ) : null}

      {state === 'error' ? (
        <EmptyState
          heading="Performance couldn't load"
          body="Restart the app to try again. Your programs and history are safe."
        />
      ) : null}

      {/* R6: a local read never shows a spinner — a surface-coloured block at the chart's height. */}
      {state === 'loading' ? <View className="rounded-md bg-surface" style={{ height: TREND_CHART_HEIGHT }} /> : null}

      {state === 'no-history' ? (
        <EmptyState heading="No history for this exercise" body="Log a set of this exercise and your chart starts here." />
      ) : null}

      {/* D-09: an empty range says so and offers the way out, rather than a flat line at zero. */}
      {state === 'nothing-in-range' ? (
        <EmptyState heading={RANGE_COPY[range].emptyHeading} body="Try a longer range." />
      ) : null}

      {state === 'e1rm-above-cap' ? (
        <EmptyState
          heading="No estimated 1RM to show"
          body={`Every logged set for this exercise was above ${E1RM_MAX_VALID_REPS} reps. Estimated 1RM is only meaningful at ${E1RM_MAX_VALID_REPS} reps or fewer.`}
        />
      ) : null}

      {state === 'ready' && latest !== null ? (
        <>
          <View className="gap-xs">
            <Text className="text-display font-semibold text-foreground">{latest.valueLabel}</Text>
            <Text className="text-label font-normal text-foreground-muted">{`Latest${MIDDLE_DOT}${latest.dateLabel}`}</Text>
          </View>

          <View className="gap-xs rounded-md bg-surface p-md">
            <TrendChart
              points={points}
              colors={colors}
              width={chartWidth}
              metricLabel={METRIC_ANNOUNCEMENTS[metric]}
              rangeLabel={RANGE_COPY[range].announcement}
            />
            {/* A chart with visible gaps must say why, in place, in the user's own terms (ANLY-10). */}
            {droppedAboveCapCount > 0 ? (
              <Text className="text-label font-normal text-foreground-muted">
                {`${pluralizeCount(droppedAboveCapCount, 'session', 'sessions')} above ${E1RM_MAX_VALID_REPS} reps aren't plotted — estimated 1RM isn't meaningful there.`}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

export interface ExercisePerformanceScreenProps {
  // The durability harness's seam, matching the shipped gym-profiles and programs routes: mounts
  // this exact route against a caller-chosen db/userId instead of the production singleton. All
  // four are undefined for every real navigation, so production behaviour is unchanged.
  exerciseId?: string;
  metric?: string;
  userId?: string;
  db?: WriteDb;
}

export default function ExercisePerformanceScreen({
  exerciseId: exerciseIdOverride,
  metric: metricOverride,
  userId: userIdOverride,
  db,
}: ExercisePerformanceScreenProps = {}) {
  const params = useLocalSearchParams<{ exerciseId?: string; metric?: string }>();
  const session = authClient.useSession();
  const colors = useThemeColors();
  const { width } = useWindowDimensions();

  const exerciseId = exerciseIdOverride ?? params.exerciseId ?? '';
  const userId = userIdOverride ?? session.data?.user?.id ?? null;

  // Both switches are view state and nothing else: neither is persisted, and neither changes what
  // the app stores. A remount returns to the metric in the route's query param and the shortest range.
  const [metric, setMetric] = useState<PerformanceMetricId>(resolveMetric(metricOverride ?? params.metric));
  const [range, setRange] = useState<PerformanceRangeId>(PERFORMANCE_RANGES[0]);
  const [today, setToday] = useState(todayLocalDate);
  const [sessions, setSessions] = useState<ExerciseHistorySession[] | null>(null);
  const [hasHistoryOutsideRange, setHasHistoryOutsideRange] = useState(false);
  const [exerciseName, setExerciseName] = useState('');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(DEFAULT_WEIGHT_UNIT);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        try {
          const database = db ?? getPowerSync();
          const loadedToday = todayLocalDate();
          const sinceLocalDate = rangeStartLocalDate(range, loadedToday);
          const [loaded, names, unit] = await Promise.all([
            loadExerciseHistory({ exerciseId, userId, sinceLocalDate }, database),
            loadExerciseNameMap(database),
            userId ? loadWeightUnit(userId, database) : Promise.resolve(DEFAULT_WEIGHT_UNIT),
          ]);
          // Only when a bounded range came back empty: one extra unbounded read is what tells
          // "nothing here yet" apart from "nothing here lately", and the two call for opposite
          // user actions. An unbounded range that came back empty has already answered it.
          const outside =
            loaded.length === 0 && sinceLocalDate !== null
              ? (await loadExerciseHistory({ exerciseId, userId, sinceLocalDate: null }, database)).length > 0
              : false;
          if (!active) return;
          setToday(loadedToday);
          setSessions(loaded);
          setHasHistoryOutsideRange(outside);
          // The same fallback session-query.ts and summary-query.ts already use, so an id absent
          // from the catalog renders one recognisable label app-wide rather than a blank heading.
          setExerciseName(names.get(exerciseId) ?? 'Unknown exercise');
          setWeightUnit(unit);
          setFailed(false);
        } catch (error) {
          console.error('exercise performance load failed', error);
          if (!active) return;
          setFailed(true);
        }
      })();

      return () => {
        active = false;
      };
    }, [exerciseId, userId, db, range]),
  );

  const series = exerciseSeries({ sessions: sessions ?? [], metric });
  const points: TrendPoint[] = resolveSeriesPoints(series.points, range, today).map((point) => ({
    key: point.key,
    value: point.value,
    valueLabel: formatMetricValue(metric, point.value, weightUnit),
    dateLabel: formatChartDateLabel(point.localDate),
  }));

  const state = deriveExercisePerformanceState({
    failed,
    sessions,
    metric,
    pointCount: points.length,
    droppedAboveCapCount: series.droppedAboveCapCount,
    hasHistoryOutsideRange,
  });

  return (
    <View className="flex-1 bg-background">
      <View className="px-md pt-md">
        <NavBackButton fallbackHref="/(tabs)/history" />
      </View>
      <ExercisePerformanceScreenView
        state={state}
        exerciseName={exerciseName}
        metric={metric}
        onSelectMetric={(id) => setMetric(resolveMetric(id))}
        range={range}
        onSelectRange={(id) => setRange(resolveRange(id))}
        points={points}
        droppedAboveCapCount={series.droppedAboveCapCount}
        colors={colors}
        chartWidth={resolveChartWidth(width)}
      />
    </View>
  );
}
