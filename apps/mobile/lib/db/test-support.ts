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
import type { EquipmentType } from '@fitness/api-contracts';
import { AppSchema } from './powersync.web';
import { createEquipmentProfile, ensureDefaultEquipmentProfile, type CreateEquipmentProfileInput } from './equipment-profiles';
import { generateClientId } from './id';
import { startWorkoutFromProgram, type StartWorkoutFromProgramSlot } from './log-set';
import {
  bodyMetric,
  drizzleSchema,
  equipmentProfile,
  exercise,
  exerciseMuscleMapping,
  loggedSet,
  personalRecord,
  progressPhoto,
  routine,
  routineCycle,
  routineDay,
  routineExercise,
  routineExerciseCycleTarget,
  seededExercise,
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
export async function seedProgrammedSession(db: TestWriteDb, userId?: string): Promise<SeededProgrammedSession> {
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

  const sessionId = await startWorkoutFromProgram({ routineDayId, cycleId: null, slots, userId }, db);

  return {
    sessionId,
    routineId,
    routineDayId,
    exercises: slots,
  };
}

// Same shape as seedProgrammedSession, plus two REAL catalog rows (seeded_exercise, localOnly —
// never a ps_crud entry) carrying a real equipment_required value each — 06-05's band gates on
// EquipmentType, so unlike seedProgrammedSession's deliberately-bare exercise ids (which every
// other e2e spec's "Unknown exercise" assertion depends on, and which this function must never
// touch), a plate-strip.spec.ts case needs a real, resolvable equipment type per exercise. A
// distinct exercise-id prefix ('ex-workout-harness-equip-') keeps this fixture's rows from ever
// colliding with seedProgrammedSession's own.
export async function seedProgrammedSessionWithEquipment(
  db: TestWriteDb,
  userId: string,
  equipmentTypes: [EquipmentType, EquipmentType],
): Promise<SeededProgrammedSession> {
  const routineId = generateClientId();
  const routineDayId = generateClientId();
  const routineExerciseIds = [generateClientId(), generateClientId()];
  const exerciseIds = ['ex-workout-harness-equip-1', 'ex-workout-harness-equip-2'];

  await db.insert(routine).values({
    id: routineId,
    userId: null,
    name: 'Harness Equipment Program',
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

  for (const [index, exerciseId] of exerciseIds.entries()) {
    await db.insert(seededExercise).values({
      id: exerciseId,
      name: `Harness ${equipmentTypes[index]} exercise`,
      aliases: null,
      movementPattern: null,
      equipmentRequired: equipmentTypes[index],
      loadType: 'external_weight',
      unilateral: false,
      instructionsText: null,
      cueText: null,
      imageUrls: null,
      bodyweightContributionPct: null,
      variationOfId: null,
      source: 'harness',
      archivedAt: null,
    });
  }

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

  const sessionId = await startWorkoutFromProgram({ routineDayId, cycleId: null, slots, userId }, db);

  return {
    sessionId,
    routineId,
    routineDayId,
    exercises: slots,
  };
}

export interface SeedEquipmentProfileResult {
  profileId: string;
}

// Delegates to the real ensureDefaultEquipmentProfile (D-19) — no seed shortcut. Called BEFORE
// seedProgrammedSession(db, userId) so the session picks up the already-active profile via that
// same function's idempotent lookup, exactly as a real "start workout after configuring a gym"
// flow does.
export async function seedEquipmentProfile(db: TestWriteDb, userId: string): Promise<SeedEquipmentProfileResult> {
  const profileId = await ensureDefaultEquipmentProfile(userId, db);
  return { profileId };
}

// Delegates to the real createEquipmentProfile (equipment-profiles.ts) — no seed shortcut, no
// second construction of the equipment_profile row shape. Used by plate-strip.spec.ts's
// not-loadable/zero-plate/dumbbell cases, which each need a deliberately shaped inventory the D-19
// commercial-gym default does not produce.
export async function seedGymProfile(db: TestWriteDb, input: CreateEquipmentProfileInput): Promise<SeedEquipmentProfileResult> {
  const profileId = await createEquipmentProfile(input, db);
  return { profileId };
}

// Raw read of the equipment_profile row's own columns, by id — used by e2e specs that need to
// prove a write landed without depending on loadEquipmentProfile's own JSON-parsing correctness.
export async function readEquipmentProfileRaw(id: string): Promise<Record<string, unknown> | null> {
  if (!rawDb) {
    throw new Error('readEquipmentProfileRaw() called before openTestPowerSync()');
  }
  const rows = await rawDb.getAll<Record<string, unknown>>('SELECT * FROM equipment_profile WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export interface SeededProgrammedSessionWithCycle extends SeededProgrammedSession {
  cycleId: string;
  cycleTargetId: string;
}

// The override value routineExerciseIds[0]'s routine_exercise_cycle_target row carries for
// targetSets — deliberately distinct from SEEDED_TARGETS[0].targetSets (3), so a spec reading
// target_sets back can tell at a glance which row it came from (05-12, D-15's write-back proof).
const CYCLE_TARGET_SETS_OVERRIDE = 5;

// Same shape as seedProgrammedSession — one routine, one day, two routine_exercises, funnelled
// through the same startWorkoutFromProgram call — plus one routine_cycle row and one
// routine_exercise_cycle_target row overriding targetSets for the FIRST routine exercise only.
// The second routine exercise deliberately gets no override row, so a single seeded program
// exercises both branches of resolveWriteBackTarget/resolvePrescriptionForCycle (override ?? base).
// Exercise ids are distinct from seedProgrammedSession's own ('ex-workout-harness-cycle-*') purely
// so the two seed helpers' fixtures never look interchangeable in a future spec that seeds both in
// the same suite run.
export async function seedProgrammedSessionWithCycle(db: TestWriteDb): Promise<SeededProgrammedSessionWithCycle> {
  const routineId = generateClientId();
  const routineDayId = generateClientId();
  const cycleId = generateClientId();
  const cycleTargetId = generateClientId();
  const routineExerciseIds = [generateClientId(), generateClientId()];
  const exerciseIds = ['ex-workout-harness-cycle-1', 'ex-workout-harness-cycle-2'];

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

  await db.insert(routineCycle).values({
    id: cycleId,
    routineId,
    orderIndex: 1024,
    name: 'Cycle A',
    kind: 'training',
    durationDays: null,
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

  await db.insert(routineExerciseCycleTarget).values({
    id: cycleTargetId,
    routineExerciseId: routineExerciseIds[0],
    cycleId,
    targetSets: CYCLE_TARGET_SETS_OVERRIDE,
    targetRepMin: null,
    targetRepMax: null,
    targetRir: null,
    targetRestSeconds: null,
  });

  const slots: StartWorkoutFromProgramSlot[] = routineExerciseIds.map((routineExerciseId, index) => ({
    routineExerciseId,
    exerciseId: exerciseIds[index],
    orderIndex: (index + 1) * 1024,
  }));

  const sessionId = await startWorkoutFromProgram({ routineDayId, cycleId, slots }, db);

  return {
    sessionId,
    routineId,
    routineDayId,
    cycleId,
    cycleTargetId,
    exercises: slots,
  };
}

export interface SeedPriorHeaviestSetInput {
  exerciseId: string;
  weightKg: string;
  reps: number;
}

// Inserts a completed, PRIOR (already-finished, days-old) session with one working set for the
// given exercise — not through startWorkoutFromProgram/logSet (both assume a session still being
// built), but as a direct, minimal write of exactly the three rows loadPriorBestByExercise reads
// (personal-record.ts): a workout_session, one session_exercise, one logged_set. This is what lets
// e2e/workout-summary.spec.ts's PR badge assertion be a REAL PR (beats real prior history) rather
// than a vacuous "first-ever set is always a PR" case.
export async function seedPriorHeaviestSet(db: TestWriteDb, input: SeedPriorHeaviestSetInput): Promise<void> {
  const sessionId = generateClientId();
  const sessionExerciseId = generateClientId();
  const loggedSetId = generateClientId();
  const priorDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  await db.insert(workoutSession).values({
    id: sessionId,
    userId: null,
    routineDayId: null,
    equipmentProfileId: null,
    startedAt: priorDate,
    endedAt: priorDate,
    status: 'completed',
    deviceId: null,
    timezone: 'UTC',
    localDate: priorDate.slice(0, 10),
    notes: null,
    name: null,
    pausedAt: null,
    accumulatedPausedSeconds: 0,
    restTargetAt: null,
    serverSeq: null,
  });

  await db.insert(sessionExercise).values({
    id: sessionExerciseId,
    sessionId,
    exerciseId: input.exerciseId,
    orderIndex: 0,
    supersetGroupId: null,
    routineExerciseId: null,
    targetSets: null,
    targetRepMin: null,
    targetRepMax: null,
    targetRir: null,
    targetRestSeconds: null,
    notes: null,
    removedAt: null,
  });

  await db.insert(loggedSet).values({
    id: loggedSetId,
    sessionExerciseId,
    setIndex: 1,
    setType: 'normal',
    weightKg: input.weightKg,
    reps: input.reps,
    rir: null,
    side: null,
    completed: true,
    parentSetId: null,
    restTakenSeconds: null,
    loggedAt: priorDate,
    notes: null,
  });
}

const WORKER_PATH = '/@powersync/worker.js';

// Metro inlines process.env.EXPO_PUBLIC_DURABILITY_HARNESS at build time; this direct comparison
// (not a runtime helper or config object) is what lets the minifier dead-code-eliminate the
// harness route's window-attach branch from a production export with the flag unset (T-02-30).
export const DURABILITY_HARNESS_ENABLED = process.env.EXPO_PUBLIC_DURABILITY_HARNESS === '1';

// Re-exported from a dependency-free leaf module: e2e spec files need only this string constant
// and import it under Playwright's Node process, which has no platform-extension resolution and
// would otherwise be dragged through this file's own '@powersync/react-native'-importing chain.
// See durability-harness-key.ts for the full rationale.
export { DURABILITY_HARNESS_GLOBAL } from './durability-harness-key';

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
    'SELECT id, name, started_at, paused_at, accumulated_paused_seconds, status, timezone, local_date, notes, equipment_profile_id, unavailable_equipment FROM workout_session WHERE id = ?',
    [sessionId],
  );
  return rows[0] ?? null;
}

// 05-09's deleteSession e2e case (e2e/history.spec.ts): reads session_exercise rows raw, by
// session id, so the assertion proves the row itself is gone rather than trusting a batched
// read-path helper (which would filter removed_at and silently pass on an orphaned row too).
export async function readSessionExercisesRaw(sessionId: string): Promise<Record<string, unknown>[]> {
  if (!rawDb) {
    throw new Error('readSessionExercisesRaw() called before openTestPowerSync()');
  }
  return rawDb.getAll<Record<string, unknown>>('SELECT * FROM session_exercise WHERE session_id = ?', [sessionId]);
}

// 05-12's D-15 write-back proof (e2e/target-write-back.spec.ts): reads the base routine_exercise
// row's own columns raw, by id, so the spec can prove that row was left untouched (the override
// branch) or moved (the base branch) independent of any typed drizzle read path.
export async function readRoutineExerciseRaw(routineExerciseId: string): Promise<Record<string, unknown> | null> {
  if (!rawDb) {
    throw new Error('readRoutineExerciseRaw() called before openTestPowerSync()');
  }
  const rows = await rawDb.getAll<Record<string, unknown>>('SELECT * FROM routine_exercise WHERE id = ?', [
    routineExerciseId,
  ]);
  return rows[0] ?? null;
}

// Reads a single routine_exercise_cycle_target row by its own surrogate id — used when the spec
// already knows the override row's id (seedProgrammedSessionWithCycle returns it for the first
// routine exercise's seeded override).
export async function readCycleTargetRaw(cycleTargetId: string): Promise<Record<string, unknown> | null> {
  if (!rawDb) {
    throw new Error('readCycleTargetRaw() called before openTestPowerSync()');
  }
  const rows = await rawDb.getAll<Record<string, unknown>>(
    'SELECT * FROM routine_exercise_cycle_target WHERE id = ?',
    [cycleTargetId],
  );
  return rows[0] ?? null;
}

// Reads every routine_exercise_cycle_target row for a given routine exercise, by its natural key
// rather than a surrogate id — what the spec's "no override row exists" case needs to prove a
// write-back never inserted one for the second routine exercise, which has no cycleTargetId to
// look up by id in the first place.
export async function readRoutineExerciseCycleTargetsRaw(routineExerciseId: string): Promise<Record<string, unknown>[]> {
  if (!rawDb) {
    throw new Error('readRoutineExerciseCycleTargetsRaw() called before openTestPowerSync()');
  }
  return rawDb.getAll<Record<string, unknown>>(
    'SELECT * FROM routine_exercise_cycle_target WHERE routine_exercise_id = ?',
    [routineExerciseId],
  );
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

export interface SeedSwapCandidateInput {
  targetExerciseId: string;
  candidateId: string;
  candidateName: string;
  candidateEquipmentType: EquipmentType;
}

// 06-06's equipment-availability e2e case: a real seeded_exercise candidate plus a shared-muscle-
// group mapping against the target exercise, so scoreAlternatives (smart-swap.ts) has a genuine
// muscle-overlap signal to clear SWAP_SCORE_THRESHOLD on — no other e2e fixture in this file seeds
// exercise_muscle_mapping rows, and neither seedProgrammedSession nor
// seedProgrammedSessionWithEquipment's own bare/equipment-typed exercises carry one. The
// muscleGroupId is synthetic (never inserted into muscle_group itself) — nothing scoreAlternatives
// reads compares it against that table, only against the matching id on the other mapping row.
export async function seedSwapCandidate(db: TestWriteDb, input: SeedSwapCandidateInput): Promise<void> {
  const muscleGroupId = 'harness-swap-muscle';

  await db.insert(seededExercise).values({
    id: input.candidateId,
    name: input.candidateName,
    aliases: null,
    movementPattern: null,
    equipmentRequired: input.candidateEquipmentType,
    loadType: 'external_weight',
    unilateral: false,
    instructionsText: null,
    cueText: null,
    imageUrls: null,
    bodyweightContributionPct: null,
    variationOfId: null,
    source: 'harness',
    archivedAt: null,
  });

  await db.insert(exerciseMuscleMapping).values([
    {
      id: `${input.targetExerciseId}:${muscleGroupId}`,
      exerciseId: input.targetExerciseId,
      muscleGroupId,
      role: 'primary',
      weightFactor: '1',
    },
    {
      id: `${input.candidateId}:${muscleGroupId}`,
      exerciseId: input.candidateId,
      muscleGroupId,
      role: 'primary',
      weightFactor: '1',
    },
  ]);
}
