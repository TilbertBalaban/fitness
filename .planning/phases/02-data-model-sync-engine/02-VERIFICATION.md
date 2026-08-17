---
phase: 02-data-model-sync-engine
verified: 2026-08-17T19:55:00Z
status: gaps_found
score: 5/5 roadmap truths verified; 1 new gap found
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "Roadmap success criterion 4 (schema upgrade preserves unsynced on-device data, verified against a populated pre-migration database) — schema-redefinition.spec.ts, 4 cases, re-run and passing against a real @powersync/web database in a real Chromium browser"
    - "Roadmap success criterion 1 (offline write reaches Postgres with no manual sync action) — sync.spec.ts's 'offline write, automatic drain' case, re-run and passing against the live self-hosted PowerSync Service, real API, real Postgres"
    - "PLAT-07 durability (a logged set survives close/reopen with no finish/flush/sync step) — durability.spec.ts, re-run and passing, real write path (log-set.ts), reopen proven to construct a genuinely distinct instance"
    - "Human-verification item: PLAT-03/PLAT-04 two-browser-window convergence with the service stopped — closed for the browser half by sync.spec.ts's 'two clients converge' and 'service down stays usable' cases, both re-run and passing"
  gaps_remaining: []
  regressions: []
gaps:
  - truth: "Phone and browser converge with no logged set silently lost (roadmap success criterion 2), for future partial (PATCH) updates on workout_session and session_exercise, and for 8 of logged_set's 9 mutable columns"
    status: partial
    reason: "apps/api/src/sync/sync.service.ts's onConflictDoUpdate applies the full, always-defaulted values object for every table on a PATCH, with only one narrow exception. loggedSetUpdateSet (lines 151-161) strips weightKg from the update set when a PATCH omits weight_kg, but does nothing for logged_set's other eight columns (set_index, set_type, reps, rir, side, completed, parent_set_id, rest_taken_seconds, logged_at) — every one of those is computed with a `??` default in toLoggedSetValues and is silently written over the stored row's real value the instant a PATCH omits it. workout_session and session_exercise (lines 557-576) have no partial-update guard at all: a PATCH omitting started_at/local_date/timezone/device_id (e.g. a realistic {status, ended_at}-only 'finish workout' PATCH) would silently reset started_at to the PATCH's receive time, local_date to the wrong calendar day, timezone to 'UTC', and device_id/routine_day_id/equipment_profile_id to null. This is not speculative: it is already reproducible against the code at HEAD, and this round's own passing e2e test already triggers it without noticing — apps/api/test/null-weight.e2e-spec.ts's 'PATCH changing only reps' case silently resets the seeded row's set_index to 0 and completed to false, but the test only re-reads weight_kg so it never observes the corruption. No client code shipped in this phase emits a PATCH for these tables (apps/mobile/lib/db/log-set.ts only ever inserts), so nothing in the app as delivered today triggers this. But PATCH is a first-class, already-accepted SyncCrudOpType on the public POST /v1/sync/push endpoint for all three PUSH_APPLIED_TABLES, and it is the obvious shape of the very next 'edit a set' or 'finish workout' feature — shipping the sync engine in this state means that feature will silently corrupt historical training data with no error and no signal to the user. This was surfaced by the phase's own code review (02-REVIEW.md, CR-01) and independently re-confirmed by reading apps/api/src/sync/sync.service.ts directly during this verification; it has not yet been logged to WINDOWS.md or fixed."
    artifacts:
      - path: "apps/api/src/sync/sync.service.ts"
        issue: "loggedSetUpdateSet (lines 151-161) is scoped to weight_kg only; toSessionExerciseValues/toWorkoutSessionValues (lines 557-576) are passed straight into onConflictDoUpdate's `set` with no PATCH-aware field filtering at all"
    missing:
      - "A field-presence-aware update-set builder applied uniformly to all three PUSH_APPLIED_TABLES (workout_session, session_exercise, logged_set), so a PATCH's onConflictDoUpdate `set` contains only the keys actually present in op.data — generalizing loggedSetUpdateSet's existing weight_kg-only pattern to every column, while a PUT keeps the current full-column-replace behavior"
      - "e2e coverage proving the untouched fields survive a narrow PATCH: assert set_index/completed/side/rir/parent_set_id/rest_taken_seconds/logged_at are unchanged after the existing 'reps-only' PATCH test, and assert started_at/timezone/local_date/device_id survive a {status, ended_at}-only PATCH to workout_session"
      - "A WINDOWS.md entry (phase 02) recording this as an open, tracked defect if the decision is to defer the fix rather than close it now"
