import { ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import request from 'supertest';
import { CATALOG_VERSION_PATH } from '@fitness/api-contracts';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as catalog-delivery.e2e-spec.ts and version-guard.e2e-spec.ts: @thallesp/nestjs-better-auth
// and better-auth are ESM-only, so this suite drives the built artifact over real HTTP rather than an
// in-process testing module — copied verbatim, not reconstructed.
const AUTH_BASE_PATH = '/v1/auth';
const ALLOWED_ORIGIN = 'http://localhost:8081';
const SECOND_ALLOWED_ORIGIN = 'http://localhost:19006';
const DISALLOWED_ORIGIN = 'http://evil.example.com';
const FLOOR = '2.0.0';
const VERSION_HEADER = 'X-Client-Version';

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
      await request(url).get('/health');
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
    env: {
      ...process.env,
      PORT: String(port),
      WEB_ORIGINS: `${ALLOWED_ORIGIN},${SECOND_ALLOWED_ORIGIN}`,
      MIN_CLIENT_VERSION: FLOOR,
    },
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

describe('CORS (e2e)', () => {
  it('answers a credentialed preflight to /v1/auth/sign-up/email with allow-credentials and the echoed origin', async () => {
    const res = await request(baseUrl)
      .options('/v1/auth/sign-up/email')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  it('answers a preflight to a Nest-routed handler (/v1/catalog/version), proving CORS covers more than the Better Auth mount', async () => {
    const res = await request(baseUrl)
      .options(CATALOG_VERSION_PATH)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'content-type');

    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  it('echoes the second allowlisted origin, proving comma-separated WEB_ORIGINS parsing reached the CORS layer', async () => {
    const res = await request(baseUrl)
      .options('/v1/auth/sign-up/email')
      .set('Origin', SECOND_ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(res.headers['access-control-allow-origin']).toBe(SECOND_ALLOWED_ORIGIN);
  });

  it('withholds Access-Control-Allow-Origin for an origin outside WEB_ORIGINS, proving the allowlist is an allowlist', async () => {
    const res = await request(baseUrl)
      .options('/v1/auth/sign-up/email')
      .set('Origin', DISALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    // Do NOT also assert the credentials header is absent here: cors@2.8.6's configureCredentials
    // sets Access-Control-Allow-Credentials: true unconditionally whenever credentials: true is
    // configured, regardless of origin match. Access-Control-Allow-Origin is the header the browser
    // actually gates on, and its absence for a non-listed origin is the correct, sufficient proof.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sends Vary: Origin on a preflight response, so a shared cache cannot replay one origin\'s allow-origin to another', async () => {
    const res = await request(baseUrl)
      .options('/v1/auth/sign-up/email')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(res.headers['vary']).toContain('Origin');
  });

  it('includes content-type in Access-Control-Allow-Headers, since Better Auth\'s JSON POSTs cannot proceed without it', async () => {
    const res = await request(baseUrl)
      .options('/v1/auth/sign-up/email')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(res.headers['access-control-allow-headers']?.toLowerCase()).toContain('content-type');
  });

  it('carries the echoed origin and credentials header on a real (non-preflight) response, not only on preflights', async () => {
    const res = await request(baseUrl).get(`${AUTH_BASE_PATH}/get-session`).set('Origin', ALLOWED_ORIGIN);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  // If enableCors is ever moved below minClientVersionMiddleware in main.ts, the 426 response below
  // would be written before any CORS header was set and this case turns red — that is the guard
  // this test exists to enforce; do not "simplify" it away.
  it('still carries CORS headers on a 426 client-version rejection, so the browser can read the reason code instead of reporting a CORS failure', async () => {
    const res = await request(baseUrl)
      .get(CATALOG_VERSION_PATH)
      .set('Origin', ALLOWED_ORIGIN)
      .set(VERSION_HEADER, '1.0.0');

    expect(res.status).toBe(426);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
