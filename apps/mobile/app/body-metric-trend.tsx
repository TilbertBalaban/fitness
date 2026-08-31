import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import {
  BODY_METRIC_KIND_LABELS,
  BODY_METRIC_KIND_SET,
  formatLength,
  formatWeight,
  fromCanonicalValue,
  resolveDisplayUnit,
  type BodyMetricKind,
  type WeightUnit,
} from '@fitness/api-contracts';
import { MetricEntrySheet } from '@/components/MetricEntrySheet';
import { NavBackButton } from '@/components/NavBackButton';
import { SegmentedChipRow } from '@/components/SegmentedChipRow';
import { resolveChartWidth, TREND_CHART_HEIGHT, TrendChart, type TrendPoint } from '@/components/TrendChart';
import { authClient } from '@/lib/auth-client';
import { formatChartDateLabel } from '@/lib/analytics/chart-labels';
import { captureCalendarDay } from '@/lib/calendar-day';
import {
  bodyMetricWindowStart,
  BODY_METRIC_TREND_WINDOW_CHIP_LABELS,
  BODY_METRIC_TREND_WINDOWS,
  loadBodyMetricTrend,
  type BodyMetricTrendPoint,
  type BodyMetricTrendWindow,
} from '@/lib/db/body-metric-trend-query';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { loadWeightUnit } from '@/lib/db/preferences';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

const MIDDLE_DOT = ' · ';
const DEFAULT_WEIGHT_UNIT: WeightUnit = 'kg';
const DEFAULT_WINDOW: BodyMetricTrendWindow = '3m';

// The natural-language phrase for the empty-window heading — deliberately not the chip's own
// Title Case label ("3 Months"), matching exercise-performance.tsx's own RANGE_COPY.emptyHeading
// precedent. `all` is unreachable here: a series with at least one point (the only way to reach
// empty-WINDOW rather than empty-kind) can never be empty under the unbounded window, but the
// entry is still total for the type.
const WINDOW_EMPTY_LABEL: Record<BodyMetricTrendWindow, string> = {
  '1m': '1 month',
  '3m': '3 months',
  '1y': '1 year',
  all: 'all time',
};

const WINDOW_OPTIONS = BODY_METRIC_TREND_WINDOWS.map((window) => ({
  id: window,
  label: BODY_METRIC_TREND_WINDOW_CHIP_LABELS[window],
}));

// T-12-15: an unrecognised or missing kind resolves to null rather than being interpolated into a
// query — the screen renders its empty state for it instead of crashing or querying freely.
function resolveKind(raw: string | undefined): BodyMetricKind | null {
  return typeof raw === 'string' && BODY_METRIC_KIND_SET.has(raw) ? (raw as BodyMetricKind) : null;
}

function resolveWindow(raw: string): BodyMetricTrendWindow {
  return (BODY_METRIC_TREND_WINDOWS as readonly string[]).includes(raw) ? (raw as BodyMetricTrendWindow) : DEFAULT_WINDOW;
}

function todayLocalDate(): string {
  return captureCalendarDay(new Date()).localDate;
}

// Mirrors BodyMetricRow.tsx's private formatBodyMetricValue exactly — kept as this screen's own
// copy rather than an import, because that helper is not exported and this plan does not touch
// BodyMetricRow.tsx (12-02's file, untouched this wave).
function formatBodyMetricDisplayValue(kind: BodyMetricKind, canonicalValue: string, weightUnit: WeightUnit): string {
  const displayUnit = resolveDisplayUnit(kind, weightUnit);
  if (displayUnit === 'kg' || displayUnit === 'lb') return formatWeight(canonicalValue, displayUnit);
  if (displayUnit === 'cm' || displayUnit === 'in') return formatLength(canonicalValue, displayUnit);
  const displayValue = fromCanonicalValue(kind, canonicalValue, weightUnit);
  return displayValue === null ? '—' : `${displayValue}%`;
}

