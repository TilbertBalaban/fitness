---
phase: 11-program-generation
plan: 03
subsystem: exercises
tags: [program-generation, exclusions, local-first, powersync, drizzle]

# Dependency graph
requires:
  - phase: 11-program-generation
    plan: 01
    provides: generateProgram, GenerationInput.excludedExerciseIds, the candidate-pool filter order
  - phase: 11-program-generation
    plan: 02
    provides: excluded_exercise server table, PUSH_APPLIED_TABLES membership, sync-service validation
provides:
  - "apps/mobile/lib/db/schema.ts: excluded_exercise mirrored on device and registered in drizzleSchema, so DrizzleAppSchema gives PowerSync a table to land synced rows in"
  - "apps/mobile/lib/db/exclusions.ts: the single read/write path — loadExcludedExerciseIds, loadExcludedExercises, isExcluded, addExclusion, removeExclusion"
  - "An exclusion toggle on the exercise detail screen, phrased as a choice rather than a limitation"
  - "app/exercises/exclusions.tsx: one place listing every excluded exercise, each removable, with error and empty states that cannot be confused"
  - "runGeneration reads the user's real exclusion list — no call site passes an empty literal"
affects: [11-05-generation-wizard, 11-06-parity-and-durability]

# Actuals
actuals:
  tokens: 96000
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exclusion is a row, not a column: a per-user excluded_exercise row never touches the shared seeded exercise record, so one user's choice cannot leak to another"
    - "Un-exclude is a hard delete, not a tombstone — the absence of a row is the whole meaning of 'allowed'"
    - "A failed exclusion read propagates instead of degrading to an empty list: generating against no exclusions because the read failed looks like success while doing the one thing D-09 forbids"
    - "A failed read and an empty list render differently — 'nothing excluded' after a read that never succeeded would tell the user their exclusions are gone"
    - "loadExcludedExerciseIds sorts in JS so the id list has a total order regardless of SQLite's row order, keeping generation deterministic"
    - "Screen orchestration is exported as pure functions (runGeneration, deriveExclusionsScreenState, resolveExclusionAction) so sequencing is testable without rendering"

key-files:
  created:
    - apps/mobile/lib/db/exclusions.ts
    - apps/mobile/lib/db/__tests__/exclusions.test.ts
    - apps/mobile/app/exercises/exclusions.tsx
    - apps/mobile/app/exercises/__tests__/exclusions-screen.test.ts
  modified:
    - apps/mobile/lib/db/schema.ts
    - apps/mobile/app/exercises/[id].tsx
    - apps/mobile/app/exercises/_layout.tsx
    - apps/mobile/app/programs/generate.tsx
    - apps/mobile/app/programs/__tests__/generate-screen.test.ts
    - apps/mobile/lib/navigation/__tests__/route-guard.test.ts
    - packages/program-generator/src/__tests__/candidate-pool.test.ts
---

# Plan 11-03 — Exercise exclusions on device

## What Was Built

`excluded_exercise` now exists on the client as a real synced table (`id`, `user_id`,
`exercise_id`, `created_at`, `server_seq`) registered in `drizzleSchema`, so 11-02's server rows
have somewhere to land and locally-written rows queue for push like every other table.

`lib/db/exclusions.ts` is the only module that reads or writes it. `addExclusion` reads first and
returns without writing when a row already exists, so double-tapping leaves exactly one row;
`removeExclusion` hard-deletes and is a no-op when nothing matches. `loadExcludedExerciseIds`
returns ids sorted ascending in JS — SQLite makes no row-order promise, and generation's
determinism must not depend on one. `loadExcludedExercises` joins names through the existing
`loadExerciseNameMap` and falls back to a placeholder when an id no longer resolves, so a row for a
deleted exercise still renders and stays removable instead of vanishing into a blank cell.

The exercise detail screen carries the toggle. `resolveExclusionAction` names the two directions
("Exclude from generated programs" / "Allow in generated programs") and a test asserts neither
phrasing reads as a judgement about the user.

`app/exercises/exclusions.tsx` lists every exclusion with a per-row Allow action, added as a fifth
`Stack.Screen` inside the existing `exercises` segment layout — so it inherits the root layout's
signed-in guard with no second guard and no edit to `app/_layout.tsx`.

