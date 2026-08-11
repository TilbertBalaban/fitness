---
phase: 01-cross-platform-foundation
reviewed: 2026-08-11T00:00:00Z
depth: standard
files_reviewed: 70
files_reviewed_list:
  - .env.example
  - .github/workflows/ci.yml
  - README.md
  - apps/api/package.json
  - apps/api/src/app.module.ts
  - apps/api/src/auth/auth.ts
  - apps/api/src/common/client-version.constants.ts
  - apps/api/src/common/min-client-version.guard.ts
  - apps/api/src/db/drizzle.module.ts
  - apps/api/src/db/schema.ts
  - apps/api/src/health/health.controller.ts
  - apps/api/src/health/health.module.ts
  - apps/api/src/mailer/capture-mailer.adapter.ts
  - apps/api/src/mailer/mailer.module.ts
  - apps/api/src/mailer/mailer.port.ts
  - apps/api/src/mailer/smtp-mailer.adapter.ts
  - apps/api/src/main.ts
  - apps/api/test/auth.e2e-spec.ts
  - apps/api/test/jest-e2e.json
  - apps/api/test/password-reset.e2e-spec.ts
  - apps/api/test/schema-parity.e2e-spec.ts
  - apps/api/test/version-guard.e2e-spec.ts
  - apps/mobile/app/(auth)/_layout.tsx
  - apps/mobile/app/(auth)/forgot-password.tsx
  - apps/mobile/app/(auth)/sign-in.tsx
  - apps/mobile/app/(auth)/sign-up.tsx
  - apps/mobile/app/(tabs)/_layout.tsx
  - apps/mobile/app/(tabs)/_layout.web.tsx
  - apps/mobile/app/(tabs)/history.tsx
  - apps/mobile/app/(tabs)/index.tsx
  - apps/mobile/app/(tabs)/profile.tsx
  - apps/mobile/app/(tabs)/programs.tsx
  - apps/mobile/app/(tabs)/workout.tsx
  - apps/mobile/app/_layout.tsx
  - apps/mobile/app/reset-password.tsx
  - apps/mobile/app/reset-password.web.tsx
  - apps/mobile/babel.config.js
  - apps/mobile/components/AppearanceControl.tsx
  - apps/mobile/components/AuthScreenLayout.tsx
  - apps/mobile/components/ErrorBanner.tsx
  - apps/mobile/components/PlaceholderScreen.tsx
  - apps/mobile/components/PrimaryButton.tsx
  - apps/mobile/components/SignOutDialog.tsx
  - apps/mobile/components/TextField.tsx
  - apps/mobile/components/WebSessionSkeleton.tsx
  - apps/mobile/global.css
  - apps/mobile/jest.config.js
  - apps/mobile/lib/__tests__/auth-forms.test.ts
  - apps/mobile/lib/__tests__/session-refresh.test.ts
  - apps/mobile/lib/__tests__/theme.test.ts
  - apps/mobile/lib/api-client.ts
  - apps/mobile/lib/auth-client.ts
  - apps/mobile/lib/auth-storage.ts
  - apps/mobile/lib/client-version.ts
  - apps/mobile/lib/session-guard.ts
  - apps/mobile/lib/sign-out.ts
  - apps/mobile/lib/theme-colors.ts
  - apps/mobile/lib/theme.ts
  - apps/mobile/lib/validation.ts
  - apps/mobile/lib/web-app-origin.ts
  - apps/mobile/metro.config.js
  - apps/mobile/nativewind-env.d.ts
  - apps/mobile/package.json
  - apps/mobile/tailwind.config.js
  - apps/mobile/tsconfig.json
  - docs/platform-modules.md
  - package.json
  - pnpm-workspace.yaml
  - scripts/jest-suite-integrity.cjs
  - turbo.json
findings:
  critical: 1
  warning: 3
  info: 4
  total: 8
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-08-11T00:00:00Z
**Depth:** standard
**Files Reviewed:** 70
**Status:** issues_found

## Summary

