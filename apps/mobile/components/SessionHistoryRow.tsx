import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { historyRowLabel, type HistorySessionRow } from '@/lib/db/history-query';
import { elapsedWorkoutSeconds, formatClock } from '@/lib/rest-timer';
import { useThemeColors } from '@/lib/theme-colors';

// The same separator the Home next-up heading uses (index.tsx's nextUpHeading) — one middle-dot
// vocabulary for "join a few short facts on one line" across the app, not a second one invented here.
const MIDDLE_DOT = ' · ';

// A completed session always carries endedAt and no open pause, so nowMs resolves to endedAt (or
// startedAt if somehow absent) rather than the reading device's current clock — a history row's
// duration must never change between two renders of the same finished session.
function historyRowDuration(row: Pick<HistorySessionRow, 'startedAt' | 'endedAt' | 'accumulatedPausedSeconds'>): string {
  const startedAtMs = new Date(row.startedAt).getTime();
  const nowMs = row.endedAt ? new Date(row.endedAt).getTime() : startedAtMs;
  const seconds = elapsedWorkoutSeconds({
    startedAtMs,
    accumulatedPausedSeconds: row.accumulatedPausedSeconds,
    pausedAtMs: null,
    nowMs,
  });
  return formatClock(seconds);
}

export interface SessionHistoryRowViewProps {
  row: HistorySessionRow;
  colors: { foregroundMuted: string };
  onPress: () => void;
  onOverflowPress: () => void;
}

// Hook-free — mirrors ExerciseListRow's row shape (thumbnail-less variant): the whole body is one
// press target opening the session summary, plus a trailing 48x48 overflow control that opens
// HistoryActionSheet (05-09 Task 3). Two lines, neither ever sets numberOfLines (R4) — the label
// and the fact line both wrap and grow instead of truncating.
export function SessionHistoryRowView({ row, colors, onPress, onOverflowPress }: SessionHistoryRowViewProps) {
  const label = historyRowLabel(row);
  const factLine = [`${row.exerciseCount} exercises`, `${row.completedSetCount} sets`, historyRowDuration(row)].join(
    MIDDLE_DOT,
  );

  return (
    <View className="flex-row items-center gap-sm rounded-md bg-surface px-md py-sm">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        className="flex-1 justify-center gap-xs"
        style={{ minHeight: 48 }}
      >
        <Text className="text-body font-semibold text-foreground">{label}</Text>
        <Text className="text-label font-normal text-foreground-muted">{factLine}</Text>
      </Pressable>

      <Pressable
        onPress={onOverflowPress}
        accessibilityRole="button"
        accessibilityLabel="More actions"
        className="items-center justify-center"
        style={{ minWidth: 48, minHeight: 48 }}
      >
        <Ionicons name="ellipsis-vertical" size={20} color={colors.foregroundMuted} />
      </Pressable>
    </View>
  );
}

export interface SessionHistoryRowProps {
  row: HistorySessionRow;
  onPress: () => void;
  onOverflowPress: () => void;
}

export function SessionHistoryRow(props: SessionHistoryRowProps) {
  const colors = useThemeColors();
  return <SessionHistoryRowView {...props} colors={colors} />;
}
