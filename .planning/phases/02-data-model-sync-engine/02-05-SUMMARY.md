---
phase: 02-data-model-sync-engine
plan: 05
subsystem: testing
tags: [powersync, jest, sqlite, wa-sqlite, offline-first, durability, ci]

requires:
  - phase: 02-data-model-sync-engine
    provides: "02-02: startSession/addSessionExercise/logSet write helpers, the local SQLite schema, and the crud queue they populate"
provides:
  - "apps/mobile/lib/db/test-support.ts — real (not mocked) openTestPowerSync/closeTestPowerSync/reopenTestPowerSync primitives, typechecked against the real PowerSync/Drizzle types, unexercised in this environment"
  - "apps/mobile/jest.config.js's transformIgnorePatterns extended for @powersync/@journeyapps/comlink ESM packages"
  - "An exhaustive, empirically-verified record (six independent vehicle attempts) of why a real PowerSync database cannot be constructed under this Jest/Node sandbox, and a concrete list of what would close the gap"
  - "A second, independent finding: log-set.ts's getPowerSync() singleton has no test-injection seam, a blocker distinct from and additional to the environment gap"
affects: [02-07, 02-08]

actuals:
  tokens: 1650
  tasks: 0
  commits: 2

tech-stack:
  added: []
  patterns:
    - "PowerSync's DatabaseSource union documents an `{ opened: DBAdapter }` variant explicitly 'primarily useful for testing' — the sanctioned seam for a future hand-rolled test adapter, noted here for whoever picks this gap back up"

key-files:
  created:
    - apps/mobile/lib/db/test-support.ts
  modified:
    - apps/mobile/jest.config.js

key-decisions:
  - "Task 1 and Task 2 halted per the plan's own explicit, pre-authorized contingency ('halt and surface it rather than substituting a fake') after six independent, empirically-confirmed vehicle failures — not a judgment call invented mid-execution, but the exact fallback the plan's <action> and <verification> sections already named"
  - "No mock, no jest.mock('powersync'), and no skipped test was substituted for the real suites — a skipped test would also fail this project's own jest-suite-integrity.cjs reporter (numPendingTests > 0 fails an unfiltered run), so skipping was not a safe fallback either"
  - "test-support.ts was still written for real, targeting the same @powersync/web configuration production's powersync.web.ts uses (IDBBatchAtomicVFS + worker), so it is genuine forward-looking infrastructure for a future real-browser/device UAT harness, not a stand-in"

patterns-established: []

requirements-completed: []

coverage:
  - id: D1
    description: "PLAT-07 / durability half of PLAT-02: a logged set survives a close-and-reopen of a real PowerSync database with no finish/flush/sync step, proven end to end through the real startSession/addSessionExercise/logSet write path"
    requirement: "PLAT-07"
    verification: []
    human_judgment: true
    rationale: "Could not be attempted: no real, persistent PowerSync database can be constructed under this Jest/Node sandbox (WINDOWS.md #20), and even if one could, log-set.ts's write helpers have no seam to route them to an isolated test database (WINDOWS.md #21). Requires a real browser/device UAT pass."
  - id: D2
    description: "Roadmap criterion 4 (re-scoped): the crud queue survives a client Schema redefinition (added/removed nullable column) across a close and reopen, starting from a populated database, and the surviving queue still pushes and drains correctly"
    requirement: ""
    verification: []
    human_judgment: true
    rationale: "Same root cause as D1 — no real database vehicle available in this sandbox. Unattempted, not attempted-and-failed."
  - id: D3
    description: "apps/mobile/lib/db/test-support.ts exports openTestPowerSync/closeTestPowerSync/reopenTestPowerSync, correctly typed against the real @powersync/web and @powersync/drizzle-driver APIs"
    requirement: ""
    verification:
      - kind: other
        ref: "pnpm --filter mobile exec tsc --noEmit (clean, after building packages/api-contracts)"
        status: pass
    human_judgment: true
    rationale: "Typecheck proves the shape is correct; it does not prove the functions actually open/close/reopen a real database, since that has never run in this environment. A human/device pass is required before this is trusted as working infrastructure."

