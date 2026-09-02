---
quick_id: 260902-fei
slug: fix-silent-sync-push-drop-of-sqlite-inte
status: planned
created: 2026-09-02
source: .planning/STATE.md blocker — "Sync push silently drops logged_set" (memory: fitness-sync-e2e-env-gotcha)
regression_from: 144b3ee (2026-08-25, WR-03)
files_modified:
  - apps/api/src/sync/sync.service.ts
  - apps/api/src/sync/__tests__/sqlite-boolean-ops.spec.ts
autonomous: true
must_haves:
  truths:
    - A crud op carrying completed:1 or enabled:0 is accepted by POST /v1/sync/push and written to Postgres as a real boolean.
    - A crud op carrying a non-boolean value ('yes', 2, -1, null) on those columns is still rejected invalid_field.
    - An op rejected in applyBatch's validation loop leaves a server-side log line naming its op_id, table and reason.
  artifacts:
    - apps/api/src/sync/__tests__/sqlite-boolean-ops.spec.ts
  key_links:
    - hasInvalidField -> isSqliteBoolean (one accept rule for every boolean column)
    - toXValues mappers -> toBoolean (Drizzle boolean columns never receive 1/0)
---

# Quick 260902-fei — Fix silent sync-push drop of SQLite integer booleans

## Problem

The client stores every boolean column as a SQLite integer
(`integer('x', { mode: 'boolean' })`, `apps/mobile/lib/db/schema.ts`). PowerSync's crud queue ships
the **raw SQLite value**, so `completed: 1` / `enabled: 0` arrive at `POST /v1/sync/push` as
numbers.

`hasInvalidField` (`apps/api/src/sync/sync.service.ts`) tests `typeof value === 'boolean'` — via
`isValidOptionalBoolean` (line ~904) and five inline checks. Every such op is rejected
`invalid_field`; `isTerminalRejection` in `apps/mobile/lib/db/connector.ts` treats that as terminal
and calls `transaction.complete()`, so the row is dropped from the queue and **never reaches
Postgres**. Silent data loss on the project's core write path.

Introduced by 144b3ee (2026-08-25, WR-03). The API e2e suites pass because they POST real JS
booleans over HTTP, bypassing SQLite entirely — so no existing test can see this.

Two second-order holes of the same family:

- `exercise.is_custom` is rejected by `d.is_custom === false`. An integer `0` slips straight
  through, letting a client-authored row claim seeded-catalog provenance.
- The conflict-log `winningValue` (line ~2110) records `incoming.completed` verbatim, so
  `sync_conflict_log` would store `1` where every other row stores `true`.

## Approach

One accept rule, one coerce rule, applied everywhere:

- `isSqliteBoolean(value)` — accepts exactly `true`, `false`, `0`, `1`. Nothing widens to
  truthiness: `'yes'`, `2`, `-1` and `null` stay rejected, so a widened validator cannot become a
  new injection surface.
- `toBoolean(value, fallback)` — `undefined`/`null` yield the fallback, otherwise `true` only for
  `true`/`1`.

Validation is normalized at the boundary and coercion happens in the `toXValues` mappers.
`patchAwareSet` (`apps/api/src/sync/patch-update-set.ts`) builds PATCH `set` clauses from those same
`Values` objects, so normalizing in the mappers covers PUT and PATCH in one move — no second code
path.

The `Values` interfaces in `patch-update-set.ts` already declare `completed: boolean`,
`unilateral: boolean`, etc. Widening the `OpData` field types to `boolean | 0 | 1` makes `tsc` itself
find every mapper site that still passes a raw value through.

Task 3 is the reason this went unnoticed for eight days: a rejected op is currently invisible on the
server. One `logger.warn` per rejection closes that.

## Threat model

Trust boundary: untrusted client crud payload → `POST /v1/sync/push` → Postgres.

| Threat ID | Category | Component | Severity | Disposition | Mitigation |
|-----------|----------|-----------|----------|-------------|------------|
| T-FEI-01 | Tampering | `isSqliteBoolean` in `hasInvalidField` | medium | mitigate | Enumerated accept set (`true`/`false`/`0`/`1`) rather than a truthiness or `!= null` test — an accept-anything rule would let arbitrary payloads set NOT NULL boolean columns. |
| T-FEI-02 | Elevation of Privilege | `exercise.is_custom` | medium | mitigate | Route the provenance rejection through `toBoolean` so integer `0` is rejected identically to `false`. |
| T-FEI-03 | Information disclosure | new rejection log line | low | mitigate | Log `op_id`, `type` and `reason` only. `op.data` carries user notes and bodyweight values and must not enter the log. |

