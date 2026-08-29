import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import { SYNC_PUSH_PATH, type SyncCrudOp, type SyncPushRequest, type SyncPushResponse } from '@fitness/api-contracts';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as sync-push.e2e-spec.ts / sync-aggregate.e2e-spec.ts: @thallesp/nestjs-better-auth
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
  const email = `e2e-concurrent-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

interface LoggedSetFields {
  session_exercise_id: string;
  set_index: number;
  set_type?: string;
  weight_kg: string;
  reps: number;
  rir?: number | null;
  completed: boolean;
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

function deleteOp(type: string, id: string): SyncCrudOp {
  return { op_id: randomUUID(), op: 'DELETE', type, id, data: null };
}

async function loggedSetRow(
  id: string,
): Promise<{ id: string; session_exercise_id: string; weight_kg: string; reps: number; rir: number | null; set_index: number; completed: boolean } | undefined> {
  const { rows } = await pg.query(
    'SELECT id, session_exercise_id, weight_kg, reps, rir, set_index, completed FROM logged_set WHERE id = $1',
    [id],
  );
  return rows[0];
}

async function loggedSetCount(ids: string[]): Promise<number> {
  const { rows } = await pg.query('SELECT count(*)::int AS n FROM logged_set WHERE id = ANY($1::text[])', [ids]);
  return rows[0].n;
}

async function conflictLogRowsFor(rowId: string): Promise<{ losing_value: Record<string, unknown>; winning_value: Record<string, unknown> }[]> {
  const { rows } = await pg.query(
    'SELECT losing_value, winning_value FROM sync_conflict_log WHERE row_id = $1 ORDER BY detected_at ASC',
    [rowId],
  );
  return rows;
}

async function conflictLogCount(rowIds: string[]): Promise<number> {
  const { rows } = await pg.query('SELECT count(*)::int AS n FROM sync_conflict_log WHERE row_id = ANY($1::text[])', [rowIds]);
  return rows[0].n;
}

async function tombstoneCount(rowIds: string[]): Promise<number> {
  const { rows } = await pg.query('SELECT count(*)::int AS n FROM sync_tombstone WHERE row_id = ANY($1::text[])', [rowIds]);
  return rows[0].n;
}

async function workoutSessionExists(id: string): Promise<boolean> {
  const { rows } = await pg.query('SELECT id FROM workout_session WHERE id = $1', [id]);
  return rows.length > 0;
}

async function sessionExerciseCountForSession(sessionId: string): Promise<number> {
  const { rows } = await pg.query('SELECT count(*)::int AS n FROM session_exercise WHERE session_id = $1', [sessionId]);
  return rows[0].n;
}

async function loggedSetCountForSessionExercises(sessionExerciseIds: string[]): Promise<number> {
  const { rows } = await pg.query(
    'SELECT count(*)::int AS n FROM logged_set WHERE session_exercise_id = ANY($1::text[])',
    [sessionExerciseIds],
  );
  return rows[0].n;
}

async function seedSession(cookie: string): Promise<{ sessionId: string; se1: string }> {
  const sessionId = randomUUID();
  const se1 = randomUUID();
  const res = await push(cookie, [workoutSessionOp(sessionId), sessionExerciseOp(se1, sessionId, 0)]);
  expect((res.body as SyncPushResponse).rejected).toEqual([]);
  return { sessionId, se1 };
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
     VALUES ($1, 'Barbell Bench Press', 'external_weight', false, false, 'seed')`,
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

