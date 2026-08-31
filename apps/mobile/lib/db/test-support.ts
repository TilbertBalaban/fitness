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
import type { EquipmentType, PrType, SetType } from '@fitness/api-contracts';
import { AppSchema } from './powersync.web';
import { logPersonalRecord } from './personal-record';
import {
  createEquipmentProfile,
  ensureDefaultEquipmentProfile,
  setActiveEquipmentProfile,
  type CreateEquipmentProfileInput,
} from './equipment-profiles';
import { generateClientId } from './id';
import { startWorkoutFromProgram, type StartWorkoutFromProgramSlot } from './log-set';
import { activateRoutine } from './programs/lifecycle';
import { createRoutine } from './programs/create-routine';
import { addCycle } from './programs/cycles';
import { addDay, addExercisesToDay } from './programs/days';
import {
  analyticsWatermark,
  bodyMetric,
  drizzleSchema,
  equipmentProfile,
  exercise,
  exerciseMuscleMapping,
  loggedSet,
  muscleGroup,
  muscleVolumeRollup,
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

export interface ProgressionHistoryPerformance {
  weightKg: string | null;
  reps: number;
  rir: number | null;
}

export interface SeedProgressionHistoryInput {
  exerciseId: string;
  prescription: { targetRepMin: number; targetRepMax: number; targetRir: number };
  // Most-recent-first, matching recommendationHistoryForSession's own most-recent-session-first
  // ordering (index 0 becomes recommend.ts's topSet) — each entry gets its own prior, completed
  // session, one session further back in time than the one before it.
  performances: ProgressionHistoryPerformance[];
}

// Generalises seedPriorHeaviestSet for @fitness/progression-engine's e2e proof: N prior, already-
// completed sessions for ONE exercise, each carrying a real session_exercise prescription snapshot
// (seedPriorHeaviestSet writes null targets, which is fine for a personal-record assertion but
// useless to an engine that reads the prescription) and one completed working set at the caller's
// weight/reps/rir. Same direct-minimal-write style as seedPriorHeaviestSet: three tables per
// session, no startSession/logSet round trip.
export async function seedProgressionHistory(db: TestWriteDb, input: SeedProgressionHistoryInput): Promise<void> {
  const now = Date.now();

  for (const [index, performance] of input.performances.entries()) {
    const sessionId = generateClientId();
    const sessionExerciseId = generateClientId();
    const loggedSetId = generateClientId();
    // index 0 (most recent) gets the largest startedAt; each subsequent entry is a further day
    // back — enough separation that recommendationHistoryForSession's startedAt-descending sort
    // can never tie.
    const priorDate = new Date(now - (index + 1) * 24 * 60 * 60 * 1000).toISOString();

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
      targetRepMin: input.prescription.targetRepMin,
      targetRepMax: input.prescription.targetRepMax,
      targetRir: input.prescription.targetRir,
      targetRestSeconds: null,
      notes: null,
      removedAt: null,
    });

    await db.insert(loggedSet).values({
      id: loggedSetId,
      sessionExerciseId,
      setIndex: 1,
      setType: 'normal',
      weightKg: performance.weightKg,
      reps: performance.reps,
      rir: performance.rir,
      side: null,
      completed: true,
      parentSetId: null,
      restTakenSeconds: null,
      loggedAt: priorDate,
      notes: null,
    });
  }
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

export interface SeededRoutineTree {
  routineId: string;
  dayIds: string[];
  exerciseSlotIds: string[];
  cycleId: string;
}

// Distinct from seedProgrammedSession's/seedProgrammedSessionWithEquipment's own exercise-id
// prefixes, and given real names (04-15's builder mounts a picker that names its rows, unlike the
// workout screen's tolerance for a bare, unresolvable id).
const SEEDED_ROUTINE_TREE_EXERCISE_IDS = ['ex-routine-tree-1', 'ex-routine-tree-2'];

