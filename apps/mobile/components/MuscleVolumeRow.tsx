import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { pluralizeCount } from '@/lib/analytics/chart-labels';
import { useThemeColors } from '@/lib/theme-colors';

export interface MuscleVolumeRowPoint {
  trainingVolumeKg: number | null;
  setCount: number;
  relativeIntensity: number | null;
}

// The value line's third branch: a muscle trained only with sets that carry no external load
// (bodyweight/time-based work) is genuinely trained, and a bare zero weight is forbidden copy —
// the set count is the honest thing to say instead.
function rowValueLine(point: MuscleVolumeRowPoint, valueLabel: string | null): string {
  if (point.trainingVolumeKg === null) return 'Untrained';
  if (point.trainingVolumeKg === 0 && point.setCount > 0) {
    return pluralizeCount(point.setCount, 'set', 'sets');
  }
  return valueLabel ?? 'Untrained';
}

// Pure and separately testable, mirroring RecordRow's composed-label idiom. Three branches match
// the value line exactly: trained-with-volume gets its percentage of the hardest-trained muscle,
// trained-with-zero-volume gets the set count and no percentage, untrained gets no number at all.
export function muscleVolumeRowLabel(point: MuscleVolumeRowPoint, muscleName: string, valueLabel: string | null): string {
  if (point.trainingVolumeKg === null) return `${muscleName}, untrained`;
  if (point.trainingVolumeKg === 0 && point.setCount > 0) {
    return `${muscleName}, ${pluralizeCount(point.setCount, 'set', 'sets')}`;
  }
  const relativePercent = Math.round((point.relativeIntensity ?? 0) * 100);
  return `${muscleName}, ${valueLabel ?? ''} Training Volume, ${relativePercent}% of your hardest-trained muscle`;
}

export interface MuscleVolumeRowViewProps {
  point: MuscleVolumeRowPoint;
  muscleName: string;
  valueLabel: string | null;
  colors: { foregroundMuted: string };
  onPress: () => void;
}

// Modelled on RecordRow's shipped anatomy — one Pressable, flex-1, minHeight 48. The chevron gets
// no hit region of its own: a second press target reaching the same place would be a second way to
// do the same thing, not a second thing to do. An untrained row is pressable on this exact same
// path as a trained one — one code path, no special casing — so the drill-down can explain the
// absence in place.
export function MuscleVolumeRowView({ point, muscleName, valueLabel, colors, onPress }: MuscleVolumeRowViewProps) {
  const valueLine = rowValueLine(point, valueLabel);
  const label = muscleVolumeRowLabel(point, muscleName, valueLabel);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-sm rounded-md bg-surface px-md py-sm"
      style={{ minHeight: 48 }}
    >
      {/* Neither line takes a line clamp (R4): a long muscle name wraps and the row grows. */}
      <View className="flex-1 justify-center gap-xs">
        <Text className="text-body font-normal text-foreground">{muscleName}</Text>
        <Text className="text-label font-normal text-foreground-muted">{valueLine}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.foregroundMuted} />
    </Pressable>
  );
}

export type MuscleVolumeRowProps = Omit<MuscleVolumeRowViewProps, 'colors'>;

export function MuscleVolumeRow(props: MuscleVolumeRowProps) {
  const colors = useThemeColors();
  return <MuscleVolumeRowView {...props} colors={colors} />;
}
