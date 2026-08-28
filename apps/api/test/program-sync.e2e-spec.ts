import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import {
  SYNC_PUSH_PATH,
  isTerminalRejection,
  type SyncCrudOp,
  type SyncCrudOpType,
  type SyncPushRequest,
  type SyncPushResponse,
} from '@fitness/api-contracts';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as exercise-sync.e2e-spec.ts: @thallesp/nestjs-better-auth and better-auth are
// ESM-only, so this suite drives the built artifact over real HTTP rather than an in-process
// testing module — copied verbatim, not reconstructed.
const AUTH_BASE_PATH = '/v1/auth';
const PASSWORD = 'correct-horse-battery-staple';

let api: ChildProcess;
let baseUrl: string;
let pg: Client;
const createdEmails: string[] = [];
const createdRoutineIds: string[] = [];
let exerciseId: string;

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', rej);
    srv.listen(0, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => res(port));
    });
  });
}

async function waitForReady(url: string, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await request(url).get(`${AUTH_BASE_PATH}/get-session`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`API did not become ready at ${url} within ${timeoutMs}ms`);
}

function freshEmail(tag: string): string {
  const email = `e2e-program-sync-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  createdEmails.push(email);
  return email;
}

function sessionCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const match = cookies.find((c) => c.includes('better-auth.session_token='));
  if (!match) throw new Error('sign-up did not return a session cookie');
  return match.split(';')[0];
}

async function signUp(tag: string): Promise<string> {
  const email = freshEmail(tag);
  const res = await request(baseUrl)
    .post(`${AUTH_BASE_PATH}/sign-up/email`)
    .send({ email, password: PASSWORD, name: `E2E ${tag}` })
    .expect(200);
  return sessionCookie(res);
}

async function push(cookie: string, batch: SyncCrudOp[]): Promise<request.Response> {
  const body: SyncPushRequest = { batch };
  return request(baseUrl).post(SYNC_PUSH_PATH).send(body).set('Cookie', cookie);
}

function routineOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'routine', id, data };
}

function routineDayOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'routine_day', id, data };
}

function routineExerciseOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'routine_exercise', id, data };
}

function routineCycleOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'routine_cycle', id, data };
}

function routineExerciseCycleTargetOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'routine_exercise_cycle_target', id, data };
}

function exerciseOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'exercise', id, data };
}

function workoutSessionOp(id: string, overrides: Partial<SyncCrudOp> = {}): SyncCrudOp {
  return {
    op_id: randomUUID(),
    op: 'PUT',
    type: 'workout_session',
    id,
    data: {
      started_at: new Date().toISOString(),
      status: 'in_progress',
      timezone: 'UTC',
      local_date: new Date().toISOString().slice(0, 10),
    },
    ...overrides,
  };
}

interface RoutineRow {
  id: string;
  user_id: string;
  name: string;
  goal: string | null;
  status: string;
  source: string;
  archived_at: string | null;
}

async function routineRow(id: string): Promise<RoutineRow | undefined> {
  const { rows } = await pg.query(
    'SELECT id, user_id, name, goal, status, source, archived_at FROM routine WHERE id = $1',
    [id],
  );
  return rows[0];
}

async function routineCount(ids: string[]): Promise<number> {
  const { rows } = await pg.query('SELECT count(*)::int AS n FROM routine WHERE id = ANY($1::text[])', [ids]);
  return rows[0].n;
}

async function workoutSessionRow(id: string): Promise<{ id: string; user_id: string } | undefined> {
  const { rows } = await pg.query('SELECT id, user_id FROM workout_session WHERE id = $1', [id]);
  return rows[0];
}

interface RoutineDayRow {
  id: string;
  routine_id: string;
  order_index: number;
  name: string;
  is_rest_day: boolean;
  archived_at: string | null;
}

async function routineDayRow(id: string): Promise<RoutineDayRow | undefined> {
  const { rows } = await pg.query(
    'SELECT id, routine_id, order_index, name, is_rest_day, archived_at FROM routine_day WHERE id = $1',
    [id],
  );
  return rows[0];
}

interface RoutineExerciseRow {
  id: string;
  routine_day_id: string;
  exercise_id: string;
  order_index: number;
  target_sets: number | null;
  target_rep_min: number | null;
  target_rep_max: number | null;
  target_rir: number | null;
  target_rest_seconds: number | null;
}

async function routineExerciseRow(id: string): Promise<RoutineExerciseRow | undefined> {
  const { rows } = await pg.query(
    `SELECT id, routine_day_id, exercise_id, order_index, target_sets, target_rep_min,
            target_rep_max, target_rir, target_rest_seconds
     FROM routine_exercise WHERE id = $1`,
    [id],
  );
  return rows[0];
}

interface RoutineCycleRow {
  id: string;
  routine_id: string;
  order_index: number;
  name: string;
  kind: string;
  duration_days: number | null;
}

async function routineCycleRow(id: string): Promise<RoutineCycleRow | undefined> {
  const { rows } = await pg.query(
    'SELECT id, routine_id, order_index, name, kind, duration_days FROM routine_cycle WHERE id = $1',
    [id],
  );
  return rows[0];
}

interface RoutineExerciseCycleTargetRow {
  id: string;
  routine_exercise_id: string;
  cycle_id: string;
  target_sets: number | null;
  target_rep_min: number | null;
  target_rep_max: number | null;
  target_rir: number | null;
  target_rest_seconds: number | null;
}

async function routineExerciseCycleTargetRow(id: string): Promise<RoutineExerciseCycleTargetRow | undefined> {
  const { rows } = await pg.query(
    `SELECT id, routine_exercise_id, cycle_id, target_sets, target_rep_min, target_rep_max, target_rir, target_rest_seconds
     FROM routine_exercise_cycle_target WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function cycleTargetRowsForPair(routineExerciseId: string, cycleId: string): Promise<RoutineExerciseCycleTargetRow[]> {
  const { rows } = await pg.query(
    `SELECT id, routine_exercise_id, cycle_id, target_sets, target_rep_min, target_rep_max, target_rir, target_rest_seconds
     FROM routine_exercise_cycle_target WHERE routine_exercise_id = $1 AND cycle_id = $2`,
    [routineExerciseId, cycleId],
  );
  return rows;
}

async function tombstoneCount(rowIds: string[]): Promise<number> {
  const { rows } = await pg.query('SELECT count(*)::int AS n FROM sync_tombstone WHERE row_id = ANY($1::text[])', [rowIds]);
  return rows[0].n;
}

// Owned by cookie, ready to hang a routine_exercise off of — the shared parent shape every
// routine_exercise-focused test needs (T-04-08's two-hop chain starts here).
async function seedRoutineAndDay(cookie: string, tag: string): Promise<{ routineId: string; dayId: string }> {
  const routineId = randomUUID();
  const dayId = randomUUID();
  createdRoutineIds.push(routineId);
  const res = await push(cookie, [
    routineOp(routineId, { name: `Seed ${tag}`, status: 'draft' }),
    routineDayOp(dayId, { routine_id: routineId, order_index: 0, name: 'Day 1' }),
  ]);
  expect((res.body as SyncPushResponse).rejected).toEqual([]);
  return { routineId, dayId };
}

// The full four-level chain a routine_exercise_cycle_target op needs: a routine, one day, one
// routine_exercise on that day, and one routine_cycle — the shared parent shape every
// cycle-target-focused test needs (T-04-33's dual-parent chain starts here).
async function seedRoutineDayExerciseCycle(
  cookie: string,
  tag: string,
): Promise<{ routineId: string; dayId: string; routineExerciseId: string; cycleId: string }> {
  const { routineId, dayId } = await seedRoutineAndDay(cookie, tag);
  const routineExerciseId = randomUUID();
  const cycleId = randomUUID();
  const res = await push(cookie, [
    routineExerciseOp(routineExerciseId, { routine_day_id: dayId, exercise_id: exerciseId, order_index: 0 }),
    routineCycleOp(cycleId, { routine_id: routineId, order_index: 0, name: 'Week 1', kind: 'training' }),
  ]);
  expect((res.body as SyncPushResponse).rejected).toEqual([]);
  return { routineId, dayId, routineExerciseId, cycleId };
}

// The real user id behind a session cookie — extracted through a workout_session push, mirroring
// the existing "a PUT naming a different user's user_id..." test's own pattern, since better-auth
// never hands the test the raw id directly.
async function realUserId(cookie: string, tag: string): Promise<string> {
  const sessionId = randomUUID();
  await push(cookie, [workoutSessionOp(sessionId)]);
  return (await workoutSessionRow(sessionId))!.user_id;
}

function userPreferenceOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'user_preference', id, data };
}

interface UserPreferenceRow {
  id: string;
  user_id: string;
  weight_unit: string;
  default_equipment_profile_id: string | null;
  active_routine_id: string | null;
}

async function userPreferenceRow(userId: string): Promise<UserPreferenceRow | undefined> {
  const { rows } = await pg.query(
    'SELECT id, user_id, weight_unit, default_equipment_profile_id, active_routine_id FROM user_preference WHERE user_id = $1',
    [userId],
  );
  return rows[0];
}

async function userPreferenceCount(userId: string): Promise<number> {
  const { rows } = await pg.query('SELECT count(*)::int AS n FROM user_preference WHERE user_id = $1', [userId]);
  return rows[0].n;
}

beforeAll(async () => {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;

  api = spawn(process.execPath, [resolve(__dirname, '../dist/main.js')], {
    env: { ...process.env, PORT: String(port), AUTH_RATE_LIMIT_MAX: '1000', AUTH_RATE_LIMIT_WINDOW: '60' },
    stdio: 'pipe',
  });
  api.stderr?.on('data', (d) => process.stderr.write(`[api] ${d}`));

  await waitForReady(baseUrl);

  pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();

  exerciseId = randomUUID();
  await pg.query(
    `INSERT INTO exercise (id, name, load_type, is_custom, unilateral, source)
     VALUES ($1, 'Barbell Back Squat', 'external_weight', false, false, 'seed')`,
    [exerciseId],
  );
}, 60000);

