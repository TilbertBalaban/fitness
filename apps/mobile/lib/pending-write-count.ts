import { getUploadQueueStats } from './db/powersync';

// Reads PowerSync's own crud queue rather than maintaining a second counter beside it — a
// separate count could drift from the queue, and only in the direction that tells someone it's
// safe to sign out. Resolves to 0 rather than throwing so sign-out works on a launch where the
// local database was never opened.
export async function pendingWriteCount(): Promise<number> {
  try {
    const stats = await getUploadQueueStats();
    return stats.count;
  } catch {
    return 0;
  }
}
