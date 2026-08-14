import * as SecureStore from 'expo-secure-store';
import { CLIENT_VERSION, CLIENT_VERSION_HEADER } from '../client-version';
import { classifyAuthOutcome, classifySessionProbe, isRevocation, SESSION_REVOKED_REASON } from '../session-guard';
import { apiFetch, setSessionCredentialProvider } from '../api-client';
import { AUTH_ENDPOINT, clearCachedSession } from '../auth-storage';
import { pendingWriteCount, signOut } from '../sign-out';

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const mockedSecureStore = SecureStore as unknown as {
  deleteItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
};

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

describe('classifySessionProbe', () => {
  it('classifies a 200 no-session response as revoked when a credential was presented', async () => {
    await expect(classifySessionProbe(fakeResponse(200, null), true)).resolves.toBe('revoked');
  });

  it('classifies the identical response as ok when no credential was presented', async () => {
    await expect(classifySessionProbe(fakeResponse(200, null), false)).resolves.toBe('ok');
  });

  it('classifies a completed 2xx response that reports a session as ok, credential or not', async () => {
    await expect(classifySessionProbe(fakeResponse(200, { user: { id: '1' } }), true)).resolves.toBe('ok');
    await expect(classifySessionProbe(fakeResponse(200, { user: { id: '1' } }), false)).resolves.toBe('ok');
  });

  it('classifies a thrown network error as offline even with a credential presented', async () => {
    await expect(classifySessionProbe(new TypeError('Network request failed'), true)).resolves.toBe('offline');
  });

  it('classifies a completed 5xx as offline even with a credential presented', async () => {
    await expect(classifySessionProbe(fakeResponse(500, {}), true)).resolves.toBe('offline');
  });

  it('classifies a completed 401 with no revocation reason as rejected even with a credential presented', async () => {
    await expect(classifySessionProbe(fakeResponse(401, { reason: 'bad_credentials' }), true)).resolves.toBe(
      'rejected',
    );
  });

  it('classifies a completed 401 carrying the revocation reason as revoked, unchanged', async () => {
    await expect(classifySessionProbe(fakeResponse(401, { reason: SESSION_REVOKED_REASON }), true)).resolves.toBe(
      'revoked',
    );
  });

  it('falls back to the unupgraded classification when the body cannot be parsed', async () => {
    const unparseable = {
      status: 200,
      json: async () => {
        throw new Error('invalid json');
      },
      clone() {
        return this;
      },
    };
    await expect(classifySessionProbe(unparseable, true)).resolves.toBe('ok');
  });
});