afterAll(async () => {
  if (pg) {
    if (createdRoutineIds.length > 0) {
      await pg.query('DELETE FROM routine WHERE id = ANY($1::text[])', [createdRoutineIds]);
    }
    if (createdEmails.length > 0) {
      await pg.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [createdEmails]);
    }
    await pg.query('DELETE FROM exercise WHERE id = $1', [exerciseId]);
    await pg.end();
  }
  if (api && !api.killed) {
    api.kill('SIGTERM');
  }
});

describe('program (routine) sync (e2e)', () => {
  it('applies a PUT routine op and produces a real Postgres row owned by the pushing user', async () => {
    const cookie = await signUp('put-insert');
    const routineId = randomUUID();
    createdRoutineIds.push(routineId);

    const op = routineOp(routineId, { name: 'Push Pull Legs', status: 'draft', goal: 'hypertrophy' });
    const res = await push(cookie, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([op.op_id]);
    expect(body.rejected).toEqual([]);

    const row = await routineRow(routineId);
    expect(row).toBeDefined();
    expect(row?.name).toBe('Push Pull Legs');
    expect(row?.status).toBe('draft');
    expect(row?.source).toBe('user');
    expect(row?.archived_at).toBeNull();
  });

  it('pushing the same PUT routine op id twice leaves exactly one row with the second push\'s values — idempotent on id', async () => {
    const cookie = await signUp('idempotent-put');
    const routineId = randomUUID();
    createdRoutineIds.push(routineId);

    const first = await push(cookie, [routineOp(routineId, { name: 'Push Pull Legs', status: 'draft' })]);
    expect((first.body as SyncPushResponse).rejected).toEqual([]);
    const second = await push(cookie, [routineOp(routineId, { name: 'PPL v2', status: 'draft' })]);
    expect((second.body as SyncPushResponse).rejected).toEqual([]);

    expect(await routineCount([routineId])).toBe(1);
    const row = await routineRow(routineId);
    expect(row?.name).toBe('PPL v2');
  });

  it('a PUT naming a different user\'s user_id in its payload is stored against the pusher, never the named user', async () => {
    const pusherCookie = await signUp('pusher');
    const otherCookie = await signUp('named-other');
    // Extract each user's real id via a workout_session op push, so the assertion compares
    // against a real, distinct user_id rather than a client-supplied string.
    const pusherSessionId = randomUUID();
    await push(pusherCookie, [workoutSessionOp(pusherSessionId)]);
    const pusherUserId = (await workoutSessionRow(pusherSessionId))!.user_id;

    const otherSessionId = randomUUID();
    await push(otherCookie, [workoutSessionOp(otherSessionId)]);
    const otherUserId = (await workoutSessionRow(otherSessionId))!.user_id;
    expect(otherUserId).not.toBe(pusherUserId);

    const routineId = randomUUID();
    createdRoutineIds.push(routineId);
    const op = routineOp(routineId, { name: 'Stolen Ownership', status: 'draft', user_id: otherUserId });
    const res = await push(pusherCookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    const row = await routineRow(routineId);
    expect(row?.user_id).toBe(pusherUserId);
    expect(row?.user_id).not.toBe(otherUserId);
  });

  it("rejects user B's PUT against user A's existing routine with not_owner, and the stored row is unchanged", async () => {
    const cookieA = await signUp('owner-a');
    const cookieB = await signUp('attacker-b');
    const routineId = randomUUID();
    createdRoutineIds.push(routineId);

    const createRes = await push(cookieA, [routineOp(routineId, { name: 'A\'s Program', status: 'draft' })]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);
    const before = await routineRow(routineId);

    const attackOp = routineOp(routineId, { name: 'Hijacked', status: 'draft' });
    const res = await push(cookieB, [attackOp]);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: attackOp.op_id, reason: 'not_owner' }]);

    const after = await routineRow(routineId);
    expect(after).toEqual(before);
  });

  // The cross-user half of CR-01 (04-REVIEW.md): the same id reused under two root types made the
  // ownership lookup miss user A's routine entirely, so B's routine PUT was treated as a fresh
  // insert and rewrote user_id/name/status. Aggregates are now keyed by (root table, root id), so
  // the routine op is resolved against `routine` no matter what else the batch names.
  it("rejects user B's routine PUT that reuses user A's routine id under a second root type in the same batch, and A's row is unchanged", async () => {
    const cookieA = await signUp('id-collision-owner-a');
    const cookieB = await signUp('id-collision-attacker-b');
    const routineId = randomUUID();
    createdRoutineIds.push(routineId);

    const createRes = await push(cookieA, [routineOp(routineId, { name: "A's Program", status: 'ready' })]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);
    const ownerA = (await routineRow(routineId))!.user_id;

    const takeoverOp = routineOp(routineId, { name: 'PWNED', status: 'draft' });
    const decoyOp = exerciseOp(routineId, { name: 'Decoy', load_type: 'external_weight' });
    const res = await push(cookieB, [takeoverOp, decoyOp]);
    const body: SyncPushResponse = res.body;

    expect(body.applied).not.toContain(takeoverOp.op_id);
    expect(body.rejected).toContainEqual({ op_id: takeoverOp.op_id, reason: 'not_owner' });

    const after = await routineRow(routineId);
    expect(after?.user_id).toBe(ownerA);
    expect(after?.name).toBe("A's Program");
    expect(after?.status).toBe('ready');
  });

  it('rejects a PUT with status outside ROUTINE_STATUSES as invalid_field and writes no row', async () => {
    const cookie = await signUp('bad-status');
    const routineId = randomUUID();
    createdRoutineIds.push(routineId);

    const op = routineOp(routineId, { name: 'Bad Status Program', status: 'active' });
    const res = await push(cookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);
    expect(await routineRow(routineId)).toBeUndefined();
  });

  it('rejects a PUT with an empty name as invalid_field', async () => {
    const cookie = await signUp('empty-name');
    const routineId = randomUUID();
    createdRoutineIds.push(routineId);

    const op = routineOp(routineId, { name: '', status: 'draft' });
    const res = await push(cookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);
    expect(await routineRow(routineId)).toBeUndefined();
  });

  it('rejects a DELETE routine op with invalid_field and the row survives — D-05 archive-only, never hard-deleted', async () => {
    const cookie = await signUp('delete-reject');
    const routineId = randomUUID();
    createdRoutineIds.push(routineId);
    const createRes = await push(cookie, [routineOp(routineId, { name: 'Never Deleted', status: 'draft' })]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const deleteOp = routineOp(routineId, {}, 'DELETE');
    const res = await push(cookie, [deleteOp]);
    const body: SyncPushResponse = res.body;
    expect(body.rejected).toEqual([{ op_id: deleteOp.op_id, reason: 'invalid_field' }]);
    expect(await routineRow(routineId)).toBeDefined();
  });

  it('a PATCH naming only archived_at sets archived_at and leaves name and status untouched', async () => {
    const cookie = await signUp('patch-archive');
    const routineId = randomUUID();
    createdRoutineIds.push(routineId);
    const createRes = await push(cookie, [routineOp(routineId, { name: 'Archive Me', status: 'ready' })]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const archivedAt = new Date().toISOString();
    const patchOp = routineOp(routineId, { archived_at: archivedAt }, 'PATCH');
    const res = await push(cookie, [patchOp]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    const row = await routineRow(routineId);
    expect(row?.archived_at).not.toBeNull();
    expect(row?.name).toBe('Archive Me');
    expect(row?.status).toBe('ready');
  });

  it('applies a batch containing one workout_session PUT and one routine PUT, each landing under the pushing user', async () => {
    const cookie = await signUp('mixed-batch');
    const sessionId = randomUUID();
    const routineId = randomUUID();
    createdRoutineIds.push(routineId);

    const batch: SyncCrudOp[] = [workoutSessionOp(sessionId), routineOp(routineId, { name: 'Mixed Batch Program', status: 'draft' })];
    const res = await push(cookie, batch);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toHaveLength(2);
    expect(body.rejected).toEqual([]);

    const sessionRow = await workoutSessionRow(sessionId);
    const routineRowResult = await routineRow(routineId);
    expect(sessionRow).toBeDefined();
    expect(routineRowResult).toBeDefined();
    expect(sessionRow?.user_id).toBe(routineRowResult?.user_id);
  });
});

describe('routine_day / routine_exercise sync (e2e)', () => {
  it('applies a batch of [routine PUT, routine_day PUT, routine_exercise PUT] in that order — day.routine_id and exercise.routine_day_id are correctly set', async () => {
    const cookie = await signUp('tree-forward');
    const routineId = randomUUID();
    const dayId = randomUUID();
    const exId = randomUUID();
    createdRoutineIds.push(routineId);

    const batch: SyncCrudOp[] = [
      routineOp(routineId, { name: 'Tree Forward', status: 'draft' }),
      routineDayOp(dayId, { routine_id: routineId, order_index: 0, name: 'Day 1' }),
      routineExerciseOp(exId, { routine_day_id: dayId, exercise_id: exerciseId, order_index: 0 }),
    ];
    const res = await push(cookie, batch);
    const body: SyncPushResponse = res.body;
    expect(body.rejected).toEqual([]);
    expect(body.applied).toHaveLength(3);

    const day = await routineDayRow(dayId);
    const ex = await routineExerciseRow(exId);
    expect(day?.routine_id).toBe(routineId);
    expect(ex?.routine_day_id).toBe(dayId);
  });

  it('applies the same three ops pushed in reverse order (exercise, day, routine) — AGGREGATE_RANK sorts parents before children', async () => {
    const cookie = await signUp('tree-reverse');
    const routineId = randomUUID();
    const dayId = randomUUID();
    const exId = randomUUID();
    createdRoutineIds.push(routineId);

    const batch: SyncCrudOp[] = [
      routineExerciseOp(exId, { routine_day_id: dayId, exercise_id: exerciseId, order_index: 0 }),
      routineDayOp(dayId, { routine_id: routineId, order_index: 0, name: 'Day 1' }),
      routineOp(routineId, { name: 'Tree Reverse', status: 'draft' }),
    ];
    const res = await push(cookie, batch);
    const body: SyncPushResponse = res.body;
    expect(body.rejected).toEqual([]);
    expect(body.applied).toHaveLength(3);

    const day = await routineDayRow(dayId);
    const ex = await routineExerciseRow(exId);
    expect(day?.routine_id).toBe(routineId);
    expect(ex?.routine_day_id).toBe(dayId);
  });

  it("rejects user B's routine_day PUT naming user A's routine_id with not_owner, and no row is created", async () => {
    const cookieA = await signUp('day-owner-a');
    const cookieB = await signUp('day-attacker-b');
    const routineId = randomUUID();
    createdRoutineIds.push(routineId);
    const createRes = await push(cookieA, [routineOp(routineId, { name: "A's Program", status: 'draft' })]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const dayId = randomUUID();
    const attackOp = routineDayOp(dayId, { routine_id: routineId, order_index: 0, name: 'Hijack Day' });
    const res = await push(cookieB, [attackOp]);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: attackOp.op_id, reason: 'not_owner' }]);
    expect(await routineDayRow(dayId)).toBeUndefined();
  });

  it("rejects user B's routine_exercise PUT naming user A's routine_day_id with not_owner, resolved through day -> routine", async () => {
    const cookieA = await signUp('ex-owner-a');
    const cookieB = await signUp('ex-attacker-b');
    const { dayId } = await seedRoutineAndDay(cookieA, 'ex-owner-a');

    const exId = randomUUID();
    const attackOp = routineExerciseOp(exId, { routine_day_id: dayId, exercise_id: exerciseId, order_index: 0 });
    const res = await push(cookieB, [attackOp]);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: attackOp.op_id, reason: 'not_owner' }]);
    expect(await routineExerciseRow(exId)).toBeUndefined();
  });

  it('rejects a routine_day PUT naming a routine_id in neither the batch nor the database with missing_parent', async () => {
    const cookie = await signUp('day-missing-parent');
    const dayId = randomUUID();
    const op = routineDayOp(dayId, { routine_id: randomUUID(), order_index: 0, name: 'Orphan Day' });
    const res = await push(cookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: op.op_id, reason: 'missing_parent' }]);
    expect(await routineDayRow(dayId)).toBeUndefined();
  });

  it('a routine_exercise created under day D1 cannot be reparented to day D2 by naming a different routine_day_id — stored linkage wins', async () => {
    const cookie = await signUp('no-reparent');
    const { routineId, dayId: d1 } = await seedRoutineAndDay(cookie, 'no-reparent');
    const d2 = randomUUID();
    const d2Res = await push(cookie, [routineDayOp(d2, { routine_id: routineId, order_index: 1024, name: 'Day 2' })]);
    expect((d2Res.body as SyncPushResponse).rejected).toEqual([]);

    const exId = randomUUID();
    const createRes = await push(cookie, [routineExerciseOp(exId, { routine_day_id: d1, exercise_id: exerciseId, order_index: 0 })]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const moveOp = routineExerciseOp(exId, { routine_day_id: d2, exercise_id: exerciseId, order_index: 0 });
    const moveRes = await push(cookie, [moveOp]);
    expect((moveRes.body as SyncPushResponse).rejected).toEqual([]);

    const row = await routineExerciseRow(exId);
    expect(row?.routine_day_id).toBe(d1);
  });

  it('rejects a routine_exercise PUT with an absent or empty exercise_id as invalid_field', async () => {
    const cookie = await signUp('ex-missing-exercise-id');
    const { dayId } = await seedRoutineAndDay(cookie, 'ex-missing-exercise-id');

    const absentOp = routineExerciseOp(randomUUID(), { routine_day_id: dayId, order_index: 0 });
    const absentRes = await push(cookie, [absentOp]);
    expect((absentRes.body as SyncPushResponse).rejected).toEqual([{ op_id: absentOp.op_id, reason: 'invalid_field' }]);

    const emptyOp = routineExerciseOp(randomUUID(), { routine_day_id: dayId, exercise_id: '', order_index: 0 });
    const emptyRes = await push(cookie, [emptyOp]);
    expect((emptyRes.body as SyncPushResponse).rejected).toEqual([{ op_id: emptyOp.op_id, reason: 'invalid_field' }]);
  });

  it('rejects order_index: -1 as invalid_field; accepts order_index 0 and 1024', async () => {
    const cookie = await signUp('ex-order-index');
    const { dayId } = await seedRoutineAndDay(cookie, 'ex-order-index');

    const negOp = routineExerciseOp(randomUUID(), { routine_day_id: dayId, exercise_id: exerciseId, order_index: -1 });
    const negRes = await push(cookie, [negOp]);
    expect((negRes.body as SyncPushResponse).rejected).toEqual([{ op_id: negOp.op_id, reason: 'invalid_field' }]);

    const zeroId = randomUUID();
    const zeroRes = await push(cookie, [routineExerciseOp(zeroId, { routine_day_id: dayId, exercise_id: exerciseId, order_index: 0 })]);
    expect((zeroRes.body as SyncPushResponse).rejected).toEqual([]);
    expect((await routineExerciseRow(zeroId))?.order_index).toBe(0);

    const gapId = randomUUID();
    const gapRes = await push(cookie, [routineExerciseOp(gapId, { routine_day_id: dayId, exercise_id: exerciseId, order_index: 1024 })]);
    expect((gapRes.body as SyncPushResponse).rejected).toEqual([]);
    expect((await routineExerciseRow(gapId))?.order_index).toBe(1024);
  });

  it('accepts target_sets: null with every other target_* omitted, and stores five nulls — a blank target is unprescribed, never zero', async () => {
    const cookie = await signUp('ex-blank-targets');
    const { dayId } = await seedRoutineAndDay(cookie, 'ex-blank-targets');

    const exId = randomUUID();
    const op = routineExerciseOp(exId, { routine_day_id: dayId, exercise_id: exerciseId, order_index: 0, target_sets: null });
    const res = await push(cookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    const row = await routineExerciseRow(exId);
    expect(row?.target_sets).toBeNull();
    expect(row?.target_rep_min).toBeNull();
    expect(row?.target_rep_max).toBeNull();
    expect(row?.target_rir).toBeNull();
    expect(row?.target_rest_seconds).toBeNull();
  });

  it("rejects a routine_exercise PUT with target_rep_min: 'eight' as invalid_field", async () => {
    const cookie = await signUp('ex-bad-target-type');
    const { dayId } = await seedRoutineAndDay(cookie, 'ex-bad-target-type');

    const op = routineExerciseOp(randomUUID(), {
      routine_day_id: dayId,
      exercise_id: exerciseId,
      order_index: 0,
      target_rep_min: 'eight',
    });
    const res = await push(cookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);
  });

  it('a routine_day PATCH naming only order_index changes order_index and leaves name/is_rest_day untouched', async () => {
    const cookie = await signUp('day-patch-reorder');
    const { dayId } = await seedRoutineAndDay(cookie, 'day-patch-reorder');

    const before = await routineDayRow(dayId);
    expect(before?.order_index).toBe(0);
    expect(before?.name).toBe('Day 1');

    const patchOp = routineDayOp(dayId, { order_index: 2048 }, 'PATCH');
    const res = await push(cookie, [patchOp]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    const after = await routineDayRow(dayId);
    expect(after?.order_index).toBe(2048);
    expect(after?.name).toBe('Day 1');
    expect(after?.is_rest_day).toBe(false);
  });

  it('a DELETE for an owned routine_day is applied, the row (and its cascaded exercise) is gone, tombstones are written, and the routine itself still exists', async () => {
    const cookie = await signUp('day-delete');
    const { routineId, dayId } = await seedRoutineAndDay(cookie, 'day-delete');
    const exId = randomUUID();
    const exRes = await push(cookie, [routineExerciseOp(exId, { routine_day_id: dayId, exercise_id: exerciseId, order_index: 0 })]);
    expect((exRes.body as SyncPushResponse).rejected).toEqual([]);

    const deleteOp = routineDayOp(dayId, {}, 'DELETE');
    const res = await push(cookie, [deleteOp]);
    expect((res.body as SyncPushResponse).applied).toEqual([deleteOp.op_id]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    expect(await routineDayRow(dayId)).toBeUndefined();
    expect(await routineExerciseRow(exId)).toBeUndefined();
    expect(await routineRow(routineId)).toBeDefined();
    expect(await tombstoneCount([dayId, exId])).toBe(2);
  });

  it('a routine PATCH naming only progression_frozen sets the flag and leaves status/archived_at/name untouched, and a following PATCH naming only status leaves progression_frozen true', async () => {
    const cookie = await signUp('routine-freeze');
    const routineId = randomUUID();
    createdRoutineIds.push(routineId);
    const createRes = await push(cookie, [routineOp(routineId, { name: 'Freeze Me', status: 'draft' })]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const freezeOp = routineOp(routineId, { progression_frozen: true }, 'PATCH');
    const freezeRes = await push(cookie, [freezeOp]);
    expect((freezeRes.body as SyncPushResponse).rejected).toEqual([]);

    const afterFreeze = await routineRow(routineId);
    expect(afterFreeze?.status).toBe('draft');
    expect(afterFreeze?.name).toBe('Freeze Me');
    expect(afterFreeze?.archived_at).toBeNull();
    const { rows: frozenRows } = await pg.query('SELECT progression_frozen FROM routine WHERE id = $1', [routineId]);
    expect(frozenRows[0].progression_frozen).toBe(true);

    const statusOp = routineOp(routineId, { status: 'ready' }, 'PATCH');
    const statusRes = await push(cookie, [statusOp]);
    expect((statusRes.body as SyncPushResponse).rejected).toEqual([]);

    const afterStatus = await routineRow(routineId);
    expect(afterStatus?.status).toBe('ready');
    const { rows: stillFrozenRows } = await pg.query('SELECT progression_frozen FROM routine WHERE id = $1', [routineId]);
    expect(stillFrozenRows[0].progression_frozen).toBe(true);
  });

  it('a routine_day PATCH naming only archived_at applies the stamp and leaves name/order_index/is_rest_day untouched', async () => {
    const cookie = await signUp('day-patch-archive');
    const { dayId } = await seedRoutineAndDay(cookie, 'day-patch-archive');

    const archivedAt = new Date().toISOString();
    const patchOp = routineDayOp(dayId, { archived_at: archivedAt }, 'PATCH');
    const res = await push(cookie, [patchOp]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    const row = await routineDayRow(dayId);
    expect(row?.archived_at).not.toBeNull();
    expect(row?.name).toBe('Day 1');
    expect(row?.order_index).toBe(0);
    expect(row?.is_rest_day).toBe(false);
  });

  it('a second routine_day PATCH naming archived_at: null clears it and the row is still there — restore is not a re-create', async () => {
    const cookie = await signUp('day-patch-restore');
    const { dayId } = await seedRoutineAndDay(cookie, 'day-patch-restore');

    const archiveOp = routineDayOp(dayId, { archived_at: new Date().toISOString() }, 'PATCH');
    const archiveRes = await push(cookie, [archiveOp]);
    expect((archiveRes.body as SyncPushResponse).rejected).toEqual([]);
    expect((await routineDayRow(dayId))?.archived_at).not.toBeNull();

    const restoreOp = routineDayOp(dayId, { archived_at: null }, 'PATCH');
    const restoreRes = await push(cookie, [restoreOp]);
    expect((restoreRes.body as SyncPushResponse).rejected).toEqual([]);

    const row = await routineDayRow(dayId);
    expect(row).toBeDefined();
    expect(row?.archived_at).toBeNull();
  });

  it('archiving a routine_day emits no sync_tombstone rows and leaves its routine_exercise children present — an archive is not a delete', async () => {
    const cookie = await signUp('day-archive-no-cascade');
    const { dayId } = await seedRoutineAndDay(cookie, 'day-archive-no-cascade');
    const exId = randomUUID();
    const exRes = await push(cookie, [routineExerciseOp(exId, { routine_day_id: dayId, exercise_id: exerciseId, order_index: 0 })]);
    expect((exRes.body as SyncPushResponse).rejected).toEqual([]);

    const patchOp = routineDayOp(dayId, { archived_at: new Date().toISOString() }, 'PATCH');
    const res = await push(cookie, [patchOp]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    expect(await routineDayRow(dayId)).toBeDefined();
    expect(await routineExerciseRow(exId)).toBeDefined();
    expect(await tombstoneCount([dayId, exId])).toBe(0);
  });

  it('rejects a routine_day PATCH with a non-ISO archived_at as invalid_field and leaves the stored row unchanged', async () => {
    const cookie = await signUp('day-patch-bad-archived-at');
    const { dayId } = await seedRoutineAndDay(cookie, 'day-patch-bad-archived-at');

    const patchOp = routineDayOp(dayId, { archived_at: 'banana' }, 'PATCH');
    const res = await push(cookie, [patchOp]);
    expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: patchOp.op_id, reason: 'invalid_field' }]);

    const row = await routineDayRow(dayId);
    expect(row?.archived_at).toBeNull();
    expect(row?.name).toBe('Day 1');
  });
});

describe('user_preference sync (e2e)', () => {
  it('applies a PUT with id equal to the pushing user\'s id and an owned active_routine_id, and SELECT returns one row with that user_id and pointer', async () => {
    const cookie = await signUp('pref-put-insert');
    const userId = await realUserId(cookie, 'pref-put-insert');
    const { routineId } = await seedRoutineAndDay(cookie, 'pref-put-insert');

    const op = userPreferenceOp(userId, { weight_unit: 'kg', active_routine_id: routineId });
    const res = await push(cookie, [op]);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([op.op_id]);
    expect(body.rejected).toEqual([]);

    const row = await userPreferenceRow(userId);
    expect(row).toBeDefined();
    expect(row?.id).toBe(userId);
    expect(row?.user_id).toBe(userId);
    expect(row?.weight_unit).toBe('kg');
    expect(row?.active_routine_id).toBe(routineId);
  });

  it('a second PUT naming a different owned routine leaves exactly one row, now pointing at the second routine', async () => {
    const cookie = await signUp('pref-reactivate');
    const userId = await realUserId(cookie, 'pref-reactivate');
    const { routineId: routineA } = await seedRoutineAndDay(cookie, 'pref-reactivate-a');
    const { routineId: routineB } = await seedRoutineAndDay(cookie, 'pref-reactivate-b');

    const firstRes = await push(cookie, [userPreferenceOp(userId, { weight_unit: 'kg', active_routine_id: routineA })]);
    expect((firstRes.body as SyncPushResponse).rejected).toEqual([]);
    expect((await userPreferenceRow(userId))?.active_routine_id).toBe(routineA);

    const secondRes = await push(cookie, [userPreferenceOp(userId, { weight_unit: 'kg', active_routine_id: routineB })]);
    expect((secondRes.body as SyncPushResponse).rejected).toEqual([]);

    expect(await userPreferenceCount(userId)).toBe(1);
    expect((await userPreferenceRow(userId))?.active_routine_id).toBe(routineB);
  });

  it('rejects a PUT whose id is another user\'s id with not_owner, and that user\'s row is unchanged', async () => {
    const cookieA = await signUp('pref-owner-a');
    const cookieB = await signUp('pref-attacker-b');
    const userIdA = await realUserId(cookieA, 'pref-owner-a');

    const seedRes = await push(cookieA, [userPreferenceOp(userIdA, { weight_unit: 'kg' })]);
    expect((seedRes.body as SyncPushResponse).rejected).toEqual([]);

    const attackOp = userPreferenceOp(userIdA, { weight_unit: 'lb' });
    const res = await push(cookieB, [attackOp]);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: attackOp.op_id, reason: 'not_owner' }]);

    expect((await userPreferenceRow(userIdA))?.weight_unit).toBe('kg');
  });

  it('a PUT whose data names a different user_id is stored with user_id equal to the pusher', async () => {
    const pusherCookie = await signUp('pref-pusher');
    const otherCookie = await signUp('pref-named-other');
    const pusherUserId = await realUserId(pusherCookie, 'pref-pusher');
    const otherUserId = await realUserId(otherCookie, 'pref-named-other');
    expect(otherUserId).not.toBe(pusherUserId);

    const op = userPreferenceOp(pusherUserId, { weight_unit: 'kg', user_id: otherUserId });
    const res = await push(pusherCookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    const row = await userPreferenceRow(pusherUserId);
    expect(row?.user_id).toBe(pusherUserId);
  });

  it('rejects a PUT naming active_routine_id of a routine owned by a different user, and stores nothing', async () => {
    const ownerCookie = await signUp('pref-pointer-owner');
    const attackerCookie = await signUp('pref-pointer-attacker');
    const attackerUserId = await realUserId(attackerCookie, 'pref-pointer-attacker');
    const { routineId: foreignRoutineId } = await seedRoutineAndDay(ownerCookie, 'pref-pointer-owner');

    const op = userPreferenceOp(attackerUserId, { weight_unit: 'kg', active_routine_id: foreignRoutineId });
    const res = await push(attackerCookie, [op]);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    // not_owner: the pointer names a routine the pusher does not own — the same reason a direct
    // ownership takeover attempt is rejected, and terminal (retrying the identical op can never
    // succeed while the routine belongs to someone else).
    expect(body.rejected).toEqual([{ op_id: op.op_id, reason: 'not_owner' }]);
    expect(await userPreferenceRow(attackerUserId)).toBeUndefined();
  });

  it('a PATCH naming only active_routine_id: null clears the pointer and leaves weight_unit untouched', async () => {
    const cookie = await signUp('pref-clear-pointer');
    const userId = await realUserId(cookie, 'pref-clear-pointer');
    const { routineId } = await seedRoutineAndDay(cookie, 'pref-clear-pointer');

    const createRes = await push(cookie, [userPreferenceOp(userId, { weight_unit: 'lb', active_routine_id: routineId })]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const clearOp = userPreferenceOp(userId, { active_routine_id: null }, 'PATCH');
    const clearRes = await push(cookie, [clearOp]);
    expect((clearRes.body as SyncPushResponse).rejected).toEqual([]);

    const row = await userPreferenceRow(userId);
    expect(row?.active_routine_id).toBeNull();
    expect(row?.weight_unit).toBe('lb');
  });

  it('applies a batch containing one routine PUT and one user_preference PUT — two independent roots in one batch', async () => {
    const cookie = await signUp('pref-mixed-batch');
    const userId = await realUserId(cookie, 'pref-mixed-batch');
    // Activated pointer targets an already-existing owned routine (seeded via its own push) —
    // the unowned-pointer check reads the routine table directly, so a routine created in the SAME
    // batch as the op that activates it is a distinct, not-yet-covered case (Task 3 does not claim
    // same-batch create-then-activate; this test proves the two-independent-roots claim only).
    const { routineId: activatedRoutineId } = await seedRoutineAndDay(cookie, 'pref-mixed-batch-active');
    const newRoutineId = randomUUID();
    createdRoutineIds.push(newRoutineId);

    const batch: SyncCrudOp[] = [
      routineOp(newRoutineId, { name: 'Mixed Batch Program', status: 'draft' }),
      userPreferenceOp(userId, { weight_unit: 'kg', active_routine_id: activatedRoutineId }),
    ];
    const res = await push(cookie, batch);
    const body: SyncPushResponse = res.body;
    expect(body.rejected).toEqual([]);
    expect(body.applied).toHaveLength(2);

    expect(await routineRow(newRoutineId)).toBeDefined();
    expect((await userPreferenceRow(userId))?.active_routine_id).toBe(activatedRoutineId);
  });
});

describe('routine_cycle sync (e2e)', () => {
  it('applies a batch of [routine PUT, routine_cycle PUT]; SELECT returns one cycle row with the routine id, order_index, name and kind', async () => {
    const cookie = await signUp('cycle-forward');
    const routineId = randomUUID();
    const cycleId = randomUUID();
    createdRoutineIds.push(routineId);

    const batch: SyncCrudOp[] = [
      routineOp(routineId, { name: 'Cycle Forward', status: 'draft' }),
      routineCycleOp(cycleId, { routine_id: routineId, order_index: 0, name: 'Week 1', kind: 'training' }),
    ];
    const res = await push(cookie, batch);
    const body: SyncPushResponse = res.body;
    expect(body.rejected).toEqual([]);
    expect(body.applied).toHaveLength(2);

    const cycle = await routineCycleRow(cycleId);
    expect(cycle?.routine_id).toBe(routineId);
    expect(cycle?.order_index).toBe(0);
    expect(cycle?.name).toBe('Week 1');
    expect(cycle?.kind).toBe('training');
  });

  it('applies the same two ops pushed with the cycle first — AGGREGATE_RANK sorts the parent ahead of it', async () => {
    const cookie = await signUp('cycle-reverse');
    const routineId = randomUUID();
    const cycleId = randomUUID();
    createdRoutineIds.push(routineId);

    const batch: SyncCrudOp[] = [
      routineCycleOp(cycleId, { routine_id: routineId, order_index: 0, name: 'Week 1', kind: 'training' }),
      routineOp(routineId, { name: 'Cycle Reverse', status: 'draft' }),
    ];
    const res = await push(cookie, batch);
    const body: SyncPushResponse = res.body;
    expect(body.rejected).toEqual([]);
    expect(body.applied).toHaveLength(2);

    const cycle = await routineCycleRow(cycleId);
    expect(cycle?.routine_id).toBe(routineId);
  });

  it("rejects user B's routine_cycle PUT naming user A's routine_id with not_owner, and no row is created", async () => {
    const cookieA = await signUp('cycle-owner-a');
    const cookieB = await signUp('cycle-attacker-b');
    const routineId = randomUUID();
    createdRoutineIds.push(routineId);
    const createRes = await push(cookieA, [routineOp(routineId, { name: "A's Program", status: 'draft' })]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const cycleId = randomUUID();
    const attackOp = routineCycleOp(cycleId, { routine_id: routineId, order_index: 0, name: 'Hijack Cycle', kind: 'training' });
    const res = await push(cookieB, [attackOp]);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: attackOp.op_id, reason: 'not_owner' }]);
    expect(await routineCycleRow(cycleId)).toBeUndefined();
  });

  it('rejects a routine_cycle PUT naming a routine_id in neither the batch nor the database with missing_parent', async () => {
    const cookie = await signUp('cycle-missing-parent');
    const cycleId = randomUUID();
    const op = routineCycleOp(cycleId, { routine_id: randomUUID(), order_index: 0, name: 'Orphan Cycle', kind: 'training' });
    const res = await push(cookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: op.op_id, reason: 'missing_parent' }]);
    expect(await routineCycleRow(cycleId)).toBeUndefined();
  });

  it("rejects a routine_cycle PUT with kind:'rest' as invalid_field, and no row exists", async () => {
    const cookie = await signUp('cycle-bad-kind');
    const { routineId } = await seedRoutineAndDay(cookie, 'cycle-bad-kind');

    const cycleId = randomUUID();
    const op = routineCycleOp(cycleId, { routine_id: routineId, order_index: 0, name: 'Bad Kind', kind: 'rest' });
    const res = await push(cookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);
    expect(await routineCycleRow(cycleId)).toBeUndefined();
  });

  it("accepts each of 'training', 'deload' and 'time_off' as a valid kind — all three, not just one", async () => {
    const cookie = await signUp('cycle-all-kinds');
    const { routineId } = await seedRoutineAndDay(cookie, 'cycle-all-kinds');

    for (const kind of ['training', 'deload', 'time_off']) {
      const cycleId = randomUUID();
      const op = routineCycleOp(cycleId, { routine_id: routineId, order_index: 0, name: `Cycle ${kind}`, kind });
      const res = await push(cookie, [op]);
      expect((res.body as SyncPushResponse).rejected).toEqual([]);
      expect((await routineCycleRow(cycleId))?.kind).toBe(kind);
    }
  });

  it("stores duration_days: 7 for a time_off cycle, and stores null when duration_days is omitted — the server does not require a duration", async () => {
    const cookie = await signUp('cycle-duration');
    const { routineId } = await seedRoutineAndDay(cookie, 'cycle-duration');

    const withDurationId = randomUUID();
    const withDurationRes = await push(cookie, [
      routineCycleOp(withDurationId, { routine_id: routineId, order_index: 0, name: 'Time Off', kind: 'time_off', duration_days: 7 }),
    ]);
    expect((withDurationRes.body as SyncPushResponse).rejected).toEqual([]);
    expect((await routineCycleRow(withDurationId))?.duration_days).toBe(7);

    const withoutDurationId = randomUUID();
    const withoutDurationRes = await push(cookie, [
      routineCycleOp(withoutDurationId, { routine_id: routineId, order_index: 1, name: 'Time Off 2', kind: 'time_off' }),
    ]);
    expect((withoutDurationRes.body as SyncPushResponse).rejected).toEqual([]);
    expect((await routineCycleRow(withoutDurationId))?.duration_days).toBeNull();
  });

  it('rejects a routine_cycle PUT with duration_days: -1 as invalid_field', async () => {
    const cookie = await signUp('cycle-bad-duration');
    const { routineId } = await seedRoutineAndDay(cookie, 'cycle-bad-duration');

    const cycleId = randomUUID();
    const op = routineCycleOp(cycleId, { routine_id: routineId, order_index: 0, name: 'Bad Duration', kind: 'time_off', duration_days: -1 });
    const res = await push(cookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);
    expect(await routineCycleRow(cycleId)).toBeUndefined();
  });

  it('rejects a routine_cycle PUT with an empty name as invalid_field', async () => {
    const cookie = await signUp('cycle-empty-name');
    const { routineId } = await seedRoutineAndDay(cookie, 'cycle-empty-name');

    const cycleId = randomUUID();
    const op = routineCycleOp(cycleId, { routine_id: routineId, order_index: 0, name: '', kind: 'training' });
    const res = await push(cookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);
    expect(await routineCycleRow(cycleId)).toBeUndefined();
  });

  it('an existing cycle cannot be reparented onto another routine by a PUT naming a different routine_id — stored linkage wins', async () => {
    const cookie = await signUp('cycle-no-reparent');
    const { routineId: routineA } = await seedRoutineAndDay(cookie, 'cycle-no-reparent-a');
    const { routineId: routineB } = await seedRoutineAndDay(cookie, 'cycle-no-reparent-b');

    const cycleId = randomUUID();
    const createRes = await push(cookie, [
      routineCycleOp(cycleId, { routine_id: routineA, order_index: 0, name: 'Week 1', kind: 'training' }),
    ]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const moveOp = routineCycleOp(cycleId, { routine_id: routineB, order_index: 0, name: 'Week 1', kind: 'training' });
    const moveRes = await push(cookie, [moveOp]);
    expect((moveRes.body as SyncPushResponse).rejected).toEqual([]);

    const row = await routineCycleRow(cycleId);
    expect(row?.routine_id).toBe(routineA);
  });

  it('a routine_cycle PATCH naming only order_index changes the index and leaves name/kind untouched', async () => {
    const cookie = await signUp('cycle-patch-reorder');
    const { routineId } = await seedRoutineAndDay(cookie, 'cycle-patch-reorder');

    const cycleId = randomUUID();
    const createRes = await push(cookie, [
      routineCycleOp(cycleId, { routine_id: routineId, order_index: 0, name: 'Week 1', kind: 'deload' }),
    ]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const patchOp = routineCycleOp(cycleId, { order_index: 3072 }, 'PATCH');
    const res = await push(cookie, [patchOp]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    const after = await routineCycleRow(cycleId);
    expect(after?.order_index).toBe(3072);
    expect(after?.name).toBe('Week 1');
    expect(after?.kind).toBe('deload');
  });

  it('a DELETE for an owned routine_cycle is applied and the row is gone; the routine and its days survive', async () => {
    const cookie = await signUp('cycle-delete');
    const { routineId, dayId } = await seedRoutineAndDay(cookie, 'cycle-delete');
    const cycleId = randomUUID();
    const createRes = await push(cookie, [
      routineCycleOp(cycleId, { routine_id: routineId, order_index: 0, name: 'Week 1', kind: 'training' }),
    ]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const deleteOp = routineCycleOp(cycleId, {}, 'DELETE');
    const res = await push(cookie, [deleteOp]);
    expect((res.body as SyncPushResponse).applied).toEqual([deleteOp.op_id]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    expect(await routineCycleRow(cycleId)).toBeUndefined();
    expect(await routineRow(routineId)).toBeDefined();
    expect(await routineDayRow(dayId)).toBeDefined();
  });

  it('two cycles under one routine with the same order_index both apply — the server imposes no uniqueness', async () => {
    const cookie = await signUp('cycle-duplicate-order');
    const { routineId } = await seedRoutineAndDay(cookie, 'cycle-duplicate-order');

    const cycleAId = randomUUID();
    const cycleBId = randomUUID();
    const res = await push(cookie, [
      routineCycleOp(cycleAId, { routine_id: routineId, order_index: 0, name: 'Cycle A', kind: 'training' }),
      routineCycleOp(cycleBId, { routine_id: routineId, order_index: 0, name: 'Cycle B', kind: 'deload' }),
    ]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    expect((await routineCycleRow(cycleAId))?.order_index).toBe(0);
    expect((await routineCycleRow(cycleBId))?.order_index).toBe(0);
  });
});

describe('routine_exercise_cycle_target sync (e2e)', () => {
  it('applies a batch of [routine, routine_day, routine_exercise, routine_cycle, routine_exercise_cycle_target] in that order; SELECT returns one override row with the right parents and target values', async () => {
    const cookie = await signUp('cet-forward');
    const routineId = randomUUID();
    const dayId = randomUUID();
    const exId = randomUUID();
    const cycleId = randomUUID();
    const cetId = randomUUID();
    createdRoutineIds.push(routineId);

    const batch: SyncCrudOp[] = [
      routineOp(routineId, { name: 'CET Forward', status: 'draft' }),
      routineDayOp(dayId, { routine_id: routineId, order_index: 0, name: 'Day 1' }),
      routineExerciseOp(exId, { routine_day_id: dayId, exercise_id: exerciseId, order_index: 0 }),
      routineCycleOp(cycleId, { routine_id: routineId, order_index: 0, name: 'Week 1', kind: 'training' }),
      routineExerciseCycleTargetOp(cetId, { routine_exercise_id: exId, cycle_id: cycleId, target_sets: 5 }),
    ];
    const res = await push(cookie, batch);
    const body: SyncPushResponse = res.body;
    expect(body.rejected).toEqual([]);
    expect(body.applied).toHaveLength(5);

    const row = await routineExerciseCycleTargetRow(cetId);
    expect(row?.routine_exercise_id).toBe(exId);
    expect(row?.cycle_id).toBe(cycleId);
    expect(row?.target_sets).toBe(5);
  });

  it('applies the same five ops pushed in reverse order — rank 0/1/2/1/3 sorts every parent ahead of the override', async () => {
    const cookie = await signUp('cet-reverse');
    const routineId = randomUUID();
    const dayId = randomUUID();
    const exId = randomUUID();
    const cycleId = randomUUID();
    const cetId = randomUUID();
    createdRoutineIds.push(routineId);

    const batch: SyncCrudOp[] = [
      routineExerciseCycleTargetOp(cetId, { routine_exercise_id: exId, cycle_id: cycleId, target_sets: 5 }),
      routineCycleOp(cycleId, { routine_id: routineId, order_index: 0, name: 'Week 1', kind: 'training' }),
      routineExerciseOp(exId, { routine_day_id: dayId, exercise_id: exerciseId, order_index: 0 }),
      routineDayOp(dayId, { routine_id: routineId, order_index: 0, name: 'Day 1' }),
      routineOp(routineId, { name: 'CET Reverse', status: 'draft' }),
    ];
    const res = await push(cookie, batch);
    const body: SyncPushResponse = res.body;
    expect(body.rejected).toEqual([]);
    expect(body.applied).toHaveLength(5);

    const row = await routineExerciseCycleTargetRow(cetId);
    expect(row?.routine_exercise_id).toBe(exId);
    expect(row?.cycle_id).toBe(cycleId);
  });

  it("rejects user B's override naming user A's routine_exercise_id and A's cycle_id with not_owner, and no row is created", async () => {
    const cookieA = await signUp('cet-owner-a');
    const cookieB = await signUp('cet-attacker-b');
    const { routineExerciseId, cycleId } = await seedRoutineDayExerciseCycle(cookieA, 'cet-owner-a');

    const cetId = randomUUID();
    const attackOp = routineExerciseCycleTargetOp(cetId, {
      routine_exercise_id: routineExerciseId,
      cycle_id: cycleId,
      target_sets: 5,
    });
    const res = await push(cookieB, [attackOp]);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: attackOp.op_id, reason: 'not_owner' }]);
    expect(await routineExerciseCycleTargetRow(cetId)).toBeUndefined();
  });

  it("rejects an override naming user A's own routine_exercise_id and user B's cycle_id — the two chains resolve to different routines, and no row is created", async () => {
    const cookieA = await signUp('cet-mismatch-a');
    const cookieB = await signUp('cet-mismatch-b');
    const { routineExerciseId } = await seedRoutineDayExerciseCycle(cookieA, 'cet-mismatch-a');
    const { cycleId: cycleIdB } = await seedRoutineDayExerciseCycle(cookieB, 'cet-mismatch-b');

    const cetId = randomUUID();
    const mismatchOp = routineExerciseCycleTargetOp(cetId, {
      routine_exercise_id: routineExerciseId,
      cycle_id: cycleIdB,
      target_sets: 5,
    });
    const res = await push(cookieA, [mismatchOp]);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    // The implementation chooses not_owner: a mismatched dual-parent pair means the pusher named a
    // cycle it does not own, an ownership-boundary violation rather than an unresolvable parent —
    // see this plan's SUMMARY for the full reasoning.
    expect(body.rejected).toEqual([{ op_id: mismatchOp.op_id, reason: 'not_owner' }]);
    expect(await routineExerciseCycleTargetRow(cetId)).toBeUndefined();
  });

  it('rejects an override naming a routine_exercise_id in neither the batch nor the database with missing_parent, and the same for an unknown cycle_id', async () => {
    const cookie = await signUp('cet-missing-parent');
    const { cycleId } = await seedRoutineDayExerciseCycle(cookie, 'cet-missing-parent-1');

    const orphanExOp = routineExerciseCycleTargetOp(randomUUID(), {
      routine_exercise_id: randomUUID(),
      cycle_id: cycleId,
      target_sets: 5,
    });
    const resEx = await push(cookie, [orphanExOp]);
    expect((resEx.body as SyncPushResponse).rejected).toEqual([{ op_id: orphanExOp.op_id, reason: 'missing_parent' }]);

    const { routineExerciseId } = await seedRoutineDayExerciseCycle(cookie, 'cet-missing-parent-2');
    const orphanCycleOp = routineExerciseCycleTargetOp(randomUUID(), {
      routine_exercise_id: routineExerciseId,
      cycle_id: randomUUID(),
      target_sets: 5,
    });
    const resCycle = await push(cookie, [orphanCycleOp]);
    expect((resCycle.body as SyncPushResponse).rejected).toEqual([{ op_id: orphanCycleOp.op_id, reason: 'missing_parent' }]);
  });

  it('rejects an override with an absent or empty routine_exercise_id as invalid_field, and the same for cycle_id', async () => {
    const cookie = await signUp('cet-invalid-fk');
    const { routineExerciseId, cycleId } = await seedRoutineDayExerciseCycle(cookie, 'cet-invalid-fk');

    const absentExOp = routineExerciseCycleTargetOp(randomUUID(), { cycle_id: cycleId, target_sets: 5 });
    const absentExRes = await push(cookie, [absentExOp]);
    expect((absentExRes.body as SyncPushResponse).rejected).toEqual([{ op_id: absentExOp.op_id, reason: 'invalid_field' }]);

    const emptyExOp = routineExerciseCycleTargetOp(randomUUID(), { routine_exercise_id: '', cycle_id: cycleId, target_sets: 5 });
    const emptyExRes = await push(cookie, [emptyExOp]);
    expect((emptyExRes.body as SyncPushResponse).rejected).toEqual([{ op_id: emptyExOp.op_id, reason: 'invalid_field' }]);

    const absentCycleOp = routineExerciseCycleTargetOp(randomUUID(), { routine_exercise_id: routineExerciseId, target_sets: 5 });
    const absentCycleRes = await push(cookie, [absentCycleOp]);
    expect((absentCycleRes.body as SyncPushResponse).rejected).toEqual([{ op_id: absentCycleOp.op_id, reason: 'invalid_field' }]);

    const emptyCycleOp = routineExerciseCycleTargetOp(randomUUID(), { routine_exercise_id: routineExerciseId, cycle_id: '', target_sets: 5 });
    const emptyCycleRes = await push(cookie, [emptyCycleOp]);
    expect((emptyCycleRes.body as SyncPushResponse).rejected).toEqual([{ op_id: emptyCycleOp.op_id, reason: 'invalid_field' }]);
  });

  it('accepts target_sets: 5 with every other target_* omitted, and stores 5 plus four nulls', async () => {
    const cookie = await signUp('cet-blank-others');
    const { routineExerciseId, cycleId } = await seedRoutineDayExerciseCycle(cookie, 'cet-blank-others');

    const cetId = randomUUID();
    const op = routineExerciseCycleTargetOp(cetId, { routine_exercise_id: routineExerciseId, cycle_id: cycleId, target_sets: 5 });
    const res = await push(cookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    const row = await routineExerciseCycleTargetRow(cetId);
    expect(row?.target_sets).toBe(5);
    expect(row?.target_rep_min).toBeNull();
    expect(row?.target_rep_max).toBeNull();
    expect(row?.target_rir).toBeNull();
    expect(row?.target_rest_seconds).toBeNull();
  });

  it('rejects an override with target_rep_min: -1 as invalid_field', async () => {
    const cookie = await signUp('cet-bad-rep-min');
    const { routineExerciseId, cycleId } = await seedRoutineDayExerciseCycle(cookie, 'cet-bad-rep-min');

    const op = routineExerciseCycleTargetOp(randomUUID(), {
      routine_exercise_id: routineExerciseId,
      cycle_id: cycleId,
      target_rep_min: -1,
    });
    const res = await push(cookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);
  });

  // CR-03 (04-REVIEW.md). Two devices editing the same override offline is the ordinary
  // local-first case, not an edge case — the unique constraint exists because it happens. The
  // upsert used to arbitrate on the primary key only, so the second device's row violated the pair
  // constraint and threw, and the rollback took every other op in the same routine aggregate down
  // with it.
  it('a second override for the same (routine_exercise_id, cycle_id) pair with a different id merges into the stored row instead of throwing', async () => {
    const cookie = await signUp('cet-duplicate-pair');
    const { routineExerciseId, cycleId } = await seedRoutineDayExerciseCycle(cookie, 'cet-duplicate-pair');

    const firstId = randomUUID();
    const firstRes = await push(cookie, [
      routineExerciseCycleTargetOp(firstId, { routine_exercise_id: routineExerciseId, cycle_id: cycleId, target_sets: 5 }),
    ]);
    expect((firstRes.body as SyncPushResponse).rejected).toEqual([]);

    const dupeId = randomUUID();
    const dupeOp = routineExerciseCycleTargetOp(dupeId, { routine_exercise_id: routineExerciseId, cycle_id: cycleId, target_sets: 3 });
    const dupeRes = await push(cookie, [dupeOp]);
    expect((dupeRes.body as SyncPushResponse).rejected).toEqual([]);
    expect((dupeRes.body as SyncPushResponse).applied).toEqual([dupeOp.op_id]);

    // Exactly one row for the pair, still under the id the server already stored — the loser id is
    // never created, so the row's primary key does not flip between the two devices.
    const rowsForPair = await cycleTargetRowsForPair(routineExerciseId, cycleId);
    expect(rowsForPair).toHaveLength(1);
    expect(rowsForPair[0].id).toBe(firstId);
    expect(rowsForPair[0].target_sets).toBe(3);
    expect(await routineExerciseCycleTargetRow(dupeId)).toBeUndefined();
  });

  it("a duplicate-pair override pushed alongside the rest of an offline session no longer takes its siblings down — the new day, exercise and cycle all apply", async () => {
    const cookie = await signUp('cet-duplicate-pair-siblings');
    const { routineId, routineExerciseId, cycleId } = await seedRoutineDayExerciseCycle(cookie, 'cet-dupe-siblings');

    const firstId = randomUUID();
    const firstRes = await push(cookie, [
      routineExerciseCycleTargetOp(firstId, { routine_exercise_id: routineExerciseId, cycle_id: cycleId, target_sets: 5 }),
    ]);
    expect((firstRes.body as SyncPushResponse).rejected).toEqual([]);

    const newDayId = randomUUID();
    const newExerciseId = randomUUID();
    const newCycleId = randomUUID();
    const dupeOp = routineExerciseCycleTargetOp(randomUUID(), {
      routine_exercise_id: routineExerciseId,
      cycle_id: cycleId,
      target_sets: 2,
    });
    const res = await push(cookie, [
      routineDayOp(newDayId, { routine_id: routineId, order_index: 1, name: 'Day 2' }),
      routineExerciseOp(newExerciseId, { routine_day_id: newDayId, exercise_id: exerciseId, order_index: 0 }),
      routineCycleOp(newCycleId, { routine_id: routineId, order_index: 1, name: 'Week 2', kind: 'deload' }),
      dupeOp,
    ]);

    expect((res.body as SyncPushResponse).rejected).toEqual([]);
    expect(await routineDayRow(newDayId)).toBeDefined();
    expect(await routineExerciseRow(newExerciseId)).toBeDefined();
    expect(await routineCycleRow(newCycleId)).toBeDefined();
    expect((await cycleTargetRowsForPair(routineExerciseId, cycleId))[0].target_sets).toBe(2);
  });

  it('a PATCH naming target_sets: null (with the identity fields, required present on every op) sets that column to null and leaves the other four untouched', async () => {
    const cookie = await signUp('cet-patch-clear');
    const { routineExerciseId, cycleId } = await seedRoutineDayExerciseCycle(cookie, 'cet-patch-clear');

    const cetId = randomUUID();
    const createRes = await push(cookie, [
      routineExerciseCycleTargetOp(cetId, {
        routine_exercise_id: routineExerciseId,
        cycle_id: cycleId,
        target_sets: 5,
        target_rep_min: 8,
        target_rep_max: 12,
        target_rir: 2,
        target_rest_seconds: 120,
      }),
    ]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const patchOp = routineExerciseCycleTargetOp(
      cetId,
      { routine_exercise_id: routineExerciseId, cycle_id: cycleId, target_sets: null },
      'PATCH',
    );
    const patchRes = await push(cookie, [patchOp]);
    expect((patchRes.body as SyncPushResponse).rejected).toEqual([]);

    const after = await routineExerciseCycleTargetRow(cetId);
    expect(after?.target_sets).toBeNull();
    expect(after?.target_rep_min).toBe(8);
    expect(after?.target_rep_max).toBe(12);
    expect(after?.target_rir).toBe(2);
    expect(after?.target_rest_seconds).toBe(120);
  });

  it('an existing override cannot be reparented onto a different cycle by a PUT naming a different cycle_id — stored linkage wins', async () => {
    const cookie = await signUp('cet-no-reparent');
    const { routineId, routineExerciseId, cycleId: cycleA } = await seedRoutineDayExerciseCycle(cookie, 'cet-no-reparent');
    const cycleB = randomUUID();
    const cycleBRes = await push(cookie, [
      routineCycleOp(cycleB, { routine_id: routineId, order_index: 1, name: 'Week 2', kind: 'training' }),
    ]);
    expect((cycleBRes.body as SyncPushResponse).rejected).toEqual([]);

    const cetId = randomUUID();
    const createRes = await push(cookie, [
      routineExerciseCycleTargetOp(cetId, { routine_exercise_id: routineExerciseId, cycle_id: cycleA, target_sets: 5 }),
    ]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const moveOp = routineExerciseCycleTargetOp(cetId, { routine_exercise_id: routineExerciseId, cycle_id: cycleB, target_sets: 5 });
    const moveRes = await push(cookie, [moveOp]);
    expect((moveRes.body as SyncPushResponse).rejected).toEqual([]);

    const row = await routineExerciseCycleTargetRow(cetId);
    expect(row?.cycle_id).toBe(cycleA);
  });

  it('deleting the cycle applies, cascades away the override rows, and writes one sync_tombstone row per cascaded override', async () => {
    const cookie = await signUp('cet-cycle-delete');
    const { routineExerciseId, cycleId } = await seedRoutineDayExerciseCycle(cookie, 'cet-cycle-delete');

    const cetId = randomUUID();
    const createRes = await push(cookie, [
      routineExerciseCycleTargetOp(cetId, { routine_exercise_id: routineExerciseId, cycle_id: cycleId, target_sets: 5 }),
    ]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const deleteOp = routineCycleOp(cycleId, {}, 'DELETE');
    const res = await push(cookie, [deleteOp]);
    expect((res.body as SyncPushResponse).applied).toEqual([deleteOp.op_id]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    expect(await routineExerciseCycleTargetRow(cetId)).toBeUndefined();
    expect(await tombstoneCount([cycleId, cetId])).toBe(2);
  });

  it('deleting the exercise applies, cascades away its override rows, and writes one sync_tombstone row per cascaded override', async () => {
    const cookie = await signUp('cet-exercise-delete');
    const { routineExerciseId, cycleId } = await seedRoutineDayExerciseCycle(cookie, 'cet-exercise-delete');

    const cetId = randomUUID();
    const createRes = await push(cookie, [
      routineExerciseCycleTargetOp(cetId, { routine_exercise_id: routineExerciseId, cycle_id: cycleId, target_sets: 5 }),
    ]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const deleteOp = routineExerciseOp(routineExerciseId, {}, 'DELETE');
    const res = await push(cookie, [deleteOp]);
    expect((res.body as SyncPushResponse).applied).toEqual([deleteOp.op_id]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    expect(await routineExerciseCycleTargetRow(cetId)).toBeUndefined();
    expect(await tombstoneCount([routineExerciseId, cetId])).toBe(2);
  });

  // The transitive three-level cascade (day -> exercise -> override). The shipped day-delete case
  // seeds no override, so it asserts two tombstones and never three; nothing in CI watched the
  // deepest, most fragile path in the override model until now (04-VERIFICATION.md).
  it('deleting the day cascades two levels — the exercise AND its override are both gone and both tombstoned, three tombstones in all', async () => {
    const cookie = await signUp('cet-day-cascade');
    const { dayId, routineExerciseId, cycleId } = await seedRoutineDayExerciseCycle(cookie, 'cet-day-cascade');
    const cetId = randomUUID();
    const createRes = await push(cookie, [
      routineExerciseCycleTargetOp(cetId, { routine_exercise_id: routineExerciseId, cycle_id: cycleId, target_sets: 4 }),
    ]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const deleteOp = routineDayOp(dayId, {}, 'DELETE');
    const res = await push(cookie, [deleteOp]);
    expect((res.body as SyncPushResponse).applied).toEqual([deleteOp.op_id]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    expect(await routineDayRow(dayId)).toBeUndefined();
    expect(await routineExerciseRow(routineExerciseId)).toBeUndefined();
    expect(await routineExerciseCycleTargetRow(cetId)).toBeUndefined();
    expect(await tombstoneCount([dayId, routineExerciseId, cetId])).toBe(3);
    // The cycle hangs off the routine, not the day — it must survive.
    expect(await routineCycleRow(cycleId)).toBeDefined();
  });

  // CR-04 (04-REVIEW.md). missing_parent is non-terminal, so the connector leaves the crud
  // transaction queued and PowerSync re-sends it forever. When the parent is permanently gone that
  // retry can never succeed, and because the queue is ordered nothing behind it uploads again
  // either — the device's sync is dead until its local database is wiped.
  it("rejects an override whose routine_exercise was cascade-deleted on another device as deleted, not missing_parent", async () => {
    const cookie = await signUp('cet-orphan-terminal');
    const { dayId, routineExerciseId, cycleId } = await seedRoutineDayExerciseCycle(cookie, 'cet-orphan-terminal');

    const deleteRes = await push(cookie, [routineDayOp(dayId, {}, 'DELETE')]);
    expect((deleteRes.body as SyncPushResponse).rejected).toEqual([]);

    // The offline device never saw the delete and pushes an override for the vanished exercise.
    const cetId = randomUUID();
    const staleOp = routineExerciseCycleTargetOp(cetId, {
      routine_exercise_id: routineExerciseId,
      cycle_id: cycleId,
      target_sets: 3,
    });
    const res = await push(cookie, [staleOp]);

    expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: staleOp.op_id, reason: 'deleted' }]);
    expect(isTerminalRejection('deleted', 'routine_exercise_cycle_target')).toBe(true);
    expect(await routineExerciseCycleTargetRow(cetId)).toBeUndefined();
  });

  it("rejects a routine_exercise whose routine_day was deleted on another device as deleted, not missing_parent", async () => {
    const cookie = await signUp('re-orphan-terminal');
    const { dayId } = await seedRoutineAndDay(cookie, 're-orphan-terminal');

    const deleteRes = await push(cookie, [routineDayOp(dayId, {}, 'DELETE')]);
    expect((deleteRes.body as SyncPushResponse).rejected).toEqual([]);

    const staleId = randomUUID();
    const staleOp = routineExerciseOp(staleId, { routine_day_id: dayId, exercise_id: exerciseId, order_index: 0 });
    const res = await push(cookie, [staleOp]);

    expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: staleOp.op_id, reason: 'deleted' }]);
    expect(await routineExerciseRow(staleId)).toBeUndefined();
  });

  it('a DELETE for an owned override applies and the row is gone; the exercise and the cycle both survive', async () => {
    const cookie = await signUp('cet-direct-delete');
    const { routineExerciseId, cycleId } = await seedRoutineDayExerciseCycle(cookie, 'cet-direct-delete');

    const cetId = randomUUID();
    const createRes = await push(cookie, [
      routineExerciseCycleTargetOp(cetId, { routine_exercise_id: routineExerciseId, cycle_id: cycleId, target_sets: 5 }),
    ]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const deleteOp = routineExerciseCycleTargetOp(cetId, {}, 'DELETE');
    const res = await push(cookie, [deleteOp]);
    expect((res.body as SyncPushResponse).applied).toEqual([deleteOp.op_id]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    expect(await routineExerciseCycleTargetRow(cetId)).toBeUndefined();
    expect(await routineExerciseRow(routineExerciseId)).toBeDefined();
    expect(await routineCycleRow(cycleId)).toBeDefined();
  });
});

const BASE_TARGETS = {
  target_sets: 3,
  target_rep_min: 8,
  target_rep_max: 12,
  target_rir: 1,
  target_rest_seconds: 120,
};

// What the client's own resolveTarget would freeze for a session in this cycle: the override's
// target_sets over the base's other four.
const RESOLVED_TARGETS = { ...BASE_TARGETS, target_sets: 5 };

function sessionExerciseOp(id: string, sessionId: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'session_exercise', id, data: { session_id: sessionId, ...data } };
}

interface SessionExerciseRow {
  id: string;
  session_id: string;
  routine_exercise_id: string | null;
  target_sets: number | null;
  target_rep_min: number | null;
  target_rep_max: number | null;
  target_rir: number | null;
  target_rest_seconds: number | null;
}

async function sessionExerciseRow(id: string): Promise<SessionExerciseRow | undefined> {
  const { rows } = await pg.query(
    `SELECT id, session_id, routine_exercise_id, target_sets, target_rep_min, target_rep_max,
            target_rir, target_rest_seconds
     FROM session_exercise WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function workoutSessionRoutineDayId(id: string): Promise<string | null | undefined> {
  const { rows } = await pg.query('SELECT routine_day_id FROM workout_session WHERE id = $1', [id]);
  return rows[0]?.routine_day_id;
}

function targetsOf(row: SessionExerciseRow | undefined) {
  return {
    target_sets: row?.target_sets,
    target_rep_min: row?.target_rep_min,
    target_rep_max: row?.target_rep_max,
    target_rir: row?.target_rir,
    target_rest_seconds: row?.target_rest_seconds,
  };
}

interface SnapshotScenario {
  routineId: string;
  dayId: string;
  routineExerciseId: string;
  cycleId: string;
  cetId: string;
  sessionId: string;
  sessionExerciseId: string;
}

// A whole program with one cycle override, plus one workout logged against it — the shared
// starting point for every PROG-11 case: the session_exercise row carries the RESOLVED targets,
// already frozen, before any edit happens.
async function seedSnapshotScenario(cookie: string, tag: string): Promise<SnapshotScenario> {
  const routineId = randomUUID();
  const dayId = randomUUID();
  const routineExerciseId = randomUUID();
  const cycleId = randomUUID();
  const cetId = randomUUID();
  createdRoutineIds.push(routineId);

  const programRes = await push(cookie, [
    routineOp(routineId, { name: `Snapshot ${tag}`, status: 'draft' }),
    routineDayOp(dayId, { routine_id: routineId, order_index: 0, name: 'Day 1' }),
    routineExerciseOp(routineExerciseId, {
      routine_day_id: dayId,
      exercise_id: exerciseId,
      order_index: 0,
      ...BASE_TARGETS,
    }),
    routineCycleOp(cycleId, { routine_id: routineId, order_index: 0, name: 'Week 1', kind: 'training' }),
    routineExerciseCycleTargetOp(cetId, { routine_exercise_id: routineExerciseId, cycle_id: cycleId, target_sets: 5 }),
  ]);
  expect((programRes.body as SyncPushResponse).rejected).toEqual([]);

  const sessionId = randomUUID();
  const sessionExerciseId = randomUUID();
  const sessionRes = await push(cookie, [
    workoutSessionOp(sessionId, {
      data: {
        routine_day_id: dayId,
        started_at: new Date().toISOString(),
        status: 'in_progress',
        timezone: 'UTC',
        local_date: new Date().toISOString().slice(0, 10),
      },
    }),
    sessionExerciseOp(sessionExerciseId, sessionId, {
      exercise_id: exerciseId,
      order_index: 0,
      routine_exercise_id: routineExerciseId,
      ...RESOLVED_TARGETS,
    }),
  ]);
  expect((sessionRes.body as SyncPushResponse).rejected).toEqual([]);

  return { routineId, dayId, routineExerciseId, cycleId, cetId, sessionId, sessionExerciseId };
}

describe('PROG-11 — editing a program never corrupts a workout already logged against it (e2e)', () => {
  it('applies the whole program, its cycle override, and a session_exercise carrying the resolved targets', async () => {
    const cookie = await signUp('prog11-seed');
    const { sessionExerciseId, routineExerciseId } = await seedSnapshotScenario(cookie, 'prog11-seed');

    const row = await sessionExerciseRow(sessionExerciseId);
    expect(targetsOf(row)).toEqual(RESOLVED_TARGETS);
    expect(row?.routine_exercise_id).toBe(routineExerciseId);
  });

  it("leaves the snapshot untouched when the routine_exercise's five base targets are all rewritten", async () => {
    const cookie = await signUp('prog11-base-edit');
    const { routineExerciseId, sessionExerciseId } = await seedSnapshotScenario(cookie, 'prog11-base-edit');

    const patchOp = routineExerciseOp(
      routineExerciseId,
      {
        exercise_id: exerciseId,
        target_sets: 8,
        target_rep_min: 3,
        target_rep_max: 5,
        target_rir: 0,
        target_rest_seconds: 240,
      },
      'PATCH',
    );
    const res = await push(cookie, [patchOp]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    expect((await routineExerciseRow(routineExerciseId))?.target_sets).toBe(8);
    expect(targetsOf(await sessionExerciseRow(sessionExerciseId))).toEqual(RESOLVED_TARGETS);
  });

  it('leaves the snapshot untouched when the cycle override is edited', async () => {
    const cookie = await signUp('prog11-override-edit');
    const { routineExerciseId, cycleId, cetId, sessionExerciseId } = await seedSnapshotScenario(cookie, 'prog11-override-edit');

    const patchOp = routineExerciseCycleTargetOp(
      cetId,
      { routine_exercise_id: routineExerciseId, cycle_id: cycleId, target_sets: 9 },
      'PATCH',
    );
    const res = await push(cookie, [patchOp]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    expect((await routineExerciseCycleTargetRow(cetId))?.target_sets).toBe(9);
    expect(targetsOf(await sessionExerciseRow(sessionExerciseId))).toEqual(RESOLVED_TARGETS);
  });

  it("leaves the snapshot at the override's value — not the base's — when the override is deleted", async () => {
    const cookie = await signUp('prog11-override-delete');
    const { cetId, sessionExerciseId } = await seedSnapshotScenario(cookie, 'prog11-override-delete');

    const deleteOp = routineExerciseCycleTargetOp(cetId, {}, 'DELETE');
    const res = await push(cookie, [deleteOp]);
    expect((res.body as SyncPushResponse).applied).toEqual([deleteOp.op_id]);

    expect(await routineExerciseCycleTargetRow(cetId)).toBeUndefined();
    const row = await sessionExerciseRow(sessionExerciseId);
    expect(row).toBeDefined();
    expect(targetsOf(row)).toEqual(RESOLVED_TARGETS);
  });

  // The load-bearing case. A real foreign key from session_exercise.routine_exercise_id or from
  // workout_session.routine_day_id would turn this ordinary program edit into either a cascade
  // that deletes a logged workout or a constraint violation that blocks the edit. Both columns are
  // plain text for exactly this reason (apps/api/src/db/schema/session.ts).
  it('keeps the logged session and its snapshot when the routine_day is deleted, leaving routine_day_id dangling', async () => {
    const cookie = await signUp('prog11-day-delete');
    const { dayId, routineExerciseId, sessionId, sessionExerciseId } = await seedSnapshotScenario(cookie, 'prog11-day-delete');

    const deleteOp = routineDayOp(dayId, {}, 'DELETE');
    const res = await push(cookie, [deleteOp]);
    expect((res.body as SyncPushResponse).applied).toEqual([deleteOp.op_id]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    expect(await routineDayRow(dayId)).toBeUndefined();
    expect(await routineExerciseRow(routineExerciseId)).toBeUndefined();

    const row = await sessionExerciseRow(sessionExerciseId);
    expect(targetsOf(row)).toEqual(RESOLVED_TARGETS);
    expect(row?.routine_exercise_id).toBe(routineExerciseId);
    expect(await workoutSessionRow(sessionId)).toBeDefined();
    expect(await workoutSessionRoutineDayId(sessionId)).toBe(dayId);
  });

  it('leaves the snapshot untouched when the routine is archived', async () => {
    const cookie = await signUp('prog11-archive');
    const { routineId, sessionExerciseId } = await seedSnapshotScenario(cookie, 'prog11-archive');

    const patchOp = routineOp(routineId, { archived_at: new Date().toISOString() }, 'PATCH');
    const res = await push(cookie, [patchOp]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    expect((await routineRow(routineId))?.archived_at).not.toBeNull();
    expect(targetsOf(await sessionExerciseRow(sessionExerciseId))).toEqual(RESOLVED_TARGETS);
  });
});
