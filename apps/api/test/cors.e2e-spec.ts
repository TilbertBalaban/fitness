import { ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import request from 'supertest';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as catalog-delivery.e2e-spec.ts and version-guard.e2e-spec.ts: @thallesp/nestjs-better-auth
// and better-auth are ESM-only, so this suite drives the built artifact over real HTTP rather than an
// in-process testing module — copied verbatim, not reconstructed.
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
});
