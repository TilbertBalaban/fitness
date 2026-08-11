---
phase: 01-cross-platform-foundation
plan: 08
subsystem: continuous-integration
tags: [github-actions, turborepo, jest, postgres, validation-contract]
status: complete

requires:
  - "01-01: turbo.json task graph, apps/api/test/jest-e2e.json, db:push, auth and schema-parity specs"
  - "01-02: apps/mobile/jest.config.js, theme.test.ts"
  - "01-03: version-guard.e2e-spec.ts"
  - "01-04: password-reset.e2e-spec.ts and the capture mailer"
  - "01-05: session-refresh.test.ts"
  - "01-06: auth-forms.test.ts"
provides:
  - ".github/workflows/ci.yml: push and pull_request workflow — check job (typecheck, lint, unit tests, web bundle) and e2e job against a postgres:17 service"
  - "scripts/jest-suite-integrity.cjs: Jest reporter that fails a run containing no tests, a skipped or todo test, or a suite that ran nothing"
  - ".planning/phases/01-cross-platform-foundation/01-VALIDATION.md: the completed phase validation contract"
affects:
  - "apps/api/package.json: the test script that reported 'No tests found' as a pass was removed"
  - "apps/mobile/package.json: --passWithNoTests removed"
  - "turbo.json: outputs declared, markdown excluded from cacheable task inputs"
  - "README.md: Continuous integration section"

tech-stack:
  added: []
  patterns:
    - "Suite integrity is enforced inside Jest by a reporter returning an error from getLastError(), so it applies identically to a local run and a CI run with no workflow-only step to drift"
    - "The integrity rules relax on a filtered run (jest -t, a path argument, --onlyChanged) so ordinary local filtering still works; CI runs unfiltered and is held to them"
    - "CI supplies every variable the API needs as a workflow literal and generates BETTER_AUTH_SECRET per run, so no repository secret reaches a log-bearing runner"

key-files:
  created:
    - .github/workflows/ci.yml
    - scripts/jest-suite-integrity.cjs
  modified:
    - turbo.json
    - package.json
    - README.md
    - apps/api/package.json
    - apps/api/test/jest-e2e.json
    - apps/mobile/package.json
    - apps/mobile/jest.config.js
    - .planning/phases/01-cross-platform-foundation/01-VALIDATION.md
  removed: []

decisions:
  - "apps/api has no test script at all — every API test is end-to-end, and a lane whose only output was 'No tests found, exiting with code 0' was a green that asserted nothing"
  - "Turbo task inputs stay at $TURBO_DEFAULT$ minus markdown rather than hand-listed globs; a missed glob produces a stale green, which is worse than a slightly larger hash"
  - "The check job also runs the web bundle, which proves the web target builds and explicitly does not prove it renders"
  - "The plan's mail-catcher service is provisioned as written even though the reset spec self-selects the capture transport, and the mismatch is recorded rather than silently dropped"

metrics:
  duration: ~1h
  completed: 2026-08-11

actuals:
  tokens: 10400
  tasks: 2
  commits: 2
---

# Phase 01 Plan 08: CI Pipeline and Validation Contract Summary

Every push now runs typecheck, lint, the client unit suite and the web bundle in one job, and the
21-test API end-to-end suite against a real `postgres:17` service in another — and a Jest reporter
makes a run that asserted nothing fail instead of passing.

## What Was Built

**Task 1 — CI on push** (`f1bfd32`)

`.github/workflows/ci.yml` triggers on `push` and `pull_request` with two jobs.

`check` installs pnpm 11.9.0 (from the root `packageManager` field) and Node 22, caches the pnpm
store through `pnpm/action-setup@v6`, runs `pnpm install --frozen-lockfile`, then
`pnpm turbo run typecheck lint test build`.

`e2e` declares a `postgres:17` service with a `pg_isready -U postgres -d fitness` health check and a
mailpit service on 1025/8025, supplies every variable the API needs to boot as a workflow literal,
generates `BETTER_AUTH_SECRET` per run with `openssl rand -hex 32`, applies the Drizzle schema with
`pnpm --filter api db:push`, and then runs `pnpm --filter api test:e2e`. It references no repository
secret and no EAS build step exists.

