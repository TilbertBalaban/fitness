import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import { SYNC_PUSH_PATH, type SyncCrudOp, type SyncPushRequest, type SyncPushResponse } from '@fitness/api-contracts';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as sync-push.e2e-spec.ts / concurrent-edit.e2e-spec.ts: @thallesp/nestjs-better-auth
// and better-auth are ESM-only, so this suite drives the built artifact over real HTTP rather than
// an in-process testing module.
const AUTH_BASE_PATH = '/v1/auth';
const PASSWORD = 'correct-horse-battery-staple';

let api: ChildProcess;
let baseUrl: string;
let pg: Client;
const createdEmails: string[] = [];
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
  const email = `e2e-null-weight-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

function workoutSessionOp(id: string): SyncCrudOp {
  return {
    op_id: randomUUID(),
    op: 'PUT',
    type: 'workout_session',
    id,
    data: {
      started_at: new Date('2026-06-15T20:00:00Z').toISOString(),
      status: 'in_progress',
      timezone: 'America/New_York',
      local_date: '2026-06-15',
    },
  };
}

function sessionExerciseOp(id: string, sessionId: string): SyncCrudOp {
  return {
    op_id: randomUUID(),
    op: 'PUT',
    type: 'session_exercise',
    id,
    data: {
      session_id: sessionId,
      exercise_id: exerciseId,
      order_index: 0,
      target_sets: 3,
      target_rep_min: 8,
      target_rep_max: 12,
    },
  };
}

interface LoggedSetFields {
  session_exercise_id?: string;
  set_index?: number;
  set_type?: string;
  weight_kg?: string | null;
  reps?: number;
  rir?: number | null;
  completed?: boolean;
}

function loggedSetOp(id: string, fields: LoggedSetFields, overrides: Partial<SyncCrudOp> = {}): SyncCrudOp {
  return {
    op_id: randomUUID(),
    op: 'PUT',
    type: 'logged_set',
    id,
    data: {
      set_type: 'normal',
      logged_at: new Date().toISOString(),
      ...fields,
    },
    ...overrides,
  };
}

async function seedSession(cookie: string): Promise<{ sessionId: string; se1: string }> {
  const sessionId = randomUUID();
  const se1 = randomUUID();
  const res = await push(cookie, [workoutSessionOp(sessionId), sessionExerciseOp(se1, sessionId)]);
  expect((res.body as SyncPushResponse).rejected).toEqual([]);
  return { sessionId, se1 };
}

async function loggedSetWeight(id: string): Promise<{ weight_kg: string | null } | undefined> {
  const { rows } = await pg.query('SELECT weight_kg FROM logged_set WHERE id = $1', [id]);
  return rows[0];
}

async function conflictLogRowsFor(rowId: string): Promise<{ losing_value: Record<string, unknown>; winning_value: Record<string, unknown> }[]> {
  const { rows } = await pg.query(
    'SELECT losing_value, winning_value FROM sync_conflict_log WHERE row_id = $1 ORDER BY detected_at ASC',
    [rowId],
  );
  return rows;
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
     VALUES ($1, 'Pull-Up', 'bodyweight', false, false, 'seed')`,
    [exerciseId],
  );
}, 60000);

