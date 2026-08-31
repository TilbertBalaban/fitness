import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, Text, View } from 'react-native';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

export type QuickActionId =
  | 'quick_weigh_in'
  | 'quick_measurement'
  | 'progress_photo'
  | 'history'
  | 'new_program'
  | 'one_off_workout';

export interface QuickAction {
  id: QuickActionId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

// D-27/D-28: six rows, this exact order, never reordered and never conditionally hidden. Unlike
// SESSION_EXERCISE_ACTIONS/HISTORY_ROW_ACTIONS this shape carries no `destructive` flag at all —
// none of the six is a destructive action (S3).
export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'quick_weigh_in', label: 'Quick Weigh-In', icon: 'scale-outline' },
  { id: 'quick_measurement', label: 'Quick Measurement', icon: 'resize-outline' },
  { id: 'progress_photo', label: 'Progress Photo', icon: 'camera-outline' },
  { id: 'history', label: 'History', icon: 'time-outline' },
  { id: 'new_program', label: 'New Program', icon: 'add-circle-outline' },
  { id: 'one_off_workout', label: 'One-off Workout', icon: 'barbell-outline' },
];

export type QuickActionDestination = { kind: 'navigate'; route: string } | { kind: 'in-place' };

// R30's testable distinction: a pure-navigation destination carries the route the caller dismisses
// the sheet THEN pushes to; an in-place destination carries none, because it writes/opens over
// Home instead (D-28). The one-off route carries `openOneOff=1`, the param workout.tsx reads once
// on mount to open its own existing picker (see workout.tsx's own doc comment) — no picker or
// session logic is duplicated here.
export function resolveQuickAction(id: QuickActionId): QuickActionDestination {
  switch (id) {
    case 'history':
      return { kind: 'navigate', route: '/(tabs)/history' };
    case 'new_program':
      return { kind: 'navigate', route: '/programs/generate' };
    case 'one_off_workout':
      return { kind: 'navigate', route: '/(tabs)/workout?openOneOff=1' };
    default:
      return { kind: 'in-place' };
  }
}

export interface QuickActionSheetViewProps {
  colors: ThemeColors;
  onSelect: (id: QuickActionId) => void;
  onCancel: () => void;
}

// Hook-free, mirrors SessionActionSheetView/HistoryActionSheetView's overlay/card/48x48 row shape
// verbatim (D-27). This sheet has exactly one state (S3): every row is always actionable, never
// hidden, never disabled — no gym profile, no active program and no logged history are handled by
// the destination screens themselves. Icon colour is foregroundMuted for every row — none of the
// six is destructive, so the accent-vs-destructive split SESSION_EXERCISE_ACTIONS needs is unused.
export function QuickActionSheetView({ colors, onSelect, onCancel }: QuickActionSheetViewProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <View className="w-full max-w-[400px] rounded-md bg-surface p-lg">
        <Text className="text-heading font-semibold text-foreground">Quick Actions</Text>

        <View className="mt-md gap-xs">
          {QUICK_ACTIONS.map((action) => (
            <Pressable
              key={action.id}
              onPress={() => onSelect(action.id)}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              style={{ minHeight: 48 }}
              className="flex-row items-center gap-sm rounded-md px-md py-sm"
            >
              <Ionicons name={action.icon} size={20} color={colors.foregroundMuted} />
              <Text className="text-body font-normal text-foreground">{action.label}</Text>
            </Pressable>
          ))}
        </View>

        <View className="mt-lg flex-row justify-end">
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={{ minWidth: 48, minHeight: 48 }}
            className="items-center justify-center rounded-md px-md py-sm"
          >
            <Text className="text-body text-foreground-muted">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export interface QuickActionSheetProps {
  onSelect: (id: QuickActionId) => void;
  onCancel: () => void;
}

export function QuickActionSheet({ onSelect, onCancel }: QuickActionSheetProps) {
  const colors = useThemeColors();
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <QuickActionSheetView colors={colors} onSelect={onSelect} onCancel={onCancel} />
    </Modal>
  );
}