`scripts/jest-suite-integrity.cjs` is loaded by both Jest configurations. It fails a run that
contained no tests, that skipped or `todo`'d a test, or in which a suite file ran nothing. It fails
the run by returning an error from `getLastError()` — throwing from `onRunComplete` is swallowed and
the process still exits 0 — and writes the reason to stderr itself, because Jest prints only
`undefined` for a reporter error.

`turbo.json` gained `outputs` on every task and `["$TURBO_DEFAULT$", "!**/*.md"]` inputs on the
cacheable ones. `test:e2e` stays `cache: false`.

`README.md` gained a `## Continuous integration` section with a job-to-local-command table.

**Task 2 — the validation contract** (`9bc97db`)

`01-VALIDATION.md` now names, for all seven seeded rows, the real task, plan, wave and threat
identifiers that delivered each behaviour, with every automated command run and its result recorded.
Provenance came from `git log --diff-filter=A` on each spec file rather than from inference.

Three gates that carry no threat mapping — schema parity, the auth-forms suite, and the CI workflow
itself — went into a separate table, so every row of the per-task map keeps a real threat identifier
instead of the map acquiring `—` placeholders.

Front matter is now `status: validated`, `nyquist_compliant: true`, `wave_0_complete: true`, all 16
checkboxes are ticked, and the sign-off states the two claims the contract does **not** make.

## Verification Run

Every command below was run in this worktree against a live Postgres. These are observed results,
not projections.

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0 — lockfile and manifests agree |
| `pnpm turbo run typecheck lint test build` | exit 0 — 11 tasks, 66s cold |
| `pnpm turbo run test` | exit 0 |
| `pnpm --filter mobile test` | exit 0 — 3 suites, 51 tests, 2.2s |
| `pnpm --filter api test:e2e` | exit 0 — 4 suites, 21 tests, 23.8s including `nest build` |
| `pnpm --filter api test:e2e -- auth.e2e-spec.ts` | exit 0 — 6 tests |
| `pnpm --filter api test:e2e -- password-reset.e2e-spec.ts` | exit 0 — 6 tests |
| `pnpm --filter api test:e2e -- version-guard.e2e-spec.ts` | exit 0 — 6 tests |
| `pnpm --filter api test:e2e -- schema-parity.e2e-spec.ts` | exit 0 — 3 tests |
| `pnpm --filter mobile test -- session-refresh.test.ts` | exit 0 — 24 tests |
| `pnpm --filter mobile test -- theme.test.ts` | exit 0 — 10 tests |
| `pnpm --filter mobile test -- auth-forms.test.ts` | exit 0 — 17 tests |
| `grep -rEn 'secrets\.' .github/workflows/ci.yml` | no match |
| `grep -rEn 'eas build\|expo build' .github/workflows/ci.yml` | no match |
| `grep -c 'TBD' 01-VALIDATION.md` | 0 |
| YAML parse of `ci.yml` (`yaml@2.9.0`) | parses; 2 triggers, 2 jobs, 2 services, health check and ports as intended |

**The integrity reporter was proven negatively, not just positively.** Appending
`it.todo('temporary suite-integrity probe')` to `theme.test.ts` turned `pnpm --filter mobile test`
red with `Suite integrity check failed — 1 test(s) were marked todo`; the probe was reverted with
`git checkout --` on that one file. A filtered run selecting a single suite still exits 0, so the
per-file commands the validation contract depends on were not broken by the guard.

**The workflow itself is unexecuted.** GitHub Actions cannot be run from here. Its YAML parses, its
structure was inspected field by field, and every command it invokes was run locally and passed —
but no CI run has been observed, so this summary does not claim the pipeline is green. Recorded as
`.planning/WINDOWS.md` entry 12 (`unrun-verify`).

## Coverage

