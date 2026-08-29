import { Pressable, ScrollView, Text, View } from 'react-native';

export interface SignOutDialogProps {
  pendingCount: number;
  submitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Renders only when there is something to lose (D-04, UI-SPEC "Destructive confirmation") — a
// zero pending count proceeds without ever mounting this component.
export function SignOutDialog({ pendingCount, submitting = false, onConfirm, onCancel }: SignOutDialogProps) {
  if (pendingCount <= 0) return null;

  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView
        className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <Text className="text-heading font-semibold text-foreground">Sign out?</Text>
        <Text className="mt-sm text-body text-foreground-muted">
          You have {pendingCount} unsynced changes. Signing out will discard them.
        </Text>
        <View className="mt-lg flex-row justify-end gap-sm">
          <Pressable
            onPress={onCancel}
            disabled={submitting}
            accessibilityRole="button"
            style={{ minWidth: 48, minHeight: 48 }}
            className="items-center justify-center rounded-md px-md py-sm"
          >
            <Text className="text-body text-foreground-muted">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityState={{ disabled: submitting, busy: submitting }}
            style={{ minWidth: 48, minHeight: 48 }}
            className={`items-center justify-center rounded-md bg-destructive px-md py-sm ${
              submitting ? 'opacity-60' : ''
            }`}
          >
            <Text className="text-body font-semibold text-background">
              {submitting ? 'Signing out…' : 'Sign Out Anyway'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
