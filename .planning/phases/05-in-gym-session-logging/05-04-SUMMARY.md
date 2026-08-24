---
phase: 05-in-gym-session-logging
plan: 04
subsystem: training-rules
tags: [typescript, jest, monorepo, pure-functions, pr-detection, epley, workspace-package]

requires:
  - phase: 05-in-gym-session-logging
    provides: "PR_TYPES, WARMUP_SET_TYPE, WORKING_SET_TYPE published in @fitness/api-contracts (05-02)"
provides:
  - "@fitness/pr-rules workspace package: estimated1RM, detectPrs, foldPriorBest, emptyPriorBest, warmupSets, roundToIncrement"
affects: [05-06, 05-08, phase-10-sync-reconciliation]

actuals:
  tokens: 4092
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Pure workspace package: no I/O, no ambient clock, no React/RN/drizzle imports, every boundary condition covered by a fixture-free unit test"
    - "Shared PR type union imported from @fitness/api-contracts's PR_TYPES rather than locally retyped, keeping the detector and the Postgres CHECK constraint as one list"

key-files:
  created:
    - packages/pr-rules/package.json
    - packages/pr-rules/tsconfig.json
    - packages/pr-rules/jest.config.js
    - packages/pr-rules/src/index.ts
    - packages/pr-rules/src/estimated-1rm.ts
    - packages/pr-rules/src/personal-records.ts
    - packages/pr-rules/src/warmup.ts
    - packages/pr-rules/src/__tests__/estimated-1rm.test.ts
    - packages/pr-rules/src/__tests__/personal-records.test.ts
    - packages/pr-rules/src/__tests__/warmup.test.ts
  modified: []

key-decisions:
  - "most_reps_at_weight only counts 'no prior entry' as first-ever when the ENTIRE mostRepsAtWeight map is empty, not merely when the exact candidate weight is missing from an otherwise non-empty map — a lifter who has never worked a given weight before is not automatically handed a rep PR at that weight just because they have trained other weights (pinned by an explicit 100kg-vs-90kg test, per the plan's own acceptance criteria)."
  - "A tie against the prior best is never a PR — only a strict improvement produces a DetectedPr, recorded as a comment in personal-records.ts since 'ties or beats' was a plausible alternative reading of D-30."
  - "roundToIncrement relies on Math.round's native round-half-up-for-positive-inputs behavior rather than a custom tie-breaking implementation, since every value this function is ever called with is a positive weight; the halfway case is still pinned by an explicit test rather than left as an unstated assumption."

patterns-established:
  - "Every pure function in this package takes fully explicit inputs (CandidateSet, PriorBest, working weight) and returns a value or an empty result — never a database call, never React, never an unguarded ambient Date.now() — matching next-up.ts's established contract-header convention."

requirements-completed: [LOG-17, LOG-18]

coverage:
  - id: D1
    description: "estimated1RM returns a numeric estimate within the validity cutoff and null past it, at non-positive weight/reps, and at non-finite inputs (Task 1, landed under f9f5bd3 in a prior interrupted session)"
    requirement: "LOG-18"
    verification:
      - kind: unit
        ref: "packages/pr-rules/src/__tests__/estimated-1rm.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "detectPrs recognises the four PR_TYPES-keyed record types, excludes warm-up and uncompleted sets, treats ties as not-a-PR, and resolves the exact-weight rep-record boundary correctly"
    requirement: "LOG-18"
    verification:
      - kind: unit
        ref: "packages/pr-rules/src/__tests__/personal-records.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "warmupSets produces a deterministic three-step warm-up ladder from a working weight, rounding to the nearest increment with halfway-ties-up, dropping zero-weight steps, and returning an empty array for non-positive/non-finite input"
    requirement: "LOG-17"
    verification:
      - kind: unit
        ref: "packages/pr-rules/src/__tests__/warmup.test.ts"
        status: pass
    human_judgment: false

duration: ~35min (this session, Tasks 2-3 only; Task 1 landed in a separate prior session)
completed: 2026-08-24
status: complete
---

# Phase 05 Plan 04: PR Rules Package Summary

**`@fitness/pr-rules` workspace package — Epley-formula estimated-1RM, a four-type PR detector, and deterministic 40/60/80 percent warm-up scaling, all pure and importable by both mobile and API.**

## Performance

- **Duration:** ~35 min (Tasks 2-3, this session)
- **Tasks:** 3 (Task 1 landed in a prior, interrupted session under commit `f9f5bd3`)
- **Files modified:** 10 total across the plan (7 new files this session: `personal-records.ts`, `warmup.ts`, both test files, plus `index.ts` touched twice)

## Accomplishments

- **Task 1 (prior session, `f9f5bd3`):** Scaffolded `@fitness/pr-rules` as a linked workspace package (copying `progression-engine`'s `package.json`/`tsconfig.json` shape and `api-contracts`'s jest wiring) and landed `estimated1RM(weightKg, reps)` — Epley formula, null past the 10-rep validity cutoff or at non-positive/non-finite input. 10 passing tests.
- **Task 2 (this session):** `detectPrs`, `foldPriorBest`, `emptyPriorBest` in `personal-records.ts` — the four PR types (`heaviest_weight`, `best_e1rm`, `most_reps_at_weight`, `best_set_volume`) keyed to the `PR_TYPES` tuple imported from `@fitness/api-contracts`, excluding warm-up and uncompleted sets, treating ties as not-a-PR, and correctly scoping the "no prior entry" rule to a truly empty history rather than a missing entry at one weight. 15 passing tests.
- **Task 3 (this session):** `warmupSets`, `roundToIncrement`, `WARMUP_STEPS`, `DEFAULT_ROUNDING_INCREMENT_KG` in `warmup.ts` — deterministic three-step warm-up ladder (40/60/80 percent at 10/5/3 reps), rounding to the nearest 2.5kg increment with halfway ties rounding up, dropping any step that rounds to 0kg, empty array for non-positive/non-finite working weight. 13 passing tests.
- `index.ts` re-exports all three modules; `dist/index.d.ts` builds cleanly.

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold @fitness/pr-rules and land the estimated-1RM estimator** - `f9f5bd3` (feat) — landed in a prior, interrupted session; not redone
2. **Task 2: The four PR types as one pure detector** - `ddcd3e0` (feat)
3. **Task 3: Deterministic warm-up scaling** - `9da97b6` (feat)

