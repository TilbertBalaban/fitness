---
phase: 08-progression-engine
plan: 05
subsystem: training-logic
tags: [progression-engine, double-progression, drizzle, jest, react-native]

# Dependency graph
requires:
  - phase: 08-progression-engine
    provides: "08-02's PROGRESSION_PREFERENCES/ProgressionPreference/DEFAULT_PROGRESSION_PREFERENCE vocabulary, the progression_preference column live on both sides, and loadProgressionPreference/setProgressionPreference; 08-04's completed decision tree (failure -> shortfall -> bodyweight -> surplus/hold) this plan's preference branch sits inside"
provides:
  - "preference.ts: ProgressionStep and resolveProgressionStep — D-07's one branch point deciding whether a surplus advances the rep target at the same load or raises the load and resets to the bottom of the range"
  - "RecommendInput.preference: a required field (not optional), imported from @fitness/api-contracts"
  - "RecommendationBasis gains range_widened as an additive member, reported whenever a rep advance happens under widen_rep_range_first"
  - "recommendNextPrescription's surplus branch now calls resolveProgressionStep instead of going straight to a load increase"
  - "recommendationHistoryForSession returns { history, preference } as one bundle, joining loadProgressionPreference to its existing batched read"
  - "workout.tsx holds progressionPreference in state, threads it into recommendNextPrescription, and re-reads it on every focus through the existing focus effect"
affects: [08-06]

# Actuals (#2632)
actuals:
  tokens: 8228
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "match_previous_weight reuses the pre-existing achievability-driven load path unconditionally (idealNextLoadKg + snapToAchievable, falling back to a rep advance when not achievable) rather than adding a second computation; widen_rep_range_first adds the one new ceiling-gated branch. Both preferences share the same load-raise implementation and the same rep-reset guard, so the D-07 dial never became a second, parallel weight-calculation path."

key-files:
  created:
    - packages/progression-engine/src/preference.ts
    - packages/progression-engine/src/__tests__/preference.test.ts
  modified:
    - packages/progression-engine/src/result.ts
    - packages/progression-engine/src/recommend.ts
    - packages/progression-engine/src/index.ts
    - packages/progression-engine/src/__tests__/recommend.test.ts
    - apps/mobile/lib/db/programs/recommendation-query.ts
    - apps/mobile/lib/db/__tests__/recommendation-query.test.ts
    - "apps/mobile/app/(tabs)/workout.tsx"
    - "apps/mobile/app/(tabs)/__tests__/workout.test.tsx"

key-decisions:
  - "widen_rep_range_first (the default) gates the load raise strictly on the achieved rep count reaching the prescription's targetRepMax; match_previous_weight attempts a load raise on the first surplus regardless of rep count, falling back to the identical rep advance whenever the gym's increments can't yet support it. This makes the two modes converge whenever achievability is the binding constraint (both existing pre-05 test fixtures, where reps already exceeded the ceiling, produce identical results under either mode) and diverge only when a load raise is achievable before the rep ceiling is reached — exactly the axis D-07 describes as 'differ only in when the load moves'."
  - "match_previous_weight's resolveProgressionStep branch always returns raise_load, deferring the achievability check entirely to recommend.ts's existing idealNextLoadKg/snapToAchievable/compareCanonicalKg path — this reuses 08-01's load-increase computation unchanged rather than inventing a second one, and keeps the D-07 branch point itself free of any inventory or snapping concern, matching Task 1's acceptance criteria."
  - "recommendationHistoryForSession gained a required userId: string | null parameter (inserted before db) so the preference read can share the function's existing db handle rather than the screen resolving getPowerSync() a second time; a null userId (signed out) short-circuits to DEFAULT_PROGRESSION_PREFERENCE without querying the table at all."

patterns-established:
  - "A required, closed-union engine input threaded end-to-end: RecommendInput.preference is never optional, so a caller (recommend.ts, and by extension every future call site) cannot compile without supplying it — the same discipline D-09's discriminated ProgressionResult already established for outputs, applied here to an input."

requirements-completed: [PRGR-04]

