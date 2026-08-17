import { PowerSyncDatabase } from '@powersync/web';
import { DrizzleAppSchema, wrapPowerSyncWithDrizzle } from '@powersync/drizzle-driver';
import { drizzleSchema } from './schema';

export const TestAppSchema = new DrizzleAppSchema(drizzleSchema);

const WORKER_PATH = '/@powersync/worker.js';

let rawDb: PowerSyncDatabase | null = null;
let dbFilename: string | null = null;

export interface OpenTestPowerSyncOptions {
  dbFilename?: string;
}

// The same real @powersync/web configuration apps/mobile/lib/db/powersync.web.ts uses in
// production — no mock, no stand-in. openTestPowerSync/closeTestPowerSync/reopenTestPowerSync
// share one module-level dbFilename so a reopen re-reads the same underlying store rather than
// starting a second, unrelated database.
export function openTestPowerSync(options: OpenTestPowerSyncOptions = {}) {
  dbFilename = options.dbFilename ?? `fitness-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  rawDb = new PowerSyncDatabase({
    schema: TestAppSchema,
    database: { dbFilename, worker: WORKER_PATH },
    sync: { worker: WORKER_PATH },
  });
  return wrapPowerSyncWithDrizzle(rawDb, { schema: drizzleSchema });
}

// Closes the way a process death would: no disconnect, no crud-queue drain, no flush step.
export async function closeTestPowerSync(): Promise<void> {
  if (!rawDb) return;
  const closing = rawDb;
  rawDb = null;
  await closing.close();
}

// Builds a fresh PowerSyncDatabase against the same dbFilename rather than returning a memoised
// instance — the trap this guards against is a "close/reopen" test that silently hands back the
// same JS object, which would make every durability assertion in this file's callers vacuous.
export function reopenTestPowerSync() {
  if (dbFilename === null) {
    throw new Error('reopenTestPowerSync() called before openTestPowerSync()');
  }
  return openTestPowerSync({ dbFilename });
}
