---
phase: 02-data-model-sync-engine
plan: 11
subsystem: sync
tags: [powersync, drizzle, nestjs, sync-protocol, error-handling]

requires:
  - phase: 02-data-model-sync-engine
    provides: "02-10's nullable logged_set.weight_kg and the String(null) fix in sync.service.ts/conflict-policy.ts that this plan's session_exercise validation and error-boundary work builds beside"
provides:
  - "packages/api-contracts/src/sync.ts — PUSH_APPLIED_TABLES/PUSH_DEFERRED_TABLES exhaustive partition of SYNCED_TABLES, and isTerminalRejection(reason, table) deciding whether a rejected op can ever succeed on retry"
  - "apps/api/src/sync/sync.service.ts — isInvalidSessionExercise field validation and a per-aggregate try/catch in applyBatch that converts a database error into rejected entries instead of a 500, rewinding any applied/rejected entries speculatively recorded before the throw"
  - "apps/mobile/lib/db/connector.ts — uploadData parses the push response body and only completes the crud transaction when every rejection is terminal, using isTerminalRejection"
  - "apps/mobile/lib/sync-status.ts — recordRejectedOps/rejectedOps (bounded, drops oldest) and recordPushOutcome's hadRejections parameter, which stops lastSuccessfulPushAt advancing on a partially-rejected push"
affects: [sync-status-ui, offline-write-reliability, phase-3-catalog, phase-4-program-builder, phase-6-gym-profiles, phase-9-records]

actuals:
  tokens: 6510
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A push response's rejected array is data the client must read and act on, never inferred from HTTP transport outcome alone — CR-01's closure establishes response-body parsing as the norm for any future sync-protocol response, not just this one endpoint."
    - "A per-aggregate try/catch around a real DB transaction must rewind any array mutation performed as a side effect inside the transaction callback before the throw — the transaction rolling back does not undo a JS array push that already ran."

key-files:
  created:
    - apps/api/test/poison-pill.e2e-spec.ts
    - packages/api-contracts/src/__tests__/sync.test.ts
  modified:
    - packages/api-contracts/src/sync.ts
    - apps/api/src/sync/sync.service.ts
    - apps/mobile/lib/db/connector.ts
    - apps/mobile/lib/sync-status.ts
    - apps/mobile/__tests__/offline-write.test.ts
    - .planning/phases/02-data-model-sync-engine/COVERAGE.md

key-decisions:
  - "Corrected two of the plan's suggested phase attributions against ROADMAP.md/REQUIREMENTS.md rather than trusting the plan text verbatim (the plan itself instructed this verification): equipment_profile and user_preference belong to Phase 6 (Gym Profiles & Plate Math — GYM-01/02 own multi-gym config, and user_preference.defaultEquipmentProfileId references equipment_profile), not Phase 5 as the plan's action text suggested. personal_record belongs to Phase 9 (Records & Client Analytics — ANLY-01 owns PR detection), not Phase 7 (Advanced Set Types, which is unrelated to PRs) as the plan's action text suggested."
  - "isTerminalRejection's unknown_table branch checks PUSH_DEFERRED_TABLES membership rather than SYNCED_TABLES exclusion — a table absent from both lists (contract drift, e.g. a client on an older or newer build than the server) is treated as non-terminal, since a later deploy may resolve the mismatch; a table present in PUSH_DEFERRED_TABLES is treated as terminal, since it is a known, permanent-for-now gap."
  - "applyBatch's catch block rewinds applied.length and rejected.length to their pre-attempt values before re-rejecting the whole aggregate, rather than trusting the ops pushed during the failed transaction attempt — the Postgres transaction rolling back does not undo the JS-side applied.push(...) that already ran earlier in the same callback, so without the rewind a workout_session op inserted before a later session_exercise op's FK violation would be reported applied despite being rolled back. Not explicitly specified in the plan's action text; added as a Rule 1 fix once the failure mode was traced through the existing transaction-callback structure."
  - "recordPushOutcome gained a second hadRejections parameter (default false) rather than a new function, so the one call site's branching logic (advance lastSuccessfulPushAt only on an actually-clean push) stays in sync-status.ts rather than being duplicated in connector.ts."

