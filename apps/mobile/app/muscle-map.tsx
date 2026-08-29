import { eq } from 'drizzle-orm';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import {
  MUSCLE_MAP_ROW_ORDER,
  MUSCLE_MAP_WINDOW_CHIP_LABELS,
  MUSCLE_MAP_WINDOW_LABELS,
  MUSCLE_MAP_WINDOWS,
  type MuscleMapPoint,
  type MuscleMapWindowId,
} from '@fitness/analytics-engine';
import type { WeightUnit, WorkoutSessionStatus } from '@fitness/api-contracts';
import { MUSCLE_FIGURE_HEIGHT, MuscleHeatmap, resolveMuscleMapFigureWidth, type MuscleHeatmapPoint } from '@/components/MuscleHeatmap';
import { MuscleVolumeRow, type MuscleVolumeRowPoint } from '@/components/MuscleVolumeRow';
import { NavBackButton } from '@/components/NavBackButton';
import { SegmentedChipRow, type SegmentedChipOption } from '@/components/SegmentedChipRow';
import { authClient } from '@/lib/auth-client';
import { formatMuscleVolumeLabel, MUSCLE_MAP_VOLUME_CAPTION, staleRollupCaption } from '@/lib/analytics/muscle-map-labels';
import { captureCalendarDay } from '@/lib/calendar-day';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { loadWeightUnit } from '@/lib/db/preferences';
import { workoutSession } from '@/lib/db/schema';
import { loadMuscleMapWindow, type MuscleMapWindowData } from '@/lib/db/muscle-volume-query';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

const DEFAULT_WEIGHT_UNIT: WeightUnit = 'kg';
const DEFAULT_WINDOW: MuscleMapWindowId = MUSCLE_MAP_WINDOWS[0];
const COMPLETED_STATUS: WorkoutSessionStatus = 'completed';

const WINDOW_OPTIONS: SegmentedChipOption[] = MUSCLE_MAP_WINDOWS.map((id) => ({
  id,
  label: MUSCLE_MAP_WINDOW_CHIP_LABELS[id],
}));

function resolveWindow(raw: string): MuscleMapWindowId {
  return (MUSCLE_MAP_WINDOWS as readonly string[]).includes(raw) ? (raw as MuscleMapWindowId) : DEFAULT_WINDOW;
}

// Bounded existence check, never the window-scoped read: a lifter with real history outside the
// selected window must never be told they have none at all (the classifier's whole reason for
// keeping this a separate signal from the window data).
async function loadHasAnyHistory(userId: string | null, db: WriteDb): Promise<boolean> {
  if (!userId) return false;
  const rows = await db
    .select({ id: workoutSession.id })
    .from(workoutSession)
    .where(eq(workoutSession.status, COMPLETED_STATUS))
    .limit(1);
  return rows.length > 0;
}

export type MuscleMapScreenState = 'error' | 'loading' | 'no-history' | 'nothing-in-window' | 'ready';

export interface MuscleMapScreenStateInput {
  failed: boolean;
  data: MuscleMapWindowData | null;
  hasHistory: boolean | null;
}

// Mirrors deriveRecordsScreenState's shape exactly: error beats everything, and a read that has not
// landed (either signal) is never reported as empty. nothing-in-window is distinguished from
// no-history by hasHistory alone, never by whether the selected window's points are all
// untrained — conflating the two would tell a lifter with years of training they have no history
// because they picked a quiet week.
export function deriveMuscleMapScreenState({ failed, data, hasHistory }: MuscleMapScreenStateInput): MuscleMapScreenState {
  if (failed) return 'error';
  if (data === null || hasHistory === null) return 'loading';
  if (!hasHistory) return 'no-history';
  const anyTrained = data.points.some((point) => point.trainingVolumeKg !== null);
  return anyTrained ? 'ready' : 'nothing-in-window';
}

export interface MuscleMapRowViewModel {
  muscleGroupId: string;
  muscleName: string;
  point: MuscleVolumeRowPoint;
  valueLabel: string | null;
}

function toHeatmapPoint(point: MuscleMapPoint, muscleName: string, weightUnit: WeightUnit): MuscleHeatmapPoint {
  return {
    ...point,
    muscleName,
    volumeLabel: point.trainingVolumeKg === null ? null : formatMuscleVolumeLabel(point.trainingVolumeKg, weightUnit),
  };
}

