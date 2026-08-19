---
phase: 03-exercise-catalog
verified: 2026-08-19T12:00:00Z
status: human_needed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 9/9
  gaps_closed:
    - "G-03-2: /exercises rendered \"Exercise catalog couldn't load\" on every visit — applyCatalogSnapshot issued .onConflictDoUpdate()/.onConflictDoNothing() (SQLite UPSERT) against PowerSync-managed SQLite views, which SQLite refuses to prepare. Closed by plan 03-12: applyCatalogSnapshot rebuilt for all four catalog tables using read-existing-ids-then-branch (plain INSERT when new, condition-scoped UPDATE...WHERE id=? when existing) — no upsert clause anywhere in the write path."
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Scroll the ~870-row exercise list continuously top to bottom on a real device or browser."
    expected: "FlashList renders and scrolls all rows without dropped frames or visible jank."
    why_human: "Performance/frame-drop behavior cannot be observed via typecheck or Jest; only bundler-level proof exists that FlashList is wired (WINDOWS #37). The catalog load itself is no longer the blocker (G-03-2 closed), so this screen is reachable — only the scroll-performance observation itself remains outstanding."
  - test: "Open the Add Custom Exercise form, leave it blank, and confirm: placeholder tracking-type text, inline per-field errors on invalid submit, Save disabled (not hidden) until name+load_type are set, multiline cue/instructions field auto-grows then scrolls, muscle-mapping chip picker works, and opening a seeded exercise's Edit route (as a non-owner) shows a not-permitted state."
    expected: "All six rendered behaviors match the UI-SPEC exactly."
    why_human: "No @testing-library/react-native in this codebase and no simulator/device available; verified instead via 33 unit tests over extracted presentational logic plus typecheck/bundling (WINDOWS #41). Previously blocked behind G-03-2 (the catalog list couldn't load, so this route was unreachable) — now structurally reachable since G-03-2 is closed, but never actually walked by a human."
  - test: "Open an exercise detail screen and confirm the Suggested Alternatives section renders candidate rows with thumbnail, name, and a plain-language why string, plus the empty state and Browse Catalog link when no candidates qualify."
    expected: "Rendered rows match SwapSuggestionList's intended layout; why-strings are never blank."
    why_human: "Never observed in a real browser/device — verified via 20 scorer unit tests + 7 direct-invocation component tests + typecheck/bundling only (WINDOWS #46). Previously blocked behind G-03-2 — now structurally reachable, not yet walked by a human."
  - test: "Full native (iOS/Android) pass over every catalog screen — list, detail, create/edit forms, archive dialog, swap suggestions. Also the offline first-boot flow: cold-boot the app offline, open /exercises, then open one exercise — populated content with real images painting on screen, entirely offline, no blank screen, no broken-image icon, no network request fired."
    expected: "Same behavior as the web/unit-test-verified logic, rendered correctly on native chrome; catalog list/detail render populated content with real images painting on screen, entirely offline."
    why_human: "No Xcode or Android SDK on this machine (WINDOWS #16/#34). Consistent with every prior phase's native gap; per project convention this is swept once at ROADMAP Phase 999.1 rather than per-phase. The browser half of this item is now unblocked by both G-03-1 (CORS/sign-up) and G-03-2 (catalog load) closures — only the native-device half is still environment-blocked."
---

# Phase 3: Exercise Catalog Verification Report

