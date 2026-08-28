import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View, type AccessibilityActionEvent } from 'react-native';
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

// The accessibility-action equivalent of the long press (05-UI-SPEC §Amendment A.1) — a
// screen-reader user reaches the same note trigger through this named action rather than a
// gesture. Shared by every press target the long press itself is attached to, so the two paths
// can never drift onto different labels.
const NOTE_ACTION_NAME = 'note';
const NOTE_ACCESSIBILITY_ACTIONS = [{ name: NOTE_ACTION_NAME, label: 'Add note' }];

function noteActionProps(onLongPress: (() => void) | undefined) {
  if (!onLongPress) return {};
  return {
    accessibilityActions: NOTE_ACCESSIBILITY_ACTIONS,
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === NOTE_ACTION_NAME) onLongPress();
    },
  };
}

// D-02's generalized badge slot: one glyph, `warmup`'s W carried forward verbatim, five more
// literals added for Phase 7's newly-writable set types. No entry for `normal` — a plain working
// set shows no type badge at all (R15).
export const SET_TYPE_BADGE_GLYPH: Record<string, string> = {
  warmup: 'W',
  drop: 'D',
  myorep: 'M',
  partial: 'P',
  failure: 'F',
  amrap: 'A',
};

const BADGE_ACCESSIBILITY_LABEL: Record<string, string> = {
  W: 'Warm-up set',
  D: 'Drop set',
  M: 'Myorep set',
  P: 'Partial set',
  F: 'Failure set',
  A: 'AMRAP set',
  L: 'Left side',
  R: 'Right side',
};

export interface BadgeGlyphInput {
  setType?: string;
  side?: string | null;
}

// R14 — the badge slot renders at most one glyph, ever. Side wins over type (UI-SPEC Color
// section): once a set is grouped by side, which side it belongs to is the more load-bearing
// piece of information for reading the row correctly.
export function badgeGlyphFor({ setType, side }: BadgeGlyphInput): string | null {
  if (side === 'left') return 'L';
  if (side === 'right') return 'R';
  if (setType === undefined) return null;
  return SET_TYPE_BADGE_GLYPH[setType] ?? null;
}

