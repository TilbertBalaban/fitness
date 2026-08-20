import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import { SYNC_PUSH_PATH, type SyncCrudOp, type SyncCrudOpType, type SyncPushRequest, type SyncPushResponse } from '@fitness/api-contracts';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as sync-aggregate.e2e-spec.ts: @thallesp/nestjs-better-auth and better-auth are
// ESM-only, so this suite drives the built artifact over real HTTP rather than an in-process
// testing module — copied verbatim, not reconstructed.
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
  const email = `e2e-exercise-sync-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

function exerciseOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'exercise', id, data };
}

function loggedSetOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'logged_set', id, data };
}

interface ExerciseRow {
  id: string;
  user_id: string | null;
  name: string;
  load_type: string;
  movement_pattern: string | null;
  is_custom: boolean;
  source: string;
}

async function exerciseRow(id: string): Promise<ExerciseRow | undefined> {
  const { rows } = await pg.query(
    'SELECT id, user_id, name, load_type, movement_pattern, is_custom, source FROM exercise WHERE id = $1',
    [id],
  );
  return rows[0];
}

async function exerciseCount(ids: string[]): Promise<number> {
  const { rows } = await pg.query('SELECT count(*)::int AS n FROM exercise WHERE id = ANY($1::text[])', [ids]);
  return rows[0].n;
}

// Inserted directly through the pg client, not through the sync endpoint — the endpoint cannot
// produce a null-owner row (toExerciseValues always forces userId from the authenticated
// session), which is exactly the point: a seeded row is only reachable this way.
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

describe('exercise sync (e2e)', () => {
  it('applies a batch containing exactly one PUT exercise op and nothing else — the single highest-value regression case in this phase', async () => {
    const cookie = await signUp('lone-put');
    const exerciseId = randomUUID();
    seededExerciseIds.push(exerciseId);

    const op = exerciseOp(exerciseId, {
      name: 'Cable Face Pull',
      load_type: 'external_weight',
      unilateral: false,
    });
    const res = await push(cookie, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([op.op_id]);
    expect(body.rejected).toEqual([]);

    const row = await exerciseRow(exerciseId);
    expect(row).toBeDefined();
    expect(row?.name).toBe('Cable Face Pull');
  });

  it('pushing the same PUT exercise op id twice leaves exactly one row and both pushes report applied', async () => {
    const cookie = await signUp('idempotent-put');
    const exerciseId = randomUUID();
    seededExerciseIds.push(exerciseId);
    const data = { name: 'Incline Dumbbell Press', load_type: 'external_weight' };

    const first = await push(cookie, [exerciseOp(exerciseId, data)]);
    expect((first.body as SyncPushResponse).rejected).toEqual([]);
    const second = await push(cookie, [exerciseOp(exerciseId, data)]);
    expect((second.body as SyncPushResponse).rejected).toEqual([]);

    expect(await exerciseCount([exerciseId])).toBe(1);
  });

  it('rejects a PUT from an authenticated user targeting a seeded (null-owner) row with not_owner, and the stored row stays owner-less', async () => {
    const cookie = await signUp('seed-takeover');
    const seededId = await seedNullOwnerExercise('Barbell Back Squat (seeded)');

    const before = await exerciseRow(seededId);
    expect(before?.user_id).toBeNull();

    const op = exerciseOp(seededId, { name: 'Barbell Back Squat (hijacked)', load_type: 'external_weight' });
    const res = await push(cookie, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: op.op_id, reason: 'not_owner' }]);

    const after = await exerciseRow(seededId);
    expect(after?.user_id).toBeNull();
    expect(after?.name).toBe('Barbell Back Squat (seeded)');
  });

  it("rejects user B's PATCH against user A's custom exercise with not_owner, and user A's row is unchanged", async () => {
    const cookieA = await signUp('owner-a');
    const cookieB = await signUp('attacker-b');
    const exerciseId = randomUUID();
    seededExerciseIds.push(exerciseId);

    const createRes = await push(cookieA, [exerciseOp(exerciseId, { name: 'Trap Bar Deadlift', load_type: 'external_weight' })]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const patchOp = exerciseOp(exerciseId, { name: 'Stolen Name' }, 'PATCH');
    const res = await push(cookieB, [patchOp]);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: patchOp.op_id, reason: 'not_owner' }]);

    const row = await exerciseRow(exerciseId);
    expect(row?.name).toBe('Trap Bar Deadlift');
  });

  it('rejects a PATCH naming archived_at with invalid_field', async () => {
    const cookie = await signUp('archived-at-reject');
    const exerciseId = randomUUID();
    seededExerciseIds.push(exerciseId);
    const createRes = await push(cookie, [exerciseOp(exerciseId, { name: 'Landmine Press', load_type: 'external_weight' })]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const patchOp = exerciseOp(exerciseId, { archived_at: new Date().toISOString() }, 'PATCH');
    const res = await push(cookie, [patchOp]);
    const body: SyncPushResponse = res.body;
    expect(body.rejected).toEqual([{ op_id: patchOp.op_id, reason: 'invalid_field' }]);
  });

  it('rejects a PUT with an out-of-vocabulary load_type as invalid_field; the same op with a valid load_type applies', async () => {
    const cookie = await signUp('load-type-validate');
    const badId = randomUUID();
    seededExerciseIds.push(badId);
    const badOp = exerciseOp(badId, { name: 'Bogus Load Type Exercise', load_type: 'bogus' });
    const badRes = await push(cookie, [badOp]);
    expect((badRes.body as SyncPushResponse).rejected).toEqual([{ op_id: badOp.op_id, reason: 'invalid_field' }]);
    expect(await exerciseRow(badId)).toBeUndefined();

    const goodId = randomUUID();
    seededExerciseIds.push(goodId);
    const goodOp = exerciseOp(goodId, { name: 'Assisted Pull-Up Machine', load_type: 'assisted' });
    const goodRes = await push(cookie, [goodOp]);
    expect((goodRes.body as SyncPushResponse).applied).toEqual([goodOp.op_id]);
    const row = await exerciseRow(goodId);
    expect(row?.load_type).toBe('assisted');
  });

  it('rejects a PUT with an out-of-vocabulary movement_pattern as invalid_field; a valid one and an explicit null both apply', async () => {
    const cookie = await signUp('movement-pattern-validate');
    const badId = randomUUID();
    seededExerciseIds.push(badId);
    const badOp = exerciseOp(badId, {
      name: 'Bogus Movement Pattern Exercise',
      load_type: 'external_weight',
      movement_pattern: 'bogus',
    });
    const badRes = await push(cookie, [badOp]);
    expect((badRes.body as SyncPushResponse).rejected).toEqual([{ op_id: badOp.op_id, reason: 'invalid_field' }]);
    expect(await exerciseRow(badId)).toBeUndefined();

    const goodId = randomUUID();
    seededExerciseIds.push(goodId);
    const goodOp = exerciseOp(goodId, {
      name: 'Romanian Deadlift',
      load_type: 'external_weight',
      movement_pattern: 'hinge',
    });
    const goodRes = await push(cookie, [goodOp]);
    expect((goodRes.body as SyncPushResponse).applied).toEqual([goodOp.op_id]);
    expect((await exerciseRow(goodId))?.movement_pattern).toBe('hinge');

    // Nullable by design — the column has no CHECK and the client validator skips null too,
    // so an unset pattern must not be mistaken for an invalid one.
    const nullId = randomUUID();
    seededExerciseIds.push(nullId);
    const nullOp = exerciseOp(nullId, {
      name: 'Unclassified Machine',
      load_type: 'external_weight',
      movement_pattern: null,
    });
    const nullRes = await push(cookie, [nullOp]);
    expect((nullRes.body as SyncPushResponse).applied).toEqual([nullOp.op_id]);
    expect((await exerciseRow(nullId))?.movement_pattern).toBeNull();
  });

  it('rejects a DELETE exercise op with invalid_field and the row survives — D-05 archive-only, never hard-deleted', async () => {
    const cookie = await signUp('delete-reject');
    const exerciseId = randomUUID();
    seededExerciseIds.push(exerciseId);
    const createRes = await push(cookie, [exerciseOp(exerciseId, { name: 'Hack Squat', load_type: 'external_weight' })]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const deleteOp = exerciseOp(exerciseId, {}, 'DELETE');
    const res = await push(cookie, [deleteOp]);
    const body: SyncPushResponse = res.body;
    expect(body.rejected).toEqual([{ op_id: deleteOp.op_id, reason: 'invalid_field' }]);
    expect(await exerciseRow(exerciseId)).toBeDefined();
  });

  it('duplicate-from-seed: a PUT with a fresh client UUID and field values copied from a seeded row applies, is owned by the pusher, is_custom true, source user, and leaves the seeded row untouched', async () => {
    const cookie = await signUp('duplicate-from-seed');
    const seededId = await seedNullOwnerExercise('Leg Press (seeded)');

    const copyId = randomUUID();
    seededExerciseIds.push(copyId);
    const copyOp = exerciseOp(copyId, {
      name: 'Leg Press (my gym variant)',
      load_type: 'external_weight',
      variation_of_id: null,
    });
    const res = await push(cookie, [copyOp]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);

    const copyRow = await exerciseRow(copyId);
    expect(copyRow?.is_custom).toBe(true);
    expect(copyRow?.source).toBe('user');
    expect(copyRow?.name).toBe('Leg Press (my gym variant)');

    const seededRow = await exerciseRow(seededId);
    expect(seededRow?.name).toBe('Leg Press (seeded)');
    expect(seededRow?.user_id).toBeNull();
  });

  it('two devices pushing two distinct client UUIDs concurrently produce two rows', async () => {
    const cookie = await signUp('two-distinct-concurrent');
    const idA = randomUUID();
    const idB = randomUUID();
    seededExerciseIds.push(idA, idB);

    const [resA, resB] = await Promise.all([
      push(cookie, [exerciseOp(idA, { name: 'Device A Exercise', load_type: 'external_weight' })]),
      push(cookie, [exerciseOp(idB, { name: 'Device B Exercise', load_type: 'external_weight' })]),
    ]);
    expect((resA.body as SyncPushResponse).rejected).toEqual([]);
    expect((resB.body as SyncPushResponse).rejected).toEqual([]);
    expect(await exerciseCount([idA, idB])).toBe(2);
  });

  it('two devices pushing the same client UUID concurrently converge to one row with no partially-written columns', async () => {
    const cookie = await signUp('same-uuid-concurrent');
    const sharedId = randomUUID();
    seededExerciseIds.push(sharedId);

    const [resA, resB] = await Promise.all([
      push(cookie, [exerciseOp(sharedId, { name: 'Converge A', load_type: 'external_weight', cue_text: 'from A' })]),
      push(cookie, [exerciseOp(sharedId, { name: 'Converge B', load_type: 'bodyweight', cue_text: 'from B' })]),
    ]);
    expect((resA.body as SyncPushResponse).rejected).toEqual([]);
    expect((resB.body as SyncPushResponse).rejected).toEqual([]);

    expect(await exerciseCount([sharedId])).toBe(1);
    const row = await exerciseRow(sharedId);
    expect(row).toBeDefined();
    // Last-write-wins overwrite policy (conflict-policy.ts's default for any table outside
    // CONFLICT_LOGGED_TABLES) — the winner is one push's full value set, never a merge of both.
    expect(['Converge A', 'Converge B']).toContain(row?.name);
    expect(['external_weight', 'bodyweight']).toContain(row?.load_type);
  });

  it('a batch with one exercise op plus one orphaned logged_set op rejects the logged_set as missing_parent, never healed onto the exercise root', async () => {
    const cookie = await signUp('no-heal-onto-exercise');
    const exerciseId = randomUUID();
    seededExerciseIds.push(exerciseId);

    const orphanSetOp = loggedSetOp(randomUUID(), {
      session_exercise_id: randomUUID(),
      set_index: 1,
      set_type: 'normal',
      weight_kg: '20.000',
      reps: 10,
      completed: true,
      logged_at: new Date().toISOString(),
    });
    const batch: SyncCrudOp[] = [
      exerciseOp(exerciseId, { name: 'Solo Exercise Op', load_type: 'external_weight' }),
      orphanSetOp,
    ];
    const res = await push(cookie, batch);
    const body: SyncPushResponse = res.body;

    expect(body.applied).toEqual(expect.arrayContaining([batch[0].op_id]));
    const orphanRejection = body.rejected.find((r) => r.op_id === orphanSetOp.op_id);
    expect(orphanRejection).toEqual({ op_id: orphanSetOp.op_id, reason: 'missing_parent' });
  });
});
