import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { MUSCLE_MAP_WINDOW_DAYS, MUSCLE_MAP_WINDOW_LABELS, type MuscleMapPoint } from '@fitness/analytics-engine';
import { captureCalendarDay } from '@/lib/calendar-day';
import { formatMuscleVolumeLabel } from '@/lib/analytics/muscle-map-labels';
import { loadWeightUnit } from '@/lib/db/preferences';
import { loadMuscleMapWindow, type MuscleMapWindowData } from '@/lib/db/muscle-volume-query';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { MuscleHeatmap, resolveMuscleMapFigureWidth, type MuscleHeatmapPoint } from './MuscleHeatmap';
import { useThemeColors } from '@/lib/theme-colors';

// R32 — a named constant, not a numeral at the call site. Equal to MUSCLE_MAP_WINDOWS[0]'s ('1w')
// own PROGRESS_WINDOW_DAYS value (@fitness/analytics-engine) — this widget calls loadMuscleMapWindow
// with that same windowId rather than re-deriving the day count, so the two can never drift.
export const MUSCLE_HEATMAP_WIDGET_WINDOW_DAYS = 7;

if (MUSCLE_MAP_WINDOW_DAYS['1w'] !== MUSCLE_HEATMAP_WIDGET_WINDOW_DAYS) {
  throw new Error("MuscleHeatmapWidget's fixed '1w' query no longer matches MUSCLE_HEATMAP_WIDGET_WINDOW_DAYS");
}

function toHeatmapPoint(point: MuscleMapPoint, muscleName: string, weightUnit: 'kg' | 'lb'): MuscleHeatmapPoint {
  return {
    ...point,
    muscleName,
    volumeLabel: point.trainingVolumeKg === null ? null : formatMuscleVolumeLabel(point.trainingVolumeKg, weightUnit),
  };
}

export interface MuscleHeatmapWidgetProps {
  userId: string | null;
  db?: WriteDb;
}

// D-23's muscle_heatmap widget — the shipped MuscleHeatmap wrapped at a fixed 1-week window, no
// window switch inside the card (12-UI-SPEC design decision 15). Never absent: Phase 10's
// "untrained still renders both figures" rule (10-UI-SPEC design decision 7) applies unchanged, so
// a brand-new user with zero history sees fully-untrained figures rather than no widget at all.
export function MuscleHeatmapWidget({ userId, db }: MuscleHeatmapWidgetProps) {
  const router = useRouter();
  const colors = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  const [data, setData] = useState<MuscleMapWindowData | null>(null);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        try {
          const resolvedDb = db ?? getPowerSync();
          const [windowData, unit] = await Promise.all([
            loadMuscleMapWindow({ userId, todayLocalDate: captureCalendarDay(new Date()).localDate, windowId: '1w' }, resolvedDb),
            userId ? loadWeightUnit(userId, resolvedDb) : Promise.resolve<'kg' | 'lb'>('kg'),
          ]);
          if (!active) return;
          setData(windowData);
          setWeightUnit(unit);
        } catch (error) {
          console.error('muscle heatmap widget load failed', error);
        }
      })();

      return () => {
        active = false;
      };
    }, [userId, db]),
  );

  if (!data) return null;

  const figureWidth = resolveMuscleMapFigureWidth(windowWidth);
  const heatmapPoints = data.points.map((point) => toHeatmapPoint(point, data.muscleNames.get(point.muscleGroupId) ?? '', weightUnit));

  return (
    <View className="gap-md rounded-md bg-surface p-md">
      <Text className="text-body font-semibold text-foreground">Muscle Map</Text>
      <MuscleHeatmap
        points={heatmapPoints}
        colors={colors}
        frontWidth={figureWidth}
        backWidth={figureWidth}
        windowLabel={MUSCLE_MAP_WINDOW_LABELS['1w']}
      />
      <Pressable
        onPress={() => router.push('/muscle-map')}
        accessibilityRole="button"
        accessibilityLabel="View muscle map"
        style={{ minHeight: 48, justifyContent: 'center' }}
      >
        <Text className="text-body font-normal text-accent">View muscle map</Text>
      </Pressable>
    </View>
  );
}
