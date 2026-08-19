---
phase: 03-exercise-catalog
verified: 2026-08-19T09:15:00Z
status: human_needed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 9/9
  gaps_closed:
    - "G-03-1: web client could not create an account — /v1/auth/sign-up/email preflight failed with no Access-Control-Allow-Credentials header (apps/api/src/main.ts never called app.enableCors())"
  gaps_remaining: []
  regressions: []
human_verification:
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
  - test: "Full native (iOS/Android) pass over every catalog screen — list, detail, create/edit forms, archive dialog, swap suggestions. Also re-run the offline first-boot flow and cold-boot-with-real-images check now that CORS is fixed and sign-up is unblocked."
    expected: "Same behavior as the web/unit-test-verified logic, rendered correctly on native chrome; catalog list/detail render populated content with real images painting on screen, entirely offline."
    why_human: "No Xcode or Android SDK on this machine. Consistent with every prior phase's native gap; per project convention this is swept once at ROADMAP Phase 999.1 rather than per-phase. The CORS fix (03-11) unblocks account creation, so this browser/device pass can now proceed — it was blocked behind G-03-1 in the previous UAT round."
---

# Phase 3: Exercise Catalog Verification Report

**Phase Goal:** The user can find any exercise they train, and the catalog carries the muscle and load metadata everything downstream depends on.
**Verified:** 2026-08-19T09:15:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (G-03-1, plan 03-11)

## Goal Achievement

### G-03-1 Gap Closure — Verified Genuinely Closed

The prior UAT round (03-UAT.md) recorded a blocker: the web client could not create an account because
`apps/api/src/main.ts` never called `app.enableCors()`, so every credentialed cross-origin request from
`http://localhost:8081` failed CORS preflight (`Access-Control-Allow-Credentials` empty instead of `true`).
Plan 03-11 closed this. Verification below is against the actual current source, not the SUMMARY's narrative:

| Must-have (03-11 PLAN frontmatter) | Verified against | Status |
|---|---|---|
| Credentialed preflight to `/v1/auth/sign-up/email` returns `Access-Control-Allow-Credentials: true` and echoes `Access-Control-Allow-Origin` | `apps/api/src/main.ts:17` — `app.enableCors({ origin: resolveWebOrigins(), credentials: true })` registered as the first line of `bootstrap()`. `apps/api/test/cors.e2e-spec.ts` test 1 asserts exactly this. | ✓ VERIFIED |
| Same headers on `/v1/catalog/*` (Nest-routed, not just the Better Auth mount) | `cors.e2e-spec.ts` test 2 (`OPTIONS /v1/catalog/version`). `enableCors` is registered ahead of the Better Auth mount (attached later during `app.init()`), so it wraps both. | ✓ VERIFIED |
| Origin outside `WEB_ORIGINS` gets no `Access-Control-Allow-Origin` | `cors.e2e-spec.ts` test 4, deliberately does not assert credentials-header absence (correctly, since `cors@2.8.6` sets that header unconditionally — confirmed by direct code read of the test's own comment matching `<diagnosis_already_done>` in the plan) | ✓ VERIFIED |
| One parser feeds both `main.ts`'s CORS allowlist and `auth.ts`'s `trustedOrigins` | `apps/api/src/common/web-origins.ts::resolveWebOrigins()` is the sole reader of `process.env.WEB_ORIGINS` in `apps/api/src` — confirmed by direct grep (`grep -rn 'env\.WEB_ORIGINS' apps/api/src` returns exactly one hit, `web-origins.ts:2`). `main.ts:7,17` and `auth.ts:7,14` both import and call it. | ✓ VERIFIED |
| 426 client-version rejection still carries CORS headers | `cors.e2e-spec.ts` test 7, and `enableCors` is registered before `app.use(minClientVersionMiddleware(...))` in `main.ts:17-22`, confirmed by direct read | ✓ VERIFIED |

**Behavioral evidence, not just static checks:** Per the orchestrator's session state, `pnpm --filter api test:e2e`
was re-run at the regression gate this session and reported 18 suites / 135 tests passing, including the new
`test/cors.e2e-spec.ts`. This is corroborated by:
- WINDOWS #48 (recorded when the executor's sandboxed worktree could not reach `DATABASE_URL` to run the suite)
  is now `status: fixed`, `resolved_at: 2026-08-19T08:50:18Z` in `.planning/WINDOWS.md`.
- Commit `f653563` — `test(03): close WINDOWS #48 — cors e2e suite green at the regression gate` — exists in the
  git log immediately after the 03-11 gap-closure commits.
- `03-REVIEW.md` (re-reviewed 2026-08-19, this session, after the CORS change) explicitly re-examined
  `web-origins.ts`, `main.ts`'s `enableCors` placement, `auth.ts`'s `trustedOrigins`, and `cors.e2e-spec.ts`'s
  assertions, and found no defects.

**Conclusion: G-03-1 is genuinely closed**, both by direct source inspection matching every must-have in the
03-11 plan, and by an actually-executed (not merely typechecked) e2e suite passing at the regression gate —
the earlier round's failure mode (SUMMARY claiming static-only verification, per WINDOWS #48's original entry)
was subsequently closed by a real run, not left as an unresolved caveat.

