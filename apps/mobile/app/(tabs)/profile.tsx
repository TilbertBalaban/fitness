import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { AppearanceControl } from '@/components/AppearanceControl';
import { SignOutDialog } from '@/components/SignOutDialog';
import { authClient } from '@/lib/auth-client';
import { loadWorkoutPreferences, setWorkoutPreference, type WorkoutPreferences } from '@/lib/db/preferences';
import { getAlertPermission, openAlertSettings, type AlertPermission } from '@/lib/rest-alert';
import { signOut } from '@/lib/sign-out';

interface PendingConfirmation {
  count: number;
  resolve: (confirmed: boolean) => void;
}

const DEFAULT_PREFERENCES: WorkoutPreferences = { autoAdvanceEnabled: true, warmupSetsEnabled: true };

// Matches AppearanceControl's row chrome (a bordered, 48px-minimum surface row) rather than
// introducing a second toggle visual language for this phase's one new settings section.
export function ToggleRow({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      className="flex-row items-center justify-between rounded-md border border-foreground-muted bg-surface px-md py-sm"
      style={{ minHeight: 48 }}
    >
      <Text className="text-body font-normal text-foreground">{label}</Text>
      <View
        className={`items-center justify-center rounded-md px-md py-sm ${value ? 'bg-accent' : 'bg-secondary'}`}
        style={{ minHeight: 32, minWidth: 48 }}
      >
        <Text className={`text-label font-semibold ${value ? 'text-white' : 'text-foreground-muted'}`}>{value ? 'On' : 'Off'}</Text>
      </View>
    </Pressable>
  );
}

// D-22's required re-request path (Copywriting Contract, Notification degraded-state banner):
// deep-links to OS Settings via openAlertSettings, never calls the request API a second time —
// iOS will not show a second native prompt once denied.
export function NotificationRow({ permission, onTurnOn }: { permission: AlertPermission; onTurnOn: () => void }) {
  const showTurnOn = permission === 'denied' || permission === 'unsupported';
  return (
    <View
      className="flex-row items-center justify-between rounded-md border border-foreground-muted bg-surface px-md py-sm"
      style={{ minHeight: 48 }}
    >
      <Text className="text-body font-normal text-foreground">Rest Timer Alerts</Text>
      {showTurnOn ? (
        <Pressable
          onPress={onTurnOn}
          accessibilityRole="button"
          accessibilityLabel="Turn On"
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text className="text-body font-semibold text-accent">Turn On</Text>
        </Pressable>
      ) : (
        <Text className="text-label font-normal text-foreground-muted">{permission === 'granted' ? 'On' : 'Not set'}</Text>
      )}
    </View>
  );
}

export default function ProfileScreen() {
  const { data: sessionData, refetch: refetchSession } = authClient.useSession();
  const userId = sessionData?.user?.id ?? null;
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [preferences, setPreferences] = useState<WorkoutPreferences>(DEFAULT_PREFERENCES);
  const [notificationPermission, setNotificationPermission] = useState<AlertPermission>('undetermined');

  // A read, never a prompt (getAlertPermission never calls requestPermissionsAsync) — safe on
  // every focus, including after the user changes the OS-level answer in Settings and returns.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        if (!userId) return;
        const [loadedPreferences, permission] = await Promise.all([loadWorkoutPreferences(userId), getAlertPermission()]);
        if (!active) return;
        setPreferences(loadedPreferences);
        setNotificationPermission(permission);
      })();
      return () => {
        active = false;
      };
    }, [userId]),
  );

  const togglePreference = useCallback(
    async (key: keyof WorkoutPreferences) => {
      if (!userId) return;
      const nextValue = !preferences[key];
      setPreferences((current) => ({ ...current, [key]: nextValue }));
      await setWorkoutPreference(userId, key, nextValue);
    },
    [userId, preferences],
  );

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

        <View className="gap-sm">
          <Text className="text-label font-normal text-foreground-muted">Workout settings</Text>
          <ToggleRow
            label="Auto-advance"
            value={preferences.autoAdvanceEnabled}
            onToggle={() => void togglePreference('autoAdvanceEnabled')}
          />
          <ToggleRow
            label="Warm-up suggestions"
            value={preferences.warmupSetsEnabled}
            onToggle={() => void togglePreference('warmupSetsEnabled')}
          />
          <NotificationRow permission={notificationPermission} onTurnOn={() => void openAlertSettings()} />
        </View>

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
