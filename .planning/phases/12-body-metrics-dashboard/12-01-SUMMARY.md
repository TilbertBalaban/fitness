---
phase: 12-body-metrics-dashboard
plan: 01
subsystem: sync
tags: [drizzle, powersync, nestjs, postgres, sync-push, api-contracts]

requires:
  - phase: 02-data-model-sync-engine
    provides: the SyncService.applyBatch singleton-root apply-path shape (excluded_exercise/personal_record) this plan copies verbatim for body_metric
  - phase: 05-progressive-overload-analytics
    provides: personal_record's decimal-string-value pattern (D-03/D-04), which body_metric.value reuses exactly
provides:
  - "body_metric push apply path: PUSH_APPLIED_TABLES membership, all seven sync.service.ts registration points, ownership enforcement (T-12-01), vocabulary/value validation (T-12-02)"
  - "BODY_METRIC_KINDS closed 15-kind vocabulary, BODY_METRIC_KIND_ORDER, BODY_METRIC_KIND_LABELS, BODY_METRIC_CANONICAL_UNIT — the shared constants module every later 12-* plan reads"
  - "apps/mobile/lib/db/body-metrics.ts: logMetric (blind insert, D-09) and loadLatestMetric — the write module the entry sheet, quick weigh-in and trend screens consume"
  - "docs/body-metric-vocabularies.md — the shape/vocabulary/enforcement reference"
affects: [12-02, 12-03, 12-06, 12-08]

actuals:
  tokens: 11405
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "body_metric registered as an eighth SINGLETON_ROOT_TYPES member, following the excluded_exercise/personal_record shape exactly (TABLE_MAP, ROOT_TABLE_BY_TYPE, AGGREGATE_RANK, hasInvalidField, root-existence lookup, applyBatch insert)"
    - "BODY_METRIC_KIND_SET imported directly from @fitness/api-contracts rather than rebuilt from a tuple in sync.service.ts — the same object on both sides of the vocabulary check, never a re-derived Set"

key-files:
  created:
    - packages/api-contracts/src/body-metrics.ts
    - packages/api-contracts/src/__tests__/body-metrics.test.ts
    - apps/api/test/body-metric.e2e-spec.ts
    - apps/mobile/lib/db/body-metrics.ts
    - apps/mobile/lib/db/__tests__/body-metrics.test.ts
    - docs/body-metric-vocabularies.md
  modified:
    - packages/api-contracts/src/index.ts
    - packages/api-contracts/src/sync.ts
    - packages/api-contracts/src/__tests__/sync.test.ts
    - apps/api/src/sync/patch-update-set.ts
    - apps/api/src/sync/sync.service.ts

key-decisions:
  - "Task 1 checkpoint (D-02/D-08 storage-shape lock) auto-approved under the unattended-run directive — see 'Checkpoint decisions' below"
  - "BODY_METRIC_KIND_SET is imported directly from @fitness/api-contracts into sync.service.ts, not rebuilt locally from an imported tuple (the CYCLE_KINDS/WORKOUT_SESSION_STATUSES convention) — since body-metrics.ts already exports a ready-built ReadonlySet, importing it directly is the single-source-of-truth shape the plan's own Pitfall-4 warning asks for"
  - "body_metric's root-existence lookup reads only (id, userId), following personal_record/equipment_profile's shape — not excluded_exercise's extra identity-column read — because kind is genuinely client-patchable on this table (D-10), not identity, so no stored-linkage resolver is needed"

patterns-established:
  - "Singleton-root sync registration for body_metric: the ninth table (after workout_session/routine's aggregate roots and the seven prior singleton roots) to follow this exact seven-touchpoint template — 12-04 (progress_photo) and 12-06 (dashboard_widget) will apply it twice more in later waves of this phase"

requirements-completed: [BODY-01, BODY-02]

