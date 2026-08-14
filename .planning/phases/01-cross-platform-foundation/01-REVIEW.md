---
phase: 01-cross-platform-foundation
reviewed: 2026-08-14T00:00:00Z
depth: standard
files_reviewed: 73
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
  - apps/api/test/native-session.e2e-spec.ts
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
  - apps/mobile/lib/duplicate-email-copy.ts
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
  - docs/native-verification.md
  - docs/platform-modules.md
  - package.json
  - pnpm-workspace.yaml
  - scripts/jest-suite-integrity.cjs
  - turbo.json
findings:
  critical: 1
  warning: 1
  info: 4
  total: 6
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-08-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 73
**Status:** issues_found

## Summary

This is a re-review after the 01-09/01-10 gap-closure wave. The prior report's CR-01 (`apiFetch`
never attached the session credential, so native revocation detection was structurally inert),
WR-02 (the RN sentinel regression test was too permissive to catch a real regression), and WR-03
(the fragile `DUPLICATE_EMAIL` string-split) are all genuinely fixed, not just papered over.
`api-client.ts` now carries a `SessionCredentialProvider` seam, registered once at module scope in
`app/_layout.tsx`, and both the native background-revocation probe and `sign-out.ts`'s
server-revocation call route through it with real unit-test coverage (`session-refresh.test.ts`),
including a new `apps/api/test/native-session.e2e-spec.ts` that pins the exact server contract this
mechanism depends on. `theme.test.ts` now pins the RN version its sentinel assertion assumes, with a
self-guarding case that fails loudly if the pin drifts. `duplicate-email-copy.ts` replaced the
string-split with three independent constants and a verbatim-concatenation test.

One new defect surfaced in the area the phase context asked to be scrutinized hardest — the origin
guard that is supposed to keep the session credential from ever reaching a host outside this
project's own API. The guard exists and is real, but its implementation is a naive string-prefix
check (`url.startsWith(API_URL)`), which is a textbook origin-validation bypass: any URL that merely
begins with the same characters as `API_URL` — a different port on the same host, or, in a deployed
environment, an attacker-controlled domain that happens to share `API_URL` as a literal prefix (e.g.
`https://api.fitness.app.evil.com`) — passes the check and would receive the session cookie. No
existing test exercises this specific case; the one negative test in `session-refresh.test.ts` uses a
wholly different host, which a prefix bypass would still correctly reject, giving false confidence
that the guard is airtight.

The three still-open findings the prior report carried forward and did not ask to be re-litigated
(WR-01 schema inconsistency, IN-01 fake lint script, IN-02 undocumented `Platform.OS` exceptions,
IN-03 unused/misleading `colorScheme` field, IN-04 missing CORS on `/health`) are unchanged in this
snapshot and are restated below for completeness, demoted to Info/Warning as before — none of them
regressed and none is newly critical.

## Critical Issues

### CR-01: The session-credential origin guard is a naive `startsWith` prefix check, not an origin comparison — a classic bypass pattern

**File:** `apps/mobile/lib/api-client.ts:28-29`

**Issue:**

```ts
async function resolveSessionCredential(url: string): Promise<string | null> {
  if (!url.startsWith(API_URL)) return null;
  ...
}
```

This is the one gate standing between the session credential and "never attach it to a request bound
for anywhere but this project's own API" — the exact invariant this phase's own comments (`api-client.ts:20-23`)
describe as deliberately load-bearing. A prefix check is not an origin check: `String.prototype.startsWith`
has no concept of where a hostname or port boundary falls, so any URL that is textually longer than
`API_URL` but starts with the same characters passes.

Concretely, with the project's own default config (`API_URL = 'http://localhost:3000'`):

```ts
'http://localhost:30000/anything'.startsWith('http://localhost:3000') // → true
```

A request to an entirely different service on port `30000` is treated as "this project's own API"
and receives the session cookie. In a deployed environment the same class of bug is exploitable by an
attacker who controls a domain that is a literal string extension of the real API origin — e.g. if
`API_URL` is `https://api.fitness.app`, then `https://api.fitness.app.attacker.io/...` also satisfies
`startsWith(API_URL)`, and any future call site that ever builds a URL from anything less than a
fully-trusted constant (a redirect target, a link from a server response, a deep link) would leak the
credential to attacker infrastructure. `apiFetch` is explicitly documented as "the one request path
the app uses" and is designed to be reused by future phases (sync, uploads, etc.) — the guard needs to
hold under inputs this phase does not yet construct, not just the two hardcoded `AUTH_ENDPOINT`-based
call sites that exist today.

This is not caught by the existing regression test. `session-refresh.test.ts`'s
"attaches no cookie header for a request to a host that is not the API origin" case uses
`'https://not-this-project.example.com/v1/auth/get-session'` — a URL that also fails a *correct*
origin check, so it cannot distinguish a real origin comparison from this prefix-based one.