requirements-completed: [PLAT-03, PLAT-04]

coverage:
  - id: D1
    description: "PUSH_APPLIED_TABLES and PUSH_DEFERRED_TABLES exhaustively and disjointly partition SYNCED_TABLES, each deferred table annotated with the phase that will own its apply path"
    requirement: "PLAT-04"
    verification:
      - kind: unit
        ref: "packages/api-contracts/src/__tests__/sync.test.ts#concatenated and sorted, equals SYNCED_TABLES sorted — every table is classified exactly once"
        status: pass
      - kind: unit
        ref: "packages/api-contracts/src/__tests__/sync.test.ts#shares no member between the two sets"
        status: pass
    human_judgment: false
  - id: D2
    description: "isTerminalRejection distinguishes a permanent per-table gap from contract drift a later deploy may cure, and is terminal for not_owner/invalid_field/deleted and non-terminal for missing_parent/batch_too_large regardless of table"
    requirement: "PLAT-04"
    verification:
      - kind: unit
        ref: "packages/api-contracts/src/__tests__/sync.test.ts#isTerminalRejection (4 cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The premise that no client write helper currently targets any of the 9 deferred tables — checked, not assumed, before authoring PUSH_DEFERRED_TABLES"
    requirement: "PLAT-04"
    verification:
      - kind: other
        ref: "premise-check grep pair recorded verbatim in this SUMMARY's Task 1 section — guard: 0 matches, positive control: 3"
        status: pass
    human_judgment: false
  - id: D4
    description: "A session_exercise op with an empty/missing exercise_id, a negative or non-integer order_index, or a negative target_* field is rejected invalid_field before it reaches an insert; an explicit null target_* is accepted"
    requirement: "PLAT-04"
    verification:
      - kind: e2e
        ref: "apps/api/test/poison-pill.e2e-spec.ts#rejects a session_exercise PUT with an empty exercise_id as invalid_field, and inserts no row"
        status: pass
      - kind: e2e
        ref: "apps/api/test/poison-pill.e2e-spec.ts#rejects a session_exercise PUT with a negative order_index as invalid_field"
        status: pass
      - kind: e2e
        ref: "apps/api/test/poison-pill.e2e-spec.ts#rejects a session_exercise PUT with a non-integer order_index as invalid_field"
        status: pass
      - kind: e2e
        ref: "apps/api/test/poison-pill.e2e-spec.ts#rejects a session_exercise PUT with a negative target_sets as invalid_field, and accepts an explicit null for the same field"
        status: pass
    human_judgment: false
  - id: D5
    description: "An unexpected database error (e.g. exercise_id with no matching row) rejects only its own aggregate's ops without a 500, and every later aggregate in the same batch is still applied, regardless of ordering"
    requirement: "PLAT-04"
    verification:
      - kind: e2e
        ref: "apps/api/test/poison-pill.e2e-spec.ts#rejects a session_exercise PUT naming an exercise_id with no matching row, without a 500"
        status: pass
      - kind: e2e
        ref: "apps/api/test/poison-pill.e2e-spec.ts#applies the healthy aggregate in full when a poisoned aggregate is pushed first in the same batch"
        status: pass
      - kind: e2e
        ref: "apps/api/test/poison-pill.e2e-spec.ts#applies the healthy aggregate in full when a poisoned aggregate is pushed second in the same batch"
        status: pass
      - kind: e2e
        ref: "apps/api/test/poison-pill.e2e-spec.ts#returns the same rejections on two consecutive identical pushes of the same poisoned batch — stable, not escalating"
        status: pass
    human_judgment: false
  - id: D6
    description: "An empty batch returns empty applied/rejected arrays and a server_seq, and never throws"
    requirement: "PLAT-04"
    verification:
      - kind: e2e
        ref: "apps/api/test/poison-pill.e2e-spec.ts#returns empty applied and rejected arrays and a server_seq for an empty batch, and does not throw"
        status: pass
    human_judgment: false
  - id: D7
    description: "The client parses the push response body and only completes the crud transaction when the rejected array is empty or every rejection is terminal; a non-terminal rejection or an unparseable body leaves it queued; an offline outcome never attempts to read a body"
    requirement: "PLAT-03"
    verification:
      - kind: unit
        ref: "apps/mobile/__tests__/offline-write.test.ts#completes the transaction on a 200 with an empty rejected array, exactly as before"
        status: pass
      - kind: unit
        ref: "apps/mobile/__tests__/offline-write.test.ts#completes the transaction and records every rejected entry when every rejection is terminal for its table"
        status: pass
      - kind: unit
        ref: "apps/mobile/__tests__/offline-write.test.ts#does not complete the transaction on any non-terminal rejection, leaving it queued"
        status: pass
      - kind: unit
        ref: "apps/mobile/__tests__/offline-write.test.ts#does not complete the transaction when the response body cannot be parsed as JSON"
        status: pass
      - kind: unit
        ref: "apps/mobile/__tests__/offline-write.test.ts#does not complete the transaction and never attempts to read a body on an offline outcome"
        status: pass
    human_judgment: false
  - id: D8
    description: "getSyncStatus() surfaces recorded rejections, and lastSuccessfulPushAt does not advance for a push that carried any rejection"
    requirement: "PLAT-03"
    verification:
      - kind: unit
        ref: "apps/mobile/__tests__/offline-write.test.ts#surfaces recorded rejections through getSyncStatus() and does not advance lastSuccessfulPushAt for a push with rejections"
        status: pass
    human_judgment: false

