---
phase: 03-exercise-catalog
plan: 09
subsystem: ui
tags: [react-native, expo-router, drizzle, powersync, local-first, archive, preferences]

requires:
  - phase: 03-exercise-catalog
    provides: "03-02's user_exercise_preference table (single id PK, unique (user_id, exercise_id), never_suggest column); 03-03's server-side singleton sync root and archived_at PATCH rejection on exercise; 03-06's applyCatalogFilters archive-exclusion read path; 03-07's exercise detail screen"
provides:
  - "apps/mobile/lib/catalog/preferences.ts — readPreference/setArchived/setNeverSuggest against user_exercise_preference, plus resolveDetailActions (owned-vs-seeded, archived-vs-not control-visibility predicate)"
  - "apps/mobile/components/ArchiveDialog.tsx — SignOutDialog-pattern confirmation dialog with an unarchiving variant"
  - "app/exercises/[id].tsx extended with Archive/Unarchive, Never suggest, Duplicate and (owned-only) Edit controls, wired to preferences.ts"
affects: [03-10 (never_suggest flag read by smart-swap), Phase 6 program generator (never_suggest read path), any future plan touching the exercise detail screen or user_exercise_preference]

actuals:
  tokens: 5800
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Read-then-write upsert against a single-id-PK table keyed by a (user_id, exercise_id) uniqueness pair — reads the existing row first, updates by its id if found, else inserts with a fresh client UUID. Prevents a blind insert from creating a second local row the server's unique constraint would then reject."
    - "Archive is a real no-op branch on the already-archived path, not merely idempotent by accident — re-stamping archived_at on a second archive call would move the recorded time and produce a pointless sync op, so the no-op is a deliberate early return, pinned by a test that goes red when the branch is removed."
    - "Control-visibility as a pure exported predicate (resolveDetailActions) rather than inline JSX conditionals — kept unit-testable without a renderer, following 03-07's precedent of extracting hook-adjacent decisions into pure functions."

key-files:
  created:
    - apps/mobile/lib/catalog/preferences.ts
    - apps/mobile/lib/catalog/__tests__/preferences.test.ts
    - apps/mobile/components/ArchiveDialog.tsx
    - apps/mobile/components/__tests__/ArchiveDialog.test.tsx
  modified:
    - apps/mobile/app/exercises/[id].tsx
    - apps/mobile/app/exercises/__tests__/exercise-detail-screen.test.ts

key-decisions:
  - "Archive and never-suggest are two independent setters (setArchived, setNeverSuggest) sharing one internal writePreference — never a combined setter — so 'never-suggest without archiving' (EXER-07) stays expressible and each write only touches its own field."
  - "Never writes exercise.archivedAt or seededExercise.archivedAt from this module — one archive code path for every exercise, seeded or custom, lives in user_exercise_preference only (T-03-14). Pinned by a test asserting every insert/update call in a fake db targets only user_exercise_preference."
  - "resolveDetailActions always returns showDuplicate: true regardless of ownership (both a seeded and a user's own exercise offer Duplicate) and showEdit only when owned — matches this plan's own <behavior> line literally, distinct from 03-08's edit-route guard wording."
  - "duplicateExercise is imported from apps/mobile/lib/catalog/custom-exercise.ts using a relative path, not the codebase's usual @/ alias — required so Jest's { virtual: true } mock (the module does not exist in this worktree yet; see Deviations) can match the import without the react-native jest-preset's custom resolver eagerly failing on the aliased moduleNameMapper entry."
  - "ArchiveDialog's unarchiving variant drops the destructive fill entirely (no background class) rather than substituting accent — the Color contract reserves accent for CTA fill / active-filter-chip / focused-input border / selected-tab icon, none of which an unarchive confirm button is."

patterns-established:
  - "A real in-memory fake db (FakePreferenceDb in preferences.test.ts) that recursively interprets drizzle-orm's eq()/and() SQL condition trees via is(node, Column)/is(node, Param) type guards, rather than a canned-response stub — lets tests assert genuine cross-call state (no-op leaves a value unchanged, two users' rows stay distinct, write order does not change the outcome). Reusable by any future plan needing real select/insert/update semantics against a Drizzle table without a live SQLite engine."

requirements-completed: [EXER-06, EXER-07]

