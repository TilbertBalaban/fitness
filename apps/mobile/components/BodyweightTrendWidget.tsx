import { rollingWindowStart } from '@fitness/analytics-engine';
import { formatWeight, type WeightUnit } from '@fitness/api-contracts';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { formatChartDateLabel } from '@/lib/analytics/chart-labels';
import { captureCalendarDay } from '@/lib/calendar-day';
import { loadBodyMetricTrend, type BodyMetricTrendPoint } from '@/lib/db/body-metric-trend-query';
import { loadWeightUnit } from '@/lib/db/preferences';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { resolveChartWidth, TrendChart, type TrendPoint } from './TrendChart';
import { useThemeColors } from '@/lib/theme-colors';

// R32 — a named constant, not a numeral at the call site. A dashboard glance answers "where am I
// lately," independent of the full trend screen's selectable 1m/3m/1y/all window (12-UI-SPEC
// design decision 16).
export const BODYWEIGHT_TREND_WIDGET_WINDOW_DAYS = 30;

const BODYWEIGHT_KIND = 'bodyweight' as const;

function toTrendPoint(point: BodyMetricTrendPoint, weightUnit: WeightUnit): TrendPoint {
  return {
    key: point.date,
    value: Number(point.value),
    valueLabel: formatWeight(point.value, weightUnit),
    dateLabel: formatChartDateLabel(point.date),
  };
}

export interface BodyweightTrendWidgetProps {
  userId: string | null;
  db?: WriteDb;
}

// D-23's bodyweight_trend widget — the shipped TrendChart wrapped at a fixed 30-day window, via
// 12-04's loadBodyMetricTrend. Renders nothing at all when the user has never logged a `bodyweight`
// entry (R29: this widget owns its own absence).
export function BodyweightTrendWidget({ userId, db }: BodyweightTrendWidgetProps) {
  const router = useRouter();
  const colors = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  const [points, setPoints] = useState<TrendPoint[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        try {
          const resolvedDb = db ?? getPowerSync();
          const today = captureCalendarDay(new Date()).localDate;
          const windowStart = rollingWindowStart(today, BODYWEIGHT_TREND_WIDGET_WINDOW_DAYS);
          const [rawPoints, weightUnit] = await Promise.all([
            loadBodyMetricTrend({ userId, kind: BODYWEIGHT_KIND, windowStart }, resolvedDb),
            userId ? loadWeightUnit(userId, resolvedDb) : Promise.resolve<WeightUnit>('kg'),
          ]);
          if (!active) return;
          setPoints(rawPoints.map((point) => toTrendPoint(point, weightUnit)));
        } catch (error) {
          console.error('bodyweight trend widget load failed', error);
          if (active) setPoints([]);
        }
      })();

      return () => {
        active = false;
      };
    }, [userId, db]),
  );

  if (!points || points.length === 0) return null;

  return (
    <View className="gap-md rounded-md bg-surface p-md">
      <Text className="text-body font-semibold text-foreground">Bodyweight</Text>
      <TrendChart
        points={points}
        colors={colors}
        width={resolveChartWidth(windowWidth)}
        metricLabel="Weight"
        rangeLabel="the last 30 days"
      />
      <Pressable
        onPress={() => router.push('/body-metric-trend?kind=bodyweight')}
        accessibilityRole="button"
        accessibilityLabel="View trend"
        style={{ minHeight: 48, justifyContent: 'center' }}
      >
        <Text className="text-body font-normal text-accent">View trend</Text>
      </Pressable>
    </View>
  );
}
