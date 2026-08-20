---
phase: 03-exercise-catalog
verified: 2026-08-20T14:30:00Z
status: passed
score: 4/4 roadmap truths verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 4/4 (code level, 1 unresolved coverage caveat)
  gaps_closed:
    - "Human-verification item 1 (unrun e2e suite): pnpm --filter api test:e2e was executed against the live dev database on current HEAD by the user — 18 suites passed / 18 total, 136 tests passed / 136 total, 0 failed, 0 skipped. apps/api/test/user-exercise-preference.e2e-spec.ts:223-266 ('archiving a seeded exercise for user A leaves user B's view of it unarchived, and session_exercise/personal_record rows referencing that exercise stay resolvable') was read directly this round and genuinely asserts roadmap success criterion #3: it seeds a workout_session + session_exercise + personal_record against the target exercise, archives it via a user_exercise_preference PUT for user A, then asserts session_exercise.exercise_id, personal_record.exercise_id, and the exercise row itself are all still present and resolvable, and that user B's preference count for that exercise is 0. This closes the only remaining evidence gap for criterion #3's server-side referential-integrity half."
    - "Human-verification item 2 (WR-04, movement_pattern never validated server-side): fixed in commit 047f629 ('fix(sync): validate movement_pattern on the exercise push path'), confirmed by direct read this round. apps/api/src/sync/sync.service.ts:7 now imports MOVEMENT_PATTERNS as MOVEMENT_PATTERN_TUPLE from @fitness/api-contracts; line 77 builds a Set from it; hasInvalidField's exercise branch (lines 345-351) validates d.movement_pattern against that set with the identical nullable-allowed shape as the equipment_required check immediately above it (lines 338-344) — undefined skips, null passes, any other non-vocabulary string is rejected invalid_field. apps/api/test/exercise-sync.e2e-spec.ts:258-294 ('rejects a PUT with an out-of-vocabulary movement_pattern as invalid_field; a valid one and an explicit null both apply') is a real, non-trivial regression spec asserting all three cases against a live DB: bogus value rejected with no row written, a valid pattern ('hinge') applied and persisted, and an explicit null applied and persisted. This spec is part of the 18/18-suite e2e pass above (exercise-sync: 12/12 per the user's report)."
  gaps_remaining: []
  regressions: []
gaps: []
---

# Phase 3: Exercise Catalog Verification Report