// `null` when windowStart is `all` (no date predicate at all) — matches loadBodyMetricTrend's own
// contract for the unbounded window. Filtering happens here in JavaScript, not by re-querying per
// chip press: the screen reads loadBodyMetricTrend ONCE with windowStart: null (records-query.ts's
// no-N+1 posture).
function pointsInWindow(points: BodyMetricTrendPoint[], windowStart: string | null): BodyMetricTrendPoint[] {
  return windowStart === null ? points : points.filter((point) => point.date >= windowStart);
}

export type BodyMetricTrendState = 'error' | 'loading' | 'empty-kind' | 'empty-window' | 'ready';

export interface BodyMetricTrendStateInput {
  failed: boolean;
  // The FULL, unwindowed series — null while the read has not landed. An empty array here (once
  // landed) means the kind has never been logged at all (empty-kind); a non-empty array whose
  // WINDOWED subset is empty means it has been logged, just not inside the selected window
  // (empty-window) — the two call for opposite remedies and may never collapse into one branch.
  allPoints: BodyMetricTrendPoint[] | null;
  windowedPointCount: number;
}

export function deriveBodyMetricTrendState({ failed, allPoints, windowedPointCount }: BodyMetricTrendStateInput): BodyMetricTrendState {
  if (failed) return 'error';
  if (allPoints === null) return 'loading';
  if (allPoints.length === 0) return 'empty-kind';
  if (windowedPointCount === 0) return 'empty-window';
  return 'ready';
}

// A plain function, called rather than rendered as a JSX tag — body-metrics.tsx's renderStateBlock
// precedent, so a direct-invocation test can see inside the block (an `<EmptyState/>` JSX element
// hides its own children from a plain-tree walker that never actually calls component functions).
function emptyState(heading: string, body: string) {
  return (
    <View className="gap-xs">
      <Text className="text-heading font-semibold text-foreground">{heading}</Text>
      <Text className="text-body font-normal text-foreground-muted">{body}</Text>
    </View>
  );
}

export interface BodyMetricTrendViewProps {
  state: BodyMetricTrendState;
  kindLabel: string;
  window: BodyMetricTrendWindow;
  onSelectWindow: (id: string) => void;
  points: TrendPoint[];
  latest: TrendPoint | null;
  colors: ThemeColors;
  chartWidth: number;
  onLogPress: () => void;
}