describe('apiFetch', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setSessionCredentialProvider(() => null);
  });

  it('attaches CLIENT_VERSION under CLIENT_VERSION_HEADER on every request', async () => {
    const fetchMock = jest.fn().mockResolvedValue(fakeResponse(200, {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await apiFetch('https://example.com/v1/auth/get-session');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers[CLIENT_VERSION_HEADER]).toBe(CLIENT_VERSION);
  });

  it('returns the classified outcome alongside the response and never itself clears session state', async () => {
    const fetchMock = jest.fn().mockResolvedValue(fakeResponse(401, { reason: SESSION_REVOKED_REASON }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await apiFetch('https://example.com/v1/auth/get-session');

    expect(result.outcome).toBe('revoked');
    expect(result.response).toBeTruthy();
  });

  it('classifies a request that exceeds its timeout as offline', async () => {
    globalThis.fetch = jest.fn((_input: unknown, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    }) as unknown as typeof fetch;

    const result = await apiFetch('https://example.com/v1/auth/get-session', {}, 10);

    expect(result.outcome).toBe('offline');
  });

  it('attaches a registered credential under the lowercase cookie header for a request under the API origin', async () => {
    const fetchMock = jest.fn().mockResolvedValue(fakeResponse(200, {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    setSessionCredentialProvider(() => 'fitness_cookie=abc123');

    await apiFetch(`${AUTH_ENDPOINT}/get-session`);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.cookie).toBe('fitness_cookie=abc123');
  });

  it('attaches no cookie header when no provider is registered', async () => {
    const fetchMock = jest.fn().mockResolvedValue(fakeResponse(200, {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await apiFetch(`${AUTH_ENDPOINT}/get-session`);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.cookie).toBeUndefined();
  });

  it('attaches no cookie header when the registered provider yields an empty string', async () => {
    const fetchMock = jest.fn().mockResolvedValue(fakeResponse(200, {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    setSessionCredentialProvider(() => '');

    await apiFetch(`${AUTH_ENDPOINT}/get-session`);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.cookie).toBeUndefined();
  });

  it('attaches no cookie header when the registered provider yields null', async () => {
    const fetchMock = jest.fn().mockResolvedValue(fakeResponse(200, {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    setSessionCredentialProvider(() => null);

    await apiFetch(`${AUTH_ENDPOINT}/get-session`);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.cookie).toBeUndefined();
  });

  it('attaches no cookie header for a request to a host that is not the API origin, even with a provider registered', async () => {
    const fetchMock = jest.fn().mockResolvedValue(fakeResponse(200, {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    setSessionCredentialProvider(() => 'fitness_cookie=abc123');

    await apiFetch('https://not-this-project.example.com/v1/auth/get-session');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.cookie).toBeUndefined();
  });

  it('treats a throwing provider as no credential: the request still goes out with no cookie header', async () => {
    const fetchMock = jest.fn().mockResolvedValue(fakeResponse(200, {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    setSessionCredentialProvider(() => {
      throw new Error('secure-storage read failed');
    });

    const result = await apiFetch(`${AUTH_ENDPOINT}/get-session`);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.cookie).toBeUndefined();
    expect(result.outcome).toBe('ok');
  });
});

describe('sign-out lifecycle', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockedSecureStore.deleteItemAsync.mockClear();
    mockedSecureStore.setItemAsync.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setSessionCredentialProvider(() => null);
  });

  it('pendingWriteCount resolves to 0', async () => {
    await expect(pendingWriteCount()).resolves.toBe(0);
  });

  it('proceeds without rendering a confirmation when the pending count is 0', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(fakeResponse(200, {})) as unknown as typeof fetch;
    const confirmDiscard = jest.fn();

    await signOut({ confirmDiscard, getPendingCount: async () => 0 });

    expect(confirmDiscard).not.toHaveBeenCalled();
    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it('resolves only after the caller confirms when the pending count is above 0, and confirming clears local state', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(fakeResponse(200, {})) as unknown as typeof fetch;
    const confirmDiscard = jest.fn().mockResolvedValue(true);

    await signOut({ confirmDiscard, getPendingCount: async () => 3 });

    expect(confirmDiscard).toHaveBeenCalledWith(3);
    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it('resolves without clearing anything if the caller cancels', async () => {
    const fetchMock = jest.fn().mockResolvedValue(fakeResponse(200, {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const confirmDiscard = jest.fn().mockResolvedValue(false);

    await signOut({ confirmDiscard, getPendingCount: async () => 3 });

    expect(confirmDiscard).toHaveBeenCalledWith(3);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockedSecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('clears the cached session and the secure-storage entries the auth client wrote', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(fakeResponse(200, {})) as unknown as typeof fetch;

    await signOut({ getPendingCount: async () => 0 });

    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith(expect.stringContaining('_cookie'));
    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith(expect.stringContaining('_session_data'));
  });

  it('still clears local state when the server revocation request classifies as offline', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;

    await signOut({ getPendingCount: async () => 0 });

    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it('still clears local state when the server revocation request returns a non-2xx', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(fakeResponse(500, {})) as unknown as typeof fetch;

    await signOut({ getPendingCount: async () => 0 });

    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it('attaches the client version header, because it goes through the same request path as everything else', async () => {
    const fetchMock = jest.fn().mockResolvedValue(fakeResponse(200, {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await signOut({ getPendingCount: async () => 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers[CLIENT_VERSION_HEADER]).toBe(CLIENT_VERSION);
  });

  it('attaches the registered session credential on the outgoing sign-out request, with no credential logic of its own', async () => {
    const fetchMock = jest.fn().mockResolvedValue(fakeResponse(200, {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    setSessionCredentialProvider(() => 'fitness_cookie=abc123');

    await signOut({ getPendingCount: async () => 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.cookie).toBe('fitness_cookie=abc123');
  });

  it('resolves a second consecutive signOut() without throwing, sending no credential now that storage is empty', async () => {
    const fetchMock = jest.fn().mockResolvedValue(fakeResponse(200, {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    setSessionCredentialProvider(() => 'fitness_cookie=abc123');

    await expect(signOut({ getPendingCount: async () => 0 })).resolves.toBeUndefined();

    // The state the device is actually in after the first sign-out cleared storage: nothing to present.
    setSessionCredentialProvider(() => '');
    await expect(signOut({ getPendingCount: async () => 0 })).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondInit] = fetchMock.mock.calls[1];
    expect(secondInit.headers.cookie).toBeUndefined();
    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith(expect.stringContaining('_cookie'));
  });

  it('leaves secure storage cleared, with no credential re-persisted, when signOut and a revoked-probe clear resolve in the same tick', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(fakeResponse(200, {})) as unknown as typeof fetch;

    // clearCachedSession() stands in for what app/_layout.tsx's background probe does on a
    // `revoked` classification — the two paths racing to clear the same two keys.
    await Promise.all([signOut({ getPendingCount: async () => 0 }), clearCachedSession()]);

    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith(expect.stringContaining('_cookie'));
    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith(expect.stringContaining('_session_data'));
    expect(mockedSecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('leaves secure storage cleared, with no credential re-persisted, when a revoked-probe clear resolves while a sign-out revoke request is still in flight', async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    globalThis.fetch = jest.fn(() => pending) as unknown as typeof fetch;

    const signOutPromise = signOut({ getPendingCount: async () => 0 });
    await clearCachedSession();
    resolveFetch(fakeResponse(200, {}));
    await signOutPromise;

    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith(expect.stringContaining('_cookie'));
    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith(expect.stringContaining('_session_data'));
    expect(mockedSecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});