The bulk of this phase — auth wiring, the mailer port, the version-guard split, the enumeration-safe
password-reset flow, and the e2e/unit test suites that exercise them — is careful, well-reasoned, and
matches its own documented architecture. No hardcoded secrets, no injection vectors, no project-authored
crypto, and the enumeration-safety and version-guard behaviors are genuinely tested, not just asserted
by comment.

One real defect surfaced in the area the phase context specifically asked to be scrutinized hardest —
the offline-session state machine. `apiFetch`, the one shared request function `app/_layout.tsx`'s
native background-revocation check and `sign-out.ts`'s server-revocation call both route through, never
attaches the session credential persisted in SecureStore. The consequence is that the client-side half
of the "detect a revoked session and clear it" mitigation (T-01-06) cannot function on native as
written — independent of, and in addition to, the already-known native sign-out gap. Three warnings and
four info-level items round out the report: a schema inconsistency, an over-permissive regression test,
a fragile string-split with no failure guard, and some minor doc/convention drift.

## Critical Issues

### CR-01: `apiFetch` never attaches the persisted session credential, so native session-revocation detection cannot work

**File:** `apps/mobile/lib/api-client.ts:18-37`
**Also affects:** `apps/mobile/app/_layout.tsx:40-49`, `apps/mobile/lib/sign-out.ts:17-26`

**Issue:**

`apiFetch` is the one shared request path this app uses outside of `authClient` itself. It attaches
`CLIENT_VERSION_HEADER` and runs the result through `classifyAuthOutcome`, but it never reads or
attaches the Better Auth session cookie that `@better-auth/expo`'s `expoClient` plugin persists in
SecureStore under `${AUTH_STORAGE_PREFIX}_cookie` (see `auth-storage.ts`). That manual
credential-attachment step is exactly what `expoClient` exists to do *inside* `authClient` — it is not
something a bare `fetch()` call gets for free on native, which is precisely why the project bothers to
store the cookie in SecureStore under an explicit, addressable key at all.

Two call sites depend on this function authenticating the request:

1. `app/_layout.tsx:40-49` — the native-only background refresh that calls
   `apiFetch(`${AUTH_ENDPOINT}/get-session`)` specifically to let the server tell the client "this
   session was revoked" (`isRevocation(outcome)`), per the inline comment: *"An `offline` or `rejected`
   outcome is a silent no-op; only `revoked` clears anything."* Because no credential is attached, the
   server receives an *unauthenticated* `get-session` request — which Better Auth answers `200` with a
   null session — so `classifyAuthOutcome` returns `'ok'`, never `'revoked'`, no matter what actually
   happened to the real session server-side. The mechanism this comment describes cannot fire.
2. `sign-out.ts:17-26` (`revokeServerSession`) — the same missing-credential gap is the root cause of
   the already-known "native sign-out does not revoke the server session row" issue. That confirms this
   is not a hypothetical: the identical code path has already demonstrably failed to authenticate a
   request on native.

`session-guard.ts:1-8` notes the server-side emitter for `SESSION_REVOKED_REASON` does not exist yet in
Phase 1, so this specific mechanism has zero live blast radius *today*. But the code is not inert
scaffolding waiting on an emitter — it is a request path that is provably incapable of identifying the
caller's session on native, shipped with a comment asserting a behavioral guarantee it cannot deliver.
Nothing in the test suite would catch this: `session-refresh.test.ts` mocks `globalThis.fetch` directly
and asserts on the `X-Client-Version` header, but never asserts a session credential is present on the
outgoing request. The moment a later phase adds the server-side emitter, this mitigation will still
silently do nothing on native, and CI will stay green throughout.

**Fix:** Route `apiFetch` (or at minimum the two call sites above) through the same credential the
`expoClient` plugin manages — either expose the stored cookie from `auth-storage.ts` and attach it as a
`Cookie` header on native requests, or replace these ad hoc `fetch()` calls with `authClient`'s own
`$fetch` so the plugin's existing credential-attachment logic is reused instead of re-implemented. Add a
unit test that asserts the outgoing request in the native background-refresh path actually carries a
session credential, so a regression here fails loudly instead of silently.

