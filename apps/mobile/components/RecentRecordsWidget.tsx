import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PR_TYPES, type WeightUnit } from '@fitness/api-contracts';
import { RecordRow } from './RecordRow';
import { PR_TYPE_CHIP_LABELS } from '@/lib/analytics/pr-vocabulary';
import { loadWeightUnit } from '@/lib/db/preferences';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { formatRecordValue, loadRecordsPage, type RecordListRow } from '@/lib/db/records-query';

// R32 — named, not a numeral at the call site. D-23's widget catalog: the three most recent PRs
// across ALL FOUR metrics (12-UI-SPEC design decision 14), not one metric's own page.
export const RECENT_RECORDS_WIDGET_LIMIT = 3;

// Reads loadRecordsPage once per PR_TYPES member (four batched calls, never a per-row query) and
// merges the results — loadRecordsPage itself is scoped to one metric, this widget is the one
// place that reads across all four and re-sorts by recency.
export async function loadRecentRecords(userId: string | null, db: WriteDb = getPowerSync()): Promise<RecordListRow[]> {
  if (!userId) return [];
  const pages = await Promise.all(
    PR_TYPES.map((prType) => loadRecordsPage({ userId, prType, limit: RECENT_RECORDS_WIDGET_LIMIT }, db)),
  );
  const merged = pages.flatMap((page) => page.rows);
  merged.sort((a, b) => {
    if (a.achievedAt !== b.achievedAt) return a.achievedAt < b.achievedAt ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
  return merged.slice(0, RECENT_RECORDS_WIDGET_LIMIT);
}

export interface RecentRecordsWidgetProps {
  userId: string | null;
  db?: WriteDb;
}

// D-23's recent_records widget — RecordRow reused verbatim, no new analytics. Renders nothing at
// all when zero records exist for any metric (R29: this widget owns its own absence, the host
// never renders on its behalf).
export function RecentRecordsWidget({ userId, db }: RecentRecordsWidgetProps) {
  const router = useRouter();
  const [rows, setRows] = useState<RecordListRow[] | null>(null);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        try {
          const resolvedDb = db ?? getPowerSync();
          const [records, unit] = await Promise.all([
            loadRecentRecords(userId, resolvedDb),
            userId ? loadWeightUnit(userId, resolvedDb) : Promise.resolve<WeightUnit>('kg'),
          ]);
          if (!active) return;
          setRows(records);
          setWeightUnit(unit);
        } catch (error) {
          console.error('recent records load failed', error);
          if (active) setRows([]);
        }
      })();

      return () => {
        active = false;
      };
    }, [userId, db]),
  );

  if (!rows || rows.length === 0) return null;

  return (
    <View className="gap-md rounded-md bg-surface p-md">
      <Text className="text-body font-semibold text-foreground">Recent Records</Text>
      {rows.map((row) => (
        <RecordRow
          key={row.id}
          row={row}
          valueLabel={formatRecordValue(row, weightUnit)}
          metricLabel={PR_TYPE_CHIP_LABELS[row.prType]}
          onPress={() => router.push('/records')}
        />
      ))}
      <Pressable
        onPress={() => router.push('/records')}
        accessibilityRole="button"
        accessibilityLabel="View all records"
        style={{ minHeight: 48, justifyContent: 'center' }}
      >
        <Text className="text-body font-normal text-accent">View all records</Text>
      </Pressable>
    </View>
  );
}
