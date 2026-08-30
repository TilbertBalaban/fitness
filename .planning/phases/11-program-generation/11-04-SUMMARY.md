---
phase: 11-program-generation
plan: 04
subsystem: programs
tags: [program-generation, split-templates, determinism, jest]

# Dependency graph
requires:
  - phase: 11-program-generation
    plan: 01
    provides: SplitSlot/SplitDayPattern/SplitTemplate/SplitResolution, SPLIT_TEMPLATES' declared type, AUTO_SPLIT_BY_DAYS, resolveSplitTemplate, the full_body entries
provides:
  - "SPLIT_TEMPLATES completed: upper_lower at 2-6 days and push_pull_legs at 3-6 days, matching the SplitTemplate shape 11-01 declared"
  - "SUPPORTED_DAYS_PER_WEEK and UNSUPPORTED_SPLIT_PAIRS — 'not supported' as a declaration a test can read rather than an absence it must infer"
  - "A frozen split table: no caller can mutate shared static data"
  - "split-contract.test.ts: the completeness, determinism, taxonomy-closure and auto-totality invariants, enumerated from the vocabularies at runtime"
  - "docs/program-generation-vocabularies.md § Split templates: the supported matrix and the auto mapping, with reasons for each unsupported cell"
affects: [11-05-generation-wizard, 11-06-parity-and-durability]

# Actuals
actuals:
  tokens: 34000
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A split is a table lookup, never procedural day invention — two clients on the same inputs cannot produce different weeks"
    - "`auto` is one declared entry per day count, so there is no tie to break and therefore no way for two runs to disagree"
    - "An unsupported (preference, days) pair returns an explicit unsupported resolution rather than snapping to the nearest supported count — degrade and report, never substitute"
    - "A coverage-gate test enumerated from the imported vocabulary at runtime, so the test cannot drift out of date with what it guards"

key-files:
  created:
    - packages/program-generator/src/__tests__/split-contract.test.ts
  modified:
    - packages/program-generator/src/split-templates.ts
    - packages/program-generator/src/__tests__/split-templates.test.ts
    - packages/program-generator/src/__tests__/generate.test.ts
    - docs/program-generation-vocabularies.md
---

# Plan 11-04 — Split templates

## What Was Built

The split table is complete. Twelve `(splitPreference, daysPerWeek)` pairs resolve to a declared
week; the three that do not are declared unsupported rather than merely missing.

| preference | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|
| `full_body` | ✓ | ✓ | ✓ | ✗ no recovery day | ✗ no recovery day |
| `upper_lower` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `push_pull_legs` | ✗ three-way rotation cannot fit two days | ✓ | ✓ | ✓ | ✓ |

Day compositions follow the plan exactly: Push names chest/front_delts/side_delts/triceps, Pull
names lats/upper_back_traps/rear_delts/biceps, Legs and Lower name quads/hamstrings/glutes/calves,
Upper names chest/lats/front_delts/side_delts/biceps/triceps. Abs ride on the last day of every
template so the core is trained weekly without spending a slot in each session. Odd-count rotations
repeat from the start and are named so the repetition is visible (`Upper, Lower, Upper`;
`Push, Pull, Legs, Upper`).

`AUTO_SPLIT_BY_DAYS` was already correct from 11-01; this plan added the provenance comments
explaining why it is a lookup rather than a ranking function, and why an out-of-table day count
returns unsupported instead of snapping to a neighbour.

The table is frozen at every level a caller could reach.

## Verification

- `pnpm --filter @fitness/program-generator test` — **10/10 suites, 108/108 tests pass**
- `pnpm -w typecheck` — **14/14 tasks pass**
- `git diff packages/program-generator/src/generate.ts` — **empty**; 11-01's sole-owned file untouched
- `git diff --numstat docs/program-generation-vocabularies.md` — **44 insertions, 0 deletions**; append-only
- Negative grep for `score|Math.abs|nearest|closest` over comment-stripped source — **0**
- `grep -c "'upper_lower'"` over comment-stripped `split-contract.test.ts` — **0**; the matrix is enumerated, not hand-written

**The contract test was proved, not assumed.** Temporarily appending a fifth member (`arnold`) to
`SPLIT_PREFERENCES` with no template and no unsupported declaration turned **12 cases red**. The
member was removed and `@fitness/api-contracts` rebuilt before commit; `git diff` on
`generation.ts` is empty.

## Deviations

### Edited `generate.test.ts`, a file this plan does not name (WINDOWS #169)

- **Found during:** the plan-level `<verification>` run of the full generator suite
- **Issue:** 11-01's case *"produces one degradation entry and an empty day/cycle list for an
  unsupported split resolution"* used `splitPreference: 'upper_lower'` as its stand-in for an
  unsupported split. That held only while this plan's table rows were empty. Filling `upper_lower`
  made the premise false and the case red.
- **Fix:** the case now uses `full_body` at 5 days — a pair declared in `UNSUPPORTED_SPLIT_PAIRS`,
  so it is unsupported *by construction* rather than by omission and cannot rot the same way. The
  fixture's `daysPerWeek` had to be overridden too, because all three preferences are supported at
  the fixture's default of 3 days.
- **`generate.ts` itself is untouched** — only the test's choice of fixture changed.
- **Committed in:** `3526ac3`

### Replaced two 11-01 test cases the filled table falsified

- `'returns an unsupported resolution for upper_lower in this plan'` and
  `'returns an unsupported resolution for push_pull_legs in this plan'` were both scoped to 11-01 by
  their own names. Both pairs are now supported, so they were replaced by one case asserting an
  unsupported resolution reports its preference and day count, using `push_pull_legs` at 2 days.
- The plan's "append, do not restructure" rule was preserved for every other 11-01 case.
- **Committed in:** `fa9b7f4`

**Total deviations:** 2, both stale-assertion corrections forced by this plan's own mandated change.
No scope creep; no exported signature changed.

## Issues Encountered

None beyond the two stale assertions above. Both are the same failure mode seen twice already in
this phase (the route-guard list in 11-01, the `PUSH_APPLIED_TABLES` enumeration after 11-02):
an exhaustive hardcoded expectation that a legitimate, plan-mandated addition turns red.

## User Setup Required

None.

## Next Phase Readiness

- Every split a user can pick in the 11-05 wizard now resolves to a real week; the wizard can offer
  all four preferences without a dead option.
- `resolveSplitTemplate`'s signature is unchanged, so `generate.ts` stays 11-01's sole-owned file.
- The contract test guards the vocabulary going forward: 11-05 cannot add a preference to the
  picker without the suite demanding a template or an explicit unsupported declaration.
- Executed on the main working tree rather than in a worktree — the machine was sleeping on battery
  and killing background worktree agents before their first commit. Commits are already on `main`,
  so there is nothing to merge for this plan.

---
*Phase: 11-program-generation*
*Completed: 2026-08-30*
