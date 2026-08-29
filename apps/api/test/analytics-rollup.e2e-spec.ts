import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import { SYNC_PUSH_PATH, type SyncCrudOp, type SyncPushRequest, type SyncPushResponse } from '@fitness/api-contracts';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as personal-record-sync.e2e-spec.ts / sync-aggregate.e2e-spec.ts:
// @thallesp/nestjs-better-auth and better-auth are ESM-only, so this suite drives the built
// artifact over real HTTP rather than an in-process testing module. This spec is the plan's real
// evidence: a completed workout pushed through the shipped ingress must leave materialized,
// weighted, secondary-inclusive rollup rows and a watermark in Postgres.
const AUTH_BASE_PATH = '/v1/auth';
const PASSWORD = 'correct-horse-battery-staple';
const LOCAL_DATE = '2026-06-15';

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
  const email = `e2e-analytics-rollup-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

async function signUp(tag: string): Promise<{ cookie: string; userId: string }> {
  const email = freshEmail(tag);
  const res = await request(baseUrl)
    .post(`${AUTH_BASE_PATH}/sign-up/email`)
    .send({ email, password: PASSWORD, name: `E2E ${tag}` })
    .expect(200);
  const cookie = sessionCookie(res);
  const userId: string = res.body.user.id;
  return { cookie, userId };
}

async function push(cookie: string, batch: SyncCrudOp[]): Promise<request.Response> {
  const body: SyncPushRequest = { batch };
  return request(baseUrl).post(SYNC_PUSH_PATH).send(body).set('Cookie', cookie);
}

function workoutSessionOp(id: string, overrides: Record<string, unknown> = {}): SyncCrudOp {
  return {
    op_id: randomUUID(),
    op: 'PUT',
    type: 'workout_session',
    id,
    data: {
      started_at: new Date('2026-06-15T20:00:00Z').toISOString(),
      status: 'completed',
      timezone: 'America/New_York',
      local_date: LOCAL_DATE,
      ...overrides,
    },
  };
}

function workoutSessionPatchOp(id: string, data: Record<string, unknown>): SyncCrudOp {
  return { op_id: randomUUID(), op: 'PATCH', type: 'workout_session', id, data };
}

function deleteOp(type: string, id: string): SyncCrudOp {
  return { op_id: randomUUID(), op: 'DELETE', type, id, data: null };
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
    },
  };
}

function loggedSetOp(id: string, sessionExerciseId: string, setIndex: number, overrides: Record<string, unknown> = {}): SyncCrudOp {
  return {
    op_id: randomUUID(),
    op: 'PUT',
    type: 'logged_set',
    id,
    data: {
      session_exercise_id: sessionExerciseId,
      set_index: setIndex,
      set_type: 'normal',
      weight_kg: '100.000',
      reps: 5,
      completed: true,
      logged_at: new Date('2026-06-15T20:15:00Z').toISOString(),
      ...overrides,
    },
  };
}

interface RollupRow {
  muscle_group_id: string;
  local_date: string;
  weighted_volume_kg: string;
  weighted_sets: string;
  set_count: number;
}

async function rollupRows(userId: string): Promise<RollupRow[]> {
  const { rows } = await pg.query<RollupRow>(
    `SELECT muscle_group_id, local_date::text AS local_date, weighted_volume_kg, weighted_sets, set_count
     FROM muscle_volume_rollup WHERE user_id = $1 ORDER BY muscle_group_id`,
    [userId],
  );
  return rows;
}

async function watermarkRow(userId: string): Promise<{ computed_through_date: string } | undefined> {
  const { rows } = await pg.query<{ computed_through_date: string }>(
    `SELECT computed_through_date::text AS computed_through_date FROM analytics_watermark WHERE user_id = $1`,
    [userId],
  );
  return rows[0];
}

async function rollupRowsForDate(userId: string, localDate: string): Promise<RollupRow[]> {
  const { rows } = await pg.query<RollupRow>(
    `SELECT muscle_group_id, local_date::text AS local_date, weighted_volume_kg, weighted_sets, set_count
     FROM muscle_volume_rollup WHERE user_id = $1 AND local_date = $2 ORDER BY muscle_group_id`,
    [userId, localDate],
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
     VALUES ($1, 'Analytics Rollup Bench Press', 'external_weight', false, false, 'seed')`,
    [exerciseId],
  );
  // Primary chest at weight_factor 1.00, secondary triceps at 0.50 — D-04's secondary-inclusive
  // requirement, and the two weights this suite's expected totals are computed from.
  await pg.query(
    `INSERT INTO exercise_muscle_mapping (exercise_id, muscle_group_id, role, weight_factor) VALUES
       ($1, 'chest', 'primary', '1.00'),
       ($1, 'triceps', 'secondary', '0.50')`,
    [exerciseId],
  );
}, 60000);