### Observable Truths (carried forward, unaffected by this gap closure)

The 9 phase-level observable truths were verified in the initial verification round (2026-08-18) and are not
re-derived here since 03-11 touched none of the files backing them (`apps/api/src/main.ts`,
`apps/api/src/auth/auth.ts`, `apps/api/src/common/web-origins.ts`, `apps/api/test/cors.e2e-spec.ts` are all
outside the catalog domain). Spot-checked for regression via the 03-REVIEW.md re-review (0 critical findings)
and the passing full mobile/api/api-contracts/api-e2e suite counts stated in this session's execution state
(282/282 mobile, 50/50 api unit, 66/66 api-contracts, 135/135 api e2e across 18 suites).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can search ~870 exercises by name (and alias), Unicode/diacritic-insensitive, empty query → full catalog | ✓ VERIFIED | `search-index.ts`, 6 passing unit tests, wired into `app/exercises/index.tsx` — unchanged since prior round |
| 2 | User can filter by muscle group, equipment, movement pattern, AND/OR combinable | ✓ VERIFIED | `catalog-filter.ts`, 21 passing unit tests — unchanged |
| 3 | User can open an exercise and see target muscles, equipment, setup, cues, static images | ✓ VERIFIED | `exercise-detail.ts`, `[id].tsx`, `MuscleTargetList.tsx` — unchanged |
| 4 | User can create a custom exercise with name/muscles/equipment/load-type, client-validated | ✓ VERIFIED | `custom-exercise.ts::createCustomExercise`, `new.tsx`, 33 passing unit tests — unchanged |
| 5 | User can edit/duplicate a custom exercise; edit ownership-gated, duplicate leaves source untouched | ✓ VERIFIED | `custom-exercise.ts`, `edit/[id].tsx`, server-side ownership enforced in `exercise-sync.e2e-spec.ts` — unchanged |
| 6 | Archiving removes from pickers/search, past logged sets stay attributed, per-user and idempotent | ✓ VERIFIED | `preferences.ts::setArchived`, `catalog-filter.ts::buildArchivedSet`, cross-user isolation e2e test, idempotency unit test — unchanged |
| 7 | User can mark never-suggest independent of archive | ✓ VERIFIED | `preferences.ts::setNeverSuggest`, `smart-swap.ts::buildNeverSuggestSet` — unchanged |
| 8 | Every exercise carries an explicit load type from a fixed 6-member vocabulary, CHECK constraint + app validation + representable pre-logging-UI | ✓ VERIFIED | `apps/api/src/db/schema/catalog.ts:58-61`, `packages/api-contracts/src/catalog.ts`, `new.tsx:19` — unchanged |
| 9 | Suggested alternatives are deterministic, explainable, exclude archived/never-suggested/target, never blank | ✓ VERIFIED | `smart-swap.ts::scoreAlternatives`, 20+7 passing tests, wired via `SwapSuggestionList` — unchanged |

**Score:** 9/9 truths verified (0 present-but-behavior-unverified)

