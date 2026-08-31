import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import { SYNC_PUSH_PATH, type SyncCrudOp, type SyncCrudOpType, type SyncPushRequest, type SyncPushResponse } from '@fitness/api-contracts';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as body-metric.e2e-spec.ts / excluded-exercise.e2e-spec.ts: @thallesp/nestjs-better-auth
// and better-auth are ESM-only, so this suite drives the built artifact over real HTTP rather than an
// in-process testing module.
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
  const email = `e2e-pp-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

function progressPhotoOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'progress_photo', id, data };
}

interface ProgressPhotoRow {
  id: string;
  user_id: string;
  taken_at: string;
  timezone: string;
  local_date: string;
  storage_key: string;
  note: string | null;
}

async function progressPhotoRow(id: string): Promise<ProgressPhotoRow | undefined> {
  const { rows } = await pg.query(
    'SELECT id, user_id, taken_at, timezone, local_date, storage_key, note FROM progress_photo WHERE id = $1',
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
    if (createdEmails.length > 0) {
      await pg.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [createdEmails]);
    }
    await pg.end();
  }
  if (api && !api.killed) {
    api.kill('SIGTERM');
  }
});

describe('progress_photo sync (e2e)', () => {
  it('stores a PUT with the taken_at/timezone/local_date/storage_key/note metadata — never any photo bytes (D-15)', async () => {
    const { cookie, userId } = await signUp('happy-path');
    const id = randomUUID();

    const op = progressPhotoOp(id, {
      taken_at: '2026-08-30T11:45:00.000Z',
      timezone: 'America/New_York',
      local_date: '2026-08-30',
      storage_key: 'progress-photo/happy-path.jpg',
      note: 'after week 1',
    });
    const res = await push(cookie, [op]);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([op.op_id]);
    expect(body.rejected).toEqual([]);

    const row = await progressPhotoRow(id);
    expect(row?.user_id).toBe(userId);
    expect(row?.storage_key).toBe('progress-photo/happy-path.jpg');
    expect(row?.timezone).toBe('America/New_York');
    expect(row?.note).toBe('after week 1');
  });

  it("stores a PUT against the authenticated session's user id, never a user_id claimed in the payload (T-12-10)", async () => {
    const { cookie, userId } = await signUp('claimed-user-id');
    const id = randomUUID();

    const op = progressPhotoOp(id, {
      user_id: 'someone-else-entirely',
      storage_key: 'progress-photo/claimed-user-id.jpg',
      local_date: '2026-08-30',
    });
    const res = await push(cookie, [op]);
    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([op.op_id]);
    expect(body.rejected).toEqual([]);

    const row = await progressPhotoRow(id);
    expect(row?.user_id).toBe(userId);
    expect(row?.user_id).not.toBe('someone-else-entirely');
  });

  it('rejects a PUT whose storage_key is empty with invalid_field, and writes no row (D-15/R27)', async () => {
    const { cookie } = await signUp('empty-storage-key');
    const id = randomUUID();

    const op = progressPhotoOp(id, { storage_key: '', local_date: '2026-08-30' });
    const res = await push(cookie, [op]);
    expect((res.body as SyncPushResponse).rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);
    expect(await progressPhotoRow(id)).toBeUndefined();
  });

  it('a PATCH naming only note leaves storage_key, taken_at and timezone unchanged — the patchAwareSet contract, catching a map entry accidentally set to null (WR-01)', async () => {
    const { cookie } = await signUp('patch-clobber');
    const id = randomUUID();

    const putOp = progressPhotoOp(id, {
      taken_at: '2026-08-30T11:45:00.000Z',
      timezone: 'America/New_York',
      local_date: '2026-08-30',
      storage_key: 'progress-photo/patch-clobber.jpg',
      note: 'before',
    });
    const putRes = await push(cookie, [putOp]);
    expect((putRes.body as SyncPushResponse).rejected).toEqual([]);

    const patchOp = progressPhotoOp(id, { note: 'after' }, 'PATCH');
    const patchRes = await push(cookie, [patchOp]);
    expect((patchRes.body as SyncPushResponse).rejected).toEqual([]);

    const row = await progressPhotoRow(id);
    expect(row?.note).toBe('after');
    expect(row?.storage_key).toBe('progress-photo/patch-clobber.jpg');
    expect(row?.timezone).toBe('America/New_York');
  });
});
