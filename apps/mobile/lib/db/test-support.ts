import { eq } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { PowerSyncBackendConnector } from '@powersync/common';
import { PowerSyncDatabase } from '@powersync/web';
import { DrizzleAppSchema, wrapPowerSyncWithDrizzle } from '@powersync/drizzle-driver';
// Explicit '.web' import, not a bare './powersync' — this test-support module is imported both
// by app/__durability.web.tsx (bundled for the web target by Metro, where platform-extension
// resolution would pick this file anyway) AND directly by e2e spec files, which run under
// Playwright's Node process. Node's ESM resolver has no platform-extension awareness and would
// instead resolve a bare './powersync' to the native powersync.ts, whose @powersync/react-native
// import chain fails there (its dist re-exports omit file extensions, invalid under strict Node
// ESM). powersync.web.ts's AppSchema is the exact object getPowerSync() uses on web — importing
// it explicitly is correct for this durability harness regardless of platform resolution.
import { AppSchema } from './powersync.web';
import { generateClientId } from './id';
import { startWorkoutFromProgram, type StartWorkoutFromProgramSlot } from './log-set';
import {
  bodyMetric,
  drizzleSchema,
  equipmentProfile,
  exercise,
  loggedSet,
  personalRecord,
  progressPhoto,
  routine,
  routineCycle,
  routineDay,
  routineExercise,
  routineExerciseCycleTarget,
  sessionExercise,
  userPreference,
  workoutSession,
} from './schema';

export const TestAppSchema = new DrizzleAppSchema(drizzleSchema);

export type TestWriteDb = ReturnType<typeof wrapPowerSyncWithDrizzle>;

// The alternate client schema plan 02-12 redefines against: adds a nullable `harness_probe`
// column and removes `side` from logged_set. `side` is chosen deliberately — it is already
// nullable on both the local and server schema, so removing it from the client view exercises
// PowerSync's view re-derivation without also being a data-model change that would need a server
// migration. `harness_probe` (not `notes`): plan 05-02 makes `logged_set.notes` a real column,
// which would silently turn this test's premise into a no-op — the synthetic added column must
// name something no real migration will ever add.
export const SCHEMA_VARIANT_DELTA = {
  table: 'logged_set',
  added: ['harness_probe'],
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
  harnessProbe: text('harness_probe'),
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
  routineCycle,
  routineExerciseCycleTarget,
  equipmentProfile,
  exercise,
  personalRecord,
  bodyMetric,
  progressPhoto,
  userPreference,
};

export const TestAppSchemaV2 = new DrizzleAppSchema(drizzleSchemaV2);

// The `?screen=` query value __durability.web.tsx branches on to mount the workout-screen harness
// route instead of the original durability-only harness.
export const WORKOUT_HARNESS_MODE = 'workout';

export interface SeededProgrammedExercise {
  exerciseId: string;
  routineExerciseId: string;
  orderIndex: number;
}

export interface SeededProgrammedSession {
  sessionId: string;
  routineId: string;
  routineDayId: string;
  exercises: SeededProgrammedExercise[];
}

const SEEDED_TARGETS = [
  { targetSets: 3, targetRepMin: 8, targetRepMax: 12, targetRir: 2, targetRestSeconds: 120 },
  { targetSets: 3, targetRepMin: 6, targetRepMax: 10, targetRir: 1, targetRestSeconds: 150 },
] as const;

