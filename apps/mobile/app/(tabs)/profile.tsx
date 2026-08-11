import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { AppearanceControl } from '@/components/AppearanceControl';
import { SignOutDialog } from '@/components/SignOutDialog';
import { signOut } from '@/lib/sign-out';

interface PendingConfirmation {
  count: number;
  resolve: (confirmed: boolean) => void;
}

export default function ProfileScreen() {
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // signOut consults pendingWriteCount and only calls this when the count is above zero, so in
  // Phase 1 the dialog never mounts and sign-out proceeds immediately. The seam is wired now so
  // Phase 2 replaces one function body instead of threading a confirmation through a shipped
  // lifecycle (D-04).
  const confirmDiscard = useCallback(
    (count: number) =>
      new Promise<boolean>((resolve) => setPendingConfirmation({ count, resolve })),
    [],
  );

  const settleConfirmation = useCallback(
    (confirmed: boolean) => {
      pendingConfirmation?.resolve(confirmed);
      setPendingConfirmation(null);
    },
    [pendingConfirmation],
  );

  const onSignOutPress = useCallback(async () => {
    setSubmitting(true);
    try {
      await signOut({ confirmDiscard });
    } finally {
      setSubmitting(false);
    }
  }, [confirmDiscard]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 }}
    >
      <View className="mt-xl gap-xl">
        <Text className="text-heading font-semibold text-foreground">Profile</Text>

        <AppearanceControl />

        <Pressable
          onPress={onSignOutPress}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityState={{ disabled: submitting, busy: submitting }}
          style={{ minHeight: 48 }}
          className={`items-center justify-center rounded-md border border-foreground-muted px-md py-sm ${
            submitting ? 'opacity-60' : ''
          }`}
        >
          <Text className="text-center text-body font-normal text-foreground">
            {submitting ? 'Signing out…' : 'Sign Out'}
          </Text>
        </Pressable>
      </View>

      {pendingConfirmation ? (
        <Modal transparent animationType="fade" onRequestClose={() => settleConfirmation(false)}>
          <SignOutDialog
            pendingCount={pendingConfirmation.count}
            submitting={submitting}
            onConfirm={() => settleConfirmation(true)}
            onCancel={() => settleConfirmation(false)}
          />
        </Modal>
      ) : null}
    </ScrollView>
  );
}
