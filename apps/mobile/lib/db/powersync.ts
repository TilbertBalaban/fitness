import { PowerSyncDatabase } from '@powersync/react-native';
import { DrizzleAppSchema, wrapPowerSyncWithDrizzle } from '@powersync/drizzle-driver';
import type { UploadQueueStats } from '@powersync/common';
import { drizzleSchema } from './schema';

export const AppSchema = new DrizzleAppSchema(drizzleSchema);

let db: ReturnType<typeof wrapPowerSyncWithDrizzle> | null = null;
let powersync: PowerSyncDatabase | null = null;

// Local-only in this plan: never calls connect(), because pull needs a PowerSync Service that
// plan 02-08 stands up. Local writes and the crud queue work with no service at all.
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
