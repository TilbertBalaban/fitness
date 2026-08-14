---
phase: 01-cross-platform-foundation
plan: 11
subsystem: auth
tags: [security, session, credential-attachment, url-origin, jest, react-native]

# Dependency graph
requires:
  - phase: 01-cross-platform-foundation
    provides: "apiFetch/resolveSessionCredential credential seam and session-refresh.test.ts suite (01-09)"
provides:
  - "isProjectOrigin(url, apiUrl) — a pure, exported, parsed-origin comparison predicate that replaces the string-prefix credential gate"
  - "Regression coverage discriminating a real origin comparison from a string-prefix one across four reproduced bypass classes"
affects: [phase-02-sync-and-upload-call-sites, security-review]

# Actuals (#2632)
actuals:
  tokens: 1248
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: ["Pure predicate taking the trust anchor as a parameter rather than closing over an import, so deployed-shape values unreachable in the test environment stay directly testable"]

key-files:
  created: []
  modified:
    - apps/mobile/lib/api-client.ts
    - apps/mobile/lib/__tests__/session-refresh.test.ts

key-decisions:
  - "isProjectOrigin takes apiUrl as a parameter instead of closing over the imported API_URL constant, so Task 2 can pin bypass classes (e.g. https://api.fitness.app) that the Jest process's own API_URL (http://localhost:3000) can never express"
  - "Both parsing failures and opaque (\"null\") origins fail closed to false rather than throwing or defaulting to true, matching the fail-closed contract already established for the credential provider's try/catch"

patterns-established:
  - "Adversarial negative test cases assert two things: that the URL genuinely begins with the trusted value (proving the case exercises the collision class), and the actual expected behavior — so a case can never silently degrade into one a broken implementation would also satisfy"

requirements-completed: [PLAT-06]

coverage:
  - id: D1
    description: "The credential gate compares parsed origins instead of string prefixes: a request to a URL that is a strict textual extension of API_URL on a different port carries no session credential"
    requirement: "PLAT-06"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/__tests__/session-refresh.test.ts#apiFetch > attaches no cookie header for a URL that is a strict textual extension of API_URL on a different port"
        status: pass
    human_judgment: false
  - id: D2
    description: "A URL the platform URL parser rejects fails closed: no credential attached, request still sent, outcome classified as ok rather than a transport event"
    requirement: "PLAT-06"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/__tests__/session-refresh.test.ts#apiFetch > attaches no cookie header for a URL the platform URL parser rejects"
        status: pass
    human_judgment: false
  - id: D3
    description: "All four reproduced deployed-shape bypass classes (subdomain suffix, separator-less suffix, userinfo authority confusion, port extension) are rejected against an API origin the Jest process's own API_URL cannot express, with two positive same-origin rows preventing an always-false predicate from passing"
    requirement: "PLAT-06"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/__tests__/session-refresh.test.ts#isProjectOrigin (table-driven, 13 rows)"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-08-14
status: complete
---

# Phase 01 Plan 11: Origin-Based Credential Gate Summary

**Replaced the `url.startsWith(API_URL)` session-credential gate in `apiFetch` with a parsed-origin comparison (`isProjectOrigin`), closing the prefix-collision bypass that let a URL merely resembling the API host collect the user's live session cookie.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-08-14T15:39:09Z
- **Completed:** 2026-08-14T15:41:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Closed T-01-29 (the gap `01-VERIFICATION.md` rejected in plan 01-09): `resolveSessionCredential` now delegates the origin decision to a pure, exported `isProjectOrigin(url, apiUrl)` predicate that compares `URL(...).origin` values instead of doing a string-prefix test
- Proved the fix red-then-green through the real `apiFetch` request path (Task 1, tracer), not merely asserted it
- Pinned all four reproduced bypass classes — port extension, subdomain suffix, separator-less suffix, userinfo authority confusion — plus scheme mismatch, malformed-URL, and opaque-origin cases in a table-driven `describe('isProjectOrigin')` block that reaches API origins (`https://api.fitness.app`) the Jest process's own `API_URL` cannot otherwise express (Task 2)
- Every adversarial negative case asserts both that the URL genuinely begins with the trusted value AND the expected boolean, closing the exact blind spot that let the original defect ship green (the pre-existing `not-this-project.example.com` case fails both a correct and a broken check, so it proved nothing)

## RED/GREEN Evidence (Task 1, tracer, tdd="true")

**RED — before the fix**, run against the pre-fix implementation (`url.startsWith(API_URL)`):

