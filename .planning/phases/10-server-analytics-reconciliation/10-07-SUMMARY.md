---
phase: 10-server-analytics-reconciliation
plan: 07
subsystem: testing
tags: [playwright, powersync-web, e2e, react-native-svg, accessibility]

requires:
  - phase: 10-01
    provides: muscle_volume_rollup/analytics_watermark schema and the recompute-on-edit path
  - phase: 10-03
    provides: loadMuscleMapWindow/loadMuscleDrilldown, muscleMapOverlayFilter (D-01's overlay predicate), the muscle-map pure-package vocabulary
  - phase: 10-05
    provides: MuscleHeatmap, MuscleVolumeRow, the /muscle-map screen and its five states
  - phase: 10-06
    provides: MuscleDrilldownSheet and its wiring into the screen's named seam
provides:
  - apps/mobile/lib/db/test-support.ts — seedMuscleMapHistory, the durability seeder for muscle groups, weighted mappings, synced/unsynced sessions, pre-synced rollup rows and a watermark
  - apps/mobile/app/__durability.web.tsx — the muscleMapHarness mount slot and seedMuscleMapAndOpenMuscleMap seed-then-mount method
  - apps/mobile/e2e/muscle-map.spec.ts — executed browser evidence for both figures, both window paths, the D-01 overlay (including its backfill case), untrained rendering, and the drill-down
  - .planning/ROADMAP.md — this phase's deferred native and human-judgment verifications, recorded on Phase 999.1/999.2
affects: []

actuals:
  tokens: 9019
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "seedMuscleMapHistory writes real fractional exercise_muscle_mapping.weight_factor values per mapping (not the fixed '1.000' every other seeder in this file uses), because D-04's weighted-secondary-mapping claim cannot be exercised without one"
    - "An exercise included in a session with an empty sets array still gets its muscle_group + exercise_muscle_mapping rows written (via the same allExercises flatMap every seeder in this file uses), but contributes no cell — this is the seeding trick that gives an untrained muscle a resolvable display name instead of an empty string"
    - "The D-01 overlay's post-watermark and backfill halves are proven together by one arithmetic sum (rollup + session A + session B) rather than as isolated assertions — if either seeded session were dropped by a broken predicate, the total would not match, so a single passing number is proof both clauses fired"

key-files:
  created:
    - apps/mobile/e2e/muscle-map.spec.ts
  modified:
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/playwright.config.ts
    - .planning/ROADMAP.md

key-decisions:
  - "Drill-down contribution order is proven by each row's own composed accessible name (which carries the exercise's set count and contributed volume) rather than by exercise name, because neither seeded exercise id has a catalog row (seedMuscleMapHistory writes no exercise/seededExercise rows) and both resolve to the shared 'Unknown exercise' fallback — the two rows are still distinguishable and orderable by their differing volume/set-count facts."
  - "The overlay test seeds the post-watermark session and the pre-watermark backfilled session together and asserts one combined total, rather than seeding them in two separate steps with an intermediate assertion. The combined total (rollup + both sessions) is only reachable if both the gt(local_date, watermark) clause and the isNull(user_id) clause independently fired, so one arithmetic check proves both halves without adding a second seed-without-mount harness method the plan did not ask for."
  - "No second harness method was added for causal (seed-without-remount) muscle-map updates, unlike weekly-progress.spec.ts's seedTrainedWeek/navigateAwayAndBack pattern — this plan's cases only needed data present at mount time, so seedMuscleMapAndOpenMuscleMap alone (matching the plan's own artifacts table) was sufficient."

patterns-established:
  - "A durability seeder that needs a fractional per-mapping weight factor writes its own dedicated ensureXMappings helper rather than reusing an existing ensureMuscleMappings that hardcodes a fixed factor — the two helpers coexist in test-support.ts because they seed genuinely different fixture shapes."

requirements-completed: [ANLY-04, ANLY-05, ANLY-09]

coverage:
  - id: D1
    description: "seedMuscleMapHistory seeds a real local database with weighted exercise_muscle_mapping rows (fractional factors, D-04), synced and unsynced completed sessions, and optional pre-synced muscle_volume_rollup/analytics_watermark rows standing in for a live PowerSync pull"
    requirement: "ANLY-04"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/muscle-map.spec.ts (all 6 cases, each seeded through this function)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Both body-map figures, the 1-week local-only window, the D-01 rollup-plus-overlay merge (including its pre-watermark backfill case), untrained rendering, and the drill-down (rank order, Close, untrained-row reachability) are all proven end to end against a real @powersync/web database in a real browser"
    requirement: "ANLY-04"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/muscle-map.spec.ts — 6/6 passing; whole durability project 84/84 passing"
        status: pass
    human_judgment: false
  - id: D3
    description: "The drill-down opens for both a trained and an untrained muscle row, lists contributing exercises in rankMuscleContributions order, and Close leaves the selected window's rendered total unchanged"
    requirement: "ANLY-05"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/muscle-map.spec.ts — 'muscle map — the drill-down (ANLY-05)' describe block, both cases"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every manual verification this phase cannot perform on this machine (native rendering; subjective intensity-scale and caption legibility) is recorded on ROADMAP Phase 999.1/999.2 and in .planning/WINDOWS.md, pointing at each other, with none left in a skipped UAT state"
    verification:
      - kind: other
        ref: "grep -c \"Phase 10 test\" .planning/ROADMAP.md == 3; gsd-tools windows status | grep -c '\"phase\": \"10\"' == 6"
        status: pass
    human_judgment: false

duration: 28min
completed: 2026-08-29
status: complete
---

# Phase 10 Plan 07: Playwright Durability Evidence and the Deferred-Verification Ledger Summary

**Executed a 6-case Playwright spec against a real `@powersync/web` database proving both Muscle Map figures, the 1-week/rollup-window split, the D-01 overlay's post-watermark and backfill halves, untrained rendering, and the drill-down — with the whole 84-spec durability project staying green — then closed the phase's manual-verification ledger onto ROADMAP 999.1/999.2 and WINDOWS.md.**

## Performance

- **Duration:** ~28 min (commit span)
- **Started:** 2026-08-29T17:00:00Z (approx.)
- **Completed:** 2026-08-29T17:12:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 6 (4 in `apps/mobile`, `.planning/ROADMAP.md`, `.planning/WINDOWS.md`)

## Accomplishments
- `seedMuscleMapHistory` (test-support.ts) — the durability seeder: real fractional `exercise_muscle_mapping.weight_factor` values (D-04), per-session `syncedToServer` control over `workout_session.user_id`, and optional direct writes to `muscle_volume_rollup`/`analytics_watermark` standing in for a live PowerSync pull
- `__durability.web.tsx` gained an append-only `muscleMapHarness` mount slot and `seedMuscleMapAndOpenMuscleMap` seed-then-mount method, matching every sibling plan's convention exactly (git diff over this file, `test-support.ts` and `playwright.config.ts` shows zero removed lines across all three)
- `muscle-map.spec.ts` — 6 executed cases: both figures announce themselves by image role and accessible name; the 1-week window renders correctly with no rollup and no stale caption; the D-01 overlay's post-watermark and pre-watermark-backfill halves both contribute to one arithmetically-checked total, disclosed by session count; an untrained muscle reads the word itself; the drill-down lists contributors in rank order and Close preserves the window
- Ran the whole `durability` Playwright project (not just the new file): **84/84 passing**, confirming this plan's append-only harness edit broke nothing else in the project
- ROADMAP Phase 999.1 gained Phase 10 test 1 (native rendering, WINDOWS #165); Phase 999.2 gained Phase 10 tests 2-3 (intensity-scale legibility WINDOWS #166, caption legibility WINDOWS #167); Phase 10's own plan list ticked to 7/7
- Recorded 5 new WINDOWS.md entries total: the native deferral, the two web human-judgment deferrals, a deviation entry scoping this plan's overlay evidence against the pre-existing offline-edit residual (#164, unchanged), and an unrun-verify entry for the API e2e suite this sandboxed worktree cannot reach (no `DATABASE_URL`, same class of block as #47/#48)

## Task Commits

1. **Task 1: Seed a real local database with rollup rows, a watermark and unsynced work** - `0fda04f` (feat)
2. **Task 2: Execute the browser spec — both windows, the overlay, and the drill-down** - `c56aca5` (test)
3. **Task 3: Route this phase's manual verifications to the backlog phases and the ledger** - `30bdf6b` (docs)

**Plan metadata:** (this commit, made immediately after this file is written)

_No TDD RED/GREEN gate applies — this plan's own frontmatter carries no `tdd="true"` tasks; each task's verification is its own executed automated check (unit suite, typecheck, or the real Playwright run), matching every other plan in this phase._

## Files Created/Modified
- `apps/mobile/lib/db/test-support.ts` - `seedMuscleMapHistory`, its supporting types, and `ensureMuscleMapMappings` (a dedicated fractional-weight-factor mapping writer)
- `apps/mobile/app/__durability.web.tsx` - the muscle-map mount slot and seed-then-mount method, append-only
- `apps/mobile/playwright.config.ts` - `muscle-map.spec.ts` appended to the `durability` project's `testMatch` array
- `apps/mobile/e2e/muscle-map.spec.ts` - the 6-case executed evidence file (sole new file this plan owns)
- `.planning/ROADMAP.md` - three deferred-verification bullets on Phase 999.1/999.2, Phase 10's own plan list ticked to 7/7
- `.planning/WINDOWS.md` - 5 new entries, written exclusively through the `gsd-tools windows` CLI

## Decisions Made
- Drill-down row order is asserted by each row's own volume/set-count fact line rather than by exercise name, since neither seeded exercise has a catalog row and both resolve to the shared "Unknown exercise" fallback — see key-decisions above for the full reasoning.
- The overlay case seeds both the post-watermark and pre-watermark-backfill sessions together and checks one combined total, rather than seeding them sequentially with an intermediate assertion — a match is only reachable if both predicate clauses independently fired.
- No second, seed-without-remount harness method was added for the muscle map (unlike `weekly-progress.spec.ts`'s `seedTrainedWeek`/`navigateAwayAndBack` causal pattern) — every case in this plan only needed data present at mount time, so the single `seedMuscleMapAndOpenMuscleMap` the plan's own artifacts table names was sufficient.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written for Tasks 1 and 2. Task 3 required one judgment call, documented below rather than as an auto-fix since it did not change any file:

**1. [Judgment call] The phase-level `pnpm --filter api test:e2e` verification could not be run in this worktree**
- **Found during:** Phase-level `<verification>` execution, after Task 3's commit
- **Issue:** `drizzle-kit push` fails with `Either connection "url" or "host", "database" are required for PostgreSQL database connection` — `apps/api/.env` is permission-restricted from this sandboxed worktree and carries no `DATABASE_URL`. This is the same class of block already recorded at WINDOWS #47 and #48 by an earlier phase.
- **Resolution:** Recorded as WINDOWS #169 (`unrun-verify`, phase 10, file `apps/api`), documenting that confidence the server half is unaffected rests on file-scope reasoning (this plan's three commits touch only `apps/mobile` and `.planning`, zero `apps/api` files) rather than a fresh green run. No files were modified for this — it is a documentation-only deviation from the plan's own verification checklist, not a code change.
- **Files modified:** none (WINDOWS.md entry only, via CLI)
- **Committed in:** will land in this plan's final metadata commit alongside this SUMMARY

---

**Total deviations:** 1 documented (a verification that could not be run in this sandbox, recorded rather than silently skipped)
**Impact on plan:** No scope creep, no code changes outside the plan's declared files. The one unrun check is disclosed with its reasoning rather than either faked or hidden.

## Issues Encountered
None beyond the one documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 10 is now 7/7 plans complete. `apps/mobile/e2e/muscle-map.spec.ts` is this plan's sole-owner file; every shared seam it touched (`__durability.web.tsx`, `test-support.ts`, `playwright.config.ts`) was edited append-only, confirmed by a zero-removed-lines `git diff` gate on all three before each commit.
- No `apps/api`, Drizzle schema, or forbidden UI file (`apps/mobile/components/**`, `muscle-map.tsx`, `history.tsx`, `muscle-volume-query.ts`, `schema.ts`) was touched — confirmed via `git diff --name-only` across all three commits.
- The whole `durability` Playwright project stays green (84/84) after this plan's harness edit, so no other e2e-bearing plan in the project regressed.
- Native rendering and two subjective visual-legibility items are correctly deferred to ROADMAP Phase 999.1/999.2 (WINDOWS #165-#167) rather than left as skipped UAT — they will not block this phase's transition.
- The API e2e suite (WINDOWS #169) should be re-run once a worktree with a reachable Postgres is available, to close out the phase-level verification checklist with a fresh green run rather than file-scope reasoning alone.

## Self-Check: PASSED

All 5 created/modified files verified present on disk (`apps/mobile/e2e/muscle-map.spec.ts` created; `test-support.ts`, `__durability.web.tsx`, `playwright.config.ts`, `.planning/ROADMAP.md` modified). All 3 task commit hashes (`0fda04f`, `c56aca5`, `30bdf6b`) verified present in `git log`.

---
*Phase: 10-server-analytics-reconciliation*
*Completed: 2026-08-29*
