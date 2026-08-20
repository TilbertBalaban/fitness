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
}, 60000);

afterAll(async () => {
  if (pg) {
    if (createdRoutineIds.length > 0) {
      await pg.query('DELETE FROM routine WHERE id = ANY($1::text[])', [createdRoutineIds]);
    }
    if (createdEmails.length > 0) {
      await pg.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [createdEmails]);
    }
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