**Phase Goal:** The user can find any exercise they train, and the catalog carries the muscle and load metadata everything downstream depends on.
**Verified:** 2026-08-19T12:00:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (G-03-2, plan 03-12; this round also independently re-confirms G-03-1/plan 03-11's prior closure since the previous VERIFICATION.md predates 03-12)

## Goal Achievement

### G-03-2 Gap Closure — Verified Genuinely Closed

The prior UAT round (03-UAT.md, `status: diagnosed`) recorded a blocker: opening `http://localhost:8081/exercises`
showed "Exercise catalog couldn't load / Restart the app to try again," on every reload, forever. Root cause
(documented in `.planning/debug/exercise-catalog-load-failure.md`): every PowerSync-managed table — `localOnly`
ones included — is a SQLite VIEW with `INSTEAD OF` triggers, and SQLite refuses to prepare an UPSERT statement
against a view. `applyCatalogSnapshot`'s four `.onConflictDoUpdate()` call sites threw at the first statement
(`muscle_group`), the transaction rolled back before `catalog_meta` was stamped, so `currentVersion` stayed
`null` forever and every reload re-entered the identical doomed path. A bare `catch {}` in
`app/exercises/index.tsx` discarded the thrown error, which is why the prior UAT round captured no diagnostic.

Plan 03-12 closed this. Verified below against actual current source, not the SUMMARY's narrative:

| Must-have (03-12 PLAN frontmatter) | Verified against | Status |
|---|---|---|
| No statement `applyCatalogSnapshot` issues is rejected at prepare time by a real `@powersync/web` engine | `apps/mobile/lib/catalog/load-snapshot.ts:47-153` — every write is now a plain `.insert()` or a condition-scoped `.update().where(eq(table.id, id))`; direct grep confirms zero `.onConflictDoUpdate`/`.onConflictDoNothing` calls remain in `load-snapshot.ts` or `refresh-catalog.ts` (the two production write-path files) | ✓ VERIFIED |
| Real-engine load produces 19 muscle groups / 870 exercises / 3134 mappings / 1 catalog_meta row, catalog_version `fb701c18b7999d47` | `apps/mobile/e2e/catalog-load.spec.ts:30-77` asserts exactly these counts and version against a real `@powersync/web` engine in a real browser via the `__durability` harness | ✓ VERIFIED (per execution-state: durability project 6/6 pass, includes this spec) |
| Real-engine load leaves the PowerSync upload queue at zero entries | `catalog-load.spec.ts:73-77` — `crudCount()` asserted `toBe(0)` after the fresh load | ✓ VERIFIED |
| Re-applying the same snapshot over an already-populated DB is accepted, changes no row count | `catalog-load.spec.ts:79-105` — phase two writes a version sentinel to defeat the short-circuit, reloads, and asserts identical counts and zero queue depth; this is also the only real-engine coverage of the 43 duplicate mapping ids in the artifact | ✓ VERIFIED |
| A caught catalog-load failure is logged, not discarded | `apps/mobile/app/exercises/index.tsx:147-151` — `catch (error) { console.error('catalog snapshot load failed', error); ... }`, confirmed by direct read (previously a bare `catch {}`) | ✓ VERIFIED |
| `refreshCatalog` resolves to an outcome for every failure mode (no unhandled rejection at its fire-and-forget call site) | `apps/mobile/lib/catalog/refresh-catalog.ts:31-82` — the entire function body (not just the transaction) is wrapped in try/catch; a new `'write-failed'` outcome is returned from the catch clause | ✓ VERIFIED |
| Reintroducing upsert grammar turns the Jest suite red without a browser | 03-12 SUMMARY documents a revert check: temporarily restoring one `.onConflictDoUpdate()` call made `load-snapshot.test.ts` fail immediately (4 tests) with the engine's own refusal text (`cannot UPSERT a view`), then reverted; `load-snapshot.test.ts:90-103,193-214` shows the fake DB's conflict-clause methods now reject with that exact text rather than silently succeeding | ✓ VERIFIED |

**Behavioral evidence, not just static checks:** Per the orchestrator's session state, the mobile e2e `durability`
project (`durability.spec.ts`, `schema-redefinition.spec.ts`, `catalog-load.spec.ts`) ran 6/6 passing this
session — a real browser, a real `@powersync/web` engine, real IndexedDB/Worker. This is corroborated by:
- WINDOWS #33 (recorded when only a faithful Jest mock of PowerSync's trigger behavior existed, not a real
  engine) is now `status: fixed`, `resolved_at: 2026-08-19T10:02:13Z`.
- Commits `95f938f` (RED on the real engine), `895ff7f` (rebuild write path), `de0a2c2` (never-throws +
  error logging), `45d5b52` (plan completion) exist in the git log.
