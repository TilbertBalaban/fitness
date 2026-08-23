import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import { SYNC_PUSH_PATH, type SyncCrudOp, type SyncCrudOpType, type SyncPushRequest, type SyncPushResponse } from '@fitness/api-contracts';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as sync-aggregate.e2e-spec.ts / exercise-sync.e2e-spec.ts: @thallesp/nestjs-better-auth
// and better-auth are ESM-only, so this suite drives the built artifact over real HTTP rather than
// an in-process testing module.
const AUTH_BASE_PATH = '/v1/auth';
const PASSWORD = 'correct-horse-battery-staple';

let api: ChildProcess;
let baseUrl: string;
let pg: Client;
const createdEmails: string[] = [];
const seededExerciseIds: string[] = [];
const seededWorkoutSessionIds: string[] = [];
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
  const email = `e2e-uep-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

function userExercisePreferenceOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'user_exercise_preference', id, data };
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

function sessionExerciseOp(id: string, sessionId: string, exerciseId: string, overrides: Partial<SyncCrudOp> = {}): SyncCrudOp {
  return {
    op_id: randomUUID(),
    op: 'PUT',
    type: 'session_exercise',
    id,
    data: { session_id: sessionId, exercise_id: exerciseId, order_index: 0 },
    ...overrides,
  };
}

interface UserExercisePreferenceRow {
  id: string;
  user_id: string;
  exercise_id: string;
  archived_at: string | null;
  never_suggest: boolean;
}

async function uepRow(id: string): Promise<UserExercisePreferenceRow | undefined> {
  const { rows } = await pg.query(
    'SELECT id, user_id, exercise_id, archived_at, never_suggest FROM user_exercise_preference WHERE id = $1',
    [id],
  );
  return rows[0];
}

async function uepCountFor(userId: string, exerciseId: string): Promise<number> {
  const { rows } = await pg.query(
    'SELECT count(*)::int AS n FROM user_exercise_preference WHERE user_id = $1 AND exercise_id = $2',
    [userId, exerciseId],
  );
  return rows[0].n;
}

async function seedNullOwnerExercise(name: string): Promise<string> {
  const id = randomUUID();
  seededExerciseIds.push(id);
  await pg.query(
    `INSERT INTO exercise (id, name, load_type, is_custom, unilateral, source)
     VALUES ($1, $2, 'external_weight', false, false, 'seed')`,
    [id, name],
  );
  return id;
}

async function seedPersonalRecord(userId: string, exerciseId: string): Promise<string> {
  const id = randomUUID();
  seededPersonalRecordIds.push(id);
  await pg.query(
    `INSERT INTO personal_record (id, user_id, exercise_id, pr_type, value, achieved_at)
     VALUES ($1, $2, $3, 'best_e1rm', '100.000', now())`,
    [id, userId, exerciseId],
  );
  return id;
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
    if (seededWorkoutSessionIds.length > 0) {
      await pg.query('DELETE FROM workout_session WHERE id = ANY($1::text[])', [seededWorkoutSessionIds]);
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

describe('user_exercise_preference sync (e2e)', () => {
  it("stores a PUT against the authenticated session's user id, never a user_id claimed in the payload", async () => {
    const { cookie, userId } = await signUp('claimed-user-id');
    const exerciseId = await seedNullOwnerExercise('Cable Fly (claimed-id target)');
    const prefId = randomUUID();

    const op = userExercisePreferenceOp(prefId, {
      user_id: 'someone-else-entirely',
      exercise_id: exerciseId,
      never_suggest: true,
    });
    const res = await push(cookie, [op]);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([op.op_id]);
    expect(body.rejected).toEqual([]);

    const row = await uepRow(prefId);
    expect(row?.user_id).toBe(userId);
    expect(row?.user_id).not.toBe('someone-else-entirely');
  });

  it('rejects a PUT missing exercise_id with invalid_field', async () => {
    const { cookie } = await signUp('missing-exercise-id');
    const op = userExercisePreferenceOp(randomUUID(), { never_suggest: true });
    const res = await push(cookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);
  });

  it("archiving a seeded exercise for user A leaves user B's view of it unarchived, and session_exercise/personal_record rows referencing that exercise stay resolvable", async () => {
    const userA = await signUp('archive-owner-a');
    const userB = await signUp('archive-viewer-b');
    const exerciseId = await seedNullOwnerExercise('Preacher Curl (archive-history target)');

    const sessionId = randomUUID();
    const sessionExerciseId = randomUUID();
    seededWorkoutSessionIds.push(sessionId);
    const seedRes = await push(userA.cookie, [
      workoutSessionOp(sessionId),
      sessionExerciseOp(sessionExerciseId, sessionId, exerciseId),
    ]);
    expect((seedRes.body as SyncPushResponse).rejected).toEqual([]);
    const prId = await seedPersonalRecord(userA.userId, exerciseId);

    const archivePrefId = randomUUID();
    const archiveOp = userExercisePreferenceOp(archivePrefId, {
      exercise_id: exerciseId,
      archived_at: new Date().toISOString(),
      never_suggest: false,
    });
    const archiveRes = await push(userA.cookie, [archiveOp]);
    expect((archiveRes.body as SyncPushResponse).rejected).toEqual([]);

    const rowA = await uepRow(archivePrefId);
    expect(rowA?.archived_at).not.toBeNull();
    expect(rowA?.user_id).toBe(userA.userId);

    // User B has no preference row at all for this exercise — the exercise itself was never
    // mutated, so B's view (an absent row = not archived) is unaffected by A's archive.
    const bCount = await uepCountFor(userB.userId, exerciseId);
    expect(bCount).toBe(0);

    const { rows: sessionExerciseRows } = await pg.query(
      'SELECT exercise_id FROM session_exercise WHERE id = $1',
      [sessionExerciseId],
    );
    expect(sessionExerciseRows[0].exercise_id).toBe(exerciseId);
    const { rows: exerciseStillExists } = await pg.query('SELECT id FROM exercise WHERE id = $1', [exerciseId]);
    expect(exerciseStillExists).toHaveLength(1);

    const { rows: prRows } = await pg.query('SELECT exercise_id FROM personal_record WHERE id = $1', [prId]);
    expect(prRows[0].exercise_id).toBe(exerciseId);
  });

  it('a second archive push for the same (user, exercise) updates the existing row rather than violating the unique constraint', async () => {
    const { cookie, userId } = await signUp('second-archive-push');
    const exerciseId = await seedNullOwnerExercise('Dumbbell Lateral Raise (double-archive target)');

    const firstId = randomUUID();
    const firstRes = await push(cookie, [
      userExercisePreferenceOp(firstId, { exercise_id: exerciseId, never_suggest: false }),
    ]);
    expect((firstRes.body as SyncPushResponse).rejected).toEqual([]);

    // Second push reuses the same client-generated id — this is how a device idempotently
    // re-applies its own local row, and is also how a PATCH-style update against the same
    // preference is expressed (PUT is a full replace per D-03/Decision 2).
    const secondRes = await push(cookie, [
      userExercisePreferenceOp(firstId, { exercise_id: exerciseId, archived_at: new Date().toISOString(), never_suggest: false }),
    ]);
    expect((secondRes.body as SyncPushResponse).rejected).toEqual([]);

    expect(await uepCountFor(userId, exerciseId)).toBe(1);
    const row = await uepRow(firstId);
    expect(row?.archived_at).not.toBeNull();
  });

  it('a PATCH naming a different exercise_id cannot re-target an existing preference row — stored linkage wins', async () => {
    const { cookie, userId } = await signUp('uep-patch-retarget');
    const originalExerciseId = await seedNullOwnerExercise('Cable Fly (patch re-target origin)');
    const otherExerciseId = await seedNullOwnerExercise('Pec Deck (patch re-target destination)');

    const prefId = randomUUID();
    const createRes = await push(cookie, [
      userExercisePreferenceOp(prefId, { exercise_id: originalExerciseId, never_suggest: true }),
    ]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    // exercise_id is required on every non-DELETE op (hasInvalidField), so a PATCH always carries
    // one — naming a different exercise here is the whole attack surface. The PATCH's own field
    // (never_suggest) must still apply; only the identity column is pinned.
    const patchRes = await push(cookie, [
      userExercisePreferenceOp(prefId, { exercise_id: otherExerciseId, never_suggest: false }, 'PATCH'),
    ]);
    expect((patchRes.body as SyncPushResponse).rejected).toEqual([]);

    const row = await uepRow(prefId);
    expect(row?.exercise_id).toBe(originalExerciseId);
    expect(row?.never_suggest).toBe(false);
    expect(await uepCountFor(userId, otherExerciseId)).toBe(0);
  });

  it('a PUT naming a different exercise_id cannot re-target an existing preference row either', async () => {
    const { cookie, userId } = await signUp('uep-put-retarget');
    const originalExerciseId = await seedNullOwnerExercise('Seated Row (put re-target origin)');
    const otherExerciseId = await seedNullOwnerExercise('Chest Supported Row (put re-target destination)');

    const prefId = randomUUID();
    await push(cookie, [userExercisePreferenceOp(prefId, { exercise_id: originalExerciseId, never_suggest: true })]);

    const putRes = await push(cookie, [
      userExercisePreferenceOp(prefId, { exercise_id: otherExerciseId, never_suggest: true }),
    ]);
    expect((putRes.body as SyncPushResponse).rejected).toEqual([]);

    const row = await uepRow(prefId);
    expect(row?.exercise_id).toBe(originalExerciseId);
    expect(await uepCountFor(userId, otherExerciseId)).toBe(0);
  });
});
