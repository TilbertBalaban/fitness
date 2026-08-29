import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, Text } from 'react-native';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

export interface SegmentedChipOption {
  id: string;
  label: string;
}

export interface SegmentedChipRowViewProps {
  // Names the dimension the chips switch between. Without it a group of chips is unannounceable —
  // a reader reaches four radio buttons with nothing saying what they choose.
  groupLabel: string;
  options: SegmentedChipOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  colors: ThemeColors;
}

// The single-select sibling of FilterChipRow: chip anatomy, selection border, checkmark glyph and
// the 48-unit floors are copied verbatim. Four deliberate divergences — single selection,
// radio/radiogroup roles, no visible title line (four surfaces would carry four redundant ones),
// and horizontal scrolling instead of wrapping, because a switch that changes height on selection
// shifts everything below it on every tap.
export function SegmentedChipRowView({ groupLabel, options, selectedId, onSelect, colors }: SegmentedChipRowViewProps) {
  if (options.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={groupLabel}
      contentContainerStyle={{ alignItems: 'center', gap: 8, paddingVertical: 4 }}
    >
      {options.map((option) => {
        const selected = option.id === selectedId;
        return (
          <Pressable
            key={option.id}
            onPress={() => onSelect(option.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            className={`flex-row items-center gap-xs rounded-md border bg-surface px-md py-sm ${
              selected ? 'border-accent' : 'border-foreground-muted'
            }`}
            style={{ minWidth: 48, minHeight: 48 }}
          >
            {selected ? <Ionicons name="checkmark" size={16} color={colors.accent} /> : null}
            {/* Unclamped on purpose: FilterChipRow's two-line limit exists for a dense filter list,
                not a four-item switch. A long label widens its chip and never truncates (R4). */}
            <Text className={`text-label font-normal ${selected ? 'text-accent' : 'text-foreground-muted'}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export type SegmentedChipRowProps = Omit<SegmentedChipRowViewProps, 'colors'>;

export function SegmentedChipRow(props: SegmentedChipRowProps) {
  const colors = useThemeColors();
  return <SegmentedChipRowView {...props} colors={colors} />;
}
