import { ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reasoning as apps/api/test/auth.e2e-spec.ts: better-auth is ESM-only and Jest's CommonJS
// runtime cannot load it in-process, so this suite drives the built dist/main.js over real HTTP.
// That also rules out overriding the MAILER_PORT provider through a Nest TestingModule — there is
// no in-process module to override. MAIL_TRANSPORT=capture (capture-mailer.adapter.ts) is this
// suite's process-spawn-safe substitute: it appends every sent message to a file this spec reads,
// which is exactly the "capturing double" the wiring needs to be proven against.
const AUTH_BASE_PATH = '/v1/auth';
const PASSWORD = 'correct-horse-battery-staple';
const NEW_PASSWORD = 'new-correct-horse-battery-staple';
const REDIRECT_TO = 'http://localhost:8081/reset-password';

let api: ChildProcess;
let baseUrl: string;
let pg: Client;
let captureFile: string;
const createdEmails: string[] = [];

interface CapturedMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

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
  const email = `e2e-reset-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  createdEmails.push(email);
  return email;
}

async function signUp(email: string): Promise<void> {
  await request(baseUrl)
    .post(`${AUTH_BASE_PATH}/sign-up/email`)
    .send({ email, password: PASSWORD, name: 'E2E Reset User' })
    .expect(200);
}

function readCapturedMessagesFor(email: string): CapturedMessage[] {
  if (!existsSync(captureFile)) return [];
  return readFileSync(captureFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CapturedMessage)
    .filter((message) => message.to === email);
}

// The mailed url is `${baseURL}/reset-password/<token>?callbackURL=...` (better-auth's own
// requestPasswordReset handler) — this is the path a real person's browser would open. Extracting
// the token here rather than reading it from the database is what proves the mailer-port wiring,
// not just the underlying Better Auth token machinery.
function extractToken(message: CapturedMessage): string {
  const match = message.text.match(/reset-password\/([A-Za-z0-9_-]+)\?/);
  if (!match) {
    throw new Error('captured message did not contain a reset-password token URL');
  }
  return match[1];
}

beforeAll(async () => {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;

  captureFile = resolve(tmpdir(), `password-reset-capture-${Date.now()}-${Math.floor(Math.random() * 1e6)}.ndjson`);
  writeFileSync(captureFile, '');

  api = spawn(process.execPath, [resolve(__dirname, '../dist/main.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      // This suite drives far more auth requests from one IP than any real client would. Raise the
      // ceiling explicitly here rather than weakening the server's production default.
      AUTH_RATE_LIMIT_MAX: '1000',
      AUTH_RATE_LIMIT_WINDOW: '60',
      MAIL_TRANSPORT: 'capture',
      MAIL_CAPTURE_FILE: captureFile,
    },
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

describe('Password reset (e2e)', () => {
  it('calls the mailer port exactly once with the existing account address', async () => {
    const email = freshEmail('happy');
    await signUp(email);

    await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/request-password-reset`)
      .send({ email, redirectTo: REDIRECT_TO })
      .expect(200);

    expect(readCapturedMessagesFor(email)).toHaveLength(1);
  });

  it('returns an identical status and body for a non-existent address and never calls the mailer port for it', async () => {
    const existingEmail = freshEmail('exists');
    await signUp(existingEmail);
    const missingEmail = freshEmail('missing');

    const existingRes = await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/request-password-reset`)
      .send({ email: existingEmail, redirectTo: REDIRECT_TO });

    const missingRes = await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/request-password-reset`)
      .send({ email: missingEmail, redirectTo: REDIRECT_TO });

    expect(missingRes.status).toBe(existingRes.status);
    expect(missingRes.body).toEqual(existingRes.body);
    expect(readCapturedMessagesFor(missingEmail)).toHaveLength(0);
  });

  it('completes a password change with the delivered token; the new password signs in and the old one no longer does', async () => {
    const email = freshEmail('change');
    await signUp(email);

    await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/request-password-reset`)
      .send({ email, redirectTo: REDIRECT_TO })
      .expect(200);

    const [message] = readCapturedMessagesFor(email);
    if (!message) throw new Error('mailer port did not receive a message for this account');
    const token = extractToken(message);

    await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/reset-password`)
      .send({ newPassword: NEW_PASSWORD, token })
      .expect(200);

    await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/sign-in/email`)
      .send({ email, password: NEW_PASSWORD })
      .expect(200);

    const oldPasswordAttempt = await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/sign-in/email`)
      .send({ email, password: PASSWORD });
    expect(oldPasswordAttempt.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects the same token presented a second time', async () => {
    const email = freshEmail('replay');
    await signUp(email);

    await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/request-password-reset`)
      .send({ email, redirectTo: REDIRECT_TO })
      .expect(200);

    const [message] = readCapturedMessagesFor(email);
    if (!message) throw new Error('mailer port did not receive a message for this account');
    const token = extractToken(message);

    await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/reset-password`)
      .send({ newPassword: `${NEW_PASSWORD}-first`, token })
      .expect(200);

    const replay = await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/reset-password`)
      .send({ newPassword: `${NEW_PASSWORD}-second`, token });

    expect(replay.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects an expired-or-fabricated token without revealing whether an account exists', async () => {
    // /reset-password takes only { token, newPassword } — no email at all — so this single
    // generic-failure path is structurally the only response an out-of-band observer ever sees,
    // for both a genuinely expired token and a wholly invented one.
    const fabricated = 'not-a-real-reset-token-000000000000';

    const res = await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/reset-password`)
      .send({ newPassword: NEW_PASSWORD, token: fabricated });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).not.toContain('@');
  });

  it('never reveals the submitted password or the raw token in any response body or error message', async () => {
    const email = freshEmail('leak');
    await signUp(email);

    const resetRequestRes = await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/request-password-reset`)
      .send({ email, redirectTo: REDIRECT_TO })
      .expect(200);

    const [message] = readCapturedMessagesFor(email);
    if (!message) throw new Error('mailer port did not receive a message for this account');
    const token = extractToken(message);

    const resetRes = await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/reset-password`)
      .send({ newPassword: NEW_PASSWORD, token })
      .expect(200);

    const fabricatedRes = await request(baseUrl)
      .post(`${AUTH_BASE_PATH}/reset-password`)
      .send({ newPassword: NEW_PASSWORD, token: 'fabricated-token-000000000000000000' });

    for (const res of [resetRequestRes, resetRes, fabricatedRes]) {
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(NEW_PASSWORD);
      expect(body).not.toContain(token);
    }
  });
});
