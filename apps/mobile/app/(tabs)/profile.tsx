import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { AppearanceControl } from '@/components/AppearanceControl';
import { SignOutDialog } from '@/components/SignOutDialog';
import { authClient } from '@/lib/auth-client';
import { signOut } from '@/lib/sign-out';

interface PendingConfirmation {
  count: number;
  resolve: (confirmed: boolean) => void;
}

export default function ProfileScreen() {
  const { refetch: refetchSession } = authClient.useSession();
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // signOut consults pendingWriteCount and only calls this when the count is above zero, so the
  // dialog never mounts and sign-out proceeds immediately when nothing is pending (D-04).
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
      // signOut deliberately carries no dependency on the auth client, so nothing has told the
      // session atom the session ended and the root layout's guard would keep rendering this
      // shell over a revoked session until the next reload.
      await refetchSession();
    } finally {
      setSubmitting(false);
    }
  }, [confirmDiscard, refetchSession]);

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
