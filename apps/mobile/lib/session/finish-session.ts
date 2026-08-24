import { cancelRestAlert } from '@/lib/rest-alert';
import { completeSession } from '@/lib/db/session-lifecycle';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';

export interface FinishSessionRouter {
  push: (href: string) => void;
}

// The single exit from the live screen (D-32): closes any open pause and stamps ended_at/completed
// through completeSession, cancels whatever rest alert may still be scheduled, then navigates. In
// this plan the destination is Home; 05-08 changes only the pushed path to the summary route, which
// is exactly why this is a named function rather than an inline handler in workout.tsx.
export async function finishSession(sessionId: string, router: FinishSessionRouter, db: WriteDb = getPowerSync()): Promise<void> {
  await completeSession(sessionId, new Date(), db);
  await cancelRestAlert();
  router.push('/(tabs)');
}
