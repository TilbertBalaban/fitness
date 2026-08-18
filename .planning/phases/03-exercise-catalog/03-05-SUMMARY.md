---
phase: 03-exercise-catalog
plan: 05
subsystem: database
tags: [postgres, drizzle, nestjs, powersync, catalog-delivery, offline-images, seed-data]

requires:
  - phase: 03-exercise-catalog
    provides: "03-04's catalog-normalized.json (870-exercise CatalogSnapshot artifact, content-addressed catalog_version) and docs/catalog-dataset-license.md's image-licensing finding"
provides:
  - "apps/api/src/seed/seed-catalog.ts — seedCatalog(db, snapshot), the idempotent Postgres upsert (muscle_group/exercise/exercise_muscle_mapping) scoped to source='seed' AND user_id IS NULL, with archive-not-delete drift handling"
  - "apps/api/src/catalog/ — the read-only ExerciseCatalogModule (CatalogController/CatalogService): GET /v1/catalog/version and GET /v1/catalog/download, AllowAnonymous, ETag/If-None-Match 304 handshake"
  - "apps/mobile/assets/catalog/catalog-snapshot.json — the real 870-exercise bundled device snapshot, byte-identical catalog_version to the server artifact (replaces 03-01's 3-exercise tracer fixture)"
  - "apps/mobile/lib/catalog/refresh-catalog.ts — refreshCatalog(db), the background version-handshake refresh path (current/updated/offline/invalid), exported but deliberately uncalled — 03-06 wires it"
  - "apps/mobile/lib/catalog/load-snapshot.ts's applyCatalogSnapshot(tx, snapshot) — the one write path both the bundled load and refreshCatalog go through, so they can never diverge"
  - "apps/mobile/assets/catalog/images/ — 1740 vendored JPEGs (870 exercises x 2) plus image-manifest.json, downloaded from free-exercise-db per the fedb-with-images decision — NOT yet wired into the render layer (see Known Stubs)"
affects: [03-06 (wires refreshCatalog into the exercises screen mount and is expected to wire ExerciseImageTile to local images), any future plan touching apps/api/src/catalog or apps/mobile/lib/catalog]

actuals:
  tokens: 39600
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Shared apply-path extraction: applyCatalogSnapshot(tx, snapshot) is the single write path both loadCatalogSnapshot (bundled first-install) and refreshCatalog (later downloaded artifact) call through, so the two can never diverge — mirrors seed-catalog.ts's equivalent server-side single-path design"
    - "Version-handshake + ETag/If-None-Match 304 delivery for a public, unauthenticated, read-only content endpoint — the payload is held in memory at service construction (build-time constant), so a request storm issues zero database queries"
    - "Archive-not-delete drift convergence, mirrored identically on server (Postgres exercise.archived_at) and client (SQLite seededExercise.archivedAt) — a seeded row absent from a newer artifact is stamped archived, never hard-deleted, because personal_record.exercise_id / session_exercise.exercise_id are both notNull"
    - "localOnly-table structural guarantee: seeded rows write only to apps/mobile's seededExercise table, never the PowerSync-synced exercise table (WINDOWS #32's fix) — 'a refresh cannot touch a user's custom exercise' is a structural fact from table separation, not a WHERE is_custom=false filter a future edit could accidentally drop"

key-files:
  created:
    - apps/api/src/seed/seed-catalog.ts
    - apps/api/test/seed-catalog.e2e-spec.ts
    - apps/api/src/catalog/catalog.controller.ts
    - apps/api/src/catalog/catalog.service.ts
    - apps/api/src/catalog/catalog.module.ts
    - apps/api/test/catalog-delivery.e2e-spec.ts
    - apps/mobile/lib/catalog/refresh-catalog.ts
    - apps/mobile/lib/catalog/__tests__/refresh-catalog.test.ts
    - apps/mobile/assets/catalog/image-manifest.json
    - apps/mobile/assets/catalog/images/ (1740 files)
    - scripts/sync-catalog-snapshot.cjs
    - scripts/vendor-catalog-images.cjs
  modified:
    - apps/api/src/app.module.ts
    - apps/api/package.json
    - apps/mobile/assets/catalog/catalog-snapshot.json
    - apps/mobile/lib/catalog/load-snapshot.ts
    - apps/mobile/lib/catalog/__tests__/load-snapshot.test.ts
    - apps/mobile/lib/db/schema.ts
    - .planning/WINDOWS.md

