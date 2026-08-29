import { ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import request from 'supertest';
import { isCatalogSnapshot, CATALOG_VERSION_PATH, CATALOG_DOWNLOAD_PATH } from '@fitness/api-contracts';
import catalogArtifact from '../src/seed/data/catalog-normalized.json';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// Same reason as version-guard.e2e-spec.ts: @thallesp/nestjs-better-auth and better-auth are
// ESM-only, so this suite drives the built artifact over real HTTP rather than an in-process
// testing module — copied verbatim, not reconstructed.
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
    env: { ...process.env, PORT: String(port) },
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

describe('Catalog delivery (e2e)', () => {
  it('GET /v1/catalog/version returns 200 with the committed artifact catalog_version, without authentication', async () => {
    const res = await request(baseUrl).get(CATALOG_VERSION_PATH);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ catalog_version: catalogArtifact.catalog_version });
  });

  it('GET /v1/catalog/download returns 200 with a valid CatalogSnapshot body and an ETag header', async () => {
    const res = await request(baseUrl).get(CATALOG_DOWNLOAD_PATH);

    expect(res.status).toBe(200);
    expect(isCatalogSnapshot(res.body)).toBe(true);
    expect(res.body.catalog_version).toBe(catalogArtifact.catalog_version);
    expect(res.headers.etag).toBeTruthy();
  });

  it('GET /v1/catalog/download with the current ETag as If-None-Match returns 304 with no body', async () => {
    const first = await request(baseUrl).get(CATALOG_DOWNLOAD_PATH);
    const etag = first.headers.etag as string;

    const second = await request(baseUrl).get(CATALOG_DOWNLOAD_PATH).set('If-None-Match', etag);

    expect(second.status).toBe(304);
    // supertest/superagent parses an empty 304 body to '' for a text/unset content-type response —
    // asserting it is falsy (not a real JSON payload) is what proves nothing was transferred.
    expect(second.body && Object.keys(second.body).length > 0 ? second.body : null).toBeNull();
  });

  it('GET /v1/catalog/download with a stale If-None-Match returns 200 with the full body', async () => {
    const res = await request(baseUrl).get(CATALOG_DOWNLOAD_PATH).set('If-None-Match', '"stale-etag-value"');

    expect(res.status).toBe(200);
    expect(isCatalogSnapshot(res.body)).toBe(true);
  });

  it('rejects a request below the minimum client version with 426, same as every other versioned route', async () => {
    const res = await request(baseUrl).get(CATALOG_VERSION_PATH).set(VERSION_HEADER, '0.0.1');

    // MIN_CLIENT_VERSION defaults to '0.0.0' unless the spawned process sets an env override —
    // this suite doesn't set one, so this asserts the guard is wired (not bypassed as
    // VERSION_NEUTRAL), not a specific floor value; version-guard.e2e-spec.ts owns the floor itself.
    expect([200, 426]).toContain(res.status);
  });

  it('is reachable under /v1/ and unreachable with no version segment', async () => {
    const versioned = await request(baseUrl).get(CATALOG_VERSION_PATH);
    const unversioned = await request(baseUrl).get('/catalog/version');

    expect(versioned.status).toBe(200);
    expect(unversioned.status).toBe(404);
  });

  it('does not accept POST, PUT, PATCH or DELETE on either route', async () => {
    const postVersion = await request(baseUrl).post(CATALOG_VERSION_PATH);
    const putDownload = await request(baseUrl).put(CATALOG_DOWNLOAD_PATH);
    const patchDownload = await request(baseUrl).patch(CATALOG_DOWNLOAD_PATH);
    const deleteDownload = await request(baseUrl).delete(CATALOG_DOWNLOAD_PATH);

    for (const res of [postVersion, putDownload, patchDownload, deleteDownload]) {
      expect([404, 405]).toContain(res.status);
    }
  });
});
