import { resolve } from 'node:path';
import { config } from 'dotenv';

// Repeats drizzle.module.ts's own bootstrap (see its lines 1-8) — this script runs through
// ts-node outside Nest's bootstrap, so nothing else guarantees .env is loaded before the
// DATABASE_URL guard below reads it. Harmless to call twice: dotenv never overwrites a variable
// that is already set.
config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

import { eq, sql } from 'drizzle-orm';
import { toCanonicalKg, type SyncCrudOp } from '@fitness/api-contracts';
import { db, pool } from '../db/drizzle.module';
import { user, workoutSession } from '../db/schema';
import { SyncService } from '../sync/sync.service';
import { CORPUS_SHAPE } from './corpus-shape';

// ---------------------------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — the platform's built-in unseeded random source must never
// appear in this file, so the same seed produces a byte-identical corpus on every machine and a
// latency change is a real regression rather than a different dataset.
// ---------------------------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a — folds the target email into the seed so two different accounts never draw the same id
// sequence from the same CORPUS_SHAPE.seed. Two runs against the SAME email still produce a
// byte-identical corpus (the acceptance criterion this plan tests), but two different accounts no
// longer collide on identical workout_session/session_exercise/logged_set ids, which the aggregate
// resolver in sync.service.ts would otherwise reject `not_owner` — a real ownership rejection
// disguised as a fixture problem the first time two seeded accounts existed side by side.
function seedFor(baseSeed: number, email: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < email.length; i++) {
    hash ^= email.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash ^ baseSeed) >>> 0;
}

// A UUID-shaped id drawn from the seeded PRNG, not a real random source — a client-generated
// sync identity, not a secret (same reasoning as apps/mobile/lib/db/id.ts, 02-02's Deviation #3).
function makeIdGenerator(rng: () => number): () => string {
  return function generateId(): string {
    const hexDigit = () => Math.floor(rng() * 16).toString(16);
    const digits = Array.from({ length: 32 }, hexDigit);
    digits[12] = '4';
    digits[16] = ((parseInt(digits[16], 16) & 0x3) | 0x8).toString(16);
    const s = digits.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
  };
}