**Phase Goal:** The user can find any exercise they train, and the catalog carries the muscle and load metadata everything downstream depends on.
**Verified:** 2026-08-20T14:30:00Z
**Status:** passed
**Re-verification:** Yes — supersedes the 2026-08-20T12:00:00Z report, which held `human_needed` on exactly two items: an unrun e2e suite (the only evidence source for roadmap success criterion #3's server-side referential-integrity half) and WR-04 (`movement_pattern` never validated server-side). Both are now resolved with direct evidence, checked against the codebase in this round rather than taken on narrative.

This report re-verifies against current HEAD, reading every file cited below directly. It does not re-litigate
the wave-12 findings (plans 03-15/03-16/03-17, gap closures G-03-2/G-03-6, and WR-03's regression coverage) —
those were independently confirmed in the prior round and are unchanged by this wave's two fixes, which touch
only `apps/api/src/sync/sync.service.ts` and add one new spec to `apps/api/test/exercise-sync.e2e-spec.ts`.

## Goal Achievement

### What changed this round

**1. The e2e suite ran.** `pnpm --filter api test:e2e` was executed by the user against the live dev database on
current HEAD: **18 suites passed / 18 total, 136 tests passed / 136 total, 0 failed, 0 skipped.** This includes
`user-exercise-preference.e2e-spec.ts`, `exercise-sync.e2e-spec.ts`, `catalog-delivery`, `seed-catalog`, and
`schema-parity` specs. The pass/fail counts are taken as given per the briefing; the *content* of the two specs
load-bearing for this phase's must-haves was read directly this round (not assumed from the count):

- `user-exercise-preference.e2e-spec.ts:223-266` — genuinely exercises roadmap success criterion #3. It seeds a
  `workout_session` + `session_exercise` + `personal_record` referencing a target exercise under user A, archives
  that exercise for user A via a `user_exercise_preference` PUT, then asserts (a) `session_exercise.exercise_id`
  still resolves to the exercise, (b) `personal_record.exercise_id` still resolves to the exercise, (c) the
  `exercise` row itself still exists (never touched by the archive write, per `preferences.ts::setArchived`'s
  design), and (d) user B's preference count for that exercise is 0 (archiving is per-user, not global). This is
  exactly the claim the prior round flagged as unconfirmed.
- `exercise-sync.e2e-spec.ts:258-294` — new this wave, confirms WR-04's fix (below).

**2. WR-04 is fixed, not accepted.** Commit `047f629` ("fix(sync): validate movement_pattern on the exercise push
path"), confirmed by direct read of `apps/api/src/sync/sync.service.ts`:
- Line 7: `MOVEMENT_PATTERNS as MOVEMENT_PATTERN_TUPLE` is now imported from `@fitness/api-contracts` (previously
  absent — this was the entire defect).
- Line 77: `const MOVEMENT_PATTERNS = new Set<string>(MOVEMENT_PATTERN_TUPLE);`
- Lines 345-351, inside `hasInvalidField`'s `exercise` branch: validates `d.movement_pattern` against that set,
  in the identical nullable-allowed shape as the `equipment_required` check immediately above it (lines 338-344)
  — `undefined` is skipped (field not being updated), explicit `null` passes (unclassified is legitimate), any
  other value must be a member of `MOVEMENT_PATTERNS` or the op is rejected `invalid_field`.
- `apps/api/test/exercise-sync.e2e-spec.ts:258-294` is a new, real regression spec (not a stub) covering three
  cases against a live DB and a running API process: an out-of-vocabulary `movement_pattern` ('bogus') rejected
  with no row written; a valid pattern ('hinge') applied and persisted; an explicit `null` applied and persisted.
  This mirrors the existing `load_type` regression spec's shape one-for-one (lines 240-256).

**Correction carried from the briefing:** the prior verification round (via 03-REVIEW.md) described an in-file
comment in `sync.service.ts` "claiming parity with the client validator." Direct re-read of the current file
confirms no such comment exists there — only the `T-02-05` comment above `hasInvalidField` (line 299-300), which
makes no parity claim. The parity-claiming comment that actually exists is in `apps/mobile/lib/catalog/custom-exercise.ts`,
describing the *client's* validator, and 03-REVIEW.md's WR-04 finding compared the two files' behavior, not a
false comment inside `sync.service.ts` itself. That detail is corrected here and not repeated as a defect.

### Observable Truths — Roadmap Success Criteria (re-verified against current HEAD)

| # | Truth (ROADMAP success criterion) | Status | Evidence |
|---|---|---|---|
| 1 | User can search and filter ~900 exercises by name, muscle group, equipment, and movement pattern, and open one to see its target muscles, cues, and images | ✓ VERIFIED | `search-index.ts`, `catalog-filter.ts`, `exercise-detail.ts`, `[id].tsx` all present, substantive, wired. The movement-pattern filter facet now has a full server-side backstop (WR-04 fixed) as well as the pre-existing client-side one, closing the gap that previously caveated this truth. |
| 2 | User can create and edit their own exercises, and request suggested alternatives for any exercise | ✓ VERIFIED | `custom-exercise.ts` (create/update/duplicate), `smart-swap.ts`, Edit unconditionally reachable since 03-14, cold-deep-link to the edit route resolves correctly since 03-16 |
| 3 | Archiving an exercise removes it from pickers while leaving its past logged sets intact and correctly attributed | ✓ VERIFIED | `preferences.ts::setArchived` / `catalog-filter.ts::buildArchivedSet` (mobile-side, unit-tested, unchanged) **plus** `apps/api/test/user-exercise-preference.e2e-spec.ts:223-266`, now confirmed executed and passing, directly asserting the server-side referential-integrity claim: `session_exercise` and `personal_record` rows referencing an archived exercise stay resolvable, and archiving is scoped to the archiving user only |
| 4 | Every exercise carries an explicit load type, so bodyweight, assisted, time-based, and distance-based movements are all representable before any logging UI exists | ✓ VERIFIED | `apps/api/src/db/schema/catalog.ts` CHECK constraint, `packages/api-contracts/src/catalog.ts` `LOAD_TYPES` tuple, `new.tsx` picker |

**Score:** 4/4 roadmap truths verified. Both remaining caveats from the prior round (unrun e2e for truth 3;
WR-04's server-side validation gap for truth 1) are closed with direct evidence, not silently absorbed.

### Required Artifacts (this round — the WR-04 fix)

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `apps/api/src/sync/sync.service.ts` | Imports `MOVEMENT_PATTERNS`, validates `movement_pattern` in `hasInvalidField`'s `exercise` branch, mirroring `equipment_required`'s nullable-allowed shape | ✓ VERIFIED | Direct read: import at line 7, `Set` construction at line 77, validation block at lines 345-351 |
| `apps/api/test/exercise-sync.e2e-spec.ts` | New spec covering out-of-vocabulary/valid/null `movement_pattern` cases | ✓ VERIFIED | Direct read of lines 258-294; three assertions against a live DB, not a stub |
| `apps/api/test/user-exercise-preference.e2e-spec.ts` | Asserts server-side referential integrity across archiving | ✓ VERIFIED | Direct read of lines 223-266; the exact claim roadmap criterion #3 requires |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `sync.service.ts::hasInvalidField` | `@fitness/api-contracts::MOVEMENT_PATTERNS` | `import { MOVEMENT_PATTERNS as MOVEMENT_PATTERN_TUPLE }` | ✓ WIRED | Confirmed by direct read; the tuple is the same one `packages/api-contracts/src/catalog.ts:65` exports and the mobile client's own validator already used |
| `exercise-sync.e2e-spec.ts` | `sync.service.ts::hasInvalidField` | live HTTP push against a running API process | ✓ WIRED | Confirmed — the spec drives `POST` against the sync push endpoint of a spawned `dist/main.js` process, not an in-process mock |
| `user-exercise-preference.e2e-spec.ts` | `session_exercise` / `personal_record` tables | direct Postgres read after an archive push | ✓ WIRED | Confirmed — the spec queries the tables directly via `pg.query`, not through an application-layer read that could mask a broken write |

### Behavioral Spot-Checks / Probe Execution

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full api e2e suite | `pnpm --filter api test:e2e` (executed by the user against the live dev DB, per this round's briefing) | 18 suites / 18 total, 136 tests / 136 total, 0 failed, 0 skipped | ✓ PASS (counts taken as given per briefing; spec content independently confirmed by direct read this round) |
| Full unit regression gate | `npm test` (turbo), re-run on current HEAD after the WR-04 fix, per this round's briefing | 4/4 tasks green — api-contracts 3 suites/66 tests, mobile 25 suites/361 tests, api unit 3 suites/50 tests | ✓ PASS (taken as given per briefing) |
| WR-04 fix present in source | Direct read of `sync.service.ts:7,77,345-351` | import, Set, and validation block all present, matching `equipment_required`'s shape exactly | ✓ PASS (independently verified, not taken from any narrative) |
| New regression spec asserts the fix | Direct read of `exercise-sync.e2e-spec.ts:258-294` | three real assertions (reject bad, apply valid, apply null) against a live DB, not a stub | ✓ PASS (independently verified) |
| e2e spec asserts roadmap criterion #3 | Direct read of `user-exercise-preference.e2e-spec.ts:223-266` | seeds session_exercise + personal_record, archives, asserts both still resolve plus per-user isolation | ✓ PASS (independently verified) |

No `scripts/*/tests/probe-*.sh` probes declared or found for this phase — not applicable.

### Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| EXER-01 | ✓ Satisfied | Unchanged this round |
| EXER-02 (filter by muscle group/equipment/movement pattern) | ✓ Satisfied — WR-04 caveat closed | `movement_pattern` now has a server-side backstop matching `load_type`'s and `equipment_required`'s shape |
| EXER-03 | ✓ Satisfied | Unchanged this round |
| EXER-04 | ✓ Satisfied | Unchanged this round |
| EXER-05 | ✓ Satisfied | Unchanged this round |
| EXER-06 (archive exercise, logged sets stay attributed) | ✓ Satisfied — e2e coverage caveat closed | `user-exercise-preference.e2e-spec.ts:223-266`, confirmed executed and passing this round |
| EXER-07 | ✓ Satisfied | Unchanged this round |
| EXER-08 | ✓ Satisfied | Unchanged this round |
| EXER-09 | Correctly Pending — out of phase-3 scope | Unchanged |
| EXER-10 | ✓ Satisfied | Unchanged this round |

No orphaned requirements. All 10 EXER-* IDs remain traced to at least one plan.

### Anti-Patterns Found

WR-04 is now fixed and removed from the open-findings list. The two remaining findings from `03-REVIEW.md`
(dated 2026-08-20, predates the WR-04 fix commit and has not itself been refreshed — its own `status: issues_found`
and WR-04 section are now stale documentation of a closed finding, not a currently-open one) are both cosmetic
and were already judged non-blocking in the prior verification round; that judgment is confirmed here:

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `apps/mobile/app/exercises/new.tsx:145`, `edit/[id].tsx:266` | — | WR-02: native header title duplicates the in-body heading text on the create and edit screens | ⚠️ Warning | Cosmetic double-heading, not a functional defect. Does not bear on any roadmap success criterion. Non-blocking. |
| `apps/mobile/app/exercises/[id].tsx:69-81,160-165` | — | IN-01: `loadOwnerAndVariation`'s `ownerId` is computed but never consumed | ℹ️ Info | Dead computation, not a bug. Non-blocking. |

No `TBD`/`FIXME`/`XXX` debt markers in `sync.service.ts` or the new spec file (confirmed by direct read).

### Human Verification Required

None. Both items from the prior round are resolved with direct codebase evidence:

1. ~~Run the e2e suite and confirm the archive/logged-set-attribution case passes~~ — done; 18/18 suites, 136/136
   tests, and the specific spec was read and confirmed to assert the claim.
2. ~~Decide on WR-04~~ — fixed in commit `047f629`, confirmed by direct read and covered by a new passing
   regression spec.

### Gaps Summary

No gaps. Both items that previously routed this phase to `human_needed` are closed with evidence checked
directly against the codebase in this round, not taken on SUMMARY narrative alone:

1. **e2e coverage for roadmap success criterion #3** — the suite ran (18/18 suites, 136/136 tests, per the
   user's report, taken as given), and this round independently confirmed by direct read that
   `user-exercise-preference.e2e-spec.ts:223-266` genuinely asserts the server-side referential-integrity claim
   (archived exercise's `session_exercise`/`personal_record` rows stay resolvable, archiving is per-user).
2. **WR-04** — fixed in commit `047f629`. Direct read of `sync.service.ts` confirms the import, `Set`
   construction, and validation block are all present and mirror the existing `equipment_required` check's
   shape exactly. A new regression spec (`exercise-sync.e2e-spec.ts:258-294`) covers the rejection, valid, and
   null cases and passed as part of the confirmed e2e run.

All 17 plans in the phase are complete, all four roadmap success criteria are verified with direct evidence, all
automated gates on current HEAD are green (361/361 mobile unit tests, 50/50 api unit tests, 66/66 api-contracts
tests, 136/136 api e2e tests, typecheck clean, web build clean), and the two functional UI gaps closed earlier
this wave (G-03-2, G-03-6) were independently confirmed by the user in a live browser session. Two cosmetic/
dead-code findings (WR-02, IN-01) remain open but do not bear on any roadmap success criterion and do not block
phase sign-off.

---

_Verified: 2026-08-20T14:30:00Z_
_Verifier: Claude (gsd-verifier)_
