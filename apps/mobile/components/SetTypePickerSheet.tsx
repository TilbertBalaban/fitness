import Ionicons from '@expo/vector-icons/Ionicons';
import { useColorScheme } from 'nativewind';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SET_TYPES, type SetType } from '@fitness/api-contracts';
import { useThemeColors } from '@/lib/theme-colors';
import { ErrorBanner } from './ErrorBanner';

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

export type SetTypeSelectionEffect = 'retype' | 'insert-child' | 'confirm-first' | 'no-op';

// SETS-04: selecting Failure writes rir 0 in the same act as the type change, so the lifter never
// re-types the value the picker's own descriptor promises ("Taken to failure, logged at 0 RIR").
export const FAILURE_SET_RIR = 0;

export interface ResolveSetTypeSelectionInput {
  selected: SetType;
  currentSetType: SetType;
  childCount: number;
  childSetType: SetType | null;
}

// The picker's real contract (UI-SPEC "Set-Type Picker Sheet" behavior table), not a generic
// "set setType to X" handler (Pitfall 6). Drop Set and Partial can NEVER produce `retype` — a
// drop/partial value must never land on a parent row (D-07); they only ever insert a child beneath
// an unchanged parent, no-op when the group is already that kind, or confirm-first when the group
// is a different kind and would be destroyed by the switch.
export function resolveSetTypeSelection({
  selected,
  currentSetType,
  childCount,
  childSetType,
}: ResolveSetTypeSelectionInput): SetTypeSelectionEffect {
  if (selected === currentSetType) return 'no-op';

  if (selected === 'drop' || selected === 'partial') {
    if (childCount === 0) return 'insert-child';
    return childSetType === selected ? 'no-op' : 'confirm-first';
  }

  if (childCount === 0) return 'retype';
  return 'confirm-first';
}

// The childless-case shorthand the tracer test already pins — kept as the tiny two-value surface
// 07-01 shipped, defined in terms of resolveSetTypeSelection rather than duplicating its table.
// `currentSetType` is deliberately a value distinct from `setType` (never equal, whichever setType
// is passed) so the no-op branch is structurally unreachable here — this shorthand only ever
// answers "what would this row's tap do if it had no children and wasn't already this type".
export function setTypePickerEffect(setType: SetType): 'retype' | 'insert-child' {
  const otherType: SetType = setType === 'normal' ? 'warmup' : 'normal';
  const effect = resolveSetTypeSelection({ selected: setType, currentSetType: otherType, childCount: 0, childSetType: null });
  return effect as 'retype' | 'insert-child';
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
  // E1 error state (UI-SPEC): a failed local write on selection renders the shipped ErrorBanner
  // here instead of dismissing — the sheet stays open on its pre-selection state (Phase 6 E2/E4
  // write-failure precedent) so the change is never silently lost.
  errorMessage?: string | null;
  onSelect: (setType: SetType) => void;
  onCancel: () => void;
}

// Hook-free — mirrors SessionActionSheetView's shape verbatim: same overlay, same ScrollView, same
// max-w-[400px]/rounded-md/p-lg card. The currently-active row renders semibold accent with a
// trailing checkmark (mirrors the Switch Gym Sheet's active-row treatment). No Cancel row —
// tapping the overlay, or any row including the already-active one, dismisses.
export function SetTypePickerSheetView({ setNumber, currentSetType, colors, errorMessage, onSelect, onCancel }: SetTypePickerSheetViewProps) {
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

          {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

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
  errorMessage?: string | null;
  onSelect: (setType: SetType) => void;
  onCancel: () => void;
}

export function SetTypePickerSheet(props: SetTypePickerSheetProps) {
  const { colorScheme } = useColorScheme();
  const { accent } = useThemeColors();
  const glyphColors = GLYPH_COLORS[colorScheme === 'dark' ? 'dark' : 'light'];
  return <SetTypePickerSheetView {...props} colors={{ ...glyphColors, accent }} />;
}
