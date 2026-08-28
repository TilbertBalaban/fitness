---
phase: 08-progression-engine
plan: 06
subsystem: testing
tags: [progression-engine, parity-fixture, playwright, durability, jest, nestjs, d-08]

# Dependency graph
requires:
  - phase: 08-progression-engine
    provides: "08-01 through 08-05's complete recommendNextPrescription decision tree (positive-case rule, normalization boundary, shortfall streak, RIR tolerance band, D-07 preference branch) and the RecommendInput shape, including 08-05's now-required preference field, this plan's fixture table freezes against"
provides:
  - "PROGRESSION_PARITY_FIXTURES: the single data-only input/expected-output table three separate jest processes import and run — packages/progression-engine's own runner, apps/api's first-ever pure-package spec, apps/mobile's mirror test"
  - "apps/api/package.json's second-ever @fitness/* dependency and first pure rules package (devDependency only, D-16)"
  - "seedProgressionHistory: N prior completed sessions for one exercise, each with a real prescription snapshot, generalising seedPriorHeaviestSet's null-target seed"
  - "apps/mobile/e2e/progression-recommendation.spec.ts: the real-browser, offline, PRGR-06/07/11 proof"
affects: []

# Actuals (#2632)
actuals:
  tokens: 7700
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "First cross-app-boundary shared test fixture in this repo: one plain data array (no test-framework import) re-exported from a pure package's public barrel and imported identically by three jest configurations (plain ts-jest in the package, jest-expo in apps/mobile, a second plain ts-jest with its own tsconfig in apps/api)."
    - "First apps/api import of a @fitness/* pure rules package (previously only @fitness/api-contracts) — devDependency-only, spec-only, no NestJS wiring, establishing the resolution path Phase 10's real reconciliation service will reuse."

key-files:
  created:
    - packages/progression-engine/src/__fixtures__/parity.ts
    - packages/progression-engine/src/__tests__/parity.test.ts
    - apps/api/src/progression/__tests__/parity.spec.ts
    - apps/mobile/lib/db/__tests__/progression-parity.test.ts
    - apps/mobile/e2e/progression-recommendation.spec.ts
  modified:
    - packages/progression-engine/src/index.ts
    - apps/api/package.json
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/playwright.config.ts

key-decisions:
  - "The PRGR-08 layoff-invariance case is two ParityCase entries built from the exact same shortfallSessions array (a shortfall streak below the offer threshold), named 'logged three days apart' and 'logged three months apart' respectively, both asserting the identical shortfall_hold result — RecommendInput (result.ts) has no date/timestamp field anywhere, so 'how long ago' cannot even be expressed as an input. The pair makes that absence loud rather than implicit, matching the acceptance criteria's literal 'two histories ... different elapsed intervals' wording as closely as a clockless type permits."
  - "Scenario 3's (PRGR-06, nothing loadable) gym profile uses a real barbell (60kg) with zero plates rather than no barbell at all — snapToAchievable treats an EMPTY achievable list as 'return the target unchanged' (never null), so the only way to reach the actual no_achievable_weight branch is a non-empty achievable list whose sole entry (the bare bar) is heavier than the computed ideal load, which roundToAchievable's 'down' direction then cannot satisfy."
  - "Scenario 1 and the fixture's own load_increase cases deliberately use a bare, uncatalogued exercise id ('ex-workout-harness-1'), which resolves equipmentType to null — achievableLoadsForEquipmentType(null, ...) always returns [], so snapToAchievable always returns the ideal target unmodified. This makes the offline-recommendation proof independent of any seeded gym profile, keeping that scenario's setup minimal and its assertion (heavier than logged) unconditionally true rather than contingent on inventory shape."

patterns-established:
  - "Client/server parity fixture table (D-08): a pure data array re-exported from a package's public barrel specifically so two different apps can import the identical object rather than each declaring their own copy — the first instance of this pattern in the repo, now available as precedent for any future both-sides-consumed rule package."

requirements-completed: [PRGR-11]