No package installs in this task — the package-legitimacy gate does not apply.

## Tasks

### Task 1 — One boolean accept rule and one coerce rule, applied to every boolean column

**Files:** `apps/api/src/sync/sync.service.ts`

Add two module-scope helpers next to the existing validators (`isNonNegativeInteger` … at line ~876):

- `isSqliteBoolean(value: unknown): boolean` — returns true for exactly `true`, `false`, `0`, `1`.
- `toBoolean(value: boolean | 0 | 1 | null | undefined, fallback: boolean): boolean` — `undefined`
  and `null` yield `fallback`; otherwise `true` only for `true` and `1`.

Add a shared field type alias (e.g. `type SqliteBoolean = boolean | 0 | 1;`) and apply it to every
boolean field on the `OpData` interfaces (lines ~306–423): `LoggedSetOpData.completed`,
`ExerciseOpData.unilateral`, `ExerciseOpData.is_custom`,
`UserExercisePreferenceOpData.never_suggest`, `RoutineOpData.progression_frozen`,
`UserPreferenceOpData.auto_advance_enabled`, `UserPreferenceOpData.warmup_sets_enabled`,
`DashboardWidgetOpData.enabled`, `EquipmentProfileOpData.is_default`,
`RoutineDayOpData.is_rest_day`. The declared types stay honest about what actually arrives on the
wire, and `tsc` then flags every mapper that still forwards a raw value.

Rewrite `isValidOptionalBoolean` (line ~904) as `value === undefined || isSqliteBoolean(value)` and
route the five inline `typeof … !== 'boolean'` checks through it:

| Line | Field |
|------|-------|
| ~1080 | `user_exercise_preference.never_suggest` |
| ~1145 | `routine.progression_frozen` |
| ~1180 | `user_preference.auto_advance_enabled` |
| ~1181 | `user_preference.warmup_sets_enabled` |
| ~1199 | `equipment_profile.is_default` |

`logged_set.completed` (~1034) and `dashboard_widget.enabled` (~1133) already call
`isValidOptionalBoolean` and need no call-site change.

Change the `exercise.is_custom` rejection (~1073) so an integer `0` is rejected exactly as `false`
is, while an absent field stays accepted (T-FEI-02).

Coerce through `toBoolean` at all ten write sites — nine mappers plus the conflict-log builder,
each keeping the fallback it has today:

| Line | Site | Fallback |
|------|------|----------|
| 534 | `toLoggedSetValues.completed` | `false` |
| 564 | `toExerciseValues.unilateral` | `false` |
| 598 | `toUserExercisePreferenceValues.neverSuggest` | `false` |
| 680 | `toDashboardWidgetValues.enabled` | `true` |
| 698 | `toRoutineValues.progressionFrozen` | `false` |
| 724 | `toUserPreferenceValues.autoAdvanceEnabled` | `true` |
| 725 | `toUserPreferenceValues.warmupSetsEnabled` | `true` |
| 784 | `toEquipmentProfileValues.isDefault` | `false` |
| 806 | `toRoutineDayValues.isRestDay` | `false` |
| 2110 | conflict-log `winningValue.completed` | `stored.completed` |

`unilateral` and `is_rest_day` have no validator entry today; leave it that way — this task
normalizes what is written, it does not add new rejection rules that could turn working writes into
`invalid_field`. Do not touch `patchAwareSet` or any `Values` interface: they already declare
`boolean`, which is the point.

Per `.claude/CLAUDE.md`, add no explanatory comment restating what these helpers do. The one place a
comment earns itself is the enumerated accept set, if and only if it records why truthiness is
rejected.

**Behavior (what Task 2 will assert):**
- `completed: 1` and `enabled: 0` validate and map to `true` / `false`.
- `completed: true` / `false` keep working unchanged.
- An absent field still validates (a PATCH naming only other columns — WR-03).
- `'yes'`, `2`, `-1` and `null` are still rejected on every one of these columns.

