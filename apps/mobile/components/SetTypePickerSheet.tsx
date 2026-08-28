import Ionicons from '@expo/vector-icons/Ionicons';
import { useColorScheme } from 'nativewind';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SET_TYPES, type SetType } from '@fitness/api-contracts';
import { useThemeColors } from '@/lib/theme-colors';

// Mirrors SessionActionSheet.tsx's own local resolution exactly: ThemeColors (lib/theme-colors.ts)
// carries only accent/foregroundMuted/surface, so foreground/destructive are resolved here, the
// only consumer that needs either — never widening the shared interface for every other consumer.
const GLYPH_COLORS: Record<'light' | 'dark', { foreground: string; destructive: string }> = {
  light: { foreground: 'rgb(9, 9, 11)', destructive: 'rgb(220, 38, 38)' },
  dark: { foreground: 'rgb(250, 250, 250)', destructive: 'rgb(239, 68, 68)' },
};

export interface SetTypePickerRow {
  id: SetType;
  label: string;
  descriptor: string;
}

// Fixed SET_TYPES order (CF-02) — never reordered, never filtered. UI-SPEC Copywriting Contract.
export const SET_TYPE_PICKER_ROWS: SetTypePickerRow[] = [
  { id: 'normal', label: 'Normal', descriptor: 'A standard working set' },
  { id: 'warmup', label: 'Warm-up', descriptor: 'Excluded from working volume' },
  { id: 'drop', label: 'Drop Set', descriptor: 'Adds a weight-drop sub-entry beneath this set' },
  { id: 'myorep', label: 'Myorep', descriptor: 'Marks this as a myorep activation set' },
  { id: 'partial', label: 'Partial', descriptor: 'Adds a partial-rep sub-entry beneath this set' },
  { id: 'failure', label: 'Failure', descriptor: 'Taken to failure, logged at 0 RIR' },
  { id: 'amrap', label: 'AMRAP', descriptor: 'As many reps as possible' },
];

if (SET_TYPE_PICKER_ROWS.length !== SET_TYPES.length) {
  throw new Error('SET_TYPE_PICKER_ROWS must carry exactly one row per SET_TYPES entry (CF-02)');
}

export type SetTypePickerEffect = 'retype' | 'insert-child';

// Pitfall 6's per-row dispatch table, never a generic "set setType to X" handler. Drop Set and
// Partial insert a child beneath an unchanged parent (D-04/D-07); every other row retypes the
// tapped row itself.
export function setTypePickerEffect(setType: SetType): SetTypePickerEffect {
  return setType === 'drop' || setType === 'partial' ? 'insert-child' : 'retype';
}

export interface SetTypePickerSheetColors {
  foreground: string;
  destructive: string;
  accent: string;
}

export interface SetTypePickerSheetViewProps {
  setNumber: number;
  currentSetType: SetType;
  childCount: number;
  childSetType: SetType | null;
  colors: SetTypePickerSheetColors;
  onSelect: (setType: SetType) => void;
  onCancel: () => void;
}

// Hook-free — mirrors SessionActionSheetView's shape verbatim: same overlay, same ScrollView, same
// max-w-[400px]/rounded-md/p-lg card. The currently-active row renders semibold accent with a
// trailing checkmark (mirrors the Switch Gym Sheet's active-row treatment). No Cancel row —
// tapping the overlay, or any row including the already-active one, dismisses.
export function SetTypePickerSheetView({ setNumber, currentSetType, colors, onSelect, onCancel }: SetTypePickerSheetViewProps) {
  return (
    <Pressable
      onPress={onCancel}
      accessibilityRole="button"
      accessibilityLabel="Dismiss"
      className="flex-1 items-center justify-center bg-background/80 px-lg"
    >
      <Pressable onPress={() => {}} accessibilityRole="none">
        <ScrollView
          className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Text className="text-heading font-semibold text-foreground">{`Set ${setNumber} Type`}</Text>

          <View className="mt-md gap-xs">
            {SET_TYPE_PICKER_ROWS.map((row) => {
              const active = row.id === currentSetType;
              return (
                <Pressable
                  key={row.id}
                  onPress={() => onSelect(row.id)}
                  accessibilityRole="button"
                  accessibilityLabel={row.label}
                  style={{ minHeight: 48 }}
                  className="flex-row items-center justify-between gap-sm rounded-md px-md py-sm"
                >
                  <View className="flex-1">
                    <Text className={`text-body ${active ? 'font-semibold text-accent' : 'font-normal text-foreground'}`}>
                      {row.label}
                    </Text>
                    <Text className="text-label font-normal text-foreground-muted">{row.descriptor}</Text>
                  </View>
                  {active ? <Ionicons name="checkmark" size={16} color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

export interface SetTypePickerSheetProps {
  setNumber: number;
  currentSetType: SetType;
  childCount: number;
  childSetType: SetType | null;
  onSelect: (setType: SetType) => void;
  onCancel: () => void;
}

export function SetTypePickerSheet(props: SetTypePickerSheetProps) {
  const { colorScheme } = useColorScheme();
  const { accent } = useThemeColors();
  const glyphColors = GLYPH_COLORS[colorScheme === 'dark' ? 'dark' : 'light'];
  return <SetTypePickerSheetView {...props} colors={{ ...glyphColors, accent }} />;
}
