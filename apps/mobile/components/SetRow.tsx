import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';
import type { KeypadField } from './NumericKeypad';

export type SetRowFieldState = 'active' | 'populated' | 'empty';

// Drives the field's cursor-bar affordance: an active field always shows the cursor regardless of
// content, an inactive field shows it only through its populated/empty text state.
export function setRowFieldState(value: string | null, isActive: boolean): SetRowFieldState {
  if (isActive) return 'active';
  return value === null || value === '' ? 'empty' : 'populated';
}

// Weight's empty case is a blank field (D-16: never a guessed number). Reps/RIR's empty case is
// an em dash — a one-off session (EMPTY_PRESCRIPTION) carries no program target for either.
export function formatFieldValue(field: KeypadField, value: string | null): string {
  if (field === 'weight') return value ?? '';
  return value ?? '—';
}

export interface SetRowValues {
  weight: string | null;
  reps: string | null;
  rir: string | null;
}

// Weight and reps carry a previous-actual comparison (D-16/D-17); rir does not — the field trains
// you toward the program (its own prefill still comes from the session_exercise snapshot), the
// greyed weight/reps numbers tell you what you actually did last time. Values arrive already
// display-formatted (weight converted through fromCanonicalKg at the boundary, reps stringified) —
// SetRow renders, it never converts.
export interface SetRowReference {
  weight: string | null;
  reps: string | null;
}

export interface SetRowViewProps {
  setIndex: number;
  values: SetRowValues;
  reference: SetRowReference;
  completed: boolean;
  activeField: KeypadField | null;
  colors: ThemeColors;
  onFieldPress: (field: KeypadField) => void;
  onReferenceTap: (field: 'weight' | 'reps') => void;
  onCheckmarkPress: () => void;
}

interface SetFieldReference {
  value: string;
  onTap: () => void;
}

interface SetFieldProps {
  field: KeypadField;
  label: string;
  value: string;
  active: boolean;
  completed: boolean;
  colors: ThemeColors;
  onPress: () => void;
  reference: SetFieldReference | null;
}

// A plain function, called (never rendered as a JSX tag) so its returned Pressable/View/Text tree
// is inlined directly into SetRowView's own — a `<SetField>` element would stay an opaque,
// unexpanded node to a test that walks the tree by direct invocation with no renderer, exactly the
// trap CycleStripView/DayDeckView avoid by never introducing a second component boundary.
//
// `reference` is null both when this field genuinely has no history (a first-ever set) and when
// this field never carries one at all (rir) — both render the identical "No previous", no
// underline, no press target literal string, since a reader can't tell "never applicable" from
// "not yet logged" apart and shouldn't need to.
function renderSetField({ field, label, value, active, completed, colors, onPress, reference }: SetFieldProps) {
  return (
    <Pressable
      key={field}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, set field`}
      className="flex-1 items-start justify-center px-xs"
      style={{ minHeight: 48 }}
    >
      <View className="flex-row items-center gap-xs">
        <Text className={`text-body ${completed ? 'font-semibold' : 'font-normal'} text-foreground`}>{value}</Text>
        {active ? <View accessibilityLabel={`${field} cursor`} style={{ width: 2, height: 20, backgroundColor: colors.accent }} /> : null}
      </View>
      {reference ? (
        <Pressable
          onPress={reference.onTap}
          accessibilityRole="button"
          accessibilityLabel={`${label}, use previous ${reference.value}`}
        >
          <Text className="text-label font-normal text-accent underline">{reference.value}</Text>
        </Pressable>
      ) : (
        <Text className="text-label font-normal text-foreground-muted">No previous</Text>
      )}
    </Pressable>
  );
}

// Hook-free — direct-invocable by a test, matching CycleStripView/DayDeckView. Every set row is
// always fully visible, never collapsible (unlike Phase 4's slot row), because logging is the
// whole point of this screen.
export function SetRowView({ setIndex, values, reference, completed, activeField, colors, onFieldPress, onReferenceTap, onCheckmarkPress }: SetRowViewProps) {
  return (
    <View className="flex-row items-center gap-xs border-b border-foreground-muted/20 py-sm">
      <View style={{ width: 24, minHeight: 24, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Set ${setIndex} type`}
          style={{ minHeight: 24, minWidth: 24, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text className="text-body font-normal text-foreground">{setIndex}</Text>
        </Pressable>
      </View>

      {renderSetField({
        field: 'weight',
        label: 'Weight',
        value: formatFieldValue('weight', values.weight),
        active: activeField === 'weight',
        completed,
        colors,
        onPress: () => onFieldPress('weight'),
        reference: reference.weight !== null ? { value: reference.weight, onTap: () => onReferenceTap('weight') } : null,
      })}
      {renderSetField({
        field: 'reps',
        label: 'Reps',
        value: formatFieldValue('reps', values.reps),
        active: activeField === 'reps',
        completed,
        colors,
        onPress: () => onFieldPress('reps'),
        reference: reference.reps !== null ? { value: reference.reps, onTap: () => onReferenceTap('reps') } : null,
      })}
      {renderSetField({
        field: 'rir',
        label: 'RIR',
        value: formatFieldValue('rir', values.rir),
        active: activeField === 'rir',
        completed,
        colors,
        onPress: () => onFieldPress('rir'),
        reference: null,
      })}

      <Pressable
        onPress={onCheckmarkPress}
        accessibilityRole="button"
        accessibilityLabel={completed ? 'Mark set incomplete' : 'Mark set complete'}
        accessibilityState={{ selected: completed }}
        className={
          completed
            ? 'items-center justify-center rounded-full bg-accent'
            : 'items-center justify-center rounded-full border border-foreground-muted'
        }
        style={{ width: 48, height: 48 }}
      >
        {completed ? <Ionicons name="checkmark" size={20} color="white" /> : null}
      </Pressable>
    </View>
  );
}

export interface SetRowProps {
  setIndex: number;
  values: SetRowValues;
  reference: SetRowReference;
  completed: boolean;
  activeField: KeypadField | null;
  onFieldPress: (field: KeypadField) => void;
  onReferenceTap: (field: 'weight' | 'reps') => void;
  onCheckmarkPress: () => void;
}

export function SetRow(props: SetRowProps) {
  const colors = useThemeColors();
  return <SetRowView {...props} colors={colors} />;
}
