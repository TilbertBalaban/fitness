import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useThemeColors } from '@/lib/theme-colors';

export interface NotificationPermissionPromptViewProps {
  onAllow: () => void;
  onDismiss: () => void;
}

// D-22's onboarding rationale — rendered on the Workout tab's pre-session state, before any
// workout has started, never as an OS dialog interrupting the gym floor. Copy is 05-UI-SPEC's
// Copywriting Contract verbatim. Hook-free (no icon, no theme-dependent color), matching every
// other *View in this component set.
export function NotificationPermissionPromptView({ onAllow, onDismiss }: NotificationPermissionPromptViewProps) {
  return (
    <View className="gap-sm rounded-md bg-secondary px-md py-md">
      <Text className="text-heading font-semibold text-foreground">Rest Timer Alerts</Text>
      <Text className="text-body font-normal text-foreground-muted">
        So your rest timer can alert you even with your phone in your pocket.
      </Text>
      <PrimaryButton label="Allow Notifications" onPress={onAllow} />
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Not Now"
        className="items-center justify-center"
        style={{ minHeight: 48 }}
      >
        <Text className="text-body font-normal text-foreground-muted">Not Now</Text>
      </Pressable>
    </View>
  );
}

export function NotificationPermissionPrompt(props: NotificationPermissionPromptViewProps) {
  return <NotificationPermissionPromptView {...props} />;
}

export interface BackgroundAlertsOffNoteProps {
  onTurnOn: () => void;
  onDismiss: () => void;
}

// D-23's degraded-state banner — rendered on the live workout screen whenever permission is
// 'denied' or 'unsupported'. Dismissible for the current session only: the caller mounts this
// with `key={session.id}` so a fresh session always shows it again — nothing about the timer may
// appear to work while quietly not working (R9).
export function BackgroundAlertsOffNote({ onTurnOn, onDismiss }: BackgroundAlertsOffNoteProps) {
  const colors = useThemeColors();

  return (
    <View accessibilityRole="alert" className="flex-row items-center gap-sm rounded-md bg-surface px-md py-sm">
      <Text className="flex-1 text-body font-normal text-foreground-muted">
        Background alerts are off — your rest timer will still count down and sound/vibrate while the app is open.
      </Text>
      <Pressable
        onPress={onTurnOn}
        accessibilityRole="button"
        accessibilityLabel="Turn On"
        className="items-center justify-center"
        style={{ minHeight: 48, minWidth: 48 }}
      >
        <Text className="text-body font-semibold text-accent">Turn On</Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        className="items-center justify-center"
        style={{ minHeight: 48, minWidth: 48 }}
      >
        <Ionicons name="close" size={16} color={colors.foregroundMuted} />
      </Pressable>
    </View>
  );
}
