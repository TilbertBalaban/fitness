import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import { SYNC_PUSH_PATH, type SyncCrudOp, type SyncPushRequest, type SyncPushResponse } from '@fitness/api-contracts';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as sync-push.e2e-spec.ts / null-weight.e2e-spec.ts: @thallesp/nestjs-better-auth and
// better-auth are ESM-only, so this suite drives the built artifact over real HTTP rather than an
// in-process testing module.
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
  const email = `e2e-poison-pill-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

interface SessionExerciseFields {
  session_id: string;
  exercise_id?: string | null;
  order_index?: number;
  target_sets?: number | null;
  target_rep_min?: number | null;
  target_rep_max?: number | null;
  target_rir_min?: number | null;
  target_rir_max?: number | null;
  target_rest_seconds?: number | null;
}

function sessionExerciseOp(id: string, fields: SessionExerciseFields): SyncCrudOp {
  return {
    op_id: randomUUID(),
    op: 'PUT',
    type: 'session_exercise',
    id,
    data: {
      exercise_id: exerciseId,
      order_index: 0,
      ...fields,
    },
  };
}

async function sessionExerciseRow(id: string): Promise<{ id: string } | undefined> {
  const { rows } = await pg.query('SELECT id FROM session_exercise WHERE id = $1', [id]);
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

  exerciseId = randomUUID();
  await pg.query(
    `INSERT INTO exercise (id, name, load_type, is_custom, unilateral, source)
     VALUES ($1, 'Barbell Row', 'external', false, false, 'seed')`,
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

describe('Poison-pill isolation and session_exercise validation (e2e)', () => {
  it('rejects a session_exercise PUT with an empty exercise_id as invalid_field, and inserts no row', async () => {
    const cookie = await signUp('empty-exercise-id');
    const sessionId = randomUUID();
    const seId = randomUUID();
    const seOp = sessionExerciseOp(seId, { session_id: sessionId, exercise_id: '' });

    const res = await push(cookie, [workoutSessionOp(sessionId), seOp]);

    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    const body: SyncPushResponse = res.body;
    expect(body.rejected).toContainEqual({ op_id: seOp.op_id, reason: 'invalid_field' });

    const row = await sessionExerciseRow(seId);
    expect(row).toBeUndefined();
  });

  it('rejects a session_exercise PUT with a negative order_index as invalid_field', async () => {
    const cookie = await signUp('negative-order-index');
    const sessionId = randomUUID();
    const seId = randomUUID();
    const seOp = sessionExerciseOp(seId, { session_id: sessionId, order_index: -1 });

    const res = await push(cookie, [workoutSessionOp(sessionId), seOp]);

    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    const body: SyncPushResponse = res.body;
    expect(body.rejected).toContainEqual({ op_id: seOp.op_id, reason: 'invalid_field' });
    expect(await sessionExerciseRow(seId)).toBeUndefined();
  });

  it('rejects a session_exercise PUT with a non-integer order_index as invalid_field', async () => {
    const cookie = await signUp('noninteger-order-index');
    const sessionId = randomUUID();
    const seId = randomUUID();
    const seOp: SyncCrudOp = {
      op_id: randomUUID(),
      op: 'PUT',
      type: 'session_exercise',
      id: seId,
      data: { session_id: sessionId, exercise_id: exerciseId, order_index: 1.5 },
    };

    const res = await push(cookie, [workoutSessionOp(sessionId), seOp]);

    const body: SyncPushResponse = res.body;
    expect(body.rejected).toContainEqual({ op_id: seOp.op_id, reason: 'invalid_field' });
    expect(await sessionExerciseRow(seId)).toBeUndefined();
  });

  it('rejects a session_exercise PUT with a negative target_sets as invalid_field, and accepts an explicit null for the same field', async () => {
    const cookie = await signUp('negative-target');
    const sessionId = randomUUID();
    const badId = randomUUID();
    const nullId = randomUUID();
    const badOp = sessionExerciseOp(badId, { session_id: sessionId, target_sets: -3 });
    const nullOp = sessionExerciseOp(nullId, {
      session_id: sessionId,
      target_sets: null,
      target_rep_min: null,
      target_rep_max: null,
      target_rir_min: null,
      target_rir_max: null,
      target_rest_seconds: null,
    });

    const res = await push(cookie, [workoutSessionOp(sessionId), badOp, nullOp]);

    const body: SyncPushResponse = res.body;
    expect(body.rejected).toContainEqual({ op_id: badOp.op_id, reason: 'invalid_field' });
    expect(body.applied).toContain(nullOp.op_id);
    expect(await sessionExerciseRow(badId)).toBeUndefined();
    expect(await sessionExerciseRow(nullId)).toBeDefined();
  });

  it('rejects a session_exercise PUT naming an exercise_id with no matching row, without a 500', async () => {
    const cookie = await signUp('missing-exercise-fk');
    const sessionId = randomUUID();
    const seId = randomUUID();
    const seOp = sessionExerciseOp(seId, { session_id: sessionId, exercise_id: randomUUID() });

    const res = await push(cookie, [workoutSessionOp(sessionId), seOp]);

    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    const body: SyncPushResponse = res.body;
    expect(body.rejected.some((r) => r.op_id === seOp.op_id)).toBe(true);
    expect(await sessionExerciseRow(seId)).toBeUndefined();
  });

  it('applies the healthy aggregate in full when a poisoned aggregate is pushed first in the same batch', async () => {
    const cookie = await signUp('order-poisoned-first');
    const poisonedSessionId = randomUUID();
    const poisonedSeId = randomUUID();
    const healthySessionId = randomUUID();
    const healthySeId = randomUUID();

    const poisonedSeOp = sessionExerciseOp(poisonedSeId, {
      session_id: poisonedSessionId,
      exercise_id: randomUUID(),
    });
    const healthySeOp = sessionExerciseOp(healthySeId, { session_id: healthySessionId });

    const res = await push(cookie, [
      workoutSessionOp(poisonedSessionId),
      poisonedSeOp,
      workoutSessionOp(healthySessionId),
      healthySeOp,
    ]);

    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    const body: SyncPushResponse = res.body;
    expect(body.rejected.some((r) => r.op_id === poisonedSeOp.op_id)).toBe(true);
    expect(body.applied).toContain(healthySeOp.op_id);
    expect(await sessionExerciseRow(poisonedSeId)).toBeUndefined();
    expect(await sessionExerciseRow(healthySeId)).toBeDefined();
  });

  it('applies the healthy aggregate in full when a poisoned aggregate is pushed second in the same batch', async () => {
    const cookie = await signUp('order-healthy-first');
    const poisonedSessionId = randomUUID();
    const poisonedSeId = randomUUID();
    const healthySessionId = randomUUID();
    const healthySeId = randomUUID();

    const poisonedSeOp = sessionExerciseOp(poisonedSeId, {
      session_id: poisonedSessionId,
      exercise_id: randomUUID(),
    });
    const healthySeOp = sessionExerciseOp(healthySeId, { session_id: healthySessionId });

    const res = await push(cookie, [
      workoutSessionOp(healthySessionId),
      healthySeOp,
      workoutSessionOp(poisonedSessionId),
      poisonedSeOp,
    ]);

    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    const body: SyncPushResponse = res.body;
    expect(body.rejected.some((r) => r.op_id === poisonedSeOp.op_id)).toBe(true);
    expect(body.applied).toContain(healthySeOp.op_id);
    expect(await sessionExerciseRow(poisonedSeId)).toBeUndefined();
    expect(await sessionExerciseRow(healthySeId)).toBeDefined();
  });

  it('returns empty applied and rejected arrays and a server_seq for an empty batch, and does not throw', async () => {
    const cookie = await signUp('empty-batch');

    const res = await push(cookie, []);

    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([]);
    expect(typeof body.server_seq).toBe('string');
  });

  it('returns the same rejections on two consecutive identical pushes of the same poisoned batch — stable, not escalating', async () => {
    const cookie = await signUp('stable-retry');
    const sessionId = randomUUID();
    const seId = randomUUID();
    const seOp = sessionExerciseOp(seId, { session_id: sessionId, exercise_id: randomUUID() });
    const batch = [workoutSessionOp(sessionId), seOp];

    const first = await push(cookie, batch);
    const second = await push(cookie, batch);

    expect(first.status).toBeGreaterThanOrEqual(200);
    expect(first.status).toBeLessThan(300);
    expect(second.status).toBeGreaterThanOrEqual(200);
    expect(second.status).toBeLessThan(300);
    const firstBody: SyncPushResponse = first.body;
    const secondBody: SyncPushResponse = second.body;
    expect(firstBody.rejected.some((r) => r.op_id === seOp.op_id && r.reason === 'invalid_field')).toBe(true);
    expect(secondBody.rejected.some((r) => r.op_id === seOp.op_id && r.reason === 'invalid_field')).toBe(true);
    expect(await sessionExerciseRow(seId)).toBeUndefined();
  });
});
