import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import type { BodyMetricKind, WeightUnit } from '@fitness/api-contracts';
import { BodyMetricRow } from '@/components/BodyMetricRow';
import { MetricEntrySheet } from '@/components/MetricEntrySheet';
import { NavBackButton } from '@/components/NavBackButton';
import { formatChartDateLabel } from '@/lib/analytics/chart-labels';
import { authClient } from '@/lib/auth-client';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { loadWeightUnit } from '@/lib/db/preferences';
import { loadTrackedKindSummaries, type TrackedKindSummary } from '@/lib/db/body-metrics';

const DEFAULT_WEIGHT_UNIT: WeightUnit = 'kg';

export interface BodyMetricsScreenViewProps {
  rows: TrackedKindSummary[];
  weightUnit: WeightUnit;
  onRowPress: (kind: BodyMetricKind) => void;
  onLogPress: (kind: BodyMetricKind) => void;
}

// Hook-free — the screen's own branches are unit-testable without a renderer, matching
// RecordsScreenView/HomeScreen's split. Row list only in this task; 12-02 Task 3 adds the
// loading/error/empty derivation and the "Track a measurement" row beneath it.
export function BodyMetricsScreenView({ rows, weightUnit, onRowPress, onLogPress }: BodyMetricsScreenViewProps) {
  return (
    <View className="flex-1 bg-background">
      <Text className="px-lg pt-md text-heading font-semibold text-foreground">Body Metrics</Text>

      <View className="gap-sm px-lg pt-lg">
        {rows.map((row) => (
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

  const [rows, setRows] = useState<TrackedKindSummary[]>([]);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(DEFAULT_WEIGHT_UNIT);
  const [activeKind, setActiveKind] = useState<BodyMetricKind | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    const database = db ?? getPowerSync();
    const [loadedRows, unit] = await Promise.all([loadTrackedKindSummaries(userId, database), loadWeightUnit(userId, database)]);
    setRows(loadedRows);
    setWeightUnit(unit);
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
        rows={rows}
        weightUnit={weightUnit}
        onRowPress={(kind) => router.push(`/body-metric-trend?kind=${kind}`)}
        onLogPress={(kind) => setActiveKind(kind)}
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
    </View>
  );
}
