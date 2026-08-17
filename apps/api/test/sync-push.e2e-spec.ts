import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import {
  SYNC_MAX_BATCH_OPS,
  SYNC_PUSH_PATH,
  type SyncCrudOp,
  type SyncPushRequest,
  type SyncPushResponse,
} from '@fitness/api-contracts';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as auth.e2e-spec.ts: @thallesp/nestjs-better-auth and better-auth are ESM-only, so
// this suite drives the built artifact over real HTTP rather than an in-process testing module.
const AUTH_BASE_PATH = '/v1/auth';
const PASSWORD = 'correct-horse-battery-staple';

let api: ChildProcess;
let baseUrl: string;
let pg: Client;
const createdEmails: string[] = [];

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
  const email = `e2e-sync-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

function makeOp(overrides: Partial<SyncCrudOp> = {}): SyncCrudOp {
  return {
    op_id: randomUUID(),
    op: 'PUT',
    type: 'workout_session',
    id: randomUUID(),
    data: {
      // Deliberately included to prove the server ignores it (T-02-01) — never the id used to
      // look up ownership.
      user_id: 'attacker-supplied-user-id',
      started_at: new Date().toISOString(),
      status: 'in_progress',
    },
    ...overrides,
  };
}

async function push(cookie: string | null, batch: SyncCrudOp[]): Promise<request.Response> {
  const body: SyncPushRequest = { batch };
  const req = request(baseUrl).post(SYNC_PUSH_PATH).send(body);
  return cookie ? req.set('Cookie', cookie) : req;
}

async function workoutSessionRow(id: string): Promise<{ user_id: string; server_seq: string } | undefined> {
  const { rows } = await pg.query('SELECT user_id, server_seq FROM workout_session WHERE id = $1', [id]);
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
    if (createdEmails.length > 0) {
      await pg.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [createdEmails]);
    }
    await pg.end();
  }
  if (api && !api.killed) {
    api.kill('SIGTERM');
  }
});

describe('Sync push (e2e)', () => {
  it('rejects a push with no authenticated session with 401', async () => {
    const res = await push(null, [makeOp()]);
    expect(res.status).toBe(401);
  });

  it('inserts a row into Postgres with the client-supplied id on a valid single-op batch', async () => {
    const cookie = await signUp('insert');
    const op = makeOp();

    const res = await push(cookie, [op]);

    expect(res.status).toBe(201);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([op.op_id]);
    expect(body.rejected).toEqual([]);

    const row = await workoutSessionRow(op.id);
    expect(row).toBeDefined();
  });

  it('leaves exactly one row after pushing the identical op twice, both reported applied', async () => {
    const cookie = await signUp('idempotent');
    const op = makeOp();

    const first = await push(cookie, [op]);
    const second = await push(cookie, [op]);

    expect(first.body.applied).toEqual([op.op_id]);
    expect(second.body.applied).toEqual([op.op_id]);

    const { rows } = await pg.query('SELECT count(*)::int AS n FROM workout_session WHERE id = $1', [op.id]);
    expect(rows[0].n).toBe(1);
  });

  it('rejects an op targeting another user\'s existing row with not_owner and leaves the row unchanged', async () => {
    const ownerCookie = await signUp('owner');
    const attackerCookie = await signUp('attacker');

    const op = makeOp();
    await push(ownerCookie, [op]);
    const before = await workoutSessionRow(op.id);

    const attack = makeOp({ id: op.id, op_id: randomUUID(), data: { ...op.data, status: 'discarded' } });
    const res = await push(attackerCookie, [attack]);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: attack.op_id, reason: 'not_owner' }]);

    const after = await workoutSessionRow(op.id);
    expect(after).toEqual(before);
  });

  it('rejects an op naming a table outside SYNCED_TABLES with unknown_table', async () => {
    const cookie = await signUp('unknown-table');
    const op = makeOp({ type: 'not_a_real_table' });

    const res = await push(cookie, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: op.op_id, reason: 'unknown_table' }]);
  });

  it('rejects a batch larger than SYNC_MAX_BATCH_OPS with batch_too_large and applies nothing', async () => {
    const cookie = await signUp('too-large');
    const batch = Array.from({ length: SYNC_MAX_BATCH_OPS + 1 }, () => makeOp());

    const res = await push(cookie, batch);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toHaveLength(batch.length);
    expect(body.rejected.every((r) => r.reason === 'batch_too_large')).toBe(true);

    const row = await workoutSessionRow(batch[0].id);
    expect(row).toBeUndefined();
  });

  it('returns success with zero applied ops and writes nothing for an empty batch', async () => {
    const cookie = await signUp('empty');

    const res = await push(cookie, []);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([]);
  });
});
