import { Pressable, ScrollView, Text, View } from 'react-native';
import { ErrorBanner } from './ErrorBanner';

export interface ChangeSetTypeDialogProps {
  subEntryCount: number;
  // A failed delete-and-retype write renders the shipped ErrorBanner and keeps the dialog open
  // with the group unchanged (E2 error state) — the confirm action never half-applies.
  errorMessage?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

// D-09's destructive confirm, ArchiveDialog-shaped — copies RemoveExerciseDialog's leaner
// single-purpose structure (SessionActionSheet.tsx) rather than ArchiveDialog's COPY table, since
// this dialog has exactly one fixed copy variant (only the sub-entry count interpolates). This is
// the phase's only place logged training data is deleted: the count is always named up front, and
// clearSubEntries (set-groups.ts) only ever runs behind this confirm.
export function ChangeSetTypeDialog({ subEntryCount, errorMessage, onConfirm, onCancel }: ChangeSetTypeDialogProps) {
  const body =
    subEntryCount === 1
      ? "This set has 1 sub-entry. Changing its type will delete it. This can't be undone."
      : `This set has ${subEntryCount} sub-entries. Changing its type will delete them. This can't be undone.`;

  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg" contentContainerStyle={{ flexGrow: 1 }}>
        <Text className="text-heading font-semibold text-foreground">Change Set Type?</Text>
        <Text className="mt-sm text-body text-foreground-muted">{body}</Text>

        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

        <View className="mt-lg flex-row justify-end gap-sm">
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            style={{ minWidth: 48, minHeight: 48 }}
            className="items-center justify-center rounded-md px-md py-sm"
          >
            <Text className="text-body text-foreground-muted">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            accessibilityRole="button"
            style={{ minWidth: 48, minHeight: 48 }}
            className="items-center justify-center rounded-md bg-destructive px-md py-sm"
          >
            <Text className="text-body font-semibold text-background">Delete and Change</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
