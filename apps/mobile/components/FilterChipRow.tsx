import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { useThemeColors } from '@/lib/theme-colors';

export interface FilterChip {
  id: string;
  label: string;
}

export interface FilterChipRowProps {
  title: string;
  options: FilterChip[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}

// One dimension's chip row (UI-SPEC E5). Renders nothing at all — not even its own title — when
// the dimension's value list is empty, so a facet with no available values never shows an empty
// heading with no chips under it. Chips wrap to additional rows rather than scrolling
// horizontally: every filter option must stay visible and discoverable, which matters more here
// than vertical compactness.
export function FilterChipRow({ title, options, selectedIds, onToggle }: FilterChipRowProps) {
  const colors = useThemeColors();

  if (options.length === 0) return null;

  return (
    <View className="gap-xs">
      <Text className="text-label font-normal text-foreground-muted">{title}</Text>
      <View className="flex-row flex-wrap gap-sm">
        {options.map((option) => {
          const selected = selectedIds.includes(option.id);
          return (
            <Pressable
              key={option.id}
              onPress={() => onToggle(option.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              className={`flex-row items-center gap-xs rounded-md border bg-surface px-md py-sm ${
                selected ? 'border-accent' : 'border-foreground-muted'
              }`}
              style={{ minWidth: 48, minHeight: 48 }}
            >
              {selected ? <Ionicons name="checkmark" size={16} color={colors.accent} /> : null}
              <Text
                className={`text-label font-normal ${selected ? 'text-accent' : 'text-foreground-muted'}`}
                numberOfLines={2}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