afterAll(async () => {
  if (pg) {
    // Deleting the user first cascades away workout_session (and its session_exercise/logged_set
    // children), muscle_volume_rollup and analytics_watermark — all four reference user_id with
    // onDelete: 'cascade'. Only once that cascade has run does exercise have no session_exercise
    // row still pointing at it, and can itself be deleted without a foreign-key violation.
    if (createdEmails.length > 0) {
      await pg.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [createdEmails]);
    }
    await pg.query('DELETE FROM exercise_muscle_mapping WHERE exercise_id = $1', [exerciseId]);
    await pg.query('DELETE FROM exercise WHERE id = $1', [exerciseId]);
    await pg.end();
  }
  if (api && !api.killed) {
    api.kill('SIGTERM');
  }
});

describe('Analytics rollup reconciliation (e2e)', () => {
  it('a completed workout pushed through the shipped ingress produces weighted, secondary-inclusive rollup rows and a watermark, unchanged on replay', async () => {
    const { cookie, userId } = await signUp('rollup');
    const sessionId = randomUUID();
    const sessionExerciseId = randomUUID();
    const setIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];

    const batch: SyncCrudOp[] = [
      workoutSessionOp(sessionId),
      sessionExerciseOp(sessionExerciseId, sessionId),
      loggedSetOp(setIds[0], sessionExerciseId, 1),
      loggedSetOp(setIds[1], sessionExerciseId, 2),
      loggedSetOp(setIds[2], sessionExerciseId, 3),
      // A warm-up set, excluded from working volume — must not shift either cell's totals.
      loggedSetOp(setIds[3], sessionExerciseId, 4, { set_type: 'warmup', weight_kg: '40.000', reps: 10 }),
    ];

    const res = await push(cookie, batch);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toHaveLength(batch.length);
    expect(body.rejected).toEqual([]);

    const rows = await rollupRows(userId);
    expect(rows).toHaveLength(2);

    const chest = rows.find((row) => row.muscle_group_id === 'chest');
    expect(chest).toBeDefined();
    expect(Number(chest?.weighted_volume_kg)).toBeCloseTo(1500, 3);
    expect(Number(chest?.weighted_sets)).toBeCloseTo(3, 3);
    expect(chest?.set_count).toBe(3);
    expect(chest?.local_date).toBe(LOCAL_DATE);

    const triceps = rows.find((row) => row.muscle_group_id === 'triceps');
    expect(triceps).toBeDefined();
    expect(Number(triceps?.weighted_volume_kg)).toBeCloseTo(750, 3);
    expect(Number(triceps?.weighted_sets)).toBeCloseTo(1.5, 3);
    expect(triceps?.set_count).toBe(3);

    // The third muscle group this exercise carries no mapping for is absent, never a zero row.
    expect(rows.find((row) => row.muscle_group_id === 'quads')).toBeUndefined();

    const watermark = await watermarkRow(userId);
    expect(watermark).toBeDefined();
    expect(watermark?.computed_through_date).toBe(LOCAL_DATE);

    // Pushing the exact same ops a second time — same ids throughout, so each PUT is an idempotent
    // overwrite rather than a new row — must be a no-op in effect: same row count, same totals.
    const replayBatch: SyncCrudOp[] = [
      workoutSessionOp(sessionId),
      sessionExerciseOp(sessionExerciseId, sessionId),
      loggedSetOp(setIds[0], sessionExerciseId, 1),
      loggedSetOp(setIds[1], sessionExerciseId, 2),
      loggedSetOp(setIds[2], sessionExerciseId, 3),
      loggedSetOp(setIds[3], sessionExerciseId, 4, { set_type: 'warmup', weight_kg: '40.000', reps: 10 }),
    ];

    const secondRes = await push(cookie, replayBatch);
    expect((secondRes.body as SyncPushResponse).rejected).toEqual([]);

    const rowsAfterReplay = await rollupRows(userId);
    expect(rowsAfterReplay).toHaveLength(2);
    expect(rowsAfterReplay).toEqual(rows);
  });

  it("moving a session to a different local_date vacates the old date's rollup cells entirely, and the watermark never moves backwards", async () => {
    const { cookie, userId } = await signUp('date-move');
    const sessionId = randomUUID();
    const sessionExerciseId = randomUUID();
    const setId = randomUUID();
    const oldDate = '2026-06-10';
    const newDate = '2026-06-20';

    const createBatch: SyncCrudOp[] = [
      workoutSessionOp(sessionId, { local_date: oldDate }),
      sessionExerciseOp(sessionExerciseId, sessionId),
      loggedSetOp(setId, sessionExerciseId, 1),
    ];
    const createRes = await push(cookie, createBatch);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const oldRowsBefore = await rollupRowsForDate(userId, oldDate);
    expect(oldRowsBefore.length).toBeGreaterThan(0);

    const watermarkBefore = await watermarkRow(userId);
    expect(watermarkBefore?.computed_through_date).toBe(oldDate);

    const patchRes = await push(cookie, [workoutSessionPatchOp(sessionId, { local_date: newDate })]);
    expect((patchRes.body as SyncPushResponse).rejected).toEqual([]);

    // Not zero-value rows — no rows at all for the vacated date.
    const oldRowsAfter = await rollupRowsForDate(userId, oldDate);
    expect(oldRowsAfter).toEqual([]);

    const newRowsAfter = await rollupRowsForDate(userId, newDate);
    expect(newRowsAfter.length).toBe(oldRowsBefore.length);

    const watermarkAfter = await watermarkRow(userId);
    expect(watermarkAfter?.computed_through_date).toBe(newDate);
    expect(watermarkAfter!.computed_through_date >= watermarkBefore!.computed_through_date).toBe(true);
  });

  it('finishing a session with a PATCH that names neither local_date nor started_at (session-lifecycle.ts\'s real payload shape) reconciles against the session\'s true stored local_date, not the server\'s current UTC date', async () => {
    const { cookie, userId } = await signUp('finish-no-local-date');
    const sessionId = randomUUID();
    const sessionExerciseId = randomUUID();
    const setId = randomUUID();
    const trueLocalDate = '2026-01-10';
    const today = new Date().toISOString().slice(0, 10);
    expect(today).not.toBe(trueLocalDate);

    const createBatch: SyncCrudOp[] = [
      workoutSessionOp(sessionId, { local_date: trueLocalDate, status: 'in_progress' }),
      sessionExerciseOp(sessionExerciseId, sessionId),
      loggedSetOp(setId, sessionExerciseId, 1),
    ];
    const createRes = await push(cookie, createBatch);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const rowsBefore = await rollupRowsForDate(userId, trueLocalDate);
    expect(rowsBefore.length).toBeGreaterThan(0);

    const watermarkBefore = await watermarkRow(userId);
    expect(watermarkBefore?.computed_through_date).toBe(trueLocalDate);

    // Mirrors session-lifecycle.ts's completeSession exactly: only ended_at and status, never
    // local_date or started_at.
    const finishRes = await push(cookie, [
      workoutSessionPatchOp(sessionId, { ended_at: new Date('2026-01-10T21:00:00Z').toISOString(), status: 'completed' }),
    ]);
    expect((finishRes.body as SyncPushResponse).rejected).toEqual([]);

    const watermarkAfter = await watermarkRow(userId);
    expect(watermarkAfter?.computed_through_date).toBe(trueLocalDate);

    const rowsAfter = await rollupRowsForDate(userId, trueLocalDate);
    expect(rowsAfter).toEqual(rowsBefore);

    const rowsForToday = await rollupRowsForDate(userId, today);
    expect(rowsForToday).toEqual([]);
  });

  it("deleting a session's last logged_set removes that date's rollup cells, and deleting the whole session does too", async () => {
    const { cookie, userId } = await signUp('set-deleted');
    const sessionId = randomUUID();
    const sessionExerciseId = randomUUID();
    const setId = randomUUID();
    const date = '2026-06-11';

    // set_type 'partial' deliberately: it still counts toward working volume (only 'warmup' is
    // excluded there — countsTowardWorkingVolume), so it still produces real rollup cells, but it
    // never counts toward records (countsTowardRecords also excludes 'partial'), so reconciliation
    // never creates a personal_record row referencing this logged_set_id. personal_record.logged_
    // set_id carries no onDelete cascade/set-null (apps/api/src/db/schema/records.ts, out of this
    // plan's file scope to change) — deleting a logged_set that a PR row still references is a
    // real, separate defect this plan's own work exposed, documented in this plan's SUMMARY rather
    // than fixed here. Using 'partial' proves this test's own claim (rollup cell invalidation)
    // without depending on that unrelated, out-of-scope gap.
    const createBatch: SyncCrudOp[] = [
      workoutSessionOp(sessionId, { local_date: date }),
      sessionExerciseOp(sessionExerciseId, sessionId),
      loggedSetOp(setId, sessionExerciseId, 1, { set_type: 'partial' }),
    ];
    await push(cookie, createBatch);

    const rowsBefore = await rollupRowsForDate(userId, date);
    expect(rowsBefore.length).toBeGreaterThan(0);

    const deleteSetRes = await push(cookie, [deleteOp('logged_set', setId)]);
    expect((deleteSetRes.body as SyncPushResponse).rejected).toEqual([]);

    const rowsAfterSetDelete = await rollupRowsForDate(userId, date);
    expect(rowsAfterSetDelete).toEqual([]);

    // A second session on the same date, so the whole-session delete below has something real to
    // vacate rather than re-proving the already-empty state above.
    const sessionId2 = randomUUID();
    const sessionExerciseId2 = randomUUID();
    const setId2 = randomUUID();
    await push(cookie, [
      workoutSessionOp(sessionId2, { local_date: date }),
      sessionExerciseOp(sessionExerciseId2, sessionId2),
      loggedSetOp(setId2, sessionExerciseId2, 1, { set_type: 'partial' }),
    ]);
    const rowsBeforeSessionDelete = await rollupRowsForDate(userId, date);
    expect(rowsBeforeSessionDelete.length).toBeGreaterThan(0);

    const deleteSessionRes = await push(cookie, [deleteOp('workout_session', sessionId2)]);
    expect((deleteSessionRes.body as SyncPushResponse).rejected).toEqual([]);

    const rowsAfterSessionDelete = await rollupRowsForDate(userId, date);
    expect(rowsAfterSessionDelete).toEqual([]);
  });

  it('re-pushing an unchanged batch twice more is a no-op — same rows, same totals, nothing duplicated', async () => {
    const { cookie, userId } = await signUp('idempotent-again');
    const sessionId = randomUUID();
    const sessionExerciseId = randomUUID();
    const setId = randomUUID();
    const date = '2026-06-12';

    const batch: SyncCrudOp[] = [
      workoutSessionOp(sessionId, { local_date: date }),
      sessionExerciseOp(sessionExerciseId, sessionId),
      loggedSetOp(setId, sessionExerciseId, 1),
    ];

    await push(cookie, batch);
    const firstRows = await rollupRowsForDate(userId, date);
    expect(firstRows.length).toBeGreaterThan(0);

    await push(cookie, batch);
    const secondRows = await rollupRowsForDate(userId, date);
    expect(secondRows).toEqual(firstRows);

    await push(cookie, batch);
    const thirdRows = await rollupRowsForDate(userId, date);
    expect(thirdRows).toEqual(firstRows);
  });
});
