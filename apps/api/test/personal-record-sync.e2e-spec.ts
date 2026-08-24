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
});
