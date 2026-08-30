import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BODY_METRIC_KIND_ORDER, type BodyMetricKind, type WeightUnit } from '@fitness/api-contracts';
import { BodyMetricRow } from '@/components/BodyMetricRow';
import { MetricEntrySheet } from '@/components/MetricEntrySheet';
import { NavBackButton } from '@/components/NavBackButton';
import { TrackKindSheet } from '@/components/TrackKindSheet';
import { formatChartDateLabel } from '@/lib/analytics/chart-labels';
import { authClient } from '@/lib/auth-client';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { loadWeightUnit } from '@/lib/db/preferences';
import { loadTrackedKindSummaries, loadTrackedKinds, type TrackedKindSummary } from '@/lib/db/body-metrics';

const DEFAULT_WEIGHT_UNIT: WeightUnit = 'kg';
// R6 — the shipped three-row skeleton every local-SQLite-backed list in this app uses on first
// paint, matching RecordsScreenView/HomeScreen's own constant.
const SKELETON_ROW_COUNT = 3;

export type BodyMetricsScreenState = 'error' | 'loading' | 'empty' | 'ready';

export interface BodyMetricsScreenStateInput {
  failed: boolean;
  rows: TrackedKindSummary[] | null;
}

// Mirrors deriveRecordsScreenState's shape exactly: error beats everything, a null rows array
// means the read has not landed yet (never reported as empty — that would tell the user their
// measurements are gone while they are still being read), and a landed empty array is the real
// empty state.
export function deriveBodyMetricsScreenState({ failed, rows }: BodyMetricsScreenStateInput): BodyMetricsScreenState {
  if (failed) return 'error';
  if (rows === null) return 'loading';
  if (rows.length === 0) return 'empty';
  return 'ready';
}

// A plain function, called rather than rendered as a JSX tag — records.tsx's renderStateBlock
// precedent, so a direct-invocation test can see inside the block.
function renderStateBlock(heading: string, body: string) {
  return (
    <View className="gap-xs px-lg pt-lg">
      <Text className="text-heading font-semibold text-foreground">{heading}</Text>
      <Text className="text-body font-normal text-foreground-muted">{body}</Text>
    </View>
  );
}

export interface BodyMetricsScreenViewProps {
  state: BodyMetricsScreenState;
  rows: TrackedKindSummary[];
  weightUnit: WeightUnit;
  colors: ThemeColors;
  onRowPress: (kind: BodyMetricKind) => void;
  onLogPress: (kind: BodyMetricKind) => void;
  onTrackPress: () => void;
}

// Hook-free — the screen's own branches are unit-testable without a renderer, matching
// RecordsScreenView/HomeScreen's split. The "Track a measurement" row is fixed chrome, never
// hidden by state (S5: "the path forward is never hidden") — it renders beneath every branch.
export function BodyMetricsScreenView({
  state,
  rows,
  weightUnit,
  colors,
  onRowPress,
  onLogPress,
  onTrackPress,
}: BodyMetricsScreenViewProps) {
  return (
    <View className="flex-1 bg-background">
      <Text className="px-lg pt-md text-heading font-semibold text-foreground">Body Metrics</Text>

      {/* R6 — a local SQLite read never shows a spinner — the shipped three-row skeleton verbatim. */}
      {state === 'loading' ? (
        <View className="gap-sm px-lg pt-lg">
          {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
            <View key={index} className="rounded-md bg-surface" style={{ height: 64 }} />
          ))}
        </View>
      ) : null}

      {state === 'error'
        ? renderStateBlock("Body Metrics couldn't load", 'Restart the app to try again. Your programs and history are safe.')
        : null}

      {state === 'empty' ? renderStateBlock('No measurements yet', 'Track your weight or a measurement to see it here.') : null}

      {state === 'ready' ? (
        <View className="gap-sm px-lg pt-lg">
          {/* Sorted here as well as at the query layer (loadTrackedKindSummaries) — the row list
              this screen renders is never insertion order, regardless of how a caller built it. */}
          {[...rows]
            .sort((a, b) => BODY_METRIC_KIND_ORDER.indexOf(a.kind) - BODY_METRIC_KIND_ORDER.indexOf(b.kind))
            .map((row) => (
              <BodyMetricRow
                key={row.kind}
                kind={row.kind}
                value={row.value}
                weightUnit={weightUnit}
                dateLabel={formatChartDateLabel(row.localDate)}
                onPress={() => onRowPress(row.kind)}
                onLogPress={() => onLogPress(row.kind)}
              />
            ))}
        </View>
      ) : null}

      <View className="px-lg pt-lg">
        <Pressable
          onPress={onTrackPress}
          accessibilityRole="button"
          accessibilityLabel="Track a measurement"
          style={{ minHeight: 48 }}
          className="flex-row items-center gap-sm"
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
          <Text className="text-body font-normal text-accent">Track a measurement</Text>
        </Pressable>
      </View>
    </View>
  );
}

export interface BodyMetricsScreenProps {
  // The durability harness's seam, matching records.tsx/HomeScreen's own shape: mounts this exact
  // route against a caller-chosen db/userId instead of the production singleton.
  userId?: string;
  db?: WriteDb;
}

export default function BodyMetricsScreen({ userId: userIdOverride, db }: BodyMetricsScreenProps = {}) {
  const router = useRouter();
  const session = authClient.useSession();
  const userId = userIdOverride ?? session.data?.user?.id ?? null;
  const colors = useThemeColors();

  const [rows, setRows] = useState<TrackedKindSummary[] | null>(null);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(DEFAULT_WEIGHT_UNIT);
  const [trackedKinds, setTrackedKinds] = useState<ReadonlySet<BodyMetricKind>>(new Set());
  const [failed, setFailed] = useState(false);
  const [activeKind, setActiveKind] = useState<BodyMetricKind | null>(null);
  const [trackSheetOpen, setTrackSheetOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const database = db ?? getPowerSync();
      const [loadedRows, unit, tracked] = await Promise.all([
        loadTrackedKindSummaries(userId, database),
        loadWeightUnit(userId, database),
        loadTrackedKinds(userId, database),
      ]);
      setRows(loadedRows);
      setWeightUnit(unit);
      setTrackedKinds(tracked);
      setFailed(false);
    } catch (error) {
      console.error('body metrics load failed', error);
      setFailed(true);
    }
  }, [userId, db]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <View className="flex-1 bg-background">
      <View className="px-md pt-md">
        <NavBackButton fallbackHref="/(tabs)" />
      </View>
      <BodyMetricsScreenView
        state={deriveBodyMetricsScreenState({ failed, rows })}
        rows={rows ?? []}
        weightUnit={weightUnit}
        colors={colors}
        onRowPress={(kind) => router.push(`/body-metric-trend?kind=${kind}`)}
        onLogPress={(kind) => setActiveKind(kind)}
        onTrackPress={() => setTrackSheetOpen(true)}
      />
      {activeKind && userId ? (
        <MetricEntrySheet
          userId={userId}
          kind={activeKind}
          db={db}
          onCancel={() => setActiveKind(null)}
          onLogged={() => {
            setActiveKind(null);
            void reload();
          }}
        />
      ) : null}
      {trackSheetOpen ? (
        <TrackKindSheet
          trackedKinds={trackedKinds}
          onCancel={() => setTrackSheetOpen(false)}
          onSelect={(kind) => {
            setTrackSheetOpen(false);
            setActiveKind(kind);
          }}
        />
      ) : null}
    </View>
  );
}
