---
phase: 02-data-model-sync-engine
plan: 13
subsystem: api
tags: [drizzle, postgres, sync, typescript, jest]

requires:
  - phase: 02-data-model-sync-engine
    provides: "02-10's nullable logged_set.weight_kg, 02-11's null-weight round trip and durability harness"
provides:
  - "patchAwareSet — a single field-presence-aware update-set builder shared by workout_session, session_exercise and logged_set, so a PATCH's onConflictDoUpdate set contains only the columns op.data actually named"
  - "PatchFieldMap<V> — a mapped-type exhaustiveness gate: adding a mutable column to any of the three value-shape interfaces without classifying it in the matching field map is now a TypeScript compile error"
  - "apps/api/test/patch-partial-update.e2e-spec.ts — a real-Postgres reproducer proving the fix on all three tables, authored red and observed red before the fix"
affects: ["sync-engine", "logged-set-edit", "finish-workout", "session-exercise-reorder"]

actuals:
  tokens: 6800
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "PatchFieldMap<V>: a mapped type over keyof V with no optional marks — every column of a Drizzle values interface is a required key in its field map, so an unclassified column is a compile error, not a silently-always-written column"
    - "patchAwareSet(op, values, fields): filters only the onConflictDoUpdate set: clause; the insert .values() argument is untouched, so PATCH-as-insert semantics (an id the server has never seen) still receive every NOT NULL column"

key-files:
  created:
    - apps/api/src/sync/patch-update-set.ts
    - apps/api/src/sync/__tests__/patch-update-set.spec.ts
    - apps/api/test/patch-partial-update.e2e-spec.ts
  modified:
    - apps/api/src/sync/sync.service.ts
    - apps/api/test/null-weight.e2e-spec.ts
    - .planning/WINDOWS.md

key-decisions:
  - "patchAwareSet filters only the set: clause, never the insert .values() clause — a PATCH for an id the server has not seen still upserts every NOT NULL column, and isInvalidSessionExercise's exercise_id-required guard stays load-bearing exactly as before"
  - "Deleted the one-field loggedSetUpdateSet guard entirely rather than leaving it beside the new general one — two guards for the same concern is how the second one gets forgotten again"
  - "Left isInvalidSessionExercise's non-empty-exercise_id requirement on session_exercise PATCHes in place rather than relaxing it; logged to WINDOWS.md (#31) as a deliberate deferral with the reasoning, per the plan's deliberate_deferrals"
  - "generic constraint on patchAwareSet is <V extends object>, not <V extends Record<string, unknown>> — TypeScript's index-signature assignability rule rejects a concrete interface (no index signature) as an argument to a Record<string, unknown>-constrained generic even though every property matches structurally; object is the correct, looser constraint for this generic filter"

patterns-established:
  - "Pattern: PatchFieldMap<V> mapped-type exhaustiveness gate for PATCH-safe columns — every table now added to the sync apply path with a PATCH-capable update path must define {Table}Values, {TABLE}_PATCH_FIELDS, and route its onConflictDoUpdate set: through patchAwareSet"

requirements-completed: [PLAT-04, PLAT-08, LOG-22]

coverage:
  - id: D1
    description: "A PATCH to workout_session, session_exercise, or logged_set writes only the columns it named; every other mutable column survives byte-identical, proven against a real Postgres instance"
    requirement: "PLAT-04"
    verification:
      - kind: e2e
        ref: "apps/api/test/patch-partial-update.e2e-spec.ts — all 8 cases"
        status: pass
      - kind: e2e
        ref: "apps/api/test/null-weight.e2e-spec.ts — 'PATCH changing only reps' and 'PATCH with weight_kg explicitly null', strengthened"
        status: pass
    human_judgment: false
  - id: D2
    description: "LOG-22: a {status, ended_at}-only finish PATCH does not reset started_at, timezone, local_date, device_id, routine_day_id or equipment_profile_id, and local_date stays the client's stamp rather than a server recomputation from started_at's UTC calendar day"
    requirement: "LOG-22"
    verification:
      - kind: e2e
        ref: "apps/api/test/patch-partial-update.e2e-spec.ts#LOG-22: a {status, ended_at}-only finish PATCH..."
        status: pass
    human_judgment: false
  - id: D3
    description: "The field maps cannot go stale silently — deleting one entry from LOGGED_SET_PATCH_FIELDS breaks pnpm --filter api typecheck, and restoring it passes again"
    verification:
      - kind: other
        ref: "pnpm --filter api typecheck, run against a deliberately mutated field map (see Task 2 Mutation Test below for the verbatim compiler error)"
        status: pass
    human_judgment: false
  - id: D4
    description: "PUT semantics and the insert path are unchanged: a PUT still fully replaces every column, and the five existing insert-driven regression suites still pass"
    requirement: "PLAT-08"
    verification:
      - kind: e2e
        ref: "apps/api/test/sync-push.e2e-spec.ts, sync-aggregate.e2e-spec.ts, concurrent-edit.e2e-spec.ts, poison-pill.e2e-spec.ts, schema-parity.e2e-spec.ts, seeded-corpus-perf.e2e-spec.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Five findings this plan knowingly left open (WR-01..WR-04, the session_exercise PATCH exercise_id constraint) are recorded on the WINDOWS.md ledger with a reason, not left only in 02-REVIEW.md"
    verification:
      - kind: other
        ref: ".planning/WINDOWS.md ids 27-31, total_count 26->31, open_count 21->26"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-08-17
