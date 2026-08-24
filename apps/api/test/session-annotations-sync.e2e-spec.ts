import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import { SYNC_PUSH_PATH, type SyncCrudOp, type SyncCrudOpType, type SyncPushRequest, type SyncPushResponse } from '@fitness/api-contracts';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as patch-partial-update.e2e-spec.ts / program-sync.e2e-spec.ts: @thallesp/nestjs-better-auth
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
  const email = `e2e-session-annotations-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

function workoutSessionOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'workout_session', id, data };
}

function sessionExerciseOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'session_exercise', id, data };
}

function loggedSetOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'logged_set', id, data };
}

function userPreferenceOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'user_preference', id, data };
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
  notes: string | null;
  name: string | null;
  paused_at: string | null;
  accumulated_paused_seconds: number;
  rest_target_at: string | null;
}

async function readWorkoutSession(id: string): Promise<WorkoutSessionRow> {
  const { rows } = await pg.query(
    `SELECT routine_day_id, equipment_profile_id, started_at::text AS started_at,
            ended_at::text AS ended_at, status, device_id, timezone, local_date::text AS local_date,
            notes, name, paused_at::text AS paused_at, accumulated_paused_seconds,
            rest_target_at::text AS rest_target_at
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
  target_rir: number | null;
  target_rest_seconds: number | null;
  notes: string | null;
  removed_at: string | null;
}

