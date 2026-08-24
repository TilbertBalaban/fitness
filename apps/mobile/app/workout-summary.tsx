import { eq } from 'drizzle-orm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import type { WeightUnit } from '@fitness/api-contracts';
import { WorkoutSummary } from '@/components/WorkoutSummary';
import { authClient } from '@/lib/auth-client';
import { detectPrsForSession } from '@/lib/db/personal-record';
import { getPowerSync } from '@/lib/db/powersync';
import { userPreference } from '@/lib/db/schema';
import { loadSessionSummary, type SessionSummary } from '@/lib/db/summary-query';
import { SessionModeProvider } from '@/lib/session/session-mode';

const DEFAULT_WEIGHT_UNIT: WeightUnit = 'kg';

async function loadWeightUnit(userId: string | null): Promise<WeightUnit> {
  if (!userId) return DEFAULT_WEIGHT_UNIT;
  const db = getPowerSync();
  const [row] = await db.select({ weightUnit: userPreference.weightUnit }).from(userPreference).where(eq(userPreference.id, userId));
  return (row?.weightUnit as WeightUnit | undefined) ?? DEFAULT_WEIGHT_UNIT;
}

// Not a modal over the workout screen — a full-screen route mounting `summary-correction`, never
// `live` (D-32): the live session's timer/auto-advance call sites are structurally unreachable
// from this tree rather than merely inactive. detectPrsForSession runs once before the first
// summary read, so the badges reflect rows that already exist rather than an in-memory guess
// (D-30). WorkoutSummary itself owns re-running both after a correction (LOG-19) — this route
// only loads once, on mount.
export default function WorkoutSummaryScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(DEFAULT_WEIGHT_UNIT);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    void (async () => {
      const db = getPowerSync();
      await detectPrsForSession(sessionId, userId, db);
      const [loadedSummary, unit] = await Promise.all([loadSessionSummary(sessionId, userId, db), loadWeightUnit(userId)]);
      if (cancelled) return;
      if (loadedSummary) setSummary(loadedSummary);
      setWeightUnit(unit);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userId]);

  function handleDone() {
    router.push('/(tabs)');
  }

  return (
    <SessionModeProvider mode="summary-correction">
      {summary ? <WorkoutSummary summary={summary} weightUnit={weightUnit} onDone={handleDone} /> : null}
    </SessionModeProvider>
  );
}