coverage:
  - id: D1
    description: "PROGRESSION_PARITY_FIXTURES (15 cases) is imported and executed by all three jest processes — the package's own parity.test.ts, apps/api's parity.spec.ts (the first-ever apps/api import of a @fitness/* pure rules package), and apps/mobile's progression-parity.test.ts — proving SC6/D-08's client/server parity claim with a real cross-runtime run rather than an assertion."
    requirement: PRGR-11
    verification:
      - kind: unit
        ref: "packages/progression-engine/src/__tests__/parity.test.ts"
        status: pass
      - kind: unit
        ref: "apps/api/src/progression/__tests__/parity.spec.ts"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/progression-parity.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "A real browser, offline, against a real @powersync/web database, renders a recommendation computed from seeded logged history at exercise start (PRGR-11) — heavier than what was logged, with the browser context set offline only after the page finished loading and no goto/reload afterward."
    requirement: PRGR-11
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/progression-recommendation.spec.ts#renders a recommendation computed from real offline logged history, heavier than what was logged"
        status: pass
    human_judgment: false
  - id: D3
    description: "The two non-recommendation states (no history — PRGR-07; nothing loadable — PRGR-06) render as themselves in the same real browser, with no weight figure printed in either case."
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/progression-recommendation.spec.ts#no logged history prompts the lifter to pick their own starting weight, with no weight figure rendered (PRGR-07)"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/progression-recommendation.spec.ts#a surplus the gym cannot load renders the explicit unavailable state, with no weight figure rendered (PRGR-06)"
        status: pass
    human_judgment: false

duration: 23min
completed: 2026-08-29
status: complete
---

# Phase 8 Plan 6: The Client/Server Parity Fixture and the Real-Browser Offline Proof Summary

**One 15-case fixture table (`PROGRESSION_PARITY_FIXTURES`) executed identically by three separate jest processes — including apps/api's first-ever import of a `@fitness/*` pure rules package — plus a real, offline, real-browser proof that a recommendation renders at exercise start from local history alone.**

## Performance

- **Duration:** ~23 min (base commit `7d709ff` at 01:26:49+03:00 to final task commit `1c13418` at 01:49:07+03:00)
- **Started:** 2026-08-29T01:26:49+03:00 (worktree base)
- **Completed:** 2026-08-29T01:49:07+03:00
- **Tasks:** 3
- **Files modified:** 12 (5 created, 7 modified)

## Accomplishments
- `packages/progression-engine/src/__fixtures__/parity.ts` — `PROGRESSION_PARITY_FIXTURES`, a data-only (no `describe`/`it`/`expect`, no test-framework import) table of 15 cases covering every `ProgressionResult` kind, every `RecommendationBasis` member, both D-07 preference modes, a per-side pair, a drop-set group, and a dedicated PRGR-08 pair proving recency is sessions, never elapsed time. Re-exported from the package's public barrel (`index.ts`) with a comment explaining why a test fixture belongs in a private, workspace-only package's public surface.
- `packages/progression-engine/src/__tests__/parity.test.ts` — the package-side runner, plus a coverage assertion that fails loudly if a future result branch ships without a matching fixture case.
- `apps/api/package.json` gains `@fitness/progression-engine` as a **devDependency** — its second-ever `@fitness/*` entry and the first pure rules package ever imported from `apps/api` in this repository. The import resolved with no further configuration once the workspace was built (`npx turbo run build --filter=@fitness/progression-engine`) — the resolution path itself needed no new tooling, only the dependency edge and a spec test.
- `apps/api/src/progression/__tests__/parity.spec.ts` — the api-side half of the proof, matched by `apps/api`'s own `testRegex: '\.spec\.ts$'` and confirmed in `pnpm --filter api test`'s own output (`PASS src/progression/__tests__/parity.spec.ts`), not merely present on disk. Boots no Nest application, injects no provider, touches no database; a grep for `@nestjs/`, `@Injectable`, `@Controller`, `@Module` across `apps/api/src/progression` finds none (D-16).
- `apps/mobile/lib/db/__tests__/progression-parity.test.ts` — the mobile-side twin, named `.test.ts` to match this app's own convention.
- `apps/mobile/lib/db/test-support.ts` — `seedProgressionHistory`, generalising `seedPriorHeaviestSet` to N prior completed sessions for one exercise, each carrying a real prescription snapshot and one completed working set. `apps/mobile/app/__durability.web.tsx` gains exactly one appended harness bridge method delegating to it — every prior entry in that shared cross-phase file is untouched (`git diff` shows additions only).
- `apps/mobile/e2e/progression-recommendation.spec.ts` — three real-browser Playwright cases in the `durability` project, each against a real `@powersync/web` database: an offline recommendation heavier than what was logged (PRGR-11, `setOffline(true)` called only after the page finished loading, no `goto`/`reload` afterward), a no-history starting-weight prompt with no weight figure printed (PRGR-07), and an explicit "no loadable weight" state with no weight figure printed (PRGR-06). Added to `playwright.config.ts`'s `durability` project `testMatch` list.
- The one gap this proof does not close is written down, not glossed: `.planning/WINDOWS.md` entry #154 records that both parity runners execute under Node/V8, never on-device Hermes, so a Hermes-specific divergence would not be caught here (08-RESEARCH Assumption A4) — this machine has no Xcode or Android SDK to close it directly.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author the shared fixture table and run it from the package** - `aa3773d` (feat)
2. **Task 2: Run the same table from the api suite and the mobile suite** - `91651ff` (feat)
3. **Task 3: Prove the offline recommendation in a real browser** - `1c13418` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `packages/progression-engine/src/__fixtures__/parity.ts` - `ParityCase`, `PROGRESSION_PARITY_FIXTURES` (15 cases)
- `packages/progression-engine/src/__tests__/parity.test.ts` - Package-side runner plus kind/basis/requirement coverage assertions
- `packages/progression-engine/src/index.ts` - Re-exports the fixture module from the public barrel
- `apps/api/package.json` - `@fitness/progression-engine` added as a devDependency
- `apps/api/src/progression/__tests__/parity.spec.ts` - The api-side half of the parity proof (new directory)
- `apps/mobile/lib/db/__tests__/progression-parity.test.ts` - The mobile-side half of the parity proof
- `apps/mobile/lib/db/test-support.ts` - `seedProgressionHistory`, `SeedProgressionHistoryInput`, `ProgressionHistoryPerformance`
- `apps/mobile/app/__durability.web.tsx` - One appended `seedProgressionHistory` harness bridge method
- `apps/mobile/e2e/progression-recommendation.spec.ts` - New: the three-scenario real-browser offline proof
- `apps/mobile/playwright.config.ts` - `progression-recommendation.spec.ts` added to the `durability` project's `testMatch`
- `.planning/WINDOWS.md` - Entry #154: the Hermes gap this parity proof does not close (unrun-verify)