- `apps/mobile/playwright.config.ts:19` registers `catalog-load.spec.ts` in the `durability` project's
  `testMatch` array — confirmed by direct read; a spec missing from this array would silently never run and
  would read as a pass, so this was checked explicitly, not assumed.
- Direct grep confirms `.onConflictDoUpdate`/`.onConflictDoNothing` are gone from both production write-path
  files; the only remaining occurrences of those method names are inside test fakes that now assert the
  engine's refusal, and inside code comments documenting why they're avoided.

**Conclusion: G-03-2 is genuinely closed** — the fix is structurally present (read-then-branch INSERT/UPDATE,
no upsert grammar anywhere in the write path), and proven against a real engine in a real browser via a
purpose-built Playwright case, not merely a Jest mock. The prior verification round's already-established G-03-1
closure (CORS/sign-up, plan 03-11) was independently re-confirmed unchanged: `apps/api/src/main.ts:17` still
calls `app.enableCors(...)` as the first line of `bootstrap()`, and `apps/api/test/cors.e2e-spec.ts` remains in
the passing 18-suite/135-test API e2e run per this session's execution state.

### Observable Truths (9 phase-level truths, all previously verified, re-confirmed this round)

None of the 9 truths established in the initial verification round changed shape this session — 03-12 touched
only the catalog write-path's *implementation* (which statement grammar the four writes use), not the
observable behaviors those writes support. Re-confirmed by direct source read this round, not merely carried
forward from claims:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can search ~870 exercises by name (and alias), Unicode/diacritic-insensitive, empty query → full catalog | ✓ VERIFIED | `search-index.ts` (98 lines, present, substantive), wired into `app/exercises/index.tsx` |
| 2 | User can filter by muscle group, equipment, movement pattern, AND/OR combinable | ✓ VERIFIED | `catalog-filter.ts` (219 lines, present, substantive), 21 unit tests |
| 3 | User can open an exercise and see target muscles, equipment, setup, cues, static images | ✓ VERIFIED | `exercise-detail.ts`, `app/exercises/[id].tsx` (334 lines), `MuscleTargetList.tsx` |
| 4 | User can create a custom exercise with name/muscles/equipment/load-type, client-validated | ✓ VERIFIED | `custom-exercise.ts::createCustomExercise` (425 lines), `app/exercises/new.tsx` (196 lines) |
| 5 | User can edit/duplicate a custom exercise; edit ownership-gated, duplicate leaves source untouched | ✓ VERIFIED | `custom-exercise.ts`, `app/exercises/edit/[id].tsx` (294 lines), server-side ownership enforced in `exercise-sync.e2e-spec.ts` |
| 6 | Archiving removes from pickers/search, past logged sets stay attributed, per-user and idempotent | ✓ VERIFIED | `preferences.ts::setArchived` (146 lines), `catalog-filter.ts::buildArchivedSet`, cross-user isolation e2e test |
| 7 | User can mark never-suggest independent of archive | ✓ VERIFIED | `preferences.ts::setNeverSuggest`, `smart-swap.ts::buildNeverSuggestSet` |
| 8 | Every exercise carries an explicit load type from a fixed 6-member vocabulary, CHECK constraint + app validation + representable pre-logging-UI | ✓ VERIFIED | `apps/api/src/db/schema/catalog.ts` CHECK constraint, `packages/api-contracts/src/catalog.ts` LOAD_TYPES tuple, `new.tsx` picker |
| 9 | Suggested alternatives are deterministic, explainable, exclude archived/never-suggested/target, never blank | ✓ VERIFIED | `smart-swap.ts::scoreAlternatives` (231 lines), wired via `SwapSuggestionList` |

