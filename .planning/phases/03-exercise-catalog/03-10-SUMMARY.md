---
phase: 03-exercise-catalog
plan: 10
subsystem: ui
tags: [react-native, drizzle, deterministic-scoring, exercise-catalog, offline-first]

requires:
  - phase: 03-exercise-catalog
    provides: "03-07's exercise detail screen and its 'Suggested Alternatives' shell; 03-09's preferences.ts (never_suggest/archived state) and catalog-filter.ts's buildArchivedSet predicate; 03-04's muscle-taxonomy weight_factor data"
provides:
  - "apps/mobile/lib/catalog/smart-swap.ts -- scoreAlternatives(target, candidates, mappings, preferences, userId, constraints), a pure deterministic scorer with a total order, plus explainMatch, SWAP_SCORE_THRESHOLD, SWAP_RESULT_CAP"
  - "apps/mobile/components/SwapSuggestionList.tsx -- the capped, ranked, explained suggestion list with its own empty state"
  - "app/exercises/[id].tsx wired end to end: loads the full candidate set (seeded + custom exercises, all mappings, all preference rows) in three whole-table queries and renders real suggestions in place of the 03-07 shell"
affects: [Phase 6 program generator (a future swap-in-a-workout flow can reuse scoreAlternatives directly), Phase 7 gym profiles (SwapConstraints.excludeEquipment/allowEquipment is the seam machine_availability will feed)]

actuals:
  tokens: 6300
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Deterministic weighted scoring instead of a similarity/embedding model: every signal (muscle overlap, movement-pattern match, equipment match, variation sibling) is a fixed, reviewable constant, chosen specifically because PROJECT.md rules out AI/ML project-wide and because the UI's mandatory 'why' string must be derivable from the actual winning signal, not decoded out of a black box."
    - "Bonus, never a filter: variation_of_id sibling status and equipment match both add score but never gate candidacy on their own -- pinned by a dedicated test (lat pulldown vs. pull-up, zero shared variation_of_id) and a mutation check (turning the bonus into a filter reddens exactly that test)."
    - "Cross-module predicate reuse over a second implementation: catalog-filter.ts's buildArchivedSet is now exported and imported directly by smart-swap.ts, rather than re-deriving the archive exclusion set a second way (PITFALLS.md §11's 'one archive code path' rule, applied across files, not just within one)."

key-files:
  created:
    - apps/mobile/lib/catalog/smart-swap.ts
    - apps/mobile/lib/catalog/__tests__/smart-swap.test.ts
    - apps/mobile/components/SwapSuggestionList.tsx
    - apps/mobile/components/__tests__/SwapSuggestionList.test.tsx
  modified:
    - apps/mobile/app/exercises/[id].tsx
    - apps/mobile/lib/catalog/catalog-filter.ts
    - .planning/WINDOWS.md

key-decisions:
  - "scoreAlternatives takes userId as an explicit fifth positional parameter, not folded into SwapConstraints as the plan's action text's literal five-argument signature implied. The plan's own threat model (T-03-40) requires the scorer to 'take the current userId explicitly and match preference rows on it' and a <behavior> test requires another user's never_suggest flag to never suppress a candidate for this user -- neither is expressible if userId is baked into a caller-pre-filtered preferences array instead of matched inside the function. Resolved the plan's own internal tension (five-arg action text vs. explicit-userId threat model) in favor of the security-critical threat model requirement."
  - "A null movement_pattern on either side scores neutral, never negative, and is never treated as an exclusion (per the plan's own wording, and per upstream_state's explicit instruction to decide deliberately about the 205 seeded rows with a null movement_pattern). Those 205 rows lose only the movement-pattern signal's contribution -- they remain fully eligible as suggestion targets and candidates via muscle overlap, equipment match, or variation sibling. No row is silently excluded from smart-swap for having a null movement_pattern."
  - "SwapSuggestionList owns its entire section, including its own header text (the pluralized '{n} suggested alternative(s)' or the empty-state heading) -- the 03-07 shell's static 'Suggested Alternatives' label was removed rather than kept as a second, redundant heading above the dynamic one, since the plan's own Task 2 text describes the pluralized count as the section header, not a caption underneath a fixed title."
  - "The candidate thumbnail is resolved via getLocalCatalogImage(candidate.id) (the vendored local image map, 03-07/WINDOWS #36), never from any imageUrls field on the scored candidate -- ScoredCandidate carries no image data at all, preserving the offline/no-remote-fetch guarantee the detail screen's own image rendering already established and avoiding a second image-resolution code path."

