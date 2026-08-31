import { Pressable, Text, View } from 'react-native';

// The same middle-dot separator RecordRow/BodyMetricRow already use for "join a few short facts on
// one line" — one vocabulary, not a second one invented here.
const MIDDLE_DOT = ' · ';

export interface MetricEntryRowViewProps {
  // Already formatted by the caller at the caller's resolved display unit — this row performs no
  // conversion and never inspects the stored canonical value.
  valueLabel: string;
  dateLabel: string;
  timeLabel: string;
  onPress: () => void;
}

// Hook-free, mirroring RecordRowView's thumbnail-less, chevron-less shape — this row renders no
// icon at all (S6's own anatomy has none), so unlike BodyMetricRowView it needs no `colors` prop
// and no theme-resolving wrapper.
export function MetricEntryRowView({ valueLabel, dateLabel, timeLabel, onPress }: MetricEntryRowViewProps) {
  const factLine = `${dateLabel}${MIDDLE_DOT}${timeLabel}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${valueLabel}, logged ${dateLabel} at ${timeLabel}`}
      className="rounded-md bg-surface px-md py-sm"
      style={{ minHeight: 48 }}
    >
      {/* Neither line takes a line clamp (R4): a long value or date/time line wraps and the row grows. */}
      <View className="justify-center gap-xs">
        <Text className="text-body font-normal text-foreground">{valueLabel}</Text>
        <Text className="text-label font-normal text-foreground-muted">{factLine}</Text>
      </View>
    </Pressable>
  );
}

export type MetricEntryRowProps = MetricEntryRowViewProps;

// No theme colours are needed (no icon), so this is a trivial pass-through rather than a
// useThemeColors wrapper — kept as its own export anyway to match the RecordRow/BodyMetricRow
// exported-pair shape every caller in this codebase already expects.
export function MetricEntryRow(props: MetricEntryRowProps) {
  return <MetricEntryRowView {...props} />;
}