coverage:
  - id: D1
    description: "setArchived/setNeverSuggest write per-user archive and never-suggest state to user_exercise_preference only, never to exercise.archivedAt; already-archived is a real no-op that does not re-stamp archived_at; the two flags are independent"
    requirement: EXER-06
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/preferences.test.ts — setArchived/setNeverSuggest describe blocks, 9/9 passing"
        status: pass
    human_judgment: false
  - id: D2
    description: "Archive state is per-user and isolated — two users writing against the same exercise produce two distinct rows, each reading back only their own, regardless of write order"
    requirement: EXER-06
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/preferences.test.ts — 'per-user isolation' describe block, 2/2 passing"
        status: pass
    human_judgment: false
  - id: D3
    description: "never_suggest is stored independently of archive — settable without archiving, readable via readPreference with a non-null/undefined default"
    requirement: EXER-07
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/preferences.test.ts — 'readPreference' and 'setNeverSuggest' describe blocks, 3/3 passing"
        status: pass
    human_judgment: false
  - id: D4
    description: "Archiving every exercise in a catalog leaves applyCatalogFilters (03-06) returning an empty array rather than throwing — the write shape this plan produces is consumed correctly by the existing read path"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/preferences.test.ts — 'catalog-filter integration' describe block, 1/1 passing"
        status: pass
    human_judgment: false
  - id: D5
    description: "ArchiveDialog renders the exact Copywriting Contract archive-confirmation copy, holds 48x48 controls, does not write until Archive/Unarchive is pressed, and Cancel writes nothing"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/ArchiveDialog.test.tsx — 4/4 passing (direct invocation, no renderer)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The detail screen wires Archive/Unarchive, Never suggest, Duplicate and (owned-only) Edit to setArchived/setNeverSuggest/duplicateExercise/readPreference, with the destructive color token scoped to ArchiveDialog only"
    verification:
      - kind: unit
        ref: "apps/mobile/app/exercises/__tests__/exercise-detail-screen.test.ts — structural-invariants describe block, 4/4 passing"
        status: pass
    human_judgment: false
  - id: D7
    description: "The full detail-screen build (typecheck + expo export --platform web) succeeds with the archive/never-suggest/duplicate/edit wiring integrated"
    verification:
      - kind: other
        ref: "pnpm --filter mobile typecheck / pnpm --filter mobile build — both fail with exactly one error: Cannot find module '../../lib/catalog/custom-exercise' (03-08's file, not present in this worktree — concurrent wave-6 plan)"
        status: fail
    human_judgment: true
    rationale: "Genuine cross-plan integration gap, not a defect in this plan's own code — confirmed the SAME single error is the only output of both typecheck and build, with every other file in this diff typechecking and bundling cleanly. Recorded as WINDOWS #45; needs re-running after 03-08 and 03-09 merge into the same tree."

duration: "~35 min (dependency install + file reading, then three commits spanning 2026-08-18T22:09:34+03:00-22:21:07+03:00)"
completed: 2026-08-18
status: complete
---

# Phase 3 Plan 9: Per-User Archive and Never-Suggest Summary

**A pure preferences module (`readPreference`/`setArchived`/`setNeverSuggest` against `user_exercise_preference`), an `ArchiveDialog` confirmation matching `SignOutDialog`'s pattern, and Archive/Never-suggest/Duplicate/Edit controls wired into the exercise detail screen — verified against a real in-memory fake db that interprets Drizzle's actual `eq()`/`and()` condition trees rather than canned responses.**

## Performance

- **Duration:** ~35 min (dependency install + reading five upstream SUMMARYs/plans, then three commits spanning 2026-08-18T22:09:34+03:00 to 22:21:07+03:00)
- **Completed:** 2026-08-18
- **Tasks:** 2 (both plan tasks)
- **Files modified:** 4 created, 2 modified

## Accomplishments

- **`preferences.ts`** — `readPreference`, `setArchived`, `setNeverSuggest`, and a shared internal `writePreference`/`upsertPreference` doing read-then-write against `user_exercise_preference`'s single `id` PK / unique `(user_id, exercise_id)` pair. Already-archived is a real no-op branch (does not re-stamp `archived_at`); archive and never-suggest are fully independent writes. Never touches `exercise.archivedAt` or `seededExercise.archivedAt` — one archive code path for every exercise, seeded or custom, closing the exact schema gap CONTEXT.md identified (T-03-14, T-03-37, T-03-38, T-03-39 all mitigate here or in 03-02/03-03's already-shipped halves).
- **`resolveDetailActions`** — the detail screen's control-visibility predicate (owned vs. seeded, archived vs. not), extracted as a pure exported function per this plan's own instruction so it stays unit-testable without a renderer.
- **`ArchiveDialog.tsx`** — copies `SignOutDialog`'s structure exactly (same overlay, two-button row, 48x48 controls), with the exact UI-SPEC Copywriting Contract archive-confirmation copy, and an `unarchiving` variant that swaps the copy and drops the `destructive` fill (never substituting `accent`, which the Color contract reserves for CTA/active-chip/focused-input/selected-tab only).
- **`app/exercises/[id].tsx`** extended with an actions row: Archive/Unarchive (opens `ArchiveDialog`), Never suggest (immediate toggle, no dialog — UI-SPEC E7 dismisses a loading/error state for either control since both are optimistic local-first writes with nothing to wait on), Duplicate (always offered), and Edit (owned rows only). Reads the stored preference via `readPreference` on mount so both controls reflect state rather than defaulting to off and correcting after a write.
- **Test technique**: `preferences.test.ts`'s `FakePreferenceDb` is a real in-memory implementation (not a canned-response stub) that recursively walks Drizzle's actual `eq()`/`and()` SQL condition trees via `is(node, Column)`/`is(node, Param)` type guards — confirmed against the real runtime shape of those trees before writing the interpreter, not assumed. This lets the 15 tests in that file assert genuine cross-call state (no-op preserves the original timestamp, two users' writes never collide, write order doesn't change the outcome) rather than merely that a method was called.

