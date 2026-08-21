import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import { SYNC_PUSH_PATH, type SyncCrudOp, type SyncCrudOpType, type SyncPushRequest, type SyncPushResponse } from '@fitness/api-contracts';

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
}

async function routineDayRow(id: string): Promise<RoutineDayRow | undefined> {
  const { rows } = await pg.query(
    'SELECT id, routine_id, order_index, name, is_rest_day FROM routine_day WHERE id = $1',
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
