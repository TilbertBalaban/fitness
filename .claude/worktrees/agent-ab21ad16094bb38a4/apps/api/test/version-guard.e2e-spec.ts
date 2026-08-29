import { ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import request from 'supertest';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as auth.e2e-spec.ts: @thallesp/nestjs-better-auth and better-auth are ESM-only, so
// this suite drives the built artifact over real HTTP rather than an in-process testing module.
const AUTH_BASE_PATH = '/v1/auth';
const VERSION_HEADER = 'X-Client-Version';
// Strictly above '0.0.0' (the default floor) so the floor is genuinely exercised rather than
// trivially satisfied by a default nothing can fall below.
const FLOOR = '2.0.0';

let api: ChildProcess;
let baseUrl: string;

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

beforeAll(async () => {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;

  api = spawn(process.execPath, [resolve(__dirname, '../dist/main.js')], {
    env: { ...process.env, PORT: String(port), MIN_CLIENT_VERSION: FLOOR },
    stdio: 'pipe',
  });
  api.stderr?.on('data', (d) => process.stderr.write(`[api] ${d}`));

  await waitForReady(baseUrl);
}, 60000);

afterAll(() => {
  if (api && !api.killed) {
    api.kill('SIGTERM');
  }
});

describe('Minimum client version floor (e2e)', () => {
  it('serves a versioned route normally when the client version is above the floor', async () => {
    const res = await request(baseUrl)
      .get(`${AUTH_BASE_PATH}/get-session`)
      .set(VERSION_HEADER, '3.0.0');

    expect(res.status).toBe(200);
  });

  it('rejects a versioned route with 426 and the reason code when the client version is below the floor', async () => {
    const res = await request(baseUrl)
      .get(`${AUTH_BASE_PATH}/get-session`)
      .set(VERSION_HEADER, '1.0.0');

    expect(res.status).toBe(426);
    expect(JSON.stringify(res.body)).toContain('client_version_below_minimum');
  });

  it('serves the route normally when no client version header is sent', async () => {
    const res = await request(baseUrl).get(`${AUTH_BASE_PATH}/get-session`);

    expect(res.status).toBe(200);
  });

  it('serves the route normally when the client version header is malformed', async () => {
    const res = await request(baseUrl)
      .get(`${AUTH_BASE_PATH}/get-session`)
      .set(VERSION_HEADER, 'not-a-semver');

    expect(res.status).toBe(200);
  });

  it('keeps GET /health reachable even when the client version is below the floor', async () => {
    const res = await request(baseUrl).get('/health').set(VERSION_HEADER, '1.0.0');

    expect(res.status).toBe(200);
  });

  it('does not route a request with no version segment to a versioned controller', async () => {
    const res = await request(baseUrl).get('/auth/get-session');

    expect(res.status).toBe(404);
  });
});
