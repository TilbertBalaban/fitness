import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { elapsedWorkoutSeconds, formatClock, remainingSeconds } from '@/lib/rest-timer';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

export interface RestTimerBarViewProps {
  colors: ThemeColors;
  paused: boolean;
  durationText: string;
  restText: string;
  // Whether a rest target is currently counting down — false both when no target is set at all
  // and once the countdown has reached zero, so the right column returns to its dormant tone
  // (05-UI-SPEC's Header Timer Bar) purely from the recomputed remaining seconds, with no
  // separate "has this expired yet" flag to keep in sync.
  restActive: boolean;
  onPressRest: () => void;
}

// Hook-free — direct-invocable by a test, matching CycleStripView/SetRowView. `colors` is accepted
// for parity with every other View in this component set even though this bar draws no icon;
// every numeral and label here is a plain NativeWind className, never a raw hex.
export function RestTimerBarView({ colors: _colors, paused, durationText, restText, restActive, onPressRest }: RestTimerBarViewProps) {
  return (
    <View className="flex-row items-center justify-between bg-secondary px-md py-sm">
      <View>
        <Text className="text-label font-normal text-foreground-muted">{paused ? 'Paused' : 'Workout'}</Text>
        <Text className={`text-display font-semibold ${paused ? 'text-foreground-muted' : 'text-foreground'}`}>
          {durationText}
        </Text>
      </View>

      <Pressable
        onPress={onPressRest}
        accessibilityRole="button"
        accessibilityLabel={restActive ? `Rest, ${restText} remaining` : 'Rest timer'}
        className="items-end justify-center"
        style={{ minHeight: 48, minWidth: 48 }}
      >
        <Text className="text-label font-normal text-foreground-muted">Rest</Text>
        <Text className={`text-display font-semibold ${restActive ? 'text-foreground' : 'text-foreground-muted'}`}>
          {restText}
        </Text>
      </Pressable>
    </View>
  );
}

export interface RestTimerBarProps {
  startedAtMs: number;
  accumulatedPausedSeconds: number;
  pausedAtMs: number | null;
  restTargetAtMs: number | null;
  onPressRest: () => void;
}

const TICK_MS = 1000;

// The one-second re-render tick lives here, in the stateful wrapper, and only here — it is a
// visual refresh, never the source of truth. Every value it displays is recomputed fresh from
// Date.now() against the stored timestamps on every tick, so a missed tick (background, throttle)
// never desyncs the number: the next tick (or the next mount) recomputes the correct value from
// scratch rather than resuming a count that drifted while it wasn't running (D-21).
export function RestTimerBar({ startedAtMs, accumulatedPausedSeconds, pausedAtMs, restTargetAtMs, onPressRest }: RestTimerBarProps) {
  const colors = useThemeColors();
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((value) => value + 1), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const now = Date.now();
  const durationSeconds = elapsedWorkoutSeconds({ startedAtMs, accumulatedPausedSeconds, pausedAtMs, nowMs: now });
  const restSeconds = remainingSeconds(restTargetAtMs, now);

  return (
    <RestTimerBarView
      colors={colors}
      paused={pausedAtMs !== null}
      durationText={formatClock(durationSeconds)}
      restText={formatClock(restSeconds)}
      restActive={restTargetAtMs !== null && restSeconds > 0}
      onPressRest={onPressRest}
    />
  );
}
