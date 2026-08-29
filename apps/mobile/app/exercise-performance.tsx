import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import {
  exerciseSeries,
  PERFORMANCE_METRICS,
  PER_SESSION_RANGE_DAYS,
  type PerformanceMetricId,
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

const RANGE_LABEL = 'Last 3 months';
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

export type ExercisePerformanceState = 'error' | 'loading' | 'no-history' | 'e1rm-above-cap' | 'ready';

export interface ExercisePerformanceStateInput {
  failed: boolean;
  sessions: unknown[] | null;
  metric: PerformanceMetricId;
  pointCount: number;
  droppedAboveCapCount: number;
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
}: ExercisePerformanceStateInput): ExercisePerformanceState {
  if (failed) return 'error';
  if (sessions === null) return 'loading';
  if (sessions.length === 0) return 'no-history';
  if (pointCount > 0) return 'ready';
  // Only the estimate metric may blame the rep cap, and only when the cap is what actually dropped
  // every session. Claiming it anywhere else would be a wrong explanation, which is worse than none.
  if (metric === 'e1rm' && droppedAboveCapCount > 0) return 'e1rm-above-cap';
  return 'no-history';
}

function resolveMetric(raw: string | undefined): PerformanceMetricId {
  return PERFORMANCE_METRICS.includes(raw as PerformanceMetricId) ? (raw as PerformanceMetricId) : PERFORMANCE_METRICS[0];
}

// The window boundary is computed here, at the screen, and passed down as an argument — the pure
// package holds no clock (D-10).
function windowStartLocalDate(days: number): string {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  return captureCalendarDay(start).localDate;
}

function formatMetricValue(metric: PerformanceMetricId, value: number, unit: WeightUnit): string {
  return formatWeight(value.toFixed(3), unit);
}

export interface ExercisePerformanceScreenViewProps {
  state: ExercisePerformanceState;
  exerciseName: string;
  metric: PerformanceMetricId;
  onSelectMetric: (id: string) => void;
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
  points,
  droppedAboveCapCount,
  colors,
  chartWidth,
}: ExercisePerformanceScreenViewProps) {
  const switchesVisible = state === 'ready' || state === 'e1rm-above-cap';
  const latest = points.length > 0 ? points[points.length - 1] : null;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ gap: 24, padding: 24 }}>
      <Text className="text-heading font-semibold text-foreground">{exerciseName}</Text>

      {switchesVisible ? (
        <SegmentedChipRow
          groupLabel="Performance metric"
          options={METRIC_OPTIONS}
          selectedId={metric}
          onSelect={onSelectMetric}
        />
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
              rangeLabel={RANGE_LABEL}
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

  const [metric, setMetric] = useState<PerformanceMetricId>(resolveMetric(metricOverride ?? params.metric));
  const [sessions, setSessions] = useState<ExerciseHistorySession[] | null>(null);
  const [exerciseName, setExerciseName] = useState('');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(DEFAULT_WEIGHT_UNIT);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        try {
          const database = db ?? getPowerSync();
          const [loaded, names, unit] = await Promise.all([
            loadExerciseHistory(
              { exerciseId, userId, sinceLocalDate: windowStartLocalDate(PER_SESSION_RANGE_DAYS) },
              database,
            ),
            loadExerciseNameMap(database),
            userId ? loadWeightUnit(userId, database) : Promise.resolve(DEFAULT_WEIGHT_UNIT),
          ]);
          if (!active) return;
          setSessions(loaded);
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
    }, [exerciseId, userId, db]),
  );

  const series = exerciseSeries({ sessions: sessions ?? [], metric });
  const points: TrendPoint[] = series.points.map((point) => ({
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
        points={points}
        droppedAboveCapCount={series.droppedAboveCapCount}
        colors={colors}
        chartWidth={resolveChartWidth(width)}
      />
    </View>
  );
}
