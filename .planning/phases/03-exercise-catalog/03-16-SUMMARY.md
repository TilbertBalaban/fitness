---
phase: 03-exercise-catalog
plan: 16
subsystem: ui
tags: [expo-router, powersync, react-native, jest, catalog-hydration]

requires:
  - phase: 03-exercise-catalog
    provides: "load-snapshot.ts's loadCatalogSnapshot/isCatalogSnapshot validation, from plan 03-14"
provides:
  - "A single module-level single-flight hydration seam (ensureCatalogLoaded) for the whole exercises segment"
  - "A detail-route state machine that cannot report not-found before a catalog load has resolved successfully"
  - "Cold-deep-link resolution on /exercises/{id} and /exercises/edit/{id} with no prior visit to /exercises required"
affects: [exercise-catalog, expo-router-segments]

actuals:
  tokens: 3900
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Module-level single-flight promise memo as the seam for shared async setup a segment's routes must all await, instead of a React context provider or a layout-level blocking gate"
    - "State-machine widening (hydrating/found/not-found/error) with the resolver function's return type excluding the component's own pre-resolution state, making it a type error to synthesize that state outside the component"

key-files:
  created:
    - apps/mobile/lib/catalog/ensure-catalog.ts
    - apps/mobile/lib/catalog/__tests__/ensure-catalog.test.ts
  modified:
    - apps/mobile/app/exercises/[id].tsx
    - apps/mobile/app/exercises/edit/[id].tsx
    - apps/mobile/app/exercises/index.tsx
    - apps/mobile/app/exercises/__tests__/exercise-detail-screen.test.ts

key-decisions:
  - "ensureCatalogLoaded is a shared module-level single-flight function, not a React context provider or a layout-level blocking gate — the shared state is one idempotent promise, not reactive data, and every consumer is an async function that can simply await it"
  - "app/exercises/new.tsx is deliberately left unchanged: it reads no catalog table, sourcing MUSCLE_GROUPS, LOAD_TYPES, EQUIPMENT_TYPES and MOVEMENT_PATTERNS from @fitness/api-contracts constants"
  - "app/exercises/_layout.tsx is deliberately left unchanged: firing an async hydrate from the layout would race each route's own effect, and blocking children on hydration would gate the create form (which needs no catalog) behind an 880-row transaction"

patterns-established:
  - "Detail-route state machines that model a catalog dependency add a pre-resolution state (hydrating) distinct from the resolver's own return type, so the resolver cannot synthesize the loading state and 'not-found' cannot be reached without a completed load"

requirements-completed: [EXER-03, EXER-05]

coverage:
  - id: D1
    description: "ensureCatalogLoaded single-flights concurrent and sequential calls, retries after a rejection, and delegates to loadCatalogSnapshot by default"
    requirement: "EXER-03"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/ensure-catalog.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "resolveDetailScreenState cannot report not-found before a catalog load resolves successfully; an invalid or rejected load returns error without ever calling the detail loader"
    requirement: "EXER-03"
    verification:
      - kind: unit
        ref: "apps/mobile/app/exercises/__tests__/exercise-detail-screen.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "A cold deep link to /exercises/{id} on a brand-new account resolves the real exercise without first visiting /exercises, a genuinely absent id still reports not-found, and a cold deep link to /exercises/edit/{id} shows the edit-not-permitted explanation rather than not-found"
    requirement: "EXER-03"
    verification:
      - kind: manual_procedural
        ref: "03-16-PLAN.md Task 3 <how-to-verify> steps 1-5, against live NestJS :4000 / Postgres (880 seeded exercises) / PowerSync :8080 / expo web :8081"
        status: pass
    human_judgment: true
    rationale: "Only a real browser against a real cold local SQLite database proves hydration timing; unit tests prove the state machine but cannot prove wall-clock cold-start behavior. User approved all five steps, explicitly confirming step 4 (genuinely-absent id still reports not-found)."
  - id: D4
    description: "All three catalog-reading routes (list, detail, edit) hydrate through ensureCatalogLoaded; new.tsx and _layout.tsx confirmed to need no change"
    requirement: "EXER-05"
    verification:
      - kind: unit
        ref: "pnpm --filter mobile test (25 suites, 361 tests, 0 skipped, 0 todo)"
        status: pass
      - kind: other
        ref: "grep -rn ensureCatalogLoaded apps/mobile/app/exercises/ — matches index.tsx, [id].tsx, edit/[id].tsx; no match in new.tsx or _layout.tsx"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-08-20
