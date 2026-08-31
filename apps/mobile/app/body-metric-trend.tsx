import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
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
import { NavBackButton } from '@/components/NavBackButton';
import { resolveChartWidth, TrendChart, type TrendPoint } from '@/components/TrendChart';
import { authClient } from '@/lib/auth-client';
import { formatChartDateLabel } from '@/lib/analytics/chart-labels';
import { loadBodyMetricTrend, type BodyMetricTrendPoint } from '@/lib/db/body-metric-trend-query';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { loadWeightUnit } from '@/lib/db/preferences';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

const MIDDLE_DOT = ' · ';
const DEFAULT_WEIGHT_UNIT: WeightUnit = 'kg';

// T-12-15: an unrecognised or missing kind resolves to null rather than being interpolated into a
// query — the screen renders its empty state for it instead of crashing or querying freely.
function resolveKind(raw: string | undefined): BodyMetricKind | null {
  return typeof raw === 'string' && BODY_METRIC_KIND_SET.has(raw) ? (raw as BodyMetricKind) : null;
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

export interface BodyMetricTrendViewProps {
  kindLabel: string;
  points: TrendPoint[];
  latest: TrendPoint | null;
  colors: ThemeColors;
  chartWidth: number;
}

// Hook-free — direct-invocable by a test and the durability harness, matching
// ExercisePerformanceScreenView's split. This is Task 1's own slice: kind name, headline figure,
// the shipped TrendChart reused unchanged (D-11). Window switch, dual empty states and the entries
// list are Tasks 2/3.
export function BodyMetricTrendView({ kindLabel, points, latest, colors, chartWidth }: BodyMetricTrendViewProps) {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ gap: 24, padding: 24 }}>
      <Text className="text-heading font-semibold text-foreground">{kindLabel}</Text>

      {latest ? (
        <View className="gap-xs">
          <Text className="text-display font-semibold text-foreground">{latest.valueLabel}</Text>
          <Text className="text-label font-normal text-foreground-muted">{`Latest${MIDDLE_DOT}${latest.dateLabel}`}</Text>
        </View>
      ) : null}

      {points.length > 0 ? (
        <TrendChart points={points} colors={colors} width={chartWidth} metricLabel={kindLabel} rangeLabel="all time" />
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

  const [rawPoints, setRawPoints] = useState<BodyMetricTrendPoint[] | null>(null);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(DEFAULT_WEIGHT_UNIT);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        if (!kind) {
          if (active) setRawPoints([]);
          return;
        }
        const database = db ?? getPowerSync();
        const [loaded, unit] = await Promise.all([
          loadBodyMetricTrend({ userId, kind, windowStart: null }, database),
          userId ? loadWeightUnit(userId, database) : Promise.resolve(DEFAULT_WEIGHT_UNIT),
        ]);
        if (!active) return;
        setRawPoints(loaded);
        setWeightUnit(unit);
      })();

      return () => {
        active = false;
      };
    }, [kind, userId, db]),
  );

  const kindLabel = kind ? BODY_METRIC_KIND_LABELS[kind] : 'Measurement';
  const points: TrendPoint[] = kind
    ? (rawPoints ?? []).map((point) => ({
        key: point.date,
        value: Number(point.value),
        valueLabel: formatBodyMetricDisplayValue(kind, point.value, weightUnit),
        dateLabel: formatChartDateLabel(point.date),
      }))
    : [];
  const latest = points.length > 0 ? points[points.length - 1] : null;

  return (
    <View className="flex-1 bg-background">
      <View className="px-md pt-md">
        <NavBackButton fallbackHref="/body-metrics" />
      </View>
      <BodyMetricTrendView kindLabel={kindLabel} points={points} latest={latest} colors={colors} chartWidth={resolveChartWidth(width)} />
    </View>
  );
}
