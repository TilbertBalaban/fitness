# Phase 1: Cross-Platform Foundation - Pattern Map (Gap Closure)

**Mapped:** 2026-08-14
**Mode:** gap_closure — CR-01 (native credential attachment), WR-02 (theme test sentinel), WR-03 (sign-up string-split)
**Files analyzed:** 8
**Analogs found:** 8 / 8 (all analogs are the files themselves or their immediate siblings — this is a
targeted bugfix phase, not new-file scaffolding, so "closest analog" means "the existing convention this
fix must not break," not a different file to imitate wholesale)

## File Classification

| Target File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/mobile/lib/api-client.ts` | service (shared HTTP transport) | request-response | itself (`apiFetch`) + `apps/mobile/lib/auth-client.ts` (`expoClient` plugin, the credential source of truth) | exact — fix is additive to existing function |
| `apps/mobile/lib/sign-out.ts` | service (session lifecycle) | request-response | itself (`revokeServerSession`), consumes fixed `api-client.ts` | exact — no direct edit expected once api-client.ts is fixed, unless it still needs `Platform.OS` cleanup |
| `apps/mobile/app/_layout.tsx` | provider/root layout (session bootstrap) | request-response (background check) | itself (background revocation `useEffect`, lines 40-49) | exact — no direct edit expected once api-client.ts is fixed |
| `apps/mobile/lib/auth-storage.ts` | utility (SecureStore key contract) | file-I/O | itself — already exports `AUTH_STORAGE_PREFIX`; needs a new exported reader for the cookie value | exact |
| `apps/mobile/lib/auth-client.ts` | provider (Better Auth client construction) | request-response | itself — `expoClient` plugin config; reference only, not edited by the fix | exact |
| `apps/mobile/lib/__tests__/session-refresh.test.ts` | test | request-response | itself — existing `describe('apiFetch', ...)` and `describe('sign-out lifecycle', ...)` blocks are the template for the new credential-assertion test | exact |
| `apps/mobile/lib/__tests__/theme.test.ts` | test | transform | itself, lines 84-92 — WR-02 fix site | exact |
| `apps/mobile/app/(auth)/sign-up.tsx` | component (auth screen) | request-response | itself, lines 21-25 — WR-03 fix site | exact |

## Pattern Assignments

### `apps/mobile/lib/api-client.ts` (service, request-response) — CR-01 root cause

**Current implementation** (full file, 37 lines):
```typescript
import { CLIENT_VERSION, CLIENT_VERSION_HEADER } from './client-version';
import { classifyAuthOutcome, type AuthOutcome } from './session-guard';

const DEFAULT_TIMEOUT_MS = 15000;

export interface ApiFetchInit extends Omit<RequestInit, 'headers' | 'signal'> {
  headers?: Record<string, string>;
}

export interface ApiFetchResult {
  response: Response | null;
  outcome: AuthOutcome;
}

export async function apiFetch(
  input: string,
  init: ApiFetchInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ApiFetchResult> {
  const headers = { ...(init.headers ?? {}), [CLIENT_VERSION_HEADER]: CLIENT_VERSION };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, { ...init, headers, signal: controller.signal });
    const outcome = await classifyAuthOutcome(response);
    return { response, outcome };
  } catch (error) {
    const outcome = await classifyAuthOutcome(error);
    return { response: null, outcome };
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**What is missing (per CR-01 / VERIFICATION gaps):** No read of the SecureStore-persisted session
cookie, no `Cookie` header on native. Web relies on the browser cookie jar plus each caller passing
`credentials: 'include'` (see `sign-out.ts:24` and `IN-02` — that per-call-site `Platform.OS` branch is
itself flagged as an undocumented exception to `docs/platform-modules.md`'s "no `Platform.OS` at the call
site" rule; centralizing the credential logic inside `apiFetch` is also the fix for IN-02's `sign-out.ts`
half).

**01-REVIEW.md's own proposed fix** (CR-01, cite verbatim as the house-endorsed shape — do not deviate
without reason):
```typescript
// apps/mobile/lib/api-client.ts
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { AUTH_STORAGE_PREFIX } from './auth-storage';

async function nativeSessionCookie(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  return SecureStore.getItemAsync(`${AUTH_STORAGE_PREFIX}_cookie`);
}

// ...inside apiFetch, before calling fetch():
const cookie = await nativeSessionCookie();
const headers = {
  ...(init.headers ?? {}),
  [CLIENT_VERSION_HEADER]: CLIENT_VERSION,
  ...(cookie ? { Cookie: cookie } : {}),
};
```

**Convention this fix must respect:**
- `auth-storage.ts:19` already exports `AUTH_STORAGE_PREFIX = 'fitness'` — reuse it, do not
  re-declare `'fitness'` as a literal in `api-client.ts` (the project's own comment in
  `auth-storage.ts:11-18` explains this constant exists precisely so three files — `auth-client.ts`,
  `app/_layout.tsx`, `sign-out.ts` — don't redeclare the prefix independently; `api-client.ts` becomes a
  fourth consumer of the same constant).
- Prefer exposing a reader function *from* `auth-storage.ts` (e.g. `getCachedSessionCookie()`) rather
  than reaching into `SecureStore` directly from `api-client.ts`, so the key-name contract
  (`${AUTH_STORAGE_PREFIX}_cookie`) stays owned by one file, matching the existing pattern where
  `clearCachedSession()` (auth-storage.ts:21-27) is the sole writer/deleter of those two keys. Adding a
  matching reader is the most consistent extension, not a new pattern.
- `apiFetch`'s existing header-merge line (`{ ...(init.headers ?? {}), [CLIENT_VERSION_HEADER]:
  CLIENT_VERSION }`) is the exact spot to extend — keep the same object-spread style, do not restructure
  into a builder/class.
- `Platform.OS === 'web'` guard belongs inside the cookie-reader (as in the review's snippet), consistent
  with `clearCachedSession()`'s own early-return-on-web at `auth-storage.ts:22`.
- Alternative considered and available: route through `authClient`'s own `$fetch` (which
  `expoClient`'s plugin instruments to attach the cookie automatically — see `auth-client.ts:20-27`,
  the `expoClient({ storage: SecureStore, storagePrefix: AUTH_STORAGE_PREFIX })` config) instead of a
  bare `fetch()`. This is the review's stated alternative fix. Either approach must still produce a
  `Response`-shaped object `classifyAuthOutcome` (session-guard.ts) can consume unchanged — do not fork
  the classification logic per transport.

---

### `apps/mobile/lib/sign-out.ts` (service, request-response)

**Current implementation** (full file, 39 lines) — see excerpt in api-client.ts section context; key
lines:
```typescript
async function revokeServerSession(): Promise<void> {
  await apiFetch(`${AUTH_ENDPOINT}/sign-out`, {
    method: 'POST',
    credentials: Platform.OS === 'web' ? 'include' : undefined,
  });
}
```

**Convention:** Once `apiFetch` centrally attaches the native cookie, this file needs **no direct
edit** for CR-01 to be closed on the `sign-out` call site — `revokeServerSession` already routes
through `apiFetch`. The `Platform.OS === 'web' ? 'include' : undefined` line stays correct (web still
needs `credentials: 'include'` for the browser cookie jar; native's fix lives entirely inside
`apiFetch`). Do not add a second, redundant cookie-attachment here — IN-02 already flags this file's one
`Platform.OS` branch as an existing, accepted (if undocumented) exception; adding more `Platform.OS`
logic here would compound rather than fix that finding.

---

### `apps/mobile/app/_layout.tsx` (provider, request-response) — background revocation check

**Current implementation** (lines 40-49):
```typescript
useEffect(() => {
  if (isWeb || backgroundRefreshFired.current) return;
  backgroundRefreshFired.current = true;
  void (async () => {
    const { outcome } = await apiFetch(`${AUTH_ENDPOINT}/get-session`);
    if (!isRevocation(outcome)) return;
    await clearCachedSession();
    await authClient.getSession();
  })();
}, []);
```

**Convention:** No direct edit required once `apiFetch` is fixed — this call site already routes
through `apiFetch` and already correctly no-ops on `offline`/`rejected` (D-03). It is the second of the
two call sites CR-01 names; verifying its outcome flips from always-`ok` to correctly-`revoked` when the
server actually revokes is a *test* concern (see `session-refresh.test.ts` below), not a code-change
concern in this file.

---

### `apps/mobile/lib/auth-storage.ts` (utility, file-I/O)

**Current implementation** (full file, 27 lines) — see full excerpt above. Owns:
- `AUTH_STORAGE_PREFIX = 'fitness'`
- `clearCachedSession()` — deletes `${AUTH_STORAGE_PREFIX}_cookie` and `${AUTH_STORAGE_PREFIX}_session_data`, web-guarded with an early return.

**Convention for the new reader function** (if this is the chosen implementation path):
```typescript
export async function getCachedSessionCookie(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  return SecureStore.getItemAsync(`${AUTH_STORAGE_PREFIX}_cookie`);
}
```
Match `clearCachedSession`'s existing shape exactly: same web guard placement, same key-template string,
`async`/`Promise`-returning, no thrown errors on missing key (`getItemAsync` already resolves `null` for
a missing key — do not add a try/catch that isn't already the house pattern elsewhere in this file).

**Key-shape note (cited from this file's own comment, lines 11-18):** the stored key format
(`${prefix}_cookie`, `${prefix}_session_data`) is asserted to come from `@better-auth/expo`'s
`ExpoClientOptions.storagePrefix` JSDoc. `node_modules` was not present in this sandbox to independently
re-verify the exported symbol names inside `@better-auth/expo/client` at write time — the planner/executor
should re-confirm the value actually stored under `_cookie` is a raw `Cookie`-header-ready string (not a
JSON-wrapped structure) by reading the installed package or by a runtime `console.log` before wiring it
into `apiFetch`'s headers, since `sign-out.ts`/`auth-client.ts`'s existing comments assert this shape but
do not show a direct read of the library source in-repo.

---

### `apps/mobile/lib/auth-client.ts` (provider, request-response)

**Reference only — not a direct edit target.** Shows the `expoClient` plugin's config surface
(`scheme`, `storagePrefix`, `storage: SecureStore`) and the project's existing `@ts-expect-error`
convention for a documented, understood upstream type mismatch (lines 14-19) — if the chosen CR-01 fix
is "route through `authClient.$fetch`" rather than a hand-rolled cookie read, this is the file whose
`authClient` export becomes the new dependency of `api-client.ts`, and the same `@ts-expect-error`
justification-comment convention (explain *why*, cite the specific narrowing, note it will start failing
loudly when upstream fixes it) applies to any new suppression that approach might require.

---

### `apps/mobile/lib/__tests__/session-refresh.test.ts` (test, request-response)

**House test conventions to match exactly** (this file is the template for the new regression test):

**Fetch mocking pattern** (lines 92-101, the direct analog for a new "attaches a credential" test):
```typescript
it('attaches CLIENT_VERSION under CLIENT_VERSION_HEADER on every request', async () => {
  const fetchMock = jest.fn().mockResolvedValue(fakeResponse(200, {}));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  await apiFetch('https://example.com/v1/auth/get-session');

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [, init] = fetchMock.mock.calls[0];
  expect(init.headers[CLIENT_VERSION_HEADER]).toBe(CLIENT_VERSION);
});
```
A new test asserting credential attachment should be structured identically: mock `globalThis.fetch`,
call `apiFetch`, assert on `fetchMock.mock.calls[0]`'s `init.headers.Cookie` (or whatever header/field
the chosen fix uses). Restore `globalThis.fetch` in `afterEach` exactly as the existing `describe('apiFetch', ...)` block does (line 89).

**SecureStore mocking pattern** (lines 7-18, needed because the fix reads from SecureStore):
```typescript
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
};
```
This mock already exists at module scope for the whole file. The new credential-attachment test needs
`getItemAsync` to resolve a non-null cookie value for at least one test case — extend the existing
`mockedSecureStore` typed-cast object to also expose `getItemAsync: jest.Mock`, and use
`mockedSecureStore.getItemAsync.mockResolvedValueOnce('fitness_cookie=abc123')` (house style: per-test
`mockResolvedValueOnce`/`mockRejectedValueOnce` overrides on top of the module-level default, as already
used at line 72 and line 95 for the storage mock in `theme.test.ts`, and structurally at
`session-refresh.test.ts:132` for `mockedSecureStore.deleteItemAsync.mockClear()`).

**`fakeResponse` helper** (lines 20-28) — reuse as-is; do not redefine a second response fixture.

**Where to add the new test:** Inside the existing `describe('apiFetch', ...)` block (lines 85-126),
as a sibling to the `CLIENT_VERSION_HEADER` test, and/or inside `describe('sign-out lifecycle', ...)`
(lines 128-210) mirroring the existing `'attaches the client version header...'` test at lines 200-209 —
that test is the closest direct structural twin for a new `'attaches a session credential...'` assertion
on the same `signOut()` call path.

Also consider a matching assertion for `app/_layout.tsx`'s background-refresh call site, per
VERIFICATION.md's explicit ask ("A unit test asserting the outgoing native request in these two call
sites carries a session credential") — that call site isn't unit-tested at all today (`_layout.tsx` has
no corresponding `__tests__` file in the reviewed list), so this may require either a new
`app/__tests__/_layout.test.ts` (no existing analog — see "No Analog Found" below) or accepting that
asserting `apiFetch` itself attaches the header is sufficient coverage transitively, since both call
sites share the exact same `apiFetch` function with no per-call-site override of credential logic.

---

### `apps/mobile/lib/__tests__/theme.test.ts` (test, transform) — WR-02

**Current implementation** (lines 84-92):
```typescript
it('writes \'system\' and hands Appearance.setColorScheme the resume-OS sentinel so the OS value resumes governing', async () => {
  await setAppearance('system');
  expect(mockedStorage.setItem).toHaveBeenCalledWith(APPEARANCE_STORAGE_KEY, 'system');
  // Which sentinel means "resume OS" depends on the React Native version reported by
  // Platform.constants: 'unspecified' from 0.82 on, null before it. Jest's mocked platform
  // constants report 0.0.0, so both are accepted here rather than pinning the value the test
  // environment happens to produce.
  expect(['unspecified', null]).toContain(setColorSchemeSpy.mock.calls[0]?.[0] ?? null);
});
```

**WR-02's fix, as specified in 01-REVIEW.md:** either (a) pin the assertion to `'unspecified'` only
(the correct sentinel for the pinned `react-native@0.86.2` in `apps/mobile/package.json`), accepting the
test then documents an assumption about the pinned version rather than accommodating the test runner's
mocked constants; or (b) mock `Platform.constants().reactNativeVersion` to report `0.86.x` so the test
genuinely exercises the real sentinel. Either fix is scoped to this one `it(...)` block; no other test in
the file needs to change. Read `apps/mobile/lib/theme.ts` (the `setAppearance` implementation, not yet
read in this pass — planner should re-check the exact call site around line 42-64 referenced by
`IN-03`/WR-02 before choosing option (b), to confirm what `Platform.constants` shape `setAppearance`
actually branches on) before committing to (a) vs (b).

---

### `apps/mobile/app/(auth)/sign-up.tsx` (component, request-response) — WR-03

**Current implementation** (lines 21-25):
```typescript
const DUPLICATE_EMAIL = 'An account with this email already exists. Sign in instead.';
const DUPLICATE_EMAIL_LINK_LABEL = 'Sign in instead';
const [DUPLICATE_EMAIL_LEAD, DUPLICATE_EMAIL_TAIL] = DUPLICATE_EMAIL.split(
  DUPLICATE_EMAIL_LINK_LABEL,
);
```

**WR-03's fix, as specified in 01-REVIEW.md** (cite verbatim as the house-endorsed shape):
```typescript
const DUPLICATE_EMAIL_LEAD = 'An account with this email already exists. ';
const DUPLICATE_EMAIL_LINK_LABEL = 'Sign in instead';
const DUPLICATE_EMAIL_TAIL = '.';
```
This replaces the derived-via-`.split()` pair with three independent constants — no runtime split, no
possible `undefined` tail. Convention: the other string constants in this file (`INVALID_EMAIL`,
`PASSWORD_TOO_SHORT`, `PASSWORDS_DO_NOT_MATCH`, `SERVER_UNREACHABLE`, `UNEXPECTED_FAILURE`, lines 12-16)
are already flat top-level `const` string literals with no derivation logic — the fix simply brings
`DUPLICATE_EMAIL_LEAD`/`TAIL` in line with that existing flat-constant convention rather than introducing
a new pattern. Check the JSX render site further down this file (not yet read in this pass — beyond line
45) to confirm both `DUPLICATE_EMAIL_LEAD` and `DUPLICATE_EMAIL_TAIL` are consumed the same way after the
refactor (e.g. `{DUPLICATE_EMAIL_LEAD}<Link>{DUPLICATE_EMAIL_LINK_LABEL}</Link>{DUPLICATE_EMAIL_TAIL}`)
so the visible sentence and its trailing period are unchanged.

---

## Shared Patterns

### Session-credential single source of truth
**Source:** `apps/mobile/lib/auth-storage.ts` (`AUTH_STORAGE_PREFIX`, `clearCachedSession`)
**Apply to:** `api-client.ts` (new reader), any test that needs to simulate a persisted cookie.
Do not let `AUTH_STORAGE_PREFIX` or the `_cookie`/`_session_data` key suffixes get redeclared as string
literals anywhere else — this file's own comment (lines 11-18) already explains why it exists as the
single owner of that contract.

### Platform.OS branching
**Source:** `docs/platform-modules.md:27-29` (project rule) + `IN-02` finding (two existing, undocumented
exceptions at `AuthScreenLayout.tsx:9` and `sign-out.ts:24`)
**Apply to:** Any new `Platform.OS` check the CR-01 fix introduces (e.g. inside `nativeSessionCookie()` /
`getCachedSessionCookie()`) should either be added to `docs/platform-modules.md`'s documented-exceptions
table alongside the `authClient` exception, or the planner should note it compounds IN-02 rather than
resolving it — worth a one-line doc update in the same plan, since this phase already has two open
instances of the same undocumented pattern.

### Jest fetch/SecureStore mocking house style
**Source:** `apps/mobile/lib/__tests__/session-refresh.test.ts:1-28, 85-101`
**Apply to:** Any new test asserting credential attachment in this file or a new `_layout.tsx` test file.
`globalThis.fetch` is swapped directly (no `jest.mock('node-fetch')` or MSW), restored in `afterEach`;
`expo-secure-store` is `jest.mock()`-ed at module scope with all five methods stubbed even when only
`deleteItemAsync`/`getItemAsync` are asserted on, to keep the mock shape complete for whichever function
under test touches it.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `apps/mobile/app/__tests__/_layout.test.ts` (potential new file) | test | request-response | No existing test file covers `app/_layout.tsx`'s background-revocation `useEffect` in isolation — `01-REVIEW.md`'s files-reviewed list and the repo's `__tests__` directories contain no `_layout` test. If the planner decides this call site needs direct coverage (rather than relying on `apiFetch`-level coverage being transitively sufficient), there is no in-repo analog for testing an Expo Router root-layout `useEffect`; would need to be built from React Testing Library conventions not yet established anywhere in this codebase. |

## Metadata

**Analog search scope:** `apps/mobile/lib/`, `apps/mobile/lib/__tests__/`, `apps/mobile/app/`, `apps/mobile/app/(auth)/` — the 8 files named in the verification/review gap list, plus their direct import graph (`auth-client.ts`, `session-guard.ts` referenced but not separately excerpted since unchanged).
**Files scanned:** 8 target files + 2 referenced-only (`auth-client.ts`, `theme.ts` mentioned but not fully read).
**`node_modules` availability:** Not present in this workspace at mapping time — `@better-auth/expo`'s actual exported symbol names and the real runtime shape of the stored `_cookie` value could not be independently verified against source; rely on in-repo comments (`auth-storage.ts:11-18`) and re-verify against the installed package during implementation.
**Pattern extraction date:** 2026-08-14