describe('Two-device concurrent edit (e2e)', () => {
  it('lands two different logged_sets created by two devices under the same session_exercise, both present', async () => {
    const cookie = await signUp('two-different-sets');
    const { se1 } = await seedSession(cookie);
    const setA = randomUUID();
    const setB = randomUUID();

    const resA = await push(cookie, [
      loggedSetOp(setA, { session_exercise_id: se1, set_index: 1, weight_kg: '60.000', reps: 10, rir: 2, completed: true }),
    ]);
    const resB = await push(cookie, [
      loggedSetOp(setB, { session_exercise_id: se1, set_index: 2, weight_kg: '50.000', reps: 8, rir: 1, completed: true }),
    ]);

    expect((resA.body as SyncPushResponse).rejected).toEqual([]);
    expect((resB.body as SyncPushResponse).rejected).toEqual([]);
    expect(await loggedSetRow(setA)).toBeDefined();
    expect(await loggedSetRow(setB)).toBeDefined();
    expect(await loggedSetCount([setA, setB])).toBe(2);
    expect(await conflictLogCount([setA, setB])).toBe(0);
  });

  it('applies A-then-B on the same completed set: B (later) wins, and the conflict log holds exactly what A had stored', async () => {
    const cookie = await signUp('a-then-b');
    const { se1 } = await seedSession(cookie);
    const setId = randomUUID();

    // Starting state is still in-progress — completing it is not itself a conflict (behavior:
    // a stored completed=false set overwrites and logs nothing), so the one conflict this test
    // asserts on is unambiguously the B-over-A overwrite, not noise from completing the set.
    const baseline = await push(cookie, [
      loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '60.000', reps: 10, rir: 2, completed: false }),
    ]);
    expect((baseline.body as SyncPushResponse).rejected).toEqual([]);

    // Device A completes the set, changing reps from the in-progress value.
    const pushA = await push(cookie, [
      loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '60.000', reps: 8, rir: 2, completed: true }),
    ]);
    expect((pushA.body as SyncPushResponse).rejected).toEqual([]);
    const afterA = await loggedSetRow(setId);
    expect(afterA?.reps).toBe(8);
    expect(await conflictLogCount([setId])).toBe(0);

    // Device B, pushed second, changes weight_kg only (relative to A's now-current state).
    const pushB = await push(cookie, [
      loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '65.000', reps: 8, rir: 2, completed: true }),
    ]);
    expect((pushB.body as SyncPushResponse).rejected).toEqual([]);

    const finalRow = await loggedSetRow(setId);
    expect(finalRow?.weight_kg).toBe('65.000');
    expect(finalRow?.reps).toBe(8);
    expect(await loggedSetCount([setId])).toBe(1);

    const conflicts = await conflictLogRowsFor(setId);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].losing_value).toEqual({
      weight_kg: '60.000',
      reps: 8,
      rir: 2,
      set_index: 1,
      completed: true,
    });
    expect(conflicts[0].winning_value).toEqual({
      weight_kg: '65.000',
      reps: 8,
      rir: 2,
      set_index: 1,
      completed: true,
    });
  });

  it('reverses the outcome when the push order is reversed, with the row count unchanged', async () => {
    const cookie = await signUp('b-then-a');
    const { se1 } = await seedSession(cookie);
    const setId = randomUUID();

    const baseline = await push(cookie, [
      loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '60.000', reps: 10, rir: 2, completed: false }),
    ]);
    expect((baseline.body as SyncPushResponse).rejected).toEqual([]);

    // Device B completes the set first, changing weight_kg from the in-progress value.
    const pushB = await push(cookie, [
      loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '65.000', reps: 10, rir: 2, completed: true }),
    ]);
    expect((pushB.body as SyncPushResponse).rejected).toEqual([]);
    expect(await conflictLogCount([setId])).toBe(0);

    // Device A, pushed second this time, changes reps only (relative to B's now-current state).
    const pushA = await push(cookie, [
      loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '65.000', reps: 8, rir: 2, completed: true }),
    ]);
    expect((pushA.body as SyncPushResponse).rejected).toEqual([]);

    const finalRow = await loggedSetRow(setId);
    expect(finalRow?.reps).toBe(8);
    expect(finalRow?.weight_kg).toBe('65.000');
    expect(await loggedSetCount([setId])).toBe(1);

    const conflicts = await conflictLogRowsFor(setId);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].losing_value).toEqual({
      weight_kg: '65.000',
      reps: 10,
      rir: 2,
      set_index: 1,
      completed: true,
    });
  });

  it('adds no conflict-log row when a device replays its whole batch after a dropped response', async () => {
    const cookie = await signUp('replay');
    const { se1 } = await seedSession(cookie);
    const setId = randomUUID();

    await push(cookie, [
      loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '60.000', reps: 10, rir: 2, completed: true }),
    ]);
    const editOp = loggedSetOp(setId, {
      session_exercise_id: se1,
      set_index: 1,
      weight_kg: '65.000',
      reps: 10,
      rir: 2,
      completed: true,
    });

    const first = await push(cookie, [editOp]);
    expect((first.body as SyncPushResponse).applied).toEqual([editOp.op_id]);
    expect(await conflictLogCount([setId])).toBe(1);

    // Same op_id, same op, replayed verbatim as if the client never saw the first response.
    const replay = await push(cookie, [editOp]);
    expect((replay.body as SyncPushResponse).applied).toEqual([editOp.op_id]);
    expect((replay.body as SyncPushResponse).rejected).toEqual([]);

    expect(await conflictLogCount([setId])).toBe(1);
    expect(await loggedSetCount([setId])).toBe(1);
  });

  it('applies two ops for the same client UUID inside one batch in batch order, leaving exactly one row', async () => {
    const cookie = await signUp('same-uuid-in-batch');
    const { sessionId, se1 } = await seedSession(cookie);
    const setId = randomUUID();

    const opFirst = loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '60.000', reps: 5, completed: false });
    const opSecond = loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '60.000', reps: 9, completed: false });

    const res = await push(cookie, [workoutSessionOp(sessionId), opFirst, opSecond]);
    const body = res.body as SyncPushResponse;

    expect(body.applied).toEqual(expect.arrayContaining([opFirst.op_id, opSecond.op_id]));
    expect(body.rejected).toEqual([]);

    const row = await loggedSetRow(setId);
    expect(row?.reps).toBe(9);
    expect(await loggedSetCount([setId])).toBe(1);
  });

  it('returns success with zero applied ops and writes no conflict-log row or tombstone for an empty batch', async () => {
    const cookie = await signUp('empty-batch');

    const res = await push(cookie, []);
    const body = res.body as SyncPushResponse;

    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([]);
  });

  it('stores two logged_sets under different session_exercises that carry byte-identical values, distinguishable by id', async () => {
    const cookie = await signUp('identical-values');
    const { sessionId, se1 } = await seedSession(cookie);
    const se2 = randomUUID();
    await push(cookie, [sessionExerciseOp(se2, sessionId, 1)]);

    const setUnderSe1 = randomUUID();
    const setUnderSe2 = randomUUID();
    const identicalFields: Omit<LoggedSetFields, 'session_exercise_id'> = {
      set_index: 1,
      weight_kg: '60.000',
      reps: 10,
      rir: 2,
      completed: true,
    };

    const res = await push(cookie, [
      loggedSetOp(setUnderSe1, { session_exercise_id: se1, ...identicalFields }),
      loggedSetOp(setUnderSe2, { session_exercise_id: se2, ...identicalFields }),
    ]);
    const body = res.body as SyncPushResponse;
    expect(body.rejected).toEqual([]);

    const rowA = await loggedSetRow(setUnderSe1);
    const rowB = await loggedSetRow(setUnderSe2);
    expect(rowA).toBeDefined();
    expect(rowB).toBeDefined();
    expect(rowA?.id).not.toBe(rowB?.id);
    expect(await loggedSetCount([setUnderSe1, setUnderSe2])).toBe(2);
    expect(await conflictLogCount([setUnderSe1, setUnderSe2])).toBe(0);
  });
});