// Inserts a minimal but real program (one routine, one day, two routine_exercises with real
// targets) and funnels through the shipped startWorkoutFromProgram — the same single write path a
// real "Start Workout" tap uses — so the seeded session is never a shortcut around the helper this
// e2e spec exists to prove. Exercise rows are referenced by id only (not seeded into
// exercise/seeded_exercise): the workout screen resolves an unrecognised id to "Unknown exercise"
// rather than throwing, matching durability.spec.ts's own precedent of bare exercise ids.
export async function seedProgrammedSession(db: TestWriteDb): Promise<SeededProgrammedSession> {
  const routineId = generateClientId();
  const routineDayId = generateClientId();
  const routineExerciseIds = [generateClientId(), generateClientId()];
  const exerciseIds = ['ex-workout-harness-1', 'ex-workout-harness-2'];

  await db.insert(routine).values({
    id: routineId,
    userId: null,
    name: 'Harness Program',
    goal: null,
    status: 'ready',
    progressionFrozen: false,
    source: 'user',
    createdFromTemplateId: null,
    archivedAt: null,
  });

  await db.insert(routineDay).values({
    id: routineDayId,
    routineId,
    orderIndex: 1024,
    name: 'Push',
    isRestDay: false,
  });

  for (const [index, routineExerciseId] of routineExerciseIds.entries()) {
    await db.insert(routineExercise).values({
      id: routineExerciseId,
      routineDayId,
      exerciseId: exerciseIds[index],
      orderIndex: (index + 1) * 1024,
      supersetGroupId: null,
      progressionSchemeId: null,
      notes: null,
      ...SEEDED_TARGETS[index],
    });
  }

  const slots: StartWorkoutFromProgramSlot[] = routineExerciseIds.map((routineExerciseId, index) => ({
    routineExerciseId,
    exerciseId: exerciseIds[index],
    orderIndex: (index + 1) * 1024,
  }));

  const sessionId = await startWorkoutFromProgram({ routineDayId, cycleId: null, slots }, db);

  return {
    sessionId,
    routineId,
    routineDayId,
    exercises: slots,
  };
}

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
  variant?: 'v1' | 'v2' | 'app';
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
  if (options.variant === 'app') {
    rawDb = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename, worker: WORKER_PATH },
      sync: { worker: WORKER_PATH },
    });
    return wrapPowerSyncWithDrizzle(rawDb, { schema: drizzleSchema });
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
export function reopenTestPowerSync(options: { variant?: 'v1' | 'v2' | 'app' } = {}): TestWriteDb {
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

export interface CatalogTableCounts {
  muscleGroup: number;
  seededExercise: number;
  exerciseMuscleMapping: number;
  catalogMeta: number;
}

// Raw SQL against the views (this file's established precedent for a read path that does not
// depend on a typed drizzle table object matching whichever schema variant is currently open) —
// used by the catalog-load e2e case to assert row counts against the real engine.
export async function readCatalogTableCounts(): Promise<CatalogTableCounts> {
  if (!rawDb) {
    throw new Error('readCatalogTableCounts() called before openTestPowerSync()');
  }
  const [muscleGroup, seededExercise, exerciseMuscleMapping, catalogMeta] = await Promise.all([
    rawDb.getAll<{ count: number }>('SELECT COUNT(*) as count FROM muscle_group'),
    rawDb.getAll<{ count: number }>('SELECT COUNT(*) as count FROM seeded_exercise'),
    rawDb.getAll<{ count: number }>('SELECT COUNT(*) as count FROM exercise_muscle_mapping'),
    rawDb.getAll<{ count: number }>('SELECT COUNT(*) as count FROM catalog_meta'),
  ]);
  return {
    muscleGroup: muscleGroup[0].count,
    seededExercise: seededExercise[0].count,
    exerciseMuscleMapping: exerciseMuscleMapping[0].count,
    catalogMeta: catalogMeta[0].count,
  };
}

export async function readCatalogVersionRaw(): Promise<string | null> {
  if (!rawDb) {
    throw new Error('readCatalogVersionRaw() called before openTestPowerSync()');
  }
  const rows = await rawDb.getAll<{ catalog_version: string }>(
    "SELECT catalog_version FROM catalog_meta WHERE id = 'singleton'",
  );
  return rows[0]?.catalog_version ?? null;
}

// Overwrites the stored catalog_version with a sentinel so loadCatalogSnapshot's version-equality
// short circuit can be defeated without deleting the row — driving this UPDATE through the view is
// itself part of what e2e/catalog-load.spec.ts's second phase proves.
export async function writeCatalogVersionSentinel(sentinel: string): Promise<void> {
  if (!rawDb) {
    throw new Error('writeCatalogVersionSentinel() called before openTestPowerSync()');
  }
  await rawDb.execute("UPDATE catalog_meta SET catalog_version = ? WHERE id = 'singleton'", [sentinel]);
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

// 05-07's close/reopen recovery case (e2e/durability.spec.ts): the five columns pause/resume
// accounting touches, read raw rather than through loadSessionTree so the assertion proves the row
// itself survived, independent of any batched read-path helper's own correctness.
export async function readWorkoutSessionRaw(sessionId: string): Promise<Record<string, unknown> | null> {
  if (!rawDb) {
    throw new Error('readWorkoutSessionRaw() called before openTestPowerSync()');
  }
  const rows = await rawDb.getAll<Record<string, unknown>>(
    'SELECT id, started_at, paused_at, accumulated_paused_seconds, status FROM workout_session WHERE id = ?',
    [sessionId],
  );
  return rows[0] ?? null;
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