duration: ~55min (approximate — no formal start timestamp captured for this session)
completed: 2026-08-17
status: complete
---

# Phase 02 Plan 11: Close the Silent-Loss Seam Summary

**The client now reads the sync push response body instead of trusting HTTP status (CR-01), a malformed `session_exercise` op is validated and a database error is caught per-aggregate instead of 500ing the whole batch (CR-04), and the push-support boundary is an explicit typed contract instead of an accident of `TABLE_MAP` (CR-03).**

## Performance

- **Duration:** ~55 min (approximate)
- **Completed:** 2026-08-17T13:08:41Z
- **Tasks:** 3
- **Files modified:** 8 (2 new test files, 6 modified)

## Accomplishments

- `PUSH_APPLIED_TABLES`/`PUSH_DEFERRED_TABLES` partition all 12 `SYNCED_TABLES` exhaustively and disjointly, each deferred table annotated with the phase that will own its apply path (verified against ROADMAP.md, correcting two attributions — see Decisions Made).
- `isTerminalRejection(reason, table)` lets any consumer — today only the mobile connector, but the contract is shared — decide whether a rejected op can ever succeed on retry, closing the gap CR-01's fix depends on.
- `isInvalidSessionExercise` validates `exercise_id` (required, non-empty), `order_index`, and all six `target_*` fields before a `session_exercise` op reaches an insert.
- `applyBatch`'s per-aggregate transaction is now wrapped in a try/catch: a caught database error (e.g. a well-formed but non-existent `exercise_id` tripping the FK constraint) rejects only that aggregate's ops as `invalid_field`, logs server-side with the aggregate root and op ids, and lets the loop continue to the next aggregate — closing the poison-pill batch-wide-500 defect.
- `SyncConnector.uploadData` parses the push response body on an `ok` outcome and only completes the crud transaction when `rejected` is empty or every rejection is terminal for its table; a non-terminal rejection or an unparseable body leaves the transaction queued for PowerSync's own retry cadence — no new retry loop, timer, or backoff introduced.
- `sync-status.ts` gained `recordRejectedOps`/`rejectedOps` (a bounded, oldest-drops-first list) and `recordPushOutcome`'s `hadRejections` parameter, so `lastSuccessfulPushAt` no longer advances on a partially-rejected push.
- `COVERAGE.md`'s push-support rows updated to reference the new typed contract by name.

