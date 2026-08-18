---
phase: 03-exercise-catalog
plan: 02
subsystem: database
tags: [drizzle, postgres, powersync, sqlite, sync-rules, exercise-catalog]

requires:
  - phase: 03-exercise-catalog
    provides: "03-01's bundled-JSON-to-PowerSync-localOnly-tables catalog delivery mechanism, @fitness/api-contracts LOAD_TYPES tuple, offline exercise list/detail screens"
provides:
  - "load_type as a Postgres-enforced six-value vocabulary (exercise_load_type_check CHECK constraint, matching packages/api-contracts LOAD_TYPES)"
  - "exercise.bodyweight_contribution_pct — nullable numeric(4,3) on Postgres, exact-string text mirror on mobile SQLite"
  - "user_exercise_preference table (both sides + sync-rules query) — per-user archive/never-suggest ownership for any exercise, seeded or custom"
  - "docs/catalog-load-types.md — per-load-type semantics, dual-axis resolution rule, and per-family bodyweight-contribution seed defaults for 03-04/03-05"
  - "seeded_exercise as a new localOnly mobile table, closing WINDOWS #32 — seeded catalog rows no longer enter the PowerSync upload queue"
affects: [03-03, 03-04, 03-05, 03-06, 03-08, any future exercise-catalog or logging plan reading load_type/bodyweight_contribution_pct/user_exercise_preference]

actuals:
  tokens: 8600
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Second localOnly PowerSync table split out of an existing synced table (seededExercise from exercise) to structurally eliminate ps_crud generation for a specific row population, rather than filtering the upload path — same localOnly mechanism 03-01 already established for muscleGroup/exerciseMuscleMapping/catalogMeta"
    - "Two-select union in application code instead of a SQL UNION across a mixed plain/localOnly DrizzleAppSchema — avoids depending on unverified query-wrapper behavior (RESEARCH.md Pattern 1's own untested-combination caveat)"
    - "Single TEXT PRIMARY KEY (not composite) on a new per-user table, required by SyncService.applyBatch's eq(table.id, op.id) resolution and PowerSync's one-id-column-per-managed-table constraint"

key-files:
  created:
    - docs/catalog-load-types.md
  modified:
    - apps/api/src/db/schema/catalog.ts
    - apps/api/src/db/schema.ts
    - apps/api/test/schema-parity.e2e-spec.ts
    - apps/mobile/lib/db/schema.ts
    - apps/mobile/lib/db/powersync.ts
    - apps/mobile/lib/db/powersync.web.ts
    - apps/mobile/lib/catalog/load-snapshot.ts
    - apps/mobile/lib/catalog/__tests__/load-snapshot.test.ts
    - apps/mobile/app/exercises/index.tsx
    - apps/mobile/app/exercises/[id].tsx
    - ops/powersync/sync-rules.yaml

key-decisions:
  - "Task 1 checkpoint:decision was answered by a live human, not auto-selected: load_type stays ONE flat six-value enum (flat-six), not two orthogonal axes. The 03-01-shipped packages/api-contracts LOAD_TYPES tuple is CONFIRMED, not revised."
  - "WINDOWS #32 (orchestrator-directed scope addition) fixed by splitting seeded exercise rows into a new localOnly seeded_exercise table rather than filtering the client's uploadData() — structural (no CRUD trigger installed at all) beats best-effort filtering, which would still generate ps_crud entries at insert time and has no clean partial-completion API on a PowerSync CrudTransaction."
  - "exercises/index.tsx and [id].tsx now read a two-query union (seededExercise + exercise WHERE is_custom) instead of a SQL UNION, to avoid depending on unverified query-wrapper behavior on a mixed plain/localOnly DrizzleAppSchema."

patterns-established:
  - "Splitting a synced table into a same-shape localOnly sibling is the house pattern for 'this population of rows must never enter the sync queue, but a sibling population of the same shape must' — future plans introducing another split-ownership table (if any) should follow seededExercise's shape, not invent a new mechanism."

requirements-completed: [EXER-06, EXER-07, EXER-08, EXER-09]

