import { Pressable, Text, View } from 'react-native';

import { type Appearance, useAppearance } from '@/lib/theme';

const SEGMENTS: { value: Appearance; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function AppearanceControl() {
  const { appearance, setAppearance } = useAppearance();

  return (
    <View>
      <Text className="mb-sm text-label font-normal text-foreground-muted">Appearance</Text>
      <View className="flex-row gap-sm">
        {SEGMENTS.map(({ value, label }) => {
          const selected = appearance === value;
          return (
            <Pressable
              key={value}
              onPress={() => setAppearance(value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{ minWidth: 48, minHeight: 48 }}
              className={`flex-1 items-center justify-center rounded-md border px-md py-sm ${
                selected ? 'border-accent bg-accent' : 'border-transparent bg-surface'
              }`}
            >
              <Text
                className={`text-center text-body text-foreground ${
                  selected ? 'font-semibold' : 'font-normal'
                }`}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
