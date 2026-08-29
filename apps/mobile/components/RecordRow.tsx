import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { formatChartDateLabel } from '@/lib/analytics/chart-labels';
import type { RecordListRow } from '@/lib/db/records-query';
import { useThemeColors } from '@/lib/theme-colors';

// The same separator SessionHistoryRow and the Home next-up heading already use — one middle-dot
// vocabulary for "join a few short facts on one line", not a second one invented here.
const MIDDLE_DOT = ' · ';

// Slices the stamped ISO instant rather than parsing it into a Date: `new Date(...).getDate()`
// would re-derive the day from the READING device's timezone, so the same record would carry
// different dates on a phone and a browser. The same discipline history-query.ts's formatHistoryDate
// and chart-labels.ts both already document.
function recordDateLabel(achievedAt: string): string {
  return formatChartDateLabel(achievedAt.slice(0, 10));
}

export interface RecordRowViewProps {
  row: RecordListRow;
  // Already formatted by formatRecordValue at the caller's unit — this row performs no conversion
  // and never inspects the stored value, whose meaning differs per metric.
  valueLabel: string;
  metricLabel: string;
  colors: { foregroundMuted: string };
  onPress: () => void;
}

// Hook-free, mirroring SessionHistoryRowView's thumbnail-less shape. The whole body — chevron
// included — is ONE press target: a chevron with its own hit region would give the row two, and a
// reader would reach the same destination twice. The announced name carries the metric because the
// chip row's selection is not otherwise reachable from a row in the reading order.
export function RecordRowView({ row, valueLabel, metricLabel, colors, onPress }: RecordRowViewProps) {
  const dateLabel = recordDateLabel(row.achievedAt);
  const factLine = `${valueLabel}${MIDDLE_DOT}${dateLabel}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.exerciseName}, ${metricLabel} ${valueLabel}, ${dateLabel}`}
      className="flex-row items-center gap-sm rounded-md bg-surface px-md py-sm"
      style={{ minHeight: 48 }}
    >
      {/* Neither line takes a line clamp (R4): a long exercise name wraps and the row grows. */}
      <View className="flex-1 justify-center gap-xs">
        <Text className="text-body font-normal text-foreground">{row.exerciseName}</Text>
        <Text className="text-label font-normal text-foreground-muted">{factLine}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.foregroundMuted} />
    </Pressable>
  );
}

export type RecordRowProps = Omit<RecordRowViewProps, 'colors'>;

export function RecordRow(props: RecordRowProps) {
  const colors = useThemeColors();
  return <RecordRowView {...props} colors={colors} />;
}