async function readSessionExercise(id: string): Promise<SessionExerciseRow> {
  const { rows } = await pg.query(
    `SELECT exercise_id, order_index, superset_group_id, routine_exercise_id, target_sets,
            target_rep_min, target_rep_max, target_rir, target_rest_seconds, notes,
            removed_at::text AS removed_at
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
  notes: string | null;
}

async function readLoggedSet(id: string): Promise<LoggedSetRow> {
  const { rows } = await pg.query(
    `SELECT set_index, set_type, weight_kg, reps, rir, side, completed, parent_set_id,
            rest_taken_seconds, logged_at::text AS logged_at, notes
     FROM logged_set WHERE id = $1`,
    [id],
  );
  return rows[0];
}

interface UserPreferenceRow {
  weight_unit: string;
  default_equipment_profile_id: string | null;
  active_routine_id: string | null;
  auto_advance_enabled: boolean;
  warmup_sets_enabled: boolean;
}

async function readUserPreference(userId: string): Promise<UserPreferenceRow | undefined> {
  const { rows } = await pg.query(
    `SELECT weight_unit, default_equipment_profile_id, active_routine_id, auto_advance_enabled, warmup_sets_enabled
     FROM user_preference WHERE user_id = $1`,
    [userId],
  );
  return rows[0];
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
     VALUES ($1, 'Barbell Squat', 'external_weight', false, false, 'seed')`,
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

describe('session annotations sync (e2e) — notes, pause, preferences', () => {
  describe('LOG-16: notes at three levels', () => {
    it('a batch pushing one note PATCH each to workout_session, session_exercise and logged_set applies all three, each to its own table, leaving every other column byte-identical', async () => {
      const { cookie } = await signUp('notes-batch');
      const { sessionId, sessionExerciseId } = await seedWorkoutSessionAndExercise(cookie, {
        started_at: new Date('2026-06-15T20:00:00Z').toISOString(),
        status: 'in_progress',
        timezone: 'America/New_York',
        local_date: '2026-06-15',
      });
      const setId = randomUUID();
      const setRes = await push(cookie, [
        loggedSetOp(setId, {
          session_exercise_id: sessionExerciseId,
          set_index: 1,
          set_type: 'normal',
          weight_kg: '100.000',
          reps: 5,
          completed: true,
          logged_at: new Date('2026-06-15T20:05:00Z').toISOString(),
        }),
      ]);
      expect((setRes.body as SyncPushResponse).rejected).toEqual([]);

      const sessionBefore = await readWorkoutSession(sessionId);
      const exerciseBefore = await readSessionExercise(sessionExerciseId);
      const setBefore = await readLoggedSet(setId);

      const batch: SyncCrudOp[] = [
        workoutSessionOp(sessionId, { notes: 'Great session overall' }, 'PATCH'),
        sessionExerciseOp(sessionExerciseId, { exercise_id: exerciseId, notes: 'Knee felt fine' }, 'PATCH'),
        loggedSetOp(setId, { notes: 'PR attempt' }, 'PATCH'),
      ];
      const res = await push(cookie, batch);
      const body: SyncPushResponse = res.body;
      expect(body.rejected).toEqual([]);
      expect(body.applied.sort()).toEqual(batch.map((op) => op.op_id).sort());

      const sessionAfter = await readWorkoutSession(sessionId);
      const exerciseAfter = await readSessionExercise(sessionExerciseId);
      const setAfter = await readLoggedSet(setId);

      expect(sessionAfter.notes).toBe('Great session overall');
      expect(exerciseAfter.notes).toBe('Knee felt fine');
      expect(setAfter.notes).toBe('PR attempt');

      expect({ ...sessionAfter, notes: sessionBefore.notes }).toEqual(sessionBefore);
      expect({ ...exerciseAfter, notes: exerciseBefore.notes }).toEqual(exerciseBefore);
      expect({ ...setAfter, notes: setBefore.notes }).toEqual(setBefore);
    });

    it('a second push of the identical note text still changes only notes', async () => {
      const { cookie } = await signUp('notes-idempotent');
      const { sessionId } = await seedWorkoutSessionAndExercise(cookie, {
        started_at: new Date('2026-06-15T20:00:00Z').toISOString(),
        status: 'in_progress',
        timezone: 'UTC',
        local_date: '2026-06-15',
      });

      const first = await push(cookie, [workoutSessionOp(sessionId, { notes: 'Same note' }, 'PATCH')]);
      expect((first.body as SyncPushResponse).rejected).toEqual([]);
      const afterFirst = await readWorkoutSession(sessionId);

      const second = await push(cookie, [workoutSessionOp(sessionId, { notes: 'Same note' }, 'PATCH')]);
      expect((second.body as SyncPushResponse).rejected).toEqual([]);
      const afterSecond = await readWorkoutSession(sessionId);

      expect(afterSecond).toEqual(afterFirst);
      expect(afterSecond.notes).toBe('Same note');
    });

    it('a push naming notes with a JSON null clears the stored note to SQL NULL', async () => {
      const { cookie } = await signUp('notes-clear');
      const { sessionId } = await seedWorkoutSessionAndExercise(cookie, {
        started_at: new Date('2026-06-15T20:00:00Z').toISOString(),
        status: 'in_progress',
        timezone: 'UTC',
        local_date: '2026-06-15',
      });

      const withNote = await push(cookie, [workoutSessionOp(sessionId, { notes: 'Will be cleared' }, 'PATCH')]);
      expect((withNote.body as SyncPushResponse).rejected).toEqual([]);
      expect((await readWorkoutSession(sessionId)).notes).toBe('Will be cleared');

      const cleared = await push(cookie, [workoutSessionOp(sessionId, { notes: null }, 'PATCH')]);
      expect((cleared.body as SyncPushResponse).rejected).toEqual([]);
      expect((await readWorkoutSession(sessionId)).notes).toBeNull();
    });

    it('a push that omits notes entirely leaves an existing note intact — the patchAwareSet contract, catching a map entry accidentally set to null', async () => {
      const { cookie } = await signUp('notes-omit');
      const { sessionId } = await seedWorkoutSessionAndExercise(cookie, {
        started_at: new Date('2026-06-15T20:00:00Z').toISOString(),
        status: 'in_progress',
        timezone: 'UTC',
        local_date: '2026-06-15',
        device_id: 'phone-1',
      });

      const withNote = await push(cookie, [workoutSessionOp(sessionId, { notes: 'Do not touch me' }, 'PATCH')]);
      expect((withNote.body as SyncPushResponse).rejected).toEqual([]);

      const unrelated = await push(cookie, [workoutSessionOp(sessionId, { device_id: 'phone-2' }, 'PATCH')]);
      expect((unrelated.body as SyncPushResponse).rejected).toEqual([]);

      const after = await readWorkoutSession(sessionId);
      expect(after.notes).toBe('Do not touch me');
      expect(after.device_id).toBe('phone-2');
    });
  });

  describe('LOG-12: pause accounting', () => {
    it('a PATCH naming paused_at sets it and leaves accumulated_paused_seconds unchanged', async () => {
      const { cookie } = await signUp('pause-set');
      const { sessionId } = await seedWorkoutSessionAndExercise(cookie, {
        started_at: new Date('2026-06-15T20:00:00Z').toISOString(),
        status: 'in_progress',
        timezone: 'UTC',
        local_date: '2026-06-15',
      });
      expect((await readWorkoutSession(sessionId)).accumulated_paused_seconds).toBe(0);

      const pausedAt = new Date('2026-06-15T20:10:00Z').toISOString();
      const res = await push(cookie, [workoutSessionOp(sessionId, { status: 'paused', paused_at: pausedAt }, 'PATCH')]);
      expect((res.body as SyncPushResponse).rejected).toEqual([]);

      const after = await readWorkoutSession(sessionId);
      expect(after.status).toBe('paused');
      expect(after.paused_at).not.toBeNull();
      expect(after.accumulated_paused_seconds).toBe(0);
    });

    it('a follow-up PATCH naming both paused_at (null) and accumulated_paused_seconds clears the first and increments the second', async () => {
      const { cookie } = await signUp('pause-resume');
      const { sessionId } = await seedWorkoutSessionAndExercise(cookie, {
        started_at: new Date('2026-06-15T20:00:00Z').toISOString(),
        status: 'in_progress',
        timezone: 'UTC',
        local_date: '2026-06-15',
      });

      const pauseRes = await push(cookie, [
        workoutSessionOp(sessionId, { status: 'paused', paused_at: new Date('2026-06-15T20:10:00Z').toISOString() }, 'PATCH'),
      ]);
      expect((pauseRes.body as SyncPushResponse).rejected).toEqual([]);

      const resumeRes = await push(cookie, [
        workoutSessionOp(sessionId, { status: 'in_progress', paused_at: null, accumulated_paused_seconds: 90 }, 'PATCH'),
      ]);
      expect((resumeRes.body as SyncPushResponse).rejected).toEqual([]);

      const after = await readWorkoutSession(sessionId);
      expect(after.status).toBe('in_progress');
      expect(after.paused_at).toBeNull();
      expect(after.accumulated_paused_seconds).toBe(90);
    });

    it('a PATCH naming status with paused is accepted, and one naming a value outside the vocabulary is rejected as invalid_field', async () => {
      const { cookie } = await signUp('pause-vocab');
      const { sessionId } = await seedWorkoutSessionAndExercise(cookie, {
        started_at: new Date('2026-06-15T20:00:00Z').toISOString(),
        status: 'in_progress',
        timezone: 'UTC',
        local_date: '2026-06-15',
      });

      const goodOp = workoutSessionOp(sessionId, { status: 'paused' }, 'PATCH');
      const goodRes = await push(cookie, [goodOp]);
      expect((goodRes.body as SyncPushResponse).applied).toEqual([goodOp.op_id]);
      expect((await readWorkoutSession(sessionId)).status).toBe('paused');

      const badOp = workoutSessionOp(sessionId, { status: 'frozen' }, 'PATCH');
      const badRes = await push(cookie, [badOp]);
      expect((badRes.body as SyncPushResponse).rejected).toEqual([{ op_id: badOp.op_id, reason: 'invalid_field' }]);
      expect((await readWorkoutSession(sessionId)).status).toBe('paused');
    });
  });

  describe('LOG-13/LOG-17: workout preferences', () => {
    it('a user_preference push for a user with no existing row creates it with auto_advance_enabled and warmup_sets_enabled both true', async () => {
      const { cookie, userId } = await signUp('prefs-create');
      expect(await readUserPreference(userId)).toBeUndefined();

      const op = userPreferenceOp(userId, { weight_unit: 'kg' });
      const res = await push(cookie, [op]);
      expect((res.body as SyncPushResponse).applied).toEqual([op.op_id]);

      const row = await readUserPreference(userId);
      expect(row).toBeDefined();
      expect(row?.auto_advance_enabled).toBe(true);
      expect(row?.warmup_sets_enabled).toBe(true);
    });

    it('a PATCH naming only auto_advance_enabled with false leaves warmup_sets_enabled true and weight_unit unchanged', async () => {
      const { cookie, userId } = await signUp('prefs-patch');
      const createRes = await push(cookie, [userPreferenceOp(userId, { weight_unit: 'lb' })]);
      expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

      const patchOp = userPreferenceOp(userId, { auto_advance_enabled: false }, 'PATCH');
      const patchRes = await push(cookie, [patchOp]);
      expect((patchRes.body as SyncPushResponse).applied).toEqual([patchOp.op_id]);

      const row = await readUserPreference(userId);
      expect(row?.auto_advance_enabled).toBe(false);
      expect(row?.warmup_sets_enabled).toBe(true);
      expect(row?.weight_unit).toBe('lb');
    });

    it('a PATCH naming auto_advance_enabled with a string is rejected as invalid_field', async () => {
      const { cookie, userId } = await signUp('prefs-invalid');
      const createRes = await push(cookie, [userPreferenceOp(userId, { weight_unit: 'kg' })]);
      expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

      const patchOp = userPreferenceOp(userId, { auto_advance_enabled: 'nope' }, 'PATCH');
      const res = await push(cookie, [patchOp]);
      expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: patchOp.op_id, reason: 'invalid_field' }]);
      expect((await readUserPreference(userId))?.auto_advance_enabled).toBe(true);
    });

    it('a batch containing both a warmup_sets_enabled PATCH and an auto_advance_enabled PATCH for the same user applies both without either clobbering the other', async () => {
      const { cookie, userId } = await signUp('prefs-batch');
      const createRes = await push(cookie, [userPreferenceOp(userId, { weight_unit: 'kg' })]);
      expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

      const batch: SyncCrudOp[] = [
        userPreferenceOp(userId, { warmup_sets_enabled: false }, 'PATCH'),
        userPreferenceOp(userId, { auto_advance_enabled: false }, 'PATCH'),
      ];
      const res = await push(cookie, batch);
      const body: SyncPushResponse = res.body;
      expect(body.rejected).toEqual([]);
      expect(body.applied.sort()).toEqual(batch.map((op) => op.op_id).sort());

      const row = await readUserPreference(userId);
      expect(row?.warmup_sets_enabled).toBe(false);
      expect(row?.auto_advance_enabled).toBe(false);
    });
  });
});