## Decisions Made
- The PRGR-08 layoff-invariance case is two fixture entries built from the identical `shortfallSessions` array, named for the two different real-world gaps they represent — since `RecommendInput` carries no timestamp field of any kind, this is the most literal way to make "elapsed time cannot influence the result" an executable fact rather than an assertion (see `key-decisions` in frontmatter for the full rationale).
- Scenario 3's (PRGR-06) gym profile is a real 60kg barbell with zero plates, not an equipment type with zero achievable loads — `snapToAchievable` treats an *empty* achievable list as "return the target unchanged," never `null`, so reaching the real `no_achievable_weight` branch requires a non-empty achievable list whose only entry is heavier than the computed ideal load.
- Scenario 1 (PRGR-11) deliberately uses `seedProgrammedSession`'s bare, uncatalogued exercise id, which resolves `equipmentType` to `null` and therefore bypasses achievability entirely — the offline-recommendation assertion (heavier than logged) holds unconditionally rather than depending on any seeded gym profile's plate inventory.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The no-history scenario's banner text matched two DOM nodes, not one**
- **Found during:** Task 3, first e2e run of `progression-recommendation.spec.ts`
- **Issue:** `seedWorkoutSession()` seeds two exercises; `ExercisePager` keeps the neighbouring page mounted for swipe, so with no progression history seeded for either exercise, the "No history yet — pick your own starting weight." banner legitimately renders twice, and Playwright's strict-mode `getByText(...).toBeVisible()` failed with a "resolved to 2 elements" error.
- **Fix:** Scoped the locator to `.first()`, matching this suite's own existing convention for pager-adjacent ambiguity (e.g. `workout-screen.spec.ts`'s repeated `.first()`/`.last()` use).
- **Files modified:** `apps/mobile/e2e/progression-recommendation.spec.ts`
- **Verification:** All three scenarios pass; full durability suite re-run green afterward (54/54).
- **Committed in:** `1c13418` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — a locator ambiguity caused by the pager's own existing adjacent-page-mounted behavior, not a defect in the recommendation logic itself)
**Impact on plan:** No scope creep. The underlying recommendation behavior was correct on the first run; only the test's own locator needed narrowing.

