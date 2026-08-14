---
phase: 01-cross-platform-foundation
plan: 09
subsystem: auth
tags: [better-auth, expo, session-management, native, e2e]

# Dependency graph
requires:
  - phase: 01-cross-platform-foundation
    provides: apiFetch shared request path, sign-out lifecycle, classifyAuthOutcome transport-vs-rejection split (plans 01-05/01-06)
provides:
  - "A credential seam (setSessionCredentialProvider/SessionCredentialProvider) in apiFetch, origin-guarded against API_URL, registered once at app/_layout.tsx module scope"
  - "getSessionCookieHeader() in auth-client.ts, delegating to the expoClient plugin's own getCookie() action"
  - "classifySessionProbe(result, presentedCredential) in session-guard.ts: upgrades a completed 2xx get-session response with no user to `revoked`, only when a credential was presented"
  - "apps/api/test/native-session.e2e-spec.ts: proves over real HTTP that an explicit sign-out authenticated only by an attached Cookie header deletes the Postgres session row"
affects: [phase-2-sync, phase-4-analytics-auth-boundaries]

# Actuals (#2632)
actuals:
  tokens: 5422
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Credential seam via module-scope provider function (setSessionCredentialProvider), not a direct SecureStore import in api-client.ts — keeps the ESM-only better-auth chain out of Jest"
    - "Session-probe classification (classifySessionProbe) wraps the general classifier (classifyAuthOutcome) rather than forking it, scoping the 'no session' inference to the one endpoint whose purpose is asking about the session"

key-files:
  created:
    - apps/api/test/native-session.e2e-spec.ts
  modified:
    - apps/mobile/lib/api-client.ts
    - apps/mobile/lib/auth-client.ts
    - apps/mobile/lib/session-guard.ts
    - apps/mobile/app/_layout.tsx
    - apps/mobile/lib/__tests__/session-refresh.test.ts

key-decisions:
  - "getSessionCookieHeader() delegates to the expoClient plugin's own getCookie() action rather than re-reading/re-parsing SecureStore directly — the stored _cookie value is a JSON map of cookie entries with a chunking adapter behind it, not a ready-to-send header string, confirmed by reading the installed @better-auth/expo@1.6.26 dist/client.js"
  - "The credential seam lives in api-client.ts as a registered provider function, never importing auth-client.ts or the native secure-storage package directly, preserving the ESM-isolation property plan 01-05 established for Jest"
  - "classifySessionProbe requires the caller to state whether a credential was presented, as a structural (not incidental) guard against treating a local secure-storage read failure as a server revocation (D-01)"
  - "No production code change was needed for Task 3's idempotency/concurrency guarantees — SecureStore.deleteItemAsync is already idempotent on a missing key and neither sign-out nor the revocation clear ever writes a credential back to storage; both properties are pinned by new tests rather than new code"

patterns-established:
  - "A registered-provider credential seam (register once at root layout module scope, resolve inside apiFetch, origin-guard against API_URL) is now the house pattern for any future cross-cutting request concern that must avoid pulling a heavy client module into the shared request path's test suite"

requirements-completed: [PLAT-06, PLAT-01]

coverage:
  - id: D1
    description: "Native explicit sign-out, authenticated only by an attached Cookie header, deletes the Postgres session row"
    requirement: "PLAT-06"
    verification:
      - kind: e2e
        ref: "apps/api/test/native-session.e2e-spec.ts#Native session lifecycle (e2e) > deletes the Postgres session row on an explicit sign-out authenticated only by an attached cookie header, with no cookie jar"
        status: pass
    human_judgment: false
  - id: D2
    description: "The shared request path (apiFetch) attaches a registered session credential under the lowercase cookie header, only for requests under the project's own API origin, and never for a throwing provider"
    requirement: "PLAT-01"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/__tests__/session-refresh.test.ts#apiFetch (credential-attachment cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A real server-side revocation is observable by the background probe: classifySessionProbe upgrades an authoritative no-session 200 to `revoked` only when a credential was presented, never on a transport failure or an absent credential"
    requirement: "PLAT-06"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/__tests__/session-refresh.test.ts#classifySessionProbe"
        status: pass
      - kind: e2e
        ref: "apps/api/test/native-session.e2e-spec.ts (server-contract assertion: 200, no user, no revocation reason after sign-out)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Sign-out is idempotent and race-safe against the background probe: a second consecutive signOut() resolves cleanly with no credential sent, and neither signOut() nor a revoked-probe clear ever re-persists a credential regardless of interleaving"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/__tests__/session-refresh.test.ts#sign-out lifecycle (idempotency and concurrency cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "On a real iOS or Android build, the attached cookie header is accepted by the running server and the session row is deleted, matching the e2e-over-HTTP proof"
    verification: []
    human_judgment: true
    rationale: "No iOS/Android simulator or device is reachable from this execution worktree (WINDOWS.md #15). This backstop truth is proven over real HTTP by native-session.e2e-spec.ts using the exact request shape native now sends, but device-level confirmation requires human UAT."

duration: 45min
completed: 2026-08-14
status: complete
---

# Phase 1 Plan 9: Native Session Revocation Gap Closure Summary

**Native sign-out now attaches the Better Auth Expo plugin's cookie to every request, closing the gap where an explicit sign-out and the background revocation probe both silently no-op on native — proven by a real HTTP round trip against Postgres, not just a mocked assertion.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-08-14T14:37:00Z
- **Completed:** 2026-08-14T14:51:46Z
- **Tasks:** 3
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments

