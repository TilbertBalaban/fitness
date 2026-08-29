import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import { SYNC_PUSH_PATH, type SyncCrudOp, type SyncCrudOpType, type SyncPushRequest, type SyncPushResponse } from '@fitness/api-contracts';

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
  const email = `e2e-patch-partial-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

function workoutSessionOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'workout_session', id, data };
}

function sessionExerciseOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'session_exercise', id, data };
}

function loggedSetOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'logged_set', id, data };
}

interface WorkoutSessionRow {
  routine_day_id: string | null;
  equipment_profile_id: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
  device_id: string | null;
  timezone: string;
  local_date: string;
}

// Read every date/timestamp column through an explicit ::text cast. The `pg` driver otherwise
// parses `date`/`timestamp` OIDs into JavaScript `Date` objects interpreted in the runner's local
// zone, so a comparison against a driver-parsed Date could pass or fail for timezone reasons
// rather than for the reason under test — precisely the failure class LOG-22 exists to prevent.
async function readWorkoutSession(id: string): Promise<WorkoutSessionRow> {
  const { rows } = await pg.query(
    `SELECT routine_day_id, equipment_profile_id, started_at::text AS started_at,
            ended_at::text AS ended_at, status, device_id, timezone, local_date::text AS local_date
     FROM workout_session WHERE id = $1`,
    [id],
  );
  return rows[0];
}

interface SessionExerciseRow {
  exercise_id: string;
  order_index: number;
  superset_group_id: string | null;
  routine_exercise_id: string | null;
  target_sets: number | null;
  target_rep_min: number | null;
  target_rep_max: number | null;
  target_rir_min: number | null;
  target_rir_max: number | null;
  target_rest_seconds: number | null;
}

async function readSessionExercise(id: string): Promise<SessionExerciseRow> {
  const { rows } = await pg.query(
    `SELECT exercise_id, order_index, superset_group_id, routine_exercise_id, target_sets,
            target_rep_min, target_rep_max, target_rir_min, target_rir_max, target_rest_seconds
     FROM session_exercise WHERE id = $1`,
    [id],
  );
  return rows[0];
}

interface LoggedSetRow {
  set_index: number;
  set_type: string;
  weight_kg: string | null;
  reps: number;
  rir: number | null;
  side: string | null;
  completed: boolean;
  parent_set_id: string | null;
  rest_taken_seconds: number | null;
  logged_at: string;
}

async function readLoggedSet(id: string): Promise<LoggedSetRow> {
  const { rows } = await pg.query(
    `SELECT set_index, set_type, weight_kg, reps, rir, side, completed, parent_set_id,
            rest_taken_seconds, logged_at::text AS logged_at
     FROM logged_set WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function conflictLogRowsFor(rowId: string): Promise<{ winning_value: Record<string, unknown> }[]> {
  const { rows } = await pg.query(
    'SELECT winning_value FROM sync_conflict_log WHERE row_id = $1 ORDER BY detected_at ASC',
    [rowId],
  );
  return rows;
}

