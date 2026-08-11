---
phase: 1
slug: cross-platform-foundation
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-11
validated: 2026-08-11
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest — `jest-expo` 57 on jest 29 for the client, jest 30 + ts-jest for the API |
| **Config file** | `apps/mobile/jest.config.js` (client), `apps/api/test/jest-e2e.json` (API end-to-end) |
| **Quick run command** | `turbo run test --filter=<changed-package>` |
| **Full suite command** | `turbo run test` (client) **and** `pnpm --filter api test:e2e` (API) |
| **Measured runtime** | client 2.2s · API end-to-end 23.8s including `nest build` · both together ~26s |
| **Suite integrity guard** | `scripts/jest-suite-integrity.cjs`, loaded by both configs — fails a run that contained no tests, skipped or `todo`'d a test, or in which a suite file ran nothing |

Every API test is end-to-end, so `apps/api` deliberately has no `test` script: `turbo run test` covers
the client and `pnpm --filter api test:e2e` covers the server. A `test` lane whose only output was
`No tests found, exiting with code 0` reported a pass while asserting nothing, and was removed in
plan 01-08.

The API end-to-end suite builds the API and drives `dist/main.js` over real HTTP on an ephemeral
port; it is not an in-process Nest testing module, because the API and Better Auth are ESM-only and
Jest's CommonJS runtime cannot load them in process. It therefore requires a live Postgres with the
Drizzle schema applied (`pnpm --filter api db:push`).

---

## Sampling Rate

- **After every task commit:** Run `turbo run test --filter=<changed-package>`
- **After every plan wave:** Run `turbo run test` and `pnpm --filter api test:e2e`
- **Before `/gsd-verify-work`:** Full suite green **plus** the three-platform manual UAT pass for PLAT-01 / PLAT-09
- **Max feedback latency:** 60 seconds — met; the measured worst case is the API end-to-end suite at 23.8s

---

## Per-Task Verification Map

> Filled in by plan 01-08 against the seven executed plans. Every command below was run on
> 2026-08-11 against a live Postgres and the result recorded in the Status column.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| Task 3 | 01-01 | 1 | PLAT-05 | T-01-01, T-01-07, T-01-08 | Sign-up → sign-in → session round-trip succeeds; credentials never logged | integration | `pnpm --filter api test:e2e -- auth.e2e-spec.ts` | ✅ `apps/api/test/auth.e2e-spec.ts` | ✅ green — 6 tests |
| Task 3 | 01-04 | 3 | PLAT-05 | T-01-03, T-01-07 | Password reset token is single-use and expires | integration | `pnpm --filter api test:e2e -- password-reset.e2e-spec.ts` | ✅ `apps/api/test/password-reset.e2e-spec.ts` | ✅ green — 6 tests |
| Task 1 | 01-05 | 3 | PLAT-06 | T-01-19, T-01-06 | Transport failure (timeout/DNS/5xx) never clears the session — D-01/D-03 | unit | `pnpm --filter mobile test -- session-refresh.test.ts` | ✅ `apps/mobile/lib/__tests__/session-refresh.test.ts` | ✅ green — 24 tests in file |
| Task 3 | 01-05 | 3 | PLAT-06 | T-01-20, T-01-06 | Explicit sign-out and a server-confirmed 401/403 revoke both clear the session; nothing else does — D-03 | unit | `pnpm --filter mobile test -- session-refresh.test.ts` | ✅ `apps/mobile/lib/__tests__/session-refresh.test.ts` | ✅ green — 24 tests in file |
| Task 2 | 01-05 | 3 | PLAT-06 | T-01-21 | Cold start reads cached session without a network call — D-02 | unit | `pnpm --filter mobile test -- session-refresh.test.ts` | ✅ `apps/mobile/lib/__tests__/session-refresh.test.ts` | ✅ green — 24 tests in file |
| Task 2 | 01-02 | 2 | PLAT-09 | T-01-15 | Theme toggle changes appearance and persists across restart; an unrecognised stored token falls back to `system` rather than being interpolated | unit | `pnpm --filter mobile test -- theme.test.ts` | ✅ `apps/mobile/lib/__tests__/theme.test.ts` | ✅ green — 10 tests |
| Task 2 | 01-03 | 2 | PLAT-01 | T-01-09, T-01-16, T-01-17 | Request below minimum supported client version receives 426, not silent success or generic 404 | integration | `pnpm --filter api test:e2e -- version-guard.e2e-spec.ts` | ✅ `apps/api/test/version-guard.e2e-spec.ts` | ✅ green — 6 tests |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Additional automated gates

Correctness gates with no threat-register mapping, kept out of the map above so that every row there
carries a real threat identifier.

