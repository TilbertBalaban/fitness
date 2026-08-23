import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

// Walks weight -> reps -> rir -> null (D-18) — the next-arrow's whole job. rir has no successor:
// its submit both writes the field and dismisses the keypad, there being no fourth field.
export type KeypadField = 'weight' | 'reps' | 'rir';

export function nextKeypadField(field: KeypadField): KeypadField | null {
  if (field === 'weight') return 'reps';
  if (field === 'reps') return 'rir';
  return null;
}

export type DigitGridKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | '0' | 'backspace';

// Row-major, matching the spec's literal grid: 1 2 3 / 4 5 6 / 7 8 9 / . 0 backspace.
export const KEYPAD_KEYS: DigitGridKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'];

export type KeypadPress =
  | { kind: 'digit'; digit: string }
  | { kind: 'decimal' }
  | { kind: 'backspace' }
  | { kind: 'increment'; amount: number }
  | { kind: 'decrement'; amount: number };

function trimTrailingZeros(value: string): string {
  if (!value.includes('.')) return value;
  const trimmed = value.replace(/0+$/, '').replace(/\.$/, '');
  return trimmed.length === 0 ? '0' : trimmed;
}

// The whole field-value reducer: a plain string in, a plain string (or null for "no value yet")
// out. No TextInput, no native focus state — this is the entire mechanism the SetRow field's
// displayed value and the docked keypad agree on (RESEARCH §12, D-20).
export function applyKeypadPress(value: string | null, press: KeypadPress): string | null {
  switch (press.kind) {
    case 'digit':
      return (value ?? '') + press.digit;
    case 'decimal': {
      const current = value ?? '';
      return current.includes('.') ? value : current + '.';
    }
    case 'backspace': {
      if (value === null || value.length === 0) return null;
      const next = value.slice(0, -1);
      return next.length === 0 ? null : next;
    }
    case 'increment':
    case 'decrement': {
      const current = value === null || value === '' ? 0 : Number(value);
      if (Number.isNaN(current)) return value;
      const delta = press.kind === 'increment' ? press.amount : -press.amount;
      const next = Math.max(0, current + delta);
      return trimTrailingZeros(next.toFixed(3));
    }
    default:
      return value;
  }
}

function pressForKey(key: DigitGridKey): KeypadPress {
  if (key === '.') return { kind: 'decimal' };
  if (key === 'backspace') return { kind: 'backspace' };
  return { kind: 'digit', digit: key };
}

const KEY_SIZE = 56;
const STEPPER_SIZE = 48;
const RESERVED_BAND_HEIGHT = 40;

export interface NumericKeypadViewProps {
  field: KeypadField;
  stepAmount: number;
  colors: ThemeColors;
  onPress: (press: KeypadPress) => void;
  onSubmit: () => void;
}

// Hook-free — direct-invocable by a test, matching SetRowView/CycleStripView. Every field value
// display lives in SetRow, not here: this component only ever emits presses and a submit signal.
export function NumericKeypadView({ field, stepAmount, colors, onPress, onSubmit }: NumericKeypadViewProps) {
  const rows: DigitGridKey[][] = [];
  for (let i = 0; i < KEYPAD_KEYS.length; i += 3) rows.push(KEYPAD_KEYS.slice(i, i + 3));

  return (
    <View className="border-t border-foreground-muted bg-background">
      {/* R8: an always-rendered, empty layout slot — Phase 6 fills this, Phase 5 leaves it blank. */}
      <View style={{ height: RESERVED_BAND_HEIGHT }} />

      <View>
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

      <View className="flex-row items-stretch">
        <Pressable
          onPress={() => onPress({ kind: 'decrement', amount: stepAmount })}
          accessibilityRole="button"
          accessibilityLabel="Decrease"
          className="items-center justify-center bg-surface"
          style={{ width: STEPPER_SIZE, height: STEPPER_SIZE }}
        >
          <Text className="text-body font-semibold text-foreground">-</Text>
        </Pressable>
        <Pressable
          onPress={() => onPress({ kind: 'increment', amount: stepAmount })}
          accessibilityRole="button"
          accessibilityLabel="Increase"
          className="items-center justify-center bg-surface"
          style={{ width: STEPPER_SIZE, height: STEPPER_SIZE }}
        >
          <Text className="text-body font-semibold text-foreground">+</Text>
        </Pressable>
        <Pressable
          onPress={onSubmit}
          accessibilityRole="button"
          accessibilityLabel={field === 'rir' ? 'Done' : 'Next field'}
          className="flex-1 items-center justify-center bg-accent"
          style={{ minHeight: STEPPER_SIZE }}
        >
          {field === 'rir' ? (
            <Text className="text-body font-semibold text-white">Done</Text>
          ) : (
            <Ionicons name="chevron-forward" size={20} color="white" />
          )}
        </Pressable>
      </View>
    </View>
  );
}

export interface NumericKeypadProps {
  field: KeypadField;
  stepAmount: number;
  onPress: (press: KeypadPress) => void;
  onSubmit: () => void;
}

export function NumericKeypad(props: NumericKeypadProps) {
  const colors = useThemeColors();
  return <NumericKeypadView {...props} colors={colors} />;
}
