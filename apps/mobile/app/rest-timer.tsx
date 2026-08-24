import { eq } from 'drizzle-orm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { RestTimerFullScreen } from '@/components/RestTimerFullScreen';
import { getPowerSync } from '@/lib/db/powersync';
import { workoutSession } from '@/lib/db/schema';
import { cancelRestAlert, scheduleRestAlert } from '@/lib/rest-alert';
import { REST_EXTEND_SECONDS } from '@/lib/rest-timer';

// Opened by tapping the header bar's rest column (RestTimerBar). Not a bottom sheet — the whole
// screen, per 05-UI-SPEC's Rest Timer Full-Screen. sessionId and the target arrive as route
// params rather than a fresh DB read, so the first frame renders the timer's true value with no
// loading state (R6) — the caller (workout.tsx) already holds this exact state in memory.
export default function RestTimerScreen() {
  const router = useRouter();
  const { sessionId, restTargetAtMs: initialRestTargetAtMs } = useLocalSearchParams<{
    sessionId: string;
    restTargetAtMs?: string;
  }>();
  const [restTargetAtMs, setRestTargetAtMs] = useState<number | null>(
    initialRestTargetAtMs ? Number(initialRestTargetAtMs) : null,
  );

  // D-27: both extend and skip operate on the stored target timestamp, the same one RestTimerBar
  // and the workout screen's own completion handler read — so both survive backgrounding
  // identically to the original schedule.
  async function handleExtend() {
    if (!sessionId) return;
    const nextTargetMs = (restTargetAtMs ?? Date.now()) + REST_EXTEND_SECONDS * 1000;
    const db = getPowerSync();
    await db
      .update(workoutSession)
      .set({ restTargetAt: new Date(nextTargetMs).toISOString() })
      .where(eq(workoutSession.id, sessionId));
    await scheduleRestAlert(nextTargetMs);
    setRestTargetAtMs(nextTargetMs);
  }

  async function handleSkip() {
    if (!sessionId) return;
    const db = getPowerSync();
    await db.update(workoutSession).set({ restTargetAt: null }).where(eq(workoutSession.id, sessionId));
    await cancelRestAlert();
    setRestTargetAtMs(null);
  }

  function handleDismiss() {
    router.back();
  }

  return (
    <RestTimerFullScreen
      restTargetAtMs={restTargetAtMs}
      onExtend={() => void handleExtend()}
      onSkip={() => void handleSkip()}
      onDismiss={handleDismiss}
    />
  );
}
