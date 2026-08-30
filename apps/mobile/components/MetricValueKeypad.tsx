import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { applyKeypadPress, KEYPAD_KEYS, type DigitGridKey, type KeypadPress } from './NumericKeypad';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

export { applyKeypadPress };

function pressForKey(key: DigitGridKey): KeypadPress {
  if (key === '.') return { kind: 'decimal' };
  if (key === 'backspace') return { kind: 'backspace' };
  return { kind: 'digit', digit: key };
}

const KEY_SIZE = 56;

export interface MetricValueKeypadViewProps {
  colors: ThemeColors;
  onPress: (press: KeypadPress) => void;
}

// A single-value keypad: the same digit-grid reducer NumericKeypad uses, with no plate strip, no
// reserved band and no field cursor — those are gym-equipment concerns this component has no use
// for (UI-SPEC decision 7). Hook-free, matching NumericKeypadView's direct-invocable shape.
export function MetricValueKeypadView({ colors, onPress }: MetricValueKeypadViewProps) {
  const rows: DigitGridKey[][] = [];
  for (let i = 0; i < KEYPAD_KEYS.length; i += 3) rows.push(KEYPAD_KEYS.slice(i, i + 3));

  return (
    <View className="border-t border-foreground-muted bg-background">
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row">
          {row.map((key) => (
            <Pressable
              key={key}
              onPress={() => onPress(pressForKey(key))}
              accessibilityRole="button"
              accessibilityLabel={key === 'backspace' ? 'Backspace' : key === '.' ? 'Decimal point' : key}
              className="flex-1 items-center justify-center border-b border-foreground-muted/20 bg-surface"
              style={{ height: KEY_SIZE }}
            >
              {key === 'backspace' ? (
                <Ionicons name="backspace-outline" size={24} color={colors.foregroundMuted} />
              ) : (
                <Text className="text-display font-normal text-foreground">{key}</Text>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

export type MetricValueKeypadProps = Omit<MetricValueKeypadViewProps, 'colors'>;

export function MetricValueKeypad(props: MetricValueKeypadProps) {
  const colors = useThemeColors();
  return <MetricValueKeypadView {...props} colors={colors} />;
}