- Native `apiFetch` requests now carry the session credential under the lowercase `cookie` header, sourced from the Better Auth Expo plugin's own `getCookie()` action (never a hand-rolled SecureStore read), origin-guarded against the project's own API so no other host can receive it
- `apps/api/test/native-session.e2e-spec.ts` proves over real HTTP, against real Postgres, that this exact request shape actually deletes the session row on sign-out and that a subsequent get-session with the same cookie no longer returns a user — closing WINDOWS.md ledger item #1
- `classifySessionProbe` makes a real server-side revocation observable on native: it upgrades a completed 200-with-no-user get-session response to `revoked`, but only when a credential was actually presented, so a local secure-storage hiccup can never be mistaken for a revocation (D-01)
- Sign-out's idempotency and its safety when racing the background probe are pinned by new tests; no production code change was needed because `SecureStore.deleteItemAsync` is already idempotent and neither path ever writes a credential back to storage

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end — a native explicit sign-out deletes the Postgres session row** - `6d8def6` (feat)
2. **Task 2: A real revocation becomes observable on native** - `51dcda0` (feat)
3. **Task 3: Sign-out survives being run twice, and run mid-probe** - `67845e6` (test)

**Plan metadata:** committed alongside this summary in the worktree-mode final commit.

_Note: tasks were `tdd="true"` but the plan structured each as a single `<action>` block combining behavior-driven test writing with implementation, not separate RED/GREEN sub-blocks — each task was committed atomically once its own `<verify>` passed, consistent with the task_commit_protocol default._

## Files Created/Modified

- `apps/mobile/lib/api-client.ts` - Credential seam: `SessionCredentialProvider` type, `setSessionCredentialProvider`, origin-guarded resolution inside `apiFetch`
- `apps/mobile/lib/auth-client.ts` - `getSessionCookieHeader()`, delegating to the expoClient plugin's `getCookie()` action
- `apps/mobile/lib/session-guard.ts` - `classifySessionProbe(result, presentedCredential)`, wrapping `classifyAuthOutcome`
- `apps/mobile/app/_layout.tsx` - Registers the credential provider at module scope; background probe now routes through `classifySessionProbe`
- `apps/mobile/lib/__tests__/session-refresh.test.ts` - 18 new cases: credential attachment/origin-guard/throw-safety, `classifySessionProbe` classification, sign-out idempotency and concurrency
- `apps/api/test/native-session.e2e-spec.ts` - New e2e spec: real HTTP sign-out deletes the Postgres session row; server-contract assertion for the get-session-after-sign-out shape

## Decisions Made

- Delegated to the Better Auth Expo plugin's own `getCookie()` action instead of hand-reading SecureStore — the installed `@better-auth/expo@1.6.26` package (confirmed by reading `dist/client.js`) stores a JSON map of cookie entries behind a chunking adapter, not a header-ready string; re-implementing that reassembly would have drifted from the plugin's own logic
- Kept the credential seam a registered provider function in `api-client.ts` rather than importing `auth-client.ts` directly, preserving the ESM-isolation property that lets `session-refresh.test.ts` run under Jest without pulling in the ESM-only better-auth chain (the exact failure plan 01-05 hit and documented)
- Did not modify `classifyAuthOutcome` — the "server says nobody is signed in" inference is scoped to the one endpoint (`classifySessionProbe`, used only for the get-session probe) whose entire purpose is asking about session validity, so no other 200 response anywhere in the app can be misread as a revocation

## Deviations from Plan

None - plan executed exactly as written, including Step 0's re-verification of the installed `@better-auth/expo` API surface (all four facts confirmed against `node_modules/.pnpm/@better-auth+expo@1.6.26.../dist/client.d.ts` and `client.js`).

One environment note, not a plan deviation: this worktree had no `node_modules` and no `.env` at start. Ran `pnpm install --frozen-lockfile` (resolved from the existing pnpm store) and populated `apps/api/.env` with the same dev-only values already used by the main checkout's `.env` (not committed — gitignored) so the e2e suite could run against the locally running Postgres (confirmed schema already applied).

## Issues Encountered

None blocking. `it.each` with a `[value, label]` tuple array produced a TypeScript inference error in the mobile test file (destructured parameter type collapsed to a union of tuples); resolved by writing the two cases (`empty string`, `null`) as separate `it()` blocks instead, matching this file's otherwise-flat `it()` style for non-numeric-status cases.

## User Setup Required

None - no external service configuration required. The `.env` values used in this worktree are local dev-only placeholders identical to the main checkout's.

## Next Phase Readiness

- Both failed truths from `01-VERIFICATION.md` (native sign-out revocation, revocation observability) now hold, proven over real HTTP against real Postgres, not just unit-mocked
- WINDOWS.md ledger item #1 marked `fixed`; a new `unrun-verify` item (#15) was recorded for the on-device backstop truth, since no iOS/Android simulator or device was reachable in this execution worktree
- The credential-seam pattern (registered provider, origin-guarded, resolved inside the shared request path) is available for Phase 2's sync layer if it needs the same session credential on its own request path
- No blockers for Phase 2

## Self-Check: PASSED

All files created/modified and all commit hashes referenced above were verified present on disk and in `git log`.

---
*Phase: 01-cross-platform-foundation*
*Completed: 2026-08-14*
