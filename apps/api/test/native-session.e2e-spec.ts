import { ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Mirrors auth.e2e-spec.ts's harness: the real built artifact driven over real HTTP, because the
// API and its Better Auth dependencies are ESM-only and Jest's CommonJS runtime cannot load them
// in-process.
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
  const email = `e2e-native-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

async function sessionRowCount(userId: string): Promise<number> {
  const result = await pg.query('SELECT count(*)::int AS n FROM "session" WHERE user_id = $1', [userId]);
  return result.rows[0].n;
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

describe('Native session lifecycle (e2e)', () => {
  it('deletes the Postgres session row on an explicit sign-out authenticated only by an attached cookie header, with no cookie jar', async () => {
    const email = freshEmail('signout');

    const signUp = await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/sign-up/email`)
      .send({ email, password: PASSWORD, name: 'Native Sign-Out' })
      .expect(200);

    const userId: string = signUp.body.user.id;
    const cookie = sessionCookie(signUp);

    expect(await sessionRowCount(userId)).toBeGreaterThan(0);

    // The exact shape native now sends: no cookie jar, no agent, an explicit request header only.
    await request(baseUrl).post(`${AUTH_BASE_PATH}/sign-out`).set('Cookie', cookie).expect(200);

    expect(await sessionRowCount(userId)).toBe(0);

    const afterSignOut = await request(baseUrl).get(`${AUTH_BASE_PATH}/get-session`).set('Cookie', cookie);

    // Pins the server contract classifySessionProbe (session-guard.ts) is built against: a session
    // that no longer exists answers with a 200 and no user, never a 401 and never a revocation
    // reason code. An upstream change here must break this test rather than silently disabling the
    // client's revocation-observability mechanism again.
    expect(afterSignOut.status).toBe(200);
    expect(afterSignOut.body?.user).toBeFalsy();
    expect(afterSignOut.body?.reason).toBeUndefined();
  });
});
