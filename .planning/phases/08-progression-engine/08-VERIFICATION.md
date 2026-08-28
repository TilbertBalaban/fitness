---
phase: 08-progression-engine
verified: 2026-08-29T02:15:00Z
status: passed
score: 6/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification_deferred_to: "ROADMAP Phase 999.1 (native) / Phase 999.2 (web visual/interaction)"
human_verification_deferred_at: 2026-08-29
human_verification:
  - test: "On a real iOS/Android build, open Profile and use the progression-preference chip picker (widen rep range vs. match previous weight); open an exercise with logged history and read the RecommendationBanner."
    expected: "The dial reads/writes correctly and the banner renders legibly at default and maximum OS font scale, matching the shipped web behavior."
    why_human: "No Xcode, no Android SDK in this worktree (standing project limitation, ROADMAP Phase 999.1). All functional wiring is proven on web via unit tests and the durability e2e suite; native rendering itself has never been observed."
  - test: "On the web target, visually review the Profile 'Workout settings' ProgressionPreferenceRow chip picker (label, spacing, selected-state styling) and RecommendationBanner's light/dark theming and copy legibility (recommendation line, offered-reduction line, each of the three unavailable-reason strings, the no-history prompt)."
    expected: "Matches this project's established UI conventions; no clipped text, no ambiguous chip-selection state, readable contrast in both themes."
    why_human: "08-02-SUMMARY.md's own coverage entry (D2) flags the dial's visual placement/copy/interaction as a judgement call unit tests confirm wiring for but not on-screen experience; RecommendationBanner's e2e coverage (progression-recommendation.spec.ts) asserts text content and control flow (offline, no-history, unavailable) but not visual styling. Deferred to ROADMAP Phase 999.2, following the same pattern Phase 6/7 verification used for dial/banner visual review."
  - test: "Run the client/server parity fixture (or an equivalent probe) on a real on-device Hermes build, not just Node/V8."
    expected: "PROGRESSION_PARITY_FIXTURES produces byte-identical output under Hermes, closing the one determinism axis this phase's three jest runners cannot reach."
    why_human: "WINDOWS.md #154 (filed 2026-08-28, status: open) already records this honestly: both parity runners execute under Node/V8, never on-device Hermes, and this machine has no Xcode/Android SDK to close it. Deferred to ROADMAP Phase 999.1; not a blocking gap per the project's standing environment-limits policy."
---

# Phase 8: Progression Engine Verification Report