deferred:
  - truth: "Native (iOS/Android) offline-write, crash-recovery, and two-device convergence observed on a real physical or simulated device"
    addressed_in: "Phase 999.1"
    evidence: "02-VALIDATION.md's Manual-Only Verifications table explicitly defers this: 'No Xcode and no Android SDK on this machine — native runtime cannot be exercised here. Web is the only runtime-verifiable target this phase... Deferred to ROADMAP Phase 999.1 native sweep.' ROADMAP.md's Phase 999.1 backlog entry exists as the project-wide policy sink for exactly this class of item (WINDOWS #16, #24, and the device half of #26 all reference it)."
---

# Phase 2: Data Model & Sync Engine — Verification Report (Round 2)

**Phase Goal:** Anything the user writes succeeds offline and converges correctly across their devices, on a schema that can express real training data.
**Verified:** 2026-08-17T19:55:00Z
**Status:** gaps_found
**Re-verification:** Yes — round 2 (plans 02-09..02-12), following round 1's `gaps_found` verdict (score 3/5)

## What Changed Since Round 1

Round 1's blocking gap was roadmap success criterion 4 (schema upgrade must preserve unsynced
on-device data, proven against a populated database) having **zero automated proof** — plan 02-05
halted honestly after six documented, empirically-confirmed failures to construct a real PowerSync
database under Jest/Node (WINDOWS #22). Round 1 also left criterion 1 (offline write, automatic
drain) as `PRESENT_BEHAVIOR_UNVERIFIED` and two items open for human verification.

Round 2 (02-09..02-12) did not fix the Jest/Node sandbox — it built a different real vehicle around
it: a Playwright suite driving a real Chromium browser against a real `@powersync/web` database
(real Worker, real WASM, real IndexedDB), with a `/__durability` route that only exists when
`EXPO_PUBLIC_DURABILITY_HARNESS=1` is set at build time (and is asserted, by code review, to be
dead-code-eliminated from a production export otherwise — see Warnings below for the one gap in
that assertion).

**I independently ran every one of these suites myself, from a cold state, against the live stack**
(Docker PowerSync container, native Postgres, and the API server) — not on SUMMARY.md's word.

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create and edit records offline; they sync automatically on reconnect, no manual action | ✓ VERIFIED | `apps/mobile/e2e/sync.spec.ts`'s `offline write, automatic drain` case, re-run directly by me against the live stack: logs two sets with the browser context offline, confirms `crud_count > 0` and zero matching rows in Postgres while offline, sets `context.setOffline(false)`, and polls (no manual action, no reload, no button) until both the crud queue reaches 0 and Postgres shows both rows. **PASS.** |
| 2 | Phone and browser converge after both edit offline, no set silently lost — automated two-device test | ✓ VERIFIED | Protocol-level: `apps/api/test/concurrent-edit.e2e-spec.ts`, re-run directly, 15/15 pass against real Postgres. Browser-level (new this round): `sync.spec.ts`'s `two clients converge` case — two independent Playwright browser contexts signed into the same account, each logs a set offline, both reconnect, and each context's **own local database** eventually reads the *other* context's set (not just a Postgres row count) — re-run directly, **PASS**. See the Gap below for a real, but currently unreachable, caveat on this guarantee's future scope. |
| 3 | Sync and cold start stay fast against a seeded 1–2yr corpus, not a handful of workouts | ✓ VERIFIED | `apps/api/test/seeded-corpus-perf.e2e-spec.ts`, re-run directly: 7/7 pass, corpus regenerated live (277 sessions / 3,804+ sets observed during this run), including the query-count invariant that catches an N+1 regardless of machine speed. |
| 4 | Upgrading across a local schema change preserves unsynced on-device data, verified against a populated pre-migration database | ✓ VERIFIED | `apps/mobile/e2e/schema-redefinition.spec.ts`, re-run directly against a real `@powersync/web` database in a real Chromium browser: the primary case logs 3 sets (one with a null weight) against schema v1, closes the way a process death would (no finish/flush/connect), reopens against a redefined v2 schema (adds `notes`, drops `side`) against the **same dbFilename**, and asserts all 3 rows survive byte-identical, crud-queue depth is unchanged, and `reopenVariant` returns `true` for "this is a genuinely new instance, not the same live object" (the exact anti-cheat check this criterion needs). 3 further cases cover ordering-preserved, empty-database, and a v1→v2→v1 round trip. All 4 **PASS**. A follow-on case in `sync.spec.ts` (`post-redefinition drain`) further proves the crud queue that survived the redefinition still connects and drains to Postgres — also re-run, **PASS**. |
| 5 | A weight round-trips through storage/display without drift in either unit; a workout finished at 11:45pm attributes to that day regardless of timezone | ✓ VERIFIED | Carried forward from round 1, untouched by round 2's file set: `packages/api-contracts` unit tests, 46/46 pass (50-repeat round-trip cases, single-declaration gate). `apps/mobile/__tests__/calendar-day.test.ts`, 8 cases including 23:45/00:15 midnight-crossing and a DST transition. |