describe('Deletes that stay deleted (e2e)', () => {
  it('removes a logged_set row and writes one sync_tombstone row on DELETE', async () => {
    const cookie = await signUp('delete-set');
    const { se1 } = await seedSession(cookie);
    const setId = randomUUID();
    await push(cookie, [
      loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '60.000', reps: 10, completed: true }),
    ]);

    const res = await push(cookie, [deleteOp('logged_set', setId)]);
    const body = res.body as SyncPushResponse;

    expect(body.rejected).toEqual([]);
    expect(await loggedSetRow(setId)).toBeUndefined();
    expect(await tombstoneCount([setId])).toBe(1);
  });

  it('rejects a PUT for a tombstoned id with deleted and does not recreate the row', async () => {
    const cookie = await signUp('put-after-delete');
    const { se1 } = await seedSession(cookie);
    const setId = randomUUID();
    await push(cookie, [
      loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '60.000', reps: 10, completed: true }),
    ]);
    await push(cookie, [deleteOp('logged_set', setId)]);

    const staleEdit = loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '99.000', reps: 1, completed: true });
    const res = await push(cookie, [staleEdit]);
    const body = res.body as SyncPushResponse;

    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: staleEdit.op_id, reason: 'deleted' }]);
    expect(await loggedSetRow(setId)).toBeUndefined();
  });

  it('rejects a PATCH for a tombstoned id with deleted and does not recreate the row', async () => {
    const cookie = await signUp('patch-after-delete');
    const { se1 } = await seedSession(cookie);
    const setId = randomUUID();
    await push(cookie, [
      loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '60.000', reps: 10, completed: true }),
    ]);
    await push(cookie, [deleteOp('logged_set', setId)]);

    const staleEdit = loggedSetOp(
      setId,
      { session_exercise_id: se1, set_index: 1, weight_kg: '99.000', reps: 1, completed: true },
      { op: 'PATCH' },
    );
    const res = await push(cookie, [staleEdit]);
    const body = res.body as SyncPushResponse;

    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: staleEdit.op_id, reason: 'deleted' }]);
    expect(await loggedSetRow(setId)).toBeUndefined();
  });

  it('deletes the same id twice idempotently, adding no second tombstone row', async () => {
    const cookie = await signUp('double-delete');
    const { se1 } = await seedSession(cookie);
    const setId = randomUUID();
    await push(cookie, [
      loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '60.000', reps: 10, completed: true }),
    ]);

    const first = await push(cookie, [deleteOp('logged_set', setId)]);
    expect((first.body as SyncPushResponse).rejected).toEqual([]);
    const second = await push(cookie, [deleteOp('logged_set', setId)]);
    expect((second.body as SyncPushResponse).rejected).toEqual([]);

    expect(await tombstoneCount([setId])).toBe(1);
  });

  it('deletes a workout_session and removes its session_exercises and logged_sets in the same transaction, leaving no orphans', async () => {
    const cookie = await signUp('delete-session');
    const { sessionId, se1 } = await seedSession(cookie);
    const setId = randomUUID();
    await push(cookie, [
      loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '60.000', reps: 10, completed: true }),
    ]);

    const res = await push(cookie, [deleteOp('workout_session', sessionId)]);
    const body = res.body as SyncPushResponse;
    expect(body.rejected).toEqual([]);

    expect(await workoutSessionExists(sessionId)).toBe(false);
    expect(await sessionExerciseCountForSession(sessionId)).toBe(0);
    expect(await loggedSetCountForSessionExercises([se1])).toBe(0);
  });

  it('rejects a DELETE for a row belonging to another user with not_owner and leaves the row untouched', async () => {
    const ownerCookie = await signUp('delete-owner');
    const attackerCookie = await signUp('delete-attacker');
    const { se1 } = await seedSession(ownerCookie);
    const setId = randomUUID();
    await push(ownerCookie, [
      loggedSetOp(setId, { session_exercise_id: se1, set_index: 1, weight_kg: '60.000', reps: 10, completed: true }),
    ]);

    const res = await push(attackerCookie, [deleteOp('logged_set', setId)]);
    const body = res.body as SyncPushResponse;

    expect(body.applied).toEqual([]);
    expect(body.rejected[0]).toEqual({ op_id: expect.any(String), reason: 'not_owner' });
    expect(await loggedSetRow(setId)).toBeDefined();
  });

  it('rejects an attempt to delete an exercise row rather than applying it', async () => {
    const cookie = await signUp('delete-exercise');
    const op = deleteOp('exercise', exerciseId);

    const res = await push(cookie, [op]);
    const body = res.body as SyncPushResponse;

    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);
  });

  it('scopes a tombstone to one user: another user creating a row with the same id is unaffected', async () => {
    const ownerCookie = await signUp('tombstone-owner');
    const otherCookie = await signUp('tombstone-other');
    const { se1: ownerSe1 } = await seedSession(ownerCookie);
    const { se1: otherSe1 } = await seedSession(otherCookie);
    const sharedId = randomUUID();

    await push(ownerCookie, [
      loggedSetOp(sharedId, { session_exercise_id: ownerSe1, set_index: 1, weight_kg: '60.000', reps: 10, completed: true }),
    ]);
    await push(ownerCookie, [deleteOp('logged_set', sharedId)]);
    expect(await loggedSetRow(sharedId)).toBeUndefined();

    const res = await push(otherCookie, [
      loggedSetOp(sharedId, { session_exercise_id: otherSe1, set_index: 1, weight_kg: '40.000', reps: 5, completed: true }),
    ]);
    const body = res.body as SyncPushResponse;

    expect(body.rejected).toEqual([]);
    const row = await loggedSetRow(sharedId);
    expect(row).toBeDefined();
    expect(row?.session_exercise_id).toBe(otherSe1);
  });
});
