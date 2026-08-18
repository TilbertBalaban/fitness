---
phase: 03-exercise-catalog
verified: 2026-08-18T20:47:52Z
status: human_needed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Cold-boot the app offline (no network), open /exercises, confirm the seeded catalog list renders with rows and thumbnails painting from the vendored bundle, then open one exercise and confirm its detail screen renders (name, image, target muscles, cues, instructions, suggested alternatives)."
    expected: "List and detail screens render populated content with real images painting on screen, entirely offline — no blank screen, no broken-image icon, no network request fired (verify via a network panel/proxy)."
    why_human: "No browser, simulator, or device was driven in this session (CLAUDE.md forbids launching a browser unless explicitly asked; no Xcode/Android SDK on this machine). All evidence is at the typecheck/unit-test/bundler level (WINDOWS #34, #38, #39, #36)."
  - test: "Scroll the ~870-row exercise list continuously top to bottom on a real device or browser."
    expected: "FlashList renders and scrolls all rows without dropped frames or visible jank."
    why_human: "Performance/frame-drop behavior cannot be observed via typecheck or Jest; only bundler-level proof exists that FlashList is wired (WINDOWS #37)."
  - test: "Open the Add Custom Exercise form, leave it blank, and confirm: placeholder tracking-type text, inline per-field errors on invalid submit, Save disabled (not hidden) until name+load_type are set, multiline cue/instructions field auto-grows then scrolls, muscle-mapping chip picker works, and opening a seeded exercise's Edit route (as a non-owner) shows a not-permitted state."
    expected: "All six rendered behaviors match the UI-SPEC exactly."
    why_human: "No @testing-library/react-native in this codebase and no simulator/device available; verified instead via 33 unit tests over extracted presentational logic plus typecheck/bundling (WINDOWS #41)."
  - test: "Open an exercise detail screen and confirm the Suggested Alternatives section renders candidate rows with thumbnail, name, and a plain-language why string, plus the empty state and Browse Catalog link when no candidates qualify."
    expected: "Rendered rows match SwapSuggestionList's intended layout; why-strings are never blank."
    why_human: "Never observed in a real browser/device — verified via 20 scorer unit tests + 7 direct-invocation component tests + typecheck/bundling only (WINDOWS #46)."
  - test: "Run loadCatalogSnapshot against a real PowerSync engine (real browser, real Worker/IndexedDB) via a Playwright e2e case and confirm zero ps_crud entries are generated for muscle_group/exercise_muscle_mapping/catalog_meta writes."
    expected: "Zero sync-traffic rows for these three localOnly tables, matching the already-passing Jest-mock-based assertion."
    why_human: "new PowerSyncDatabase() from @powersync/web hangs indefinitely under this project's Jest/Node sandbox; the claim is proven only against a faithful mock of PowerSync's documented per-table trigger behavior, not a real engine (WINDOWS #33)."
  - test: "Full native (iOS/Android) pass over every catalog screen — list, detail, create/edit forms, archive dialog, swap suggestions."
    expected: "Same behavior as the web/unit-test-verified logic, rendered correctly on native chrome."
    why_human: "No Xcode or Android SDK on this machine. Consistent with every prior phase's native gap; per project convention this is swept once at ROADMAP Phase 999.1 rather than per-phase."
---

# Phase 3: Exercise Catalog Verification Report

