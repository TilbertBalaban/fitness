import { PowerSyncDatabase } from '@powersync/react-native';
import { DrizzleAppSchema, wrapPowerSyncWithDrizzle } from '@powersync/drizzle-driver';
import type { PowerSyncBackendConnector, UploadQueueStats } from '@powersync/common';
import { drizzleSchema } from './schema';

export const AppSchema = new DrizzleAppSchema(drizzleSchema);

export type WriteDb = ReturnType<typeof wrapPowerSyncWithDrizzle>;

let db: ReturnType<typeof wrapPowerSyncWithDrizzle> | null = null;
let powersync: PowerSyncDatabase | null = null;

export function getPowerSync() {
  if (!db) {
    powersync = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: 'fitness.db' },
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

// Pull failing (bad/unreachable service, expired token PowerSync itself will re-request through
// SyncConnector.fetchCredentials) never blocks a local write — connect() only starts the crud
// queue's own upload loop, which was already running before this call (T-02-29).
export function connectPowerSync(connector: PowerSyncBackendConnector): Promise<void> {
  getPowerSync();
  return powersync!.connect(connector);
}

export function disconnectPowerSync(): Promise<void> {
  return powersync ? powersync.disconnect() : Promise.resolve();
}