```ts
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

## Warnings

### WR-01: Inconsistent `.defaultNow()` usage on `updatedAt` across Better Auth tables

**File:** `apps/api/src/db/schema.ts:11-14, 24-26, 53-55, 68-71`
**Issue:** `user.updatedAt` (11-14) and `verification.updatedAt` (68-71) both chain `.defaultNow()`
before `.$onUpdate(...)`. `session.updatedAt` (24-26) and `account.updatedAt` (53-55) do not — they
chain only `.$onUpdate(...).notNull()`, with no `.defaultNow()`. All four columns are `.notNull()`.
Since `drizzleAdapter` almost certainly supplies `updatedAt` on every insert it performs, this doesn't
crash today — but it means `session` and `account` have no DB-level fallback, while `user` and
`verification` do. Any future direct insert into `session` or `account` that doesn't explicitly set
`updatedAt` (a raw Drizzle insert, a migration script, a seed script) will throw a NOT NULL constraint
violation where the other two tables would silently default; that asymmetry is un-obvious from reading
any single table in isolation.
**Fix:** Add `.defaultNow()` to `session.updatedAt` and `account.updatedAt` so all four tables follow
the same contract:
```ts
updatedAt: timestamp('updated_at')
  .defaultNow()
  .$onUpdate(() => new Date())
  .notNull(),
