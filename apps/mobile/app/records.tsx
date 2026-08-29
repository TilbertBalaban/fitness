import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { PR_TYPES, type PrType, type WeightUnit } from '@fitness/api-contracts';
import { E1RM_MAX_VALID_REPS } from '@fitness/pr-rules';
import { NavBackButton } from '@/components/NavBackButton';
import { RecordRow } from '@/components/RecordRow';
import { SegmentedChipRow, type SegmentedChipOption } from '@/components/SegmentedChipRow';
import { authClient } from '@/lib/auth-client';
import { PERFORMANCE_METRIC_FOR_PR_TYPE, PR_TYPE_CHIP_LABELS } from '@/lib/analytics/pr-vocabulary';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { loadWeightUnit } from '@/lib/db/preferences';
import { formatRecordValue, loadRecordsPage, type RecordListRow, type RecordsPage } from '@/lib/db/records-query';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

const PAGE_SIZE = 25;
const SKELETON_ROW_COUNT = 3;
const DEFAULT_PR_TYPE: PrType = 'heaviest_weight';
const DEFAULT_WEIGHT_UNIT: WeightUnit = 'kg';

// Derived from the shipped enum, never a parallel list: the vocabulary IS PR_TYPES, so a fifth
// metric appears here automatically rather than being silently absent from the switch.
const METRIC_OPTIONS: SegmentedChipOption[] = PR_TYPES.map((prType) => ({
  id: prType,
  label: PR_TYPE_CHIP_LABELS[prType],
}));

export type RecordsScreenState = 'error' | 'loading' | 'empty' | 'ready';

export interface RecordsScreenStateInput {
  failed: boolean;
  page: RecordsPage | null;
}

// Mirrors deriveHistoryScreenState's shape exactly: error beats everything, a null page means the
// read has not landed yet, and a landed page with no rows is the real empty state. Reporting a
// not-yet-landed read as empty would tell a lifter their records are gone while they are still
// being read.
export function deriveRecordsScreenState({ failed, page }: RecordsScreenStateInput): RecordsScreenState {
  if (failed) return 'error';
  if (page === null) return 'loading';
  if (page.rows.length === 0) return 'empty';
  return 'ready';
}

export interface RecordsScreenViewProps {
  state: RecordsScreenState;
  rows: RecordListRow[];
  prType: PrType;
  weightUnit: WeightUnit;
  colors: ThemeColors;
  onSelectMetric: (id: string) => void;
  onRowPress: (row: RecordListRow) => void;
  onEndReached: () => void;
}

// A plain function, called rather than rendered as a JSX tag — WorkoutSummary.tsx's renderPrBadges
// established this for the same trap: a <StateBlock /> element stays an opaque, unexpanded node to
// a test that walks the tree by direct invocation with no renderer.
function renderStateBlock(heading: string, body: string) {
  return (
    <View className="gap-xs px-lg pt-lg">
      <Text className="text-heading font-semibold text-foreground">{heading}</Text>
      <Text className="text-body font-normal text-foreground-muted">{body}</Text>
    </View>
  );
}

// The rep cap is interpolated from the imported constant, never spelled as a numeral in source —
// the Copywriting Contract's last row requires it, so the copy and the rule cannot drift.
function emptyBodyCopy(prType: PrType): string {
  if (prType === 'best_e1rm') return `Estimated 1RM is only shown for sets of ${E1RM_MAX_VALID_REPS} reps or fewer.`;
  return 'Log a set on any exercise and your first record lands here.';
}