## Issues Encountered
- **Pre-existing, out-of-scope environment gap (not caused by this plan):** `apps/api/src/sync/__tests__/progression-preference.spec.ts` (introduced in 08-02) fails to load in this fresh worktree because its import chain (`sync.service.ts` → `drizzle.module.ts`) throws at **module load time** if `DATABASE_URL` is unset — and this worktree has no `.env` (gitignored, not copied into git worktrees; the same class of block already recorded at WINDOWS #47/#48/#132). This is unrelated to `08-06`'s own new file (`parity.spec.ts`), which imports nothing from `sync.service.ts`. Verified directly: `DATABASE_URL="postgres://user:pass@localhost:5432/fitness_test" pnpm --filter api test` (bypassing `turbo`, which strips unpassed-through env vars) runs the entire `apps/api` suite cleanly — **87/87 tests pass, 6/6 suites, including this plan's new `parity.spec.ts`** — confirming the module only needs `DATABASE_URL` to be syntactically present (no live Postgres connection is ever made by this specific test). `npx turbo run test --filter=api ...` and `pnpm -w test` therefore still report `api#test` as failed in this sandboxed worktree; that failure is entirely attributable to the pre-existing #47/#48/#132 gap, not to this plan's changes. No fix attempted — restoring `.env` in this worktree is a human/infra action, out of this plan's scope per the SCOPE BOUNDARY rule.
- **Fresh-worktree bootstrap detail worth recording for future plans:** running Playwright durability specs directly via `npx playwright test` (rather than through the project's own `pnpm --filter mobile test:e2e:durability` script) silently produces `window[DURABILITY_HARNESS_GLOBAL]` as `undefined` in the browser, because `durability-harness-key.ts`'s `DURABILITY_HARNESS_GLOBAL` constant is itself gated on `process.env.EXPO_PUBLIC_DURABILITY_HARNESS === '1'` evaluated in the **Playwright test-runner's own Node process** — separate from the `webServer.env` block in `playwright.config.ts`, which only sets that variable for the spawned Metro/web server. The project's `test:e2e:durability` script already sets `EXPO_PUBLIC_DURABILITY_HARNESS=1` for the runner itself; a bare `npx playwright test` does not. No source change was needed — this was purely a command-invocation gap discovered and resolved during this session (used the correct `pnpm --filter mobile test:e2e:durability` throughout final verification).
- Fresh worktree: `pnpm install` and a workspace build (`@fitness/api-contracts`, `@fitness/plate-math`, `@fitness/pr-rules`, `@fitness/progression-engine`) were required before Task 2's api/mobile suites could resolve `@fitness/progression-engine` from `dist/`, per the plan's own Task 2 precondition. Both completed cleanly; no functional impact.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Success criterion 6 ("the same rule code runs on client and server, so a recommendation can never differ between them") is now proven, not asserted: `PROGRESSION_PARITY_FIXTURES` runs identically in three jest processes, and `apps/api` genuinely imports a `@fitness/*` pure rules package for the first time in this repository's history — the resolution path Phase 10's real server-side reconciliation service will reuse is now established and verified working.
- PRGR-11 (zero-connectivity recommendation at exercise start) is proven end to end in a real browser against a real local database, not merely by construction (D-02/D-03's purity).
- Phase 8 adds no NestJS module, service, controller or endpoint (D-16) — verified by grep gate in this plan's own acceptance criteria; `apps/api/src/app.module.ts` and `apps/api/src/main.ts` are both untouched. Server-side reconciliation remains Phase 10's subject.
- The one determinism gap this proof does not close (Hermes-specific arithmetic divergence, since both parity runners execute under Node/V8) is recorded at `.planning/WINDOWS.md` #154, citing 08-RESEARCH Assumption A4 and this machine's standing absence of Xcode/Android SDK.
- No blockers for Phase 9 (Analytics) or Phase 10 (server-side reconciliation) — this is the last plan of Phase 8.

---
*Phase: 08-progression-engine*
*Completed: 2026-08-29*

## Self-Check: PASSED
All 5 newly created files (`packages/progression-engine/src/__fixtures__/parity.ts`, `packages/progression-engine/src/__tests__/parity.test.ts`, `apps/api/src/progression/__tests__/parity.spec.ts`, `apps/mobile/lib/db/__tests__/progression-parity.test.ts`, `apps/mobile/e2e/progression-recommendation.spec.ts`) confirmed present on disk. All 3 task commit hashes (`aa3773d`, `91651ff`, `1c13418`) confirmed in `git log`.