coverage:
  - id: D1
    description: "load_type is a Postgres-enforced six-value vocabulary — a CHECK constraint (exercise_load_type_check) exists, names all six literals, and a bad value is rejected at the database level"
    requirement: EXER-08
    verification:
      - kind: e2e
        ref: "apps/api/test/schema-parity.e2e-spec.ts — 'exercise_load_type_check exists and names all six load-type literals'"
        status: pass
      - kind: e2e
        ref: "apps/api/test/schema-parity.e2e-spec.ts — 'rejects an exercise row with an out-of-vocabulary load_type at the database level'"
        status: pass
    human_judgment: false
  - id: D2
    description: "bodyweight_contribution_pct exists as a nullable decimal on Postgres exercise and its exact-string mirror on mobile SQLite; semantics documented in docs/catalog-load-types.md"
    requirement: EXER-09
    verification:
      - kind: e2e
        ref: "apps/api/test/schema-parity.e2e-spec.ts — 'has every required column on exercise' (includes bodyweight_contribution_pct)"
        status: pass
    human_judgment: false
  - id: D3
    description: "user_exercise_preference exists on both sides with a single id primary key, a unique (user_id, exercise_id) pair, and a per-user sync-rules query"
    requirement: EXER-06
    verification:
      - kind: e2e
        ref: "apps/api/test/schema-parity.e2e-spec.ts — 'has every table schema.ts declares present in the live database' and 'has every required column on user_exercise_preference'"
        status: pass
      - kind: other
        ref: "node -e check confirming ops/powersync/sync-rules.yaml contains user_exercise_preference"
        status: pass
    human_judgment: false
  - id: D4
    description: "never_suggest column exists on user_exercise_preference, giving EXER-07 a schema home distinct from deletion"
    requirement: EXER-07
    verification:
      - kind: e2e
        ref: "apps/api/test/schema-parity.e2e-spec.ts — 'has every required column on user_exercise_preference' (includes never_suggest)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every table schema.ts declares (including the new user_exercise_preference) is present in the live Postgres database, proven against a real connection, not inferred from TypeScript types"
    verification:
      - kind: e2e
        ref: "apps/api/test/schema-parity.e2e-spec.ts — full suite, 12/12 passing against a real Postgres connection"
        status: pass
    human_judgment: false
  - id: D6
    description: "WINDOWS #32 fixed: a full catalog load produces zero tracked crud entries — seeded exercise rows never enter the PowerSync upload queue"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/load-snapshot.test.ts — 'a full catalog load produces zero tracked crud entries — seeded rows never enter the sync queue'"
        status: pass
    human_judgment: true
    rationale: "Proven against a Jest mock modeling PowerSync's documented per-table CRUD-trigger installation (same methodology 03-01 used), not against the real @powersync/web engine — real-engine confirmation is blocked by the same environment constraint WINDOWS #33 already records (real PowerSyncDatabase hangs under this project's Jest/Node sandbox)."
  - id: D7
    description: "03-01's offline exercise list and detail screens still work after the storage-shape change, reading a union of seededExercise and custom exercise rows"
    verification:
      - kind: unit
        ref: "pnpm --filter mobile test — full suite, 145/145 passing"
        status: pass
      - kind: other
        ref: "pnpm --filter mobile build (expo export --platform web) — /exercises and /exercises/[id] both bundle successfully"
        status: pass
    human_judgment: true
    rationale: "Bundling and unit tests confirm no build/type regression and no data-loss in the mock model; the actual rendered screen (list -> detail with real seeded data) has not been observed in a browser/simulator/device — consistent with WINDOWS #34's prior finding for the same screens."