patterns-established:
  - "A scoring module's every weight is a named, reviewable module-level constant (MOVEMENT_PATTERN_BONUS, EQUIPMENT_MATCH_BONUS, VARIATION_SIBLING_BONUS) with SWAP_SCORE_THRESHOLD deliberately set above the sum of every non-muscle, non-pattern bonus -- so a candidate can never qualify on equipment/variation bonuses alone, which is also what keeps explainMatch's 'why' derivation always attributable to a real dominant signal."

requirements-completed: [EXER-10]

coverage:
  - id: D1
    description: "scoreAlternatives is a pure function (no db, no React, no Date.now(), no module-level mutable state) producing a total order (score desc, name asc, id asc); shuffled candidate input and Promise.all-interleaved calls for two different targets produce identical results to sequential calls"
    requirement: EXER-10
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/smart-swap.test.ts -- 'caps results at SWAP_RESULT_CAP...', 'does not mutate its target or candidates arguments', 'returns the same results whether two calls run sequentially or interleaved via Promise.all' -- 20/20 passing"
        status: pass
    human_judgment: false
  - id: D2
    description: "Weighted muscle overlap dominates (primary-primary > primary-secondary > secondary-secondary), movement_pattern match is a strong secondary signal with null-on-either-side scored neutral, equipment match and variation_of_id sibling are bonuses that never become filters (pinned by a mutation check, not just a passing test)"
    requirement: EXER-10
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/smart-swap.test.ts -- muscle/movement/equipment/variation-bonus describe cases, 20/20 passing"
        status: pass
    human_judgment: false
  - id: D3
    description: "The target itself, any exercise the current user archived or marked never_suggest (via 03-09's preferences.ts write path), and every candidate an excludeEquipment/allowEquipment constraint forbids are all excluded; another user's never_suggest flag never suppresses a candidate for this user"
    requirement: EXER-10
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/smart-swap.test.ts -- exclusion describe cases including \"does not let another user's never_suggest flag suppress...\", 20/20 passing"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every returned candidate carries a non-empty, plain-language why string naming the actual winning signal (shared muscle, movement pattern, or variation sibling) and never a numeric score"
    requirement: EXER-10
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/smart-swap.test.ts -- explainMatch describe block plus the 'every returned candidate carries a non-empty why string...' scorer test, 20/20 passing"
        status: pass
    human_judgment: false
  - id: D5
    description: "SwapSuggestionList renders the exact empty-state copy (heading, body, Browse Catalog link) for zero candidates; the pluralized '{n} suggested alternative(s)' header otherwise; caps at SWAP_RESULT_CAP even when given more; drops any row whose why string is blank; truncates name to one line and why to two"
    requirement: EXER-10
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/SwapSuggestionList.test.tsx -- 7/7 passing (direct-invocation technique, no renderer)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The detail screen loads its full candidate set (seeded + custom exercises, all mappings, all preference rows) via three whole-table queries -- never a per-candidate lookup -- and calls scoreAlternatives with no fabricated equipment constraint; the whole app typechecks and builds for web with the real wiring in place"
    verification:
      - kind: other
        ref: "pnpm --filter mobile typecheck (exit 0); pnpm --filter mobile build (expo export --platform web, exit 0, 24 static routes including /exercises/[id])"
        status: pass
    human_judgment: false
  - id: D7
    description: "The suggestion list actually paints correctly (thumbnail, name, why, empty state) in a real browser, simulator, or device"
    verification: []
    human_judgment: true
    rationale: "Not observed in this session -- no simulator/device on this machine, and CLAUDE.md's global rule against launching a browser unless explicitly asked takes precedence. Verified instead at the unit/component (direct-invocation) and bundler level. Recorded as WINDOWS #46 (unrun-verify), consistent with this phase's standing pattern (#33/34/37/38/39/41)."