**Plan metadata:** SUMMARY.md commit follows this file's write.

## Files Created/Modified

- `packages/pr-rules/package.json` - `@fitness/pr-rules` workspace package declaration, `@fitness/api-contracts` dependency (Task 1)
- `packages/pr-rules/tsconfig.json` - copied from `progression-engine` (Task 1)
- `packages/pr-rules/jest.config.js` - ts-jest preset + suite-integrity reporter, copied from `api-contracts` (Task 1)
- `packages/pr-rules/src/estimated-1rm.ts` - `estimated1RM`, `E1RM_MAX_VALID_REPS` (Task 1)
- `packages/pr-rules/src/personal-records.ts` - `detectPrs`, `foldPriorBest`, `emptyPriorBest`, `PriorBest`, `CandidateSet`, `DetectedPr` (Task 2)
- `packages/pr-rules/src/warmup.ts` - `warmupSets`, `roundToIncrement`, `WARMUP_STEPS`, `DEFAULT_ROUNDING_INCREMENT_KG`, `WarmupSet` (Task 3)
- `packages/pr-rules/src/index.ts` - barrel re-exporting all three modules (extended in Tasks 2 and 3)
- `packages/pr-rules/src/__tests__/estimated-1rm.test.ts` - 10 tests (Task 1)
- `packages/pr-rules/src/__tests__/personal-records.test.ts` - 15 tests (Task 2)
- `packages/pr-rules/src/__tests__/warmup.test.ts` - 13 tests (Task 3)

## Decisions Made

- **`most_reps_at_weight`'s "no entry" rule scoped to an empty map, not a missing key.** The plan's action text describes firing "when no entry exists," but its own acceptance criteria requires that 100kg x 8 must NOT count as a rep PR against a prior history that only contains 90kg x 12. Implemented so a genuinely first-ever exercise (empty `mostRepsAtWeight` map) produces the PR, but a non-empty map simply lacking the exact candidate weight does not — matching the acceptance criteria and the LOG-18 adjacency truth precisely.
- **Ties are never PRs** — pinned with an inline comment in `personal-records.ts` noting "ties or beats" was a plausible alternative reading of D-30.
- **`roundToIncrement`** deliberately relies on `Math.round`'s native positive-tie-rounds-up behavior rather than reimplementing tie-breaking, since every caller in this package only ever passes positive weights; the halfway case is still covered by an explicit test rather than left as an implicit assumption.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected `most_reps_at_weight`'s empty-entry semantics before first commit**

- **Found during:** Task 2, while writing the acceptance-criteria test for the 100kg-vs-90kg boundary
- **Issue:** A literal reading of the action text ("no entry exists" → PR) would have made `detectPrs` grant a rep-count PR any time a candidate's exact weight had never been lifted before — even with substantial prior history at other weights. The plan's own acceptance criteria explicitly requires the opposite (100kg x 8 must NOT PR against a history containing only 90kg x 12).
- **Fix:** Scoped the "no entry exists" fallback to fire only when the entire `mostRepsAtWeight` map is empty (a true first-ever set for the exercise), not merely when the exact weight key is absent from a non-empty map.
- **Files modified:** `packages/pr-rules/src/personal-records.ts`
- **Verification:** Both the explicit acceptance-criteria test (100kg x 8 vs. 90kg x 12 prior → no PR) and the first-ever-set test (empty prior → PR) pass; caught by the test-first workflow before the task was committed.
- **Committed in:** `ddcd3e0` (part of Task 2 commit — the corrected version was committed, no follow-up fix needed)

---

**Total deviations:** 1 auto-fixed (1 bug, caught and corrected pre-commit)
**Impact on plan:** Necessary for correctness against the plan's own stated acceptance criteria. No scope creep.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `@fitness/pr-rules` is ready for consumption by 05-06 (warm-up generation UI, uses `warmupSets`) and 05-08 (finish summary and PR writes, uses `detectPrs`/`foldPriorBest`).
- Package-scoped verification (`pnpm --filter @fitness/pr-rules test/typecheck/build`, plus `pnpm turbo run test --filter=@fitness/pr-rules`) all green — 38 tests across 3 suites, 0 typecheck errors, `dist/index.d.ts` emits.
- Root-level `pnpm test`/`pnpm typecheck`/`pnpm lint` were NOT run in this worktree session — this is a parallel wave executor isolated to `packages/pr-rules/`, running concurrently with 05-03 (`apps/api/src/sync`) and 05-05 (`apps/mobile`) in sibling worktrees whose in-progress changes are not present here. Root-level verification is the orchestrator's responsibility after all wave worktrees merge.
- `pnpm-lock.yaml` and `pnpm-workspace.yaml` untouched this session, per the wave's lockfile-freeze constraint (05-05 owns lockfile writes this wave).
- No stubs, no skipped tests, no unrun `<verify>` blocks — nothing to append to WINDOWS.md this plan.

---
*Phase: 05-in-gym-session-logging*
*Completed: 2026-08-24*