coverage:
  - id: D1
    description: "A bodyweight logged through logMetric reaches Postgres via the sync push path, owned by the authenticated user"
    requirement: "BODY-01"
    verification:
      - kind: e2e
        ref: "apps/api/test/body-metric.e2e-spec.ts#stores a bodyweight PUT with the recorded value, kind and calendar-day stamp"
        status: pass
      - kind: e2e
        ref: "apps/api/test/body-metric.e2e-spec.ts#stores a PUT against the authenticated session's user id, never a user_id claimed in the payload (T-12-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A named measurement (any of the 14 non-bodyweight kinds) writes and reads through the same path as bodyweight, differing only in kind"
    requirement: "BODY-02"
    verification:
      - kind: unit
        ref: "packages/api-contracts/src/__tests__/body-metrics.test.ts#BODY_METRIC_CANONICAL_UNIT maps every member of BODY_METRIC_KINDS to exactly one of kg, cm, percent — total coverage"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/body-metrics.test.ts#logging twice for the same kind on the same day produces two rows, both readable — no read-then-insert guard (D-09)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Off-vocabulary kinds and negative values are rejected invalid_field with no row written (T-12-02)"
    verification:
      - kind: e2e
        ref: "apps/api/test/body-metric.e2e-spec.ts#rejects a PUT whose kind is outside the vocabulary with invalid_field, and writes no row (T-12-02)"
        status: pass
      - kind: e2e
        ref: "apps/api/test/body-metric.e2e-spec.ts#rejects a PUT whose value is negative with invalid_field, and writes no row (T-12-02)"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-08-30
status: complete
---

# Phase 12 Plan 01: Body-metric push apply path Summary

**`body_metric` writable end-to-end for the first time — the 15-kind closed vocabulary, the seven-touchpoint sync.service.ts apply path, and a live-Postgres e2e proof of ownership and vocabulary enforcement.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-08-30T19:07:22Z
- **Completed:** 2026-08-30T19:18:30Z
- **Tasks:** 3 (1 checkpoint, 1 tracer, 1 TDD)
- **Files modified:** 11

## Accomplishments
- `body_metric` moved from `PUSH_DEFERRED_TABLES` to `PUSH_APPLIED_TABLES` — `PUSH_DEFERRED_TABLES` now holds only `progress_photo`, owned by 12-04
- `body_metric` registered at all seven `sync.service.ts` singleton-root touchpoints, following the `excluded_exercise`/`personal_record` template exactly; ownership (`userId` from session, never `data.user_id`) and vocabulary/value validation proven against a live Postgres in `body-metric.e2e-spec.ts`
- The closed 15-kind vocabulary (`bodyweight` through `body_fat_percent`) shipped complete in `@fitness/api-contracts`, with total label and canonical-unit coverage asserted by iterating the tuple rather than a hardcoded second list
- `apps/mobile/lib/db/body-metrics.ts` gives the client a blind-insert `logMetric` (D-09: multiple same-day entries are all kept) and a `loadLatestMetric` reader, both consumed by every later plan in this phase
- `docs/body-metric-vocabularies.md` documents the shape and its four enforcement layers, following `docs/excluded-exercise-shape.md`'s structure

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm the one-way body-metric storage contract (D-02, D-08)** — checkpoint auto-approved, no code change (see "Checkpoint decisions" below)
2. **Task 2: End-to-end "log a bodyweight" — one kind, one path** — `c021826` (feat)
3. **Task 3: Complete the closed vocabulary, its reference doc, and its rejection cases** — `d7c1278` (test)

**Plan metadata:** pending (this commit)

## Checkpoint decisions

**Task 1 (`checkpoint:decision`, `gate="blocking"`)** was auto-approved under the run's unattended directive ("auto approve recommended option, don't ask anything"). Selected option: **`lock-existing-shape`** — the option marked `(recommended)`.