`runGeneration` now resolves catalog, inventory and exclusions in one `Promise.all` and passes the
real id list. A failing exclusion read throws rather than degrading: `deps.generateProgram` is never
reached, and the screen shows its error state.

## Verification

- `pnpm --filter mobile test` — **119/119 suites, 2067/2067 tests pass**
- `pnpm --filter @fitness/program-generator test` — **10/10 suites, 112/112 tests pass**
- `pnpm -w typecheck` — **14/14 tasks pass**
- `grep -c loadExcludedExerciseIds apps/mobile/app/programs/generate.tsx` — **2** (import + wiring)
- `grep -rn 'excludedExerciseIds: \[\]' apps/mobile` — **0**; no call site passes an empty literal
- `git diff --numstat packages/program-generator/src/__tests__/candidate-pool.test.ts` —
  **104 insertions, 1 deletion**; append-only apart from one extended import line
- `app/exercises/_layout.tsx` — **5 `Stack.Screen` entries**, all four originals intact

The exclusion-beats-degradation prohibition is covered by a `candidate-pool` case where every other
candidate for a muscle group is already equipment-filtered out: the slot degrades and reports the
gap rather than reaching past the exclusion.

## Deviations

### Edited `generate-screen.test.ts`, a file this plan does not name (WINDOWS #170)

- **Found during:** `pnpm -w typecheck` after Task 3
- **Issue:** adding the required `loadExclusions` field to `GenerateScreenDeps` made two existing
  deps literals in the test incomplete.
- **Fix:** added the field to both literals. Making `loadExclusions` optional would have typechecked
  too, but it would let a future call site silently generate with no exclusions — the exact silent
  failure D-09 forbids — so the injection contract was kept required.

### Edited `route-guard.test.ts`, a file this plan does not name

- **Found during:** the plan-level full-suite run
- **Issue:** two cases enumerate the `exercises` segment's children exhaustively
  (`['[id]', 'edit/[id]', 'index', 'new']`, and the hoisted-sibling equivalent). Adding the
  `exclusions` route — mandated by this plan — turned both red.
- **Fix:** added `exclusions` to both expectations and renamed the "four routes" case to "five".
  Guard semantics are unchanged; both cases still fail if the segment layout is removed.
- **Committed in:** `d1b391d`

**Total deviations:** 2, both stale-assertion corrections forced by this plan's own mandated
additions. No exported signature outside the plan's named files changed.

## Issues Encountered

Two Jest module-resolution failures, both the known ESM-untransformable-dependency shape:

- `exclusions.test.ts` — `SyntaxError: Unexpected token 'export'`, because the value import of
  `loadExerciseNameMap` pulls in `powersync.ts`. Fixed with `jest.mock('../powersync', ...)`.
- `exclusions-screen.test.ts` — `Cannot use import statement outside a module` from
  `better-auth/react`. Fixed by mocking `../../../lib/auth-client` and `../../../lib/db/powersync`
  **before** the import statements, matching `library-screen.test.ts`'s existing discipline.

The exhaustive-hardcoded-expectation failure mode has now appeared four times in this phase (the
route-guard list in 11-01, `PUSH_APPLIED_TABLES` after 11-02, the split assertions in 11-04, and
route-guard again here). Each time a legitimate addition turned a hand-written enumeration red.

## User Setup Required

None. `excluded_exercise` reaches Postgres through `drizzle-kit push`, which 11-02 already covers.

## Next Phase Readiness

- 11-05's wizard can surface the exclusion list as a review step; the read path already exists and
  takes only a user id.
- 11-06's parity run gets a non-empty exclusion list for free — `runGeneration` is the single entry
  point both the screen and the durability harness go through.
- The multi-device truth ("an exclusion on one device appears on the other") remains a backstop
  claim, verified by the sync path 11-02 established rather than by a device-pair test here.
- Executed on the main working tree rather than in a worktree — the machine was sleeping on battery
  and killing background worktree agents before their first commit. Commits are already on `main`,
  so there is nothing to merge for this plan.

---
*Phase: 11-program-generation*
*Completed: 2026-08-30*