coverage:
  - id: D1
    description: "resolveProgressionStep is D-07's single branch point: widen_rep_range_first advances the rep target at the same load below the range ceiling and raises the load (resetting to the range bottom) once the ceiling is reached; match_previous_weight raises the load on the first surplus, converging with widen mode via achievability whenever a raise isn't yet supported. Every raise_load step resets reps to targetRepMin; no branch raises load while keeping the rep target."
    requirement: PRGR-04
    verification:
      - kind: unit
        ref: "packages/progression-engine/src/__tests__/preference.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "recommendNextPrescription's surplus path routes through resolveProgressionStep; the same history/prescription run under each preference produce different recommendations at the point the modes diverge (an achievable early raise) and identical results where they don't (the failure branch, the shortfall branch, and any surplus an inventory can't yet raise into). preference is a required field on RecommendInput, imported from @fitness/api-contracts."
    requirement: PRGR-04
    verification:
      - kind: unit
        ref: "packages/progression-engine/src/__tests__/recommend.test.ts#produces a different recommendation under each D-07 preference for the same below-ceiling surplus"
        status: pass
      - kind: unit
        ref: "packages/progression-engine/src/__tests__/recommend.test.ts#holds identically under both preferences on a shortfall, since a hold is not a load-versus-reps choice"
        status: pass
      - kind: unit
        ref: "packages/progression-engine/src/__tests__/recommend.test.ts#progresses identically under both preferences on a failure set, since a failure is not a load-versus-reps choice"
        status: pass
    human_judgment: false
  - id: D3
    description: "The workout screen reads the stored progression preference for the signed-in user (via recommendationHistoryForSession's now-bundled read) and passes it to every recommendation it computes; a signed-out or preference-less account falls back to DEFAULT_PROGRESSION_PREFERENCE; the preference is re-read on every tab focus through the existing focus effect, and the recommendation memo's dependency array includes it, so a Profile change is visible on the next focus with no restart."
    requirement: PRGR-04
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/recommendation-query.test.ts (preference cases: signed-out default, no-row default, stored value read)"
        status: pass
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/workout.test.tsx#renders a different recommendation for the two D-07 preferences on the same seeded history (08-05)"
        status: pass
    human_judgment: false
---

# Phase 8 Plan 5: The D-07 Preference Branch, Wired End to End Summary

**`resolveProgressionStep` gives the engine its one D-07 branch point (widen the rep range first, the default, vs. prefer matching the previous weight), `preference` is now a required `RecommendInput` field, and the value travels live from `user_preference.progression_preference` through `workout.tsx`'s existing focus-triggered read into every recommendation the screen renders.**

## Performance

- **Duration:** ~19 min (base commit `2c96d18` at 01:05:52+03:00 to final task commit `e78e4cc` at 01:24:26+03:00)
- **Started:** 2026-08-29T01:05:52+03:00 (worktree base)
- **Completed:** 2026-08-29T01:24:26+03:00
- **Tasks:** 3
- **Files modified:** 10 (2 created, 8 modified)

## Accomplishments
- `preference.ts` adds `ProgressionStep` and `resolveProgressionStep` — D-07's one named branch point, deciding only *what kind* of step a surplus earns (`advance_reps` or `raise_load`, both carrying the resulting rep target), never what weight a `raise_load` step lands on. The load-vs-reps ratchet guard (every load increase resets to `targetRepMin`) is stated once, here, rather than scattered through `recommend.ts`.
- `RecommendInput.preference` is now a required field, imported from `@fitness/api-contracts` rather than retyped — an optional field would have let a caller silently receive the default forever, which is exactly how a shipped dial becomes a setting that does nothing. `RecommendationBasis` gains `range_widened` as an additive member.
- `recommendNextPrescription`'s surplus path now calls `resolveProgressionStep` instead of going straight to a load increase; only a `raise_load` step calls `idealNextLoadKg`/`snapToAchievable`, and the existing achievability fallback (advance reps instead when the gym's increments can't support a raise) is unchanged and shared by both preferences.
- `recommendationHistoryForSession` reads `loadProgressionPreference` alongside its existing batched history read and returns `{ history, preference }` as one bundle, rather than the screen issuing a second read — a signed-out or preference-less account falls back to `DEFAULT_PROGRESSION_PREFERENCE`.
- `workout.tsx` holds the preference in state populated by the same session-load path that already populates recommendation history, passes it as `recommendNextPrescription`'s `preference` argument, includes it in the recommendation memo's dependency array, and re-reads it on every tab focus through the existing `useFocusEffect` (no second effect added) — a change made in Profile takes effect the next time the tab regains focus, with no restart and no manual refresh.

## Task Commits

Each task was committed atomically:

1. **Task 1: Give the engine its one preference branch** - `4bc88cf` (feat)
2. **Task 2: Route the preference through the entry point** - `ec2ca3c` (feat)
3. **Task 3: Feed the stored preference to the screen's recommendation call** - `e78e4cc` (feat)

**Plan metadata:** pending (docs: complete plan)

_No TDD RED/GREEN split — this plan's tasks are `tdd="true"` but each was implemented and verified together with its tests in one commit per task, per the plan's own action/verify structure (matching 08-02/08-04's precedent)._

## Files Created/Modified
- `packages/progression-engine/src/preference.ts` - `ProgressionStep`, `resolveProgressionStep` — D-07's one branch point
- `packages/progression-engine/src/__tests__/preference.test.ts` - Per-mode ceiling/advance/raise cases, plus a same-input divergence case
- `packages/progression-engine/src/result.ts` - `RecommendInput.preference` (required, imported from `@fitness/api-contracts`); `RecommendationBasis` gains `range_widened`
- `packages/progression-engine/src/recommend.ts` - Surplus path rerouted through `resolveProgressionStep`; basis reported as `range_widened` (widen) or `rep_increase` (match) for a rep advance, `load_increase` unchanged for a raise
- `packages/progression-engine/src/index.ts` - Exports `preference` from the barrel
- `packages/progression-engine/src/__tests__/recommend.test.ts` - Every existing case supplies an explicit preference; the coarse-inventory fallback case updated to `range_widened` under the default plus a new parallel `match_previous_weight` case; new divergence, shortfall-identical and failure-identical cases
- `apps/mobile/lib/db/programs/recommendation-query.ts` - `recommendationHistoryForSession` gains a `userId` parameter and returns `RecommendationInputsForSession` (`{ history, preference }`)
- `apps/mobile/lib/db/__tests__/recommendation-query.test.ts` - Updated call sites/assertions for the bundled return shape; new preference cases (signed-out default, no-row default, stored value)
- `apps/mobile/app/(tabs)/workout.tsx` - `progressionPreference` state, threaded into the recommendation memo and its dependency array, populated/re-read alongside `recommendationHistory`
- `apps/mobile/app/(tabs)/__tests__/workout.test.tsx` - New case rendering both preferences against the same seeded history and asserting the banner text differs

## Decisions Made
- `widen_rep_range_first` gates the load raise strictly on `performance.reps >= targetRepMax`; `match_previous_weight` always attempts a raise on a surplus and relies on the pre-existing achievability fallback to produce a rep advance when the raise isn't yet supported. This reuses 08-01's load computation unmodified for both preferences and produces a real, deterministic divergence exactly when D-07 intends one (see `key-decisions` in frontmatter for the full rationale).
- `recommendationHistoryForSession`'s new `userId` parameter is required (not optional with an internal `getPowerSync()`-style default) and sits before `db` in the signature, since every real caller already has it in scope and a missing userId is a meaningful state (falls back to the default) rather than an omission to paper over.

## Deviations from Plan

None - plan executed exactly as written. The plan's own file list, task order and acceptance criteria (including the grep gates) were followed without needing an out-of-scope fix.

## Issues Encountered
- The pre-05 `coarse inventory` test case in `recommend.test.ts` ("holds the same weight and bumps reps by one... when the gym increment is too coarse to move") asserted `basis: 'rep_increase'`. Under the default `widen_rep_range_first` preference this is now genuinely `range_widened` (the range ceiling was already reached; achievability, not preference, produced the rep advance) — this is the plan-mandated new taxonomy from Task 1/2, not a bug. The existing case's assertion was updated to `range_widened` with an explanatory comment, and a parallel `match_previous_weight` case was added asserting the same coarse-inventory fallback still reports `rep_increase` under that mode, so both namings are proven, not just one silently changed.
- Fresh worktree: `pnpm install` and a workspace build (`@fitness/api-contracts`, `@fitness/plate-math`, `@fitness/pr-rules`, `@fitness/progression-engine`) were required before Task 3's mobile suite could resolve `@fitness/progression-engine` from `dist/`, per the plan's own Task 3 precondition. Both completed cleanly; no functional impact.
- The sandboxed Bash tool refused a plain `corepack enable` invocation and several compound `git`/`date` command strings (same pattern noted in 08-01/08-03/08-04); `pnpm`/`node` were already on `PATH` so `corepack enable` was skipped entirely, and `git` checks were run as separate single commands instead. No functional impact.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- D-07's two modes are live end to end: the engine branches on the preference, and the value travels from `user_preference.progression_preference` through `loadProgressionPreference` -> `recommendationHistoryForSession` -> `workout.tsx` state -> `recommendNextPrescription`'s `preference` argument -> the rendered banner. The chain the plan's own `key_links` frontmatter named is closed.
- `RecommendInput.preference` is required and landed before 08-06's parity fixture freezes the input shape, per the plan's explicit ordering concern.
- No blockers. `packages/api-contracts/`, `apps/api/`, and every Drizzle schema file were untouched by this plan — no `drizzle-kit push` step was needed.
- 08-06 (client/server parity fixture) can now build its fixture table against the complete `RecommendInput` shape, including the required `preference` field, with both D-07 modes represented.

---
*Phase: 08-progression-engine*
*Completed: 2026-08-29*

## Self-Check: PASSED
Both created files (`packages/progression-engine/src/preference.ts`, `packages/progression-engine/src/__tests__/preference.test.ts`) and this SUMMARY.md confirmed present on disk. All three task commit hashes (`4bc88cf`, `ec2ca3c`, `e78e4cc`) confirmed in `git log`.