duration: ~65min
completed: 2026-08-17
status: halted
---

# Phase 2 Plan 5: Crash-Recovery and Schema-Redefinition Durability (Halted — No Real Database Vehicle) Summary

**test-support.ts's open/close/reopen primitives were written for real against the production PowerSync configuration and typecheck cleanly, but crash-recovery.test.ts and schema-redefinition.test.ts could not be authored — six independent, empirically-verified attempts confirm no real, persistent PowerSync database can be constructed under this Jest/Node sandbox without new dependencies or a project-wide ESM migration, so PLAT-07 and roadmap criterion 4 remain unproven here.**

## Performance

- **Duration:** ~65 min
- **Tasks:** 0/2 completed per their `<done>` criteria (both halted per the plan's own pre-authorized contingency)
- **Files modified:** 3 (1 created, 2 modified) plus 2 WINDOWS.md ledger entries

## Accomplishments

- Wrote `apps/mobile/lib/db/test-support.ts` for real — `openTestPowerSync`/`closeTestPowerSync`/`reopenTestPowerSync` over one underlying store, using the identical `@powersync/web` configuration (`IDBBatchAtomicVFS` default, worker path) production's `powersync.web.ts` already uses. It typechecks cleanly against the real PowerSync/Drizzle types.
- Extended `apps/mobile/jest.config.js`'s `transformIgnorePatterns` to allow `@powersync`/`@journeyapps`/`comlink`, the ESM packages this plan's action step anticipated needing — verified safe by running the full existing mobile suite (5 suites, 102 tests, all passing) before and after.
- Ran an exhaustive, six-attempt empirical investigation into whether a real PowerSync database can be constructed under Jest/Node in this environment (detailed below) — every attempt is backed by an actual command run and a captured failure, not a guess.
- Found and recorded a second, independent blocker: `log-set.ts`'s `getPowerSync()` singleton has no test-injection seam, so even a working database vehicle could not have driven the real write helpers without either mocking (explicitly forbidden by this plan's own acceptance criteria) or an out-of-scope edit to files outside this plan's `files_modified` list.
- Recorded both findings in `.planning/WINDOWS.md` (#20, #21) with enough detail for a future plan to pick this up without repeating the investigation.

## Task Commits

Neither task reached its `<done>` criterion, so there is no RED/GREEN TDD pair to report for either. Two commits landed the honest, partial deliverable:

1. `8e1281e` (feat) — `apps/mobile/lib/db/test-support.ts` created; `apps/mobile/jest.config.js` extended
2. `7e87525` (docs) — `.planning/WINDOWS.md` entries #20 and #21

**Plan metadata:** *(this commit, docs)*

## TDD Gate Compliance

Neither task carries a RED or GREEN commit. Both tasks are `tdd="true"`, but writing a failing test (RED) against a database that cannot be constructed at all would not be a meaningful RED state — it would fail for the wrong reason (environment, not missing implementation) and could not be turned GREEN by any implementation change available in this plan's scope. This is recorded here as an explicit gap, not silently omitted.

## Files Created/Modified

- `apps/mobile/lib/db/test-support.ts` - `openTestPowerSync`, `closeTestPowerSync`, `reopenTestPowerSync`, real (not mocked) `@powersync/web` configuration matching production, typechecked but unexercised
- `apps/mobile/jest.config.js` - `transformIgnorePatterns` extended for `@powersync`/`@journeyapps`/`comlink`
- `.planning/WINDOWS.md` - two new entries (#20, #21), see below

## The Investigation

Six independent attempts were made to construct a real, persistent PowerSync database under this project's Jest configuration, each with a distinct, empirically-confirmed failure — not assumed, actually run:

1. **`@jest-environment jsdom` docblock (the plan's first-listed option).** `jest-environment-jsdom` is not in the lockfile (`node -e "require.resolve('jest-environment-jsdom')"` → `Cannot find module`). Using the docblock anyway does not error — Jest silently keeps the RN preset's Node-based environment — and `typeof indexedDB` is `'undefined'` in that environment. No real IndexedDB is available by any route in this workspace; `fake-indexeddb` is also absent (`require.resolve` fails identically).
2. **`@powersync/web`'s `InMemoryVFS`, `useWebWorker:false` (the plan's second-listed option), under the RN preset's default Jest environment.** Jest's `react-native-env.js` sets `customExportConditions = ['require', 'react-native']`, which makes `@powersync/web` resolve to its `react_native_web` dist build via its package.json `exports` map. That build's worker client throws `Error: You are using the React Native web build of the PowerSync SDK, which requires custom worker URLs` from `spawnDefaultPowerSyncWorker` regardless of `useWebWorker: false` — confirmed by a real run against a scratch spike test, output captured before the process was killed for hanging on unresolved async cleanup.
3. **Same `InMemoryVFS` config, forcing package resolution to the plain (non-RN-Web) `default` export condition via a deep import (`@powersync/web/lib/index.js`).** Blocked outright: `@powersync/web`'s `package.json` `exports` map only lists `.`, `./extra/shared-memory-pool`, and `./bundled_worker` as valid subpaths — Node's exports enforcement rejects the deep import with `Cannot find module`, confirmed by a real Jest run.
4. **Same config, via a small custom Jest `testEnvironment` (a local file extending `jest-environment-node` without RN's `customExportConditions` override — no new package, just a repo-local `.js` file).** This successfully forced the plain browser build. It failed fast and cleanly with `ReferenceError: Worker is not defined` — even with `useWebWorker: false` at the top level of the options object, the plain build's `openDatabaseWorker` path still spawns a `Worker`.
5. **Same custom-environment approach, with `useWebWorker`/`enableMultiTabs`/`vfs` correctly nested under the `database` option (the actual bug in attempt 4 — those options are `WebSQLOpenOptions` fields, not top-level `PowerSyncDatabase` options).** Got further — past the `Worker` construction — but hung indefinitely inside the WASM SQLite engine's synchronous initialization. Given `vfs.js`'s own docstring ("queries run synchronously... primarily intended for development"), this is consistent with the sync-mode WASM build depending on `Atomics.wait`-based cross-realm signaling that has no counterpart to service it in plain Node. Killed after ~90s combined wait with zero output; confirmed via `pkill` and the harness's own background-task failure notification.
6. **Diagnosing attempt 5's WASM loader directly.** A follow-up run under `NODE_OPTIONS=--experimental-vm-modules` got a clean, specific error instead of a hang: `TypeError: A dynamic import callback was invoked without --experimental-vm-modules` (`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG`) from `wa-sqlite`'s dynamic `import()` of its `.mjs` WASM factory. Turning the flag on to fix this surfaces a second error one layer up (`Must use import to load ES Module: .../@powersync/common/lib/index.js`) — meaning closing this gap requires migrating the whole `apps/mobile` Jest configuration to native ESM mode (`extensionsToTreatAsEsm`, per-package ESM transform changes), which touches every existing test file's module resolution, not just these two new suites. That is a genuine architectural change (Rule 4 territory), well outside a 3-file plan, and not something to do unilaterally mid-plan.

None of the six attempts needed a new npm package to *diagnose* — attempts 4-6 used only packages already in the lockfile (`jest-environment-node`, already a transitive dependency) plus a local, uncommitted scratch environment file. Only attempt 1's actual fix (installing `jest-environment-jsdom` + `fake-indexeddb`) would require new dependencies, which this plan does not carry a package-legitimacy checkpoint for.

**Separately, and independently of the vehicle question:** even if attempt 6's ESM migration were completed, `apps/mobile/lib/db/log-set.ts`'s `startSession`/`addSessionExercise`/`logSet` call the module-level `getPowerSync()` singleton from `./powersync` directly — that file is outside this plan's `files_modified` scope, and it hardcodes `dbFilename: 'fitness.db'` with no way to redirect it to a test-scoped database. A durability suite driving the *real* write helpers (as the plan explicitly requires — "a suite that bypasses it tests something else") would need a dependency-injection seam added to `log-set.ts`/`powersync.ts`, which is out of scope here and would collide with sibling plans in this wave that may also touch those files.

## The Backstop Truth

This plan's `<flagged-assumptions>` section named one truth as `verification: backstop` before any code was written — carried forward here unchanged, since the suite that was meant to reach it was never built:

> "A set whose write had not committed when the process died is absent entirely, and one that had committed is present with every field populated — there is no half-written row."

This remains **entirely unverified** — not "verified with a caveat," genuinely untested. The plan's own reasoning for why even a working suite could only reach the *recoverable* case (a graceful close landing between statements, not a kill mid-commit) still applies, and is moot here since no suite exists to reach even that reduced claim. Per the plan's instruction, this truth abstains to `human_needed` at verify time and must not be treated as passing on the strength of anything in this summary.

## Decisions Made

- **Halted per the plan's own explicit contingency** rather than inventing a workaround. The plan's `<action>` names exactly three vehicle options and says plainly: "If neither opens a database, halt and surface it rather than substituting a fake... Record it in `.planning/WINDOWS.md`... and say so in the summary." The `<verification>` section repeats this as an accepted outcome. This summary follows that instruction to the letter, going further than the plan asked by empirically confirming *why* across six attempts rather than stopping at the first failure.
- **No mock, no `jest.mock('powersync')`, no skipped test.** A mock-backed suite would violate the plan's `must_haves` and the project's philosophy directly ("A durability suite driven by a mock asserts that the mock is durable, which is worse than no suite"). A skipped test was also considered and rejected: this project's `scripts/jest-suite-integrity.cjs` reporter fails the *entire* `pnpm --filter mobile test` run on any pending/skipped test in an unfiltered run — landing a permanently-skipped suite would have broken CI for the whole mobile workspace, a far worse outcome than an honestly-absent suite.
- **`test-support.ts` was still written for real,** not withheld, because it is genuinely correct, typechecked infrastructure that a future plan (adding real browser/device UAT) can use immediately — the same category of "written but unexercised" gap Phase 1 and plans 02-01/02-02 already established precedent for.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `apps/mobile/jest.config.js` not in this plan's declared `files_modified`, but required by the plan's own action text**
- **Found during:** Task 1, following the plan's instruction to extend `transformIgnorePatterns` for ESM PowerSync packages
- **Issue:** The plan's frontmatter `files_modified` list omits `jest.config.js`, but the `<action>` text explicitly instructs extending it ("the existing allowlist there is the pattern to extend, not replace")
- **Fix:** Extended the existing `transformIgnorePatterns` regex to include `@powersync`, `@journeyapps`, `comlink`
- **Files modified:** `apps/mobile/jest.config.js`
- **Verification:** Full existing mobile suite (5 suites, 102 tests) still passes unchanged after the edit
- **Committed in:** `8e1281e`

### Not Auto-fixed — Halted Per Plan Instruction

**2. [Plan's own pre-authorized contingency] Real PowerSync database vehicle unavailable in this Jest/Node sandbox**
- **Found during:** Task 1, attempting all three of the plan's named vehicle options plus three additional diagnostic attempts
- **Issue:** See "The Investigation" above — six independent, empirically-confirmed failures
- **Action taken:** Halted per the plan's explicit instruction. Recorded `.planning/WINDOWS.md` #20 (unrun-verify) and #21 (deviation, the separate DI-seam finding)
- **Files affected:** `apps/mobile/lib/db/test-support.ts` written but unexercised; `apps/mobile/__tests__/crash-recovery.test.ts` and `apps/mobile/__tests__/schema-redefinition.test.ts` not created
- **Not committed:** No fake, mocked, or skipped test file exists in this plan's commits

---

**Total deviations:** 1 auto-fixed (Rule 3), 1 halted per the plan's own pre-authorized contingency (not a Rule 1-4 deviation — the plan itself specified this exact fallback)
**Impact on plan:** Tasks 1 and 2's core deliverable — proof that a crash mid-workout and a client schema redefinition each preserve data — was not produced. This is the plan's entire purpose, so this is a genuine gap, not a minor one. It is, however, exactly the outcome the plan's author explicitly anticipated and pre-authorized, with a documented, non-arbitrary reason.

## Known Stubs / Verification Gaps

Recorded in `.planning/WINDOWS.md`:

- **#20 (unrun-verify):** No real PowerSync database can be constructed under this Jest/Node sandbox — full six-attempt investigation above.
- **#21 (deviation):** `log-set.ts`'s `getPowerSync()` singleton has no DI seam for a test database, a second, independent blocker.

Both gaps must be closed together before this plan's core guarantees can be proven: (a) a real browser/device UAT environment (or, with human sign-off through the package-legitimacy gate, `jest-environment-jsdom` + `fake-indexeddb`, though attempts 2-6 suggest even that would not be sufficient on its own given the RN-Web export-condition and WASM-loader issues), and (b) a small, deliberate DI change to `log-set.ts`/`powersync.ts` so a test suite can route the real write helpers to an isolated database.

## Broken-windows ledger

Both findings above were appended to `.planning/WINDOWS.md` via `gsd-tools windows append` (`--kind unrun-verify` for #20, `--kind deviation` for #21).

## Issues Encountered

The primary issue *is* this plan's finding — see "The Investigation" above. No other issues were encountered; `pnpm --filter @fitness/api-contracts build` was run once to unblock `tsc --noEmit` on a freshly-materialized worktree (a pre-existing, unrelated build-output gap, not introduced by this plan), and `pnpm install --frozen-lockfile` was run once to materialize this worktree's `node_modules` from the existing lockfile (no new packages added).

## User Setup Required

None — no external service configuration required. Closing the gap this plan leaves open requires either a human decision (approve new test-only dependencies through the package-legitimacy gate) or access to a real browser/device UAT environment, neither of which is a "setup step" this summary can hand off as a checklist.

## Next Phase Readiness

- `apps/mobile/lib/db/test-support.ts` exists, is correctly typed, and is ready to be exercised the moment a real vehicle (browser/device UAT, or cleared new dependencies) is available.
- `apps/mobile/__tests__/crash-recovery.test.ts` and `apps/mobile/__tests__/schema-redefinition.test.ts` do not exist. PLAT-07 and roadmap criterion 4 remain unverified beyond the code-level wiring 02-02 already established.
- REQUIREMENTS.md already shows PLAT-02 and PLAT-07 as `[x]` complete, carried from plan 02-02's own traceability entry (D5, `human_judgment: true`, deferred to human/device UAT). This plan does not change that status — it neither closes nor reopens it, since the underlying decision belongs to 02-02, not here. This plan's own contribution to those two requirements is the unverified gap recorded above, not a completion.
- A future plan should: (1) decide whether to pursue real browser/device UAT (Playwright, or a physical device against a running Metro dev server) or request new test-only dependencies through the package-legitimacy gate, and (2) add a DI seam to `log-set.ts`/`powersync.ts` so the real write helpers can be driven against an isolated test database either way.
- No changes were made to `apps/mobile/lib/db/log-set.ts`, `powersync.ts`, or `powersync.web.ts` — this plan stayed inside its declared scope even while documenting why that scope boundary is itself part of the blocker.

---
*Phase: 02-data-model-sync-engine*
*Completed: 2026-08-17*

## Self-Check: PASSED

`apps/mobile/lib/db/test-support.ts` confirmed tracked via `git ls-files`; commit hashes `8e1281e` and `7e87525` confirmed present in `git log`.