| Task ID | Plan | Wave | What it gates | Automated Command | Status |
|---------|------|------|---------------|-------------------|--------|
| Task 4 | 01-01 | 1 | The live database actually contains what `schema.ts` declares — typecheck and build pass against an unmigrated database, so without this an unmigrated database is a false green across the whole suite | `pnpm --filter api test:e2e -- schema-parity.e2e-spec.ts` | ✅ green — 3 tests |
| Task 3 | 01-06 | 4 | Sign-in, sign-up, and forgot-password form state — validation, submission, and the enumeration-safe success state | `pnpm --filter mobile test -- auth-forms.test.ts` | ✅ green — 17 tests |
| Task 1 | 01-08 | 5 | Every command above re-runs on push against a CI-provisioned Postgres | `.github/workflows/ci.yml` | ⚠️ unexecuted — see Sign-Off |

---

## Wave 0 Requirements

- [x] `pnpm add -D jest supertest @nestjs/testing` — installed in `apps/api` (01-01)
- [x] `apps/api/test/jest-e2e.json` — NestJS e2e config (01-01)
- [x] `apps/api/test/auth.e2e-spec.ts` — PLAT-05 (01-01 Task 3)
- [x] `apps/api/test/password-reset.e2e-spec.ts` — PLAT-05 / D-08 (01-04 Task 3)
- [x] `apps/api/test/version-guard.e2e-spec.ts` — success criterion 4 (01-03 Task 2)
- [x] `apps/mobile/lib/__tests__/session-refresh.test.ts` — PLAT-06 (D-01/D-02/D-03) (01-05)
- [x] `apps/mobile/lib/__tests__/theme.test.ts` — PLAT-09 (01-02 Task 2)
- [x] CI Postgres service container for the e2e job — `postgres:17` with a `pg_isready` health check (01-08 Task 1)
- [x] `apps/mobile/jest.config.js` — the client test configuration the seeded list did not anticipate; `jest-expo` with a pnpm-aware `transformIgnorePatterns` (01-02 Task 1)
- [x] `apps/api/test/schema-parity.e2e-spec.ts` — the schema-parity gate the seeded list did not anticipate (01-01 Task 4)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Same authenticated home screen renders on iOS, Android, and a desktop browser from one route tree | PLAT-01 | No practical automated cross-platform-render assertion at this phase; success criterion 1 is inherently a three-device observation | Sign in on an iOS simulator, an Android emulator, and a desktop browser with the same account. Confirm each lands on the same authenticated home screen and that web URLs are deep-linkable. |
| Password reset email is captured and the link completes the flow | PLAT-05 | Requires opening the Mailpit web UI and clicking a real link | Trigger reset, open `localhost:8025`, click the link, set a new password, sign in with it from the app. |
| Theme change is visually correct in light and dark | PLAT-09 | Visual judgement, not assertable | Toggle the theme control; confirm both appearances on native and web. |
| Session survives a multi-week gap | PLAT-06 | Real elapsed time cannot be automated in-suite | Sign in, put the device in airplane mode, cold-start the app. Confirm the authenticated UI renders immediately with no network wait and no sign-out. |

**The first row is load-bearing, not ceremonial.** `expo export --platform web` succeeding proves the
web target bundles; it does not prove the app renders. Expo's static export emits a shell whose route
content is an empty Suspense boundary (`<div id="root"><div><!--$--><!--/$--></div></div>`), identical
for a working app and a blank one. This phase shipped three plans on top of a web build that rendered
a blank page on every route while typecheck, unit tests, and the export all stayed green. Nothing
automated in this repository closes that gap, and nothing will until a browser-driving check is
justified; until then the three-platform pass is the only thing that catches it.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — 21 of 23 tasks carry an `<automated>` block; the two that do not are 01-01's package-legitimacy gate and its self-hosted-identity decision, both `checkpoint` tasks that are human gates by construction
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — the longest run without one is two (01-01 Tasks 1 and 2), broken by the tracer at 01-01 Task 3
- [x] Wave 0 covers all MISSING references — every seeded item exists, plus the two the seed did not anticipate
- [x] No watch-mode flags — no `test`, `test:e2e`, or `ci` script and no step in `.github/workflows/ci.yml` passes `--watch`/`--watchAll`. The one `--watch` in the workspace is `apps/api`'s `dev` script (`nest start --watch`), which is the development server and is never invoked by a test or a CI job
- [x] Feedback latency < 60s — measured 2.2s for the client suite and 23.8s for the API end-to-end suite including `nest build`
- [x] `nyquist_compliant: true` set in frontmatter

**Two claims this contract does not make.**

1. `.github/workflows/ci.yml` has never been executed by GitHub Actions. Its YAML parses, its
   structure was inspected, and every command it runs was run locally and passed — but no CI run has
   been observed. The first push to a branch is what turns this from a reasoned workflow into a
   proven one.
2. No automated check in this repository can detect a blank web render (see the note above the
   Sign-Off).

**Approval:** approved 2026-08-11 by plan 01-08, with the two exclusions recorded above.