key-decisions:
  - "This SUMMARY is a reconstruction, not a live-executed report. The original executor completed all four commits (0f8a43d, a36929e, 6aa0ea4, 9c7de99) correctly and was killed by an API connection drop at the exact moment it began writing this file. The orchestrator merged its worktree to main (all commits intact) and separately recovered one in-flight uncommitted change — the WINDOWS #36 stub entry — as commit dfb403a, attributed to the orchestrator with Co-Authored-By trailer. This run inspected the five commits' diffs and the resulting source directly, then re-ran every verification the plan specifies against a live local Postgres, rather than trusting the plan's prose or the commit messages' own claims."
  - "seedCatalog's blast-radius scoping (source='seed' AND user_id IS NULL) was confirmed to hold at real scale against this machine's shared local dev database, not just at unit-test scale: the database already carried 10 unrelated source='seed' rows from an earlier phase's generate-corpus.ts perf-test corpus (seed-ex-back-squat, seed-ex-bench-press, etc.), and seed-catalog.ts's archive-drift step correctly archived all 10 as drift (they carry source='seed' but are absent from the 870-exercise catalog artifact) without touching, duplicating, or crashing on them. This is evidence the archive-not-delete design works against a real pre-existing corpus it was never specifically tested against, not a synthetic fixture."
  - "The vendored 97MB / 1740 images are genuinely available offline (committed local files, not runtime fetches to raw.githubusercontent.com) but are explicitly NOT wired into the render layer in this plan. ExerciseImageTile.tsx still only accepts a remote {uri} prop and falls back to 'No image available' text for every seeded exercise today, offline or online. This was declared as an intentional, tracked gap in the 9c7de99 commit message itself and filed as WINDOWS #36 — not an oversight discovered by this recovery run. WINDOWS #36 is left open; the human has since assigned the wiring work (a Metro static-require map plus an ExerciseImageTile prop-shape change) to plan 03-07."
  - "WINDOWS #35 (image-copyright risk — free-exercise-db's images were scraped without a documented source and the upstream project itself advises against commercial use) is unrelated to and unaffected by this plan's work. It remains open, as it must — this plan vendors the images per the human's already-reconfirmed 'keep images, ship anyway (non-commercial use)' decision from 03-04, and does not reopen or re-litigate that decision."

patterns-established:
  - "SUMMARY reconstruction from primary evidence (commit diffs + live re-verification) as the recovery path for an executor that completes its work but dies before writing its own SUMMARY.md — read commits and code directly rather than trusting plan prose or commit-message self-reports."

requirements-completed: [EXER-01, EXER-02, EXER-03]