**Fix:** Compare parsed origins, not raw strings:

```ts
const API_ORIGIN = new URL(API_URL).origin;

async function resolveSessionCredential(url: string): Promise<string | null> {
  let requestOrigin: string;
  try {
    requestOrigin = new URL(url).origin;
  } catch {
    return null;
  }
  if (requestOrigin !== API_ORIGIN) return null;
  try {
    const credential = await sessionCredentialProvider();
    return credential || null;
  } catch {
    return null;
  }
}
```

Add a regression test that specifically exercises the prefix-collision case (e.g. `API_URL` =
`http://localhost:3000` against a target of `http://localhost:30000/...`, or a same-scheme
suffix-extension host) so a future change back to string comparison fails loudly.

## Warnings

### WR-01 (carried forward, unchanged): Inconsistent `.defaultNow()` usage on `updatedAt` across Better Auth tables

**File:** `apps/api/src/db/schema.ts:24-26, 53-55`
**Issue:** `session.updatedAt` and `account.updatedAt` still chain only `.$onUpdate(...).notNull()`
with no `.defaultNow()`, while `user.updatedAt` and `verification.updatedAt` chain `.defaultNow()`
first. This was not part of the 01-09/01-10 gap-closure scope and remains as originally reported: a
future raw insert into `session` or `account` that omits `updatedAt` will throw a NOT NULL violation
where the other two tables would silently default.
**Fix:** Add `.defaultNow()` to both columns for consistency:
```ts
updatedAt: timestamp('updated_at')
  .defaultNow()
  .$onUpdate(() => new Date())
  .notNull(),
```

## Info

### IN-01 (carried forward, unchanged): `lint` script is a duplicate of `typecheck`, not an actual linter

**File:** `apps/mobile/package.json:11`, `apps/api/package.json:10`
**Issue:** Both packages still define `"lint": "tsc --noEmit"`, identical to `"typecheck"`. No
ESLint/Biome/equivalent is wired in, so `pnpm lint` / `turbo run lint` (and the CI `check` job, which
runs it) reports a green "lint" step that lints nothing — unused imports, stray `console.log`,
unreachable code, and inconsistent patterns are not caught by any automated gate.
**Fix:** Wire in a real linter, or stop labeling the typecheck duplicate as `lint` so a green step
isn't read as a signal it doesn't provide.

### IN-02 (carried forward, unchanged): Two call sites branch on `Platform.OS` despite the project's own documented convention against it

**File:** `apps/mobile/components/AuthScreenLayout.tsx:9`, `apps/mobile/lib/sign-out.ts:24`
**Issue:** `docs/platform-modules.md:27-29` states the rule plainly and scopes its one documented
exception to `authClient`. Both cited lines still branch on `Platform.OS` directly
(`KeyboardAvoidingView` behavior, and `credentials: 'include'` on web for the sign-out fetch) without
being added to the doc's exception list or audit table. Neither is currently buggy, but both are
undocumented deviations from a convention written down specifically to prevent invisible platform
divergence.
**Fix:** Add both as documented exceptions in `docs/platform-modules.md`, or move them to
platform-specific files if the project wants the rule to hold without exception.

### IN-03 (carried forward, unchanged): `useAppearance()`'s `colorScheme` field is sourced from an API documented elsewhere as unreliable for this exact purpose

**File:** `apps/mobile/lib/theme.ts:42-64`
**Issue:** `useAppearance()` still returns `colorScheme` from React Native's own `useColorScheme()`
(OS `prefers-color-scheme` only), while `theme-colors.ts`'s own comment explains this hook "does not
see the in-app appearance override" on web — which is why `theme-colors.ts` uses NativeWind's
`useColorScheme()` instead. `useAppearance()`'s `colorScheme` field still has no current consumer, but
remains a trap for a future caller expecting it to reflect the applied appearance on web.
**Fix:** Drop the unused `colorScheme` field, or source it the same way `theme-colors.ts` does.

### IN-04 (carried forward, unchanged): `/health` has no CORS configuration on the Nest side

**File:** `apps/api/src/main.ts`, `apps/api/src/health/health.controller.ts`
**Issue:** `main.ts` still never calls `app.enableCors(...)` for Nest's own router. A browser-side
`fetch('/health')` from the web build's own origin would be blocked by the browser's CORS policy. Low
impact today since `/health` is presumably an infra healthcheck, not something the web client calls
from the browser.
**Fix:** If `/health` (or any future Nest-routed, non-Better-Auth endpoint) is ever meant to be
callable from browser JS, add `app.enableCors({ origin: WEB_ORIGINS, credentials: true })` in
`main.ts`.

---

_Reviewed: 2026-08-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