status: complete
---

# Phase 03 Plan 16: Single Catalog Hydration Seam Summary

**A module-level single-flight `ensureCatalogLoaded` seam replaces three independent (one actual, two
missing) hydration paths in the exercises segment, so a cold deep link to `/exercises/{id}` or
`/exercises/edit/{id}` now hydrates its own local catalog instead of reading an empty table and
reporting a genuine exercise as removed.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-08-20T08:22:00Z
- **Completed:** 2026-08-20T08:40:39Z
- **Tasks:** 3 (2 auto/tracer + 1 checkpoint:human-verify)
- **Files modified:** 6

## Accomplishments

- Closed gap G-03-6: a cold deep link to a real exercise id resolves the exercise on the very first
  navigation, with no prior visit to `/exercises` required.
- Added `ensureCatalogLoaded`/`resetCatalogLoadState` in `apps/mobile/lib/catalog/ensure-catalog.ts` —
  a shared, single-flight, retry-after-rejection wrapper around `loadCatalogSnapshot`, unit-proven for
  concurrent-call collapsing, sequential-call memoization, and rejection recovery.
- Widened the detail route's `DetailScreenState` with a `hydrating` member and changed
  `resolveDetailScreenState` to a two-argument `(ensure, loader)` shape whose declared return type
  excludes `hydrating` — making it a type error for the resolver to ever produce the component's own
  pre-resolution state. `not-found` is now reachable only after a catalog load has resolved `loaded` or
  `current`.
- Routed the list screen (`index.tsx`) and the edit screen (`edit/[id].tsx`) through the same seam. The
  edit screen gained an `error` `LoadState` member rendering the existing Copywriting Contract error
  strings ("Exercise catalog couldn't load" / "Restart the app to try again...") rather than inventing
  new copy.
- Confirmed `app/exercises/new.tsx` needs no change (no catalog read; vocabularies come from
  `@fitness/api-contracts`) and `app/exercises/_layout.tsx` is byte-identical — the segment's signed-in
  guard (T-03-58) is untouched.
- User approved the live-stack checkpoint (Task 3) on two freshly signed-up accounts, confirming all
  five verification steps including the one that must still fail correctly: a genuinely-absent id still
  reports "Exercise not found."

## Task Commits

1. **Task 1: One hydration seam, and a detail route that cannot say "not found" before the catalog
   exists** - `78d577e` (feat, tracer/tdd)
2. **Task 2: The rest of the segment goes through the same seam** - `8c1b89f` (feat)
3. **Task 3: Confirm a cold deep link resolves on a brand-new account** - checkpoint:human-verify,
   gate="blocking", approved by user (no code commit; verification-only task)

**Plan metadata:** this commit (docs: summarize the catalog hydration seam and its approved checkpoint)

## Files Created/Modified

- `apps/mobile/lib/catalog/ensure-catalog.ts` - New module-level single-flight hydration seam:
  `ensureCatalogLoaded`, `resetCatalogLoadState`, `CatalogLoader` type
- `apps/mobile/lib/catalog/__tests__/ensure-catalog.test.ts` - New: concurrency, memoization,
  rejection-recovery, sync-throw, invalid-as-value, and default-loader-delegation cases
- `apps/mobile/app/exercises/[id].tsx` - `DetailScreenState` widened with `hydrating`;
  `resolveDetailScreenState` takes `(ensure, loader)`; render guards rewired; skeleton added
- `apps/mobile/app/exercises/edit/[id].tsx` - Awaits `ensureCatalogLoaded` before detail/owner loads;
  `LoadState` gains an `error` member rendering the existing Copywriting Contract strings
- `apps/mobile/app/exercises/index.tsx` - Hydrates via `ensureCatalogLoaded` instead of calling
  `loadCatalogSnapshot` directly; `invalid`/`loading`/`populated` behavior unchanged
- `apps/mobile/app/exercises/__tests__/exercise-detail-screen.test.ts` - Migrated existing
  `resolveDetailScreenState` cases to the two-argument signature; added the remaining behavior cases

## Decisions Made