// Seeds a real two-day program (Push, Pull), two exercises per day, one training cycle and an
// active-program pointer — entirely through the shipped createRoutine/addDay/addExercisesToDay/
// addCycle/activateRoutine, never a direct table insert for any of those five rows, so 04-16's
// builder spec drives the exact same write path a real author does. Deliberately no
// workout_session: this seed is for the builder, and starting a session would put history into
// resolveNextUp's rotation that no builder assertion here wants.
export async function seedRoutineTree(db: TestWriteDb, userId: string): Promise<SeededRoutineTree> {
  for (const [index, exerciseId] of SEEDED_ROUTINE_TREE_EXERCISE_IDS.entries()) {
    await db.insert(seededExercise).values({
      id: exerciseId,
      name: `Routine Tree Exercise ${index + 1}`,
      aliases: null,
      movementPattern: null,
      equipmentRequired: null,
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

  const routineId = await createRoutine({ name: 'Harness Routine Tree' }, db);

  const pushDayId = await addDay({ routineId, name: 'Push' }, db);
  const pullDayId = await addDay({ routineId, name: 'Pull' }, db);

  const pushExerciseIds = await addExercisesToDay(
    { routineDayId: pushDayId, exerciseIds: SEEDED_ROUTINE_TREE_EXERCISE_IDS },
    db,
  );
  const pullExerciseIds = await addExercisesToDay(
    { routineDayId: pullDayId, exerciseIds: SEEDED_ROUTINE_TREE_EXERCISE_IDS },
    db,
  );

  const cycleId = await addCycle({ routineId, name: 'Week 1', kind: 'training', durationDays: null }, db);

  await activateRoutine({ userId, routineId }, db);

  return {
    routineId,
    dayIds: [pushDayId, pullDayId],
    exerciseSlotIds: [...pushExerciseIds, ...pullExerciseIds],
    cycleId,
  };
}

// Raw read of the routine_day row's own columns, by id — including archived_at, the column that
// tells an archive apart from a delete, which the rendered deck alone cannot.
export async function readRoutineDayRaw(id: string): Promise<Record<string, unknown> | null> {
  if (!rawDb) {
    throw new Error('readRoutineDayRaw() called before openTestPowerSync()');
  }
  const rows = await rawDb.getAll<Record<string, unknown>>('SELECT * FROM routine_day WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function readRoutineDaysRaw(routineId: string): Promise<Record<string, unknown>[]> {
  if (!rawDb) {
    throw new Error('readRoutineDaysRaw() called before openTestPowerSync()');
  }
  return rawDb.getAll<Record<string, unknown>>('SELECT * FROM routine_day WHERE routine_id = ?', [routineId]);
}

export async function readRoutineCycleRaw(id: string): Promise<Record<string, unknown> | null> {
  if (!rawDb) {
    throw new Error('readRoutineCycleRaw() called before openTestPowerSync()');
  }
  const rows = await rawDb.getAll<Record<string, unknown>>('SELECT * FROM routine_cycle WHERE id = ?', [id]);
  return rows[0] ?? null;
}

// 07-09's grouped-set e2e cases: the same raw read readLoggedSetsRaw performs, narrowed to the
// columns a spec actually needs to assert stored parentage against — parent_set_id and side — so a
// drop-set/per-side/superset case can prove the real stored shape rather than only the rendered
// text SetRow produces.
export interface LoggedSetGroupingRow {
  id: string;
  set_index: number;
  set_type: string;
  parent_set_id: string | null;
  side: string | null;
}

export async function readLoggedSetsWithGrouping(sessionExerciseId: string): Promise<LoggedSetGroupingRow[]> {
  if (!rawDb) {
    throw new Error('readLoggedSetsWithGrouping() called before openTestPowerSync()');
  }
  return rawDb.getAll<LoggedSetGroupingRow>(
    'SELECT id, set_index, set_type, parent_set_id, side FROM logged_set WHERE session_exercise_id = ? ORDER BY set_index',
    [sessionExerciseId],
  );
}

export interface SeededSupersetPair {
  sessionId: string;
  sessionExerciseIds: [string, string];
}

// seedProgrammedSession's own return shape (SeededProgrammedExercise[]) carries routineExerciseId/
// exerciseId per slot, never the client-generated session_exercise id addSessionExercise assigns
// internally (startWorkoutFromProgram discards it) — so a superset spec needing a deterministic
// adjacent pair to hand formSuperset reads it back here, ordered by order_index, rather than
// depending on whatever seedProgrammedSession happens to produce. Delegates entirely to the real
// seedProgrammedSession and readSessionExercisesRaw above; no second seeding path.
export async function seedSupersetPair(db: TestWriteDb, userId?: string): Promise<SeededSupersetPair> {
  const { sessionId } = await seedProgrammedSession(db, userId);
  const rows = await readSessionExercisesRaw(sessionId);
  const ordered = rows.slice().sort((a, b) => (a.order_index as number) - (b.order_index as number));
  const [first, second] = ordered;
  if (!first || !second) {
    throw new Error(`seedSupersetPair: expected two session_exercise rows, got ${ordered.length}`);
  }
  return { sessionId, sessionExerciseIds: [first.id as string, second.id as string] };
}

export interface SeedExerciseHistorySet {
  weightKg: string | null;
  reps: number;
  // Deliberately part of the input surface rather than fixed to 'normal': the performance chart's
  // whole correctness claim is that `heaviest`/`e1rm` use countsTowardRecords while `volume` uses
  // countsTowardWorkingVolume, and a spec can only prove that split from the DOM if it can seed a
  // warm-up or a partial alongside a working set.
  setType: SetType;
  completed: boolean;
}

export interface SeedExerciseHistorySession {
  localDate: string;
  sets: SeedExerciseHistorySet[];
}

export interface SeedExerciseHistoryInput {
  exerciseId: string;
  sessions: SeedExerciseHistorySession[];
}

// N completed sessions for ONE exercise on caller-supplied local dates, each with caller-supplied
// sets. Same direct-minimal-write style as seedPriorHeaviestSet/seedProgressionHistory — three
// tables per session, no startSession/logSet round trip — because the performance chart reads
// finished history, never a session still being built.
export async function seedExerciseHistory(db: TestWriteDb, input: SeedExerciseHistoryInput): Promise<void> {
  for (const [sessionIndex, seededSession] of input.sessions.entries()) {
    const sessionId = generateClientId();
    const sessionExerciseId = generateClientId();
    // started_at only has to order the sessions consistently; local_date is what the chart reads.
    const startedAt = `${seededSession.localDate}T09:00:00.000Z`;

    await db.insert(workoutSession).values({
      id: sessionId,
      userId: null,
      routineDayId: null,
      equipmentProfileId: null,
      startedAt,
      endedAt: startedAt,
      status: 'completed',
      deviceId: null,
      timezone: 'UTC',
      localDate: seededSession.localDate,
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
      orderIndex: sessionIndex,
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

    for (const [setIndex, seededSet] of seededSession.sets.entries()) {
      await db.insert(loggedSet).values({
        id: generateClientId(),
        sessionExerciseId,
        setIndex: setIndex + 1,
        setType: seededSet.setType,
        weightKg: seededSet.weightKg,
        reps: seededSet.reps,
        rir: null,
        side: null,
        completed: seededSet.completed,
        parentSetId: null,
        restTakenSeconds: null,
        loggedAt: startedAt,
        notes: null,
      });
    }
  }
}

export interface SeedPersonalRecordInput {
  prType: PrType;
  // The stored value in that metric's OWN units — a weight for heaviest/e1rm/set-volume, a REP
  // COUNT for most-reps. Passed as a number and written through the real logPersonalRecord, so the
  // three-decimal string convention is applied by the shipped helper rather than re-implemented.
  value: number;
  achievedAt: string;
  // The originating set, seeded as a real logged_set row so a most-reps record has an actual weight
  // to resolve — personal_record carries no weight column of its own.
  set: { weightKg: string | null; reps: number };
}

export interface SeedPersonalRecordsInput {
  exerciseId: string;
  records: SeedPersonalRecordInput[];
}

// N personal_record rows for ONE exercise, each with its own originating completed set. Same
// direct-minimal-write style as seedExerciseHistory for the session/exercise/set rows, but the
// record itself goes through the real logPersonalRecord — the harness re-implements no insert and
// neither does this, so the three-decimal value convention cannot drift between seed and app.
export async function seedPersonalRecords(db: TestWriteDb, input: SeedPersonalRecordsInput): Promise<void> {
  const sessionId = generateClientId();
  const sessionExerciseId = generateClientId();
  const localDate = input.records[0]?.achievedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const startedAt = `${localDate}T09:00:00.000Z`;

  await db.insert(workoutSession).values({
    id: sessionId,
    userId: null,
    routineDayId: null,
    equipmentProfileId: null,
    startedAt,
    endedAt: startedAt,
    status: 'completed',
    deviceId: null,
    timezone: 'UTC',
    localDate,
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

  for (const [index, record] of input.records.entries()) {
    const loggedSetId = generateClientId();
    await db.insert(loggedSet).values({
      id: loggedSetId,
      sessionExerciseId,
      setIndex: index + 1,
      setType: 'normal',
      weightKg: record.set.weightKg,
      reps: record.set.reps,
      rir: null,
      side: null,
      completed: true,
      parentSetId: null,
      restTakenSeconds: null,
      loggedAt: record.achievedAt,
      notes: null,
    });

    await logPersonalRecord(
      {
        userId: null,
        exerciseId: input.exerciseId,
        prType: record.prType,
        value: record.value,
        loggedSetId,
        achievedAt: new Date(record.achievedAt),
      },
      db,
    );
  }
}

export interface SeedTrainedSet {
  // Deliberately part of the input surface rather than fixed to 'normal': the Last 7 Days card's
  // Sets figure must equal the exercise strip's, and a spec can only prove that from the DOM if it
  // can seed a warm-up alongside a working set.
  setType: SetType;
  completed: boolean;
  // Names the PARENT by its index within this exercise's own set list — a drop-set child cannot
  // name a row id that is generated in here and never handed back. A child is not a set on the
  // strip and must not be one on the card either.
  parentSetIndex?: number;
  weightKg: string | null;
  reps: number;
}

export interface SeedTrainedExercise {
  exerciseId: string;
  primaryMuscleGroupIds: string[];
  // Seeded as real mapping rows with role 'secondary'. The card counts primary muscle groups, so
  // anything named here is something a correct read must NOT count.
  secondaryMuscleGroupIds?: string[];
  sets: SeedTrainedSet[];
}

export interface SeedTrainedSession {
  localDate: string;
  exercises: SeedTrainedExercise[];
}

export interface SeedTrainedWeekProgramSlot {
  exerciseId: string;
  targetSets: number | null;
}

export interface SeedTrainedWeekProgramDay {
  slots: SeedTrainedWeekProgramSlot[];
}

export interface SeedTrainedWeekInput {
  userId: string;
  sessions: SeedTrainedSession[];
  // Absent means no active program at all, which is the card's no-denominator branch (D-08).
  program?: { days: SeedTrainedWeekProgramDay[] };
}

// muscle_group rows are inserted once per id across every call, so seeding a second time into the
// same open() database (the causal case drives exactly that) cannot collide on the primary key.
async function ensureMuscleGroups(db: TestWriteDb, ids: string[]): Promise<void> {
  const existing = new Set((await db.select({ id: muscleGroup.id }).from(muscleGroup)).map((row) => row.id));
  for (const id of ids) {
    if (existing.has(id)) continue;
    existing.add(id);
    await db.insert(muscleGroup).values({ id, name: id, bodyRegion: 'upper' });
  }
}

async function ensureMuscleMappings(db: TestWriteDb, exercises: SeedTrainedExercise[]): Promise<void> {
  const existing = new Set(
    (
      await db
        .select({
          exerciseId: exerciseMuscleMapping.exerciseId,
          muscleGroupId: exerciseMuscleMapping.muscleGroupId,
          role: exerciseMuscleMapping.role,
        })
        .from(exerciseMuscleMapping)
    ).map((row) => `${row.exerciseId}|${row.muscleGroupId}|${row.role}`),
  );

  for (const trained of exercises) {
    const byRole: [string, string[]][] = [
      ['primary', trained.primaryMuscleGroupIds],
      ['secondary', trained.secondaryMuscleGroupIds ?? []],
    ];
    for (const [role, muscleGroupIds] of byRole) {
      for (const muscleGroupId of muscleGroupIds) {
        const key = `${trained.exerciseId}|${muscleGroupId}|${role}`;
        if (existing.has(key)) continue;
        existing.add(key);
        await db.insert(exerciseMuscleMapping).values({
          id: generateClientId(),
          exerciseId: trained.exerciseId,
          muscleGroupId,
          role,
          weightFactor: '1.000',
        });
      }
    }
  }
}

async function seedActiveProgram(db: TestWriteDb, userId: string, days: SeedTrainedWeekProgramDay[]): Promise<void> {
  const routineId = generateClientId();

  await db.insert(routine).values({
    id: routineId,
    userId: null,
    name: 'Harness Weekly Program',
    goal: null,
    status: 'ready',
    progressionFrozen: false,
    source: 'user',
    createdFromTemplateId: null,
    archivedAt: null,
  });

  for (const [dayIndex, day] of days.entries()) {
    const routineDayId = generateClientId();
    await db.insert(routineDay).values({
      id: routineDayId,
      routineId,
      orderIndex: (dayIndex + 1) * 1024,
      name: `Day ${dayIndex + 1}`,
      isRestDay: day.slots.length === 0,
    });

    for (const [slotIndex, slot] of day.slots.entries()) {
      await db.insert(routineExercise).values({
        id: generateClientId(),
        routineDayId,
        exerciseId: slot.exerciseId,
        orderIndex: (slotIndex + 1) * 1024,
        supersetGroupId: null,
        progressionSchemeId: null,
        notes: null,
        targetSets: slot.targetSets,
        targetRepMin: null,
        targetRepMax: null,
        targetRir: null,
        targetRestSeconds: null,
      });
    }
  }

  await db.insert(routineCycle).values({
    id: generateClientId(),
    routineId,
    name: 'Week 1',
    kind: 'training',
    orderIndex: 1024,
    durationDays: null,
  });

  await activateRoutine({ userId, routineId }, db);
}

// Completed sessions on caller-supplied local dates, each with caller-supplied exercises and sets,
// PLUS the muscle_group rows and primary/secondary mappings those exercises need, so the card's
// third track has something real to count and something real to ignore. Optionally an active
// program too, since the card's denominators come from one and there is no second place to author
// them (D-08).
//
// routine_day_id stays null on every seeded session on purpose: these sessions are the window's
// work, not the program's rotation, and letting them count toward it would move which cycle
// resolveNextUp calls current and quietly change the target under the spec's feet.
//
// Same direct-minimal-write style as seedExerciseHistory — no startSession/logSet round trip —
// because the card reads finished history, never a session still being built.
export async function seedTrainedWeek(db: TestWriteDb, input: SeedTrainedWeekInput): Promise<void> {
  const allExercises = input.sessions.flatMap((session) => session.exercises);

  await ensureMuscleGroups(
    db,
    allExercises.flatMap((trained) => [...trained.primaryMuscleGroupIds, ...(trained.secondaryMuscleGroupIds ?? [])]),
  );
  await ensureMuscleMappings(db, allExercises);

  for (const [sessionIndex, seededSession] of input.sessions.entries()) {
    const sessionId = generateClientId();
    const startedAt = `${seededSession.localDate}T09:00:00.000Z`;

    await db.insert(workoutSession).values({
      id: sessionId,
      userId: null,
      routineDayId: null,
      equipmentProfileId: null,
      startedAt,
      endedAt: startedAt,
      status: 'completed',
      deviceId: null,
      timezone: 'UTC',
      localDate: seededSession.localDate,
      notes: null,
      name: null,
      pausedAt: null,
      accumulatedPausedSeconds: 0,
      restTargetAt: null,
      serverSeq: null,
    });

    for (const [exerciseIndex, trained] of seededSession.exercises.entries()) {
      const sessionExerciseId = generateClientId();

      await db.insert(sessionExercise).values({
        id: sessionExerciseId,
        sessionId,
        exerciseId: trained.exerciseId,
        orderIndex: (sessionIndex + 1) * 100 + exerciseIndex,
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

      const setIds = trained.sets.map(() => generateClientId());
      for (const [setIndex, seededSet] of trained.sets.entries()) {
        await db.insert(loggedSet).values({
          id: setIds[setIndex],
          sessionExerciseId,
          setIndex: setIndex + 1,
          setType: seededSet.setType,
          weightKg: seededSet.weightKg,
          reps: seededSet.reps,
          rir: null,
          side: null,
          completed: seededSet.completed,
          parentSetId: seededSet.parentSetIndex === undefined ? null : setIds[seededSet.parentSetIndex],
          restTakenSeconds: null,
          loggedAt: startedAt,
          notes: null,
        });
      }
    }
  }

  if (input.program) await seedActiveProgram(db, input.userId, input.program.days);
}

export interface SeedTrendHistorySet {
  weightKg: string | null;
  reps: number;
  // In the input surface for the same reason SeedExerciseHistorySet's is: the trend's volume metric
  // counts drop-set children while its set count does not, and a warm-up counts toward neither, so
  // a spec can only prove the split from the DOM if it can seed a warm-up-only session.
  setType: SetType;
  completed: boolean;
}

export interface SeedTrendHistorySession {
  localDate: string;
  exerciseId: string;
  sets: SeedTrendHistorySet[];
}

// A caller-supplied list of dates rather than a count and a stride: expressing a DELIBERATELY
// SKIPPED bucket is the whole point — a week the caller simply omits must be absent from the line
// rather than drawn at zero, and only the caller knows which week that is.
export interface SeedTrendHistoryInput {
  sessions: SeedTrendHistorySession[];
}

// Completed sessions across several weekly buckets, each on its own date and against its own
// exercise. Same direct-minimal-write style as seedExerciseHistory — three tables per session, no
// startSession/logSet round trip — because the trend card reads finished history only.
export async function seedTrendHistory(db: TestWriteDb, input: SeedTrendHistoryInput): Promise<void> {
  for (const [sessionIndex, seededSession] of input.sessions.entries()) {
    const sessionId = generateClientId();
    const sessionExerciseId = generateClientId();
    const startedAt = `${seededSession.localDate}T09:00:00.000Z`;

    await db.insert(workoutSession).values({
      id: sessionId,
      userId: null,
      routineDayId: null,
      equipmentProfileId: null,
      startedAt,
      endedAt: startedAt,
      status: 'completed',
      deviceId: null,
      timezone: 'UTC',
      localDate: seededSession.localDate,
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
      exerciseId: seededSession.exerciseId,
      orderIndex: sessionIndex,
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

    for (const [setIndex, seededSet] of seededSession.sets.entries()) {
      await db.insert(loggedSet).values({
        id: generateClientId(),
        sessionExerciseId,
        setIndex: setIndex + 1,
        setType: seededSet.setType,
        weightKg: seededSet.weightKg,
        reps: seededSet.reps,
        rir: null,
        side: null,
        completed: seededSet.completed,
        parentSetId: null,
        restTakenSeconds: null,
        loggedAt: startedAt,
        notes: null,
      });
    }
  }
}

export interface SeedMuscleMapSet {
  weightKg: string | null;
  reps: number;
  setType: SetType;
  completed: boolean;
}

export interface SeedMuscleMapMapping {
  muscleGroupId: string;
  weightFactor: number;
}

export interface SeedMuscleMapExercise {
  exerciseId: string;
  mappings: SeedMuscleMapMapping[];
  sets: SeedMuscleMapSet[];
}

export interface SeedMuscleMapSession {
  localDate: string;
  // Stamps workout_session.user_id when true — this is the D-01 overlay predicate's own signal.
  // Left null when false, matching every other seeder in this file's null-by-default convention.
  syncedToServer: boolean;
  exercises: SeedMuscleMapExercise[];
}

export interface SeedMuscleMapRollupRow {
  muscleGroupId: string;
  localDate: string;
  weightedVolumeKg: number;
  weightedSets: number;
  setCount: number;
}

export interface SeedMuscleMapWatermark {
  computedThroughDate: string;
}

export interface SeedMuscleMapHistoryInput {
  userId: string;
  sessions: SeedMuscleMapSession[];
  // The client never writes either of these two tables in production (10-01, D-09) — present here
  // only to stand in for what a live PowerSync pull would already have delivered by the time the
  // screen reads it, which is the only way to prove the rollup-plus-overlay path in a browser
  // without a live sync service.
  rollup?: SeedMuscleMapRollupRow[];
  watermark?: SeedMuscleMapWatermark;
}

// A dedicated mapping writer, not a reuse of ensureMuscleMappings above: that helper hardcodes
// weightFactor at '1.000' for every row, and D-04's weighted-secondary-mapping claim cannot be
// exercised without a real fractional factor. role is always 'primary' here because neither
// loadLocalMuscleVolumeCells nor loadMuscleDrilldown filter or branch on role at all (D-04 counts
// secondary muscles at their own mapping weight, never at a role-based discount) — this seeder's
// weightFactor input is what carries the fractional-contribution case, not the role column.
async function ensureMuscleMapMappings(db: TestWriteDb, exercises: SeedMuscleMapExercise[]): Promise<void> {
  const existing = new Set(
    (
      await db
        .select({
          exerciseId: exerciseMuscleMapping.exerciseId,
          muscleGroupId: exerciseMuscleMapping.muscleGroupId,
          role: exerciseMuscleMapping.role,
        })
        .from(exerciseMuscleMapping)
    ).map((row) => `${row.exerciseId}|${row.muscleGroupId}|${row.role}`),
  );

  for (const trained of exercises) {
    for (const mapping of trained.mappings) {
      const key = `${trained.exerciseId}|${mapping.muscleGroupId}|primary`;
      if (existing.has(key)) continue;
      existing.add(key);
      await db.insert(exerciseMuscleMapping).values({
        id: generateClientId(),
        exerciseId: trained.exerciseId,
        muscleGroupId: mapping.muscleGroupId,
        role: 'primary',
        weightFactor: mapping.weightFactor.toFixed(3),
      });
    }
  }
}

// The durability seeder behind 10-07's evidence: completed sessions (each independently markable
// as already-synced-to-server or still local-only via syncedToServer), real fractional weight
// factors (D-04), and optional pre-synced muscle_volume_rollup/analytics_watermark rows standing
// in for what a live PowerSync pull would have delivered (10-01, D-09 — the client never writes
// either table itself). Same direct-minimal-write style as seedTrainedWeek: three tables per
// session, no startSession/logSet round trip, because the muscle map reads finished history only.
export async function seedMuscleMapHistory(db: TestWriteDb, input: SeedMuscleMapHistoryInput): Promise<void> {
  const allExercises = input.sessions.flatMap((session) => session.exercises);

  await ensureMuscleGroups(
    db,
    allExercises.flatMap((trained) => trained.mappings.map((mapping) => mapping.muscleGroupId)),
  );
  await ensureMuscleMapMappings(db, allExercises);

  for (const seededSession of input.sessions) {
    const sessionId = generateClientId();
    const startedAt = `${seededSession.localDate}T09:00:00.000Z`;

    await db.insert(workoutSession).values({
      id: sessionId,
      // workout_session.user_id is stamped server-side on push only (see loadLiveSession's own
      // comment) — a real userId here is what a lifter's already-synced session looks like, and
      // null is what a still-local one looks like, matching this file's other seeders' convention.
      userId: seededSession.syncedToServer ? input.userId : null,
      routineDayId: null,
      equipmentProfileId: null,
      startedAt,
      endedAt: startedAt,
      status: 'completed',
      deviceId: null,
      timezone: 'UTC',
      localDate: seededSession.localDate,
      notes: null,
      name: null,
      pausedAt: null,
      accumulatedPausedSeconds: 0,
      restTargetAt: null,
      serverSeq: seededSession.syncedToServer ? 1 : null,
    });

    for (const [exerciseIndex, trained] of seededSession.exercises.entries()) {
      const sessionExerciseId = generateClientId();

      await db.insert(sessionExercise).values({
        id: sessionExerciseId,
        sessionId,
        exerciseId: trained.exerciseId,
        orderIndex: exerciseIndex,
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

      for (const [setIndex, seededSet] of trained.sets.entries()) {
        await db.insert(loggedSet).values({
          id: generateClientId(),
          sessionExerciseId,
          setIndex: setIndex + 1,
          setType: seededSet.setType,
          weightKg: seededSet.weightKg,
          reps: seededSet.reps,
          rir: null,
          side: null,
          completed: seededSet.completed,
          parentSetId: null,
          restTakenSeconds: null,
          loggedAt: startedAt,
          notes: null,
        });
      }
    }
  }

  // Written directly rather than through any client mutation path — production code never writes
  // either table (10-01); this stands in for what a live PowerSync pull would already have
  // delivered by the time the screen reads it.
  for (const row of input.rollup ?? []) {
    await db.insert(muscleVolumeRollup).values({
      id: generateClientId(),
      userId: input.userId,
      muscleGroupId: row.muscleGroupId,
      localDate: row.localDate,
      weightedVolumeKg: row.weightedVolumeKg.toFixed(3),
      weightedSets: row.weightedSets.toFixed(3),
      setCount: row.setCount,
      serverSeq: 1,
    });
  }

  if (input.watermark) {
    await db.insert(analyticsWatermark).values({
      id: generateClientId(),
      userId: input.userId,
      computedThroughDate: input.watermark.computedThroughDate,
      serverSeq: 1,
    });
  }
}

export interface SeededGenerationCatalog {
  exerciseIds: string[];
  profileId: string;
  muscleGroupIds: string[];
}

// One barbell exercise per muscle group the full-body three-day template names, so every slot in a
// generated week fills and the durability spec measures a complete program rather than a degraded
// one. Deliberately distinct exercise-id prefix from every other seed helper here, so a future
// spec seeding two of them cannot confuse their fixtures.
const SEEDED_GENERATION_MUSCLE_GROUPS = [
  'chest',
  'lats',
  'upper_back_traps',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
] as const;

// Idempotent: a spec that generates twice in one page seeds twice, and a second insert of the same
// primary key is a UNIQUE constraint failure, not a no-op.
export async function seedGenerationCatalog(db: TestWriteDb, userId: string): Promise<SeededGenerationCatalog> {
  const exerciseIds: string[] = [];

  for (const muscleGroupId of SEEDED_GENERATION_MUSCLE_GROUPS) {
    const exerciseId = `ex-generation-${muscleGroupId}`;
    exerciseIds.push(exerciseId);

    const existing = await db.select({ id: seededExercise.id }).from(seededExercise).where(eq(seededExercise.id, exerciseId));
    if (existing.length > 0) continue;

    await db.insert(seededExercise).values({
      id: exerciseId,
      name: `Generation ${muscleGroupId}`,
      aliases: null,
      movementPattern: null,
      equipmentRequired: 'barbell',
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

    await db.insert(exerciseMuscleMapping).values({
      id: generateClientId(),
      exerciseId,
      muscleGroupId,
      role: 'primary',
      weightFactor: '1.000',
    });
  }

  const existingProfiles = await db
    .select({ id: equipmentProfile.id })
    .from(equipmentProfile)
    .where(eq(equipmentProfile.name, 'Generation Harness Gym'));
  if (existingProfiles.length > 0) {
    return { exerciseIds, profileId: existingProfiles[0].id, muscleGroupIds: [...SEEDED_GENERATION_MUSCLE_GROUPS] };
  }

  const { profileId } = await seedGymProfile(db, {
    userId,
    name: 'Generation Harness Gym',
    nativeUnit: 'kg',
    barbellWeightKg: '20.000',
    plates: [{ weightKg: '20.000', pairCount: 4 }],
    dumbbells: [],
    machines: [],
  });

  await setActiveEquipmentProfile(userId, profileId, db);

  return { exerciseIds, profileId, muscleGroupIds: [...SEEDED_GENERATION_MUSCLE_GROUPS] };
}

// The raw routine_exercise_cycle_target row count for a whole routine — the sparse-override proof
// needs the total across every slot, which readRoutineExerciseCycleTargetsRaw's per-slot read
// cannot give without the spec first enumerating slots.
export async function readCycleTargetCountForRoutine(routineId: string): Promise<number> {
  if (!rawDb) {
    throw new Error('readCycleTargetCountForRoutine() called before openTestPowerSync()');
  }
  const rows = await rawDb.getAll<{ count: number }>(
    `SELECT COUNT(*) AS count FROM routine_exercise_cycle_target
     WHERE routine_exercise_id IN (
       SELECT re.id FROM routine_exercise re
       JOIN routine_day rd ON rd.id = re.routine_day_id
       WHERE rd.routine_id = ?
     )`,
    [routineId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function readRoutineRaw(routineId: string): Promise<Record<string, unknown> | null> {
  if (!rawDb) {
    throw new Error('readRoutineRaw() called before openTestPowerSync()');
  }
  const rows = await rawDb.getAll<Record<string, unknown>>('SELECT * FROM routine WHERE id = ?', [routineId]);
  return rows[0] ?? null;
}

export interface SeedProgressPhotoInput {
  userId: string;
  storageKey: string;
  note?: string | null;
  takenAt?: string;
  timezone?: string;
  localDate?: string;
}

// A direct, minimal write of the progress_photo row alone — never through savePhoto, since the
// R27 harness cases need a row that DELIBERATELY has no matching bytes (12-03's own byte-presence
// precondition). A caller that also wants bytes present calls putPhotoBytes(storageKey, ...)
// separately, exactly as the e2e spec does.
export async function seedProgressPhoto(db: TestWriteDb, input: SeedProgressPhotoInput): Promise<string> {
  const id = generateClientId();
  const takenAt = input.takenAt ?? new Date().toISOString();

  await db.insert(progressPhoto).values({
    id,
    userId: input.userId,
    takenAt,
    timezone: input.timezone ?? 'UTC',
    localDate: input.localDate ?? takenAt.slice(0, 10),
    storageKey: input.storageKey,
    note: input.note ?? null,
  });

  return id;
}

export async function readProgressPhotosRaw(userId: string): Promise<Record<string, unknown>[]> {
  if (!rawDb) {
    throw new Error('readProgressPhotosRaw() called before openTestPowerSync()');
  }
  return rawDb.getAll<Record<string, unknown>>('SELECT * FROM progress_photo WHERE user_id = ?', [userId]);
}
