import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { elapsedWorkoutSeconds } from '@/lib/rest-timer';

export interface WorkoutInProgressBannerData {
  id: string;
  startedAtMs: number;
  accumulatedPausedSeconds: number;
  pausedAtMs: number | null;
}

// "47 min" — the banner's own inline duration format (05-UI-SPEC §Home In-Progress Banner),
// distinct from the header timer bar's H:MM:SS clock: minutes-only is legible at a glance on a
// screen the user is not staring at, and the banner never counts up live (recomputed on focus).
export function formatBannerDuration(totalSeconds: number): string {
  const minutes = Math.max(0, Math.floor(totalSeconds / 60));
  return `${minutes} min`;
}

export interface WorkoutInProgressBannerViewProps {
  session: WorkoutInProgressBannerData | null;
  nowMs?: number;
  onResume: () => void;
  onDiscard: () => void;
}

// Hook-free — direct-invocable by Jest, matching every other *View in this component set. Renders
// nothing for a null session (D-28: strictly zero-or-one, no empty-state variant). onDiscard here
// is a REQUEST to discard, never the write itself — the stateful wrapper below is what actually
// opens the confirmation and calls the caller's write-performing callback only after it resolves.
export function WorkoutInProgressBannerView({ session, nowMs = Date.now(), onResume, onDiscard }: WorkoutInProgressBannerViewProps) {
  if (!session) return null;

  const paused = session.pausedAtMs !== null;
  const elapsed = elapsedWorkoutSeconds({
    startedAtMs: session.startedAtMs,
    accumulatedPausedSeconds: session.accumulatedPausedSeconds,
    pausedAtMs: session.pausedAtMs,
    nowMs,
  });

  return (
    <View className="gap-md rounded-md border-l-4 border-accent bg-secondary p-md">
      <View className="flex-row flex-wrap items-baseline gap-sm">
        <Text className="text-heading font-semibold text-foreground">
          {paused ? 'Workout Paused' : 'Workout in Progress'}
        </Text>
        <Text className="text-label font-normal text-foreground-muted">{formatBannerDuration(elapsed)}</Text>
      </View>
      <View className="flex-row flex-wrap gap-sm">
        <Pressable
          onPress={onResume}
          accessibilityRole="button"
          accessibilityLabel="Resume Workout"
          className="flex-1 items-center justify-center rounded-md bg-accent px-md py-sm"
          style={{ minHeight: 48, minWidth: 48 }}
        >
          <Text className="text-body font-semibold text-white">Resume Workout</Text>
        </Pressable>
        <Pressable
          onPress={onDiscard}
          accessibilityRole="button"
          accessibilityLabel="Discard"
          className="items-center justify-center px-md py-sm"
          style={{ minHeight: 48, minWidth: 48 }}
        >
          <Text className="text-body font-semibold text-destructive">Discard</Text>
        </Pressable>
      </View>
    </View>
  );
}

export interface DiscardWorkoutDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

// Same overlay/two-button shape as ArchiveDialog (apps/mobile/components/ArchiveDialog.tsx), kept
// as its own component rather than extending ArchiveDialog's exercise/program subject union — a
// discarded workout is neither an exercise nor a program, and this wave's ArchiveDialog.tsx is
// explicitly out of this plan's file scope.
export function DiscardWorkoutDialog({ onConfirm, onCancel }: DiscardWorkoutDialogProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <View className="w-full max-w-[400px] rounded-md bg-surface p-lg">
        <Text className="text-heading font-semibold text-foreground">Discard Workout</Text>
        <Text className="mt-sm text-body font-normal text-foreground-muted">
          This workout and everything logged in it will be deleted. This can&apos;t be undone. Discard anyway?
        </Text>
        <View className="mt-lg flex-row justify-end gap-sm">
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={{ minWidth: 48, minHeight: 48 }}
            className="items-center justify-center rounded-md px-md py-sm"
          >
            <Text className="text-body font-normal text-foreground-muted">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            accessibilityRole="button"
            accessibilityLabel="Discard"
            style={{ minWidth: 48, minHeight: 48 }}
            className="items-center justify-center rounded-md bg-destructive px-md py-sm"
          >
            <Text className="text-body font-semibold text-background">Discard</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export interface WorkoutInProgressBannerProps {
  session: WorkoutInProgressBannerData | null;
  onResume: () => void;
  onDiscard: () => void | Promise<void>;
}

// Thin stateful wrapper: owns only the confirmation modal's open/closed state. The data itself
// (session, or null) and every write (resume navigation, the actual discardSession call) are the
// caller's responsibility — Home's own conditional query is what decides whether `session` is
// non-null at all (D-28's cost constraint), never a query issued from inside this component.
export function WorkoutInProgressBanner({ session, onResume, onDiscard }: WorkoutInProgressBannerProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <WorkoutInProgressBannerView session={session} onResume={onResume} onDiscard={() => setConfirming(true)} />
      {confirming ? (
        <Modal transparent animationType="fade" onRequestClose={() => setConfirming(false)}>
          <DiscardWorkoutDialog
            onConfirm={() => {
              setConfirming(false);
              void onDiscard();
            }}
            onCancel={() => setConfirming(false)}
          />
        </Modal>
      ) : null}
    </>
  );
}
