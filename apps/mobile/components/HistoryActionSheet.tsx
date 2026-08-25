import Ionicons from '@expo/vector-icons/Ionicons';
import { useColorScheme } from 'nativewind';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { TextField } from './TextField';

// Mirrors SessionActionSheet.tsx's local GLYPH_COLORS resolution exactly, for the same reason:
// ThemeColors (lib/theme-colors.ts) carries no full-strength foreground or destructive glyph
// color, and this is the only consumer that needs either.
const GLYPH_COLORS: Record<'light' | 'dark', { foreground: string; destructive: string }> = {
  light: { foreground: 'rgb(9, 9, 11)', destructive: 'rgb(220, 38, 38)' },
  dark: { foreground: 'rgb(250, 250, 250)', destructive: 'rgb(239, 68, 68)' },
};

export type HistoryRowActionId = 'view' | 'edit' | 'rename' | 'duplicate' | 'delete';

export interface HistoryRowAction {
  id: HistoryRowActionId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
}

// A fixed constant, not a computed list — mirrors SESSION_EXERCISE_ACTIONS (SessionActionSheet.tsx)
// verbatim. 05-10's Edit row is an append, exactly what 05-09 built this as a list to allow
// (UI-SPEC E11 populated backstop, resolved here). Edit navigates to the workout route carrying
// the session id, which resolveSessionScreenMode (session-mode.tsx) resolves to `editing` mode —
// the same screen that logged the workout, not a separate history editor (D-32, LOG-20).
export const HISTORY_ROW_ACTIONS: HistoryRowAction[] = [
  { id: 'view', label: 'View', icon: 'eye-outline' },
  { id: 'edit', label: 'Edit', icon: 'create-outline' },
  { id: 'rename', label: 'Rename', icon: 'pencil-outline' },
  { id: 'duplicate', label: 'Duplicate', icon: 'copy-outline' },
  { id: 'delete', label: 'Delete', icon: 'trash-outline', destructive: true },
];

export interface HistoryActionSheetViewProps {
  sessionLabel: string;
  colors: { foreground: string; destructive: string };
  onSelect: (id: HistoryRowActionId) => void;
  onCancel: () => void;
}

// Hook-free — mirrors RoutineActionSheet's overlay/ScrollView/48x48 row geometry verbatim. Every
// row is always actionable (no disabled-row state, UI-SPEC E10-style partial rule) and Delete
// renders in the destructive color, the rest in default foreground.
export function HistoryActionSheetView({ sessionLabel, colors, onSelect, onCancel }: HistoryActionSheetViewProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView
        className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <Text className="text-heading font-semibold text-foreground">{sessionLabel}</Text>

        <View className="mt-md gap-xs">
          {HISTORY_ROW_ACTIONS.map((action) => (
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

export interface HistoryActionSheetProps {
  sessionLabel: string;
  onSelect: (id: HistoryRowActionId) => void;
  onCancel: () => void;
}

export function HistoryActionSheet(props: HistoryActionSheetProps) {
  const { colorScheme } = useColorScheme();
  const colors = GLYPH_COLORS[colorScheme === 'dark' ? 'dark' : 'light'];
  return <HistoryActionSheetView {...props} colors={colors} />;
}

export interface DeleteWorkoutDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

// ArchiveDialog-shaped (same overlay, same two-button 48x48 geometry) with the Delete Workout copy
// from 05-UI-SPEC's Copywriting Contract, which ArchiveDialog's own fixed COPY table does not
// carry — kept as a sibling here rather than a new ArchiveDialog.tsx entry, mirroring
// SessionActionSheet.tsx's RemoveExerciseDialog precedent.
export function DeleteWorkoutDialog({ onConfirm, onCancel }: DeleteWorkoutDialogProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg" contentContainerStyle={{ flexGrow: 1 }}>
        <Text className="text-heading font-semibold text-foreground">Delete Workout</Text>
        <Text className="mt-sm text-body text-foreground-muted">
          This workout and everything logged in it will be deleted. This can&apos;t be undone. Delete anyway?
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
            accessibilityLabel="Delete"
            style={{ minWidth: 48, minHeight: 48 }}
            className="items-center justify-center rounded-md bg-destructive px-md py-sm"
          >
            <Text className="text-body font-semibold text-background">Delete</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

export interface RenameSessionDialogProps {
  initialValue: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

// A single-field dialog reusing TextField (05-09 Task 3) — unlike the Program Library's inline
// row-replacement rename, a history row keeps its own row anatomy and this dialog is a modal
// overlay, matching the Delete confirmation's own overlay shape. Blank input is a legitimate
// answer here (renameSession normalises it to null, falling back to the date label) — there is no
// required-field error state the way a program name has one.
export function RenameSessionDialog({ initialValue, onConfirm, onCancel }: RenameSessionDialogProps) {
  const [value, setValue] = useState(initialValue);

  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg" contentContainerStyle={{ flexGrow: 1 }}>
        <Text className="text-heading font-semibold text-foreground">Rename Workout</Text>
        <View className="mt-md">
          <TextField label="Name" value={value} onChangeText={setValue} />
        </View>
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
            onPress={() => onConfirm(value)}
            accessibilityRole="button"
            accessibilityLabel="Save"
            style={{ minWidth: 48, minHeight: 48 }}
            className="items-center justify-center rounded-md bg-accent px-md py-sm"
          >
            <Text className="text-body font-semibold text-background">Save</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