// Hook-free so a test and the durability harness can render it directly.
//
// There is deliberately no screen-level empty state separate from the per-metric one: switching
// metrics routinely produces an empty list while another metric still has rows, so the switch stays
// mounted and only the LIST AREA is replaced. One code path, one behaviour — and a lifter is never
// stranded on an empty screen with no way back to a metric that has records.
export function RecordsScreenView({
  state,
  rows,
  prType,
  weightUnit,
  colors,
  onSelectMetric,
  onRowPress,
  onEndReached,
}: RecordsScreenViewProps) {
  return (
    <View className="flex-1 bg-background">
      <Text className="px-lg pt-md text-heading font-semibold text-foreground">Records</Text>

      {state === 'error' ? null : (
        <View className="px-lg pt-md">
          <SegmentedChipRow
            groupLabel="Record metric"
            options={METRIC_OPTIONS}
            selectedId={prType}
            onSelect={onSelectMetric}
          />
        </View>
      )}

      {state === 'error'
        ? renderStateBlock("Records couldn't load", 'Restart the app to try again. Your programs and history are safe.')
        : null}

      {/* R6: a local SQLite read never shows a spinner — the shipped three-row skeleton verbatim. */}
      {state === 'loading' ? (
        <View className="gap-sm px-lg pt-lg">
          {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
            <View key={index} className="rounded-md bg-surface" style={{ height: 64 }} />
          ))}
        </View>
      ) : null}

      {state === 'empty' ? renderStateBlock(`No ${PR_TYPE_CHIP_LABELS[prType]} records yet`, emptyBodyCopy(prType)) : null}

      <FlashList
        data={state === 'ready' ? rows : []}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 32 }}
        onEndReached={onEndReached}
        renderItem={({ item }) => (
          <View className="mb-sm">
            <RecordRow
              row={item}
              valueLabel={formatRecordValue(item, weightUnit)}
              metricLabel={PR_TYPE_CHIP_LABELS[item.prType]}
              onPress={() => onRowPress(item)}
            />
          </View>
        )}
      />
    </View>
  );
}

export interface RecordsScreenProps {
  // The durability harness's seam, matching the shipped gym-profiles, programs and performance
  // routes: mounts this exact route against a caller-chosen db/userId instead of the production
  // singleton. Both are undefined for every real navigation — production behaviour is unchanged.
  userId?: string;
  db?: WriteDb;
}

export default function RecordsScreen({ userId: userIdOverride, db }: RecordsScreenProps = {}) {
  const router = useRouter();
  const colors = useThemeColors();
  const session = authClient.useSession();
  const userId = userIdOverride ?? session.data?.user?.id ?? null;

  // View state only — which metric is selected is never persisted anywhere.
  const [prType, setPrType] = useState<PrType>(DEFAULT_PR_TYPE);
  const [page, setPage] = useState<RecordsPage | null>(null);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(DEFAULT_WEIGHT_UNIT);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // On focus with an active-flag cancellation, exactly as the shipped tabs do — no watched query
  // and no live query. Re-runs on a metric change because prType is a dependency.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setPage(null);

      void (async () => {
        try {
          const database = db ?? getPowerSync();
          const [loaded, unit] = await Promise.all([
            loadRecordsPage({ userId, prType, limit: PAGE_SIZE }, database),
            userId ? loadWeightUnit(userId, database) : Promise.resolve(DEFAULT_WEIGHT_UNIT),
          ]);
          if (!active) return;
          setPage(loaded);
          setWeightUnit(unit);
          setFailed(false);
        } catch (error) {
          console.error('records load failed', error);
          if (!active) return;
          setFailed(true);
        }
      })();

      return () => {
        active = false;
      };
    }, [userId, prType, db]),
  );

  const handleEndReached = useCallback(() => {
    if (!page || page.nextCursor === null || loadingMore) return;
    setLoadingMore(true);

    void (async () => {
      try {
        const next = await loadRecordsPage({ userId, prType, limit: PAGE_SIZE, cursor: page.nextCursor }, db ?? getPowerSync());
        setPage((current) => (current ? { rows: [...current.rows, ...next.rows], nextCursor: next.nextCursor } : next));
      } catch (error) {
        console.error('records page load failed', error);
      } finally {
        setLoadingMore(false);
      }
    })();
  }, [page, userId, prType, db, loadingMore]);

  return (
    <View className="flex-1 bg-background">
      <View className="px-md pt-md">
        <NavBackButton fallbackHref="/(tabs)/history" />
      </View>
      <RecordsScreenView
        state={deriveRecordsScreenState({ failed, page })}
        rows={page?.rows ?? []}
        prType={prType}
        weightUnit={weightUnit}
        colors={colors}
        onSelectMetric={(id) => setPrType(PR_TYPES.includes(id as PrType) ? (id as PrType) : DEFAULT_PR_TYPE)}
        onRowPress={(row) =>
          router.push(`/exercise-performance?exerciseId=${row.exerciseId}&metric=${PERFORMANCE_METRIC_FOR_PR_TYPE[row.prType]}`)
        }
        onEndReached={handleEndReached}
      />
    </View>
  );
}