afterAll(async () => {
  if (pg) {
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

describe('Null-weight round trip (e2e)', () => {
  it('PUT with weight_kg absent from data stores SQL NULL, and a read returns null', async () => {
    const cookie = await signUp('put-absent');
    const { se1 } = await seedSession(cookie);
    const setId = randomUUID();

    const op = loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, reps: 8, completed: true });
    const res = await push(cookie, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([op.op_id]);
    expect(body.rejected).toEqual([]);

    const row = await loggedSetWeight(setId);
    expect(row?.weight_kg).toBeNull();
  });

  it("PUT with weight_kg of '0' stores 0.000, not null", async () => {
    const cookie = await signUp('put-zero');
    const { se1 } = await seedSession(cookie);
    const setId = randomUUID();

    const op = loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '0', reps: 8, completed: true });
    const res = await push(cookie, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([op.op_id]);
    expect(body.rejected).toEqual([]);

    const row = await loggedSetWeight(setId);
    expect(row?.weight_kg).toBe('0.000');
  });

  it('a null-weight set and a zero-weight set pushed together both apply and stay distinct after the round trip', async () => {
    const cookie = await signUp('batch-null-and-zero');
    const { se1 } = await seedSession(cookie);
    const nullSetId = randomUUID();
    const zeroSetId = randomUUID();

    const nullOp = loggedSetOp(nullSetId, { session_exercise_id: se1, set_index: 1, reps: 8, completed: true });
    const zeroOp = loggedSetOp(zeroSetId, { session_exercise_id: se1, set_index: 2, weight_kg: '0', reps: 8, completed: true });
    const res = await push(cookie, [nullOp, zeroOp]);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual(expect.arrayContaining([nullOp.op_id, zeroOp.op_id]));
    expect(body.rejected).toEqual([]);

    const nullRow = await loggedSetWeight(nullSetId);
    const zeroRow = await loggedSetWeight(zeroSetId);
    expect(nullRow?.weight_kg).toBeNull();
    expect(zeroRow?.weight_kg).toBe('0.000');
    expect(zeroRow?.weight_kg).not.toBeNull();
  });

  it('PATCH with weight_kg explicitly null is applied, not rejected, and the stored weight becomes NULL', async () => {
    const cookie = await signUp('patch-explicit-null');
    const { se1 } = await seedSession(cookie);
    const setId = randomUUID();

    const initial = loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '40.000', reps: 5, completed: true });
    const initialRes = await push(cookie, [initial]);
    expect((initialRes.body as SyncPushResponse).rejected).toEqual([]);
    expect((await loggedSetWeight(setId))?.weight_kg).toBe('40.000');

    const patchOp: SyncCrudOp = {
      op_id: randomUUID(),
      op: 'PATCH',
      type: 'logged_set',
      id: setId,
      data: { weight_kg: null },
    };
    const patchRes = await push(cookie, [patchOp]);

    const body: SyncPushResponse = patchRes.body;
    expect(body.applied).toEqual([patchOp.op_id]);
    expect(body.rejected).toEqual([]);
    expect((await loggedSetWeight(setId))?.weight_kg).toBeNull();
  });

  it('PATCH changing only reps, with weight_kg absent, leaves the previously-stored weight byte-identical', async () => {
    const cookie = await signUp('patch-reps-only');
    const { se1 } = await seedSession(cookie);
    const setId = randomUUID();

    const initial = loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '52.500', reps: 5, completed: true });
    const initialRes = await push(cookie, [initial]);
    expect((initialRes.body as SyncPushResponse).rejected).toEqual([]);
    const before = await loggedSetWeight(setId);
    expect(before?.weight_kg).toBe('52.500');

    const patchOp: SyncCrudOp = {
      op_id: randomUUID(),
      op: 'PATCH',
      type: 'logged_set',
      id: setId,
      data: { reps: 9 },
    };
    const patchRes = await push(cookie, [patchOp]);
    expect((patchRes.body as SyncPushResponse).rejected).toEqual([]);

    const after = await loggedSetWeight(setId);
    expect(after?.weight_kg).toBe(before?.weight_kg);
  });

  it("PUT with weight_kg of '-5' is rejected invalid_field", async () => {
    const cookie = await signUp('put-negative');
    const { se1 } = await seedSession(cookie);
    const setId = randomUUID();

    const op = loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '-5', reps: 8, completed: true });
    const res = await push(cookie, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);

    const row = await loggedSetWeight(setId);
    expect(row).toBeUndefined();
  });

  it("PUT with weight_kg of 'abc' is rejected invalid_field", async () => {
    const cookie = await signUp('put-non-numeric');
    const { se1 } = await seedSession(cookie);
    const setId = randomUUID();

    const op = loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: 'abc', reps: 8, completed: true });
    const res = await push(cookie, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);

    const row = await loggedSetWeight(setId);
    expect(row).toBeUndefined();
  });

  it('a conflict-logged overwrite with an incoming null weight records a real JSON null in sync_conflict_log, not the string "null"', async () => {
    const cookie = await signUp('conflict-null-weight');
    const { se1 } = await seedSession(cookie);
    const setId = randomUUID();

    const initial = loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '40.000', reps: 5, rir: 2, completed: true });
    const initialRes = await push(cookie, [initial]);
    expect((initialRes.body as SyncPushResponse).rejected).toEqual([]);

    // The stored row must already be completed=true for resolveConflict to log — an in-progress
    // set is still being edited by definition (conflict-policy.ts) and logs nothing.
    const overwrite = loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: null, reps: 5, rir: 2, completed: true });
    const overwriteRes = await push(cookie, [overwrite]);
    expect((overwriteRes.body as SyncPushResponse).rejected).toEqual([]);

    expect((await loggedSetWeight(setId))?.weight_kg).toBeNull();

    const conflicts = await conflictLogRowsFor(setId);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].losing_value.weight_kg).toBe('40.000');
    expect(conflicts[0].winning_value.weight_kg).toBeNull();
    // toBeNull already proves this, but the plan's failure mode is specifically the stringified
    // "null" — assert the type directly so a regression back to String(null) fails loudly.
    expect(typeof conflicts[0].winning_value.weight_kg).not.toBe('string');
  });
});
