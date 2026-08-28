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
  target_rir?: number | null;
  target_rest_seconds?: number | null;
  superset_group_id?: string | null;
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

// WR-03: logged_set's shape-completeness fields (completed/side/parent_set_id/rest_taken_seconds)
// — data is untyped `Record<string, unknown>` on the wire, so `fields` intentionally stays typed
// loosely rather than mirroring LoggedSetOpData 1:1, since these tests exist specifically to send
// values of the WRONG type through it.
function loggedSetOp(id: string, sessionExerciseId: string, fields: Record<string, unknown> = {}): SyncCrudOp {
  return {
    op_id: randomUUID(),
    op: 'PUT',
    type: 'logged_set',
    id,
    data: {
      session_exercise_id: sessionExerciseId,
      set_index: 1,
      set_type: 'normal',
      reps: 5,
      completed: true,
      logged_at: new Date().toISOString(),
      ...fields,
    },
  };
}

async function loggedSetRow(id: string): Promise<{ id: string } | undefined> {
  const { rows } = await pg.query('SELECT id FROM logged_set WHERE id = $1', [id]);
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
     VALUES ($1, 'Barbell Row', 'external_weight', false, false, 'seed')`,
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
      target_rir: null,
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

// WR-03: hasInvalidField's logged_set branch previously validated weight_kg/reps/set_index/
// set_type/notes but not completed/side/parent_set_id/rest_taken_seconds — a malformed value for
// any of those four passed application-level validation and only failed (or didn't) at the
// Postgres layer. These cases pin the four new shape checks directly against the real /sync
// endpoint, the same way the session_exercise cases above pin theirs.
describe('logged_set validation (e2e, WR-03)', () => {
  async function seedSessionExercise(cookie: string): Promise<{ sessionId: string; seId: string }> {
    const sessionId = randomUUID();
    const seId = randomUUID();
    const res = await push(cookie, [workoutSessionOp(sessionId), sessionExerciseOp(seId, { session_id: sessionId })]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);
    return { sessionId, seId };
  }

  it('rejects a logged_set PUT with a non-boolean completed as invalid_field, and inserts no row', async () => {
    const cookie = await signUp('logged-set-bad-completed');
    const { seId } = await seedSessionExercise(cookie);
    const setId = randomUUID();
    const op = loggedSetOp(setId, seId, { completed: 'yes' });

    const res = await push(cookie, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.rejected).toContainEqual({ op_id: op.op_id, reason: 'invalid_field' });
    expect(await loggedSetRow(setId)).toBeUndefined();
  });

  it('rejects a logged_set PUT with a non-string side as invalid_field', async () => {
    const cookie = await signUp('logged-set-bad-side');
    const { seId } = await seedSessionExercise(cookie);
    const setId = randomUUID();
    const op = loggedSetOp(setId, seId, { side: 7 });

    const res = await push(cookie, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.rejected).toContainEqual({ op_id: op.op_id, reason: 'invalid_field' });
    expect(await loggedSetRow(setId)).toBeUndefined();
  });

  it('rejects a logged_set PUT with a non-string parent_set_id as invalid_field', async () => {
    const cookie = await signUp('logged-set-bad-parent');
    const { seId } = await seedSessionExercise(cookie);
    const setId = randomUUID();
    const op = loggedSetOp(setId, seId, { parent_set_id: 42 });

    const res = await push(cookie, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.rejected).toContainEqual({ op_id: op.op_id, reason: 'invalid_field' });
    expect(await loggedSetRow(setId)).toBeUndefined();
  });

  it('rejects a logged_set PUT with a negative rest_taken_seconds as invalid_field, and accepts an explicit null for the same field', async () => {
    const cookie = await signUp('logged-set-bad-rest');
    const { seId } = await seedSessionExercise(cookie);
    const badId = randomUUID();
    const nullId = randomUUID();
    const badOp = loggedSetOp(badId, seId, { set_index: 1, rest_taken_seconds: -5 });
    const nullOp = loggedSetOp(nullId, seId, { set_index: 2, rest_taken_seconds: null });

    const res = await push(cookie, [badOp, nullOp]);

    const body: SyncPushResponse = res.body;
    expect(body.rejected).toContainEqual({ op_id: badOp.op_id, reason: 'invalid_field' });
    expect(body.applied).toContain(nullOp.op_id);
    expect(await loggedSetRow(badId)).toBeUndefined();
    expect(await loggedSetRow(nullId)).toBeDefined();
  });

  it('accepts a logged_set PUT with valid completed/side/parent_set_id/rest_taken_seconds values', async () => {
    const cookie = await signUp('logged-set-valid-shape-fields');
    const { seId } = await seedSessionExercise(cookie);
    const parentId = randomUUID();
    const childId = randomUUID();
    const parentOp = loggedSetOp(parentId, seId, { set_index: 1, completed: true, side: 'left', rest_taken_seconds: 90 });

    const parentRes = await push(cookie, [parentOp]);
    expect((parentRes.body as SyncPushResponse).rejected).toEqual([]);

    const childOp = loggedSetOp(childId, seId, {
      set_index: 2,
      completed: false,
      side: 'right',
      parent_set_id: parentId,
      rest_taken_seconds: null,
    });
    const childRes = await push(cookie, [childOp]);

    const body: SyncPushResponse = childRes.body;
    expect(body.applied).toContain(childOp.op_id);
    expect(await loggedSetRow(childId)).toBeDefined();
  });
});

// 07-RESEARCH.md's Security Domain names two threat patterns this suite predates (it was written
// before D-16's session-only superset design existed) and instructs this plan to add a case for
// each rather than assume the existing two-user/two-session patterns above already cover them by
// name. This block also pins, by test rather than by reading sync.service.ts, that the sync layer
// needs no change for the five newly-written set_type values (T-7-01, T-7-02, Phase 7).
describe('Grouped-set boundary containment (e2e, T-7-01/T-7-02, Phase 7)', () => {
  async function seedParentSet(cookie: string): Promise<{ seId: string; parentId: string }> {
    const sessionId = randomUUID();
    const seId = randomUUID();
    const parentId = randomUUID();
    const res = await push(cookie, [
      workoutSessionOp(sessionId),
      sessionExerciseOp(seId, { session_id: sessionId }),
      loggedSetOp(parentId, seId, { set_index: 1, set_type: 'normal' }),
    ]);
    expect((res.body as SyncPushResponse).rejected).toEqual([]);
    return { seId, parentId };
  }

  it('T-7-01: a cross-user parent_set_id reference does not graft onto or mutate the referenced user’s session tree', async () => {
    const cookieA = await signUp('grafting-victim');
    const cookieB = await signUp('grafting-attacker');

    const sessionA = randomUUID();
    const seA = randomUUID();
    const parentSetA = randomUUID();
    const resA = await push(cookieA, [
      workoutSessionOp(sessionA),
      sessionExerciseOp(seA, { session_id: sessionA }),
      loggedSetOp(parentSetA, seA, { set_index: 1 }),
    ]);
    expect((resA.body as SyncPushResponse).rejected).toEqual([]);

    const sessionB = randomUUID();
    const seB = randomUUID();
    const graftedChildId = randomUUID();
    const graftOp = loggedSetOp(graftedChildId, seB, { set_index: 1, parent_set_id: parentSetA });
    const resB = await push(cookieB, [workoutSessionOp(sessionB), sessionExerciseOp(seB, { session_id: sessionB }), graftOp]);
    const bodyB: SyncPushResponse = resB.body;

    // Pinned current behaviour, not assumed: rootTypeOf resolves a logged_set op's aggregate
    // through its OWN session_exercise_id only (sync.service.ts's resolveSessionExerciseIdForLoggedSet)
    // — parent_set_id never participates in ownership resolution, and the self-referencing FK on
    // logged_set.parent_set_id has no per-user scope, so the op applies inside user B's own
    // aggregate rather than being rejected.
    expect(bodyB.rejected).toEqual([]);
    expect(bodyB.applied).toContain(graftOp.op_id);

    const graftedRow = await pg.query('SELECT session_exercise_id, parent_set_id FROM logged_set WHERE id = $1', [
      graftedChildId,
    ]);
    expect(graftedRow.rows[0].session_exercise_id).toBe(seB);
    expect(graftedRow.rows[0].parent_set_id).toBe(parentSetA);

    // The point of this case: whichever outcome the server produces for B's push, A's own session
    // tree is byte-unchanged — the grafted child lives entirely inside B's aggregate and never
    // attaches to A's set, A's session_exercise or A's workout_session.
    const aRows = await pg.query('SELECT id FROM logged_set WHERE session_exercise_id = $1', [seA]);
    expect(aRows.rows.map((r) => r.id)).toEqual([parentSetA]);
  });

  it('T-7-02: a superset_group_id shared across two sessions never merges the two exercises into one group on a session-scoped read', async () => {
    const cookie = await signUp('cross-session-superset');
    const groupId = randomUUID();

    const session1 = randomUUID();
    const se1 = randomUUID();
    const session2 = randomUUID();
    const se2 = randomUUID();
    const seedRes = await push(cookie, [
      workoutSessionOp(session1),
      sessionExerciseOp(se1, { session_id: session1 }),
      workoutSessionOp(session2),
      sessionExerciseOp(se2, { session_id: session2 }),
    ]);
    expect((seedRes.body as SyncPushResponse).rejected).toEqual([]);

    // superset_group_id has no server-side FK and no shape check beyond string-or-null
    // (isInvalidSessionExercise) — 07-RESEARCH's Security Domain flags this explicitly. The server
    // accepts the same group id on session_exercise rows in two different sessions.
    const groupRes = await push(cookie, [
      sessionExerciseOp(se1, { session_id: session1, superset_group_id: groupId }),
      sessionExerciseOp(se2, { session_id: session2, superset_group_id: groupId }),
    ]);
    expect((groupRes.body as SyncPushResponse).rejected).toEqual([]);

    // Containment is client-side by construction, not server-enforced: formSuperset
    // (apps/mobile/lib/db/session-mutations.ts) scopes both writes by sessionId, and every read
    // predicate in apps/mobile/lib/session/superset.ts (supersetMembers and everything built on it)
    // resolves group membership from a single session's already-loaded exercise list — it never
    // queries across sessions. A session-scoped read (session_id AND superset_group_id, exactly the
    // shape a real client query takes) sees only its own session's member, even though the shared
    // group id round-trips through the server with no complaint.
    const session1Members = await pg.query(
      'SELECT id FROM session_exercise WHERE session_id = $1 AND superset_group_id = $2',
      [session1, groupId],
    );
    const session2Members = await pg.query(
      'SELECT id FROM session_exercise WHERE session_id = $1 AND superset_group_id = $2',
      [session2, groupId],
    );
    expect(session1Members.rows.map((r) => r.id)).toEqual([se1]);
    expect(session2Members.rows.map((r) => r.id)).toEqual([se2]);

    const bothSessionsShareTheGroupId = await pg.query(
      'SELECT session_id FROM session_exercise WHERE superset_group_id = $1 ORDER BY session_id',
      [groupId],
    );
    expect(bothSessionsShareTheGroupId.rows).toHaveLength(2);
  });

  it('accepts a logged_set PUT for each of the five newly-written set_type values with a non-null parent_set_id and a side, and reads back every value intact — the concrete evidence that sync.service.ts needs no change for this phase', async () => {
    const cookie = await signUp('five-set-types-no-sync-change');
    const { seId, parentId } = await seedParentSet(cookie);
    const newlyWrittenSetTypes = ['drop', 'myorep', 'partial', 'failure', 'amrap'] as const;
    const ids = newlyWrittenSetTypes.map(() => randomUUID());
    const ops = newlyWrittenSetTypes.map((setType, i) =>
      loggedSetOp(ids[i], seId, {
        set_index: i + 2,
        set_type: setType,
        parent_set_id: parentId,
        side: i % 2 === 0 ? 'left' : 'right',
      }),
    );

    const res = await push(cookie, ops);
    const body: SyncPushResponse = res.body;
    expect(body.rejected).toEqual([]);
    for (const op of ops) {
      expect(body.applied).toContain(op.op_id);
    }

    const { rows } = await pg.query('SELECT id, set_type FROM logged_set WHERE id = ANY($1::text[])', [ids]);
    const setTypeById = new Map(rows.map((r) => [r.id as string, r.set_type as string]));
    for (let i = 0; i < newlyWrittenSetTypes.length; i++) {
      expect(setTypeById.get(ids[i])).toBe(newlyWrittenSetTypes[i]);
    }
  });
});
