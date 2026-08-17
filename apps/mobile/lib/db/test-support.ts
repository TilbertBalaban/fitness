import { eq } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { PowerSyncBackendConnector } from '@powersync/common';
import { PowerSyncDatabase } from '@powersync/web';
import { DrizzleAppSchema, wrapPowerSyncWithDrizzle } from '@powersync/drizzle-driver';
import {
  bodyMetric,
  drizzleSchema,
  equipmentProfile,
  exercise,
  loggedSet,
  personalRecord,
  progressPhoto,
  routine,
  routineDay,
  routineExercise,
  sessionExercise,
  userPreference,
  workoutSession,
} from './schema';

export const TestAppSchema = new DrizzleAppSchema(drizzleSchema);

export type TestWriteDb = ReturnType<typeof wrapPowerSyncWithDrizzle>;

// The alternate client schema plan 02-12 redefines against: adds a nullable `notes` column and
// removes `side` from logged_set. `side` is chosen deliberately — it is already nullable on both
// the local and server schema, so removing it from the client view exercises PowerSync's view
// re-derivation without also being a data-model change that would need a server migration.
export const SCHEMA_VARIANT_DELTA = {
  table: 'logged_set',
  added: ['notes'],
  removed: ['side'],
} as const;

const loggedSetV2 = sqliteTable('logged_set', {
  id: text('id').primaryKey(),
  sessionExerciseId: text('session_exercise_id').notNull(),
  setIndex: integer('set_index').notNull(),
  setType: text('set_type').notNull(),
  weightKg: text('weight_kg'),
  reps: integer('reps').notNull(),
  rir: integer('rir'),
  notes: text('notes'),
  completed: integer('completed', { mode: 'boolean' }).notNull(),
  parentSetId: text('parent_set_id'),
  restTakenSeconds: integer('rest_taken_seconds'),
  loggedAt: text('logged_at').notNull(),
});

const drizzleSchemaV2 = {
  workoutSession,
  sessionExercise,
  loggedSet: loggedSetV2,
  routine,
  routineDay,
  routineExercise,
  equipmentProfile,
  exercise,
  personalRecord,
  bodyMetric,
  progressPhoto,
  userPreference,
};

export const TestAppSchemaV2 = new DrizzleAppSchema(drizzleSchemaV2);

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
  variant?: 'v1' | 'v2';
}

// The same real @powersync/web configuration apps/mobile/lib/db/powersync.web.ts uses in
// production — no mock, no stand-in. openTestPowerSync/closeTestPowerSync/reopenTestPowerSync
// share one module-level dbFilename so a reopen re-reads the same underlying store rather than
// starting a second, unrelated database.
//
// The v2 branch's wrapPowerSyncWithDrizzle call resolves to a structurally different generic
// instantiation than v1's (drizzleSchemaV2's logged_set has no `side`, has `notes`) — the cast to
// TestWriteDb is safe because no caller ever runs a v1-typed insert/select against a v2-opened
// database; every v2 read goes through the raw-SQL helpers below instead.
export function openTestPowerSync(options: OpenTestPowerSyncOptions = {}): TestWriteDb {
  dbFilename = options.dbFilename ?? `fitness-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  if (options.variant === 'v2') {
    rawDb = new PowerSyncDatabase({
      schema: TestAppSchemaV2,
      database: { dbFilename, worker: WORKER_PATH },
      sync: { worker: WORKER_PATH },
    });
    return wrapPowerSyncWithDrizzle(rawDb, { schema: drizzleSchemaV2 }) as unknown as TestWriteDb;
  }
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
// An omitted variant defaults to 'v1' (openTestPowerSync's own default), preserving 02-09's
// original zero-arg call signature exactly.
export function reopenTestPowerSync(options: { variant?: 'v1' | 'v2' } = {}): TestWriteDb {
  if (dbFilename === null) {
    throw new Error('reopenTestPowerSync() called before openTestPowerSync()');
  }
  return openTestPowerSync({ dbFilename, variant: options.variant });
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

// Structural proof that a schema redefinition actually changed the view PowerSync exposes,
// independent of any typed drizzle table object — PRAGMA table_info works against a SQLite view
// the same way it works against a table, so this reflects what the currently-open schema variant
// really derived, not what the caller assumes it derived.
export async function readRawColumns(table: string): Promise<string[]> {
  if (!rawDb) {
    throw new Error('readRawColumns() called before openTestPowerSync()');
  }
  const rows = await rawDb.getAll<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.map((row) => row.name);
}

// Deliberately bypasses the typed drizzle `loggedSet` object (fixed to v1's column set, `side`
// included) — a v2-opened database's view has no `side` column, so a typed select through
// readLoggedSets would fail with "no such column: side" the instant a redefinition test tries to
// read back through it. Raw SQL against the current view is the one read path that works
// correctly regardless of which schema variant is open, which is exactly what a redefinition test
// needs.
export async function readLoggedSetsRaw(sessionExerciseId: string): Promise<Record<string, unknown>[]> {
  if (!rawDb) {
    throw new Error('readLoggedSetsRaw() called before openTestPowerSync()');
  }
  return rawDb.getAll<Record<string, unknown>>(
    'SELECT * FROM logged_set WHERE session_exercise_id = ? ORDER BY set_index',
    [sessionExerciseId],
  );
}

export async function readAllLoggedSetsRaw(): Promise<Record<string, unknown>[]> {
  if (!rawDb) {
    throw new Error('readAllLoggedSetsRaw() called before openTestPowerSync()');
  }
  return rawDb.getAll<Record<string, unknown>>('SELECT * FROM logged_set');
}

// Connects the CURRENT isolated test-support.ts database directly — deliberately not routed
// through apps/mobile/lib/db/powersync.ts's connectPowerSync/disconnectPowerSync, which are
// hardwired to that module's own 'fitness.db' singleton. A schema-redefinition test needs to
// prove its own isolated (and possibly v2-redefined) database's crud queue actually drains, which
// only this instance's own real .connect()/.disconnect() can do.
export async function connectTestPowerSync(connector: PowerSyncBackendConnector): Promise<void> {
  if (!rawDb) {
    throw new Error('connectTestPowerSync() called before openTestPowerSync()');
  }
  await rawDb.connect(connector);
}

export async function disconnectTestPowerSync(): Promise<void> {
  if (!rawDb) return;
  await rawDb.disconnect();
}