**Phase Goal:** The app tells the user what to lift next, from their own logged history, with no signal. This is the core value promise.
**Verified:** 2026-08-29T02:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User starting an exercise sees a recommended weight and reps computed from their logged history, with the device offline | ✓ VERIFIED | `recommendNextPrescription` (`packages/progression-engine/src/recommend.ts`) is called from a real, non-test call site in `apps/mobile/app/(tabs)/workout.tsx:985`, fed by `recommendationHistoryForSession` — a genuine Drizzle query over `sessionExercise`/`loggedSet`/`workoutSession` (`apps/mobile/lib/db/programs/recommendation-query.ts`), not a static return. The result renders through `RecommendationBanner`, wired into `ExercisePage.tsx:164`. `apps/mobile/e2e/progression-recommendation.spec.ts`'s first case runs in a real browser against a real `@powersync/web` database, sets the browser context offline *after* the page has loaded (no `goto`/`reload` afterward), and asserts a recommendation heavier than what was logged renders. Ran this spec myself via `pnpm --filter mobile test:e2e:durability`: passed (case 23/54, 1.9s). |
| 2 | Progression triggers when performance beats expected performance (rep-range midpoint plus RIR target), and failure sets progress on beating prior reps at the same load | ✓ VERIFIED | `expected-performance.ts`'s `repRangeMidpoint`/`expectedPerformance` compute the midpoint+RIR target; `rir-band.ts`'s `classifyPerformance` (±1 tolerance, D-06) replaces the bare inequality and is the sole comparison point, called from `recommend.ts:68`. `failure-progression.ts`'s `beatsPriorRepsAtSameLoad`/`sameLoad` (exact bigint milli-kg equality, never a float) implement PRGR-03, called from `recommend.ts:56` ahead of the midpoint branch. All reached from the one public entry point — verified by grep, no orphaned exports. Unit suites pass (`recommend.test.ts`, `failure-progression.test.ts`, `rir-band.test.ts`). |
| 3 | User can choose whether the engine widens the rep range first or prefers matching the previous weight, and recommendations always snap to the active gym's real increments | ✓ VERIFIED | D-07's dial: `PROGRESSION_PREFERENCES` (`packages/api-contracts/src/progression.ts`) → `progression_preference` column live on both Postgres and SQLite (proven via `schema-parity.e2e-spec.ts` against a live Postgres) → `loadProgressionPreference`/`setProgressionPreference` → `ProgressionPreferenceRow` on the real Profile screen (`profile.tsx:263`, non-test call site) → `recommendationHistoryForSession` bundles the read → `workout.tsx` state → `recommendNextPrescription`'s required `preference` field → `resolveProgressionStep` (`preference.ts`), the one D-07 branch point. Snapping: every load-raise path calls `idealNextLoadKg`/`snapToAchievable` (`snap.ts`), which calls into `@fitness/plate-math`'s `achievableLoadsForEquipmentType`/`roundToAchievable` (D-04). Unit tests prove the two preferences diverge on an achievable early raise and converge elsewhere. |
| 4 | When no valid recommendation exists within the target rep range, the app says so explicitly instead of inventing a number | ✓ VERIFIED | `UnavailableReason` (`incomplete_prescription` \| `no_achievable_weight` \| `equipment_unavailable`) is a discriminated union member of `ProgressionResult` (D-09), not a null or sentinel. `RecommendationBanner.renderUnavailable` exhaustively switches all three reasons with a `never`-typed exhaustiveness guard — a fourth reason added later is a compile error, not a silently blank banner. `progression-recommendation.spec.ts`'s third case exercises this in a real browser (a real 60kg barbell with zero plates, so `snapToAchievable` genuinely cannot find an achievable load) and asserts the explicit unavailable text renders with no weight figure. Passed (case 25/54). |
| 5 | Missing sessions never produces a reduced recommendation; falling short holds the prescription, and a reduction is only suggested after 2–3 consecutive misses | ✓ VERIFIED | Structural, not just tested: grepped `packages/progression-engine/src` for `Date`, `now(`, `new Date`, `timestamp`, `elapsed`, `daysSince`, `loggedAt`, `startedAt` — zero matches outside comments explaining the absence. `countConsecutiveShortfalls` (`shortfall.ts`) takes only `performances` and `prescription`, no clock input of any kind — the type `RecommendInput.sessions` itself has no timestamp field to filter or weight by, so a layoff cannot even be expressed as an input. `shortfall.test.ts`'s named case builds two identically-shaped histories and asserts identical output; the D-08 parity fixture repeats this at the cross-runtime level with two `ParityCase` entries ("logged three days apart" / "logged three months apart") asserting byte-identical `shortfall_hold` results. `SHORTFALL_STREAK_FOR_REDUCTION_OFFER = 3` (D-05) gates `offeredReductionFor`, which never changes the recommendation's own weight/reps (`recommend.test.ts` proves this explicitly) — the offer is rendered as a visually distinct second line with no accept control. |
| 6 | The same rule code runs on client and server, so a recommendation can never differ between them | ✓ VERIFIED | `PROGRESSION_PARITY_FIXTURES` (`packages/progression-engine/src/__fixtures__/parity.ts`, 15 cases, plain data, no test-framework import) is re-exported from the package's public barrel and genuinely **imported**, not copied, by all three runners: `packages/progression-engine/src/__tests__/parity.test.ts` (`from '../__fixtures__/parity'`), `apps/mobile/lib/db/__tests__/progression-parity.test.ts` (`from '@fitness/progression-engine'`), and `apps/api/src/progression/__tests__/parity.spec.ts` (`from '@fitness/progression-engine'`). Confirmed both `apps/api/node_modules/@fitness/progression-engine` and `apps/mobile/node_modules/@fitness/progression-engine` are symlinks to the identical `packages/progression-engine` directory — not two copies. Confirmed independently (not trusting the SUMMARY) that `apps/api`'s `jest.config.js` `testRegex: '\.spec\.ts$'` matches `parity.spec.ts`, and ran `pnpm --filter api test` myself: `PASS src/progression/__tests__/parity.spec.ts` in the real output, 6/6 suites, 87/87 tests. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/progression-engine/src/*.ts` | Pure rules package, no I/O/clock/network | ✓ VERIFIED | Package fully filled (`PROGRESSION_ENGINE_PLACEHOLDER` no longer exists anywhere in the repo); `recommend.ts` composes all sub-modules; no Date/Intl/toFixed/locale calls; one explicit, deterministic tie-break `.sort()` with a documented cross-engine rationale. |
| `apps/mobile/components/RecommendationBanner.tsx` | Exhaustive three-branch render | ✓ VERIFIED | Hook-free, props-driven, exhaustive switch with `never` guards on both `ProgressionResult.kind` and `UnavailableReason`. Wired into `ExercisePage.tsx`. |
| `apps/mobile/lib/db/programs/recommendation-query.ts` | Batched, bounded prior-session read | ✓ VERIFIED | Four flat selects, `RECENT_SESSION_WINDOW = 10`, no per-exercise query-in-a-loop, no wall-clock filter. |
| `packages/api-contracts/src/progression.ts` | D-07 wire vocabulary | ✓ VERIFIED | `PROGRESSION_PREFERENCES`/`ProgressionPreference`/`DEFAULT_PROGRESSION_PREFERENCE`/`isProgressionPreference`, tested, consumed by both schemas. |
| `apps/api/src/progression/__tests__/parity.spec.ts` | api-side D-08 proof, no NestJS wiring | ✓ VERIFIED | Plain spec importing the package directly; grep for `@nestjs/`, `@Injectable`, `@Controller`, `@Module` across `apps/api/src/progression` returns nothing; `apps/api/src/app.module.ts` and `main.ts` last touched in Phase 3 and Phase 1 respectively (git log), untouched by Phase 8. |
| `apps/mobile/e2e/progression-recommendation.spec.ts` | Real-browser offline proof | ✓ VERIFIED | Three scenarios (recommendation/no-history/unavailable), all passing in a real `@powersync/web` browser run I executed myself. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `workout.tsx` | `recommendNextPrescription` | direct call, memoised per exercise | ✓ WIRED | `workout.tsx:985`, real non-test call site, dependency array includes `progressionPreference`. |
| `workout.tsx` | `recommendationHistoryForSession` | DB read on session load | ✓ WIRED | `workout.tsx:866`, real Drizzle query, not a stub. |
| `ExercisePage.tsx` | `RecommendationBanner` | render prop | ✓ WIRED | `ExercisePage.tsx:164`. |
| `profile.tsx` | `loadProgressionPreference`/`setProgressionPreference` | read on focus, write on chip select | ✓ WIRED | `profile.tsx:167,205`, real getter/setter pair against `user_preference.progression_preference`. |
| `recommend.ts` | `resolveProgressionStep` / `classifyPerformance` / `beatsPriorRepsAtSameLoad` / `foldPerSidePair` (via `normalizeHistory`) / `countConsecutiveShortfalls` / `offeredReductionFor` | direct calls | ✓ WIRED | All confirmed by grep — every engine sub-function has exactly one production call site inside `recommend.ts` (or `normalize-history.ts` for `foldPerSidePair`), none orphaned. |
| `apps/api`, `apps/mobile` | `packages/progression-engine` | workspace symlink | ✓ WIRED | Both `node_modules/@fitness/progression-engine` entries are symlinks to the same directory — confirmed identical, not divergent copies. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `RecommendationBanner` | `result` prop | `recommendationBySessionExerciseId` memo ← `recommendNextPrescription` ← `recommendationHistory` state ← `recommendationHistoryForSession` ← live SQLite query | Yes | ✓ FLOWING |
| `ProgressionPreferenceRow` | `value` prop | `progressionPreference` state ← `loadProgressionPreference` ← live SQLite query | Yes | ✓ FLOWING |
| `RecommendationBanner`'s offered-reduction line | `result.offeredReduction` | `offeredReductionFor` ← `countConsecutiveShortfalls` over real normalized history | Yes | ✓ FLOWING |

### Behavioral Spot-Checks / Command Evidence (executed by verifier, not taken from SUMMARY)

| Command | Result | Status |
|---------|--------|--------|
| `npx turbo run typecheck lint --force` | 12/12 tasks successful | ✓ PASS |
| `pnpm -w test` | 10/10 packages: api-contracts 158/158, plate-math 74/74, pr-rules 52/52, progression-engine 107/107 (9 suites), api 87/87 (6 suites, including `PASS src/progression/__tests__/parity.spec.ts`), mobile 1770/1770 (95 suites) | ✓ PASS |
| `cd apps/api && pnpm test:e2e` | 22/22 suites, 269/269 tests, against live Postgres | ✓ PASS |
| `pnpm --filter mobile test:e2e:durability` | 54/54 passed (grown from 51 — includes 3 new `progression-recommendation.spec.ts` cases at positions 23-25) | ✓ PASS |

No `DATABASE_URL` workaround was needed in this main-tree run — the environment note about isolated worktrees (WINDOWS #47/#48/#132) did not manifest here.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PRGR-01 | 08-01 | Weight/reps computed from logged history | ✓ SATISFIED | `recommendNextPrescription`, real call site, real DB read |
| PRGR-02 | 08-01 | Trigger on beating rep-midpoint + RIR | ✓ SATISFIED | `expected-performance.ts`, `rir-band.ts` |
| PRGR-03 | 08-03 | Failure sets progress on beating prior reps at same load | ✓ SATISFIED | `failure-progression.ts` |
| PRGR-04 | 08-02, 08-05 | Preference: widen rep range vs. match weight | ✓ SATISFIED | `preference.ts`, Profile dial, sync column |
| PRGR-05 | 08-01 | Snap to gym's real increments | ✓ SATISFIED | `snap.ts` → `@fitness/plate-math` |
| PRGR-06 | 08-01 | Explicit "unavailable" state | ✓ SATISFIED | `UnavailableReason` union, e2e proof |
| PRGR-07 | 08-01 | No-history state, user picks own weight | ✓ SATISFIED | `no_history` union member, e2e proof |
| PRGR-08 | 08-04 | Never reduced as consequence of missing sessions | ✓ SATISFIED | Clockless `countConsecutiveShortfalls`, structural + fixture proof |
| PRGR-09 | 08-04 | Reduction offered only after 2-3 consecutive shortfalls | ✓ SATISFIED | `SHORTFALL_STREAK_FOR_REDUCTION_OFFER = 3`, offer never auto-applied |
| PRGR-10 | 08-04 | RIR tolerance bands | ✓ SATISFIED | `RIR_TOLERANCE_BAND = 1`, `classifyPerformance` |
| PRGR-11 | 08-06 | Zero-connectivity recommendation at exercise start | ✓ SATISFIED | Real-browser offline e2e proof |

No orphaned requirements: all 11 PRGR-* requirements mapped to this phase in REQUIREMENTS.md appear in at least one plan's `requirements-completed`.

### Anti-Patterns Found

None. Grepped every file this phase created or modified in `packages/progression-engine`, the mobile app, and `apps/api` for `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, `PLACEHOLDER`, and empty-implementation patterns — zero matches. `PROGRESSION_ENGINE_PLACEHOLDER` (the pre-Phase-8 stub export) is gone from the entire repository.

### Honesty Requirement (D-05/D-06)

Grepped `packages/progression-engine/src`, `RecommendationBanner.tsx`, and `profile.tsx` for `MacroFactor`, `Renaissance Periodization`/`RP`, `Stronger By Science`/`SBS` — zero matches. Both `SHORTFALL_STREAK_FOR_REDUCTION_OFFER` (D-05) and `RIR_TOLERANCE_BAND` (D-06) carry adjacent comments stating plainly that no public source specifies either value and that the closest published autoregulation model operates on a different axis. No user-facing string in `RecommendationBanner` attributes copy to any source, coach, or published method. This claim is independently confirmed, not taken on the SUMMARY's word.

### Determinism

No `Date`, `Intl`, `toFixed`, `toLocaleString`, or `Math.random` anywhere in `packages/progression-engine/src` (production files). The one `.sort()` call (`normalize-history.ts`'s `pickTopSet`) uses bigint milli-kg comparison with an explicit, documented tie-break (weight desc, reps desc, id asc) specifically to avoid engine-dependent stable-sort behavior on ties. WINDOWS.md #154 (status: `open`) honestly records that all three parity runners execute under Node/V8, never on-device Hermes, and that this machine has no Xcode/Android SDK to close that gap — judged as a correctly-filed environment limitation, not a gap that undermines success criterion 6, since (a) the shared-code architecture is what criterion 6 actually requires and is proven, and (b) the arithmetic is bigint-based with no floating-point or locale-dependent operation that would plausibly diverge under Hermes. Deferred to ROADMAP Phase 999.1 per project policy.

### Human Verification Required (deferred, non-blocking)

All items below are deferred per the project's standing human-verification policy (native → 999.1, web visual/interaction → 999.2). None block this phase — see frontmatter `human_verification` for the full entries.

1. **Native rendering of the Profile dial and RecommendationBanner** (iOS/Android) — deferred to ROADMAP Phase 999.1 (no Xcode/Android SDK in this environment).
2. **Web visual review of `ProgressionPreferenceRow` and `RecommendationBanner`** (light/dark theming, copy legibility) — deferred to ROADMAP Phase 999.2, following the same pattern used in Phase 6/7 verification.
3. **On-device Hermes parity run** — deferred to ROADMAP Phase 999.1; already honestly filed at WINDOWS #154.

### Gaps Summary

None. All six ROADMAP success criteria are verified with direct evidence (real call sites, real DB queries, real cross-runtime test execution, commands I ran myself rather than trusting SUMMARY claims). All 11 PRGR-* requirements are satisfied. No stub, orphaned export, or unwired capability was found. The one honesty-sensitive area (D-05/D-06's unsourced constants) is handled correctly in both code comments and user-facing copy. The one determinism gap (Hermes never exercised) is filed honestly at WINDOWS #154 and deferred per environment-limits policy, not glossed over.

---

*Verified: 2026-08-29T02:15:00Z*
*Verifier: Claude (gsd-verifier)*