## Task Commits

Each task was committed atomically:

1. **Task 1: Per-user archive and never-suggest as local-first writes** — `85fc409` (test)
2. **Task 2: The toggles and the archive confirmation on the detail screen** — `f486c5f` (feat)

**WINDOWS ledger update** — `87a80e1` (docs) — records #45 for the known cross-plan integration gap (see Deviations).

**Plan metadata:** this SUMMARY.md commit (docs).

## Files Created/Modified

- `apps/mobile/lib/catalog/preferences.ts` — `readPreference`, `setArchived`, `setNeverSuggest`, `resolveDetailActions`, `ExercisePreference`, `DetailActionVisibility`
- `apps/mobile/lib/catalog/__tests__/preferences.test.ts` — 15 tests: readPreference default, setArchived (create/no-op/clear/table-isolation), setNeverSuggest (independence/creation), per-user isolation (2 tests), a catalog-filter integration test, and 3 `resolveDetailActions` tests
- `apps/mobile/components/ArchiveDialog.tsx` — the confirmation dialog, archive and unarchive variants
- `apps/mobile/components/__tests__/ArchiveDialog.test.tsx` — 4 tests via direct invocation (Cancel writes nothing, Archive/Unarchive each call `onConfirm` once, exact Copywriting Contract copy)
- `apps/mobile/app/exercises/[id].tsx` — action row added (Archive/Unarchive, Never suggest, Duplicate, Edit), preference-on-mount read, optimistic local-first write handlers
- `apps/mobile/app/exercises/__tests__/exercise-detail-screen.test.ts` — extended with `auth-client` and `custom-exercise` (virtual) mocks, plus 2 new structural-invariant assertions (wiring present, `destructive` token absent from the screen itself)

## Decisions Made

See `key-decisions` in frontmatter. Summary:
- Archive and never-suggest are always written independently, sharing only the internal read-then-write primitive — never a combined setter.
- One archive code path: this module never writes `exercise.archivedAt`/`seededExercise.archivedAt`, pinned by a test asserting every write call in a fake db targets only `user_exercise_preference`.
- `resolveDetailActions` offers Duplicate unconditionally and Edit only when owned, matching this plan's `<behavior>` line literally.
- `duplicateExercise` is imported with a relative path rather than the codebase's usual `@/` alias, specifically so it can be `jest.mock(..., { virtual: true })`'d against a module that does not yet exist in this worktree — see Deviations below.
- `ArchiveDialog`'s unarchiving confirm button drops the destructive fill without substituting `accent`, respecting the Color contract's narrow reservation for that token.

## Deviations from Plan

### Auto-fixed Issues

None — every deviation below was expected and pre-authorized by the plan's own `<upstream_state>`/`<parallel_execution>` framing, not discovered mid-task and silently patched.

### Known cross-plan integration gap (expected, not a defect)

**1. `duplicateExercise` is imported from a module 03-08 owns and had not yet produced in this worktree**

