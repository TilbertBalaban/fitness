import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { SYNC_PUSH_PATH, type SyncCrudOp } from '@fitness/api-contracts';
import { db, pool } from '../src/db/drizzle.module';
import { user, workoutSession, sessionExercise, loggedSet } from '../src/db/schema';
import { SyncService } from '../src/sync/sync.service';
import { generateCorpus } from '../src/seed/generate-corpus';
import { CORPUS_SHAPE, PERF_BUDGET } from '../src/seed/corpus-shape';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as auth.e2e-spec.ts: @thallesp/nestjs-better-auth and better-auth are ESM-only, so
// this suite drives the built artifact over real HTTP for the push-latency cases.
const AUTH_BASE_PATH = '/v1/auth';
const PASSWORD = 'correct-horse-battery-staple';

let api: ChildProcess;
let baseUrl: string;

let corpusUserId: string;
let corpusCookie: string;
let corpusSessionId: string;
let threeSetSessionId: string;
let thirtySetSessionId: string;
let otherUserId: string;

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

function sessionCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const match = cookies.find((c) => c.includes('better-auth.session_token='));
  if (!match) throw new Error('sign-up did not return a session cookie');
  return match.split(';')[0];
}

async function signUp(tag: string): Promise<{ email: string; cookie: string }> {
  const email = `e2e-perf-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const res = await request(baseUrl)
    .post(`${AUTH_BASE_PATH}/sign-up/email`)
    .send({ email, password: PASSWORD, name: `E2E Perf ${tag}` })
    .expect(200);
  return { email, cookie: sessionCookie(res) };
}

async function push(cookie: string, batch: SyncCrudOp[]) {
  return request(baseUrl).post(SYNC_PUSH_PATH).set('Cookie', cookie).send({ batch });
}

// A minimal, self-contained batch shaped like one real training session — not the Task 1
// generator's own builder, which is not exported for this purpose. Independent of the seeded
// corpus's own ids, so a push here cannot collide with it.
function buildOneSessionBatch(): SyncCrudOp[] {
  const sessionId = randomUUID();
  const sessionExerciseId = randomUUID();
  const ops: SyncCrudOp[] = [
    {
      op_id: randomUUID(),
      op: 'PUT',
      type: 'workout_session',
      id: sessionId,
      data: {
        started_at: new Date().toISOString(),
        status: 'completed',
        timezone: 'America/Los_Angeles',
        local_date: '2026-08-17',
      },
    },
    {
      op_id: randomUUID(),
      op: 'PUT',
      type: 'session_exercise',
      id: sessionExerciseId,
      data: { session_id: sessionId, exercise_id: 'seed-ex-bench-press', order_index: 0, target_sets: 4 },
    },
  ];
  for (let i = 0; i < 12; i++) {
    ops.push({
      op_id: randomUUID(),
      op: 'PUT',
      type: 'logged_set',
      id: randomUUID(),
      data: {
        session_exercise_id: sessionExerciseId,
        set_index: i + 1,
        set_type: 'normal',
        weight_kg: '60.000',
        reps: 8,
        rir: 2,
        completed: true,
        logged_at: new Date().toISOString(),
      },
    });
  }
  return ops;
}

async function pushSetsDirectly(userId: string, setCount: number): Promise<string> {
  const syncService = new SyncService(db);
  const sessionId = randomUUID();
  const sessionExerciseId = randomUUID();
  const ops: SyncCrudOp[] = [
    {
      op_id: randomUUID(),
      op: 'PUT',
      type: 'workout_session',
      id: sessionId,
      data: {
        started_at: new Date().toISOString(),
        status: 'completed',
        timezone: 'America/Los_Angeles',
        local_date: '2026-08-17',
      },
    },
    {
      op_id: randomUUID(),
      op: 'PUT',
      type: 'session_exercise',
      id: sessionExerciseId,
      data: { session_id: sessionId, exercise_id: 'seed-ex-bench-press', order_index: 0, target_sets: setCount },
    },
  ];
  for (let i = 0; i < setCount; i++) {
    ops.push({
      op_id: randomUUID(),
      op: 'PUT',
      type: 'logged_set',
      id: randomUUID(),
      data: {
        session_exercise_id: sessionExerciseId,
        set_index: i + 1,
        set_type: 'normal',
        weight_kg: '60.000',
        reps: 8,
        rir: 2,
        completed: true,
        logged_at: new Date().toISOString(),
      },
    });
  }
  const response = await syncService.applyBatch(userId, ops);
  if (response.rejected.length > 0) {
    throw new Error(`Fixture push rejected: ${JSON.stringify(response.rejected[0])}`);
  }
  return sessionId;
}

// Counts every query dispatched through the shared pool for the duration of `fn` — this is the
// pg pool's own query method, monkey-patched for the scope of the call and restored immediately
// after, since node-postgres has no lifecycle event a counter could otherwise attach to.
async function countQueries<T>(fn: () => Promise<T>): Promise<{ result: T; queryCount: number }> {
  const original = pool.query.bind(pool);
  let count = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = (...args: unknown[]) => {
    count += 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (original as any)(...args);
  };
  try {
    const result = await fn();
    return { result, queryCount: count };
  } finally {
    pool.query = original;
  }
}

async function readSessionWithChildren(sessionId: string) {
  const [session] = await db.select().from(workoutSession).where(eq(workoutSession.id, sessionId));
  const exercises = await db.select().from(sessionExercise).where(eq(sessionExercise.sessionId, sessionId));
  const exerciseIds = exercises.map((e) => e.id);
  const setIdRows = exerciseIds.length
    ? await db.select({ id: loggedSet.id }).from(loggedSet).where(inArray(loggedSet.sessionExerciseId, exerciseIds))
    : [];
  const sets = [];
  for (const row of setIdRows) {
    const [fullSet] = await db.select().from(loggedSet).where(eq(loggedSet.id, row.id));
    sets.push(fullSet);
  }
  return { session, exercises, sets };
}

async function readAllSessionsForUser(userId: string) {
  const sessions = await db.select().from(workoutSession).where(eq(workoutSession.userId, userId));
  const sessionIds = sessions.map((s) => s.id);
  const exercises = sessionIds.length
    ? await db.select().from(sessionExercise).where(inArray(sessionExercise.sessionId, sessionIds))
    : [];
  const exerciseIds = exercises.map((e) => e.id);
  const sets = exerciseIds.length
    ? await db.select().from(loggedSet).where(inArray(loggedSet.sessionExerciseId, exerciseIds))
    : [];
  return { sessions, exercises, sets };
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

  const corpusUser = await signUp('corpus');
  corpusCookie = corpusUser.cookie;

  const result = await generateCorpus({ email: corpusUser.email, reset: true });
  corpusUserId = result.userId;

  const [anySeededSession] = await db
    .select({ id: workoutSession.id })
    .from(workoutSession)
    .where(eq(workoutSession.userId, corpusUserId))
    .limit(1);
  corpusSessionId = anySeededSession.id;

  threeSetSessionId = await pushSetsDirectly(corpusUserId, 3);
  thirtySetSessionId = await pushSetsDirectly(corpusUserId, 30);

  // Its own account, deliberately not run through the full generator — one small session is
  // enough to prove the corpus read never leaks another user's rows, and skips a second
  // eighteen-month generation the isolation check does not need.
  const otherUser = await signUp('other');
  const [otherUserRow] = await db.select({ id: user.id }).from(user).where(eq(user.email, otherUser.email));
  otherUserId = otherUserRow.id;
  await pushSetsDirectly(otherUserId, 3);
}, 180000);

afterAll(async () => {
  if (api && !api.killed) {
    api.kill('SIGTERM');
  }
});

describe('Seeded-corpus performance budget (e2e)', () => {
  it('fails rather than skips when the seeded corpus is absent', async () => {
    const sessions = await db.select().from(workoutSession).where(eq(workoutSession.userId, corpusUserId));
    expect(sessions.length).toBeGreaterThan(200);
    expect(sessions.length * CORPUS_SHAPE.setsPerSession).toBeGreaterThan(3000);
  });

  it('pushes a full session batch against the seeded corpus within the push budget', async () => {
    await push(corpusCookie, buildOneSessionBatch()); // warm-up, discarded

    const batch = buildOneSessionBatch();
    const start = process.hrtime.bigint();
    const res = await push(corpusCookie, batch);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    expect(res.status).toBe(201);
    expect(res.body.rejected).toEqual([]);
    expect(elapsedMs).toBeLessThan(PERF_BUDGET.pushSessionBatchMs);
  });

  it('pushes a single set against the seeded corpus within the single-set budget', async () => {
    const setupBatch = buildOneSessionBatch();
    await push(corpusCookie, setupBatch); // warm-up
    const sessionExerciseOp = setupBatch.find((op) => op.type === 'session_exercise')!;

    const singleSetOp: SyncCrudOp = {
      op_id: randomUUID(),
      op: 'PUT',
      type: 'logged_set',
      id: randomUUID(),
      data: {
        session_exercise_id: sessionExerciseOp.id,
        set_index: 99,
        set_type: 'normal',
        weight_kg: '60.000',
        reps: 8,
        rir: 2,
        completed: true,
        logged_at: new Date().toISOString(),
      },
    };

    const start = process.hrtime.bigint();
    const res = await push(corpusCookie, [singleSetOp]);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    expect(res.status).toBe(201);
    expect(res.body.rejected).toEqual([]);
    expect(elapsedMs).toBeLessThan(PERF_BUDGET.pushSingleSetMs);
  });

  it('reads the whole corpus for one user within the full-read budget', async () => {
    await readAllSessionsForUser(corpusUserId); // warm-up

    const start = process.hrtime.bigint();
    const { sessions, sets } = await readAllSessionsForUser(corpusUserId);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    expect(sessions.length).toBeGreaterThan(200);
    expect(sets.length).toBeGreaterThan(3000);
    expect(elapsedMs).toBeLessThan(PERF_BUDGET.fullReadMs);
  });

  it('reads one session with its exercises and its sets in no more than the query ceiling', async () => {
    const { queryCount } = await countQueries(() => readSessionWithChildren(corpusSessionId));
    expect(queryCount).toBeLessThanOrEqual(PERF_BUDGET.maxQueriesPerSessionRead);
  });

  it('issues the same query count reading a three-set session and a thirty-set session', async () => {
    const three = await countQueries(() => readSessionWithChildren(threeSetSessionId));
    const thirty = await countQueries(() => readSessionWithChildren(thirtySetSessionId));

    expect(three.result.sets.length).toBe(3);
    expect(thirty.result.sets.length).toBe(30);
    expect(three.queryCount).toBeLessThanOrEqual(PERF_BUDGET.maxQueriesPerSessionRead);
    expect(thirty.queryCount).toBe(three.queryCount);
  });

  it('returns none of another user\'s rows when reading the corpus for one user', async () => {
    const { sessions } = await readAllSessionsForUser(corpusUserId);
    expect(sessions.every((s) => s.userId === corpusUserId)).toBe(true);
    expect(sessions.some((s) => s.userId === otherUserId)).toBe(false);
  });
});