- Chose a shared module-level single-flight function over a React context provider or a
  layout-level blocking gate. The layout renders children immediately, so an async hydrate fired
  there would race each route's own effect and reproduce the bug; blocking children on hydration
  would gate the catalog-free create form behind an 880-row transaction and put an async data
  concern into a file whose job is route hoisting for the signed-in guard. A context provider would
  add a component layer and a hook for state that is one idempotent promise, not reactive data.
- Memo is keyed by nothing (no db parameter in the cache key) because `getPowerSync()` is a process
  singleton — documented as the one comment in `ensure-catalog.ts`, since it is the non-obvious
  constraint a reader could not infer.
- A resolved `invalid` result is not cleared from the memo: a malformed bundled snapshot is
  deterministic, so re-validating 880 rows per route would buy nothing. Only a rejection clears the
  memo, so a transient failure can retry but a structurally invalid snapshot does not thrash.

## Deviations from Plan

### Noted, not fixed — grep criterion broader than its stated intent

**1. `__durability.web.tsx` still imports `loadCatalogSnapshot` directly**
- **Found during:** Task 2 acceptance-criteria verification
- **Criterion as written:** `grep -rn "loadCatalogSnapshot" apps/mobile/app/` returns no matches.
- **Actual:** returns one file, `apps/mobile/app/__durability.web.tsx` (lines 28, 146, 149).
- **Why this is not a gap:** `__durability.web.tsx` is the Playwright durability test harness route,
  not a product route reachable by a user. Its own inline comment states the intent explicitly:
  "Calls the real, unmodified `loadCatalogSnapshot` and lets a rejection propagate" — it exists
  specifically to exercise the *unwrapped* loader's failure behavior, which is precisely what it
  would stop testing if it were rewritten to go through `ensureCatalogLoaded`'s retry/memo semantics
  instead. The criterion's stated intent — "no route calls the snapshot loader directly any more" —
  holds for all three product routes (`index.tsx`, `[id].tsx`, `edit/[id].tsx`); the literal grep is
  broader than that intent because it does not distinguish product routes from test-harness routes
  under `app/`. No code change made; recorded here so a later reader does not mistake this for an
  unclosed instance of the seam.
- **Files:** none modified (informational only)
- **Verification:** `grep -rn "ensureCatalogLoaded" apps/mobile/app/exercises/` confirms all three
  product routes go through the seam and `new.tsx`/`_layout.tsx` do not need to.

---

**Total deviations:** 1 noted (criterion-scope clarification, no code change)
**Impact on plan:** None on functionality. The gap the plan set out to close (cold deep link
resolving without a prior `/exercises` visit) is fully closed on all product routes.

## Issues Encountered

None.

## Checkpoint: Task 3 (blocking human-verify)

**Status:** Approved by user.

The user ran the live stack exactly as UAT specifies — NestJS API on `:4000`, Postgres seeded with
880 exercises, PowerSync on `:8080`, `expo start --web` on `:8081` — and exercised all five numbered
steps in the plan's `<how-to-verify>` on freshly signed-up accounts:

1. Brand-new account, cold-pasted `/exercises/seed_90_90_Hamstring` as the very first navigation:
   resolved the exercise (skeleton then detail), not "Exercise not found."
2. Hard-reload of the same URL: same result.
3. Cold-pasted `/exercises/definitely-not-a-real-id`: after the skeleton resolved, correctly showed
   "Exercise not found — This exercise may have been removed." — confirming the fix does not turn
   into "never show not-found," which would be a regression rather than a fix.
4. Second brand-new account, cold-loaded `/exercises/edit/seed_90_90_Hamstring` directly: showed the
   "Can't edit this exercise / Duplicate it..." explanation, not "Exercise not found."

Gap **G-03-6 closed**. Requirements **EXER-03**, **EXER-05** satisfied by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The exercises segment now has exactly one hydration seam; any future route added to the segment
  that needs the catalog has a single, obvious call to make (`ensureCatalogLoaded(db)`), not a second
  place to independently get wrong.
- Plan 03-17 (same wave) owns the automated regression coverage for the signed-in guard on
  `app/exercises/_layout.tsx`, which this plan's Task 2 acceptance criteria confirmed remains
  byte-identical — the guard exists but this plan did not add tests for it.
- No blockers for downstream phases.

---
*Phase: 03-exercise-catalog*
*Completed: 2026-08-20*