duration: ~35min (continuation run; Task 1's human-answered checkpoint predates this session)
completed: 2026-08-18
status: complete
---

# Phase 3 Plan 2: Exercise Catalog Schema Gaps Summary

**Postgres CHECK-enforced `load_type` six-value vocabulary, `bodyweight_contribution_pct`, `user_exercise_preference` for per-user archive/never-suggest, and a new `seeded_exercise` localOnly table that structurally stops seeded catalog rows from queuing PowerSync upload traffic (WINDOWS #32).**

## Performance

- **Duration:** ~35 min (continuation run — resumed after a human-answered `checkpoint:decision`)
- **Completed:** 2026-08-18T10:15:00Z (approx)
- **Tasks:** 3 (1 checkpoint:decision human-answered, 2 auto) + 1 orchestrator-directed scope addition
- **Files modified:** 12 (11 modified, 1 created)

## Accomplishments

- Task 1's `checkpoint:decision` was answered by a live human (`flat-six`): `load_type` stays one flat six-value enum, and 03-01's `LOAD_TYPES` tuple in `packages/api-contracts` is confirmed rather than revised.
- Closed all four schema gaps CONTEXT.md named: `load_type` now has a Postgres `CHECK` constraint naming all six literals; `bodyweight_contribution_pct` exists as a nullable decimal on both sides; `user_exercise_preference` gives per-user archive/never-suggest a real owner (single `id` PK, unique `(user_id, exercise_id)`, its own sync-rules query) without mutating a row every user shares.
- Pushed the additive-only schema diff to a live Postgres database (`drizzle-kit push`, no interactive prompt) and proved it landed with a real connection: `apps/api/test/schema-parity.e2e-spec.ts` grew from 6 to 12 tests, including a direct-`pg` insert of `load_type = 'bogus'` that the database itself rejects.
- **Orchestrator-directed scope addition — WINDOWS #32 fixed**: seeded catalog rows were being written into the shared, PowerSync-synced `exercise` table, which installs a CRUD trigger per table regardless of a row's `user_id`. Split seeded rows into a new `seeded_exercise` table registered `localOnly` (structural: no trigger installed at all), mirroring 03-01's existing `muscleGroup`/`exerciseMuscleMapping`/`catalogMeta` precedent. `exercise` is now reserved exclusively for a user's own custom rows. Marked `.planning/WINDOWS.md` entry #32 `fixed`.
- Kept 03-01's offline exercise screens working: `exercises/index.tsx` and `exercises/[id].tsx` now read a two-query union of `seededExercise` and `exercise` (filtered `is_custom = true`), so future custom-exercise creation (a later plan) will surface in the same picker with no further schema-shape change.
- Documented the `load_type` vocabulary, the dual-axis resolution rule, `bodyweight_contribution_pct` semantics, and per-family seed defaults in a new `docs/catalog-load-types.md` for 03-04/03-05 to normalize against.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock the load_type vocabulary shape** — `checkpoint:decision`, no code; resolved by the human as `flat-six` in the previous executor's checkpoint round-trip (no commit — a decision task).
2. **Task 2: Close all four schema gaps on both sides** + **orchestrator-directed WINDOWS #32 fix** — `9063ae1` (feat), combined into one commit because the WINDOWS #32 fix touches the same coupled schema file (`apps/mobile/lib/db/schema.ts`) that Task 2 also extends, and splitting the diff would have left an intermediate commit that does not typecheck (the mobile schema, powersync wiring, and load-snapshot writer are mutually dependent).
3. **Task 3: Push the schema to the live database and assert it landed** — verification-only, no new commit; the one file Task 3's `files_modified` names (`apps/api/test/schema-parity.e2e-spec.ts`) was already staged and committed as part of `9063ae1` above, since it was written together with the rest of the schema change before the push was run.

**Plan metadata:** this SUMMARY.md commit (docs).

## Files Created/Modified

- `apps/api/src/db/schema/catalog.ts` — adds `exercise_load_type_check` CHECK constraint, `exercise.bodyweightContributionPct` (numeric(4,3)), and the new `userExercisePreference` pgTable + relations (single `id` PK, unique `(user_id, exercise_id)`, `never_suggest`, `archived_at`, `server_seq`)
- `apps/api/src/db/schema.ts` — imports/exports/registers `userExercisePreference` and `userExercisePreferenceRelations`; adds `exercisePreferences: many(userExercisePreference)` to `userRelations`
- `apps/api/test/schema-parity.e2e-spec.ts` — adds `user_exercise_preference` to `REQUIRED_TABLES`, column-presence checks for `exercise`/`user_exercise_preference`, a CHECK-definition test, and a bad-insert rejection test (6 -> 12 tests)
- `apps/mobile/lib/db/schema.ts` — adds `seededExercise` (new localOnly table, WINDOWS #32) and `userExercisePreference` sqliteTable mirrors; both added to `drizzleSchema`
- `apps/mobile/lib/db/powersync.ts` / `powersync.web.ts` — register `seededExercise` in `localOnlyCatalogTables` (both platform files, matching 03-01's dual-file precedent)
- `apps/mobile/lib/catalog/load-snapshot.ts` — writes seeded exercises into `seededExercise`, not `exercise`
- `apps/mobile/lib/catalog/__tests__/load-snapshot.test.ts` — updates the fake db's table set, rewrites the crud-visibility describe block into a regression guard asserting zero tracked crud entries after a full catalog load
- `apps/mobile/app/exercises/index.tsx` / `[id].tsx` — read a union of `seededExercise` and custom (`is_custom = true`) `exercise` rows
- `ops/powersync/sync-rules.yaml` — adds `SELECT * FROM user_exercise_preference WHERE user_id = auth.user_id()`; updates the top comment to note the seeded half of `exercise` is now also structurally excluded from sync
- `docs/catalog-load-types.md` (new) — per-`load_type` reference table, dual-axis resolution rule, `bodyweight_contribution_pct` semantics, per-family seed defaults

## Decisions Made

- **Task 1's checkpoint was answered by a live human, not auto-selected**, per this run's continuation instructions. Selected `flat-six` (one flat six-value enum). Verbatim rationale accepted: forces exactly one classification per exercise, matching ROADMAP criterion 4's "settled before any logging UI exists"; a genuinely dual-axis movement (weighted carry) is classified by whichever axis drives progression math, the other captured as cue text.
- **WINDOWS #32 fixed via a localOnly table split, not an upload-path filter** (orchestrator-directed scope addition). Evaluated both options named in the scope-addition prompt: (a) a separate localOnly seeded-exercise table with a unioned read path, and (b) a source-scoped filter in `SyncConnector.uploadData()`. Chose (a) because it is structural — PowerSync installs no CRUD trigger at all on a `localOnly` table, so seeded rows never generate a `ps_crud` entry in the first place — versus (b), which would still let PowerSync's insert trigger populate `ps_crud` for every seeded row (wasted local storage/CPU even if never uploaded) and has no clean partial-completion API on a `CrudTransaction` (`transaction.complete()` is all-or-nothing for the whole batch, so selectively dropping only the seeded-row ops without either losing custom-exercise ops or looping forever on the dropped ones would require hand-rolled bookkeeping this codebase doesn't have). Rejected trade-off: (a) requires two-query reads in every picker going forward (accepted, matches the existing sequential-query style already used in these screens) versus (b)'s single-table simplicity (rejected, because it doesn't actually close the trigger-level cost, only the network-level symptom).
- **Read paths use two plain `select`s, not a SQL `UNION`**, to avoid depending on RESEARCH.md Pattern 1's own flagged-as-unverified combination (a mixed plain/localOnly `DrizzleAppSchema`'s query-wrapper support for `UNION` has not been exercised anywhere in this codebase).
- **Task 2 and the WINDOWS #32 fix were committed together** rather than split into two commits, because they share a coupled file (`apps/mobile/lib/db/schema.ts`) and splitting would leave an intermediate commit state that does not typecheck or pass tests standalone.

## Deviations from Plan

### Auto-fixed Issues

None beyond the explicitly orchestrator-directed WINDOWS #32 scope addition, which is documented above as a decision, not an unplanned auto-fix — it was pre-authorized by the human at the wave boundary, not discovered mid-task and silently patched.

---

**Total deviations:** 0 unplanned auto-fixes. 1 orchestrator-directed scope addition (WINDOWS #32), delivered and documented per the explicit prompt instructions.
**Impact on plan:** The scope addition touched one already-in-scope file (`apps/mobile/lib/db/schema.ts`) plus its direct dependents (`powersync.ts`/`.web.ts`, `load-snapshot.ts`, the two exercise screens, the load-snapshot test file) — no expansion beyond files a schema-shape change in this exact area would naturally touch.

## Issues Encountered

- **`.env` missing in this git worktree.** `.env` is gitignored, so a freshly created worktree has no copy — `pnpm --filter api db:push` failed with "Either connection url or host/database are required" until `.env` was copied from the main checkout (a benign local operation; the file stays untracked and gitignored in the worktree too, confirmed via `git status`).
- **`@fitness/api-contracts` had no `dist/` in this fresh worktree**, same issue 03-01 hit — `pnpm --filter api typecheck` failed with `Cannot find module '@fitness/api-contracts'` until `pnpm --filter @fitness/api-contracts build` ran. Not a plan defect; resolved before Task 2 verification.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The `load_type` vocabulary, `bodyweight_contribution_pct`, and `user_exercise_preference` are all live in Postgres and documented — 03-03 (custom exercise create/edit via the sync push path, per RESEARCH.md Pattern 2) can now extend `sync.service.ts`'s `hasInvalidField`/`patch-update-set.ts` against a real, constrained schema instead of an undefined one.
- WINDOWS #32 is closed. WINDOWS #33 (real-engine confirmation of the zero-crud claim) and #34 (offline first-boot UI never observed rendered) remain open and unaffected by this plan's scope — both still need a browser/device environment this sandboxed machine does not have.
- `docs/catalog-load-types.md`'s per-family seed defaults are ready for 03-04 (normalization) and 03-05 (~900-row seed) to consume directly rather than re-deriving.
- **New follow-up surfaced, not yet filed as a WINDOWS entry**: once 03-03 builds custom-exercise creation, `exercises/index.tsx`/`[id].tsx`'s two-query union approach should be re-verified against real custom rows (currently the `exercise` half of the union is always empty, since no write path into it exists yet) — the union logic is written and typechecks, but has never had a non-empty `exercise` table to read from.

## Self-Check: PASSED

All 11 modified files and 1 created file (`docs/catalog-load-types.md`) confirmed present on disk. Commit hash `9063ae1` confirmed present in `git log --oneline --all`. Live-database verification (CHECK constraint existence, column presence, bad-insert rejection) confirmed directly against Postgres via `psql`-equivalent `pg` client queries, not merely inferred from test output.

---
*Phase: 03-exercise-catalog*
*Completed: 2026-08-18*