duration: "~45 min (dependency install + upstream-state/file reading, then three commits spanning 2026-08-18T23:15:40+03:00-23:23:xx+03:00)"
completed: 2026-08-18
status: complete
---

# Phase 3 Plan 10: Smart Swap -- Deterministic Alternative Exercise Suggestions Summary

**A pure, deterministic weighted scorer (`scoreAlternatives` + `explainMatch`) ranking up to five alternative exercises by muscle overlap, movement pattern, equipment match and variation-sibling bonus -- each with a mandatory plain-language "why" -- wired into the exercise detail screen's `Suggested Alternatives` section in place of the 03-07 shell, honoring per-user archive/never-suggest state and leaving an equipment-constraint seam for Phase 7's gym profiles.**

## Performance

- **Duration:** ~45 min (dependency install + reading five upstream SUMMARYs/plans plus current-code context, then three commits spanning 2026-08-18T23:15:40+03:00 to ~23:23+03:00)
- **Completed:** 2026-08-18
- **Tasks:** 2 (both plan tasks)
- **Files modified:** 4 created, 3 modified (7 files total across three commits)

## Accomplishments

- **`smart-swap.ts`** -- `scoreAlternatives(target, candidates, mappings, preferences, userId, constraints?)` returns a capped, totally-ordered `ScoredCandidate[]`. Muscle overlap (weighted by `weight_factor` and role combination: primary-primary > primary-secondary > secondary-secondary) is the dominant signal; movement-pattern match is a strong secondary bonus with a null pattern on either side scoring neutral, never negative or exclusionary; equipment match and `variation_of_id` sibling status are both bonuses, never filters, pinned by mutation checks (see Deviations). `SWAP_SCORE_THRESHOLD` is set above the combined value of every non-muscle, non-pattern bonus, so a candidate can never qualify on equipment/variation alone -- which is also what guarantees `explainMatch`'s "why" is always attributable to a real dominant signal, never a synthetic fallback.
- **`explainMatch`** compares each signal's actual point contribution (not just presence) to name the true winning category -- "Same primary muscle: {muscle}", "Same movement pattern: {pattern}", or "A variation of the same movement" -- and never surfaces a numeric score.
- **Exclusions**: the target itself, any exercise the current user archived or marked never-suggest (read from `user_exercise_preference` via 03-09's write path, with the archive predicate reused directly from `catalog-filter.ts`'s now-exported `buildArchivedSet` rather than re-implemented), and any candidate an `excludeEquipment`/`allowEquipment` constraint forbids.
- **`SwapSuggestionList.tsx`** renders the capped, ranked list as a plain mapped view (no nested `FlashList`/`ScrollView`) -- each row a 4:3 thumbnail via `getLocalCatalogImage` (never `image_urls`), name at `numberOfLines={1}`, why at `numberOfLines={2}`; a row with a blank why is dropped rather than rendered. Zero visible candidates renders the exact Copywriting Contract empty state with a `Browse Catalog` link.
- **`app/exercises/[id].tsx`** now loads the full candidate set -- seeded + custom exercises, all muscle mappings, all preference rows -- via three whole-table queries (never a per-candidate lookup, matching `apps/mobile/app/exercises/index.tsx`'s established `loadCatalogRows` shape) and calls `scoreAlternatives` with no equipment constraint, leaving that parameter as the documented seam for Phase 7's `equipment_profile.machine_availability`.
- **The 205 seeded rows with a null `movement_pattern` (upstream_state's flagged gap)** are handled deliberately, not silently: they simply never receive the movement-pattern bonus/signal, but remain fully eligible via muscle overlap, equipment match, or variation sibling -- no exercise is excluded from smart-swap for having a null pattern.
- **WINDOWS #45 resolved.** 03-08 and 03-09 (the cross-plan integration gap #45 tracked) are both merged into this plan's base; `pnpm --filter mobile typecheck`/`build` both pass with zero errors including the `duplicateExercise` import, directly confirming the two plans' work integrates.

## Task Commits

1. **Task 1: The deterministic scorer and its explanation** -- `d2df597` (feat)
2. **Task 2: The suggestion list on the detail screen** -- `87bfc32` (feat)
3. **WINDOWS ledger update** -- `6aac962` (docs) -- resolves #45, records #46/#47

**Plan metadata:** this SUMMARY.md commit (docs).

## Files Created/Modified

- `apps/mobile/lib/catalog/smart-swap.ts` -- `scoreAlternatives`, `explainMatch`, `SWAP_SCORE_THRESHOLD`, `SWAP_RESULT_CAP`, `SwapExercise`, `SwapMuscleMapping`, `SwapPreference`, `SwapConstraints`, `ScoredCandidate`, `SwapSignal`
- `apps/mobile/lib/catalog/__tests__/smart-swap.test.ts` -- 20 tests (muscle/pattern/equipment/variation ranking, exclusions, constraints, numeric weight_factor parsing, threshold/cap/order, purity, concurrency, explainMatch)
- `apps/mobile/components/SwapSuggestionList.tsx` -- the ranked list + empty state
- `apps/mobile/components/__tests__/SwapSuggestionList.test.tsx` -- 7 tests, direct-invocation technique (no renderer, matching 03-07/03-09's established approach)
- `apps/mobile/app/exercises/[id].tsx` -- candidate-loading queries (`loadSwapCandidates`, `loadOwnerAndVariation` replacing the narrower `loadOwnerId`), scoring call, and the shell replaced by `<SwapSuggestionList>`
- `apps/mobile/lib/catalog/catalog-filter.ts` -- `buildArchivedSet` exported (was module-private) so smart-swap.ts reuses it rather than a second implementation
- `.planning/WINDOWS.md` -- resolves #45, records #46 and #47

## Decisions Made

See `key-decisions` in frontmatter. Summary:
- `userId` is an explicit fifth parameter to `scoreAlternatives`, resolving a tension between the plan's own five-argument action text and its threat model's explicit "takes userId explicitly" requirement -- the threat model (a security-critical per-user isolation property, T-03-40) won.
- Null `movement_pattern` scores neutral and excludes nothing; the 205 affected seeded rows keep full suggestion eligibility via the other signals.
- `SwapSuggestionList` owns its entire section including the header text; the 03-07 shell's static "Suggested Alternatives" label was removed rather than duplicated alongside the dynamic pluralized header.
- Candidate thumbnails resolve via the vendored local image map, never any `imageUrls` field on the scorer's output -- preserving the single offline image-resolution path already established.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Exported `buildArchivedSet` from `catalog-filter.ts`**
- **Found during:** Task 1
- **Issue:** The plan's own acceptance criteria require `smart-swap.ts` to import the archive predicate from `catalog-filter.ts` "rather than redefining one," but `buildArchivedSet` was a module-private function there -- unimportable as written.
- **Fix:** Added `export` to the existing function (no behavior change, no new file in scope) and imported it directly in `smart-swap.ts`.
- **Files modified:** `apps/mobile/lib/catalog/catalog-filter.ts`
- **Verification:** `grep` acceptance criterion confirms the import; existing `catalog-filter.test.ts` (part of the 124-test `catalog` suite) still passes unchanged.
- **Committed in:** `d2df597` (Task 1 commit)

**2. [Rule 2 - Missing critical functionality / threat-model conformance] Added an explicit `userId` parameter to `scoreAlternatives`**
- **Found during:** Task 1, reconciling the plan's action text against its own threat model
- **Issue:** The plan's action text describes a five-argument signature (`target, candidates, mappings, preferences, constraints`) with no `userId`, but the plan's own threat model (T-03-40) requires `scoreAlternatives` to "take the current userId explicitly and match preference rows on it," and a `<behavior>` line requires "another user's never_suggest flag does not suppress the candidate for this user" -- neither is achievable if the preferences array is assumed to be pre-filtered by the caller rather than matched by the function itself.
- **Fix:** Added `userId: string | null` as an explicit fifth positional parameter, with `constraints` moved to a sixth, defaulted (`= {}`) parameter. This is a security-critical property (T-03-40 is rated `high` severity), so the threat model's explicit requirement took precedence over the action text's shorthand signature listing.
- **Files modified:** `apps/mobile/lib/catalog/smart-swap.ts`
- **Verification:** Dedicated test ("does not let another user's never_suggest flag suppress a candidate for this user") passes; all 20 scorer tests green.
- **Committed in:** `d2df597` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 2, both resolving an internal tension between the plan's own acceptance criteria/threat model and its action-text shorthand -- neither is scope creep, both were required to satisfy the plan's own stated tests).
**Impact on plan:** Both changes are minimal, additive, and directly required by the plan's own acceptance criteria and threat model. No architectural change, no new dependency, no file outside the plan's declared scope except the one-line `export` in `catalog-filter.ts` the plan itself instructed reusing.

## Issues Encountered

- **Fresh worktree had no `node_modules` or `@fitness/api-contracts` `dist/`.** Same recurring gap every prior phase-3 plan recorded -- `pnpm install --frozen-lockfile` then `pnpm --filter @fitness/api-contracts build` were required before any test could run. Not a plan defect.
- **`pnpm --filter api test:e2e` was not re-run this session.** This plan touches zero server-side files, and `apps/api/.env` is permission-restricted in this sandboxed worktree (a `find`/`grep` against it was denied). Confidence the server suite is unaffected rests on file-scope reasoning, not a fresh green run -- recorded honestly as WINDOWS #47 rather than silently assumed passing.
- **No `@testing-library/react-native` or `react-test-renderer` in this worktree's lockfile** (same standing gap 03-07/03-09 recorded; installing either is out of scope per the package-legitimacy gate). `SwapSuggestionList` has no hooks, so it was exercised by direct function invocation, following the established technique exactly.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- EXER-10 is complete: any exercise's detail screen now offers up to five ranked, explained, on-device alternatives that respect the user's own archive/never-suggest state.
- **`SwapConstraints.excludeEquipment`/`allowEquipment` is a real, tested seam** -- Phase 7's gym-profile work can feed `equipment_profile.machine_availability` into it directly without touching `smart-swap.ts`'s own logic.
- **Phase 6's program generator** can call `scoreAlternatives` directly for any future "swap this exercise in a program" flow -- the function has no screen-specific coupling.
- **WINDOWS #46 and #47 (both open, both `unrun-verify`) should be swept together** with this phase's existing #33/34/37/38/39/41 pattern whenever the eventual browser/native UAT pass (ROADMAP Phase 999.1 precedent) happens -- #46 is this plan's own unobserved render, #47 is the un-re-run server e2e suite.
- **WINDOWS #45 is now `fixed`** -- 03-08 and 03-09's cross-plan integration gap closed cleanly, confirmed by this plan's own green typecheck/build.
- This is the final plan of Phase 3 (exercise-catalog). The orchestrator owns the phase-level STATE.md/ROADMAP.md/REQUIREMENTS.md updates after all wave agents complete.

## Self-Check: PASSED

All 4 created files and 3 modified files confirmed present on disk. All 3 commit hashes (`d2df597`, `87bfc32`, `6aac962`) confirmed present via `git log --oneline`. Every automated check was actually re-run in this session, not inferred: `pnpm --filter mobile test -- smart-swap` (20/20), `pnpm --filter mobile test -- catalog` (124/124), `pnpm --filter mobile test` (full suite, 281/281), `pnpm --filter mobile typecheck` (exit 0), `pnpm --filter mobile build` (exit 0, 24 static routes exported). Both plan-specified mutation checks (variation-as-filter, never_suggest-removal) were run directly against the real file, confirmed to redden the exact tests they should, then reverted and diffed byte-identical against a pre-mutation backup before committing.

---
*Phase: 03-exercise-catalog*
*Completed: 2026-08-18*
