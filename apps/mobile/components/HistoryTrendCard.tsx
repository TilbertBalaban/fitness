import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import {
  historyTrendSeries,
  HISTORY_TREND_METRICS,
  TREND_BUCKET_DAYS,
  TREND_WEEKS,
  type HistoryTrendMetricId,
  type HistoryTrendResult,
  type TrendDelta,
  type TrendSessionInput,
} from '@fitness/analytics-engine';
import { formatWeight, type WeightUnit } from '@fitness/api-contracts';
import { SegmentedChipRow, type SegmentedChipOption } from '@/components/SegmentedChipRow';
import { resolveChartWidth, TrendChart, type TrendPoint } from '@/components/TrendChart';
import { formatChartDateLabel, pluralizeCount } from '@/lib/analytics/chart-labels';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

const HEADING = 'Trends';
const METRIC_GROUP_LABEL = 'Trend metric';

const METRIC_OPTIONS: SegmentedChipOption[] = [
  { id: 'volume', label: 'Volume' },
  { id: 'sets', label: 'Sets' },
  { id: 'workouts', label: 'Workouts' },
];

const METRIC_ANNOUNCEMENTS: Record<HistoryTrendMetricId, string> = {
  volume: 'Volume',
  sets: 'Sets',
  workouts: 'Workouts',
};

// Stated in days rather than in weeks: the buckets are rolling seven-day windows walked backwards
// from today, and calling them weeks would let a reader infer a calendar boundary the data does not
// have (D-07). The span is derived from the package's constants, never spelled as a literal (R21).
const RANGE_LABEL = `Last ${TREND_WEEKS * TREND_BUCKET_DAYS} days`;

// The comparison the chip's copy describes, in the same words the Copywriting Contract pins.
const DELTA_COMPARISON = `vs previous ${TREND_BUCKET_DAYS} days`;

export function formatTrendHeadline(metric: HistoryTrendMetricId, value: number, unit: WeightUnit): string {
  if (metric === 'volume') return formatWeight(value.toFixed(3), unit);
  if (metric === 'sets') return pluralizeCount(value, 'set', 'sets');
  return pluralizeCount(value, 'workout', 'workouts');
}

export interface TrendDeltaDisplay {
  glyph: 'arrow-up' | 'arrow-down';
  // The card resolves this to the accent or the muted foreground. The destructive colour is not
  // reachable from here at all: a down week is information, not an error (R19).
  improving: boolean;
  text: string;
}

// Null means "render no chip", which is the correct answer for four separate situations: an
// unchanged window, a window that cannot honestly be compared, and — the trap — either signed
// branch whose magnitude rounds away to nothing. A chip reading "0%" is noise whichever branch
// produced it, so the rounding happens before the decision to render, not after.
export function formatTrendDelta(delta: TrendDelta): TrendDeltaDisplay | null {
  if (delta.kind === 'unchanged' || delta.kind === 'not-comparable') return null;

  const percent = Math.round(delta.percent);
  if (percent === 0) return null;

  const improving = delta.kind === 'improving';
  return {
    glyph: improving ? 'arrow-up' : 'arrow-down',
    improving,
    text: `${percent}% ${DELTA_COMPARISON}`,
  };
}

function resolveMetric(raw: string): HistoryTrendMetricId {
  return HISTORY_TREND_METRICS.includes(raw as HistoryTrendMetricId)
    ? (raw as HistoryTrendMetricId)
    : HISTORY_TREND_METRICS[0];
}

export interface HistoryTrendCardViewProps {
  // Null covers both "the read has not landed or failed" and "there is nothing to draw" — the card
  // renders nothing for either, so the History tab's own shipped states own the screen alone.
  result: HistoryTrendResult | null;
  metric: HistoryTrendMetricId;
  onSelectMetric: (id: string) => void;
  weightUnit: WeightUnit;
  colors: ThemeColors;
  width: number;
}

// Hook-free and computation-free beyond formatting, so a test invokes it directly with no renderer.
export function HistoryTrendCardView({
  result,
  metric,
  onSelectMetric,
  weightUnit,
  colors,
  width,
}: HistoryTrendCardViewProps) {
  if (result === null || result.points.length === 0 || result.currentValue === null) return null;

  const points: TrendPoint[] = result.points.map((point) => ({
    key: point.key,
    value: point.value,
    valueLabel: formatTrendHeadline(metric, point.value, weightUnit),
    // The bucket's FIRST day, not its last: an end-date label on the trailing bucket reads as
    // "there is a data point today", which is a claim about when the lifter trained rather than
    // about which window the figure covers.
    dateLabel: formatChartDateLabel(point.startLocalDate),
  }));
  const delta = formatTrendDelta(result.delta);

  return (
    <View className="mb-md gap-md rounded-md bg-surface p-md">
      <Text className="text-body font-semibold text-foreground">{HEADING}</Text>

      <SegmentedChipRow
        groupLabel={METRIC_GROUP_LABEL}
        options={METRIC_OPTIONS}
        selectedId={metric}
        onSelect={onSelectMetric}
      />

      <Text className="text-display font-semibold text-foreground">
        {formatTrendHeadline(metric, result.currentValue, weightUnit)}
      </Text>

      {delta ? (
        <View className="flex-row flex-wrap items-center gap-xs">
          <Ionicons
            name={delta.glyph}
            size={16}
            color={delta.improving ? colors.accent : colors.foregroundMuted}
          />
          <Text className={`text-label font-normal ${delta.improving ? 'text-accent' : 'text-foreground-muted'}`}>
            {delta.text}
          </Text>
        </View>
      ) : null}

      <TrendChart
        points={points}
        colors={colors}
        width={width}
        metricLabel={METRIC_ANNOUNCEMENTS[metric]}
        rangeLabel={RANGE_LABEL}
      />
    </View>
  );
}

export interface HistoryTrendCardProps {
  // Null while the read has not landed, and after a failure — the host logs, the card disappears.
  sessions: TrendSessionInput[] | null;
  todayLocalDate: string;
  weightUnit: WeightUnit;
}

// The wrapper owns the metric selection and resolves the theme and the chart width, matching the
// shipped view/wrapper pair and the shipped width-resolver idiom. The selection lives here rather
// than on the host's view model because it is view state for the tab's lifetime and is written
// nowhere.
export function HistoryTrendCard({ sessions, todayLocalDate, weightUnit }: HistoryTrendCardProps) {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const [metric, setMetric] = useState<HistoryTrendMetricId>(HISTORY_TREND_METRICS[0]);

  const result = sessions === null ? null : historyTrendSeries({ sessions, metric, todayLocalDate });

  return (
    <HistoryTrendCardView
      result={result}
      metric={metric}
      onSelectMetric={(id) => setMetric(resolveMetric(id))}
      weightUnit={weightUnit}
      colors={colors}
      width={resolveChartWidth(width)}
    />
  );
}
