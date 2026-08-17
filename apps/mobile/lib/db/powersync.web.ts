import { PowerSyncDatabase } from '@powersync/web';
import { DrizzleAppSchema, wrapPowerSyncWithDrizzle } from '@powersync/drizzle-driver';
import type { UploadQueueStats } from '@powersync/common';
import { drizzleSchema } from './schema';

export const AppSchema = new DrizzleAppSchema(drizzleSchema);

let db: ReturnType<typeof wrapPowerSyncWithDrizzle> | null = null;
let powersync: PowerSyncDatabase | null = null;

// The React Native Web SDK needs its worker path since there is no bundler-native worker
// import on this target (beta support — docs.powersync.com, React Native Web Support). The
// worker file is copied to public/@powersync/worker.js by the postinstall script in
// package.json; served from the static web root at the same path.
const WORKER_PATH = '/@powersync/worker.js';

// Local-only in this plan, same as the native sibling — never calls connect().
export function getPowerSync() {
  if (!db) {
    powersync = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: 'fitness.db', worker: WORKER_PATH },
      sync: { worker: WORKER_PATH },
    });
    db = wrapPowerSyncWithDrizzle(powersync, { schema: drizzleSchema });
  }
  return db;
}

// wrapPowerSyncWithDrizzle's PowerSyncSQLiteDatabase keeps the raw AbstractPowerSyncDatabase as
// a private field, so pending-write-count.ts reads the crud queue through this rather than the
// Drizzle wrapper getPowerSync() returns.
export function getUploadQueueStats(): Promise<UploadQueueStats> {
  getPowerSync();
  return powersync!.getUploadQueueStats();
}