// ---------------------------------------------------------------------------------------------
// Destination guard (T-02-09) — a seed script that can quietly write thousands of fabricated
// workouts into a real account is a footgun, and this one will be run repeatedly by someone who
// also uses this app to train.
// ---------------------------------------------------------------------------------------------
export function assertDevelopmentDatabase(databaseUrl: string): void {
  const parsed = new URL(databaseUrl);
  const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  const databaseName = parsed.pathname.replace(/^\//, '');
  const isExplicitlyNamedDev = /(^|_)(dev|test|seed)($|_)/i.test(databaseName);
  if (!isLocalHost && !isExplicitlyNamedDev) {
    throw new Error(
      `Refusing to seed a corpus against DATABASE_URL host "${parsed.hostname}" / database "${databaseName}" — ` +
        'it is neither a localhost connection nor an explicitly-named development database ' +
        '(database name must contain "dev", "test" or "seed"). A fabricated eighteen-month training ' +
        'history must never land silently in a real account.',
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Exercise catalog — spans every load_type the schema declares (PITFALLS.md §9): external weight,
// bodyweight, bodyweight + added load, assisted, time-based, distance-based.
//
// Plank and Farmer's Carry exist here for load_type diversity only and are never logged: logged_set
// has only `reps` and `weight_kg`, no duration or distance column. Faking a duration into `reps`
// is exactly the "reps = seconds" anti-pattern PITFALLS.md §9 names as a warning sign, so this
// generator does not do it — this is the finding the plan's objective calls "worth more than a
// seeded database": a real duration_seconds/distance_meters column is missing from logged_set,
// recorded in this plan's SUMMARY and in .planning/WINDOWS.md for a later plan to add.
// ---------------------------------------------------------------------------------------------
interface ExerciseSeed {
  id: string;
  name: string;
  loadType: string;
  unilateral: boolean;
  movementPattern: string | null;
  equipmentRequired: string | null;
}

const EXERCISE_CATALOG: ExerciseSeed[] = [
  { id: 'seed-ex-back-squat', name: 'Barbell Back Squat', loadType: 'external_weight', unilateral: false, movementPattern: 'squat', equipmentRequired: 'barbell' },
  { id: 'seed-ex-bench-press', name: 'Barbell Bench Press', loadType: 'external_weight', unilateral: false, movementPattern: 'horizontal_press', equipmentRequired: 'barbell' },
  { id: 'seed-ex-deadlift', name: 'Conventional Deadlift', loadType: 'external_weight', unilateral: false, movementPattern: 'hinge', equipmentRequired: 'barbell' },
  { id: 'seed-ex-overhead-press', name: 'Standing Overhead Press', loadType: 'external_weight', unilateral: false, movementPattern: 'vertical_press', equipmentRequired: 'barbell' },
  { id: 'seed-ex-dumbbell-row', name: 'Single-Arm Dumbbell Row', loadType: 'external_weight', unilateral: true, movementPattern: 'horizontal_pull', equipmentRequired: 'dumbbell' },
  { id: 'seed-ex-pull-up', name: 'Pull-Up', loadType: 'bodyweight', unilateral: false, movementPattern: 'vertical_pull', equipmentRequired: 'pull-up bar' },
  { id: 'seed-ex-weighted-dip', name: 'Weighted Dip', loadType: 'bodyweight_plus_added', unilateral: false, movementPattern: 'vertical_press', equipmentRequired: 'dip bar' },
  { id: 'seed-ex-assisted-pull-up', name: 'Band-Assisted Pull-Up', loadType: 'assisted', unilateral: false, movementPattern: 'vertical_pull', equipmentRequired: 'assist band' },
  { id: 'seed-ex-plank', name: 'Plank', loadType: 'time_based', unilateral: false, movementPattern: 'core', equipmentRequired: null },
  { id: 'seed-ex-farmers-carry', name: "Farmer's Carry", loadType: 'distance_based', unilateral: false, movementPattern: 'carry', equipmentRequired: 'kettlebell' },
];
const EXERCISE_BY_ID = new Map(EXERCISE_CATALOG.map((e) => [e.id, e]));

// ---------------------------------------------------------------------------------------------
// Routine — three or four training days, each snapshotted onto session_exercise at write time
// (D-05). routine/routine_day/routine_exercise are not yet in SyncService's TABLE_MAP (02-02's
// Decision: 9 of 12 SYNCED_TABLES entries are wire-contract-only), so they are seeded with raw SQL
// rather than pushed through applyBatch — the corpus proper (workout_session/session_exercise/
// logged_set) is what goes through the ingress; this is prerequisite reference data, same
// footing as the user account itself.
// ---------------------------------------------------------------------------------------------
interface DayExerciseSeed {
  exerciseId: string;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
  targetRir: number;
  targetRestSeconds: number;
}
interface RoutineDaySeed {
  slug: string;
  name: string;
  orderIndex: number;
  exercises: DayExerciseSeed[];
}

const ROUTINE_DAYS: RoutineDaySeed[] = [
  {
    slug: 'push',
    name: 'Push',
    orderIndex: 0,
    exercises: [
      { exerciseId: 'seed-ex-bench-press', targetSets: 4, targetRepMin: 6, targetRepMax: 10, targetRir: 3, targetRestSeconds: 150 },
      { exerciseId: 'seed-ex-overhead-press', targetSets: 4, targetRepMin: 6, targetRepMax: 10, targetRir: 3, targetRestSeconds: 120 },
      { exerciseId: 'seed-ex-weighted-dip', targetSets: 4, targetRepMin: 8, targetRepMax: 12, targetRir: 3, targetRestSeconds: 90 },
    ],
  },
  {
    slug: 'pull',
    name: 'Pull',
    orderIndex: 1,
    exercises: [
      { exerciseId: 'seed-ex-deadlift', targetSets: 4, targetRepMin: 4, targetRepMax: 8, targetRir: 3, targetRestSeconds: 180 },
      { exerciseId: 'seed-ex-pull-up', targetSets: 4, targetRepMin: 6, targetRepMax: 10, targetRir: 3, targetRestSeconds: 90 },
      { exerciseId: 'seed-ex-dumbbell-row', targetSets: 4, targetRepMin: 8, targetRepMax: 12, targetRir: 3, targetRestSeconds: 75 },
      { exerciseId: 'seed-ex-assisted-pull-up', targetSets: 4, targetRepMin: 6, targetRepMax: 10, targetRir: 3, targetRestSeconds: 90 },
    ],
  },
  {
    slug: 'legs',
    name: 'Legs',
    orderIndex: 2,
    exercises: [
      { exerciseId: 'seed-ex-back-squat', targetSets: 4, targetRepMin: 5, targetRepMax: 8, targetRir: 3, targetRestSeconds: 180 },
      { exerciseId: 'seed-ex-dumbbell-row', targetSets: 4, targetRepMin: 8, targetRepMax: 12, targetRir: 3, targetRestSeconds: 75 },
    ],
  },
  {
    slug: 'full-body',
    name: 'Full Body',
    orderIndex: 3,
    exercises: [
      { exerciseId: 'seed-ex-back-squat', targetSets: 4, targetRepMin: 5, targetRepMax: 8, targetRir: 3, targetRestSeconds: 180 },
      { exerciseId: 'seed-ex-bench-press', targetSets: 4, targetRepMin: 6, targetRepMax: 10, targetRir: 3, targetRestSeconds: 150 },
      { exerciseId: 'seed-ex-deadlift', targetSets: 4, targetRepMin: 4, targetRepMax: 8, targetRir: 3, targetRestSeconds: 180 },
    ],
  },
];
// One weekday per session/week (Mon, Wed, Fri, Sat) — index-aligned with ROUTINE_DAYS, so the
// split repeats every week across the whole span.
const WEEKDAY_OFFSETS = [1, 3, 5, 6] as const;

const FIXED_TIMEZONE = 'America/Los_Angeles';
// A fixed calendar anchor, not Date.now() — the corpus must be byte-identical across runs on
// different days for the same seed (acceptance: "regenerating with the same seed produces an
// identical corpus").
const CORPUS_START = new Date('2025-01-06T18:00:00.000Z');

function localDateString(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// ---------------------------------------------------------------------------------------------
// Working-weight progression, tracked as integer quarter-kilogram units so repeated += steps stay
// exactly representable in IEEE-754 (dividing by 4 never introduces drift) — a corpus of floats
// would make plan 02-04's drift assertions meaningless the moment anything aggregated it.
// ---------------------------------------------------------------------------------------------
interface WorkingState {
  currentX4: number;
  floorX4: number;
  ceilingX4: number;
  // +1: heavier is progress (external/bodyweight+added). -1: lighter is progress (assisted — less
  // assistance means more strength).
  direction: 1 | -1;
}

function initWorkingWeights(): Map<string, WorkingState> {
  const m = new Map<string, WorkingState>();
  m.set('seed-ex-back-squat', { currentX4: 240, floorX4: 160, ceilingX4: 440, direction: 1 });
  m.set('seed-ex-bench-press', { currentX4: 160, floorX4: 120, ceilingX4: 320, direction: 1 });
  m.set('seed-ex-deadlift', { currentX4: 320, floorX4: 240, ceilingX4: 520, direction: 1 });
  m.set('seed-ex-overhead-press', { currentX4: 120, floorX4: 80, ceilingX4: 240, direction: 1 });
  m.set('seed-ex-weighted-dip', { currentX4: 20, floorX4: 0, ceilingX4: 120, direction: 1 });
  m.set('seed-ex-assisted-pull-up', { currentX4: 80, floorX4: 0, ceilingX4: 100, direction: -1 });
  m.set('seed-ex-dumbbell-row', { currentX4: 60, floorX4: 40, ceilingX4: 160, direction: 1 });
  return m;
}

// Most sessions progress slightly, some plateau, some regress — so trend queries have something
// real to read rather than a monotonic staircase.
function progressWeight(weights: Map<string, WorkingState>, exerciseId: string, rng: () => number): number {
  const state = weights.get(exerciseId);
  if (!state) return 0; // pure bodyweight (pull-up) — no external load at all.
  const roll = rng();
  const step = 5; // 1.25kg
  if (roll < 0.6) {
    const improved = state.direction > 0 ? state.currentX4 + step : state.currentX4 - step;
    state.currentX4 = Math.min(state.ceilingX4, Math.max(state.floorX4, improved));
  } else if (roll < 0.85) {
    // plateau
  } else {
    const regressed = state.direction > 0 ? state.currentX4 - step : state.currentX4 + step;
    state.currentX4 = Math.min(state.ceilingX4, Math.max(state.floorX4, regressed));
  }
  return state.currentX4 / 4;
}

function kgString(value: number): string {
  return toCanonicalKg(String(value), 'kg') as string;
}

// ---------------------------------------------------------------------------------------------
// Reference-data bootstrap — raw SQL via db.execute, not a Drizzle query-builder insert: these are
// prerequisites (the target account, the catalog, the routine scaffolding), not the corpus itself.
// The corpus proper (workout_session/session_exercise/logged_set) is written exclusively through
// SyncService.applyBatch below.
// ---------------------------------------------------------------------------------------------
async function ensureExerciseCatalog(): Promise<void> {
  for (const ex of EXERCISE_CATALOG) {
    await db.execute(sql`
      INSERT INTO exercise (id, user_id, name, movement_pattern, equipment_required, load_type, unilateral, is_custom, source)
      VALUES (${ex.id}, NULL, ${ex.name}, ${ex.movementPattern}, ${ex.equipmentRequired}, ${ex.loadType}, ${ex.unilateral}, false, 'seed')
      ON CONFLICT (id) DO NOTHING
    `);
  }
}

async function ensureUser(email: string): Promise<string> {
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (existing.length > 0) return existing[0].id;

  const name = email.split('@')[0];
  await db.execute(sql`
    INSERT INTO "user" (id, name, email, email_verified)
    VALUES (${`seed-user-${email}`}, ${name}, ${email}, true)
    ON CONFLICT (email) DO NOTHING
  `);
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return row.id;
}

async function ensureRoutine(userId: string, routineId: string): Promise<void> {
  // Idempotent: clears any prior run's routine scaffolding for this user before recreating it.
  // Cascades to routine_day/routine_exercise at the database level.
  await db.execute(sql`DELETE FROM routine WHERE id = ${routineId}`);
  await db.execute(sql`
    INSERT INTO routine (id, user_id, name, status, source)
    VALUES (${routineId}, ${userId}, 'Seeded Training Block', 'active', 'seed')
  `);
  for (const day of ROUTINE_DAYS) {
    const dayId = `${routineId}-${day.slug}`;
    await db.execute(sql`
      INSERT INTO routine_day (id, routine_id, order_index, name, is_rest_day)
      VALUES (${dayId}, ${routineId}, ${day.orderIndex}, ${day.name}, false)
    `);
    for (const [index, dayEx] of day.exercises.entries()) {
      const rexId = `${dayId}-rex-${index}`;
      await db.execute(sql`
        INSERT INTO routine_exercise
          (id, routine_day_id, exercise_id, order_index, target_sets, target_rep_min, target_rep_max, target_rir, target_rest_seconds)
        VALUES
          (${rexId}, ${dayId}, ${dayEx.exerciseId}, ${index}, ${dayEx.targetSets}, ${dayEx.targetRepMin}, ${dayEx.targetRepMax}, ${dayEx.targetRir}, ${dayEx.targetRestSeconds})
      `);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Session/set generation — the corpus proper.
// ---------------------------------------------------------------------------------------------
interface SessionSpec {
  day: RoutineDaySeed;
  startedAt: Date;
  endedAt: Date;
}

function buildSessionOps(
  spec: SessionSpec,
  routineId: string,
  weights: Map<string, WorkingState>,
  rng: () => number,
  generateId: () => string,
  includeDropSet: boolean,
): { ops: SyncCrudOp[]; setCount: number } {
  const { day, startedAt, endedAt } = spec;
  const timezone = FIXED_TIMEZONE;
  const localDate = localDateString(startedAt, timezone);
  const ops: SyncCrudOp[] = [];
  const sessionId = generateId();

  ops.push({
    op_id: generateId(),
    op: 'PUT',
    type: 'workout_session',
    id: sessionId,
    data: {
      routine_day_id: `${routineId}-${day.slug}`,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      status: 'completed',
      device_id: 'seed-script-device',
      timezone,
      local_date: localDate,
    },
  });

  let setCount = 0;
  let dropSetPlaced = !includeDropSet;

  day.exercises.forEach((dayEx, exerciseIndex) => {
    const exerciseDef = EXERCISE_BY_ID.get(dayEx.exerciseId);
    if (!exerciseDef) throw new Error(`Unknown seeded exercise id: ${dayEx.exerciseId}`);

    const sessionExerciseId = generateId();
    ops.push({
      op_id: generateId(),
      op: 'PUT',
      type: 'session_exercise',
      id: sessionExerciseId,
      data: {
        session_id: sessionId,
        exercise_id: dayEx.exerciseId,
        order_index: exerciseIndex,
        routine_exercise_id: `${routineId}-${day.slug}-rex-${exerciseIndex}`,
        target_sets: dayEx.targetSets,
        target_rep_min: dayEx.targetRepMin,
        target_rep_max: dayEx.targetRepMax,
        target_rir: dayEx.targetRir,
        target_rest_seconds: dayEx.targetRestSeconds,
      },
    });

    const workingWeight = progressWeight(weights, dayEx.exerciseId, rng);
    let setIndex = 0;

    function pushSet(data: Record<string, unknown>): string {
      setIndex += 1;
      const setId = generateId();
      ops.push({
        op_id: generateId(),
        op: 'PUT',
        type: 'logged_set',
        id: setId,
        data: { ...data, session_exercise_id: sessionExerciseId, set_index: setIndex },
      });
      setCount += 1;
      return setId;
    }

    if (exerciseIndex === 0) {
      pushSet({
        set_type: 'warmup',
        weight_kg: kgString(workingWeight * 0.5),
        reps: dayEx.targetRepMax,
        rir: 4,
        side: null,
        completed: true,
        rest_taken_seconds: 60,
        logged_at: startedAt.toISOString(),
      });
    }

    let lastNormalSetId: string | null = null;

    for (let s = 0; s < dayEx.targetSets; s++) {
      const isLast = s === dayEx.targetSets - 1;
      let setType = 'normal';
      if (isLast && rng() < 0.2) setType = rng() < 0.5 ? 'failure' : 'amrap';

      const repDrift = rng();
      let reps: number;
      if (repDrift < 0.15) reps = Math.max(1, dayEx.targetRepMin - 1 - Math.floor(rng() * 2));
      else if (repDrift < 0.3) reps = dayEx.targetRepMax + 1 + Math.floor(rng() * 2);
      else reps = dayEx.targetRepMin + Math.floor(rng() * (dayEx.targetRepMax - dayEx.targetRepMin + 1));

      const rir = Math.max(0, Math.min(4, dayEx.targetRir - 1 + Math.floor(rng() * 3)));
      const completed = setType !== 'failure';

      if (exerciseDef.unilateral) {
        for (const side of ['left', 'right'] as const) {
          pushSet({
            set_type: setType,
            weight_kg: kgString(workingWeight),
            reps,
            rir,
            side,
            completed,
            rest_taken_seconds: dayEx.targetRestSeconds,
            logged_at: startedAt.toISOString(),
          });
        }
      } else {
        const setId = pushSet({
          set_type: setType,
          weight_kg: kgString(workingWeight),
          reps,
          rir,
          side: null,
          completed,
          rest_taken_seconds: dayEx.targetRestSeconds,
          logged_at: startedAt.toISOString(),
        });
        if (setType === 'normal') lastNormalSetId = setId;

        if (isLast && !dropSetPlaced && lastNormalSetId) {
          const dropWeightX4 = Math.round((workingWeight * 4) * 0.8);
          pushSet({
            set_type: 'drop',
            weight_kg: kgString(dropWeightX4 / 4),
            reps: reps + 2,
            rir: 0,
            side: null,
            completed: true,
            parent_set_id: lastNormalSetId,
            rest_taken_seconds: 15,
            logged_at: startedAt.toISOString(),
          });
          dropSetPlaced = true;
        }
      }
    }
  });

  return { ops, setCount };
}

function scheduleSessions(rng: () => number): SessionSpec[] {
  const totalDays = Math.round(CORPUS_SHAPE.spanMonths * 30.44);
  const totalWeeks = Math.ceil(totalDays / 7);
  const specs: SessionSpec[] = [];

  for (let week = 0; week < totalWeeks; week++) {
    // Skip the occasional week the way a real trainee does.
    if (rng() < 0.1) continue;
    const weekStart = CORPUS_START.getTime() + week * 7 * 86_400_000;
    WEEKDAY_OFFSETS.forEach((offsetDays, dayIndex) => {
      const jitterMs = Math.floor(rng() * 3 * 3_600_000); // 0-3h jitter on session start time
      const startedAt = new Date(weekStart + offsetDays * 86_400_000 + jitterMs);
      const durationMs = (45 + Math.floor(rng() * 30)) * 60_000; // 45-75 minute session
      const endedAt = new Date(startedAt.getTime() + durationMs);
      specs.push({ day: ROUTINE_DAYS[dayIndex], startedAt, endedAt });
    });
  }

  // The LOG-22 case: a session that crosses midnight local time. 23:15 PST Dec 15, 2025 is
  // 07:15 UTC Dec 16 — local_date must stay Dec 15, the day the session started, per Decision 6.
  specs.push({
    day: ROUTINE_DAYS[0],
    startedAt: new Date('2025-12-16T07:15:00.000Z'),
    endedAt: new Date('2025-12-16T08:45:00.000Z'),
  });

  return specs;
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------
export interface GenerateCorpusOptions {
  email: string;
  reset: boolean;
}

export interface GenerateCorpusResult {
  userId: string;
  sessionsGenerated: number;
  setsGenerated: number;
}

export async function generateCorpus(options: GenerateCorpusOptions): Promise<GenerateCorpusResult> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  assertDevelopmentDatabase(databaseUrl);

  await ensureExerciseCatalog();
  const userId = await ensureUser(options.email);

  const existingCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(workoutSession)
    .where(eq(workoutSession.userId, userId));
  const hasExisting = (existingCount[0]?.n ?? 0) > 0;
  if (hasExisting && !options.reset) {
    throw new Error(
      `${options.email} already has ${existingCount[0].n} workout session(s). Pass --reset to overwrite them.`,
    );
  }
  if (hasExisting) {
    await db.delete(workoutSession).where(eq(workoutSession.userId, userId));
  }

  const routineId = `seed-routine-${userId}`;
  await ensureRoutine(userId, routineId);

  const rng = mulberry32(seedFor(CORPUS_SHAPE.seed, options.email));
  const generateId = makeIdGenerator(rng);
  const weights = initWorkingWeights();
  const syncService = new SyncService(db);

  const sessionSpecs = scheduleSessions(rng);

  let sessionsGenerated = 0;
  let setsGenerated = 0;

  for (const [index, spec] of sessionSpecs.entries()) {
    const includeDropSet = index % 5 === 0;
    const { ops, setCount } = buildSessionOps(spec, routineId, weights, rng, generateId, includeDropSet);

    const response = await syncService.applyBatch(userId, ops);
    if (response.rejected.length > 0) {
      throw new Error(
        `Corpus generation push was rejected for session ${index}: ${JSON.stringify(response.rejected[0])}`,
      );
    }

    sessionsGenerated += 1;
    setsGenerated += setCount;

    if (sessionsGenerated % 50 === 0) {
      // eslint-disable-next-line no-console
      console.log(`  ...${sessionsGenerated}/${sessionSpecs.length} sessions, ${setsGenerated} sets so far`);
    }
  }

  return { userId, sessionsGenerated, setsGenerated };
}

function parseArgs(argv: string[]): GenerateCorpusOptions {
  let email: string | undefined;
  let reset = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--email') email = argv[++i];
    else if (argv[i] === '--reset') reset = true;
  }
  if (!email) {
    throw new Error('Usage: pnpm --filter api seed:corpus -- --email <email> [--reset]');
  }
  return { email, reset };
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  generateCorpus(options)
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log(
        `Seeded ${result.sessionsGenerated} sessions and ${result.setsGenerated} logged sets for ${options.email} (user ${result.userId}).`,
      );
      return pool.end();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      pool.end().finally(() => process.exit(1));
    });
}
