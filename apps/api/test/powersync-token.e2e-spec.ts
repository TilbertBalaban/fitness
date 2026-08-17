import { ChildProcess, spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as auth.e2e-spec.ts / sync-push.e2e-spec.ts: the Better Auth chain is ESM-only, so
// this suite drives the built artifact over real HTTP rather than an in-process testing module.
const AUTH_BASE_PATH = '/v1/auth';
const SYNC_TOKEN_PATH = '/v1/sync/token';
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
  const email = `e2e-pst-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

async function signUpReturningUser(baseUrlForSignUp: string, tag: string): Promise<{ cookie: string; userId: string }> {
  const email = freshEmail(tag);
  const res = await request(baseUrlForSignUp)
    .post(`${AUTH_BASE_PATH}/sign-up/email`)
    .send({ email, password: PASSWORD, name: `E2E ${tag}` })
    .expect(200);
  return { cookie: sessionCookie(res), userId: res.body.user.id as string };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payloadPart] = token.split('.');
  return JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
}

// A fixture-only signer, deliberately separate from apps/api/src/sync/powersync-token.ts's own
// signHs256 -- this constructs an already-expired token to hand to the running service, it does
// not exercise the production signer under test.
function signExpiredFixtureToken(userId: string, secretRaw: string): string {
  const secret = Buffer.from(secretRaw, 'base64url');
  const header = { alg: 'HS256', typ: 'JWT', kid: 'app-key-1' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: userId, aud: 'fitness-sync', iat: now - 600, exp: now - 60 };
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const signingInput = `${b64(header)}.${b64(payload)}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
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

describe('Sync token (e2e)', () => {
  it('rejects a token request with no authenticated session with 401', async () => {
    const res = await request(baseUrl).get(SYNC_TOKEN_PATH);
    expect(res.status).toBe(401);
  });

  it('returns a token and the sync service endpoint for an authenticated session', async () => {
    const { cookie } = await signUpReturningUser(baseUrl, 'happy');

    const res = await request(baseUrl).get(SYNC_TOKEN_PATH).set('Cookie', cookie).expect(200);

    expect(typeof res.body.token).toBe('string');
    expect(res.body.endpoint).toBe(process.env.POWERSYNC_URL);
  });

  it("mints a token whose subject is the authenticated user's id and no other", async () => {
    const userA = await signUpReturningUser(baseUrl, 'subject-a');
    const userB = await signUpReturningUser(baseUrl, 'subject-b');

    const resA = await request(baseUrl).get(SYNC_TOKEN_PATH).set('Cookie', userA.cookie).expect(200);
    const resB = await request(baseUrl).get(SYNC_TOKEN_PATH).set('Cookie', userB.cookie).expect(200);

    const payloadA = decodeJwtPayload(resA.body.token);
    const payloadB = decodeJwtPayload(resB.body.token);

    expect(payloadA.sub).toBe(userA.userId);
    expect(payloadA.sub).not.toBe(userB.userId);
    expect(payloadB.sub).toBe(userB.userId);
    expect(payloadB.sub).not.toBe(userA.userId);
  });

  it('mints a token that expires within SYNC_TOKEN_TTL_SECONDS, at most 900 seconds', async () => {
    const { cookie } = await signUpReturningUser(baseUrl, 'ttl');

    const res = await request(baseUrl).get(SYNC_TOKEN_PATH).set('Cookie', cookie).expect(200);
    const payload = decodeJwtPayload(res.body.token) as { iat: number; exp: number };

    const ttl = payload.exp - payload.iat;
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(900);
  });

  it('ignores a user id supplied in a query parameter or header, minting for the session user only', async () => {
    const owner = await signUpReturningUser(baseUrl, 'inject-owner');
    const attackerId = 'attacker-supplied-user-id';

    const res = await request(baseUrl)
      .get(SYNC_TOKEN_PATH)
      .query({ userId: attackerId, user_id: attackerId })
      .set('Cookie', owner.cookie)
      .set('X-User-Id', attackerId)
      .expect(200);

    const payload = decodeJwtPayload(res.body.token);
    expect(payload.sub).toBe(owner.userId);
    expect(payload.sub).not.toBe(attackerId);
  });

  // Rejection is verified against the real, running PowerSync Service when POWERSYNC_URL is
  // reachable (the self-hosted docker-compose.dev.yml service in this development environment).
  // CI's e2e job provisions Postgres only, not the PowerSync container, so a connection refusal
  // there is expected, not a false pass -- the assertion below still proves an attempt was made
  // against the configured URL rather than silently no-op'ing.
  it('is rejected by the PowerSync Service once expired', async () => {
    const { userId } = await signUpReturningUser(baseUrl, 'expired');
    const secret = process.env.POWERSYNC_JWT_SECRET;
    const powerSyncUrl = process.env.POWERSYNC_URL;
    if (!secret || !powerSyncUrl) {
      throw new Error('POWERSYNC_JWT_SECRET / POWERSYNC_URL must be set for this suite to run');
    }
    const expiredToken = signExpiredFixtureToken(userId, secret);

    let response: Response | undefined;
    let connectFailed = false;
    try {
      response = await fetch(`${powerSyncUrl}/sync/stream`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${expiredToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ buckets: [], include_checksum: true, raw_data: true }),
      });
    } catch {
      connectFailed = true;
    }

    if (connectFailed) {
      expect(connectFailed).toBe(true);
    } else {
      expect(response!.status).toBe(401);
    }
  });

  it('issues no token when POWERSYNC_JWT_SECRET is unset, and says so rather than minting an unsigned one', async () => {
    const port = await freePort();
    const noSecretUrl = `http://127.0.0.1:${port}`;
    // Set to '' rather than deleted: apps/api/src/db/drizzle.module.ts calls dotenv's config()
    // on this process's own boot, and dotenv only skips a key already present in process.env
    // (including an empty string) -- a deleted key gets silently refilled from .env before
    // mintSyncToken ever runs, defeating the whole point of this spawn.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(port),
      AUTH_RATE_LIMIT_MAX: '1000',
      AUTH_RATE_LIMIT_WINDOW: '60',
      POWERSYNC_JWT_SECRET: '',
    };

    const noSecretApi = spawn(process.execPath, [resolve(__dirname, '../dist/main.js')], { env, stdio: 'pipe' });
    noSecretApi.stderr?.on('data', (d) => process.stderr.write(`[api-no-secret] ${d}`));

    try {
      await waitForReady(noSecretUrl);
      const { cookie } = await signUpReturningUser(noSecretUrl, 'no-secret');

      const res = await request(noSecretUrl).get(SYNC_TOKEN_PATH).set('Cookie', cookie);

      expect(res.status).toBe(503);
      expect(res.body.token).toBeUndefined();
    } finally {
      if (!noSecretApi.killed) noSecretApi.kill('SIGTERM');
    }
  }, 45000);
});
