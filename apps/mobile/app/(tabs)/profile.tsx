import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { DEFAULT_PROGRESSION_PREFERENCE, type ProgressionPreference } from '@fitness/api-contracts';

import { AppearanceControl } from '@/components/AppearanceControl';
import { SelectField, type SelectFieldOption } from '@/components/SelectField';
import { SignOutDialog } from '@/components/SignOutDialog';
import { authClient } from '@/lib/auth-client';
import {
  loadActiveEquipmentProfileId,
  loadEquipmentProfiles,
  resolveLiveEquipmentProfileId,
} from '@/lib/db/equipment-profiles';
import {
  loadProgressionPreference,
  loadWorkoutPreferences,
  setProgressionPreference,
  setWorkoutPreference,
  type WorkoutPreferences,
} from '@/lib/db/preferences';
import { getAlertPermission, openAlertSettings, type AlertPermission } from '@/lib/rest-alert';
import { signOut } from '@/lib/sign-out';
import { useThemeColors } from '@/lib/theme-colors';

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

const PROGRESSION_PREFERENCE_OPTIONS: SelectFieldOption[] = [
  { value: 'widen_rep_range_first', label: 'Add reps before weight' },
  { value: 'match_previous_weight', label: 'Match my last weight' },
];

// D-07. A closed two-value set, so SelectField's chip picker fits without a new form primitive.
export function ProgressionPreferenceRow({
  value,
  onChange,
}: {
  value: ProgressionPreference;
  onChange: (value: ProgressionPreference) => void;
}) {
  return (
    <View className="gap-xs">
      <SelectField
        label="Progression style"
        value={value}
        options={PROGRESSION_PREFERENCE_OPTIONS}
        placeholder="Choose a progression style"
        onChange={(next) => onChange(next as ProgressionPreference)}
      />
      <Text className="text-label font-normal text-foreground-muted">
        Decides whether we suggest more reps before a heavier weight, or hold the weight steady until you are
        ready to jump up.
      </Text>
    </View>
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

// Reuses ToggleRow's bordered, surface-filled, rounded row chrome — the shipped minimum-height
// row shape — but with a link/button role in place of a switch, a leading icon, and a trailing
// chevron in place of the on/off pill. The active gym's name is optional: an unresolved read
// omits the trailing label entirely rather than rendering the row broken or disabled.
export function GymRow({ gymName, onPress }: { gymName?: string; onPress: () => void }) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Gym Profiles"
      className="flex-row items-center justify-between rounded-md border border-foreground-muted bg-surface px-md py-sm"
      style={{ minHeight: 48 }}
    >
      <View className="flex-row items-center gap-sm">
        <Ionicons name="barbell-outline" size={20} color={colors.foregroundMuted} />
        <Text className="text-body font-normal text-foreground">Gym Profiles</Text>
      </View>
      <View className="flex-row items-center gap-xs">
        {gymName ? <Text className="text-label font-normal text-foreground-muted">{gymName}</Text> : null}
        <Ionicons name="chevron-forward" size={20} color={colors.foregroundMuted} />
      </View>
    </Pressable>
  );
}

// S5/S8 entry points (12-08). Same bordered, surface-filled, rounded row chrome as GymRow, minus
// its optional trailing status label — the two rows below carry no live summary here.
function DataRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center justify-between rounded-md border border-foreground-muted bg-surface px-md py-sm"
      style={{ minHeight: 48 }}
    >
      <View className="flex-row items-center gap-sm">
        <Ionicons name={icon} size={20} color={colors.foregroundMuted} />
        <Text className="text-body font-normal text-foreground">{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.foregroundMuted} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { data: sessionData, refetch: refetchSession } = authClient.useSession();
  const userId = sessionData?.user?.id ?? null;
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [preferences, setPreferences] = useState<WorkoutPreferences>(DEFAULT_PREFERENCES);
  const [progressionPreference, setProgressionPreferenceState] = useState<ProgressionPreference>(
    DEFAULT_PROGRESSION_PREFERENCE,
  );
  const [notificationPermission, setNotificationPermission] = useState<AlertPermission>('undetermined');
  const [activeGymName, setActiveGymName] = useState<string | undefined>(undefined);

  // An all-settled read, not Promise.all: a failure resolving the active gym's name must never
  // prevent the workout preferences or notification permission from loading, and vice versa — the
  // screen still issues one read pass per focus, but each of its five reads fails independently.
  // getAlertPermission is a read, never a prompt (it never calls requestPermissionsAsync) — safe on
  // every focus, including after the user changes the OS-level answer in Settings and returns.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        if (!userId) return;
        const [preferencesResult, progressionPreferenceResult, permissionResult, gymProfilesResult, activeGymIdResult] =
          await Promise.allSettled([
            loadWorkoutPreferences(userId),
            loadProgressionPreference(userId),
            getAlertPermission(),
            loadEquipmentProfiles(userId),
            loadActiveEquipmentProfileId(userId),
          ]);
        if (!active) return;

        if (preferencesResult.status === 'fulfilled') setPreferences(preferencesResult.value);
        if (progressionPreferenceResult.status === 'fulfilled') setProgressionPreferenceState(progressionPreferenceResult.value);
        if (permissionResult.status === 'fulfilled') setNotificationPermission(permissionResult.value);

        if (gymProfilesResult.status === 'fulfilled' && activeGymIdResult.status === 'fulfilled') {
          const liveId = resolveLiveEquipmentProfileId(gymProfilesResult.value, activeGymIdResult.value);
          setActiveGymName(gymProfilesResult.value.find((profile) => profile.id === liveId)?.name);
        } else {
          setActiveGymName(undefined);
        }
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

  const setProgressionPreferenceChoice = useCallback(
    async (nextValue: ProgressionPreference) => {
      if (!userId) return;
      setProgressionPreferenceState(nextValue);
      await setProgressionPreference(userId, nextValue);
    },
    [userId],
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
          <ProgressionPreferenceRow
            value={progressionPreference}
            onChange={(next) => void setProgressionPreferenceChoice(next)}
          />
          <NotificationRow permission={notificationPermission} onTurnOn={() => void openAlertSettings()} />
        </View>

        <View className="gap-sm">
          <Text className="text-label font-normal text-foreground-muted">Gyms</Text>
          <GymRow gymName={activeGymName} onPress={() => router.push('/gym-profiles')} />
          <DataRow icon="body-outline" label="Body Metrics" onPress={() => router.push('/body-metrics')} />
          <DataRow icon="images-outline" label="Progress Photos" onPress={() => router.push('/progress-photos')} />
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