**Score:** 5/5 roadmap truths verified with direct, re-run evidence. **One new gap found** during this
verification (not tied to a specific numbered criterion failing its literal test, but a confirmed,
unfixed correctness defect in this phase's core deliverable — see Gaps Summary).

### Required Artifacts (New/Changed This Round)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/mobile/e2e/durability.spec.ts` | Real-browser PLAT-07 durability proof | ✓ VERIFIED | Re-run directly: 1/1 pass. Drives real write helpers (`logSet`), no finish/flush/sync step between write and close. |
| `apps/mobile/e2e/schema-redefinition.spec.ts` | Real-browser roadmap-criterion-4 proof | ✓ VERIFIED | Re-run directly: 4/4 pass. Starts from a populated pre-migration database (the exact gap round 1 flagged). |
| `apps/mobile/e2e/sync.spec.ts` | Real-browser criterion-1/2 proof against the live stack | ✓ VERIFIED | Re-run directly: 5/5 pass (offline-drain, null-weight full-client-path, post-redefinition-drain, two-clients-converge, service-down-stays-usable). |
| `apps/mobile/lib/db/test-support.ts` | Real PowerSync test-open/close/reopen primitives, now exercised | ✓ VERIFIED (upgraded from round 1's ⚠️ ORPHANED) | `reopenTestPowerSync`/`reopenVariant` construct a fresh `PowerSyncDatabase` object every call (not memoized) — confirmed by reading the source and by the suites' own `reopenedIsDistinctInstance === true` assertions. |
| `apps/mobile/app/__durability.tsx`, `__durability.web.tsx` | Harness route, excluded from production builds by a build-time flag | ⚠️ VERIFIED BY REASONING, NOT BY CI | The Terser dead-code-elimination claim is sound (confirmed by reading the ternary/ literal-folding logic) but no CI step actually inspects the exported web bundle for the harness string. See Warnings. |
| `apps/api/src/sync/sync.service.ts` | Sync push apply path, CR-01..CR-04 closure from prior review round | ⚠️ PARTIALLY VERIFIED | CR-01 (client reads push response body), CR-03 (explicit push-support boundary), CR-04 (per-aggregate transaction isolation) all closed and re-verified. The *general* PATCH-clobber defect class (this round's own new CR-01 finding, distinct from the prior round's CR-01) remains open — see Gaps. |
| `apps/api/src/db/schema/session.ts` | `logged_set.weight_kg` nullable in Postgres | ✓ VERIFIED | `weightKg: numeric('weight_kg', { precision: 8, scale: 3 })` — no `.notNull()`. Confirmed by reading the schema file directly. Matches WINDOWS #21 `fixed`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `schema-redefinition.spec.ts` | `test-support.ts` | `openVariant`/`reopenVariant`/`readRawColumns` | ✓ WIRED | Confirmed by direct re-run; `readRawColumns` uses `PRAGMA table_info` for a structural (not merely typed) proof the view actually changed. |
| `sync.spec.ts` | `apps/mobile/app/(auth)/sign-in.tsx` | Real sign-in screen, cookie-based session | ✓ WIRED | Confirmed: every case signs in through the real screen, waits for the `better-auth.session_token` cookie, never fabricates a session. |
| `sync.spec.ts` | live PowerSync Service / API / Postgres | `useProductionDb()` + `connect()` against the real connector | ✓ WIRED | Confirmed by direct re-run against the running `fitness-powersync-1` container, the API server, and Postgres — including a case that `docker stop`s the PowerSync container mid-test and restarts it in `finally`. |
| `sync.service.ts` | `loggedSetUpdateSet` | PATCH-aware exclusion, `weight_kg` only | ⚠️ PARTIAL | Wired, but scoped to one field of nine on one of three tables — see Gaps. |

### Behavioral Spot-Checks (Run Directly by the Verifier, Not Taken From SUMMARY.md)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Durability + schema-redefinition e2e (real browser) | `EXPO_PUBLIC_DURABILITY_HARNESS=1 npx playwright test --project=durability` | 5/5 pass | ✓ PASS |
| Sync e2e against live stack (real browser, real service, real Postgres) | `EXPO_PUBLIC_DURABILITY_HARNESS=1 EXPO_PUBLIC_API_URL=http://localhost:34001 npx playwright test --project=sync` | 5/5 pass | ✓ PASS |
| API e2e: concurrent-edit, null-weight, poison-pill, powersync-token | `npx jest --config test/jest-e2e.json --runInBand -t "" <patterns>` | 4 suites, 39/39 tests pass | ✓ PASS |
| API e2e: seeded-corpus-perf | `npx jest --config test/jest-e2e.json --runInBand seeded-corpus-perf` | 7/7 pass, corpus regenerated live | ✓ PASS |
| `sync.service.ts` PATCH-clobber defect | Direct source read of `toWorkoutSessionValues`/`toSessionExerciseValues`/`loggedSetUpdateSet` and their call sites | Confirmed present at HEAD | ✗ FAIL — see Gaps |
| Debt markers in round-2 files | `grep -n -E "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER"` across the 26 files 02-REVIEW.md lists | No matches | ✓ PASS |

**A note on environment friction during this verification:** the sync e2e suite initially failed
100% (5/5) on first attempt, and looked exactly like the "gap not really closed" pattern this
verification exists to catch. Root cause was environment, not code: (1) the bare
`npx playwright test` command omits the `EXPO_PUBLIC_DURABILITY_HARNESS=1` env var the project's own
`test:e2e` npm script sets, which the harness needs both in the webServer's build *and* in the
Playwright Node process itself (it imports the same string-constant module directly); and (2) an
unrelated third-party Vite dev server on this machine was squatting the sync suite's default
`localhost:3000`, silently returning 200/404 for GET/POST and producing a misleading `sign-up
failed: 404`. Both suites passed cleanly once run through the project's own documented `test:e2e`
convention and pointed at the actual running API instance. This is recorded here for auditability,
not as a phase defect.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| PLAT-02 | 02-01, 02-02, 02-05, 02-09 | Log a complete workout offline, zero connectivity | ✓ SATISFIED | `durability.spec.ts` now proves the durability half through the real write path; local-write path was already wired (02-02). |
| PLAT-03 | 02-01, 02-07, 02-08, 02-12 | Offline changes sync automatically on reconnect | ✓ SATISFIED | `sync.spec.ts`'s `offline write, automatic drain` case, re-run and passing against the live stack. |
| PLAT-04 | 02-03, 02-07, 02-08, 02-12 | Phone/browser converge, no set silently lost | ✓ SATISFIED (with a caveat) | `concurrent-edit.e2e-spec.ts` (protocol) and `sync.spec.ts`'s `two clients converge` (browser) both re-run and passing. Caveat: the PATCH-clobber gap above is a real, if not-yet-reachable, threat to this exact guarantee for future partial-update features — see Gaps. |
| PLAT-07 | 02-02, 02-05, 02-09 | In-progress workout survives force-quit/crash/restart | ✓ SATISFIED | `durability.spec.ts`, re-run and passing: a set logged with no finish/flush/sync step survives a close/reopen against a genuinely distinct database instance. REQUIREMENTS.md's `[x]` mark is now backed by a real, passing, real-database test rather than the round-1 `human_judgment: true` placeholder. |
| PLAT-08 | 02-04, 02-10, 02-12 | kg/lb unit choice, no drift over repeated conversions | ✓ SATISFIED | 46/46 unit tests; `null-weight.e2e-spec.ts` and `sync.spec.ts`'s null-weight full-client-path case both re-run and passing. Postgres column is now nullable (WINDOWS #21 fixed, confirmed by reading the schema). |
| PLAT-10 | 02-06 | Export training data | ✓ SATISFIED (supporting) | Carried forward from round 1, untouched by round 2: `export.test.ts`, `build-export-document.ts`. Native share-sheet path unverified (WINDOWS #24, no Xcode/Android SDK — deferred to Phase 999.1). |
| LOG-22 | 02-02 | Workout attributed to calendar day regardless of timezone | ✓ SATISFIED | Carried forward from round 1: `calendar-day.test.ts`, 8 cases including DST and midnight-crossing. |

No orphaned requirements: PLAT-02, PLAT-03, PLAT-04, PLAT-07, PLAT-08, PLAT-10, LOG-22 all appear in
at least one plan's `requirements:` frontmatter and match ROADMAP.md's Phase 2 `Requirements:` line
exactly.

**REQUIREMENTS.md accuracy note (carried forward from round 1, still unresolved):** the top-level
checklist marks PLAT-02/03/04/07/08 as `[x]` but leaves PLAT-10 and LOG-22 unchecked, and the
traceability table at the bottom marks PLAT-10 "Pending" and LOG-22 "Gaps Found" — both
contradicted by evidence this verification (and round 1's) directly confirmed. This is pre-existing
bookkeeping staleness, not something round 2 introduced or was responsible for fixing, but it should
be corrected before the milestone is considered shippable so the tracking document matches reality.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found across the 26 files 02-REVIEW.md
lists as in scope for this round. The phase's own code review (02-REVIEW.md) found one Critical and
four Warning-level issues in round 2's diff; I independently re-confirmed the Critical finding
against the source (see Gaps) and am carrying the Warnings forward here rather than re-deriving them,
since I found no reason to disagree with the review's characterization of any of them:

- **WR-01** (`sync.service.ts:369-388`): the single-known-root "heal" path can retroactively poison
  ops that already resolved a real root, if an orphan (a hand-crafted or corrupted payload with no
  parent reference) shares a batch with exactly one other resolvable session. Self-scoped damage
  only (cannot cross users); unreachable by the shipped mobile client (`log-set.ts` always populates
  parent references). No coverage of this specific branch in `poison-pill.e2e-spec.ts`.
- **WR-02** (`sync.service.ts:438-593`): `highestServerSeq` isn't rewound on a rolled-back
  transaction, so `SyncPushResponse.server_seq` can report a value ahead of anything durably
  committed. No client code reads `server_seq` today, so this is latent, not active.
- **WR-03** (`test-support.ts:70-83`, `__durability.web.tsx:33-36`, `ci.yml`): the claim that the
  durability harness is dead-code-eliminated from the production web bundle is asserted only in
  comments — no CI step greps the exported bundle to confirm it. Given this round's own framing of
  harness-in-production as the highest-severity risk class in its diff, this is worth closing with a
  mechanical check rather than resting on code-review vigilance alone.
- **WR-04** (`test-support.ts:73`): `DURABILITY_HARNESS_ENABLED` is exported and has no importers
  anywhere in the app — dead code, trivial.

### Human Verification Required

None outstanding for this verification round beyond the deferred item below. Round 1's two
human-verification items are both closed for their browser half by this round's re-run,
independently-verified evidence (`sync.spec.ts`'s `two clients converge` and `service down stays
usable` cases). The remaining native/device half is a project-wide, pre-existing policy deferral
(see `deferred` in frontmatter), not a phase-2-specific open item.

### Gaps Summary

**One gap, found during this verification, not claimed or flagged by either round's SUMMARY.md
files:** `sync.service.ts`'s PATCH apply path clobbers any field a PATCH doesn't mention, for
`workout_session` and `session_exercise` entirely, and for eight of `logged_set`'s nine mutable
columns. The fix that shipped this round (`loggedSetUpdateSet`) closes the prior round's narrower
CR-02 finding (null `weight_kg` coerced to `'0'`) but was never generalized to the rest of the
columns or the other two tables — a gap the phase's own code review (02-REVIEW.md) caught and I
independently re-confirmed by reading `sync.service.ts` directly at HEAD.

This does not fail any of the five roadmap success criteria as literally tested today: no client
code shipped in this phase emits a PATCH for any of the three applied tables, so nothing in the app
as delivered actually hits this path, and every one of the phase's own passing tests exercises only
PUT-shaped writes. But `sync.service.ts` — the file this defect lives in — is this phase's core
deliverable (the sync-apply engine the roadmap goal is named after), the defect is already
provably firing inside this round's own passing test without that test noticing (see the gap detail
above), and it directly threatens the exact guarantee roadmap criterion 2 states in its own words —
"no logged set silently lost" — the moment the very next feature (an edit-a-set or finish-a-workout
screen, both an obvious near-term addition) starts sending PATCH ops. I judged this too material to
the phase's own stated goal to fold into an accepted-as-is Warning rather than a gap requiring a
decision: either close it with a scoped fix (a field-presence-aware update-set builder, generalizing
the existing `weightKg`-only pattern to all three tables), or explicitly defer it with an override
and a WINDOWS.md entry if the developer judges "unreachable by any shipped code today" sufficient to
ship as-is.

Everything else — all five roadmap success criteria, all seven phase requirements, the two
human-verification items round 1 left open (for their browser half) — is now backed by direct,
independently re-run evidence against the real local-first stack: a real `@powersync/web` database
in a real Chromium browser, a real self-hosted PowerSync Service, real Postgres, and the actual
production write and sync paths, not a mock or a stand-in anywhere in the chain I traced.

---

*Verified: 2026-08-17T19:55:00Z*
*Verifier: Claude (gsd-verifier)*
