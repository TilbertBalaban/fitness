import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import { SYNC_PUSH_PATH, type SyncCrudOp, type SyncCrudOpType, type SyncPushRequest, type SyncPushResponse } from '@fitness/api-contracts';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as exercise-sync.e2e-spec.ts / user-exercise-preference.e2e-spec.ts:
// @thallesp/nestjs-better-auth and better-auth are ESM-only, so this suite drives the built
// artifact over real HTTP rather than an in-process testing module.
const AUTH_BASE_PATH = '/v1/auth';
const PASSWORD = 'correct-horse-battery-staple';

let api: ChildProcess;
let baseUrl: string;
let pg: Client;
const createdEmails: string[] = [];
const seededExerciseIds: string[] = [];
const seededPersonalRecordIds: string[] = [];

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
  const email = `e2e-pr-sync-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

function personalRecordOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'personal_record', id, data };
}

async function seedExercise(name: string): Promise<string> {
  const id = randomUUID();
  seededExerciseIds.push(id);
  await pg.query(
    `INSERT INTO exercise (id, name, load_type, is_custom, unilateral, source)
     VALUES ($1, $2, 'external_weight', false, false, 'seed')`,
    [id, name],
  );
  return id;
}

interface PersonalRecordRow {
  id: string;
  user_id: string;
  exercise_id: string;
  pr_type: string;
  value: string;
  logged_set_id: string | null;
  achieved_at: string;
  reconciled_at: string | null;
}

async function personalRecordRow(id: string): Promise<PersonalRecordRow | undefined> {
  const { rows } = await pg.query(
    `SELECT id, user_id, exercise_id, pr_type, value, logged_set_id,
            achieved_at::text AS achieved_at, reconciled_at::text AS reconciled_at
     FROM personal_record WHERE id = $1`,
    [id],
  );
  return rows[0];
}

// The four helpers below drive a real workout_session push (rather than a direct personal_record
// op) so applyBatch's own reconcileSession call site fires — the only way to exercise the
// server-authoritative replay this suite's new cases prove, as opposed to the direct-write cases
// above.
function workoutSessionOp(id: string, localDate: string): SyncCrudOp {
  return {
    op_id: randomUUID(),
    op: 'PUT',
    type: 'workout_session',
    id,
    data: {
      started_at: new Date(`${localDate}T20:00:00.000Z`).toISOString(),
      status: 'completed',
      timezone: 'America/New_York',
      local_date: localDate,
    },
  };
}

function sessionExerciseOp(id: string, sessionId: string, exerciseId: string): SyncCrudOp {
  return {
    op_id: randomUUID(),
    op: 'PUT',
    type: 'session_exercise',
    id,
    data: { session_id: sessionId, exercise_id: exerciseId, order_index: 0 },
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
      logged_at: new Date('2026-06-18T20:15:00.000Z').toISOString(),
      ...overrides,
    },
  };
}

function loggedSetPatchOp(id: string, data: Record<string, unknown>): SyncCrudOp {
  return { op_id: randomUUID(), op: 'PATCH', type: 'logged_set', id, data };
}

interface ReconciledPrRow {
  id: string;
  exercise_id: string;
  pr_type: string;
  value: string;
  logged_set_id: string | null;
  reconciled_at: string | null;
  server_seq: string;
}

async function personalRecordRowsForExercise(exerciseId: string): Promise<ReconciledPrRow[]> {
  const { rows } = await pg.query<ReconciledPrRow>(
    `SELECT id, exercise_id, pr_type, value, logged_set_id,
            reconciled_at::text AS reconciled_at, server_seq::text AS server_seq
     FROM personal_record WHERE exercise_id = $1 ORDER BY pr_type, logged_set_id`,
    [exerciseId],
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
}, 60000);

afterAll(async () => {
  if (pg) {
    if (seededPersonalRecordIds.length > 0) {
      await pg.query('DELETE FROM personal_record WHERE id = ANY($1::text[])', [seededPersonalRecordIds]);
    }
    if (seededExerciseIds.length > 0) {
      await pg.query('DELETE FROM exercise WHERE id = ANY($1::text[])', [seededExerciseIds]);
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

describe('personal_record sync (e2e)', () => {
  it('a PUT of a valid personal_record op reaches Postgres with the pusher\'s own user_id', async () => {
    const { cookie, userId } = await signUp('valid-put');
    const exerciseId = await seedExercise('Barbell Back Squat');
    const prId = randomUUID();
    seededPersonalRecordIds.push(prId);

    const op = personalRecordOp(prId, {
      exercise_id: exerciseId,
      pr_type: 'heaviest_weight',
      value: '140.000',
      achieved_at: new Date('2026-06-16T00:00:00Z').toISOString(),
    });
    const res = await push(cookie, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([op.op_id]);
    expect(body.rejected).toEqual([]);

    const row = await personalRecordRow(prId);
    expect(row).toBeDefined();
    expect(row?.user_id).toBe(userId);
    expect(row?.exercise_id).toBe(exerciseId);
    expect(row?.pr_type).toBe('heaviest_weight');
    expect(row?.value).toBe('140.000');
  });

  it("a PUT whose payload names a DIFFERENT user's user_id is still stored against the pusher's id — the ownership assertion", async () => {
    const { cookie: cookieA, userId: userIdA } = await signUp('owner-a');
    const { userId: userIdB } = await signUp('bystander-b');
    const exerciseId = await seedExercise('Conventional Deadlift');
    const prId = randomUUID();
    seededPersonalRecordIds.push(prId);

    const op = personalRecordOp(prId, {
      user_id: userIdB,
      exercise_id: exerciseId,
      pr_type: 'best_e1rm',
      value: '180.500',
      achieved_at: new Date('2026-06-16T00:00:00Z').toISOString(),
    });
    const res = await push(cookieA, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([op.op_id]);
    expect(body.rejected).toEqual([]);

    const row = await personalRecordRow(prId);
    expect(row?.user_id).toBe(userIdA);
    expect(row?.user_id).not.toBe(userIdB);
  });

  it('rejects a PUT whose pr_type is outside the vocabulary as invalid_field', async () => {
    const { cookie } = await signUp('bad-pr-type');
    const exerciseId = await seedExercise('Overhead Press');
    const prId = randomUUID();
    seededPersonalRecordIds.push(prId);

    const op = personalRecordOp(prId, {
      exercise_id: exerciseId,
      pr_type: 'bogus_type',
      value: '60.000',
      achieved_at: new Date().toISOString(),
    });
    const res = await push(cookie, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);
    expect(await personalRecordRow(prId)).toBeUndefined();
  });

  it('rejects a PUT whose value is negative as invalid_field', async () => {
    const { cookie } = await signUp('negative-value');
    const exerciseId = await seedExercise('Barbell Row');
    const prId = randomUUID();
    seededPersonalRecordIds.push(prId);

    const op = personalRecordOp(prId, {
      exercise_id: exerciseId,
      pr_type: 'most_reps_at_weight',
      value: '-5.000',
      achieved_at: new Date().toISOString(),
    });
    const res = await push(cookie, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);
    expect(await personalRecordRow(prId)).toBeUndefined();
  });

  it('rejects a bogus pr_type that reaches a direct INSERT via the Postgres CHECK constraint — the backstop the application-level validator sits in front of', async () => {
    const { userId } = await signUp('check-backstop');
    const exerciseId = await seedExercise('Incline Bench Press');
    const prId = randomUUID();

    await expect(
      pg.query(
        `INSERT INTO personal_record (id, user_id, exercise_id, pr_type, value, achieved_at)
         VALUES ($1, $2, $3, 'not_a_real_type', '50.000', now())`,
        [prId, userId, exerciseId],
      ),
    ).rejects.toThrow(/personal_record_pr_type_check/);
  });

  it('a PATCH naming only reconciled_at leaves value and pr_type unchanged', async () => {
    const { cookie } = await signUp('patch-reconciled');
    const exerciseId = await seedExercise('Pull-Up');
    const prId = randomUUID();
    seededPersonalRecordIds.push(prId);

    const createOp = personalRecordOp(prId, {
      exercise_id: exerciseId,
      pr_type: 'best_set_volume',
      value: '1200.000',
      achieved_at: new Date('2026-06-10T00:00:00Z').toISOString(),
    });
    const createRes = await push(cookie, [createOp]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const before = await personalRecordRow(prId);
    expect(before?.reconciled_at).toBeNull();

    const patchOp = personalRecordOp(prId, { reconciled_at: new Date('2026-06-17T00:00:00Z').toISOString() }, 'PATCH');
    const patchRes = await push(cookie, [patchOp]);
    expect((patchRes.body as SyncPushResponse).applied).toEqual([patchOp.op_id]);
    expect((patchRes.body as SyncPushResponse).rejected).toEqual([]);

    const after = await personalRecordRow(prId);
    expect(after?.reconciled_at).not.toBeNull();
    expect(after?.value).toBe(before?.value);
    expect(after?.pr_type).toBe(before?.pr_type);
    expect(after?.exercise_id).toBe(before?.exercise_id);
  });

  it('a correction that lowers a set below the prior best deletes the superseded record rather than merely joining it with a second row', async () => {
    const { cookie } = await signUp('pr-correction');
    const exerciseId = await seedExercise('PR Correction Bench Press');
    const sessionId = randomUUID();
    const sessionExerciseId = randomUUID();
    const baselineSetId = randomUUID();
    const toppingSetId = randomUUID();
    const localDate = '2026-06-18';

    const createBatch: SyncCrudOp[] = [
      workoutSessionOp(sessionId, localDate),
      sessionExerciseOp(sessionExerciseId, sessionId, exerciseId),
      loggedSetOp(baselineSetId, sessionExerciseId, 1, { weight_kg: '80.000', logged_at: `${localDate}T20:10:00.000Z` }),
      loggedSetOp(toppingSetId, sessionExerciseId, 2, { weight_kg: '100.000', logged_at: `${localDate}T20:15:00.000Z` }),
    ];
    const createRes = await push(cookie, createBatch);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const beforeCorrection = await personalRecordRowsForExercise(exerciseId);
    const toppingHeaviestBefore = beforeCorrection.find(
      (row) => row.logged_set_id === toppingSetId && row.pr_type === 'heaviest_weight',
    );
    expect(toppingHeaviestBefore).toBeDefined();
    expect(Number(toppingHeaviestBefore?.value)).toBeCloseTo(100, 3);

    const correctionRes = await push(cookie, [loggedSetPatchOp(toppingSetId, { weight_kg: '70.000' })]);
    expect((correctionRes.body as SyncPushResponse).rejected).toEqual([]);

    const afterCorrection = await personalRecordRowsForExercise(exerciseId);
    // The case Phase 5's own detectPrsForSession comment explicitly deferred to this phase: the
    // superseded row is GONE, not shadowed by a second, still-present row at the lower value.
    expect(
      afterCorrection.find((row) => row.logged_set_id === toppingSetId && row.pr_type === 'heaviest_weight'),
    ).toBeUndefined();
    const baselineHeaviestAfter = afterCorrection.find(
      (row) => row.logged_set_id === baselineSetId && row.pr_type === 'heaviest_weight',
    );
    expect(baselineHeaviestAfter).toBeDefined();
    expect(Number(baselineHeaviestAfter?.value)).toBeCloseTo(80, 3);

    await pg.query('DELETE FROM personal_record WHERE exercise_id = $1', [exerciseId]);
    await pg.query('DELETE FROM workout_session WHERE id = $1', [sessionId]);
  });

  it('every personal_record row for the touched exercise carries a non-null reconciled_at and a strictly increasing server_seq across edits', async () => {
    const { cookie } = await signUp('pr-stamped');
    const exerciseId = await seedExercise('Stamped Overhead Press');
    const sessionId = randomUUID();
    const sessionExerciseId = randomUUID();
    const setId = randomUUID();
    const localDate = '2026-06-19';

    await push(cookie, [
      workoutSessionOp(sessionId, localDate),
      sessionExerciseOp(sessionExerciseId, sessionId, exerciseId),
      loggedSetOp(setId, sessionExerciseId, 1, { weight_kg: '60.000', logged_at: `${localDate}T20:10:00.000Z` }),
    ]);

    const beforeRows = await personalRecordRowsForExercise(exerciseId);
    expect(beforeRows.length).toBeGreaterThan(0);
    for (const row of beforeRows) expect(row.reconciled_at).not.toBeNull();
    const seqBefore = new Map(beforeRows.map((row) => [`${row.logged_set_id}:${row.pr_type}`, BigInt(row.server_seq)]));

    await push(cookie, [loggedSetPatchOp(setId, { weight_kg: '65.000' })]);

    const afterRows = await personalRecordRowsForExercise(exerciseId);
    expect(afterRows.length).toBeGreaterThan(0);
    for (const row of afterRows) {
      expect(row.reconciled_at).not.toBeNull();
      const key = `${row.logged_set_id}:${row.pr_type}`;
      const before = seqBefore.get(key);
      expect(before).toBeDefined();
      expect(BigInt(row.server_seq) > (before as bigint)).toBe(true);
    }

    await pg.query('DELETE FROM personal_record WHERE exercise_id = $1', [exerciseId]);
    await pg.query('DELETE FROM workout_session WHERE id = $1', [sessionId]);
  });

  it("editing one exercise's session leaves a second exercise's personal_record rows byte-identical, including a still-null reconciled_at the server has never touched", async () => {
    const { cookie } = await signUp('pr-scope');
    const touchedExerciseId = await seedExercise('Scope Touched Squat');
    const untouchedExerciseId = await seedExercise('Scope Untouched Deadlift');

    const untouchedPrId = randomUUID();
    seededPersonalRecordIds.push(untouchedPrId);
    const untouchedOp = personalRecordOp(untouchedPrId, {
      exercise_id: untouchedExerciseId,
      pr_type: 'heaviest_weight',
      value: '200.000',
      achieved_at: new Date('2026-06-01T00:00:00Z').toISOString(),
    });
    const untouchedRes = await push(cookie, [untouchedOp]);
    expect((untouchedRes.body as SyncPushResponse).rejected).toEqual([]);

    const beforeUntouched = await personalRecordRow(untouchedPrId);
    expect(beforeUntouched?.reconciled_at).toBeNull();

    const sessionId = randomUUID();
    const sessionExerciseId = randomUUID();
    const setId = randomUUID();
    const localDate = '2026-06-20';
    await push(cookie, [
      workoutSessionOp(sessionId, localDate),
      sessionExerciseOp(sessionExerciseId, sessionId, touchedExerciseId),
      loggedSetOp(setId, sessionExerciseId, 1, { weight_kg: '110.000', logged_at: `${localDate}T20:10:00.000Z` }),
    ]);
    await push(cookie, [loggedSetPatchOp(setId, { weight_kg: '120.000' })]);

    const afterUntouched = await personalRecordRow(untouchedPrId);
    expect(afterUntouched).toEqual(beforeUntouched);

    await pg.query('DELETE FROM personal_record WHERE exercise_id = $1', [touchedExerciseId]);
    await pg.query('DELETE FROM workout_session WHERE id = $1', [sessionId]);
  });
});
