---
quick_id: 260902-fei
slug: fix-silent-sync-push-drop-of-sqlite-inte
status: complete
date: 2026-09-02
commits:
  - ae0a067 (fix - Task 1: accept rule + coerce rule)
  - d5c73a2 (test - Task 2: regression spec)
  - 8ec85b3 (fix - Task 3: rejection logging)
closes: STATE.md blocker "Sync push silently drops logged_set" (144b3ee regression, WR-03)
---

# Quick 260902-fei — Summary

## What changed

`apps/api/src/sync/sync.service.ts` — PowerSync ships every SQLite `integer('x', { mode:
'boolean' })` column as the raw `0`/`1` on the wire, not a JS boolean. `hasInvalidField` tested
`typeof value === 'boolean'`, so every op carrying `completed: 1` or `enabled: 0` was rejected
`invalid_field` and silently dropped by the client's terminal-rejection handling — never reaching
Postgres.

One accept rule, one coerce rule, applied everywhere:

- `isSqliteBoolean(value)` — accepts exactly `true`, `false`, `0`, `1`. `'yes'`, `2`, `-1` and
  `null` stay rejected; the accept set is enumerated, not a truthiness test, so it cannot become a
  wider injection surface.
- `toBoolean(value, fallback)` — `undefined`/`null` yield the fallback, otherwise `true` only for
  `true`/`1`.

`isValidOptionalBoolean` now routes through `isSqliteBoolean`; the five inline
`typeof … !== 'boolean'` checks (`never_suggest`, `progression_frozen`, `auto_advance_enabled`,
`warmup_sets_enabled`, `is_default`) route through it directly. `exercise.is_custom` now rejects
the SQLite-integer `0` the same as `false`, closing the provenance hole where a client-authored row
could otherwise claim seeded-catalog origin.

All ten write sites — the nine `toXValues` mappers plus the conflict-log `winningValue` builder —
coerce through `toBoolean` with the fallback each already had, so a Drizzle boolean column never
receives a raw `1`/`0`.

The `OpData` interfaces' boolean fields are now typed `SqliteBoolean = boolean | 0 | 1` instead of
`boolean`, so `tsc` itself flags any future mapper site that forwards a raw value unconverted.

`applyBatch`'s initial validation loop — the forbidden hard delete, the unknown table, and
`hasInvalidField` failure — now routes through a `rejectOp(op, reason)` closure that logs
`op_id`/`type`/reason via `this.logger.warn` before pushing to `rejected`. This loop is what
silently ate the regression for eight days; a rejected op is no longer invisible server-side.

`apps/api/src/sync/__tests__/sqlite-boolean-ops.spec.ts` (new) — `describe.each` over the seven
directly-validated boolean columns, asserting `1`/`0`/`true`/`false`/`undefined` accepted and
`'yes'`/`2`/`-1`/`null` rejected, plus standalone cases for `exercise.is_custom` and a realistic
`logged_set` op carrying `completed: 1` alongside other fields.

## Deviations from plan

None — plan executed exactly as written. Three tasks, three commits (fix / test / fix), matching
the plan's task boundaries; the plan's closing "one commit" note is superseded by this dispatch's
explicit atomic-per-task commit constraint.

## Verification

| Check | Result |
|---|---|
| `pnpm --filter api typecheck` | exit 0, after every task |
| `pnpm --filter api test` | 10 suites / 189 tests pass (new spec added 66) |
| `pnpm -w typecheck` | exit 0 (all 8 workspace packages) |
| `grep -c 'toBoolean(' sync.service.ts` | 11 (10 call sites + definition) — matches plan |
| `grep -c "rejectOp(op, '" sync.service.ts` | 3 — matches plan exactly |
| New spec discriminates | Temporarily restored the pre-fix `sync.service.ts` (git show of the pre-Task-1 commit) and reran the new spec: **16 of 66 cases failed** — every `0`/`1` accept case, both `is_custom` cases, and the realistic `logged_set` case. Restored the fix; full suite back to 189/189. |

## Decisions

**Widened `OpData` boolean field types (`boolean | 0 | 1`) rather than leaving them `boolean` and
casting at each call site.** Matches the plan's stated intent: the declared type stays honest about
what actually arrives on the wire, and `tsc` catches any future mapper that forwards a raw value
without going through `toBoolean`.

**`unilateral` and `is_rest_day` left with no validator entry**, per plan — this task normalizes
what gets written (the mappers coerce them via `toBoolean`), it does not add new rejection rules
that could turn a previously-accepted write into `invalid_field`.

## Not done

The API e2e suite (`pnpm --filter api test:e2e`) was not run — per the plan and the dispatch
environment notes, it POSTs real JS booleans and is structurally blind to this class of bug; the
orchestrator runs the browser E2E separately afterward.

## Self-Check: PASSED

- FOUND: `apps/api/src/sync/__tests__/sqlite-boolean-ops.spec.ts`
- FOUND: `.planning/quick/260902-fei-fix-silent-sync-push-drop-of-sqlite-inte/260902-fei-SUMMARY.md`
- FOUND commit ae0a067
- FOUND commit d5c73a2
- FOUND commit 8ec85b3