coverage:
  - id: T1
    description: "Postgres holds every muscle group, exercise and muscle mapping the normalized artifact declares, and re-running the seed leaves the row counts unchanged"
    requirement: EXER-01
    verification:
      - kind: e2e
        ref: "pnpm --filter api seed:catalog run twice against a live local Postgres — 'Seeded 870 exercises, 19 muscle groups, 3134 mappings' both times, 0 newly-archived on the second run"
        status: pass
      - kind: other
        ref: "psql SELECT count(*) FROM muscle_group returns 19; SELECT count(*) FROM exercise WHERE load_type IS NULL OR load_type='' returns 0"
        status: pass
    human_judgment: false
  - id: T2
    description: "Seeding twice does not duplicate a row and does not overwrite a user's custom exercise — the seed touches only rows whose source is seed and whose user_id is null"
    requirement: EXER-01
    verification:
      - kind: unit
        ref: "apps/api/test/seed-catalog.e2e-spec.ts (savepoint-isolated, never touches the real seeded catalog)"
        status: pass
      - kind: other
        ref: "Live-DB observation: 10 pre-existing source='seed' rows from an unrelated earlier corpus were correctly archived as drift by the scoped statement, without any source!='seed' or non-null-user_id row in reach"
        status: pass
    human_judgment: false
  - id: T3
    description: "GET /v1/catalog/version and GET /v1/catalog/download satisfy the version handshake, ETag/If-None-Match 304 path, and reject every mutation verb"
    requirement: EXER-02
    verification:
      - kind: e2e
        ref: "apps/api/test/catalog-delivery.e2e-spec.ts — 7/7 passing against a spawned built API + live Postgres"
        status: pass
    human_judgment: false
  - id: T4
    description: "The bundled mobile snapshot is byte-identical (by catalog_version) to the committed normalized artifact, and the device ships the full ~870-exercise catalog"
    requirement: EXER-03
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/refresh-catalog.test.ts — 'bundled snapshot version parity' case"
        status: pass
      - kind: other
        ref: "node -e check: mobile catalog-snapshot.json catalog_version (fb701c18b7999d47) === apps/api catalog-normalized.json catalog_version; exercises.length === 870"
        status: pass
    human_judgment: false
  - id: T5
    description: "With the device offline, refreshCatalog fails silently and leaves the locally-loaded catalog intact; a refresh that downloads a newer version replaces seeded rows without touching a user's custom exercise"
    requirement: EXER-03
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/refresh-catalog.test.ts — 6/6 passing (current/updated/offline/invalid outcomes, plus the real-applyCatalogSnapshot custom-row-survives case)"
        status: pass
    human_judgment: false
  - id: T6
    description: "1740 catalog images (870 exercises x 2) are vendored into the app bundle for offline availability, per the fedb-with-images decision"
    verification:
      - kind: other
        ref: "apps/mobile/assets/catalog/images/ — 1740 files confirmed on disk, 97MB total, image-manifest.json maps all 870 exercise ids"
        status: pass
    human_judgment: false
  - id: T7
    description: "Vendored images render offline in the exercise detail UI"
    verification: []
    human_judgment: true
    rationale: "Explicitly NOT done in this plan — ExerciseImageTile.tsx still only accepts a remote {uri} and shows 'No image available' for every seeded exercise. Tracked as WINDOWS #36 (open), assigned to plan 03-07. This deliverable should read as 'images downloaded and committed' only, not 'images visible to a user'."