```
$ pnpm --filter mobile test -- session-refresh.test.ts
✕ attaches no cookie header for a URL that is a strict textual extension of API_URL on a different port (1 ms)
  ● apiFetch › attaches no cookie header for a URL that is a strict textual extension of API_URL on a different port
    expect(received).toBeUndefined()
    Received: "fitness_cookie=abc123"
Tests: 1 failed, 43 passed, 44 total
```

Committed as `ac1f5e5` (test-only commit) before any production code changed.

**GREEN — after implementing `isProjectOrigin`** and delegating the gate to it:

```
$ pnpm --filter mobile test -- session-refresh.test.ts
✓ attaches no cookie header for a URL that is a strict textual extension of API_URL on a different port
Tests: 44 passed, 44 total
```

Committed as `b6b199c`.

## Task Commits

Each task was committed atomically, with Task 1 split RED/GREEN per its `tdd="true"` marker:

1. **Task 1, RED — add failing prefix-collision case** - `ac1f5e5` (test)
2. **Task 1, GREEN — replace string-prefix check with `isProjectOrigin`** - `b6b199c` (fix)
3. **Task 2 — pin deployed-shape bypass classes** - `95c3337` (test)

## Files Created/Modified
- `apps/mobile/lib/api-client.ts` - Exports `isProjectOrigin(url, apiUrl): boolean`; `resolveSessionCredential` delegates the origin decision to it instead of a string-prefix test
- `apps/mobile/lib/__tests__/session-refresh.test.ts` - Adds the prefix-collision and malformed-URL cases to `describe('apiFetch')`, plus a new table-driven `describe('isProjectOrigin')` block (13 rows) covering all four bypass classes, two positive rows, and three fail-closed rows (empty string, unparseable, protocol-relative, opaque `file:` origin)

## Decisions Made
- `isProjectOrigin` takes `apiUrl` as a parameter rather than closing over the imported `API_URL` constant — this is what makes the deployed-shape bypass classes (which need an API origin like `https://api.fitness.app` that the Jest process's actual `API_URL` of `http://localhost:3000` cannot express) directly testable without `jest.doMock` or module resets
- Empty-string and literal-`"null"` origin values are explicitly rejected on either side of the comparison before the equality check runs, even though this cannot fire under the project's current http(s) `API_URL` — it exists so a future misconfiguration of `EXPO_PUBLIC_API_URL` to a non-special scheme fails closed (attach nothing) rather than open (two opaque origins comparing equal)

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance criteria were met without requiring any auto-fix under Rules 1-3, and no architectural question arose.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification Results

- `pnpm --filter mobile test` — 86/86 tests pass across all 3 suites (theme, auth-forms, session-refresh), suite-integrity reporter clean
- `pnpm --filter mobile exec tsc --noEmit` — exits 0
- `pnpm --filter mobile exec expo export --platform web` — exits 0, all 19 static routes exported
- `grep -v "^\s*//" apps/mobile/lib/api-client.ts | grep -c "url.startsWith"` — returns 0
- `grep -cE "it\.(skip|todo)|describe\.skip|xit\(" apps/mobile/lib/__tests__/session-refresh.test.ts` — returns 0
- Import constraints preserved: `apps/mobile/lib/api-client.ts` still imports neither `expo-secure-store` nor `auth-client` (the one textual match is the pre-existing comment describing that constraint, not an import statement)
- `apps/api` not modified — no API test run required or performed
- The five `human_verification` items in `01-VERIFICATION.md` (iOS/Android device runs, airplane-mode cold start, accessibility font scale) are carried forward untouched; this plan closes none of them and makes no claim about them
- `01-REVIEW.md` carried-forward Info/Warning items (WR-01, IN-01 through IN-04) are carried forward untouched, as scoped

## Next Phase Readiness

- The gap identified in `01-VERIFICATION.md` (`gaps_found`, 6/8, gap[0]) is closed: the credential attachment path now enforces the documented prohibition via a mechanically-verifiable parsed-origin comparison
- `isProjectOrigin`'s parameterized signature is ready for reuse: Phase 2's sync and upload call sites (named in `01-REVIEW.md` CR-01 as the future blast radius) can validate against origins built from less-trusted values without any change to the predicate itself
- No blockers. This plan's scope was deliberately narrow (one predicate, its call site, its tests) and that scope was held — no other file was touched

---
*Phase: 01-cross-platform-foundation*
*Completed: 2026-08-14*