// Hook-free — direct-invocable by a test and the durability harness, matching
// ExercisePerformanceScreenView's split. The window switch is hidden only when there is genuinely
// nothing to switch between (empty-kind, loading, error) — an empty WINDOW must keep it reachable,
// since widening the window is the only way out of that state (mirrors
// ExercisePerformanceScreenView's own switchesVisible rule).
export function BodyMetricTrendView({
  state,
  kindLabel,
  window,
  onSelectWindow,
  points,
  latest,
  colors,
  chartWidth,
  onLogPress,
}: BodyMetricTrendViewProps) {
  const switchVisible = state === 'ready' || state === 'empty-window';

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ gap: 24, padding: 24 }}>
      <Text className="text-heading font-semibold text-foreground">{kindLabel}</Text>

      {switchVisible ? (
        <SegmentedChipRow groupLabel="Trend window" options={WINDOW_OPTIONS} selectedId={window} onSelect={onSelectWindow} />
      ) : null}

      {state === 'error' ? emptyState("Trend couldn't load", "Restart the app to try again. Your programs and history are safe.") : null}

      {/* R6: a local SQLite read never shows a spinner — a surface-coloured block at the chart's height. */}
      {state === 'loading' ? <View className="rounded-md bg-surface" style={{ height: TREND_CHART_HEIGHT }} /> : null}

      {state === 'empty-kind' ? emptyState(`No ${kindLabel} logged yet`, `Log ${kindLabel} and your trend starts here.`) : null}

      {/* D-09/D-13: an empty window says so and offers the way out, rather than a flat line at zero. */}
      {state === 'empty-window'
        ? emptyState(`Nothing logged in the last ${WINDOW_EMPTY_LABEL[window]}`, 'Try a longer range.')
        : null}

      {state === 'ready' && latest !== null ? (
        <>
          <View className="gap-xs">
            <Text className="text-display font-semibold text-foreground">{latest.valueLabel}</Text>
            <Text className="text-label font-normal text-foreground-muted">{`Latest${MIDDLE_DOT}${latest.dateLabel}`}</Text>
          </View>

          <TrendChart points={points} colors={colors} width={chartWidth} metricLabel={kindLabel} rangeLabel={WINDOW_EMPTY_LABEL[window]} />

          <Pressable
            onPress={onLogPress}
            accessibilityRole="button"
            accessibilityLabel={`Log ${kindLabel}`}
            style={{ minHeight: 48, alignItems: 'flex-start', justifyContent: 'center' }}
          >
            <Text className="text-body font-normal text-accent">{`+ Log ${kindLabel}`}</Text>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}

export interface BodyMetricTrendScreenProps {
  // The durability harness's seam, matching exercise-performance.tsx's own shape: mounts this exact
  // route against a caller-chosen db/userId/kind instead of the production singleton/route param.
  kind?: string;
  userId?: string;
  db?: WriteDb;
}

export default function BodyMetricTrendScreen({
  kind: kindOverride,
  userId: userIdOverride,
  db,
}: BodyMetricTrendScreenProps = {}) {
  const params = useLocalSearchParams<{ kind?: string }>();
  const session = authClient.useSession();
  const colors = useThemeColors();
  const { width } = useWindowDimensions();

  const kind = resolveKind(kindOverride ?? params.kind);
  const userId = userIdOverride ?? session.data?.user?.id ?? null;

  const [window, setWindow] = useState<BodyMetricTrendWindow>(DEFAULT_WINDOW);
  const [today, setToday] = useState(todayLocalDate);
  const [rawPoints, setRawPoints] = useState<BodyMetricTrendPoint[] | null>(null);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(DEFAULT_WEIGHT_UNIT);
  const [failed, setFailed] = useState(false);
  const [logSheetOpen, setLogSheetOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!kind) {
      setRawPoints([]);
      setFailed(false);
      return;
    }
    try {
      const database = db ?? getPowerSync();
      const loadedToday = todayLocalDate();
      const [loaded, unit] = await Promise.all([
        loadBodyMetricTrend({ userId, kind, windowStart: null }, database),
        userId ? loadWeightUnit(userId, database) : Promise.resolve(DEFAULT_WEIGHT_UNIT),
      ]);
      setToday(loadedToday);
      setRawPoints(loaded);
      setWeightUnit(unit);
      setFailed(false);
    } catch (error) {
      console.error('body metric trend load failed', error);
      setFailed(true);
    }
  }, [kind, userId, db]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const kindLabel = kind ? BODY_METRIC_KIND_LABELS[kind] : 'Measurement';
  const windowStart = bodyMetricWindowStart(today, window);
  const windowedPoints = pointsInWindow(rawPoints ?? [], windowStart);
  const points: TrendPoint[] = kind
    ? windowedPoints.map((point) => ({
        key: point.date,
        value: Number(point.value),
        valueLabel: formatBodyMetricDisplayValue(kind, point.value, weightUnit),
        dateLabel: formatChartDateLabel(point.date),
      }))
    : [];
  const latest = points.length > 0 ? points[points.length - 1] : null;

  const state = deriveBodyMetricTrendState({ failed, allPoints: rawPoints, windowedPointCount: points.length });

  return (
    <View className="flex-1 bg-background">
      <View className="px-md pt-md">
        <NavBackButton fallbackHref="/body-metrics" />
      </View>
      <BodyMetricTrendView
        state={state}
        kindLabel={kindLabel}
        window={window}
        onSelectWindow={(id) => setWindow(resolveWindow(id))}
        points={points}
        latest={latest}
        colors={colors}
        chartWidth={resolveChartWidth(width)}
        onLogPress={() => setLogSheetOpen(true)}
      />
      {logSheetOpen && userId && kind ? (
        <MetricEntrySheet
          userId={userId}
          kind={kind}
          db={db}
          onCancel={() => setLogSheetOpen(false)}
          onLogged={() => {
            setLogSheetOpen(false);
            void reload();
          }}
        />
      ) : null}
    </View>
  );
}