function toRowViewModel(point: MuscleMapPoint, muscleName: string, weightUnit: WeightUnit): MuscleMapRowViewModel {
  return {
    muscleGroupId: point.muscleGroupId,
    muscleName,
    point: { trainingVolumeKg: point.trainingVolumeKg, setCount: point.setCount, relativeIntensity: point.relativeIntensity },
    valueLabel: point.trainingVolumeKg === null ? null : formatMuscleVolumeLabel(point.trainingVolumeKg, weightUnit),
  };
}

export interface MuscleMapScreenViewProps {
  state: MuscleMapScreenState;
  windowId: MuscleMapWindowId;
  onSelectWindow: (id: string) => void;
  heatmapPoints: MuscleHeatmapPoint[];
  frontRows: MuscleMapRowViewModel[];
  backRows: MuscleMapRowViewModel[];
  overlaySessionCount: number;
  colors: ThemeColors;
  frontWidth: number;
  backWidth: number;
  onMusclePress: (muscleGroupId: string) => void;
}

// A plain function, called rather than rendered as a JSX tag — WorkoutSummary.tsx's renderPrBadges
// precedent, matching records.tsx's own renderStateBlock: an element stays an opaque, unexpanded
// node to a test that walks the tree by direct invocation.
function renderStateBlock(heading: string, body: string) {
  return (
    <View className="gap-xs">
      <Text className="text-heading font-semibold text-foreground">{heading}</Text>
      <Text className="text-body font-normal text-foreground-muted">{body}</Text>
    </View>
  );
}