async function seedWorkoutSessionAndExercise(
  cookie: string,
  sessionData: Record<string, unknown>,
  exerciseData: Record<string, unknown> = {},
): Promise<{ sessionId: string; sessionExerciseId: string }> {
  const sessionId = randomUUID();
  const sessionExerciseId = randomUUID();
  const res = await push(cookie, [
    workoutSessionOp(sessionId, sessionData),
    sessionExerciseOp(sessionExerciseId, { session_id: sessionId, exercise_id: exerciseId, order_index: 0, ...exerciseData }),
  ]);
  expect((res.body as SyncPushResponse).rejected).toEqual([]);
  return { sessionId, sessionExerciseId };
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
     VALUES ($1, 'Pull-Up', 'bodyweight', false, false, 'seed')`,
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

describe('PATCH partial-update apply path (e2e)', () => {
  it('LOG-22: a {status, ended_at}-only finish PATCH changes only status/ended_at and leaves started_at, timezone, local_date, device_id, routine_day_id, equipment_profile_id byte-identical', async () => {
    const cookie = await signUp('log22-finish');
    const sessionId = randomUUID();

    const seedOp = workoutSessionOp(sessionId, {
      started_at: new Date('2026-06-16T03:45:00Z').toISOString(),
      status: 'in_progress',
      timezone: 'America/New_York',
      local_date: '2026-06-15',
      device_id: 'phone-a1',
      routine_day_id: 'rd-1',
      equipment_profile_id: 'ep-1',
    });
    const seedRes = await push(cookie, [seedOp]);
    expect((seedRes.body as SyncPushResponse).rejected).toEqual([]);

    const before = await readWorkoutSession(sessionId);
    expect(before.status).toBe('in_progress');
    expect(before.ended_at).toBeNull();

    const patchOp = workoutSessionOp(
      sessionId,
      { status: 'completed', ended_at: new Date('2026-06-16T04:30:00Z').toISOString() },
      'PATCH',
    );
    const patchRes = await push(cookie, [patchOp]);
    expect((patchRes.body as SyncPushResponse).applied).toEqual([patchOp.op_id]);
    expect((patchRes.body as SyncPushResponse).rejected).toEqual([]);

    const after = await readWorkoutSession(sessionId);

    // Changed
    expect(after.status).toBe('completed');
    expect(after.ended_at).not.toBeNull();

    // Survived — read via ::text, not a driver-parsed Date.
    expect(after.started_at).toBe(before.started_at);
    expect(after.timezone).toBe(before.timezone);
    expect(after.local_date).toBe(before.local_date);
    expect(after.device_id).toBe(before.device_id);
    expect(after.routine_day_id).toBe(before.routine_day_id);
    expect(after.equipment_profile_id).toBe(before.equipment_profile_id);

    // LOG-22 discriminator: local_date is the client's stamp, not a server recomputation from
    // started_at's UTC calendar day — the two must still differ after the PATCH.
    expect(after.local_date).toBe('2026-06-15');
    expect(after.started_at.slice(0, 10)).toBe('2026-06-16');
    expect(after.local_date).not.toBe(after.started_at.slice(0, 10));
  });

  it('session_exercise reorder PATCH changes only order_index and leaves the other eight columns untouched', async () => {
    const cookie = await signUp('se-reorder');
    const { sessionExerciseId } = await seedWorkoutSessionAndExercise(
      cookie,
      { started_at: new Date('2026-06-15T20:00:00Z').toISOString(), status: 'in_progress', timezone: 'America/New_York', local_date: '2026-06-15' },
      {
        order_index: 2,
        superset_group_id: 'sg-1',
        routine_exercise_id: 're-1',
        target_sets: 4,
        target_rep_min: 6,
        target_rep_max: 10,
        target_rir_min: 1,
        target_rir_max: 3,
        target_rest_seconds: 180,
      },
    );

    const before = await readSessionExercise(sessionExerciseId);
    expect(before.order_index).toBe(2);

    // exercise_id is deliberately included: isInvalidSessionExercise requires a non-empty
    // exercise_id on every non-DELETE op (the empty-string-FK guard, see 02-13-PLAN.md's
    // deliberate_deferrals), so a payload without it never reaches the update path at all. Do
    // not simplify this payload down to { order_index: 5 } alone.
    const patchOp = sessionExerciseOp(sessionExerciseId, { exercise_id: exerciseId, order_index: 5 }, 'PATCH');
    const patchRes = await push(cookie, [patchOp]);
    expect((patchRes.body as SyncPushResponse).applied).toEqual([patchOp.op_id]);
    expect((patchRes.body as SyncPushResponse).rejected).toEqual([]);

    const after = await readSessionExercise(sessionExerciseId);
    expect(after.order_index).toBe(5);
    expect(after.superset_group_id).toBe(before.superset_group_id);
    expect(after.routine_exercise_id).toBe(before.routine_exercise_id);
    expect(after.target_sets).toBe(before.target_sets);
    expect(after.target_rep_min).toBe(before.target_rep_min);
    expect(after.target_rep_max).toBe(before.target_rep_max);
    expect(after.target_rir_min).toBe(before.target_rir_min);
    expect(after.target_rir_max).toBe(before.target_rir_max);
    expect(after.target_rest_seconds).toBe(before.target_rest_seconds);
  });

  it('logged_set reps-only PATCH changes only reps and leaves the other nine columns untouched', async () => {
    const cookie = await signUp('ls-reps-only');
    const { sessionExerciseId } = await seedWorkoutSessionAndExercise(cookie, {
      started_at: new Date('2026-06-15T20:00:00Z').toISOString(),
      status: 'in_progress',
      timezone: 'America/New_York',
      local_date: '2026-06-15',
    });

    const parentId = randomUUID();
    const parentRes = await push(cookie, [
      loggedSetOp(parentId, {
        session_exercise_id: sessionExerciseId,
        set_index: 1,
        set_type: 'normal',
        weight_kg: '60.000',
        reps: 10,
        completed: true,
        logged_at: new Date('2026-06-16T03:40:00Z').toISOString(),
      }),
    ]);
    expect((parentRes.body as SyncPushResponse).rejected).toEqual([]);

    const childId = randomUUID();
    const childRes = await push(cookie, [
      loggedSetOp(childId, {
        session_exercise_id: sessionExerciseId,
        set_index: 3,
        set_type: 'myorep',
        weight_kg: '61.250',
        reps: 12,
        rir: 1,
        side: 'left',
        completed: true,
        parent_set_id: parentId,
        rest_taken_seconds: 90,
        logged_at: new Date('2026-06-16T03:50:00Z').toISOString(),
      }),
    ]);
    expect((childRes.body as SyncPushResponse).rejected).toEqual([]);

    const before = await readLoggedSet(childId);
    expect(before.reps).toBe(12);

    const patchOp = loggedSetOp(childId, { reps: 15 }, 'PATCH');
    const patchRes = await push(cookie, [patchOp]);
    expect((patchRes.body as SyncPushResponse).applied).toEqual([patchOp.op_id]);
    expect((patchRes.body as SyncPushResponse).rejected).toEqual([]);

    const after = await readLoggedSet(childId);
    // The named column actually took the PATCH's value — without this, an update set that
    // filtered every column out would satisfy every survival assertion below while silently
    // discarding the user's edit.
    expect(after.reps).toBe(15);
    expect(after.set_index).toBe(before.set_index);
    expect(after.set_type).toBe(before.set_type);
    expect(after.weight_kg).toBe(before.weight_kg);
    expect(after.rir).toBe(before.rir);
    expect(after.side).toBe(before.side);
    expect(after.completed).toBe(before.completed);
    expect(after.parent_set_id).toBe(before.parent_set_id);
    expect(after.rest_taken_seconds).toBe(before.rest_taken_seconds);
    expect(after.logged_at).toBe(before.logged_at);
  });

  it('logged_set weight-only PATCH changes only weight_kg and leaves the other nine columns untouched — the mirror blind spot the explicit-null case shares', async () => {
    const cookie = await signUp('ls-weight-only');
    const { sessionExerciseId } = await seedWorkoutSessionAndExercise(cookie, {
      started_at: new Date('2026-06-15T20:00:00Z').toISOString(),
      status: 'in_progress',
      timezone: 'America/New_York',
      local_date: '2026-06-15',
    });

    const parentId = randomUUID();
    const parentRes = await push(cookie, [
      loggedSetOp(parentId, {
        session_exercise_id: sessionExerciseId,
        set_index: 1,
        set_type: 'normal',
        weight_kg: '60.000',
        reps: 10,
        completed: true,
        logged_at: new Date('2026-06-16T03:40:00Z').toISOString(),
      }),
    ]);
    expect((parentRes.body as SyncPushResponse).rejected).toEqual([]);

    const childId = randomUUID();
    const childRes = await push(cookie, [
      loggedSetOp(childId, {
        session_exercise_id: sessionExerciseId,
        set_index: 3,
        set_type: 'myorep',
        weight_kg: '61.250',
        reps: 12,
        rir: 1,
        side: 'left',
        completed: true,
        parent_set_id: parentId,
        rest_taken_seconds: 90,
        logged_at: new Date('2026-06-16T03:50:00Z').toISOString(),
      }),
    ]);
    expect((childRes.body as SyncPushResponse).rejected).toEqual([]);

    const before = await readLoggedSet(childId);
    expect(before.weight_kg).toBe('61.250');

    const patchOp = loggedSetOp(childId, { weight_kg: '65.000' }, 'PATCH');
    const patchRes = await push(cookie, [patchOp]);
    expect((patchRes.body as SyncPushResponse).applied).toEqual([patchOp.op_id]);
    expect((patchRes.body as SyncPushResponse).rejected).toEqual([]);

    const after = await readLoggedSet(childId);
    expect(after.weight_kg).toBe('65.000');
    expect(after.set_index).toBe(before.set_index);
    expect(after.set_type).toBe(before.set_type);
    expect(after.reps).toBe(before.reps);
    expect(after.rir).toBe(before.rir);
    expect(after.side).toBe(before.side);
    expect(after.completed).toBe(before.completed);
    expect(after.parent_set_id).toBe(before.parent_set_id);
    expect(after.rest_taken_seconds).toBe(before.rest_taken_seconds);
    expect(after.logged_at).toBe(before.logged_at);
  });

  it('PUT still fully replaces workout_session — omitted device_id/routine_day_id/equipment_profile_id null out', async () => {
    const cookie = await signUp('ws-put-replace');
    const sessionId = randomUUID();
    const putOne = workoutSessionOp(sessionId, {
      started_at: new Date('2026-06-15T20:00:00Z').toISOString(),
      status: 'in_progress',
      timezone: 'America/New_York',
      local_date: '2026-06-15',
      device_id: 'phone-a1',
      routine_day_id: 'rd-1',
      equipment_profile_id: 'ep-1',
    });
    const res1 = await push(cookie, [putOne]);
    expect((res1.body as SyncPushResponse).rejected).toEqual([]);

    const before = await readWorkoutSession(sessionId);
    expect(before.device_id).toBe('phone-a1');

    const putTwo = workoutSessionOp(sessionId, {
      started_at: new Date('2026-06-17T10:00:00Z').toISOString(),
      status: 'completed',
      timezone: 'UTC',
      local_date: '2026-06-17',
    });
    const res2 = await push(cookie, [putTwo]);
    expect((res2.body as SyncPushResponse).applied).toEqual([putTwo.op_id]);
    expect((res2.body as SyncPushResponse).rejected).toEqual([]);

    const after = await readWorkoutSession(sessionId);
    expect(after.device_id).toBeNull();
    expect(after.routine_day_id).toBeNull();
    expect(after.equipment_profile_id).toBeNull();
    expect(after.status).toBe('completed');
    expect(after.timezone).toBe('UTC');
    expect(after.local_date).toBe('2026-06-17');
  });

  it('PUT still fully replaces logged_set — omitted completed/rir/side/rest_taken_seconds default out', async () => {
    const cookie = await signUp('ls-put-replace');
    const { sessionExerciseId } = await seedWorkoutSessionAndExercise(cookie, {
      started_at: new Date('2026-06-15T20:00:00Z').toISOString(),
      status: 'in_progress',
      timezone: 'America/New_York',
      local_date: '2026-06-15',
    });

    const setId = randomUUID();
    const putOne = loggedSetOp(setId, {
      session_exercise_id: sessionExerciseId,
      set_index: 1,
      set_type: 'normal',
      weight_kg: '50.000',
      reps: 8,
      rir: 2,
      side: 'left',
      completed: true,
      rest_taken_seconds: 90,
      logged_at: new Date('2026-06-16T03:40:00Z').toISOString(),
    });
    const res1 = await push(cookie, [putOne]);
    expect((res1.body as SyncPushResponse).rejected).toEqual([]);

    const before = await readLoggedSet(setId);
    expect(before.completed).toBe(true);

    const putTwo = loggedSetOp(setId, {
      session_exercise_id: sessionExerciseId,
      set_index: 4,
      set_type: 'normal',
      weight_kg: '50.000',
      reps: 8,
      logged_at: new Date('2026-06-16T03:41:00Z').toISOString(),
    });
    const res2 = await push(cookie, [putTwo]);
    expect((res2.body as SyncPushResponse).applied).toEqual([putTwo.op_id]);
    expect((res2.body as SyncPushResponse).rejected).toEqual([]);

    const after = await readLoggedSet(setId);
    expect(after.completed).toBe(false);
    expect(after.rir).toBeNull();
    expect(after.side).toBeNull();
    expect(after.rest_taken_seconds).toBeNull();
    expect(after.set_index).toBe(4);
  });

  it('conflict log agrees with the row for a completed logged_set: winning_value.set_index equals the stored set_index', async () => {
    const cookie = await signUp('conflict-agree');
    const { sessionExerciseId } = await seedWorkoutSessionAndExercise(cookie, {
      started_at: new Date('2026-06-15T20:00:00Z').toISOString(),
      status: 'in_progress',
      timezone: 'America/New_York',
      local_date: '2026-06-15',
    });

    const setId = randomUUID();
    const putOne = loggedSetOp(setId, {
      session_exercise_id: sessionExerciseId,
      set_index: 1,
      set_type: 'normal',
      weight_kg: '50.000',
      reps: 8,
      rir: 2,
      completed: true,
      logged_at: new Date('2026-06-16T03:40:00Z').toISOString(),
    });
    const res1 = await push(cookie, [putOne]);
    expect((res1.body as SyncPushResponse).rejected).toEqual([]);

    const patchOp = loggedSetOp(setId, { reps: 12 }, 'PATCH');
    const patchRes = await push(cookie, [patchOp]);
    expect((patchRes.body as SyncPushResponse).applied).toEqual([patchOp.op_id]);
    expect((patchRes.body as SyncPushResponse).rejected).toEqual([]);

    const after = await readLoggedSet(setId);
    const conflicts = await conflictLogRowsFor(setId);
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    const latest = conflicts[conflicts.length - 1];
    expect(Number(latest.winning_value.set_index)).toBe(after.set_index);
    expect(after.set_index).toBe(1);
  });

  it('one realistic finish batch — workout_session/session_exercise/logged_set PATCHes together all apply and every omitted column survives', async () => {
    const cookie = await signUp('finish-batch');
    const sessionId = randomUUID();
    const sessionExerciseId = randomUUID();
    const setId = randomUUID();

    const seedRes = await push(cookie, [
      workoutSessionOp(sessionId, {
        started_at: new Date('2026-06-16T03:45:00Z').toISOString(),
        status: 'in_progress',
        timezone: 'America/New_York',
        local_date: '2026-06-15',
        device_id: 'phone-a1',
      }),
      sessionExerciseOp(sessionExerciseId, {
        session_id: sessionId,
        exercise_id: exerciseId,
        order_index: 1,
        target_sets: 4,
      }),
      loggedSetOp(setId, {
        session_exercise_id: sessionExerciseId,
        set_index: 2,
        set_type: 'normal',
        weight_kg: '70.000',
        reps: 8,
        completed: true,
        logged_at: new Date('2026-06-16T03:50:00Z').toISOString(),
      }),
    ]);
    expect((seedRes.body as SyncPushResponse).rejected).toEqual([]);

    const beforeSession = await readWorkoutSession(sessionId);
    const beforeExercise = await readSessionExercise(sessionExerciseId);
    const beforeSet = await readLoggedSet(setId);

    const sessionPatch = workoutSessionOp(
      sessionId,
      { status: 'completed', ended_at: new Date('2026-06-16T04:30:00Z').toISOString() },
      'PATCH',
    );
    const exercisePatch = sessionExerciseOp(sessionExerciseId, { exercise_id: exerciseId, order_index: 3 }, 'PATCH');
    const setPatch = loggedSetOp(setId, { reps: 10 }, 'PATCH');

    const res = await push(cookie, [sessionPatch, exercisePatch, setPatch]);
    const body = res.body as SyncPushResponse;
    expect([...body.applied].sort()).toEqual([sessionPatch.op_id, exercisePatch.op_id, setPatch.op_id].sort());
    expect(body.rejected).toEqual([]);

    const afterSession = await readWorkoutSession(sessionId);
    const afterExercise = await readSessionExercise(sessionExerciseId);
    const afterSet = await readLoggedSet(setId);

    expect(afterSession.status).toBe('completed');
    expect(afterSession.started_at).toBe(beforeSession.started_at);
    expect(afterSession.timezone).toBe(beforeSession.timezone);
    expect(afterSession.local_date).toBe(beforeSession.local_date);
    expect(afterSession.device_id).toBe(beforeSession.device_id);

    expect(afterExercise.order_index).toBe(3);
    expect(afterExercise.target_sets).toBe(beforeExercise.target_sets);

    expect(afterSet.reps).toBe(10);
    expect(afterSet.set_index).toBe(beforeSet.set_index);
    expect(afterSet.weight_kg).toBe(beforeSet.weight_kg);
    expect(afterSet.completed).toBe(beforeSet.completed);
  });
});