**Phase Goal:** The user can find any exercise they train, and the catalog carries the muscle and load metadata everything downstream depends on.
**Verified:** 2026-08-18T20:47:52Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can search ~870 exercises by name (and alias), with Unicode/diacritic-insensitive fuzzy matching, empty query returning the full catalog | ✓ VERIFIED | `apps/mobile/lib/catalog/search-index.ts` — MiniSearch index over name+aliases, NFC/diacritic-stripped `normalizeText`, empty/whitespace query short-circuits to full sorted list. Backed by 6 passing unit tests (`search-index.test.ts`), wired into `app/exercises/index.tsx` |
| 2 | User can filter by muscle group, equipment, and movement pattern, AND across dimensions, OR within a dimension | ✓ VERIFIED | `apps/mobile/lib/catalog/catalog-filter.ts::applyCatalogFilters` + `deriveFacets`; 21 passing unit tests (`catalog-filter.test.ts`); wired into `FilterChipRow` in `index.tsx` |
| 3 | User can open an exercise and see target muscles, equipment, setup instructions, technique cues, and static images | ✓ VERIFIED | `apps/mobile/lib/catalog/exercise-detail.ts::loadExerciseDetail` joins exercise + muscle mapping + muscle group in one query; rendered via `app/exercises/[id].tsx`, `MuscleTargetList.tsx`, `DetailSection.tsx` (which correctly omits empty sections). 10+5 passing unit/component tests |
| 4 | User can create a custom exercise with name, target muscles, equipment, and tracking type (load type), with client-side validation before any write is queued | ✓ VERIFIED | `apps/mobile/lib/catalog/custom-exercise.ts::createCustomExercise` + `validateCustomExercise`; `app/exercises/new.tsx` exposes all 6 `LOAD_TYPES` as picker options; wired via `submitNewExercise`. 33 passing unit tests (`custom-exercise.test.ts`) |
| 5 | User can edit or duplicate a custom exercise; edit is ownership-gated, duplicate copies mappings and leaves the source untouched | ✓ VERIFIED | `custom-exercise.ts::updateCustomExercise` (ownership check `not_owner`) and `duplicateExercise` (fresh UUID, `variation_of_id` set, source row read-only); `app/exercises/edit/[id].tsx` gates on `resolveEditAccess`. Server-side ownership enforcement independently verified in `exercise-sync.e2e-spec.ts` (not_owner rejection tests, all passing per orchestrator's e2e run) |
| 6 | Archiving an exercise removes it from pickers/search while past logged sets remain intact and correctly attributed; archiving is per-user and idempotent | ✓ VERIFIED | `apps/mobile/lib/catalog/preferences.ts::setArchived` writes only `user_exercise_preference` (never `exercise.archived_at`/`seededExercise.archived_at`); `catalog-filter.ts::buildArchivedSet` unconditionally excludes archived rows from every picker read. `session_exercise.exercise_id` / `logged_set` carry no cascade from this table, and `user-exercise-preference.e2e-spec.ts`'s own test explicitly asserts "session_exercise/personal_record rows referencing that exercise stay resolvable" after archiving. Idempotency directly unit-tested: "calling setArchived(..., true) twice leaves archivedAt at its original value" |
| 7 | User can mark an exercise never-suggest without archiving it (independent per-user flags) | ✓ VERIFIED | `preferences.ts::setNeverSuggest` writes only `neverSuggest`; `smart-swap.ts::buildNeverSuggestSet` excludes it from suggestions while `catalog-filter.ts` leaves it visible/searchable (only `archivedAt` gates the picker) |
| 8 | Every exercise carries an explicit load type from a fixed 6-member vocabulary (external_weight, bodyweight, bodyweight_plus_added, assisted, time_based, distance_based), enforced by both a Postgres CHECK constraint and application validation, and every value is representable in the custom-exercise create form before any logging UI exists | ✓ VERIFIED | `apps/api/src/db/schema/catalog.ts:58-61` CHECK constraint lists all 6 values; `packages/api-contracts/src/catalog.ts` LOAD_TYPES tuple mirrors it; `apps/mobile/app/exercises/new.tsx:19` maps `LOAD_TYPES` (all 6) to picker options. **Note:** 0 of 870 seeded rows use `distance_based` today (no `LOAD_TYPE_RULES` entry in `catalog-taxonomy.ts` currently classifies to it) — representability is real (schema + UI both accept it), but no seed exercise currently exercises that specific value. Not a gap against the roadmap wording ("representable... before any logging UI exists"), but worth knowing the value is currently reachable only via a user-created custom exercise |
| 9 | User can request suggested alternatives for any exercise; suggestions are deterministic, explainable, exclude archived/never-suggested candidates and the target itself, and never blank | ✓ VERIFIED | `apps/mobile/lib/catalog/smart-swap.ts::scoreAlternatives` — pure function, fixed reviewable weights (no ML/embedding), excludes target/archived/never-suggested, `explainMatch` never returns empty. 20 passing unit tests + 7 component tests. Wired into `app/exercises/[id].tsx` via `SwapSuggestionList` |

**Score:** 9/9 truths verified (0 present-but-behavior-unverified)

### Fixed During This Verification Cycle (pre-existing, confirmed resolved)

| Issue | File | Status |
|-------|------|--------|
| CR-01 (03-REVIEW.md): exercise list thumbnails fetched from `raw.githubusercontent.com` instead of the vendored local bundle, violating offline-first | `apps/mobile/app/exercises/index.tsx`, `apps/mobile/components/ExerciseListRow.tsx` | ✓ Confirmed fixed in commit `1169067`. `index.tsx` now passes `localSource={getLocalCatalogImage(item.id)}` into `ExerciseListRow`, which forwards it to `ExerciseImageTile`, whose `source` resolution (`localSource != null ? localSource : uri ? { uri } : null`) prefers the vendored asset. Verified by direct code read — every catalog render path (list, detail, swap-suggestions) now resolves images via `getLocalCatalogImage`, with `imageUri` remaining only as a fallback for custom exercises that have no vendored-bundle entry |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api-contracts/src/catalog.ts` | LOAD_TYPES/MUSCLE_GROUPS/MOVEMENT_PATTERNS/EQUIPMENT_TYPES const tuples + `isCatalogSnapshot` | ✓ VERIFIED | Present, exported, used by both API and mobile |
| `apps/api/src/db/schema/catalog.ts` | exercise/exercise_muscle_mapping/muscle_group/user_exercise_preference tables + CHECK constraint | ✓ VERIFIED | All present with correct FKs, indexes, unique constraint |
| `apps/api/src/seed/normalize-catalog.ts`, `catalog-taxonomy.ts`, `seed-catalog.ts` | Deterministic normalization + idempotent seed | ✓ VERIFIED | Count-preservation invariant test, near-duplicate merge test present and passing |
| `apps/api/src/catalog/catalog.controller.ts` | `/v1/catalog/version`, `/v1/catalog/download` with ETag/304 | ✓ VERIFIED | Both endpoints present, `@AllowAnonymous`, conditional-GET 304 path implemented correctly |
| `apps/mobile/lib/catalog/{load-snapshot,refresh-catalog,search-index,catalog-filter,exercise-detail,custom-exercise,preferences,smart-swap}.ts` | Pure, unit-tested catalog logic modules | ✓ VERIFIED | All present, substantive (not stubs), each backed by real unit test files (114 total test cases across these modules) |
| `apps/mobile/app/exercises/{index,[id],new,edit/[id]}.tsx` | List, detail, create, edit screens | ✓ VERIFIED | All present, wired to the lib modules above, no debt markers (TBD/FIXME/XXX/TODO/HACK) found |
| `apps/mobile/components/{ExerciseImageTile,ExerciseListRow,ArchiveDialog,SwapSuggestionList,MuscleTargetList,DetailSection,SearchField,FilterChipRow,SelectField}.tsx` | Presentational components | ✓ VERIFIED | All present, wired into the screens; ExerciseImageTile correctly unifies the placeholder/error/local/remote states into one component |
| `apps/mobile/assets/catalog/images/` (1740 files, 97MB) + `catalog-image-map.generated.ts` | Vendored offline image bundle + static require map | ✓ VERIFIED (bundler-level) | `find dist -iname '*.jpg' | wc -l` == 1740 confirmed in prior session per WINDOWS #39; all `require()` calls resolve at bundle time. Visual paint on screen unverified — routed to human verification |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/exercises/index.tsx` | `lib/catalog/load-snapshot.ts` | `loadCatalogSnapshot(db)` in mount `useEffect` | ✓ WIRED | |
| `app/exercises/index.tsx` | `lib/catalog/refresh-catalog.ts` | `void refreshCatalog(db)` fired after local read populates screen | ✓ WIRED | Never blocks first paint, fails silently offline |
| `app/exercises/index.tsx` row render | `lib/catalog/catalog-image-map.generated.ts` | `getLocalCatalogImage(item.id)` → `localSource` prop → `ExerciseImageTile` | ✓ WIRED | Fixed this cycle (previously read `imageUri` only, hitting the network) |
| `app/exercises/[id].tsx` | `lib/catalog/exercise-detail.ts` | `loadExerciseDetail(db, id)` | ✓ WIRED | |
| `app/exercises/[id].tsx` | `lib/catalog/preferences.ts` | `setArchived` / `setNeverSuggest` from Archive dialog / toggle press handlers | ✓ WIRED | |
| `app/exercises/[id].tsx` | `lib/catalog/custom-exercise.ts` | `duplicateExercise` from Duplicate button | ✓ WIRED | |
| `app/exercises/[id].tsx` | `lib/catalog/smart-swap.ts` | `scoreAlternatives` computed from `loadSwapCandidates`, rendered via `SwapSuggestionList` | ✓ WIRED | |
| `app/exercises/new.tsx` / `edit/[id].tsx` | `lib/catalog/custom-exercise.ts` | `submitNewExercise` / `submitEditExercise` | ✓ WIRED | |
| `apps/api/src/catalog/catalog.controller.ts` | `apps/api/src/catalog/catalog.service.ts` | `getVersion()` / `getEtag()` / `getSnapshot()` | ✓ WIRED | Covered by passing `catalog-delivery.e2e-spec.ts` |
| `apps/api/src/sync/sync.service.ts` | `exercise` / `user_exercise_preference` tables | ownership/root-type/dedup validators | ✓ WIRED | Covered by passing `exercise-sync.e2e-spec.ts` and `user-exercise-preference.e2e-spec.ts` (17/127 e2e suite, all passing per orchestrator) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| Exercise list rows | `results` (filtered/searched/sorted) | Real SQLite query via Drizzle (`loadCatalogRows`) over `seededExercise` + `exercise` tables | Yes | ✓ FLOWING |
| List row thumbnail | `localSource` | `getLocalCatalogImage(item.id)` → static `require()` map of 1740 vendored jpgs | Yes | ✓ FLOWING (post-fix; previously ⚠️ STATIC/network-dependent via `imageUri`) |
| Detail screen muscle targets | `detail.primaryMuscles` / `secondaryMuscles` | Real joined SQLite query (`loadExerciseDetail`) over `exercise_muscle_mapping` + `muscle_group` | Yes | ✓ FLOWING |
| Swap suggestions | `swapCandidates` | Real SQLite query (`loadSwapCandidates`) + pure `scoreAlternatives` computation, no hardcoded list | Yes | ✓ FLOWING |
| Catalog facets (filter chip options) | `facets` | `deriveFacets` computed live from loaded `catalog.rows` + `catalog.mappings` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Archive idempotency (state-transition invariant) | Unit test: "calling setArchived(..., true) twice leaves archivedAt at its original value" (`preferences.test.ts:120`) | Passing (part of orchestrator's reported mobile 282/282) | ✓ PASS |
| Server-side ownership rejection (not_owner) | e2e test: "rejects a PUT from an authenticated user targeting a seeded (null-owner) row with not_owner" (`exercise-sync.e2e-spec.ts:188`) | Passing (part of orchestrator's reported api e2e 127/127) | ✓ PASS |
| Duplicate-push idempotency | e2e test: "pushing the same PUT exercise op id twice leaves exactly one row" (`exercise-sync.e2e-spec.ts:174`) | Passing | ✓ PASS |
| Cross-user archive isolation | e2e test: "archiving a seeded exercise for user A leaves user B's view of it unarchived, and session_exercise/personal_record rows referencing that exercise stay resolvable" (`user-exercise-preference.e2e-spec.ts:223`) | Passing | ✓ PASS |
| Movement-pattern filter excludes NULL rows only when that filter is active (not a silent catalog-wide hide) | Code read: `catalog-filter.ts:101-106`, explicit comment confirms intent; rows remain reachable via search | ✓ Confirmed by direct read, matches documented design | ✓ PASS |
| Distance-based load type is a real, selectable option, not dead code | Code read: `new.tsx:19` `LOAD_TYPE_OPTIONS = LOAD_TYPES.map(...)` includes all 6 | ✓ Confirmed | ✓ PASS |

Full-suite runs (`npm test`, `pnpm --filter api test:e2e`) were not re-executed here — per the orchestrator's stated verification state, they were already run this session with 282/282 mobile, 50/50 api, 66/66 api-contracts, and 127/127 api e2e all passing, with zero cross-phase regressions.

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or found for this phase. Skipped — not a migration/tooling phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| EXER-01 | 03-01, 03-05, 03-06 | Search exercise library by name | ✓ Satisfied | search-index.ts, wired and tested |
| EXER-02 | 03-01, 03-04, 03-05, 03-06 | Filter by muscle group/equipment/movement pattern | ✓ Satisfied | catalog-filter.ts, wired and tested |
| EXER-03 | 03-01, 03-04, 03-05, 03-07 | View exercise detail | ✓ Satisfied | exercise-detail.ts + detail screen |
| EXER-04 | 03-03, 03-08 | Create custom exercise | ✓ Satisfied | custom-exercise.ts::createCustomExercise, server-side validated |
| EXER-05 | 03-03, 03-08 | Edit/duplicate custom exercise | ✓ Satisfied | custom-exercise.ts::updateCustomExercise/duplicateExercise |
| EXER-06 | 03-02, 03-03, 03-09 | Archive exercise, logged sets stay attributed | ✓ Satisfied | preferences.ts + e2e cross-user isolation test |
| EXER-07 | 03-02, 03-03, 03-09 | Never-suggest without deleting | ✓ Satisfied | preferences.ts::setNeverSuggest, independent of archive |
| EXER-08 | 03-01, 03-02, 03-04 | Load-type vocabulary representable pre-logging-UI | ✓ Satisfied (phase-3 scope: representability, not the logging UI itself) | CHECK constraint + LOAD_TYPES tuple + create-form picker |
| EXER-09 | (schema groundwork only, 03-02) | Bodyweight contribution accounted for in volume/load | Correctly Pending — out of phase-3 scope | `bodyweight_contribution_pct` column exists and is documented; the actual accounting math is explicitly deferred to Phase 5 per code comment in `apps/api/src/db/schema/catalog.ts:41-43`. Matches REQUIREMENTS.md's own "Pending" status |
| EXER-10 | 03-10 | Suggested alternatives (smart swap) | ✓ Satisfied | smart-swap.ts, deterministic and explainable |

**⚠️ Documentation gap (not a code gap):** `.planning/REQUIREMENTS.md`'s checkbox list and traceability table (lines 26-35, 203-212) mark only EXER-01/02/03/08 as `[x]`/Complete. EXER-04/05/06/07/10 are implemented and evidenced above but still show `[ ]`/Pending in that file — the last commit to touch REQUIREMENTS.md (`9066a4c`, plan 03-01) predates plans 03-08/03-09/03-10 that delivered this work, and no later plan updated it. EXER-09 is correctly left Pending (real gap, deferred to Phase 5 by design). Recommend updating REQUIREMENTS.md's checkboxes for EXER-04/05/06/07/10 to Complete before `/gsd-ship`, so the traceability record matches the actual codebase state this report confirms.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK` markers found in any of the 28 core catalog files scanned (API schema/seed/controller, mobile lib/catalog modules, mobile screens/components, api-contracts). No empty/stub implementations, no hardcoded-empty props flowing to render, no console.log-only handlers.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/mobile/lib/db/schema.ts` | n/a (WINDOWS #40) | `exercise_muscle_mapping` registered `localOnly` table-wide | ⚠️ Warning | Every custom exercise's own muscle mappings — not just seeded/duplicate-copied ones — never sync to a second device. The custom exercise's core row (name, load_type, etc.) does sync via the `exercise` table, but its target-muscle data stays device-local until a future per-user-mapping-sync plan is designed. Does not block EXER-04/05 (create/edit/duplicate all work correctly on one device) but is a real gap against this project's "phone and browser must converge" constraint for this one field. Honestly tracked, not hidden — carry forward, do not silently accept |
| `apps/mobile/app/exercises/new.tsx`, `edit/[id].tsx` | 23-71, 73-104 | `MuscleMappingPicker`/`MultilineField` duplicated verbatim between the two route files (03-REVIEW.md WR-02) | ⚠️ Warning (low severity) | Drift risk — a future fix to either component must be applied in both places with nothing enforcing sync. Not user-facing, purely a maintenance-cost item |
| `scripts/vendor-catalog-images.cjs`, `scripts/generate-catalog-image-map.cjs` | 66-71, 33-40 | Sparse-array `null` hole not filtered before `require()` generation (03-REVIEW.md WR-01) | ⚠️ Warning (low severity, latent) | Currently harmless — all 1740 images present with no holes — but a future partial-download re-vendor run could emit a `require()` for a nonexistent path and break the Metro bundle. Not exercised by the current data |

### Human Verification Required

See frontmatter `human_verification` list — 6 items, corresponding to WINDOWS #33, #34/#38, #37, #39/#36, #41, and #46, plus the standing native-platform gap (Xcode/Android SDK absent, deferred to ROADMAP Phase 999.1 per project convention and MEMORY.md's recorded precedent). None of these are logic/wiring gaps — every one is "verified at the typecheck/unit-test/bundler level, never observed rendered in a live browser, simulator, or device," which is consistent with every prior phase's documented pattern in this codebase and with CLAUDE.md's rule against launching a browser unless explicitly asked.

### Gaps Summary

No must-have truth, artifact, or key link failed. The one blocker found during code review (list-screen thumbnails hitting the network instead of the vendored bundle) was fixed in commit `1169067` and independently re-confirmed here by reading the current source of `apps/mobile/app/exercises/index.tsx`, `ExerciseListRow.tsx`, and `ExerciseImageTile.tsx` — the fix is real and correctly wired across every catalog render path (list, detail, swap suggestions).

Two items are worth carrying forward but do not block this phase:
1. **WINDOWS #40** (warning): custom exercises' muscle mappings don't yet sync cross-device. Real, honestly-tracked technical debt against the project's multi-device-convergence constraint, scoped narrowly to custom-exercise mapping rows (not the ~870 seeded exercises, which are fully synced/seeded).
2. **REQUIREMENTS.md staleness** (documentation only): EXER-04/05/06/07/10 checkboxes were never updated after 03-08/03-09/03-10 shipped. Recommend a one-line doc fix before `/gsd-ship`.

The image-licensing question (WINDOWS #35) was already put to a human and re-confirmed on the stated non-commercial-use ground — this is not an open decision awaiting verification, only a standing ship-time re-check condition if the project's distribution model ever changes.

The overall status is `human_needed` rather than `passed` solely because of the rendering/native-platform items above, none of which indicate a defect — they indicate untested-by-a-human-eye, which is this phase's honestly disclosed state, not a hidden gap.

---

_Verified: 2026-08-18T20:47:52Z_
_Verifier: Claude (gsd-verifier)_
