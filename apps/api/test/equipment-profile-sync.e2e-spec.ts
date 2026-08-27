import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import { SYNC_PUSH_PATH, type SyncCrudOp, type SyncCrudOpType, type SyncPushRequest, type SyncPushResponse } from '@fitness/api-contracts';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as exercise-sync.e2e-spec.ts / personal-record-sync.e2e-spec.ts:
// @thallesp/nestjs-better-auth and better-auth are ESM-only, so this suite drives the built
// artifact over real HTTP rather than an in-process testing module.
const AUTH_BASE_PATH = '/v1/auth';
const PASSWORD = 'correct-horse-battery-staple';

let api: ChildProcess;
let baseUrl: string;
let pg: Client;
const createdEmails: string[] = [];
const seededEquipmentProfileIds: string[] = [];

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
  const email = `e2e-equipment-sync-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

function equipmentProfileOp(id: string, data: Record<string, unknown>, op: SyncCrudOpType = 'PUT'): SyncCrudOp {
  return { op_id: randomUUID(), op, type: 'equipment_profile', id, data };
}

interface EquipmentProfileRow {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  barbell_weight_kg: string | null;
  available_plates: unknown;
  dumbbell_increments_kg: unknown;
  machine_availability: unknown;
  native_unit: string;
  archived_at: string | null;
  server_seq: string;
}

async function equipmentProfileRow(id: string): Promise<EquipmentProfileRow | undefined> {
  const { rows } = await pg.query(
    `SELECT id, user_id, name, is_default, barbell_weight_kg, available_plates,
            dumbbell_increments_kg, machine_availability, native_unit,
            archived_at::text AS archived_at, server_seq::text AS server_seq
     FROM equipment_profile WHERE id = $1`,
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
    if (seededEquipmentProfileIds.length > 0) {
      await pg.query('DELETE FROM equipment_profile WHERE id = ANY($1::text[])', [seededEquipmentProfileIds]);
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

describe('equipment_profile sync (e2e)', () => {
  it('a PUT of a valid equipment_profile op reaches Postgres with the pusher\'s own user_id and a positive server_seq', async () => {
    const { cookie, userId } = await signUp('valid-put');
    const profileId = randomUUID();
    seededEquipmentProfileIds.push(profileId);

    const op = equipmentProfileOp(profileId, {
      name: 'My Gym',
      is_default: true,
      barbell_weight_kg: '20.000',
      available_plates: [{ weightKg: '20.000', pairCount: 4 }],
      dumbbell_increments_kg: [{ weightKg: '2.500' }],
      machine_availability: [],
      native_unit: 'kg',
    });
    const res = await push(cookie, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([op.op_id]);
    expect(body.rejected).toEqual([]);
    expect(BigInt(body.server_seq)).toBeGreaterThan(0n);

    const row = await equipmentProfileRow(profileId);
    expect(row).toBeDefined();
    expect(row?.user_id).toBe(userId);
    expect(row?.name).toBe('My Gym');
    expect(row?.available_plates).toEqual([{ weightKg: '20.000', pairCount: 4 }]);
    expect(Number(row?.server_seq)).toBeGreaterThan(0);
  });

  it('a PATCH naming only name leaves available_plates untouched', async () => {
    const { cookie } = await signUp('patch-name');
    const profileId = randomUUID();
    seededEquipmentProfileIds.push(profileId);

    const createOp = equipmentProfileOp(profileId, {
      name: 'Commercial Gym',
      available_plates: [{ weightKg: '25.000', pairCount: 3 }, { weightKg: '10.000', pairCount: 2 }],
      dumbbell_increments_kg: [],
      machine_availability: [],
      native_unit: 'kg',
    });
    const createRes = await push(cookie, [createOp]);
    expect((createRes.body as SyncPushResponse).rejected).toEqual([]);

    const before = await equipmentProfileRow(profileId);
    expect(before?.available_plates).toEqual([
      { weightKg: '25.000', pairCount: 3 },
      { weightKg: '10.000', pairCount: 2 },
    ]);

    const patchOp = equipmentProfileOp(profileId, { name: 'Renamed Gym' }, 'PATCH');
    const patchRes = await push(cookie, [patchOp]);
    expect((patchRes.body as SyncPushResponse).applied).toEqual([patchOp.op_id]);
    expect((patchRes.body as SyncPushResponse).rejected).toEqual([]);

    const after = await equipmentProfileRow(profileId);
    expect(after?.name).toBe('Renamed Gym');
    expect(after?.available_plates).toEqual(before?.available_plates);
  });

  it('rejects a PUT whose available_plates fails the shape guard as invalid_field, and writes no row', async () => {
    const { cookie } = await signUp('malformed-plates');
    const profileId = randomUUID();

    const op = equipmentProfileOp(profileId, {
      name: 'Bad Gym',
      available_plates: [{ weightKg: 20, pairCount: 4 }],
      native_unit: 'kg',
    });
    const res = await push(cookie, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: op.op_id, reason: 'invalid_field' }]);
    expect(await equipmentProfileRow(profileId)).toBeUndefined();
  });

  it("a PUT whose payload names a DIFFERENT user's user_id is still stored against the pusher's id — the ownership assertion", async () => {
    const { cookie: cookieA, userId: userIdA } = await signUp('owner-a');
    const { userId: userIdB } = await signUp('bystander-b');
    const profileId = randomUUID();
    seededEquipmentProfileIds.push(profileId);

    const op = equipmentProfileOp(profileId, {
      user_id: userIdB,
      name: 'Garage Gym',
      native_unit: 'kg',
    });
    const res = await push(cookieA, [op]);

    const body: SyncPushResponse = res.body;
    expect(body.applied).toEqual([op.op_id]);
    expect(body.rejected).toEqual([]);

    const row = await equipmentProfileRow(profileId);
    expect(row?.user_id).toBe(userIdA);
    expect(row?.user_id).not.toBe(userIdB);
  });
});
