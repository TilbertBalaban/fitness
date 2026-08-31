import Ionicons from '@expo/vector-icons/Ionicons';
import { useColorScheme } from 'nativewind';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

// Mirrors HistoryActionSheet.tsx's/ProgressPhotoActionSheet.tsx's local GLYPH_COLORS resolution
// exactly, for the same reason: ThemeColors (lib/theme-colors.ts) carries no full-strength
// foreground or destructive glyph colour, and this is the only consumer that needs either.
const GLYPH_COLORS: Record<'light' | 'dark', { foreground: string; destructive: string }> = {
  light: { foreground: 'rgb(9, 9, 11)', destructive: 'rgb(220, 38, 38)' },
  dark: { foreground: 'rgb(250, 250, 250)', destructive: 'rgb(239, 68, 68)' },
};

export type MetricEntryActionId = 'edit' | 'delete';

export interface MetricEntryAction {
  id: MetricEntryActionId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
}

// A fixed constant, not a computed list — mirrors HISTORY_ROW_ACTIONS/PROGRESS_PHOTO_ACTIONS
// verbatim. Exactly two rows: D-10's "no separate correction concept" means edit and delete are
// the row's only two actions.
export const METRIC_ENTRY_ACTIONS: MetricEntryAction[] = [
  { id: 'edit', label: 'Edit', icon: 'create-outline' },
  { id: 'delete', label: 'Delete', icon: 'trash-outline', destructive: true },
];

export interface MetricEntryActionSheetViewProps {
  entryLabel: string;
  colors: { foreground: string; destructive: string };
  // Selecting delete only asks — it never deletes directly. The caller (the trend-detail screen)
  // surfaces DeleteMetricEntryDialog on the 'delete' id rather than this sheet mutating anything.
  onSelect: (id: MetricEntryActionId) => void;
  onCancel: () => void;
}

// Hook-free — mirrors ProgressPhotoActionSheetView's overlay/ScrollView/48x48 row geometry and its
// self-contained <Modal> (Phase 12's own convention: MetricEntrySheetView, TrackKindSheetView,
// ProgressPhotoActionSheetView all wrap their own <Modal> rather than a caller-wrapped one).
export function MetricEntryActionSheetView({ entryLabel, colors, onSelect, onCancel }: MetricEntryActionSheetViewProps) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-background/80 px-lg">
        <ScrollView
          className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Text className="text-heading font-semibold text-foreground">{entryLabel}</Text>

          <View className="mt-md gap-xs">
            {METRIC_ENTRY_ACTIONS.map((action) => (
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

export interface MetricEntryActionSheetProps {
  entryLabel: string;
  onSelect: (id: MetricEntryActionId) => void;
  onCancel: () => void;
}

export function MetricEntryActionSheet(props: MetricEntryActionSheetProps) {
  const { colorScheme } = useColorScheme();
  const colors = GLYPH_COLORS[colorScheme === 'dark' ? 'dark' : 'light'];
  return <MetricEntryActionSheetView {...props} colors={colors} />;
}

export interface DeleteMetricEntryDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

// DeleteWorkoutDialog/DeletePhotoDialog-shaped (same overlay, same two-button 48x48 geometry) with
// 12-UI-SPEC's own confirm copy for this action — self-contained in its own <Modal>, matching this
// phase's other dialogs rather than HistoryActionSheet.tsx's externally-wrapped precedent.
export function DeleteMetricEntryDialog({ onConfirm, onCancel }: DeleteMetricEntryDialogProps) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-background/80 px-lg">
        <ScrollView className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg" contentContainerStyle={{ flexGrow: 1 }}>
          <Text className="text-heading font-semibold text-foreground">Delete Entry</Text>
          <Text className="mt-sm text-body text-foreground-muted">
            This entry will be deleted. This can't be undone. Delete anyway?
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
