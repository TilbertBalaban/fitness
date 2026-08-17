import { eq } from 'drizzle-orm';
import { PowerSyncDatabase } from '@powersync/web';
import { DrizzleAppSchema, wrapPowerSyncWithDrizzle } from '@powersync/drizzle-driver';
import { drizzleSchema, loggedSet } from './schema';

export const TestAppSchema = new DrizzleAppSchema(drizzleSchema);

export type TestWriteDb = ReturnType<typeof wrapPowerSyncWithDrizzle>;

const WORKER_PATH = '/@powersync/worker.js';

// Metro inlines process.env.EXPO_PUBLIC_DURABILITY_HARNESS at build time; this direct comparison
// (not a runtime helper or config object) is what lets the minifier dead-code-eliminate the
// harness route's window-attach branch from a production export with the flag unset (T-02-30).
export const DURABILITY_HARNESS_ENABLED = process.env.EXPO_PUBLIC_DURABILITY_HARNESS === '1';

// The ternary, not a bare string literal, is load-bearing: an unconditional
// `export const DURABILITY_HARNESS_GLOBAL = '__fitnessDurability'` would survive in a production
// bundle regardless of the flag, because __durability.web.tsx imports this module unconditionally
// for its other (always-real) exports — the string constant itself is not behind any branch.
// Terser folds this literal-boolean ternary at build time, so the '__fitnessDurability' branch is
// eliminated from the compiled output whenever the flag is unset, exactly as the window-attach
// branch in __durability.web.tsx is.
export const DURABILITY_HARNESS_GLOBAL =
  process.env.EXPO_PUBLIC_DURABILITY_HARNESS === '1' ? '__fitnessDurability' : '';

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

export async function readLoggedSets(db: TestWriteDb, sessionExerciseId: string) {
  return db
    .select()
    .from(loggedSet)
    .where(eq(loggedSet.sessionExerciseId, sessionExerciseId))
    .orderBy(loggedSet.setIndex);
}

// wrapPowerSyncWithDrizzle's PowerSyncSQLiteDatabase keeps the raw AbstractPowerSyncDatabase as a
// private field (same constraint pending-write-count.ts already works around in production), so
// the crud-queue depth is read from this module's own rawDb rather than from the passed-in
// Drizzle wrapper.
export async function pendingCrudCount(): Promise<number> {
  if (!rawDb) {
    throw new Error('pendingCrudCount() called before openTestPowerSync()');
  }
  const stats = await rawDb.getUploadQueueStats();
  return stats.count;
}