status: complete
---

# Phase 2 Plan 13: Close the PATCH-clobber defect Summary

**patchAwareSet — a single field-presence-aware update-set builder generalizing the old weight_kg-only guard to all three synced tables, kept exhaustive by a mapped-type compile error, proven by a real-Postgres suite committed red before the fix and green after.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-17T23:10:00+03:00 (approx, first task commit at 23:12)
- **Completed:** 2026-08-17T23:20:58+03:00
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- `apps/api/src/sync/patch-update-set.ts`: `patchAwareSet` plus `WORKOUT_SESSION_PATCH_FIELDS`, `SESSION_EXERCISE_PATCH_FIELDS`, `LOGGED_SET_PATCH_FIELDS` and their three value-shape interfaces — a PATCH now writes only the columns it named, on all three `PUSH_APPLIED_TABLES`, not just `logged_set.weight_kg`.
- LOG-22 survives a realistic finish-workout PATCH: `started_at`, `timezone`, `local_date`, `device_id`, `routine_day_id`, `equipment_profile_id` all stay byte-identical after a `{status, ended_at}`-only PATCH, and `local_date` remains the client's stamp rather than a server recomputation.
- The field maps cannot go stale silently: `PatchFieldMap<V>` is a mapped type over `keyof V` with no optional marks, so deleting one entry from a map is a TypeScript compile error, not a silently-always-written column — proven by mutation (delete, confirm fail, restore, confirm pass).
- Five findings deliberately left open (`02-REVIEW.md`'s WR-01..WR-04, and the `session_exercise` PATCH `exercise_id` constraint) are now on `.planning/WINDOWS.md` with ids 27-31.

## Task Commits

Each task was committed atomically:

1. **Task 1: Commit the reproducer — a real-Postgres suite that fails on the clobber** - `ff8a501` (test)
2. **Task 2: One field-presence-aware update set, kept exhaustive by the compiler** - `3eb8a3f` (feat)
3. **Task 3: Put the findings this plan did not fix on the ledger** - `c3f2a41` (docs)

_No TDD RED/GREEN split within a task was needed beyond the plan's own Task 1 (red) / Task 2 (green) structure — this plan's `type="execute"` frontmatter carries `tdd="true"` at the task level, and the red/green boundary is exactly the Task 1 / Task 2 boundary the plan specifies._

## Files Created/Modified

- `apps/api/src/sync/patch-update-set.ts` - the field-presence filter, three field maps, three value-shape interfaces
- `apps/api/src/sync/__tests__/patch-update-set.spec.ts` - pure mapping spec, including the camelCase/snake_case no-op trap gate
- `apps/api/test/patch-partial-update.e2e-spec.ts` - real-Postgres partial-update suite, 8 cases
- `apps/api/src/sync/sync.service.ts` - three write paths routed through `patchAwareSet`; `loggedSetUpdateSet` deleted; timezone-fallback comment corrected
- `apps/api/test/null-weight.e2e-spec.ts` - two existing PATCH cases strengthened to observe the fields they previously ignored
- `.planning/WINDOWS.md` - 5 new ledger entries (ids 27-31)

## Decisions Made

- `patchAwareSet` filters only the `set:` clause of `onConflictDoUpdate`, never the insert `.values()` argument — a PATCH for an id the server has never seen still upserts every NOT NULL column, and `isInvalidSessionExercise`'s `exercise_id`-required guard (CR-04) stays reachable and load-bearing exactly as before.
- Deleted `loggedSetUpdateSet` entirely rather than leaving it beside the new general guard — two mechanisms for the same concern is how the narrower one gets forgotten again.
- Left `isInvalidSessionExercise`'s non-empty-`exercise_id` requirement on `session_exercise` PATCHes in place. Relaxing it needs its own decision about PATCH-as-insert semantics; logged to WINDOWS.md (#31) instead, per the plan's `deliberate_deferrals`.
- Generic constraint on `patchAwareSet<V>` is `V extends object`, not the originally-planned `V extends Record<string, unknown>` — TypeScript's index-signature assignability rule rejects a concrete named interface (no index signature) as an argument to a `Record<string, unknown>`-constrained generic, even though every property matches structurally. `object` is the correct, looser bound for a generic that only needs `Object.keys`/property-indexing, not an index signature. Caught and fixed during Task 2's own typecheck pass — not a deviation from the plan's intent, just the actual TypeScript signature the plan's illustrative pseudocode needed adjusting to compile.

## Deviations from Plan

None requiring the deviation rules — one implementation-detail correction is documented above (the generic constraint), caught by the plan's own verification step (`pnpm --filter api typecheck`) during Task 2, before any commit.

## Task 1 Red Evidence (verbatim)

Environment: real Postgres at `postgresql://postgres:postgres@127.0.0.1:5432/fitness` (schema already applied from prior phase work), API built via `nest build`, suites run via `npx jest --config ./test/jest-e2e.json --runInBand`.

### `patch-partial-update.e2e-spec.ts` — 6 failed, 2 passed, 8 total

```
✕ LOG-22: a {status, ended_at}-only finish PATCH ... byte-identical (197 ms)
✕ session_exercise reorder PATCH changes only order_index ... (130 ms)
✕ logged_set reps-only PATCH changes only reps ... (150 ms)
✕ logged_set weight-only PATCH changes only weight_kg ... (142 ms)
✓ PUT still fully replaces workout_session ... (115 ms)
✓ PUT still fully replaces logged_set ... (126 ms)
✕ conflict log agrees with the row for a completed logged_set ... (129 ms)
✕ one realistic finish batch ... (126 ms)
```

Failure detail, column by column:

1. **LOG-22 finish-workout** — `expect(after.started_at).toBe(before.started_at)` failed:
   `Expected: "2026-06-16 03:45:00"` / `Received: "2026-08-17 20:10:56.368"` — `started_at` was reset to the PATCH's receive time, exactly the defect `02-VERIFICATION.md` and `02-REVIEW.md` CR-01 described.
2. **session_exercise reorder** — `expect(after.superset_group_id).toBe(before.superset_group_id)` failed:
   `Expected: "sg-1"` / `Received: null` — every untouched `session_exercise` column was reset to its default.
3. **logged_set reps-only** — `expect(after.set_index).toBe(before.set_index)` failed:
   `Expected: 3` / `Received: 0` — `set_index` reset to its default the instant a PATCH omitted it, the exact clobber `02-VERIFICATION.md`'s gap named.
4. **logged_set weight-only** — same shape: `expect(after.set_index).toBe(before.set_index)` failed, `Expected: 3` / `Received: 0`.
5. **conflict log agrees with the row** — `expect(Number(latest.winning_value.set_index)).toBe(after.set_index)` failed:
   `Expected: 0` / `Received: 1` — the conflict log recorded the correct pre-existing value, but the row itself had already been clobbered to `0`, so log and row disagreed (the exact defect `sync_conflict_log` correctness depends on).
6. **one realistic finish batch** — `expect(afterSession.started_at).toBe(beforeSession.started_at)` failed:
   `Expected: "2026-06-16 03:45:00"` / `Received: "2026-08-17 20:10:57.287"` — same `started_at`-reset defect, reproduced inside a multi-op batch.

**The two PUT-still-replaces cases passed in this same red run** — the control proving the suite itself was sound and only the PATCH path was broken.

### `null-weight.e2e-spec.ts` — exactly 2 failed, 6 passed, 8 total

```
✓ PUT with weight_kg absent from data stores SQL NULL ...
✓ PUT with weight_kg of '0' stores 0.000, not null
✓ a null-weight set and a zero-weight set pushed together ...
✕ PATCH with weight_kg explicitly null is applied, not rejected ...
✕ PATCH changing only reps, with weight_kg absent ...
✓ PUT with weight_kg of '-5' is rejected invalid_field
✓ PUT with weight_kg of 'abc' is rejected invalid_field
✓ a conflict-logged overwrite with an incoming null weight ...
```

Both failures were on `set_index`, a column neither PATCH named:

- `PATCH with weight_kg explicitly null`: `expect(after?.set_index).toBe(before?.set_index)` — `Expected: 1` / `Received: 0`.
- `PATCH changing only reps`: `expect(after?.set_index).toBe(before?.set_index)` — `Expected: 1` / `Received: 0`. Notably, `expect(after?.reps).toBe(9)` on the preceding line **passed** — the PATCH's own value landed correctly; only the untouched sibling column was clobbered, confirming this was the clobber defect and not a broken PATCH path.

**No failure in either suite was a connection error, a timeout, an unexpected `rejected` entry, or a foreign-key violation** — every failure was an assertion mismatch on a column the PATCH never named, exactly as the plan's acceptance criteria required.

## Task 2 Green Confirmation

- `pnpm --filter api test:e2e -- patch-partial-update` — 8/8 pass, 0 skipped, unmodified suite from Task 1's commit.
- `pnpm --filter api test:e2e -- null-weight` — 8/8 pass, 0 skipped.
- `pnpm --filter api test` — `conflict-policy.spec.ts` (11 cases) + `patch-update-set.spec.ts` (12 cases) = 23/23 pass, 0 skipped.
- Regression suites, all 0 exit / all green: `sync-push` (7), `sync-aggregate`, `concurrent-edit`, `poison-pill`, `schema-parity` (45 total across these 5 files), `seeded-corpus-perf` (7).
- `packages/api-contracts/src/sync.ts` unmodified (confirmed by `git status` — only `apps/api/**` and `.planning/WINDOWS.md` changed across the whole plan).

## Task 2 Mutation Test (verbatim compiler error)

Deleted `setIndex: 'set_index',` from `LOGGED_SET_PATCH_FIELDS` in `apps/api/src/sync/patch-update-set.ts`, ran `pnpm --filter api typecheck`:

```
$ tsc --noEmit
src/sync/patch-update-set.ts(86,14): error TS2741: Property 'setIndex' is missing in type '{ id: null; sessionExerciseId: null; setType: string; weightKg: string; reps: string; rir: string; side: string; completed: string; parentSetId: string; restTakenSeconds: string; loggedAt: string; }' but required in type 'PatchFieldMap<LoggedSetValues>'.
[ELIFECYCLE] Command failed with exit code 2.
```

Restored the entry, re-ran `pnpm --filter api typecheck`: exits 0, no output. The exhaustiveness gate is real — a map that goes stale on the next column added breaks the build rather than silently under-classifying.

## WINDOWS.md Ids Assigned

- **#27** (`deviation`, WR-01) — single-known-root heal poisons siblings; not folded in (aggregate-grouping concern, distinct from the update set).
- **#28** (`deviation`, WR-02) — `highestServerSeq` not rewound on rollback; latent, no client reads `server_seq`.
- **#29** (`unrun-verify`, WR-03) — no CI step greps the exported web bundle for the durability harness.
- **#30** (`stub`, WR-04) — `DURABILITY_HARNESS_ENABLED` dead export.
- **#31** (`deviation`) — `isInvalidSessionExercise`'s `exercise_id`-required constraint on `session_exercise` PATCHes, deliberately left in place.

`total_count` rose 26 → 31, `open_count` rose 21 → 26, `fixed_count` unchanged at 5. No entry was added for the PATCH-clobber defect this plan closes.

## Issues Encountered

- **Environment setup, not a plan defect:** this fresh worktree had no `apps/api/.env` (untracked/gitignored, so not carried into a new `git worktree` checkout) and no built `packages/api-contracts/dist`. Resolved by exporting the required env vars inline on every `pnpm`/`jest` invocation (matching `.github/workflows/ci.yml`'s literal values — `postgresql://postgres:postgres@127.0.0.1:5432/fitness`, throwaway `BETTER_AUTH_SECRET`/`POWERSYNC_JWT_SECRET`) and running `pnpm run build` in `packages/api-contracts` once before the API's own build. The Postgres schema itself was already applied (confirmed via `\dt` and `\d logged_set` — `weight_kg` already nullable from 02-10/02-12's prior work), so `db:push` was a no-op. Writing `apps/api/.env` directly was blocked by a permission rule; the inline-env-var approach was used instead and required no permission exception.

## Next Phase Readiness

- The sync apply path is now safe for any future "edit a set" or "finish a workout" feature that emits a PATCH — no schema or contract change was needed, `packages/api-contracts/src/sync.ts` is untouched.
- `PatchFieldMap<V>` establishes the pattern any future table added to `PUSH_APPLIED_TABLES` with PATCH support must follow (a `{Table}Values` interface, a `{TABLE}_PATCH_FIELDS` map, `patchAwareSet` in the write path) — the compiler now enforces it rather than relying on review discipline.
- No blockers for downstream phases. Five known-open findings are tracked on the ledger (ids 27-31) rather than only living in `02-REVIEW.md`.

## Self-Check: PASSED

All 7 claimed files verified present (`apps/api/src/sync/patch-update-set.ts`,
`apps/api/src/sync/__tests__/patch-update-set.spec.ts`,
`apps/api/test/patch-partial-update.e2e-spec.ts`, `apps/api/src/sync/sync.service.ts`,
`apps/api/test/null-weight.e2e-spec.ts`, `.planning/WINDOWS.md`, this SUMMARY.md). All 3 task
commit hashes (`ff8a501`, `3eb8a3f`, `c3f2a41`) verified present in `git log --oneline --all`.

---
*Phase: 02-data-model-sync-engine*
*Completed: 2026-08-17*
