import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import { SYNC_PUSH_PATH, type SyncCrudOp, type SyncCrudOpType, type SyncPushRequest, type SyncPushResponse } from '@fitness/api-contracts';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as user-exercise-preference.e2e-spec.ts / sync-aggregate.e2e-spec.ts:
// @thallesp/nestjs-better-auth and better-auth are ESM-only, so this suite drives the built
// artifact over real HTTP rather than an in-process testing module.
const AUTH_BASE_PATH = '/v1/auth';
const PASSWORD = 'correct-horse-battery-staple';

let api: ChildProcess;
let baseUrl: string;
let pg: Client;
const createdEmails: string[] = [];
const seededExerciseIds: string[] = [];

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
  const email = `e2e-excl-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

function excludedExerciseOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'excluded_exercise', id, data };
}

interface ExcludedExerciseRow {
  id: string;
  user_id: string;
  exercise_id: string;
  created_at: string;
}

async function excludedRow(id: string): Promise<ExcludedExerciseRow | undefined> {
  const { rows } = await pg.query(
    'SELECT id, user_id, exercise_id, created_at FROM excluded_exercise WHERE id = $1',
    [id],
  );
  return rows[0];
}

async function excludedCountFor(userId: string, exerciseId: string): Promise<number> {
  const { rows } = await pg.query(
    'SELECT count(*)::int AS n FROM excluded_exercise WHERE user_id = $1 AND exercise_id = $2',
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

describe('excluded_exercise sync (e2e)', () => {
  it("stores a PUT against the authenticated session's user id, never a user_id claimed in the payload", async () => {
    const { cookie, userId } = await signUp('claimed-user-id');
    const exerciseId = await seedNullOwnerExercise('Overhead Press (claimed-id target)');
    const exclusionId = randomUUID();

    const op = excludedExerciseOp(exclusionId, { user_id: 'someone-else-entirely', exercise_id: exerciseId });
    const res = await push(cookie, [op]);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([op.op_id]);
    expect(body.rejected).toEqual([]);

    const row = await excludedRow(exclusionId);
    expect(row?.user_id).toBe(userId);
    expect(row?.user_id).not.toBe('someone-else-entirely');
  });

  it('rejects a PUT missing exercise_id with invalid_field, and writes no row', async () => {
    const { cookie } = await signUp('missing-exercise-id');
    const id = randomUUID();
    const op = excludedExerciseOp(id, {});
    const res = await push(cookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);
    expect(await excludedRow(id)).toBeUndefined();
  });

  it('rejects a PUT with an empty-string exercise_id with invalid_field, and writes no row', async () => {
    const { cookie } = await signUp('empty-exercise-id');
    const id = randomUUID();
    const op = excludedExerciseOp(id, { exercise_id: '' });
    const res = await push(cookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);
    expect(await excludedRow(id)).toBeUndefined();
  });

  it('rejects a PUT with a non-string exercise_id with invalid_field, and writes no row', async () => {
    const { cookie } = await signUp('non-string-exercise-id');
    const id = randomUUID();
    const op = excludedExerciseOp(id, { exercise_id: 12345 });
    const res = await push(cookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);
    expect(await excludedRow(id)).toBeUndefined();
  });

  it('rejects a PUT naming an exercise_id that does not exist at all, with a terminal rejection reason, and writes no row', async () => {
    const { cookie } = await signUp('nonexistent-exercise-id');
    const id = randomUUID();
    const op = excludedExerciseOp(id, { exercise_id: randomUUID() });
    const res = await push(cookie, [op]);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0].op_id).toBe(op.op_id);
    // A foreign-key violation classifies as invalid_field (rejection-reason.ts), which
    // isTerminalRejection treats as terminal regardless of table — retrying the identical op
    // against the identical, still-nonexistent exercise can never succeed.
    expect(body.rejected[0].reason).toBe('invalid_field');
    expect(await excludedRow(id)).toBeUndefined();
  });

  it('two users each excluding the same seeded exercise both succeed and produce two distinct rows', async () => {
    const userA = await signUp('shared-exercise-a');
    const userB = await signUp('shared-exercise-b');
    const exerciseId = await seedNullOwnerExercise('Leg Press (shared exclusion target)');

    const idA = randomUUID();
    const idB = randomUUID();
    const resA = await push(userA.cookie, [excludedExerciseOp(idA, { exercise_id: exerciseId })]);
    const resB = await push(userB.cookie, [excludedExerciseOp(idB, { exercise_id: exerciseId })]);
    expect((resA.body as SyncPushResponse).rejected).toEqual([]);
    expect((resB.body as SyncPushResponse).rejected).toEqual([]);

    const rowA = await excludedRow(idA);
    const rowB = await excludedRow(idB);
    expect(rowA?.user_id).toBe(userA.userId);
    expect(rowB?.user_id).toBe(userB.userId);
    expect(rowA?.id).not.toBe(rowB?.id);
  });

  it("a second user's PUT naming the first user's existing row id does not read, retarget or delete that row", async () => {
    const userA = await signUp('cross-user-owner-a');
    const userB = await signUp('cross-user-attacker-b');
    const exerciseIdA = await seedNullOwnerExercise('Barbell Row (cross-user origin)');
    const exerciseIdB = await seedNullOwnerExercise('Cable Row (cross-user attempted retarget)');

    const sharedId = randomUUID();
    const createRes = await push(userA.cookie, [excludedExerciseOp(sharedId, { exercise_id: exerciseIdA })]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const attackRes = await push(userB.cookie, [excludedExerciseOp(sharedId, { exercise_id: exerciseIdB })]);
    const attackBody: SyncPushResponse = attackRes.body;
    expect(attackBody.applied).not.toContain(sharedId);

    const row = await excludedRow(sharedId);
    expect(row?.user_id).toBe(userA.userId);
    expect(row?.exercise_id).toBe(exerciseIdA);
  });

  it('a DELETE against a row the user owns removes it, and the response applies rather than rejecting', async () => {
    const { cookie, userId } = await signUp('delete-owned');
    const exerciseId = await seedNullOwnerExercise('Face Pull (un-exclude target)');

    const id = randomUUID();
    const createRes = await push(cookie, [excludedExerciseOp(id, { exercise_id: exerciseId })]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);
    expect(await excludedRow(id)).toBeDefined();

    const deleteOp = excludedExerciseOp(id, {}, 'DELETE');
    const deleteRes = await push(cookie, [deleteOp]);
    const deleteBody: SyncPushResponse = deleteRes.body;
    expect(deleteBody.applied).toEqual([deleteOp.op_id]);
    expect(deleteBody.rejected).toEqual([]);
    expect(await excludedRow(id)).toBeUndefined();
    expect(await excludedCountFor(userId, exerciseId)).toBe(0);
  });

  it('pushing the same (user, exercise) exclusion twice with the same op id is idempotent and leaves exactly one row', async () => {
    const { cookie, userId } = await signUp('idempotent-push');
    const exerciseId = await seedNullOwnerExercise('Lat Pulldown (idempotent target)');

    const id = randomUUID();
    const firstRes = await push(cookie, [excludedExerciseOp(id, { exercise_id: exerciseId })]);
    expect((firstRes.body as SyncPushResponse).rejected).toEqual([]);

    const secondRes = await push(cookie, [excludedExerciseOp(id, { exercise_id: exerciseId })]);
    expect((secondRes.body as SyncPushResponse).rejected).toEqual([]);

    expect(await excludedCountFor(userId, exerciseId)).toBe(1);
  });
});