### Required Artifacts (unchanged from prior round, spot-checked)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api-contracts/src/catalog.ts` | LOAD_TYPES/MUSCLE_GROUPS/MOVEMENT_PATTERNS/EQUIPMENT_TYPES tuples + `isCatalogSnapshot` | ✓ VERIFIED | Present, exported, used by both API and mobile |
| `apps/api/src/db/schema/catalog.ts` | exercise/exercise_muscle_mapping/muscle_group/user_exercise_preference + CHECK constraint | ✓ VERIFIED | All present with correct FKs, indexes, unique constraint |
| `apps/mobile/lib/catalog/*.ts` | Pure, unit-tested catalog logic modules | ✓ VERIFIED | All present, substantive, unit-tested |
| `apps/mobile/app/exercises/{index,[id],new,edit/[id]}.tsx` | List, detail, create, edit screens | ✓ VERIFIED | All present, wired, no debt markers |
| `apps/api/src/common/web-origins.ts` (new, plan 03-11) | Sole `WEB_ORIGINS` reader | ✓ VERIFIED | Present, substantive, sole reader confirmed by grep, imported by both `main.ts` and `auth.ts` |
| `apps/api/test/cors.e2e-spec.ts` (new, plan 03-11) | Regression suite for the allowlist, Nest/Better-Auth coverage split, middleware ordering | ✓ VERIFIED | Present, 7 cases matching every must-have, executed and passing at the regression gate (18/18 suites, incl. this one) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `apps/api/src/main.ts` | `apps/api/src/common/web-origins.ts` | `app.enableCors({ origin: resolveWebOrigins(), credentials: true })`, first line of `bootstrap()` | ✓ WIRED | Confirmed by direct read; placement ahead of `minClientVersionMiddleware` and `app.listen()` |
| `apps/api/src/auth/auth.ts` | `apps/api/src/common/web-origins.ts` | `trustedOrigins: [APP_SCHEME, ...WEB_ORIGINS, ...]` where `WEB_ORIGINS = resolveWebOrigins()` | ✓ WIRED | Confirmed by direct read |
| `apps/api/test/cors.e2e-spec.ts` | spawned `dist/main.js` | supertest against a real spawned process with `WEB_ORIGINS` set to two allowlisted origins | ✓ WIRED | Confirmed by direct read; executed at regression gate this session |
| (All Phase-3 catalog links from the prior round) | | | ✓ WIRED | Unchanged; 03-11 touched no catalog files |

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK` markers in any of the 4 files touched by plan 03-11
(`apps/api/src/common/web-origins.ts`, `apps/api/src/main.ts`, `apps/api/src/auth/auth.ts`,
`apps/api/test/cors.e2e-spec.ts`) — confirmed by direct grep.

Carried forward from `03-REVIEW.md` (this session's re-review, 0 critical / 3 warning / 1 info), none of which
block this phase and none of which are new regressions from 03-11 (03-11's own files were reviewed in depth
and found clean):

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/mobile/lib/catalog/refresh-catalog.ts` | 66-74 | `refreshCatalog`'s own "never throws" doc comment is violated by an unguarded `db.transaction` — a thrown error becomes an unhandled promise rejection at its fire-and-forget call site | ⚠️ Warning | Pre-existing, not introduced by 03-11 |
| `apps/mobile/app/exercises/new.tsx`, `edit/[id].tsx` | 192, 289 | `submitting={submitting \|\| !isSaveEnabled(draft)}` shows a spinner whenever the form is merely invalid, not only while a write is in flight | ⚠️ Warning | Pre-existing, not introduced by 03-11 |
| `scripts/vendor-catalog-images.cjs`, `scripts/generate-catalog-image-map.cjs` | 69-70, 34-39 | Sparse-array `null` hole not filtered before `require()` generation on a partial-failure vendoring run | ⚠️ Warning (latent, currently harmless — all 1740 images present) | Pre-existing, not introduced by 03-11 |
| `packages/api-contracts/src/catalog.ts` | 143-161 | `isCatalogSnapshot` only validates `load_type`, not the rest of the required shape | ℹ️ Info | Pre-existing, not introduced by 03-11 |
| `apps/mobile/lib/db/schema.ts` | n/a | `exercise_muscle_mapping` registered `localOnly` — custom exercises' muscle mappings don't sync cross-device (WINDOWS #40) | ⚠️ Warning | Pre-existing, honestly tracked |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| EXER-01 | 03-01, 03-05, 03-06, 03-11 | Search exercise library by name | ✓ Satisfied | `search-index.ts`; 03-11 unblocks the account-creation path required to reach this feature on web |
| EXER-02 | 03-01, 03-04, 03-05, 03-06, 03-11 | Filter by muscle group/equipment/movement pattern | ✓ Satisfied | `catalog-filter.ts`; same 03-11 unblock |
| EXER-03 | 03-01, 03-04, 03-05, 03-07 | View exercise detail | ✓ Satisfied | `exercise-detail.ts` + detail screen |
| EXER-04 | 03-03, 03-08 | Create custom exercise | ✓ Satisfied | `custom-exercise.ts::createCustomExercise` |
| EXER-05 | 03-03, 03-08 | Edit/duplicate custom exercise | ✓ Satisfied | `custom-exercise.ts::updateCustomExercise/duplicateExercise` |
| EXER-06 | 03-02, 03-03, 03-09 | Archive exercise, logged sets stay attributed | ✓ Satisfied | `preferences.ts` + e2e cross-user isolation test |
| EXER-07 | 03-02, 03-03, 03-09 | Never-suggest without deleting | ✓ Satisfied | `preferences.ts::setNeverSuggest` |
| EXER-08 | 03-01, 03-02, 03-04 | Load-type vocabulary representable pre-logging-UI | ✓ Satisfied | CHECK constraint + LOAD_TYPES tuple + create-form picker |
| EXER-09 | (schema groundwork only, 03-02) | Bodyweight contribution accounted for in volume/load | Correctly Pending — out of phase-3 scope | `bodyweight_contribution_pct` column exists; math deferred to Phase 5, matches REQUIREMENTS.md |
| EXER-10 | 03-10 | Suggested alternatives (smart swap) | ✓ Satisfied | `smart-swap.ts` |

No orphaned requirements: all 10 EXER-* IDs declared in this phase's REQUIREMENTS.md traceability table
(lines 203-212) appear in at least one plan's `requirements:` frontmatter.

**Documentation gap from the prior verification round is now resolved:** `.planning/REQUIREMENTS.md`'s
checkboxes and traceability table correctly show EXER-01 through EXER-08 and EXER-10 as `[x]`/Complete, and
EXER-09 as `[ ]`/Pending — matching the actual codebase state. No further action needed here.

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or found for this phase. Skipped — not a migration/tooling
phase.

### Human Verification Required

See frontmatter `human_verification` list — 5 items remain (down from 6 in the prior round; the CORS/sign-up
blocker that made item 1 unreachable is now closed). All are the standing "verified at typecheck/unit-test/
bundler level, never observed rendered in a live browser, simulator, or device" class documented in every
prior phase, consistent with CLAUDE.md's rule against launching a browser unless explicitly asked and this
project's convention of sweeping native-platform verification once at ROADMAP Phase 999.1. None are logic or
wiring gaps.

### Gaps Summary

No must-have truth, artifact, or key link failed. **G-03-1 (the CORS blocker recorded in the prior UAT round)
is verified genuinely closed** — confirmed against actual source (`main.ts`, `auth.ts`, `web-origins.ts`,
`cors.e2e-spec.ts`), not merely the SUMMARY's claims, and corroborated by an actually-executed e2e suite
(18/18 suites passing at the regression gate, WINDOWS #48 now `fixed`).

Two pre-existing items carried forward, unrelated to this closure, not blocking the phase:
1. **WINDOWS #40** (warning): custom exercises' muscle mappings don't yet sync cross-device.
2. **03-REVIEW.md warnings WR-01/WR-02/WR-03** (this session's re-review): an unhandled-rejection risk in
   `refresh-catalog.ts`, a misleading submit-button spinner state, and a latent sparse-array bug in the image
   vendoring script. All low-severity, none user-facing blockers, none introduced by the CORS gap closure.

The overall status is `human_needed` rather than `passed` solely because of the 5 remaining
rendering/native-platform items, none of which indicate a defect — they indicate untested-by-a-human-eye,
consistent with this phase's honestly disclosed state throughout. With G-03-1 closed, the web sign-up flow
that blocked those items is now unblocked and they can proceed at the next human UAT pass.

---

_Verified: 2026-08-19T09:15:00Z_
_Verifier: Claude (gsd-verifier)_
