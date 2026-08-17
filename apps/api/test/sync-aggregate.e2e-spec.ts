import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import { SYNC_PUSH_PATH, type SyncCrudOp, type SyncPushRequest, type SyncPushResponse } from '@fitness/api-contracts';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as sync-push.e2e-spec.ts: @thallesp/nestjs-better-auth and better-auth are ESM-only,
// so this suite drives the built artifact over real HTTP rather than an in-process testing module.
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
  const email = `e2e-aggregate-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

function workoutSessionOp(id: string, overrides: Partial<SyncCrudOp> = {}): SyncCrudOp {
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
    ...overrides,
  };
}

function sessionExerciseOp(id: string, sessionId: string, orderIndex: number, overrides: Partial<SyncCrudOp> = {}): SyncCrudOp {
  return {
    op_id: randomUUID(),
    op: 'PUT',
    type: 'session_exercise',
    id,
    data: {
      session_id: sessionId,
      exercise_id: exerciseId,
      order_index: orderIndex,
      target_sets: 3,
      target_rep_min: 8,
      target_rep_max: 12,
    },
    ...overrides,
  };
}

function loggedSetOp(
  id: string,
  sessionExerciseId: string,
  setIndex: number,
  overrides: Partial<SyncCrudOp> = {},
): SyncCrudOp {
  return {
    op_id: randomUUID(),
    op: 'PUT',
    type: 'logged_set',
    id,
    data: {
      session_exercise_id: sessionExerciseId,
      set_index: setIndex,
      set_type: 'normal',
      weight_kg: '60.000',
      reps: 10,
      completed: true,
      logged_at: new Date().toISOString(),
    },
    ...overrides,
  };
}

async function loggedSetRow(id: string): Promise<{ id: string; session_exercise_id: string; set_index: number } | undefined> {
  const { rows } = await pg.query('SELECT id, session_exercise_id, set_index FROM logged_set WHERE id = $1', [id]);
  return rows[0];
}

async function sessionExerciseRow(id: string): Promise<{ id: string; session_id: string } | undefined> {
  const { rows } = await pg.query('SELECT id, session_id FROM session_exercise WHERE id = $1', [id]);
  return rows[0];
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

  exerciseId = randomUUID();
  await pg.query(
    `INSERT INTO exercise (id, name, load_type, is_custom, unilateral, source)
     VALUES ($1, 'Barbell Bench Press', 'external_load', false, false, 'seed')`,
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

describe('Sync aggregate apply (e2e)', () => {
  it('applies a whole session — two exercises, six sets — as one transactional aggregate', async () => {
    const cookie = await signUp('whole-session');
    const sessionId = randomUUID();
    const se1 = randomUUID();
    const se2 = randomUUID();

    const batch: SyncCrudOp[] = [
      workoutSessionOp(sessionId),
      sessionExerciseOp(se1, sessionId, 0),
      sessionExerciseOp(se2, sessionId, 1),
      loggedSetOp(randomUUID(), se1, 1),
      loggedSetOp(randomUUID(), se1, 2),
      loggedSetOp(randomUUID(), se1, 3),
      loggedSetOp(randomUUID(), se2, 1),
      loggedSetOp(randomUUID(), se2, 2),
      loggedSetOp(randomUUID(), se2, 3),
    ];

    const res = await push(cookie, batch);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toHaveLength(batch.length);
    expect(body.rejected).toEqual([]);

    const sessionRow = await workoutSessionRow(sessionId);
    expect(sessionRow).toBeDefined();
    const { rows: sessionExerciseRows } = await pg.query(
      'SELECT id FROM session_exercise WHERE session_id = $1',
      [sessionId],
    );
    expect(sessionExerciseRows).toHaveLength(2);
    const { rows: loggedSetRows } = await pg.query(
      'SELECT id FROM logged_set WHERE session_exercise_id = ANY($1::text[])',
      [[se1, se2]],
    );
    expect(loggedSetRows).toHaveLength(6);
  });

  it('rejects a logged_set whose parent session_exercise is absent from the database and the batch, leaving the rest of the aggregate unapplied', async () => {
    const cookie = await signUp('missing-parent');
    const sessionId = randomUUID();
    const se1 = randomUUID();
    const orphanSetOp = loggedSetOp(randomUUID(), randomUUID(), 1);

    const batch: SyncCrudOp[] = [workoutSessionOp(sessionId), sessionExerciseOp(se1, sessionId, 0), orphanSetOp];

    const res = await push(cookie, batch);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toHaveLength(batch.length);
    expect(body.rejected.every((r) => r.reason === 'missing_parent')).toBe(true);

    expect(await workoutSessionRow(sessionId)).toBeUndefined();
    expect(await sessionExerciseRow(se1)).toBeUndefined();
    expect(await loggedSetRow(orphanSetOp.id)).toBeUndefined();
  });

  it('applies a batch whose child ops precede their parent op, because the aggregate is ordered before it is applied', async () => {
    const cookie = await signUp('out-of-order');
    const sessionId = randomUUID();
    const se1 = randomUUID();
    const setOp = loggedSetOp(randomUUID(), se1, 1);

    // Deliberately out of order: logged_set, then session_exercise, then workout_session.
    const batch: SyncCrudOp[] = [setOp, sessionExerciseOp(se1, sessionId, 0), workoutSessionOp(sessionId)];

    const res = await push(cookie, batch);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toHaveLength(3);
    expect(body.rejected).toEqual([]);
    expect(await workoutSessionRow(sessionId)).toBeDefined();
    expect(await sessionExerciseRow(se1)).toBeDefined();
    expect(await loggedSetRow(setOp.id)).toBeDefined();
  });

  it('applies two logged_sets under the same session_exercise sharing a set_index, both applied and distinguishable by id', async () => {
    const cookie = await signUp('same-set-index');
    const sessionId = randomUUID();
    const se1 = randomUUID();
    const setA = loggedSetOp(randomUUID(), se1, 1, { data: { session_exercise_id: se1, set_index: 1, set_type: 'normal', weight_kg: '60.000', reps: 10, completed: true, logged_at: new Date().toISOString() } });
    const setB = loggedSetOp(randomUUID(), se1, 1, { data: { session_exercise_id: se1, set_index: 1, set_type: 'drop', weight_kg: '50.000', reps: 8, completed: true, parent_set_id: setA.id, logged_at: new Date().toISOString() } });

    const batch: SyncCrudOp[] = [workoutSessionOp(sessionId), sessionExerciseOp(se1, sessionId, 0), setA, setB];

    const res = await push(cookie, batch);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toHaveLength(4);
    expect(body.rejected).toEqual([]);

    const rowA = await loggedSetRow(setA.id);
    const rowB = await loggedSetRow(setB.id);
    expect(rowA).toBeDefined();
    expect(rowB).toBeDefined();
    expect(rowA?.id).not.toBe(rowB?.id);
    expect(rowA?.set_index).toBe(1);
    expect(rowB?.set_index).toBe(1);
  });

  it('rejects a child op whose aggregate root belongs to another user with not_owner, without applying any part of the aggregate', async () => {
    const ownerCookie = await signUp('agg-owner');
    const attackerCookie = await signUp('agg-attacker');

    const sessionId = randomUUID();
    await push(ownerCookie, [workoutSessionOp(sessionId)]);

    const se1 = randomUUID();
    const attackBatch: SyncCrudOp[] = [sessionExerciseOp(se1, sessionId, 0)];
    const res = await push(attackerCookie, attackBatch);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: attackBatch[0].op_id, reason: 'not_owner' }]);
    expect(await sessionExerciseRow(se1)).toBeUndefined();
  });

  it('rejects an op with a negative weight_kg with invalid_field and rolls back its aggregate', async () => {
    const cookie = await signUp('invalid-field');
    const sessionId = randomUUID();
    const se1 = randomUUID();
    const badSet = loggedSetOp(randomUUID(), se1, 1, {
      data: { session_exercise_id: se1, set_index: 1, set_type: 'normal', weight_kg: '-5.000', reps: 10, completed: true, logged_at: new Date().toISOString() },
    });

    const batch: SyncCrudOp[] = [workoutSessionOp(sessionId), sessionExerciseOp(se1, sessionId, 0), badSet];

    const res = await push(cookie, batch);

    const body: SyncPushResponse = res.body;
    const badRejection = body.rejected.find((r) => r.op_id === badSet.op_id);
    expect(badRejection).toEqual({ op_id: badSet.op_id, reason: 'invalid_field' });
    expect(await loggedSetRow(badSet.id)).toBeUndefined();
  });
});
