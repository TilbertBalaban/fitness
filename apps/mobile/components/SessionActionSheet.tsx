import Ionicons from '@expo/vector-icons/Ionicons';
import { useColorScheme } from 'nativewind';
import { Pressable, ScrollView, Text, View } from 'react-native';

// ThemeColors (lib/theme-colors.ts) carries only accent/foregroundMuted/surface — no full-strength
// foreground or destructive glyph color exists there yet, and this file is the only consumer that
// needs either, so the two values are resolved locally here (mirroring theme-colors.ts's own
// light/dark PALETTE shape and global.css's --color-foreground/--color-destructive values exactly)
// rather than widening the shared ThemeColors interface and its required-field shape for every one
// of that type's other, unrelated consumers.
const GLYPH_COLORS: Record<'light' | 'dark', { foreground: string; destructive: string }> = {
  light: { foreground: 'rgb(9, 9, 11)', destructive: 'rgb(220, 38, 38)' },
  dark: { foreground: 'rgb(250, 250, 250)', destructive: 'rgb(239, 68, 68)' },
};

export type SessionExerciseActionId = 'swap' | 'remove' | 'reorder' | 'info' | 'equipment';

export interface SessionExerciseAction {
  id: SessionExerciseActionId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
}

// D-13's overflow: a fixed five-row constant — Swap, Remove, Reorder, Info, Equipment — mirroring
// RoutineActionSheet's own row anatomy verbatim, never reordered (UI-SPEC E10/E5 empty/zero-one-
// many). Equipment is appended last, matching D-06's additive-only rule for a closed UI list; its
// rendering is gated by `hasEquipment` below, so its absence from the constant is never the answer
// — the constant always lists all five, the view decides which paint (E5 populated/partial).
export const SESSION_EXERCISE_ACTIONS: SessionExerciseAction[] = [
  { id: 'swap', label: 'Swap', icon: 'swap-horizontal-outline' },
  { id: 'remove', label: 'Remove', icon: 'trash-outline', destructive: true },
  { id: 'reorder', label: 'Reorder', icon: 'reorder-three-outline' },
  { id: 'info', label: 'Info', icon: 'information-circle-outline' },
  { id: 'equipment', label: 'Equipment', icon: 'construct-outline' },
];

export interface SessionActionSheetViewProps {
  exerciseName: string;
  colors: { foreground: string; destructive: string };
  // R11: whether the current exercise's equipment resolves to non-collapsed band content — always
  // computed by the caller from the one shared predicate (hasResolvableEquipment/
  // resolveEquipmentBand), never re-derived here. Absent, not disabled: a bodyweight/kettlebell/etc
  // exercise structurally excludes the row rather than rendering it inert (E5 partial).
  hasEquipment: boolean;
  onSelect: (id: SessionExerciseActionId) => void;
  onCancel: () => void;
}

// Hook-free — mirrors RoutineActionSheet.tsx's shape verbatim: same overlay, same ScrollView, same
// 48x48 row geometry. Remove renders in the destructive color; every other row (including
// Equipment) in default foreground — marking equipment unavailable is never rendered as
// destructive (UI-SPEC E5 populated). Every row is always actionable — there is no disabled-row
// state (E10/E5 partial).
export function SessionActionSheetView({ exerciseName, colors, hasEquipment, onSelect, onCancel }: SessionActionSheetViewProps) {
  const visibleActions = SESSION_EXERCISE_ACTIONS.filter((action) => action.id !== 'equipment' || hasEquipment);

  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView
        className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <Text className="text-heading font-semibold text-foreground">{exerciseName}</Text>

        <View className="mt-md gap-xs">
          {visibleActions.map((action) => (
            <Pressable
              key={action.id}
              onPress={() => onSelect(action.id)}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              style={{ minHeight: 48 }}
              className="flex-row items-center gap-sm rounded-md px-md py-sm"
            >
              <Ionicons name={action.icon} size={20} color={action.destructive ? colors.destructive : colors.foreground} />
              <Text className={`text-body font-normal ${action.destructive ? 'text-destructive' : 'text-foreground'}`}>
                {action.label}
              </Text>
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
      </ScrollView>
    </View>
  );
}

export interface SessionActionSheetProps {
  exerciseName: string;
  hasEquipment: boolean;
  onSelect: (id: SessionExerciseActionId) => void;
  onCancel: () => void;
}

export function SessionActionSheet(props: SessionActionSheetProps) {
  const { colorScheme } = useColorScheme();
  const colors = GLYPH_COLORS[colorScheme === 'dark' ? 'dark' : 'light'];
  return <SessionActionSheetView {...props} colors={colors} />;
}

export interface RemoveExerciseDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

// Copies ArchiveDialog.tsx's overlay/ScrollView/two-button shape exactly ("ArchiveDialog-shaped"),
// with the Remove Exercise copy from 05-UI-SPEC's Copywriting Contract, which ArchiveDialog's own
// fixed COPY table does not carry — kept as a sibling component rather than a new entry in that
// table so ArchiveDialog.tsx (outside this plan's file scope) stays untouched.
export function RemoveExerciseDialog({ onConfirm, onCancel }: RemoveExerciseDialogProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg" contentContainerStyle={{ flexGrow: 1 }}>
        <Text className="text-heading font-semibold text-foreground">Remove Exercise</Text>
        <Text className="mt-sm text-body text-foreground-muted">
          Any sets already logged for this exercise stay in your history. Remove it from this workout?
        </Text>
        <View className="mt-lg flex-row justify-end gap-sm">
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={{ minWidth: 48, minHeight: 48 }}
            className="items-center justify-center rounded-md px-md py-sm"
          >
            <Text className="text-body text-foreground-muted">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            accessibilityRole="button"
            accessibilityLabel="Remove"
            style={{ minWidth: 48, minHeight: 48 }}
            className="items-center justify-center rounded-md bg-destructive px-md py-sm"
          >
            <Text className="text-body font-semibold text-background">Remove</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
