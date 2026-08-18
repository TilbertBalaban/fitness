import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { useThemeColors } from '@/lib/theme-colors';

export interface SelectFieldOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  label: string;
  value: string | null;
  options: SelectFieldOption[];
  placeholder: string;
  onChange: (value: string) => void;
  error?: string | null;
}

// A labelled single-choice control over a fixed option list (tracking type, equipment, movement
// pattern) — the one new form primitive this phase needs. Matches TextField's visual contract:
// same label treatment, same error prop rendering destructive text at Label size below the
// control. The placeholder is a real unselected state (a static line, not a chip that could be
// mistaken for a selected option) rather than a first option that looks selected — load_type is
// a notNull discriminator every downstream phase branches on, and a silently-defaulted value is
// worse than an unanswered one.
export function SelectField({ label, value, options, placeholder, onChange, error }: SelectFieldProps) {
  const colors = useThemeColors();

  return (
    <View className="gap-xs">
      <Text className="text-label font-normal text-foreground-muted">{label}</Text>

      {value === null ? (
        <Text className="text-body font-normal text-foreground-muted">{placeholder}</Text>
      ) : null}

      <View className="flex-row flex-wrap gap-sm">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
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
                className={`text-body font-normal ${selected ? 'text-accent' : 'text-foreground'}`}
                numberOfLines={2}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text className="text-label font-normal text-destructive">{error}</Text> : null}
    </View>
  );
}
