import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { BODY_METRIC_KIND_LABELS, formatWeight, type BodyMetricKind, type WeightUnit } from '@fitness/api-contracts';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

// The same separator RecordRow/MuscleDrilldownSheet already use for "join a few short facts on one
// line" — one middle-dot vocabulary, not a second one invented here.
const MIDDLE_DOT = ' · ';

export interface BodyMetricRowViewProps {
  kind: BodyMetricKind;
  // The stored canonical value, unparsed by the caller — this row resolves its own display unit
  // and formats it, so BODY_METRIC_KIND_LABELS/the units boundary stay the single source of truth
  // for both what a kind is called and what it is shown in (extended to the full vocabulary by
  // 12-02 Task 2's resolveDisplayUnit/fromCanonicalValue; bodyweight is the only kind this task
  // itself ever renders).
  value: string;
  weightUnit: WeightUnit;
  dateLabel: string;
  colors: ThemeColors;
  onPress: () => void;
  onLogPress: () => void;
}

// Hook-free, mirroring RecordRowView's split — but with a second, independent press target: the
// trailing "+" is not purely decorative (unlike RecordRow's chevron), so it owns its own 48x48 hit
// region rather than sharing the row body's.
export function BodyMetricRowView({ kind, value, weightUnit, dateLabel, colors, onPress, onLogPress }: BodyMetricRowViewProps) {
  const kindLabel = BODY_METRIC_KIND_LABELS[kind];
  const valueLabel = formatWeight(value, weightUnit);
  const factLine = `${valueLabel}${MIDDLE_DOT}${dateLabel}`;

  return (
    <View className="flex-row items-center gap-sm rounded-md bg-surface px-md py-sm">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${kindLabel}, ${valueLabel}, ${dateLabel}`}
        className="flex-1 flex-row items-center gap-sm"
        style={{ minHeight: 48 }}
      >
        {/* Neither line takes a line clamp (R4): a long kind label or fact line wraps and grows. */}
        <View className="flex-1 justify-center gap-xs">
          <Text className="text-body font-normal text-foreground">{kindLabel}</Text>
          <Text className="text-label font-normal text-foreground-muted">{factLine}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.foregroundMuted} />
      </Pressable>
      <Pressable
        onPress={onLogPress}
        accessibilityRole="button"
        accessibilityLabel={`Log ${kindLabel}`}
        style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
      </Pressable>
    </View>
  );
}

export type BodyMetricRowProps = Omit<BodyMetricRowViewProps, 'colors'>;

export function BodyMetricRow(props: BodyMetricRowProps) {
  const colors = useThemeColors();
  return <BodyMetricRowView {...props} colors={colors} />;
}