| Requirement | Behaviour | Automated command | Runs in CI | Status |
|---|---|---|---|---|
| PLAT-05 | Sign-up → sign-in → session round-trip, no credential echo | `auth.e2e-spec.ts` | e2e job | ✅ 6 tests |
| PLAT-05 | Reset token single-use, expiry, enumeration-safe response | `password-reset.e2e-spec.ts` | e2e job | ✅ 6 tests |
| PLAT-05 | Live database matches `schema.ts` | `schema-parity.e2e-spec.ts` | e2e job | ✅ 3 tests |
| PLAT-01 | Below-floor client gets 426, malformed header passes through | `version-guard.e2e-spec.ts` | e2e job | ✅ 6 tests |
| PLAT-06 | Transport failure never clears the session; sign-out and server revocation do | `session-refresh.test.ts` | check job | ✅ 24 tests |
| PLAT-09 | Appearance persists; unknown stored token falls back to `system` | `theme.test.ts` | check job | ✅ 10 tests |
| PLAT-01/05 | Auth form states including the enumeration-safe success | `auth-forms.test.ts` | check job | ✅ 17 tests |
| PLAT-01 | Web target bundles | `expo export --platform web` | check job | ✅ 19 routes |
| PLAT-01 | Web target **renders** | none | — | ❌ manual only |
| PLAT-01 | iOS and Android render | none | — | ❌ manual only |
| PLAT-05 | Reset link clicked from a real inbox | none | — | ❌ manual only |
| PLAT-06 | Session survives a real multi-week gap | none | — | ❌ manual only |

72 automated assertions across 7 suites run on every push. The four manual rows are the phase's
honest coverage boundary and are the four rows of the contract's Manual-Only Verifications table.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 2 — missing critical functionality] A zero-test run reported success**

- **Found during:** Task 1, on the baseline run before any change.
- **Issue:** `pnpm turbo run test` printed `api:test: No tests found, exiting with code 0` and turbo
  counted it as a successful task. `apps/api` and `apps/mobile` both passed `--passWithNoTests`. This
  is the exact shape of the wave-2 hoisting break, where a Jest version repoint made every API e2e
  suite run 0 tests. A CI job that reports "0 tests" as green is worthless.
- **Fix:** Added `scripts/jest-suite-integrity.cjs`, wired into both Jest configurations; removed
  `--passWithNoTests` from `apps/mobile`; removed the `test` script from `apps/api` entirely, because
  every API test is end-to-end and the lane had nothing truthful to report.
- **Files:** `scripts/jest-suite-integrity.cjs`, `apps/mobile/jest.config.js`,
  `apps/api/test/jest-e2e.json`, `apps/mobile/package.json`, `apps/api/package.json`
- **Commit:** `f1bfd32`

**2. [Rule 1 — bug] The first integrity reporter broke ordinary filtered runs and printed nothing**

- **Found during:** Task 1, while testing the reporter negatively.
- **Issue:** The first version failed any run with pending tests, which meant `jest -t "some test"` —
  and by extension anything that skips a sibling — went red. It also failed silently: Jest prints
  `undefined` for a reporter error rather than its message, so the developer saw an exit code and no
  reason.
- **Fix:** The skip/todo/empty-suite rules now apply only to an unfiltered run (`testNamePattern`,
  `onlyChanged`, `findRelatedTests`, and both the jest-29 `testPathPattern` and jest-30
  `testPathPatterns` spellings are checked); the "no tests at all" rule still always applies. The
  reason is written to stderr by the reporter itself.
- **Verification:** All seven per-file commands in the validation contract still exit 0; the
  `it.todo` probe still turns an unfiltered run red.
- **Commit:** `f1bfd32`

### Deliberate departures from the plan text

**3. The acceptance-criteria watch-flag grep cannot pass as written**

The plan requires `grep -rEn -- '--watch|--watchAll' .github/workflows/ci.yml apps/api/package.json
apps/mobile/package.json package.json` to return no match. It returns exactly one:
`apps/api/package.json:7: "dev": "nest start --watch"` — the development server, which no test and no
CI job invokes. Renaming it to `-w` would satisfy the grep while changing nothing real, which is
gaming the check. The criterion's intent — no watch flag on any test or CI path — was verified
instead with a precise check over every `test*`/`ci*` script plus the workflow, and passes. The
overbroad grep is left failing rather than defeated.

**4. Turbo input globs were not hand-listed**

The plan asks for "proper input globs" on the cacheable tasks. Hand-listing them here means enumerating
`src/`, `app/`, `lib/`, `components/`, `test/`, `tsconfig.json`, `babel.config.js`, `jest.config.js`,
`nativewind-env.d.ts`, `global.css`, `tailwind.config.js`, and `metro.config.js` — and any one missed
produces a cache hit on a change that should have invalidated, i.e. a stale green. The tasks use
`["$TURBO_DEFAULT$", "!**/*.md"]`: turbo's own complete input set, minus the one category that
provably cannot affect `tsc` or `jest`. Narrowing further is a correctness risk for a cache-time gain
this repository does not need.

**5. The mail-catcher service is provisioned but never receives mail**