## Task 1 Premise Check (verbatim)

Run before any Task 1 code was written, per the plan's gate:

```
$ grep -rnE '\.(insert|update|delete)\((routine|routineDay|routineExercise|equipmentProfile|exercise|personalRecord|bodyMetric|progressPhoto|userPreference)\)' apps/mobile/lib apps/mobile/app
(0 matches — guard passed)

$ grep -rcE '\.(insert|update|delete)\((workoutSession|sessionExercise|loggedSet)\)' apps/mobile/lib apps/mobile/app
apps/mobile/lib/db/log-set.ts:3
(total: 3 — positive control passed)
```

The guard returned 0 matches; the positive control totaled 3, matching `log-set.ts`'s three writes. Both halves held, so the deferral's premise (no client write helper currently targets any of the 9 deferred tables) is proven, not assumed, and Task 1 proceeded.

## Deferred-Table Phase Attribution (verified against ROADMAP.md/REQUIREMENTS.md)

| Table | Phase | Checked against |
|---|---|---|
| `routine`, `routine_day`, `routine_exercise` | Phase 4 — Program Builder | ROADMAP.md "Phase 4: Program Builder" (PROG-01: "build a program from scratch with named days, ordered exercises") |
| `exercise` | Phase 3 — Exercise Catalog | ROADMAP.md "Phase 3: Exercise Catalog" |
| `equipment_profile` | Phase 6 — Gym Profiles & Plate Math | ROADMAP.md "Phase 6" GYM-01/GYM-02 ("configure multiple gyms with their real bars, plate denominations... and unit system"); matches `equipment_profile`'s actual columns (`barbellWeightKg`, `availablePlates`, `nativeUnit`) read directly from `apps/api/src/db/schema/equipment.ts` |
| `user_preference` | Phase 6 — Gym Profiles & Plate Math | `user_preference.defaultEquipmentProfileId` (`apps/api/src/db/schema/preference.ts`) is a direct FK to `equipment_profile`; no other phase in ROADMAP.md owns a general account-settings surface |
| `personal_record` | Phase 9 — Records & Client Analytics | ROADMAP.md "Phase 9: Records & Client Analytics" ANLY-01 ("PRs are detected automatically... surface in the workout summary") |
| `body_metric`, `progress_photo` | Phase 12 — Body Metrics & Dashboard | ROADMAP.md "Phase 12: Body Metrics & Dashboard" BODY-01/BODY-02 |

Two of these (`equipment_profile`/`user_preference` → Phase 6, `personal_record` → Phase 9) correct the plan's own suggested attributions (Phase 5 and Phase 7 respectively), per the plan's explicit instruction to verify each against ROADMAP.md rather than trust the list.

## Task Commits

Each task was committed atomically:

1. **Task 1: Say out loud which tables the push path applies — CR-03** - `4eec491` (feat)
2. **Task 2: One bad op stops being a batch-wide outage — CR-04** - `8b60e87` (feat)
3. **Task 3: The client reads what the server actually said — CR-01** - `1f6ff91` (feat)

**Plan metadata:** *(this commit, pending)* — SUMMARY.md

## Files Created/Modified