duration: ~42min executor work (15:04:41-15:46:29Z, incl. orchestrator's 1-line recovery commit) + this recovery/reconstruction run
completed: 2026-08-18
status: complete
---

# Phase 3 Plan 5: Postgres Seed, Catalog Delivery Endpoint, Device Snapshot & Image Vendoring Summary

**870-exercise catalog seeded idempotently into Postgres and shipped as an identical bundled mobile snapshot, delivered over a new read-only, ETag-cached `GET /v1/catalog/*` endpoint, with 1740 exercise images vendored to disk for offline availability — but not yet wired into any render component.**

## Performance

- **Duration:** ~42 min of executor work across 4 commits (15:04:41Z-15:30:17Z), plus an orchestrator-recovered 1-line WINDOWS entry (15:46:29Z) after the executor's connection dropped mid-write of this file
- **Completed:** 2026-08-18
- **Tasks:** 3 (all three plan tasks executed and committed by the original executor)
- **Files modified:** ~14 source/test/script files + 1 WINDOWS.md entry + 1740 vendored image binaries + 1 generated manifest

## Accomplishments

- **`seed-catalog.ts`** — idempotent, chunked (250-row batches under Postgres's 65535-parameter ceiling) upsert of all 870 exercises, 19 muscle groups, and 3134 deduplicated muscle mappings into Postgres, scoped to `source='seed' AND user_id IS NULL` on every statement. A self-referencing `variation_of_id` resolution runs as a second pass after every exercise row exists, avoiding forward-reference FK failures across chunk boundaries. Archive-drift (never delete) is proven live: this run's re-verification found 10 unrelated, pre-existing `source='seed'` rows from an earlier phase's perf-test corpus already sitting in the shared local dev database, and `seed-catalog.ts` correctly archived all 10 as drift on a prior run without duplicating, deleting, or crashing on them — real evidence the design holds outside its own unit tests.
- **`ExerciseCatalogModule`** — the phase's one allowed new REST surface (D-01's carve-out): `GET /v1/catalog/version` and `GET /v1/catalog/download`, `@AllowAnonymous()`, versioned under `/v1/`, no mutation verb exists on the controller. The download handler honors `If-None-Match` against a quoted ETag derived from `catalog_version` and returns 304 with no body on a match. `CatalogService` loads the artifact once at construction (build-time constant), so an unauthenticated request storm issues zero database queries.
- **Device snapshot replaced.** `apps/mobile/assets/catalog/catalog-snapshot.json` is now a byte-identical copy (by `catalog_version`) of the server's `catalog-normalized.json` — 870 exercises, replacing 03-01's 3-exercise placeholder. `scripts/sync-catalog-snapshot.cjs` performs the copy as a one-command fix for future re-normalizations, with a version-parity test that fails loudly if the copy is ever forgotten.
- **`refreshCatalog`** — the background version-handshake path, resolving to `current`/`updated`/`offline`/`invalid` and never throwing. Shares its write path (`applyCatalogSnapshot`) with the bundled first-install loader so the two can never diverge. Deliberately exported but uncalled — `app/_layout.tsx` is out of this plan's file scope; 03-06 wires it from the exercises screen's mount.
- **1740 images vendored** (870 exercises x 2, 97MB) to `apps/mobile/assets/catalog/images/`, with a committed `image-manifest.json` lookup table — genuinely available offline (committed local bytes, not a runtime fetch), satisfying the `fedb-with-images` decision's offline-availability half. **Does not** satisfy the "visible to a user" half: `ExerciseImageTile.tsx` is unchanged and still only accepts a remote `{uri}`, so today every seeded exercise still renders "No image available" whether online or offline. This gap was declared explicitly in the executor's own commit message, not discovered after the fact, and is tracked as WINDOWS #36 (open).
- **WINDOWS #32's client-side fix confirmed to hold at 870-row scale.** Seeded rows write only to `seededExercise` (a PowerSync `localOnly` table), never the synced `exercise` table — a structural guarantee from table separation, re-verified directly in the current source (`load-snapshot.ts`'s `applyCatalogSnapshot`) rather than assumed from the commit message.

## Task Commits

Each task was committed atomically by the original executor:

1. **Task 1: Seed the normalized catalog into Postgres, idempotently and without touching custom rows** — `0f8a43d` (feat)
2. **Task 2: The read-only ExerciseCatalogModule and the version handshake** — `a36929e` (feat)
3. **Task 3: Ship the real snapshot to the device and refresh it in the background** — `6aa0ea4` (feat), with the image-vendoring half of Task 3's file scope landing as a follow-on commit `9c7de99` (feat) — vendoring 1740 images was executed as real, verified work but exceeded a single commit's natural scope

**Recovery commit:** `dfb403a` (docs) — the WINDOWS #36 entry, recovered by the orchestrator from the dead executor's uncommitted working-tree change after the connection drop; attributed to the orchestrator via its own `Co-Authored-By` trailer, not folded into any of the four feature commits above.

**Plan metadata:** this SUMMARY.md commit (docs) — written by this recovery run from the five commits' diffs and a live re-verification, not by the original executor.

## Files Created/Modified

- `apps/api/src/seed/seed-catalog.ts` — `seedCatalog(db, snapshot)`, `main()` entrypoint
- `apps/api/test/seed-catalog.e2e-spec.ts` — savepoint-isolated idempotency/archive-drift/rename tests
- `apps/api/src/catalog/catalog.controller.ts`, `catalog.service.ts`, `catalog.module.ts` — the read-only catalog delivery module
- `apps/api/test/catalog-delivery.e2e-spec.ts` — version/download/304/426/method-not-allowed matrix
- `apps/api/src/app.module.ts` — registers `CatalogModule`
- `apps/api/package.json` — adds `seed:catalog` script
- `apps/mobile/assets/catalog/catalog-snapshot.json` — replaced with the real 870-exercise artifact
- `apps/mobile/lib/catalog/load-snapshot.ts` — extracts `applyCatalogSnapshot(tx, snapshot)` as the shared write path
- `apps/mobile/lib/catalog/refresh-catalog.ts` — `refreshCatalog(db)`, `RefreshOutcome` union
- `apps/mobile/lib/catalog/__tests__/refresh-catalog.test.ts`, updated `load-snapshot.test.ts`
- `apps/mobile/lib/db/schema.ts` — adds `seededExercise.archivedAt`
- `apps/mobile/assets/catalog/image-manifest.json` — exercise id → local image path lookup (870 entries)
- `apps/mobile/assets/catalog/images/**` — 1740 vendored JPEGs
- `scripts/sync-catalog-snapshot.cjs`, `scripts/vendor-catalog-images.cjs` — reusable, committed automation for both artifacts
- `.planning/WINDOWS.md` — adds entry #36 (image-wiring stub)

## Decisions Made

See `key-decisions` in frontmatter for full detail. Summary:
- This SUMMARY is a from-evidence reconstruction after the original executor died mid-write; every fact below was re-derived from commit diffs, current source, and a live re-run of the plan's verification, not copied from the plan's prose.
- The seed's blast-radius scoping was confirmed against real pre-existing drift in the shared dev database, not just synthetic test fixtures.
- Image vendoring (download + commit to disk) is complete; image rendering (wiring into `ExerciseImageTile`) is explicitly out of scope here and tracked as WINDOWS #36, assigned to 03-07.
- WINDOWS #35 (image-copyright risk) is unrelated to and unaffected by this plan; it stays open per the already-reconfirmed human decision from 03-04.

## Deviations from Plan

### Auto-fixed Issues

None found in the committed diffs — no Rule 1/2/3 auto-fixes are recorded in any of the four feature commits' messages, and this recovery run's re-verification did not surface any bug requiring a fix.

### Process Deviation (not a code fix)

**1. Executor died mid-write of this SUMMARY.md; orchestrator recovered one in-flight change**
- **Found during:** end-of-plan SUMMARY authoring (the original executor's session)
- **Issue:** An API connection drop killed the executor after all four task commits landed cleanly but before `03-05-SUMMARY.md` could be written. The executor's worktree had one further uncommitted change on disk: the WINDOWS #36 entry documenting the image-wiring gap.
- **Fix:** The orchestrator merged the worktree's four commits to main (verified intact, unmodified) and separately committed the WINDOWS #36 change as `dfb403a`, correctly attributed to itself rather than the dead executor. This run (a fresh recovery agent) then reconstructed `03-05-SUMMARY.md` from the five commits' diffs and a live re-verification.
- **Files affected:** `.planning/WINDOWS.md` (commit `dfb403a`), `03-05-SUMMARY.md` (this file)
- **Verification:** All five commits confirmed present in `git log --oneline --all`; every plan task's automated `<verify>` command re-run against a live local Postgres and passing (see below).

---

**Total deviations:** 0 code-level auto-fixes; 1 process-level recovery event (executor death, not a plan defect).
**Impact on plan:** None on shipped code — the four feature commits are exactly what a normal, uninterrupted execution would have produced. The only artifact this recovery run itself authored is this SUMMARY.

## Issues Encountered

- **Fresh worktree had no `@fitness/api-contracts` `dist/`.** Same recurring issue 03-01/03-02/03-04 recorded — `pnpm --filter @fitness/api-contracts build` had to run before the mobile Jest suites could resolve the workspace import. Not a plan defect; ran it before re-verifying.
- **No `DATABASE_URL` configured in this worktree by default.** The API e2e suite's own `db:push` step fails immediately without it. A live local Postgres (`fitness` database) was already running on this machine; setting `DATABASE_URL` explicitly for the verification commands was sufficient. Not a plan defect — the same gap would block any fresh worktree without a `.env`.
- **Full `pnpm --filter api test:e2e` (all 17 suites) was also run for completeness, beyond the plan's own scoped `catalog-delivery`-only verify command.** 16/17 suites passed (122/127 tests). The one failing suite, `powersync-token.e2e-spec.ts` (5 failures), fails entirely because `POWERSYNC_JWT_SECRET`/`POWERSYNC_URL` are not set in this worktree — a pre-existing environment/infra gap unrelated to `03-05`'s file scope (it touches `apps/api/src/sync/`, not `apps/api/src/catalog/`). `catalog-delivery.e2e-spec.ts` itself passed within the full run, and `schema-parity.e2e-spec.ts` (named explicitly in the plan's `<verification>` block) also passed. This is reported honestly rather than omitted: the plan's stated `<verification>` line ("full suite... exits 0") did not literally exit 0 in this environment, but the failure is fully attributable to missing PowerSync env configuration, not to any 03-05 commit.

## User Setup Required

None for this plan's own deliverables. `POWERSYNC_JWT_SECRET`/`POWERSYNC_URL` would need to be set in this worktree to run `powersync-token.e2e-spec.ts`, but that suite is unrelated to 03-05.

## Next Phase Readiness

- 03-06 can now wire `refreshCatalog` into the exercises screen's mount — the function is exported, tested (6/6), and deliberately uncalled.
- **03-07 (per the human's assignment recorded in WINDOWS #36) must wire the 1740 vendored images into the render layer** — `ExerciseImageTile.tsx` needs a Metro static-require map (dynamic `require()` with a literal path, per Metro's own limitation) and a prop-shape change, plus updating its 2 call sites. Until then, the 97MB of vendored images sits in the bundle without delivering the offline imagery it was added for.
- **WINDOWS #35 (image-copyright risk, open) and WINDOWS #36 (image-wiring stub, open) should both be re-read before `/gsd-ship`.** Neither is resolved or waived by this plan.
- The catalog now exists identically in three places (committed artifact, Postgres, bundled device snapshot) as the plan's own success criteria require, confirmed by direct re-verification, not merely by re-reading commit messages.

## Self-Check: PASSED

All key files confirmed present on disk (`seed-catalog.ts`, `catalog.controller.ts`, `refresh-catalog.ts`, `catalog-snapshot.json`, `image-manifest.json`, 1740 image files, `WINDOWS.md` entry #36). All five commit hashes (`0f8a43d`, `a36929e`, `6aa0ea4`, `9c7de99`, `dfb403a`) confirmed present in `git log --oneline --all`. Every automated `<verify>` command from the plan was actually re-run against a live local Postgres and the current worktree (not inferred): `seed:catalog` run twice (idempotent, 880 stable `source='seed'` rows including 10 pre-existing archived-drift rows), `catalog-delivery.e2e-spec.ts` (7/7), `refresh-catalog.test.ts` (6/6), `load-snapshot.test.ts` (10/10), `pnpm --filter mobile build` (exit 0, full-size JSON asset bundled), catalog_version parity confirmed by direct `node -e` check, and the full `pnpm --filter api test:e2e` suite (16/17 suites, 122/127 tests — the one failing suite is an unrelated environment gap, documented above).

---
*Phase: 03-exercise-catalog*
*Completed: 2026-08-18*
