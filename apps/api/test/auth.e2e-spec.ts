import { ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// The API and its Better Auth dependencies are ESM-only. Jest's CommonJS module runtime cannot
// load them in-process, but Node itself can (require(esm), Node >= 22). So this suite drives the
// real built artifact over real HTTP rather than an in-process testing module — which also makes
// it a truer end-to-end test than a mounted Nest app would be.
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
      // Any answered request proves the listener is up; the status itself does not matter.
      await request(url).get(`${AUTH_BASE_PATH}/get-session`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`API did not become ready at ${url} within ${timeoutMs}ms`);
}

function freshEmail(tag: string): string {
  const email = `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

async function userRowCount(email: string): Promise<number> {
  const result = await pg.query('SELECT count(*)::int AS n FROM "user" WHERE email = $1', [email]);
  return result.rows[0].n;
}

beforeAll(async () => {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;

  api = spawn(process.execPath, [resolve(__dirname, '../dist/main.js')], {
    // This suite drives far more auth requests from one IP than any real client would. Raise the
    // ceiling explicitly here rather than weakening the server's production default.
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

describe('Auth (e2e)', () => {
  it('serves every auth route under an explicit version segment', async () => {
    // Nothing is reachable unversioned: the same route without /v1 must not resolve.
    const unversioned = await request(baseUrl).get('/auth/get-session');
    expect(unversioned.status).toBe(404);

    const versioned = await request(baseUrl).get(`${AUTH_BASE_PATH}/get-session`);
    expect(versioned.status).toBe(200);
  });

  it('signs a new account up and reads the same email back from get-session', async () => {
    const email = freshEmail('happy');

    const signUp = await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/sign-up/email`)
      .send({ email, password: PASSWORD, name: 'E2E User' })
      .expect(200);

    expect(signUp.body.user.email).toBe(email);
    expect(await userRowCount(email)).toBe(1);

    const session = await request(baseUrl)
      .get(`${AUTH_BASE_PATH}/get-session`)
      .set('Cookie', sessionCookie(signUp))
      .expect(200);

    expect(session.body.user.email).toBe(email);
  });

  it('signs an existing account in', async () => {
    const email = freshEmail('signin');

    await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/sign-up/email`)
      .send({ email, password: PASSWORD, name: 'E2E User' })
      .expect(200);

    const signIn = await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/sign-in/email`)
      .send({ email, password: PASSWORD })
      .expect(200);

    expect(signIn.body.user.email).toBe(email);
  });

  it('rejects a second sign-up for the same email without creating a second row', async () => {
    const email = freshEmail('dup');

    const first = await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/sign-up/email`)
      .send({ email, password: PASSWORD, name: 'First' })
      .expect(200);

    const second = await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/sign-up/email`)
      .send({ email, password: 'a-completely-different-password', name: 'Impostor' });

    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(await userRowCount(email)).toBe(1);

    // The original account must still authenticate with its ORIGINAL password — proving the
    // rejected attempt did not overwrite the stored credential.
    const stillWorks = await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/sign-in/email`)
      .send({ email, password: PASSWORD })
      .expect(200);

    expect(stillWorks.body.user.id).toBe(first.body.user.id);
  });

  it('resolves two concurrent sign-ups for one email to exactly one persisted user', async () => {
    const email = freshEmail('race');

    const attempts = await Promise.allSettled([
      request(baseUrl)
        .post(`${AUTH_BASE_PATH}/sign-up/email`)
        .send({ email, password: PASSWORD, name: 'Racer A' }),
      request(baseUrl)
        .post(`${AUTH_BASE_PATH}/sign-up/email`)
        .send({ email, password: PASSWORD, name: 'Racer B' }),
    ]);

    const statuses = attempts.map((a) => (a.status === 'fulfilled' ? a.value.status : 0));
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(await userRowCount(email)).toBe(1);
  });

  it('never echoes the submitted password in any auth response body', async () => {
    const email = freshEmail('leak');

    const signUp = await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/sign-up/email`)
      .send({ email, password: PASSWORD, name: 'Leak Check' })
      .expect(200);

    const signIn = await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/sign-in/email`)
      .send({ email, password: PASSWORD })
      .expect(200);

    const session = await request(baseUrl)
      .get(`${AUTH_BASE_PATH}/get-session`)
      .set('Cookie', sessionCookie(signUp))
      .expect(200);

    for (const res of [signUp, signIn, session]) {
      expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
    }
  });
});
