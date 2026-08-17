import { PowerSyncDatabase } from '@powersync/react-native';
import { DrizzleAppSchema, wrapPowerSyncWithDrizzle } from '@powersync/drizzle-driver';
import { drizzleSchema } from './schema';

export const AppSchema = new DrizzleAppSchema(drizzleSchema);

let db: ReturnType<typeof wrapPowerSyncWithDrizzle> | null = null;

// Local-only in this plan: never calls connect(), because pull needs a PowerSync Service that
// plan 02-08 stands up. Local writes and the crud queue work with no service at all.
export function getPowerSync() {
  if (!db) {
    const powersync = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: 'fitness.db' },
    });
    db = wrapPowerSyncWithDrizzle(powersync, { schema: drizzleSchema });
  }
  return db;
}
