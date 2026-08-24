import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

export type ExerciseActionId = 'warmup' | 'targets' | 'note' | 'overflow';

export interface ExerciseAction {
  id: ExerciseActionId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

// D-13: a single ordered constant, not four literal Pressables — re-sorting or adding an action in
// a later phase is a data change to this list, never a JSX restructure. Warm-up, Targets and Note
// are always-visible members; overflow is a fourth, fixed member, never a conditionally-appended
// fifth.
export const EXERCISE_ACTIONS: ExerciseAction[] = [
  { id: 'warmup', label: 'Warm-up', icon: 'barbell-outline' },
  { id: 'targets', label: 'Targets', icon: 'options-outline' },
  { id: 'note', label: 'Note', icon: 'document-text-outline' },
  { id: 'overflow', label: 'More', icon: 'ellipsis-vertical' },
];

export interface ExerciseActionBarViewProps {
  hasNote: boolean;
  // Accepted but deliberately never gates visibility: the Warm-up button stays visible regardless
  // of this preference (resolves 05-RESEARCH.md Open Question 1) — the preference only ever gates
  // auto-population, which this bar never performs itself. Kept as an explicit prop so a test can
  // prove the non-effect rather than merely assume it.
  warmupSetsEnabled: boolean;
  colors: ThemeColors;
  onPress: (id: ExerciseActionId) => void;
}

// Hook-free — direct-invocable by a test, matching CycleStripView/DayDeckView. Maps over
// EXERCISE_ACTIONS rather than four literal Pressables (D-13); every item is always rendered, at
// the visual weight of a bottom-tab-bar item, wrapping to a second row rather than scrolling or
// clipping (05-UI-SPEC E6 overflow, R4). The Note item's badge is the only per-item variable state.
export function ExerciseActionBarView({ hasNote, colors, onPress }: ExerciseActionBarViewProps) {
  return (
    <View className="mb-md flex-row flex-wrap gap-sm">
      {EXERCISE_ACTIONS.map((action) => (
        <Pressable
          key={action.id}
          onPress={() => onPress(action.id)}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          className="items-center justify-center gap-xs rounded-md"
          style={{ minWidth: 48, minHeight: 48 }}
        >
          <View>
            <Ionicons name={action.icon} size={20} color={colors.foregroundMuted} />
            {action.id === 'note' && hasNote ? (
              <View
                accessibilityLabel="Note exists"
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -4,
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.accent,
                }}
              />
            ) : null}
          </View>
          <Text className="text-label font-normal text-foreground-muted">{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export interface ExerciseActionBarProps {
  hasNote: boolean;
  warmupSetsEnabled: boolean;
  onPress: (id: ExerciseActionId) => void;
}

export function ExerciseActionBar(props: ExerciseActionBarProps) {
  const colors = useThemeColors();
  return <ExerciseActionBarView {...props} colors={colors} />;
}
