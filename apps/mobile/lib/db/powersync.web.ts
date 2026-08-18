import { PowerSyncDatabase } from '@powersync/web';
import { DrizzleAppSchema, wrapPowerSyncWithDrizzle } from '@powersync/drizzle-driver';
import type { PowerSyncBackendConnector, UploadQueueStats } from '@powersync/common';
import { catalogMeta, drizzleSchema, exerciseMuscleMapping, muscleGroup } from './schema';

// Mirrors powersync.ts's localOnly wiring — Metro resolves this file, not powersync.ts, for the
// web target, so the RN-Web build must carry the identical override or the localOnly claim is
// unverified on the one platform `expo export --platform web` actually exercises.
export const localOnlyCatalogTables = {
  muscleGroup: { tableDefinition: muscleGroup, options: { localOnly: true } },
  exerciseMuscleMapping: { tableDefinition: exerciseMuscleMapping, options: { localOnly: true } },
  catalogMeta: { tableDefinition: catalogMeta, options: { localOnly: true } },
} as const;

export const AppSchema = new DrizzleAppSchema({
  ...drizzleSchema,
  ...localOnlyCatalogTables,
});

export type WriteDb = ReturnType<typeof wrapPowerSyncWithDrizzle>;

let db: ReturnType<typeof wrapPowerSyncWithDrizzle> | null = null;
let powersync: PowerSyncDatabase | null = null;

// The React Native Web SDK needs its worker path since there is no bundler-native worker
// import on this target (beta support — docs.powersync.com, React Native Web Support). The
// worker file is copied to public/@powersync/worker.js by the postinstall script in
// package.json; served from the static web root at the same path.
const WORKER_PATH = '/@powersync/worker.js';

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

export function connectPowerSync(connector: PowerSyncBackendConnector): Promise<void> {
  getPowerSync();
  return powersync!.connect(connector);
}

export function disconnectPowerSync(): Promise<void> {
  return powersync ? powersync.disconnect() : Promise.resolve();
}