// Hook-free so a test and the durability harness can render it directly. Every string comes from
// the Copywriting Contract verbatim.
export function MuscleMapScreenView({
  state,
  windowId,
  onSelectWindow,
  heatmapPoints,
  frontRows,
  backRows,
  overlaySessionCount,
  colors,
  frontWidth,
  backWidth,
  onMusclePress,
}: MuscleMapScreenViewProps) {
  const windowLabel = MUSCLE_MAP_WINDOW_LABELS[windowId];
  const switchAndCaptionsVisible = state !== 'error' && state !== 'no-history';
  const figuresVisible = state === 'nothing-in-window' || state === 'ready';
  const rowsVisible = state === 'nothing-in-window' || state === 'ready';
  const staleCaption = staleRollupCaption(overlaySessionCount);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ gap: 24, padding: 24 }}>
      <Text className="text-heading font-semibold text-foreground">Muscle Map</Text>

      {switchAndCaptionsVisible ? (
        <>
          <SegmentedChipRow groupLabel="Window" options={WINDOW_OPTIONS} selectedId={windowId} onSelect={onSelectWindow} />
          <Text className="text-label font-normal text-foreground-muted">{MUSCLE_MAP_VOLUME_CAPTION}</Text>
          {staleCaption === null ? null : (
            <Text className="text-label font-normal text-foreground-muted">{staleCaption}</Text>
          )}
        </>
      ) : null}

      {state === 'error'
        ? renderStateBlock("Muscle map couldn't load", 'Restart the app to try again. Your programs and history are safe.')
        : null}

      {state === 'no-history'
        ? renderStateBlock('No history to show', 'Log a workout and your muscle map starts here.')
        : null}

      {state === 'nothing-in-window'
        ? renderStateBlock(`Nothing logged in ${windowLabel}`, 'Try a longer range.')
        : null}

      {/* R6: a local read never shows a spinner — two surface-coloured blocks at the figures' own
          dimensions, replaced once the read lands. */}
      {state === 'loading' ? (
        <View className="flex-row gap-md">
          <View className="rounded-md bg-surface" style={{ width: frontWidth, height: MUSCLE_FIGURE_HEIGHT }} />
          <View className="rounded-md bg-surface" style={{ width: backWidth, height: MUSCLE_FIGURE_HEIGHT }} />
        </View>
      ) : null}

      {figuresVisible ? (
        <MuscleHeatmap points={heatmapPoints} colors={colors} frontWidth={frontWidth} backWidth={backWidth} windowLabel={windowLabel} />
      ) : null}

      {rowsVisible ? (
        <>
          <View className="gap-sm">
            <Text className="text-body font-semibold text-foreground">Front</Text>
            {frontRows.map((row) => (
              <MuscleVolumeRow
                key={row.muscleGroupId}
                point={row.point}
                muscleName={row.muscleName}
                valueLabel={row.valueLabel}
                onPress={() => onMusclePress(row.muscleGroupId)}
              />
            ))}
          </View>
          <View className="gap-sm">
            <Text className="text-body font-semibold text-foreground">Back</Text>
            {backRows.map((row) => (
              <MuscleVolumeRow
                key={row.muscleGroupId}
                point={row.point}
                muscleName={row.muscleName}
                valueLabel={row.valueLabel}
                onPress={() => onMusclePress(row.muscleGroupId)}
              />
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

export interface MuscleMapScreenProps {
  // The durability harness's seam, matching the shipped records/programs/performance routes: mounts
  // this exact route against a caller-chosen db/userId instead of the production singleton. Both are
  // undefined for every real navigation, so production behaviour is unchanged.
  userId?: string;
  db?: WriteDb;
}

export default function MuscleMapScreen({ userId: userIdOverride, db }: MuscleMapScreenProps = {}) {
  const session = authClient.useSession();
  const userId = userIdOverride ?? session.data?.user?.id ?? null;
  const colors = useThemeColors();
  const { width } = useWindowDimensions();

  const [windowId, setWindowId] = useState<MuscleMapWindowId>(DEFAULT_WINDOW);
  const [data, setData] = useState<MuscleMapWindowData | null>(null);
  const [hasHistory, setHasHistory] = useState<boolean | null>(null);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(DEFAULT_WEIGHT_UNIT);
  const [failed, setFailed] = useState(false);
  // 10-06's seam: this plan renders nothing for a non-null value and never routes anywhere from it.
  const [selectedMuscleGroupId, setSelectedMuscleGroupId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setData(null);
      setHasHistory(null);

      void (async () => {
        try {
          const database = db ?? getPowerSync();
          const todayLocalDate = captureCalendarDay(new Date()).localDate;
          const [loaded, history, unit] = await Promise.all([
            loadMuscleMapWindow({ userId, todayLocalDate, windowId }, database),
            loadHasAnyHistory(userId, database),
            userId ? loadWeightUnit(userId, database) : Promise.resolve(DEFAULT_WEIGHT_UNIT),
          ]);
          if (!active) return;
          setData(loaded);
          setHasHistory(history);
          setWeightUnit(unit);
          setFailed(false);
        } catch (error) {
          console.error('muscle map load failed', error);
          if (!active) return;
          setFailed(true);
        }
      })();

      return () => {
        active = false;
      };
    }, [userId, windowId, db]),
  );

  const points = data?.points ?? [];
  const muscleNames = data?.muscleNames ?? new Map<string, string>();
  const heatmapPoints = points.map((point) => toHeatmapPoint(point, muscleNames.get(point.muscleGroupId) ?? '', weightUnit));
  const frontRows = MUSCLE_MAP_ROW_ORDER.front.map((muscleGroupId) => {
    const point = points.find((candidate) => candidate.muscleGroupId === muscleGroupId);
    return point ? toRowViewModel(point, muscleNames.get(muscleGroupId) ?? '', weightUnit) : null;
  }).filter((row): row is MuscleMapRowViewModel => row !== null);
  const backRows = MUSCLE_MAP_ROW_ORDER.back.map((muscleGroupId) => {
    const point = points.find((candidate) => candidate.muscleGroupId === muscleGroupId);
    return point ? toRowViewModel(point, muscleNames.get(muscleGroupId) ?? '', weightUnit) : null;
  }).filter((row): row is MuscleMapRowViewModel => row !== null);

  return (
    <View className="flex-1 bg-background">
      <View className="px-md pt-md">
        <NavBackButton fallbackHref="/(tabs)/history" />
      </View>
      <MuscleMapScreenView
        state={deriveMuscleMapScreenState({ failed, data, hasHistory })}
        windowId={windowId}
        onSelectWindow={(id) => setWindowId(resolveWindow(id))}
        heatmapPoints={heatmapPoints}
        frontRows={frontRows}
        backRows={backRows}
        overlaySessionCount={data?.overlaySessionCount ?? 0}
        colors={colors}
        frontWidth={resolveMuscleMapFigureWidth(width)}
        backWidth={resolveMuscleMapFigureWidth(width)}
        onMusclePress={setSelectedMuscleGroupId}
      />
      {/* 10-06's seam: a non-null selectedMuscleGroupId mounts the drill-down sheet here in a later
          wave. This plan renders nothing for it and routes nowhere from it. */}
    </View>
  );
}