**Verify:**
```
pnpm --filter api typecheck
pnpm --filter api test
grep -c 'toBoolean(' apps/api/src/sync/sync.service.ts   # >= 11 (10 call sites + definition)
```
**Done:** `typecheck` exits 0, the four existing specs stay green, and every row in both tables
above is converted.

### Task 2 — Regression spec for every boolean column on the push path

**Files:** `apps/api/src/sync/__tests__/sqlite-boolean-ops.spec.ts` (new)

Follow the shape of `progression-preference.spec.ts`: import `hasInvalidField` from
`../sync.service`, build a `SyncCrudOp` literal, assert the boolean return. No Nest, no DB.

Use `describe.each` over `[table, field, baseData]` covering every boolean column
`hasInvalidField` checks:

| Table | Field | Base data required to reach the check |
|-------|-------|----------------------------------------|
| `logged_set` | `completed` | — |
| `dashboard_widget` | `enabled` | — |
| `user_preference` | `auto_advance_enabled` | — |
| `user_preference` | `warmup_sets_enabled` | — |
| `equipment_profile` | `is_default` | — |
| `routine` | `progression_frozen` | — |
| `user_exercise_preference` | `never_suggest` | `{ exercise_id: 'ex-1' }` (a non-empty `exercise_id` is checked first and would otherwise mask the boolean case) |

Per field, `it.each` asserting accepted: `1`, `0`, `true`, `false`, `undefined`; and rejected:
`'yes'`, `2`, `-1`, `null`. Give each case a one-phrase label so a failure names the shape that
regressed — `0` in particular, because it is not nullish and no `?? fallback` ever rescued it.

Add two standalone cases outside the table:
- `exercise` with `is_custom: 0` is rejected (T-FEI-02), and `is_custom: 1` is accepted.
- `logged_set` with `{ completed: 1, reps: 5, weight_kg: 60 }` — a realistic op, proving the fix in
  the presence of the other validators rather than in isolation.

**Verify:**
```
pnpm --filter api test
pnpm -w typecheck
```
**Done:** The new spec is green, the four pre-existing specs stay green, and the accepted cases fail
if Task 1's changes to `hasInvalidField` are reverted.

### Task 3 — A rejected op is never silent server-side

**Files:** `apps/api/src/sync/sync.service.ts`

In `applyBatch` (line ~1240), immediately after `const rejected: … = []` is declared, add a local
closure `rejectOp(op, reason)` that emits one `this.logger.warn` naming `op.op_id`, `op.type` and
the reason, then pushes onto `rejected`. Match the message style already used at lines ~1536 and
~2467 (`applyBatch: …`).

Use it at exactly the three sites in the initial validation loop — the forbidden hard delete
(~1248), the unknown table (~1252) and the `hasInvalidField` failure (~1256). Leave every later
`rejected.push` untouched: those already sit inside paths with their own logging, and this task is
about the loop that swallowed this bug.

The warn line carries the op's identity only. `op.data` holds user notes and bodyweight values and
must stay out of the log (T-FEI-03).

**Verify:**
```
pnpm --filter api typecheck
grep -c "rejectOp(op, '" apps/api/src/sync/sync.service.ts   # == 3
grep -n 'logger.warn' apps/api/src/sync/sync.service.ts       # includes the new rejectOp line
```
**Done:** The three validation-loop rejections route through `rejectOp`; the rest of `applyBatch`
is unchanged; `typecheck` exits 0.

## Verification

- `pnpm --filter api test` — new spec plus the four existing specs.
- `pnpm -w typecheck` — the widened `OpData` types line up with `patch-update-set.ts`'s `Values`
  interfaces across the workspace.

The API e2e suite (`pnpm --filter api test:e2e`, needs a live Postgres) is *not* a gate here: it
POSTs real JS booleans and is structurally blind to this bug — that blindness is why the regression
shipped. The unit spec is the real evidence.

## Success criteria

- A push op carrying `completed: 1` is applied, not rejected.
- Non-boolean values on those columns are still rejected `invalid_field`.
- `exercise.is_custom: 0` is rejected.
- Every rejection in `applyBatch`'s validation loop produces a server log line.
- The STATE.md blocker "Sync push silently drops logged_set" can be closed.

## Commit

One commit. No AI attribution trailer (`.claude/CLAUDE.md`).

```
fix(sync): accept SQLite integer booleans on the push path
```