- **What was decided:** `body_metric`'s existing columns `(id, user_id, kind, value, recorded_at, timezone, local_date, server_seq)` are used as-is (D-02); every kind has exactly one canonical storage unit — kg for mass, cm for circumference, percent for percentage (D-08). No schema reshape, no per-row unit/note column.
- **One-way consequence accepted:** once real rows exist on real devices (which this plan's own e2e writes are the first of), changing a column or changing which unit `value` holds becomes a Postgres migration plus a client schema-version bump plus a data backfill across every already-synced device — not a refactor.
- **Rejected alternative:** `reshape-first` (add a per-row `unit`/`note` column before first write) — would have required a migration, a client schema bump and a `sync-rules.yaml` touch/PowerSync Service restart before any value existed, and a per-row unit would let a user see kg alongside inches, a state no real app offers.

## Files Created/Modified
- `packages/api-contracts/src/body-metrics.ts` - the closed 15-kind vocabulary, its display order, labels and canonical-unit map
- `packages/api-contracts/src/index.ts` - exports body-metrics.ts (appended, per the file's additive-only convention)
- `packages/api-contracts/src/sync.ts` - `body_metric` moved to `PUSH_APPLIED_TABLES`; `PUSH_DEFERRED_TABLES` now holds only `progress_photo`
- `packages/api-contracts/src/__tests__/body-metrics.test.ts` - tuple/order/label/unit totality tests
- `packages/api-contracts/src/__tests__/sync.test.ts` - `body_metric` applied-not-deferred assertions; fixed two pre-existing assertions that used `body_metric` as their deferred-table example
- `apps/api/src/sync/patch-update-set.ts` - `BodyMetricValues`/`BODY_METRIC_PATCH_FIELDS`
- `apps/api/src/sync/sync.service.ts` - `body_metric` registered at all seven singleton-root touchpoints
- `apps/api/test/body-metric.e2e-spec.ts` - ownership, happy-path and two `invalid_field` rejection cases against live Postgres
- `apps/mobile/lib/db/body-metrics.ts` - `logMetric`, `loadLatestMetric`
- `apps/mobile/lib/db/__tests__/body-metrics.test.ts` - two-rows-per-day and recency-ordering tests
- `docs/body-metric-vocabularies.md` - shape, vocabulary and four-layer enforcement reference

## Decisions Made
See "Checkpoint decisions" above (Task 1) and `key-decisions` in frontmatter (the `BODY_METRIC_KIND_SET` direct-import choice and the simpler root-lookup shape for `body_metric`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed two pre-existing sync.test.ts assertions left stale by this plan's own change**
- **Found during:** Task 3
- **Issue:** `sync.test.ts` had two assertions written when `body_metric` was still in `PUSH_DEFERRED_TABLES` (`isTerminalRejection('unknown_table', 'body_metric')` expected `true`; a `server_error` test used `body_metric` as its "including a deferred one" example). Both became false statements the moment Task 2 moved the table.
- **Fix:** Repointed both assertions at `progress_photo` (the table still actually deferred) and added a new explicit tripwire asserting `isTerminalRejection('unknown_table', 'body_metric')` is now `false`, matching the pattern `program.test.ts` already established for `routine`'s own tuple-move tripwire.
- **Files modified:** `packages/api-contracts/src/__tests__/sync.test.ts`
- **Verification:** `pnpm --filter @fitness/api-contracts test` — all 22 sync.test.ts cases pass.
- **Committed in:** `d7c1278` (Task 3 commit)

**2. [Rule 3 - Blocking] Started the stopped Postgres/Mailpit containers before running the e2e suite**
- **Found during:** pre-flight (before Task 2)
- **Issue:** `fitness-postgres-1` and `fitness-mailpit-1` were `Exited` (25h idle) while `fitness-powersync-1` was up; `apps/api/test:e2e` requires a reachable `DATABASE_URL`.
- **Fix:** `docker start fitness-postgres-1 fitness-mailpit-1`.
- **Files modified:** none (environment only).
- **Verification:** `pnpm --filter api test:e2e -- body-metric` connected and ran green immediately after.
- **Committed in:** n/a (no code change)

---

**Total deviations:** 2 auto-fixed (1 bug fix, 1 blocking-environment fix). No scope creep — both were required for the plan's own verification commands to run at all.

## Issues Encountered
None beyond the two auto-fixed items above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The write path, vocabulary and doc this plan built are the foundation every remaining 12-* plan reads: 12-02 (entry sheet/units), 12-03 (trend screen), 12-06 (dashboard widget catalog) all import `BODY_METRIC_KINDS`/`BODY_METRIC_KIND_ORDER`/`BODY_METRIC_KIND_LABELS`/`BODY_METRIC_CANONICAL_UNIT` and `logMetric`/`loadLatestMetric` directly rather than re-deriving them.
- `progress_photo` remains the sole `PUSH_DEFERRED_TABLES` member — 12-04 owns closing it, using this plan's seven-touchpoint registration as its template.
- No blockers. Native (iOS/Android) verification of this write path is out of scope for this plan (server + client unit/e2e only); routed to ROADMAP Phase 999.1 per standing project policy, not left as an in-phase blocking check.

---
*Phase: 12-body-metrics-dashboard*
*Completed: 2026-08-30*

## Self-Check: PASSED

All created files verified present; both task commits (`c021826`, `d7c1278`) verified present in `git log`.