- **Why:** 03-08 (`apps/mobile/lib/catalog/custom-exercise.ts`) and 03-09 are both wave-6 plans running in **separate, concurrent** git worktrees. This plan's own `<upstream_state>` and `<read_first>` direct wiring `Duplicate` to `duplicateExercise(db, userId, sourceId)`, and 03-08's own Task 3 explicitly defers that wiring to this plan ("Do not touch `[id].tsx` in this plan: 03-09 owns it this wave"). Neither plan can see the other's uncommitted worktree — this is a genuine wave-parallelism gap, not a mistake in either plan.
- **What was done:** Implemented the import, the call site, and the Duplicate control exactly against 03-08-PLAN.md's own declared signature (`duplicateExercise(db, userId, sourceId): Promise<string>`, returning the new exercise's id for navigation). Used a relative import path (`../../lib/catalog/custom-exercise`) rather than the codebase's usual `@/` alias, and mocked it with `jest.mock(..., { virtual: true })` in the screen's test file — this was necessary because the `@react-native/jest-preset` resolver eagerly tries to resolve the `@/` `moduleNameMapper` entry even for a virtual mock and throws before the mock can take effect; the plain relative specifier bypasses that resolver path entirely and the virtual mock works correctly.
- **Verified precisely, not assumed:** `pnpm --filter mobile test` passes fully (219/219, including this screen's 7 tests with the virtual mock standing in for `duplicateExercise`). `pnpm --filter mobile typecheck` and `pnpm --filter mobile build` were both run and each fails with **exactly one** error — `Cannot find module '../../lib/catalog/custom-exercise'` — confirmed by inspecting the full error output of both commands; no other file in this plan's diff produces any typecheck or bundling error.
- **Recorded:** WINDOWS #45 (`unrun-verify`, phase 03). Needs re-running after 03-08 and 03-09 merge into the same tree to confirm the two plans' work integrates cleanly. The `gsd-tools windows append` CLI auto-assigned id 40 (colliding with 03-08's reserved #40-44 range, since this worktree's ledger predates 03-08's own reservation-time state) — manually renumbered to #45 in both the table and JSON block before committing.

---

**Total deviations:** 0 unplanned auto-fixes. 1 known, pre-authorized cross-plan integration gap (WINDOWS #45), fully scoped and verified to affect exactly one import.
**Impact on plan:** All of this plan's own code — `preferences.ts`, `ArchiveDialog.tsx`, and every part of `[id].tsx` except the single `duplicateExercise` import — typechecks, builds, and passes its own tests standalone. The gap is precisely bounded and will close automatically once 03-08's worktree merges.

## Issues Encountered

- **Fresh worktree had no `node_modules` or `@fitness/api-contracts` `dist/`**, matching every prior phase-3 plan's own recorded finding. `pnpm install --frozen-lockfile` then `pnpm --filter @fitness/api-contracts build` were required before any test could run. Not a plan defect.
- **`jest.mock(..., { virtual: true })` did not work against a `@/`-aliased specifier** under this project's `@react-native/jest-preset` custom resolver — the resolver attempts to resolve the `moduleNameMapper` target eagerly and throws a configuration error before the virtual flag can suppress the "module must exist" check, for both the mock registration itself and (separately) the production import site. Worked around by using a plain relative import in `[id].tsx` for this one cross-plan dependency, with a code comment explaining why it deviates from the codebase's usual `@/` convention.
- **`await import(...)` (dynamic import) is not supported in this project's Jest configuration** (`--experimental-vm-modules` is not enabled) — a first draft of the catalog-filter integration test used a dynamic import to avoid a circular-import concern that turned out not to exist; switched to a plain static top-level import once confirmed safe.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- EXER-06 and EXER-07 are both complete: archive removes an exercise from pickers (03-06's `applyCatalogFilters` already reads this plan's write shape) while leaving `session_exercise`/`personal_record` references intact (this module never deletes or touches any row but its own), and never-suggest is a fully independent per-user exclusion flag.
- **03-10 (smart-swap)** can read `never_suggest` directly off `user_exercise_preference` — the column and its write path are both proven here.
- **WINDOWS #45 must be re-verified once 03-08 merges** — re-run `pnpm --filter mobile typecheck` and `pnpm --filter mobile build` after both worktrees land in the same tree; if either still fails, the failure is a real integration bug (signature mismatch), not the expected missing-module gap this SUMMARY documents.
- `apps/mobile/app/exercises/index.tsx` (03-08's file, not touched here) still needs its own archive-filtering call site verified against real data now that `user_exercise_preference` has a real write path — 03-06's `applyCatalogFilters` already reads it, but no end-to-end list-screen test yet writes through `setArchived` and reads back through the list query in one test. Not filed as a new WINDOWS entry: it is a natural follow-up for whichever plan next touches `index.tsx`, not a gap this plan's own scope left open.

## Self-Check: PASSED

All 4 created files and 2 modified files confirmed present on disk. All 3 commit hashes (`85fc409`, `f486c5f`, `87a80e1`) confirmed present in `git log --oneline`. Every automated check was re-run directly in this session: `pnpm --filter mobile test -- preferences` (15/15), `pnpm --filter mobile test -- catalog` (68/68), `pnpm --filter mobile test -- ArchiveDialog` (4/4), `pnpm --filter mobile test -- exercise-detail-screen` (7/7), `pnpm --filter mobile test` full suite (219/219), and the mutation check (removing the already-archived no-op branch was confirmed to redden its pinning test, then reverted). `pnpm --filter mobile typecheck` and `pnpm --filter mobile build` were both run and confirmed to fail with exactly the one expected cross-plan error, not silently skipped.

---
*Phase: 03-exercise-catalog*
*Completed: 2026-08-18*