export interface SetRowViewProps {
  setIndex: number;
  values: SetRowValues;
  reference: SetRowReference;
  completed: boolean;
  activeField: KeypadField | null;
  colors: ThemeColors;
  // All optional and additive — a caller that supplies none of them (WorkoutSummary.tsx's
  // summary-correction rows) renders and behaves exactly as it did before these existed.
  warmup?: boolean;
  hasNote?: boolean;
  // Phase 7 D-02/D-05/D-06/D-20. `warmup` above keeps working as a synonym for `setType ===
  // 'warmup'` so WorkoutSummary.tsx's correction rows (which never pass `setType`) are untouched.
  setType?: string;
  side?: string | null;
  isChild?: boolean;
  onSetNumberPress?: () => void;
  onLongPress?: () => void;
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
  onLongPress?: () => void;
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
//
// `onLongPress` is attached to both this field's own Pressable AND its nested reference Pressable
// (when one exists) — a nested Pressable swallows its parent's gesture, so the outer handler alone
// would never fire for a long press that lands on the reference text itself.
function renderSetField({ field, label, value, active, completed, colors, onPress, onLongPress, reference }: SetFieldProps) {
  return (
    <Pressable
      key={field}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, set field`}
      className="flex-1 items-start justify-center px-xs"
      style={{ minHeight: 48 }}
      {...noteActionProps(onLongPress)}
    >
      <View className="flex-row items-center gap-xs">
        <Text className={`text-body ${completed ? 'font-semibold' : 'font-normal'} text-foreground`}>{value}</Text>
        {active ? <View accessibilityLabel={`${field} cursor`} style={{ width: 2, height: 20, backgroundColor: colors.accent }} /> : null}
      </View>
      {reference ? (
        <Pressable
          onPress={reference.onTap}
          onLongPress={onLongPress}
          accessibilityRole="button"
          accessibilityLabel={`${label}, use previous ${reference.value}`}
          {...noteActionProps(onLongPress)}
        >
          <Text className="text-label font-normal text-accent underline">{reference.value}</Text>
        </Pressable>
      ) : (
        <Text className="text-label font-normal text-foreground-muted">No previous</Text>
      )}
    </Pressable>
  );
}

// 14px circle, bg-secondary, muted Label glyph, ahead of the set-number column (05-UI-SPEC §Set
// Row, generalized by D-02) — rendered from inside the row itself so every SetRowView consumer
// gets it, not only the one caller (ExercisePageView) that happened to wrap the row from outside
// (WINDOWS #109). One slot, one glyph, ever (R14).
function renderTypeBadge(glyph: string, label: string) {
  return (
    <View
      accessibilityLabel={label}
      className="items-center justify-center rounded-full bg-secondary"
      style={{ width: 14, height: 14, marginRight: 4 }}
    >
      <Text className="text-label font-normal text-foreground-muted" style={{ fontSize: 9, lineHeight: 12 }}>
        {glyph}
      </Text>
    </View>
  );
}

// 6px bg-accent dot, immediately before the checkmark (05-UI-SPEC Amendment A.1) — the identical
// "Note exists" label ExerciseActionBar's own note badge already uses, so the two surfaces read
// the same to a screen reader.
function renderNoteDot() {
  return <View accessibilityLabel="Note exists" className="rounded-full bg-accent" style={{ width: 6, height: 6, marginRight: 8 }} />;
}

// Hook-free — direct-invocable by a test, matching CycleStripView/DayDeckView. Every set row is
// always fully visible, never collapsible (unlike Phase 4's slot row), because logging is the
// whole point of this screen.
export function SetRowView({
  setIndex,
  values,
  reference,
  completed,
  activeField,
  colors,
  warmup,
  hasNote,
  setType,
  side,
  isChild,
  onSetNumberPress,
  onLongPress,
  onFieldPress,
  onReferenceTap,
  onCheckmarkPress,
}: SetRowViewProps) {
  const glyph = badgeGlyphFor({ setType: warmup ? 'warmup' : setType, side });

  return (
    <Pressable
      onLongPress={onLongPress}
      accessibilityHint="Long press to add a note"
      className="flex-row items-center gap-xs border-b border-foreground-muted/20 py-sm"
      style={isChild ? { paddingLeft: 16 } : undefined}
      {...noteActionProps(onLongPress)}
    >
      {glyph ? renderTypeBadge(glyph, BADGE_ACCESSIBILITY_LABEL[glyph] ?? glyph) : null}

      <View style={{ width: 24, minHeight: 24, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable
          onPress={onSetNumberPress}
          onLongPress={onLongPress}
          accessibilityRole="button"
          accessibilityLabel={isChild ? 'Sub-entry type' : `Set ${setIndex} type`}
          style={{ minHeight: 24, minWidth: 24, alignItems: 'center', justifyContent: 'center' }}
          {...noteActionProps(onLongPress)}
        >
          {isChild ? null : <Text className="text-body font-normal text-foreground">{setIndex}</Text>}
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
        onLongPress,
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
        onLongPress,
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
        onLongPress,
        reference: null,
      })}

      {hasNote ? renderNoteDot() : null}

      <Pressable
        onPress={onCheckmarkPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={completed ? 'Mark set incomplete' : 'Mark set complete'}
        accessibilityState={{ selected: completed }}
        className={
          completed
            ? 'items-center justify-center rounded-full bg-accent'
            : 'items-center justify-center rounded-full border border-foreground-muted'
        }
        style={{ width: 48, height: 48 }}
        {...noteActionProps(onLongPress)}
      >
        {completed ? <Ionicons name="checkmark" size={20} color="white" /> : null}
      </Pressable>
    </Pressable>
  );
}

export interface SetRowProps {
  setIndex: number;
  values: SetRowValues;
  reference: SetRowReference;
  completed: boolean;
  activeField: KeypadField | null;
  warmup?: boolean;
  hasNote?: boolean;
  setType?: string;
  side?: string | null;
  isChild?: boolean;
  onSetNumberPress?: () => void;
  onLongPress?: () => void;
  onFieldPress: (field: KeypadField) => void;
  onReferenceTap: (field: 'weight' | 'reps') => void;
  onCheckmarkPress: () => void;
}

export function SetRow(props: SetRowProps) {
  const colors = useThemeColors();
  return <SetRowView {...props} colors={colors} />;
}
