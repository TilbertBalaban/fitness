import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { formatClock, remainingSeconds } from '@/lib/rest-timer';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

export interface RestTimerFullScreenViewProps {
  colors: ThemeColors;
  restText: string;
  // At zero the extend/skip pair is replaced by a single "Back to Workout" CTA — there is nothing
  // left to extend or skip once rest has already ended (05-UI-SPEC's Rest Timer Full-Screen).
  atZero: boolean;
  onExtend: () => void;
  onSkip: () => void;
  onDismiss: () => void;
}

// Hook-free — direct-invocable by a test, matching every other *View in this component set.
export function RestTimerFullScreenView({ colors, restText, atZero, onExtend, onSkip, onDismiss }: RestTimerFullScreenViewProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background px-lg">
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        className="absolute items-center justify-center"
        style={{ left: 16, top: 24, width: 48, height: 48 }}
      >
        <Ionicons name="close" size={24} color={colors.foregroundMuted} />
      </Pressable>

      <Text className="font-semibold text-foreground" style={{ fontSize: 64 }}>
        {restText}
      </Text>

      {atZero ? (
        <View className="mt-xl w-full">
          <PrimaryButton label="Back to Workout" onPress={onDismiss} />
        </View>
      ) : (
        <View className="mt-xl flex-row flex-wrap items-center justify-center gap-md">
          <Pressable
            onPress={onExtend}
            accessibilityRole="button"
            accessibilityLabel="Add 30 seconds to the rest timer"
            className="items-center justify-center rounded-md bg-secondary px-md py-sm"
            style={{ minWidth: 48, minHeight: 48 }}
          >
            <Text className="text-body font-semibold text-accent">+30s</Text>
          </Pressable>
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip Rest"
            className="items-center justify-center rounded-md bg-secondary px-md py-sm"
            style={{ minWidth: 48, minHeight: 48 }}
          >
            <Text className="text-body font-semibold text-accent">Skip Rest</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export interface RestTimerFullScreenProps {
  restTargetAtMs: number | null;
  onExtend: () => void;
  onSkip: () => void;
  onDismiss: () => void;
}

const TICK_MS = 1000;

// Same one-second-tick-lives-in-the-wrapper shape as RestTimerBar — a visual refresh only. The
// countdown keeps running identically whether this screen is open or not (D-21's stored-timestamp
// model makes that free): dismissing here does not stop, pause, or otherwise touch the timer.
export function RestTimerFullScreen({ restTargetAtMs, onExtend, onSkip, onDismiss }: RestTimerFullScreenProps) {
  const colors = useThemeColors();
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((value) => value + 1), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const restSeconds = remainingSeconds(restTargetAtMs, Date.now());

  return (
    <RestTimerFullScreenView
      colors={colors}
      restText={formatClock(restSeconds)}
      atZero={restSeconds === 0}
      onExtend={onExtend}
      onSkip={onSkip}
      onDismiss={onDismiss}
    />
  );
}