The plan asks for mailpit on 1025 "so the end-to-end spec's mailer path is the same one it takes
locally rather than a CI-only substitute". That premise does not hold against what plan 01-04 built:
`password-reset.e2e-spec.ts` sets `MAIL_TRANSPORT=capture` in its own spawn environment, so locally it
already never touches Mailpit — the capture file *is* its assertion surface, precisely because there
is no in-process module to override in a spawned-process suite. The service is provisioned as the plan
requires (it gives the ambient `MAIL_TRANSPORT=smtp` configuration a live endpoint rather than a closed
port), but nothing asserts against it. Recorded as `.planning/WINDOWS.md` entry 14 rather than dropped
quietly or presented as coverage.

**6. The check job also builds, which the plan did not ask for**

`pnpm turbo run typecheck lint test build` includes `expo export --platform web`. It catches a broken
web bundle before a human tries it, at roughly 50s. It is explicitly labelled in the README and the
validation contract as proof that the target bundles and *not* that it renders.

## Auto-Resolved Checkpoints

This plan declares `autonomous: true` and contains no `checkpoint` task. The judgement calls that
would otherwise have been checkpoints, and how each was resolved:

| Decision | Options | Resolution | Reasoning |
|---|---|---|---|
| The watch-flag grep fails on `nest start --watch` | rename to `-w`; drop the criterion; verify the intent precisely and report the literal failure | Third | Renaming to dodge a grep is the failure mode the criterion exists to prevent. The intent is verifiable and verified; the letter is reported as unmet. |
| `apps/api` `test` script reports "No tests found" as a pass | leave it; keep `--passWithNoTests`; delete the script | Delete | The phase's stated hazard is exactly a zero-test green. Deleting is the only option under which `turbo run test` cannot report a success that asserted nothing. |
| Blank-render smoke check | jsdom harness; Playwright; leave a documented gap | Documented gap | Static export emits an empty Suspense boundary for every route — identical output for a working and a blank app — so no HTML assertion can see the difference. jsdom lacks `matchMedia`, which react-native-web's Appearance needs, so it would produce false reds; Playwright is the heavyweight browser stack the brief excluded. Recorded as `WINDOWS.md` entry 13. |
| Mailpit service in CI | omit as unused; include as the plan requires | Include, flagged | Omitting would quietly narrow a written acceptance criterion. Including with the mismatch recorded keeps the contract and the truth both intact. |
| Turbo input globs | hand-list; keep defaults minus markdown | Defaults minus markdown | A missed glob is a stale green. |
| Action versions | pin from memory; verify against the registry | Verify | `actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6` were read from the GitHub releases API, and `action-setup`'s `action.yml` was read to confirm the `cache` input and `packageManager` resolution exist on v6. |

## Known Gaps

No stubs, no placeholder text, no unwired components. Two coverage gaps, both recorded in
`.planning/WINDOWS.md` and in the validation contract's sign-off:

1. **The CI workflow has never run** (`WINDOWS.md` 12). Nothing in this summary claims otherwise. The
   first push is what turns it from reasoned to proven, and the plan's `<human-check>` — break an
   assertion, confirm the run goes red, revert — is still outstanding.
2. **No automated check detects a blank web render** (`WINDOWS.md` 13). This phase shipped three plans
   on top of a blank web build while typecheck, unit tests and the export stayed green (the bug itself
   is `WINDOWS.md` 11). The export step added here would not have caught it either.

`WINDOWS.md` entry 14 records the provisioned-but-unasserted mailpit service. The ledger went from 11
open entries to 14; entries 1–11 are untouched and the markdown table and JSON block remain in sync.

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file-access pattern and no schema change.
The workflow's own two threats were dispositioned in the plan's register and are both satisfied:
T-01-26 (no repository secret is referenced; asserted by grep) and T-01-SC (`--frozen-lockfile` makes
the committed lockfile authoritative).

## Self-Check: PASSED

All claimed files exist and both claimed commits are in the branch history. Checked:
`.github/workflows/ci.yml`, `scripts/jest-suite-integrity.cjs`, `turbo.json`, `package.json`,
`README.md`, `apps/api/package.json`, `apps/api/test/jest-e2e.json`, `apps/mobile/package.json`,
`apps/mobile/jest.config.js`, `01-VALIDATION.md`; commits `f1bfd32` and `9bc97db`.