```

### WR-02: Regression test for the RN sentinel value is too permissive to catch a real regression

**File:** `apps/mobile/lib/__tests__/theme.test.ts:84-92`
**Issue:** The test asserts `expect(['unspecified', null]).toContain(setColorSchemeSpy.mock.calls[0]?.[0] ?? null)`.
The comment explains this dual-acceptance is because the test environment's mocked platform constants
report RN version `0.0.0`. But `apps/mobile/package.json` pins `react-native@0.86.2`, where the correct
sentinel for "resume the OS value" is `'unspecified'` — `null` is the pre-0.82 legacy value and would be
*wrong* for the version actually shipping. As written, a regression that emitted the legacy `null`
sentinel on the real 0.86 runtime would still pass this test, because the assertion cannot distinguish
"correct for this project's pinned RN version" from "correct for some other RN version."
**Fix:** Either pin the test's expected value to `'unspecified'` only (accepting that the test then
documents an assumption about the pinned RN version rather than accommodating the test runner's mocked
constants), or mock `Platform.constants().reactNativeVersion` to report `0.86.x` so the test genuinely
exercises the sentinel the shipped runtime will use.

### WR-03: `DUPLICATE_EMAIL` string-split has no guard against a copy edit that breaks it

**File:** `apps/mobile/app/(auth)/sign-up.tsx:21-25`
**Issue:**
```ts
const DUPLICATE_EMAIL = 'An account with this email already exists. Sign in instead.';
const DUPLICATE_EMAIL_LINK_LABEL = 'Sign in instead';
const [DUPLICATE_EMAIL_LEAD, DUPLICATE_EMAIL_TAIL] = DUPLICATE_EMAIL.split(
  DUPLICATE_EMAIL_LINK_LABEL,
);
```
This works today because `DUPLICATE_EMAIL_LINK_LABEL` happens to be an exact substring of
`DUPLICATE_EMAIL`. If either constant is edited later (a common "just fix the copy" change) without
keeping that exact substring relationship, `.split(...)` returns a one-element array,
`DUPLICATE_EMAIL_TAIL` becomes `undefined`, and the rendered error text silently loses its trailing
punctuation/content — React renders `undefined` as nothing, so there is no crash and no visible error,
just quietly wrong copy in production. No test asserts the split actually produced two segments.
**Fix:** Assert the split succeeded at module load (fail fast in dev) or restructure as two independent
constants (lead text, link label, tail text) instead of deriving two of them from a single sentence via
string splitting:
```ts
const DUPLICATE_EMAIL_LEAD = 'An account with this email already exists. ';
const DUPLICATE_EMAIL_LINK_LABEL = 'Sign in instead';
const DUPLICATE_EMAIL_TAIL = '.';
```

## Info

### IN-01: `lint` script is a duplicate of `typecheck`, not an actual linter

**File:** `apps/mobile/package.json:11`, `apps/api/package.json:10`
**Issue:** Both packages define `"lint": "tsc --noEmit"`, identical to their own `"typecheck"` script.
No ESLint/Biome/equivalent is wired in, so `pnpm lint` (and `turbo run lint` in CI) cannot catch the
things a linter is normally there for — unused imports/variables, stray `console.log`, unreachable code,
inconsistent patterns — despite CI reporting a green "lint" step.
**Fix:** Either wire in a real linter, or rename the script (e.g. to `typecheck:duplicate` is obviously
wrong — better to just not ship a `lint` script that lints nothing) so a green CI "lint" step isn't
read as a signal it doesn't provide.

### IN-02: Two call sites branch on `Platform.OS` despite the project's own documented convention against it

**File:** `apps/mobile/components/AuthScreenLayout.tsx:9`, `apps/mobile/lib/sign-out.ts:24`
**Issue:** `docs/platform-modules.md:27-29` states the project rule plainly: *"Do not branch on
`Platform.OS` at the call site... [that exception] is scoped to `authClient`."* Both cited lines do
exactly that (`Platform.OS === 'ios' ? 'padding' : undefined` for `KeyboardAvoidingView` behavior, and
`Platform.OS === 'web' ? 'include' : undefined` for fetch credentials). Neither is currently buggy —
these are narrow, low-risk, idiomatic uses — but they are undocumented exceptions to a convention the
project explicitly wrote down specifically to prevent invisible platform divergence, and the doc's audit
table doesn't mention either of them.
**Fix:** Either add both as documented exceptions in `docs/platform-modules.md` (same treatment given to
the `authClient` exception), or move them to platform-specific files if the project wants the rule to
hold without exception.

### IN-03: `useAppearance()`'s `colorScheme` field is sourced from an API documented elsewhere as unreliable for this exact purpose

**File:** `apps/mobile/lib/theme.ts:42-64`
**Issue:** `useAppearance()` returns `colorScheme` from React Native's own `useColorScheme()` (OS
`prefers-color-scheme` only). `theme-colors.ts:1-5`'s own comment explains, correctly, that on web this
hook "reports only the OS prefers-color-scheme media query, so it does not see the in-app appearance
override" — which is exactly why `theme-colors.ts` uses `nativewind`'s `useColorScheme()` instead.
`useAppearance()`'s `colorScheme` field has no current consumer, but it is a trap for whoever reaches for
it next expecting it to reflect the user's actual applied appearance (including their in-app override)
on web — it won't.
**Fix:** Either drop the unused `colorScheme` field from `useAppearance()`'s return value, or source it
from `nativewind`'s `useColorScheme()` the same way `theme-colors.ts` does, so the two theme-reading APIs
in this codebase don't disagree about what "the current color scheme" means on web.

### IN-04: `/health` has no CORS configuration on the Nest side

**File:** `apps/api/src/main.ts`, `apps/api/src/health/health.controller.ts`
**Issue:** Better Auth's routes get CORS handling driven by `trustedOrigins`/`WEB_ORIGINS` internally,
but that's specific to Better Auth's own middleware. `main.ts` never calls `app.enableCors(...)` for
Nest's own router, so a browser-side `fetch('/health')` from the web build's own origin would be blocked
by the browser's CORS policy (no `Access-Control-Allow-Origin` header on the response). Low impact today
since `/health` is presumably a server-to-server or infra healthcheck, not something the web client
calls from the browser — but if that assumption changes, this will fail silently from the browser's
perspective (a network-level block, not a clear error from the API).
**Fix:** If `/health` (or any future Nest-routed, non-Better-Auth endpoint) is ever meant to be callable
from browser JS, add `app.enableCors({ origin: WEB_ORIGINS, credentials: true })` (or equivalent) in
`main.ts`, reusing the same origin list `auth.ts` already computes.

---

_Reviewed: 2026-08-11T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
