import Ionicons from '@expo/vector-icons/Ionicons';
import { useColorScheme } from 'nativewind';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

// Mirrors HistoryActionSheet.tsx's local GLYPH_COLORS resolution exactly, for the same reason:
// ThemeColors (lib/theme-colors.ts) carries no full-strength foreground or destructive glyph
// color, and this is the only consumer that needs either.
const GLYPH_COLORS: Record<'light' | 'dark', { foreground: string; destructive: string }> = {
  light: { foreground: 'rgb(9, 9, 11)', destructive: 'rgb(220, 38, 38)' },
  dark: { foreground: 'rgb(250, 250, 250)', destructive: 'rgb(239, 68, 68)' },
};

export type ProgressPhotoActionId = 'view' | 'edit-note' | 'delete';

export interface ProgressPhotoAction {
  id: ProgressPhotoActionId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
}

// A fixed constant, not a computed list — mirrors HISTORY_ROW_ACTIONS/SESSION_EXERCISE_ACTIONS
// verbatim. Exactly three rows: view full size, edit note, delete; only Delete is destructive.
export const PROGRESS_PHOTO_ACTIONS: ProgressPhotoAction[] = [
  { id: 'view', label: 'View Full Size', icon: 'eye-outline' },
  { id: 'edit-note', label: 'Edit Note', icon: 'create-outline' },
  { id: 'delete', label: 'Delete', icon: 'trash-outline', destructive: true },
];

export interface ProgressPhotoActionSheetViewProps {
  dateLabel: string;
  colors: { foreground: string; destructive: string };
  // Selecting delete only asks — it never deletes directly. The caller (ProgressPhotosScreen)
  // surfaces DeletePhotoDialog on the 'delete' id rather than this sheet mutating anything itself.
  onSelect: (id: ProgressPhotoActionId) => void;
  onCancel: () => void;
}

// Hook-free — mirrors HistoryActionSheetView's overlay/ScrollView/48x48 row geometry verbatim,
// self-contained in its own <Modal> like this plan's PhotoCaptureConfirmSheet/MuscleDrilldownSheet.
export function ProgressPhotoActionSheetView({ dateLabel, colors, onSelect, onCancel }: ProgressPhotoActionSheetViewProps) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-background/80 px-lg">
        <ScrollView
          className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Text className="text-heading font-semibold text-foreground">{dateLabel}</Text>

          <View className="mt-md gap-xs">
            {PROGRESS_PHOTO_ACTIONS.map((action) => (
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
    </Modal>
  );
}

export interface ProgressPhotoActionSheetProps {
  dateLabel: string;
  onSelect: (id: ProgressPhotoActionId) => void;
  onCancel: () => void;
}

export function ProgressPhotoActionSheet(props: ProgressPhotoActionSheetProps) {
  const { colorScheme } = useColorScheme();
  const colors = GLYPH_COLORS[colorScheme === 'dark' ? 'dark' : 'light'];
  return <ProgressPhotoActionSheetView {...props} colors={colors} />;
}

export interface DeletePhotoDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

// DeleteWorkoutDialog-shaped (same overlay, same two-button 48x48 geometry) with 12-UI-SPEC's own
// confirm copy for this action — self-contained in its own <Modal>, matching this plan's other
// sheets rather than HistoryActionSheet.tsx's externally-wrapped precedent.
export function DeletePhotoDialog({ onConfirm, onCancel }: DeletePhotoDialogProps) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-background/80 px-lg">
        <ScrollView className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg" contentContainerStyle={{ flexGrow: 1 }}>
          <Text className="text-heading font-semibold text-foreground">Delete Photo</Text>
          <Text className="mt-sm text-body text-foreground-muted">
            This photo and its bytes on this device will be deleted. This can't be undone. Delete anyway?
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
    </Modal>
  );
}