- `packages/api-contracts/src/sync.ts` - `PUSH_APPLIED_TABLES`, `PUSH_DEFERRED_TABLES`, `isTerminalRejection`
- `packages/api-contracts/src/__tests__/sync.test.ts` - New: 7 cases for the partition and predicate
- `.planning/phases/02-data-model-sync-engine/COVERAGE.md` - Amended push-support rows (see below)
- `apps/api/src/sync/sync.service.ts` - `isInvalidSessionExercise`, `isNonNegativeIntegerOrNull`, per-aggregate try/catch with applied/rejected rewind, `Logger`
- `apps/api/test/poison-pill.e2e-spec.ts` - New: 9-case real-Postgres suite covering validation, batch isolation both orderings, empty batch, and repeat-push stability
- `apps/mobile/lib/db/connector.ts` - `uploadData` parses the response body, branches on `isTerminalRejection`
- `apps/mobile/lib/sync-status.ts` - `RejectedOpRecord`, `recordRejectedOps`, `SyncStatus.rejectedOps`, `recordPushOutcome`'s `hadRejections` parameter
- `apps/mobile/__tests__/offline-write.test.ts` - Extended: 6 new cases plus 2 existing cases updated to supply a realistic response body

### COVERAGE.md rows changed

Replaced the single "Backend connector — upload" row's plan reference (`02-01` → `02-01, 02-11`) and note (documents CR-01's closure), and added two new rows: "Push-side apply path — 3 of 12 `SYNCED_TABLES`" (`PUSH_APPLIED_TABLES`, INTEGRATE) and "Push-side apply path — 9 of 12 `SYNCED_TABLES`" (`PUSH_DEFERRED_TABLES`, OPT-OUT per-table/phased, with the premise-check result and each table's owning phase). The file's original PowerSync capability matrix header and `## Re-open triggers` section are unchanged.

## Decisions Made

- Corrected two of the plan's suggested `PUSH_DEFERRED_TABLES` phase attributions against ROADMAP.md rather than trusting the plan text verbatim, per the plan's own instruction to verify each before writing it down. See "Deferred-Table Phase Attribution" above.
- `isTerminalRejection`'s `unknown_table` branch checks `PUSH_DEFERRED_TABLES` membership (terminal if present, non-terminal otherwise) rather than checking `SYNCED_TABLES` exclusion — a name recognized by neither list is contract drift a later deploy might cure, so it stays retryable.
- `applyBatch`'s catch block rewinds `applied.length`/`rejected.length` to their pre-attempt snapshot before re-rejecting the whole aggregate. Not explicit in the plan's action text — traced during implementation: `applied.push(op.op_id)` runs as a side effect inside the transaction callback, so a throw partway through an aggregate (e.g. `workout_session` insert succeeds, then `session_exercise` insert throws) would otherwise leave the earlier op's id in `applied` even though the whole Postgres transaction rolled back. See "Deviations from Plan" below.
- `recordPushOutcome` gained a second `hadRejections` parameter (default `false`) rather than introducing a second function, keeping the branching logic that decides whether to advance `lastSuccessfulPushAt` inside `sync-status.ts` rather than duplicated at the connector call site.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `applyBatch`'s catch block rewinds `applied`/`rejected` to their pre-attempt snapshot**
- **Found during:** Task 2, while implementing the per-aggregate try/catch the plan's action text specified.
- **Issue:** The plan's action text says "On a caught error, append a `rejected` entry for every op in that aggregate and continue to the next aggregate," and separately notes "The transaction has already rolled back by the time the catch runs, so the aggregate is atomic either way." Tracing the existing code, `applied.push(op.op_id)` runs inside the `for (const op of orderedOps)` loop that is itself inside the transaction callback — so for a multi-op aggregate (e.g. a `workout_session` op followed by a `session_exercise` op whose `exercise_id` has no matching row), the `workout_session` insert can succeed and push its `op_id` to `applied` *before* the `session_exercise` insert throws. The Postgres transaction rolling back undoes the database write, but does not undo the already-executed `applied.push(...)` — without a fix, the response would report that op as `applied` despite its write having been rolled back, which is exactly the "reported success but not durable" failure class this whole plan exists to close.
- **Fix:** Captured `applied.length`/`rejected.length` immediately before each aggregate's transaction attempt; on catch, `applied.length` is reset to that snapshot (removing any speculative entries), and `rejected` gets one entry per op in the aggregate, skipping any op already rejected earlier in the same attempt (e.g. a tombstone race) so it keeps its original reason rather than being overwritten.
- **Files modified:** `apps/api/src/sync/sync.service.ts` (same file the plan's Task 2 already declared).
- **Verification:** `poison-pill.e2e-spec.ts`'s "applies the healthy aggregate in full when a poisoned aggregate is pushed first/second in the same batch" cases exercise multi-op poisoned aggregates; the "rejects a session_exercise PUT naming an exercise_id with no matching row" case directly targets the FK-violation path this fix guards.
- **Committed in:** `8b60e87` (Task 2 commit).

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for correctness — without this fix, Task 2's own stated goal ("a database error is contained to its own aggregate... and every rejected write is recorded, not silently reported as applied") would have been incompletely delivered for any multi-op poisoned aggregate. Same file, same task, no scope creep.

## Issues Encountered

- **`.env` absent in this worktree:** Same as 02-10's prior finding — `.env` is gitignored and was not present in this ephemeral worktree checkout, so `DATABASE_URL` and the other local-dev env vars were unset. Copied the repo-root `.env.example` to `.env` verbatim (matching `drizzle.config.ts`'s and every e2e spec's dotenv `path: [cwd/.env, cwd/../../.env]` resolution — confirmed `pnpm --filter api test:e2e` runs with cwd `apps/api`, so the repo-root copy is the one actually loaded). Confirmed connectivity via a direct `psql` query before running any suite. Not committed (`.gitignore` excludes it).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CR-01, CR-03, and CR-04 are all closed, each with a named, passing test asserting the closed behavior (see `coverage:` above).
- No rejected write can be reported as a success: a curable rejection stays queued for retry, an incurable one is recorded via `recordRejectedOps` and completed so the queue does not wedge.
- A poisoned batch no longer 500s, no longer starves its sibling aggregates, and no longer retries forever — proven stable across two consecutive identical pushes of the same poisoned batch.
- `.planning/WINDOWS.md` entry #19 (documenting the 9 unmapped `SYNCED_TABLES` as an "intentional scope boundary, not yet wired by this plan") remains accurate — the gap itself is unchanged and deliberate — but could now reference `PUSH_DEFERRED_TABLES`/`isTerminalRejection` by name instead of describing an undocumented accident, per the plan's success criteria ("WINDOWS #19 can be updated to reference the explicit contract"). Left as-is: this plan's `files_modified` does not include `WINDOWS.md`, and the plan phrases this as optional ("can be"), not a task deliverable.
- Deliberately out of scope for this plan (unchanged, per the plan's own `<deliberate_deferrals>`): `02-REVIEW.md` IN-01 (loose `started_at`/`ended_at` validation), WR-01–WR-04, `WINDOWS.md` #18, #24, #25, and the device half of #26.
- All previously-passing suites remain green at their prior counts: `@fitness/api-contracts` 46→53 (+7), `poison-pill` new at 9, `sync-push` 7/7, `concurrent-edit` 15/15, `seeded-corpus-perf` 7/7, `null-weight` 8/8, mobile 129→135 (+6). `pnpm --filter api typecheck` and `pnpm --filter mobile typecheck` both exit 0.

---
*Phase: 02-data-model-sync-engine*
*Completed: 2026-08-17*

## Self-Check: PASSED

All claimed files verified present on disk (`packages/api-contracts/src/sync.ts`, `packages/api-contracts/src/__tests__/sync.test.ts`, `.planning/phases/02-data-model-sync-engine/COVERAGE.md`, `apps/api/src/sync/sync.service.ts`, `apps/api/test/poison-pill.e2e-spec.ts`, `apps/mobile/lib/db/connector.ts`, `apps/mobile/lib/sync-status.ts`, `apps/mobile/__tests__/offline-write.test.ts`, this SUMMARY). All claimed commits (`4eec491`, `8b60e87`, `1f6ff91`) verified present in `git log --oneline`.