**Score:** 9/9 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api-contracts/src/catalog.ts` | LOAD_TYPES/MUSCLE_GROUPS/MOVEMENT_PATTERNS/EQUIPMENT_TYPES tuples + `isCatalogSnapshot` | ✓ VERIFIED | Present (164 lines), exported, used by both API and mobile |
| `apps/api/src/db/schema/catalog.ts` | exercise/exercise_muscle_mapping/muscle_group/user_exercise_preference + CHECK constraint | ✓ VERIFIED | Present (141 lines), correct FKs, indexes, unique constraint |
| `apps/mobile/lib/catalog/*.ts` | Pure, unit-tested catalog logic modules | ✓ VERIFIED | All present, substantive, unit-tested |
| `apps/mobile/app/exercises/{index,[id],new,edit/[id]}.tsx` | List, detail, create, edit screens | ✓ VERIFIED | All present, wired, no debt markers |
| `apps/api/src/common/web-origins.ts` (plan 03-11) | Sole `WEB_ORIGINS` reader | ✓ VERIFIED | Present, sole reader confirmed by grep, imported by `main.ts` and `auth.ts` |
| `apps/api/test/cors.e2e-spec.ts` (plan 03-11) | Regression suite for CORS allowlist | ✓ VERIFIED | Present, 7 cases, executed and passing (18/18 API e2e suites) |
| `apps/mobile/e2e/catalog-load.spec.ts` (plan 03-12, new) | Real-engine Playwright case for the catalog write path | ✓ VERIFIED | Present (107 lines), registered in `playwright.config.ts:19`'s `durability` `testMatch`, executed 6/6 (durability project) |
| `apps/mobile/lib/catalog/load-snapshot.ts` (plan 03-12, rebuilt) | Write path with no upsert grammar against a view | ✓ VERIFIED | 181 lines, read-existing-ids-then-branch for all four tables, zero `.onConflictDoUpdate`/`.onConflictDoNothing` calls |
| `apps/mobile/lib/db/test-support.ts` (plan 03-12, extended) | `'app'` schema variant + raw-SQL catalog test helpers | ✓ VERIFIED | Present, imports `AppSchema` from `./powersync.web` (confirmed by direct read of the deviation rationale and the file) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/exercises/index.tsx` | `lib/catalog/load-snapshot.ts::loadCatalogSnapshot` | mount effect calling `loadCatalogSnapshot`, catching and now logging errors | ✓ WIRED | Confirmed by direct read of `index.tsx:130-151` |
| `lib/catalog/load-snapshot.ts::applyCatalogSnapshot` | `lib/db/schema.ts` catalog tables | Drizzle `.insert()`/`.update()` against `muscleGroup`/`seededExercise`/`exerciseMuscleMapping`/`catalogMeta` | ✓ WIRED | Confirmed by direct read; matches PowerSync view constraints |
| `lib/catalog/refresh-catalog.ts::refreshCatalog` | `lib/catalog/load-snapshot.ts::applyCatalogSnapshot` | Shared write function, called inside `db.transaction` | ✓ WIRED | Both `loadCatalogSnapshot` and `refreshCatalog` route through the same rebuilt `applyCatalogSnapshot` — confirmed by direct read of both files' imports |
| `e2e/catalog-load.spec.ts` | `app/__durability.web.tsx` | `page.evaluate` calling `openCatalogDb`/`loadCatalog`/`readCatalogTableCounts`/`crudCount`/`writeCatalogVersionSentinel` on the flag-guarded harness global | ✓ WIRED | Confirmed by direct read of both files; harness methods sit inside the same `EXPO_PUBLIC_DURABILITY_HARNESS`-guarded branch as pre-existing methods |
| `apps/api/src/main.ts` | `apps/api/src/common/web-origins.ts` | `app.enableCors({ origin: resolveWebOrigins(), credentials: true })`, first line of `bootstrap()` | ✓ WIRED | Confirmed by direct read (unchanged from 03-11, re-checked this round) |
| (All other Phase-3 catalog links from prior rounds) | | | ✓ WIRED | Unchanged; 03-12 touched no filter/search/preference/smart-swap files |

### Data-Flow Trace (Level 4)

The catalog list/detail screens render from PowerSync-backed live queries (`db.select()...`) over the
`seededExercise`/`exercise`/`exercise_muscle_mapping`/`muscle_group` tables, which are now populated by a
real-engine-verified write path (traced above). No static/hardcoded fallback data found in any of the four
list/detail/new/edit screens on direct read. Smart-swap candidates are scored from the same live-queried rows
(`smart-swap.ts::scoreAlternatives`), not a mock dataset. Status: ✓ FLOWING for all traced artifacts.

### Behavioral Spot-Checks

Not run independently this round — the orchestrator's execution_state already supplies actually-executed
(not merely narrated) results for this session: `npm run build` (4/4 turbo tasks), `npm test` (api 50/50,
mobile 286/286), API e2e (18 suites/135 tests), and the mobile e2e `durability` project (6/6, including the
new `catalog-load.spec.ts`). Per the harness instructions, these are treated as given rather than re-run.
Static evidence above (direct source reads of the write path, the e2e spec, and the wiring) corroborates
that these pass results are not a stale/mismatched run — file contents match what the passing suite would
need to exercise.

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or found for this phase. Skipped — not a migration/tooling
phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| EXER-01 | 03-01, 03-05, 03-06, 03-11, 03-12 | Search exercise library by name | ✓ Satisfied | `search-index.ts`; catalog write path now real-engine-verified so the list this search runs against actually loads |
| EXER-02 | 03-01, 03-02, 03-04, 03-05, 03-06, 03-11, 03-12 | Filter by muscle group/equipment/movement pattern | ✓ Satisfied | `catalog-filter.ts`; same real-engine unblock |
| EXER-03 | 03-01, 03-04, 03-05, 03-07, 03-12 | View exercise detail | ✓ Satisfied | `exercise-detail.ts` + detail screen; same real-engine unblock |
| EXER-04 | 03-03, 03-08 | Create custom exercise | ✓ Satisfied | `custom-exercise.ts::createCustomExercise` |
| EXER-05 | 03-03, 03-08 | Edit/duplicate custom exercise | ✓ Satisfied | `custom-exercise.ts::updateCustomExercise/duplicateExercise` |
| EXER-06 | 03-02, 03-03, 03-09 | Archive exercise, logged sets stay attributed | ✓ Satisfied | `preferences.ts` + e2e cross-user isolation test |
| EXER-07 | 03-02, 03-03, 03-09 | Never-suggest without deleting | ✓ Satisfied | `preferences.ts::setNeverSuggest` |
| EXER-08 | 03-01, 03-02, 03-04 | Load-type vocabulary representable pre-logging-UI | ✓ Satisfied | CHECK constraint + LOAD_TYPES tuple + create-form picker |
| EXER-09 | (schema groundwork only, 03-02/03-04) | Bodyweight contribution accounted for in volume/load | Correctly Pending — out of phase-3 scope | `bodyweightContributionPct` column exists; math deferred to Phase 5, matches REQUIREMENTS.md |
| EXER-10 | 03-10 | Suggested alternatives (smart swap) | ✓ Satisfied | `smart-swap.ts` |

No orphaned requirements: all 10 EXER-* IDs declared in REQUIREMENTS.md's traceability table (lines 203-212)
appear in at least one plan's `requirements:` frontmatter across all 12 plans (confirmed by direct grep of
every `03-*-PLAN.md`).

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX` debt markers in any file listed across all 12 plans' `key-files` sections (confirmed
by direct grep, empty result). Carried forward from `03-REVIEW.md` (re-reviewed 2026-08-19, this session,
0 critical / 5 warning / 2 info), none of which are new regressions from 03-12 (03-12's own files —
`load-snapshot.ts`, `refresh-catalog.ts`, `test-support.ts`, `catalog-load.spec.ts` — were reviewed and found
clean):

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/mobile/app/exercises/new.tsx`, `edit/[id].tsx`, `[id].tsx` | 126-140, 147-169, 190-209 | Async write handlers with no try/catch — a thrown error (e.g. `updateCustomExercise`'s ownership-race `Error('not_owner')`) permanently disables Save via a `submitting` flag that never resets | ⚠️ Warning | Pre-existing since 03-08/03-09, not touched by 03-12; robustness gap, not a happy-path defect — EXER-04/05 create/edit succeed under normal conditions per passing unit tests |
| `apps/mobile/app/exercises/new.tsx:192`, `edit/[id].tsx:289` | — | `PrimaryButton`'s `submitting` prop overloaded to also mean "form invalid" — shows a spinner on an untouched blank form | ⚠️ Warning | Pre-existing, cosmetic/affordance bug, not a functional blocker |
| `packages/api-contracts/src/catalog.ts:143-161` | — | `isCatalogSnapshot` validates less than its call sites' doc comments claim (only `load_type`, not id/name presence or nested element shape) | ⚠️ Warning | Pre-existing; transaction wrapping limits blast radius on a thrown error, but a non-throwing malformed field could reach storage undetected |
| `apps/mobile/lib/catalog/smart-swap.ts:140-142,157-158` | — | `humanizeMuscleGroupId` misleadingly named — also used to format `movementPattern` | ⚠️ Warning | Naming-only, functionally correct today |
| `apps/mobile/lib/db/test-support.ts:229-235` | — | `readRawColumns` interpolates a table name into raw SQL (PRAGMA doesn't support bound identifiers) | ⚠️ Warning | Test-harness-only, hardcoded caller, not reachable from user input |
| `apps/mobile/lib/api-contracts/normalize-catalog.ts` | — | `groupOriginalsByCanonical` duplicates work `mergeCandidates` already did | ℹ️ Info | Build-time script, not a runtime hot path |
| `apps/mobile/app/exercises/index.tsx:243` | — | No-op `onPress={() => {}}` on list rows (navigation handled by the wrapping `<Link>`) | ℹ️ Info | Dead code, not a bug |

None of these are new to this round; all were present and disclosed in the 2026-08-19 code review that also
covered 03-12's file scope directly.

### Human Verification Required

See frontmatter `human_verification` list — 4 items remain (down from 5 in the prior round; WINDOWS #33's
real-engine catalog-load claim, previously a human-verification item, is now machine-verified by
`catalog-load.spec.ts` and removed from this list). All 4 remaining items are the standing "verified at
typecheck/unit-test/bundler level, never observed rendered in a live browser, simulator, or device" class,
consistent with CLAUDE.md's rule against launching a browser unless explicitly asked and this project's
convention of sweeping native-platform verification once at ROADMAP Phase 999.1. None indicate a known logic
or wiring defect — they indicate untested-by-a-human-eye, now structurally reachable since both G-03-1 and
G-03-2 are closed.

### Gaps Summary

No must-have truth, artifact, or key link failed. **G-03-2 (the catalog-load-failure blocker recorded in the
current UAT round) is verified genuinely closed** — confirmed against actual current source (`load-snapshot.ts`,
`refresh-catalog.ts`, `index.tsx`, `catalog-load.spec.ts`, `playwright.config.ts`), not merely the SUMMARY's
narrative, and corroborated by a real-browser/real-engine Playwright case passing at this session's regression
gate (durability project 6/6). G-03-1 (CORS, closed by 03-11 in the prior round) was independently re-confirmed
unchanged.

Two categories of pre-existing, non-blocking items carried forward:
1. **03-REVIEW.md warnings** (5 warning, 2 info, 0 critical) — error-handling gaps on write-handler failure
   paths, a button-spinner affordance bug, an under-validating snapshot-shape checker, a misleading helper
   name, and a raw-SQL test-harness interpolation. None block the phase goal (happy paths for every EXER-*
   requirement are verified working); all are legitimate robustness/quality follow-ups.
2. **WINDOWS #40** (open, warning): custom exercises' muscle mappings are `localOnly` and don't yet sync
   cross-device — a known, disclosed limitation, not a regression.
3. **WINDOWS #35** (open, informational): image-licensing risk on the vendored dataset, explicitly and
   deliberately left open by a human decision (documented in `docs/catalog-dataset-license.md`) to keep
   surfacing at `/gsd-ship` rather than being silently waived — not a phase-03 code defect.

The overall status is `human_needed` rather than `passed` solely because of the 4 remaining rendering/native-
platform items, none of which indicate a defect — they indicate untested-by-a-human-eye, consistent with this
phase's honestly disclosed state throughout. With both G-03-1 and G-03-2 closed, every catalog screen is now
structurally reachable and ready for the human UAT pass that was previously blocked.

---

_Verified: 2026-08-19T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
