---
phase: quick-260902-i0n
plan: 260902-i0n
subsystem: auth
tags: [better-auth, cookies, cors, samesite, nestjs]

requires: []
provides:
  - "resolveDefaultCookieAttributes(apiBaseUrl?) — dependency-free gate that returns SameSite=None/Secure/Partitioned cookie attributes for an https API_BASE_URL, undefined otherwise"
  - "auth.ts advanced.defaultCookieAttributes wired to the gate, so the deployed cross-site web app now receives the session cookie on get-session"
affects: [auth, deployment]

actuals:
  tokens: 426
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Dependency-free env-gate module beside auth.ts (following src/common/web-origins.ts) so it stays importable without pulling in the pg pool auth.ts opens at import time"

key-files:
  created:
    - apps/api/src/auth/cookie-attributes.ts
    - apps/api/src/auth/__tests__/cookie-attributes.spec.ts
  modified:
    - apps/api/src/auth/auth.ts

key-decisions:
  - "Gate is API_BASE_URL.startsWith('https://'), matching the exact condition better-auth's own createCookieGetter uses to decide the Secure prefix — Secure and SameSite=None can never disagree about environment"
  - "Two createCookieGetter integration cases (spec calling the real better-auth/cookies pipeline) were dropped per the plan's documented fallback: better-auth/cookies is an ESM-only .mjs subpath and ts-jest's CommonJS transform cannot parse the import statement in this project's jest.config.js. The four pure-function cases (https, two http variants, unset) fully cover resolveDefaultCookieAttributes's branches and are what ships."

patterns-established: []

requirements-completed: []

coverage:
  - id: D1
    description: "resolveDefaultCookieAttributes returns SameSite=None/Secure/Partitioned for an https API_BASE_URL and undefined for http or unset, gating the cross-site session cookie fix"
    verification:
      - kind: unit
        ref: "apps/api/src/auth/__tests__/cookie-attributes.spec.ts#resolveDefaultCookieAttributes"
        status: pass
    human_judgment: false
  - id: D2
    description: "Deployed API redeploy must be manually confirmed to set the SameSite=None; Partitioned; Secure header via the curl check in the plan's Post-deploy check section"
    verification: []
    human_judgment: true
    rationale: "Requires a live production deploy on Render, which this task does not perform or have access to trigger — the plan explicitly scopes this out as a manual post-deploy step"

duration: 12min
completed: 2026-09-02
status: complete
---

# Quick 260902-i0n: Issue the session cookie cross-site when the API is served over https

**`advanced.defaultCookieAttributes` in `auth.ts` now gates SameSite=None/Secure/Partitioned on an https `API_BASE_URL`, so the deployed cross-site web app's post-sign-in `get-session` call finally carries the session cookie.**

## Performance

- **Duration:** 12 min
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- New `apps/api/src/auth/cookie-attributes.ts` exports `resolveDefaultCookieAttributes`, a dependency-free, unit-testable gate that returns a frozen `{ sameSite: 'none', secure: true, partitioned: true }` for an https `API_BASE_URL` and `undefined` for anything else (http, unset).
- `auth.ts` passes the gate's result through a new `advanced.defaultCookieAttributes` block, changing nothing else in the file.
- The http/unset branches are byte-identical to today's behavior — local dev and CI's `http://127.0.0.1:3000` literal are unaffected.

## Task Commits

Both tasks landed in a single fix commit (per the plan, task 2 is verification-and-commit only):

1. **Task 1 + Task 2: Gate the cross-site cookie attributes; run unit suite and commit** - `66db8fa` (fix)

## Files Created/Modified

- `apps/api/src/auth/cookie-attributes.ts` - new gate module, exports `resolveDefaultCookieAttributes`
- `apps/api/src/auth/auth.ts` - added `advanced: { defaultCookieAttributes: resolveDefaultCookieAttributes() }` between `trustedOrigins` and `session`
- `apps/api/src/auth/__tests__/cookie-attributes.spec.ts` - unit spec covering the four pure-function branches

## Decisions Made

- Confirmed via `node -e` against the installed `better-auth@1.6.26` that `createCookieGetter({ baseURL: 'https://...', advanced: { defaultCookieAttributes: { sameSite: 'none', secure: true, partitioned: true } } })` produces `__Secure-better-auth.session_token` with `secure: true, sameSite: 'none', partitioned: true, httpOnly: true` — matching the plan's documented runtime output.
- Confirmed via `pnpm exec jest` that requiring `better-auth/cookies` directly in a spec fails under this project's `ts-jest`/CommonJS config with `SyntaxError: Cannot use import statement outside a module` (the `.mjs`-only subpath the plan flagged as the risk). Per the plan's explicit fallback instruction, the two `createCookieGetter` integration cases were removed rather than adding a transform or moduleNameMapper; the four pure-function cases shipped instead.

## Deviations from Plan

None - plan executed exactly as written, including its documented ESM-loader fallback path (which the plan anticipated as a likely outcome, not an unplanned deviation).

## Issues Encountered

None beyond the anticipated ESM-loader case described above, which the plan pre-authorized a specific fallback for.

## User Setup Required

None - no external service configuration required by this commit. The plan's "Deployment preconditions" and "Post-deploy check" sections describe manual verification on Render (`API_BASE_URL` and `WEB_ORIGINS` env vars, and a post-deploy `curl` check of the `Set-Cookie` header) that this task does not perform — they are pre-existing production config, not new setup this commit introduces.

## Next Phase Readiness

- Code is ready to ship; `pnpm --filter api typecheck` exits 0 and the full API unit suite (11 suites, 193 tests) is green with no skips.
- Outstanding: after the API redeploys on Render, someone must run the plan's `curl` post-deploy check to confirm the header actually carries `SameSite=None; Partitioned; Secure; HttpOnly` in production — tracked as coverage item D2 above (human judgment, no automated verification possible from this environment).

---
*Quick task: 260902-i0n*
*Completed: 2026-09-02*

## Self-Check: PASSED

All created/modified files present on disk; commit `66db8fa` found in git log.
