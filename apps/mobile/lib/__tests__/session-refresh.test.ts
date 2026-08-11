import { CLIENT_VERSION, CLIENT_VERSION_HEADER } from '../client-version';
import { classifyAuthOutcome, isRevocation, SESSION_REVOKED_REASON } from '../session-guard';
import { apiFetch } from '../api-client';

function fakeResponse(status: number, body: unknown = {}) {
  return {
    status,
    json: async () => body,
    clone() {
      return this;
    },
  };
}

describe('classifyAuthOutcome', () => {
  it('classifies a fetch that rejects with a network error as offline', async () => {
    await expect(classifyAuthOutcome(new TypeError('Network request failed'))).resolves.toBe('offline');
  });

  it('classifies a request that exceeds its timeout as offline', async () => {
    await expect(classifyAuthOutcome(new DOMException('The operation was aborted.', 'AbortError'))).resolves.toBe(
      'offline',
    );
  });

  it('classifies a DNS resolution failure as offline', async () => {
    await expect(classifyAuthOutcome(new TypeError('fetch failed'))).resolves.toBe('offline');
  });

  it.each([500, 502, 503, 504])('classifies a completed %i response as offline', async (status) => {
    await expect(classifyAuthOutcome(fakeResponse(status))).resolves.toBe('offline');
  });

  it('classifies a completed 401 carrying a revoked-session reason as revoked', async () => {
    await expect(classifyAuthOutcome(fakeResponse(401, { reason: SESSION_REVOKED_REASON }))).resolves.toBe(
      'revoked',
    );
  });

  it('classifies a completed 403 carrying a revoked-session reason as revoked', async () => {
    await expect(classifyAuthOutcome(fakeResponse(403, { reason: SESSION_REVOKED_REASON }))).resolves.toBe(
      'revoked',
    );
  });

  it('classifies a completed 401 with no revocation reason as rejected, not revoked', async () => {
    await expect(classifyAuthOutcome(fakeResponse(401, { reason: 'bad_credentials' }))).resolves.toBe('rejected');
  });

  it('classifies a completed 2xx as ok', async () => {
    await expect(classifyAuthOutcome(fakeResponse(200, { ok: true }))).resolves.toBe('ok');
  });

  it('classifies a completed 426 as rejected, never as revoked', async () => {
    await expect(classifyAuthOutcome(fakeResponse(426, { reason: 'client_version_below_minimum' }))).resolves.toBe(
      'rejected',
    );
  });
});

describe('isRevocation', () => {
  it('returns true only for the revoked outcome', () => {
    expect(isRevocation('revoked')).toBe(true);
    expect(isRevocation('ok')).toBe(false);
    expect(isRevocation('offline')).toBe(false);
    expect(isRevocation('rejected')).toBe(false);
  });
});

describe('apiFetch', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('attaches CLIENT_VERSION under CLIENT_VERSION_HEADER on every request', async () => {
    const fetchMock = jest.fn().mockResolvedValue(fakeResponse(200, {}));
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiFetch('https://example.com/v1/auth/get-session');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers[CLIENT_VERSION_HEADER]).toBe(CLIENT_VERSION);
  });

  it('returns the classified outcome alongside the response and never itself clears session state', async () => {
    const fetchMock = jest.fn().mockResolvedValue(fakeResponse(401, { reason: SESSION_REVOKED_REASON }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await apiFetch('https://example.com/v1/auth/get-session');

    expect(result.outcome).toBe('revoked');
    expect(result.response).toBeTruthy();
  });

  it('classifies a request that exceeds its timeout as offline', async () => {
    global.fetch = jest.fn((_input: unknown, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    }) as unknown as typeof fetch;

    const result = await apiFetch('https://example.com/v1/auth/get-session', {}, 10);

    expect(result.outcome).toBe('offline');
  });
});
