---
phase: 02-data-model-sync-engine
reviewed: 2026-08-17T00:00:00Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - .github/workflows/ci.yml
  - .gitignore
  - apps/api/src/db/schema/session.ts
  - apps/api/src/sync/conflict-policy.ts
  - apps/api/src/sync/sync.service.ts
  - apps/api/test/null-weight.e2e-spec.ts
  - apps/api/test/poison-pill.e2e-spec.ts
  - apps/mobile/__tests__/offline-write.test.ts
  - apps/mobile/app/__durability.tsx
  - apps/mobile/app/__durability.web.tsx
  - apps/mobile/e2e/durability.spec.ts
  - apps/mobile/e2e/node-shims.d.ts
  - apps/mobile/e2e/schema-redefinition.spec.ts
  - apps/mobile/e2e/sync.spec.ts
  - apps/mobile/jest.config.js
  - apps/mobile/lib/api-client.ts
  - apps/mobile/lib/db/__tests__/log-set.test.ts
  - apps/mobile/lib/db/connector.ts
  - apps/mobile/lib/db/log-set.ts
  - apps/mobile/lib/db/powersync.ts
  - apps/mobile/lib/db/powersync.web.ts
  - apps/mobile/lib/db/test-support.ts
  - apps/mobile/lib/sync-status.ts
  - apps/mobile/package.json
  - apps/mobile/playwright.config.ts
  - packages/api-contracts/src/__tests__/sync.test.ts
  - packages/api-contracts/src/sync.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 02: Code Review Report — Gap-Closure Round (plans 02-09..02-12)

**Reviewed:** 2026-08-17
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

This round closed the four findings from the prior review (CR-01..CR-04) correctly and with real
proof — see the closure verdicts below. In the course of tracing the fix for CR-02 (null
`weight_kg` coercion) to its root, however, I found that the general defect class it belongs to —
`sync.service.ts`'s `onConflictDoUpdate` always writing every column, including ones a `PATCH`
op never mentioned — was fixed for exactly one field (`logged_set.weight_kg`) and not
generalized. Every other field on all three applied tables (`workout_session`,
`session_exercise`, `logged_set`) is still silently reset to a default the moment a `PATCH` omits
it. This is provably happening today inside this round's own e2e suite (see CR-01 below) — it is
not a hypothetical. That is the one Critical finding in this round.

The durability-harness production-bundle-exclusion engineering (test-support.ts's folded
ternaries, the `.web.tsx`/`.tsx` platform split) is sound and internally consistent, but its
central safety claim — that Terser/Metro actually eliminates the harness from the exported web
bundle — is asserted only in comments, with no CI step that verifies the built artifact. Given
this round's own framing of harness-in-production as the highest-severity risk class in the diff,
that gap is worth closing, not just documenting.

## Critical Issues

### CR-01: `sync.service.ts`'s PATCH apply path clobbers every field a PATCH doesn't mention — proven by this round's own e2e suite

**File:** `apps/api/src/sync/sync.service.ts:128-161, 550-583` (also `83-100, 102-118, 557-576`)

**Issue:** CR-02 (the prior round's finding) was "null `weight_kg` coerced to the string `'0'`
instead of SQL NULL." The fix that shipped, `loggedSetUpdateSet`, is scoped to exactly that one
field:

```ts
function loggedSetUpdateSet(op, values) {
  const data = (op.data ?? {}) as Record<string, unknown>;
  if (op.op === 'PATCH' && !('weight_kg' in data)) {
    const { weightKg, ...rest } = values;
    return rest;
  }
  return values;   // <- every other field still goes in, computed with a default
}
```

`toLoggedSetValues` computes every column with a `??` default (`reps: d.reps ?? 0`, `setIndex:
d.set_index ?? 0`, `completed: d.completed ?? false`, `loggedAt: d.logged_at ? new Date(...) :
new Date()`, `parentSetId: d.parent_set_id ?? null`, `side: d.side ?? null`,
`restTakenSeconds: d.rest_taken_seconds ?? null`). `loggedSetUpdateSet` only strips `weightKg`
from that object when a PATCH omits `weight_kg` — it does nothing for the other eight columns. A
`PATCH` that updates only `reps` (or only `weight_kg`) still writes `setIndex: 0`,
`completed: false`, and `loggedAt: <now>` over the stored row's real values, because those
defaults are present in `values` and `onConflictDoUpdate({ set: values })` writes the whole
object.

**`session_exercise` and `workout_session` have no partial-update guard at all** — `toSessionExerciseValues`/`toWorkoutSessionValues` are passed straight into `set:` with no
PATCH-aware exclusion of any kind:

```ts
} else if (op.type === 'session_exercise') {
  await tx.insert(sessionExercise).values(values).onConflictDoUpdate({
    target: sessionExercise.id,
    set: values,                      // <- every column, always
  });
}
```

For `workout_session`, this is severe: `toWorkoutSessionValues` recomputes `startedAt` as `new
Date()` when `started_at` is absent from the op's data, and `localDate` is derived *from that
wrong `startedAt`* when `local_date` is absent. A realistic "finish workout" PATCH —
`{ status: 'completed', ended_at: '...' }`, deliberately omitting the fields that don't change —
would silently overwrite `started_at` with the PATCH's receive time, `local_date` with the wrong
calendar day, `timezone` with `'UTC'`, and `routine_day_id`/`equipment_profile_id`/`device_id`
with `null`. These are exactly the columns `session.ts`'s own comment calls out as
"captured once... no read path recomputes them" — this code path recomputes and overwrites them
anyway. The same shape of bug resets `order_index`, `superset_group_id`, and every `target_*`
field on `session_exercise`.

**This is not speculative** — it already fires inside this round's own passing test. In
`apps/api/test/null-weight.e2e-spec.ts`, `'PATCH changing only reps, with weight_kg absent,
leaves the previously-stored weight byte-identical'` seeds a row with `set_index: 1, weight_kg:
'52.500', reps: 5, completed: true`, then sends `PATCH { reps: 9 }`. The test only re-reads
`weight_kg` and finds it unchanged (correct — that's what CR-02 fixed). It never re-reads
`set_index` or `completed`. Tracing the code: `set_index` is written as `0` and `completed` is
written as `false` by that exact PATCH, in that exact test run, right now — the test simply
doesn't look. The `'PATCH with weight_kg explicitly null'` test has the same blind spot.

No mobile client code in this round emits a PATCH for these tables yet (`log-set.ts` only ever
inserts), so nothing in the shipped app triggers this today. But `PATCH` is a first-class,
already-accepted `SyncCrudOpType` for all three `PUSH_APPLIED_TABLES`, reachable right now over
the public `/v1/sync/push` endpoint, and it is the obvious shape the next "edit a set" / "finish
a workout" feature will use. Shipping this now means the next feature that does a partial update
silently corrupts historical training data (start time, calendar-day attribution, set counts,
completion state) with no error, no rejection, and no signal to the user.

**Fix:** Generalize `loggedSetUpdateSet`'s pattern into a single field-presence-aware update-set
builder shared by all three tables — for a `PATCH`, only the keys actually present in `op.data`
should appear in `onConflictDoUpdate`'s `set`; for a `PUT`, the full-column replace (current
behavior) is correct and should stay as-is. For example:

```ts
const FIELD_KEY_MAP: Record<MappedTable, Record<string, keyof ReturnType<typeof toX>>> = { /* snake_case op field -> camelCase column */ };

function partialUpdateSet<T extends Record<string, unknown>>(
  op: SyncCrudOp,
  values: T,
  fieldKeyMap: Record<string, keyof T>,
): Partial<T> {
  if (op.op !== 'PATCH') return values;
  const data = (op.data ?? {}) as Record<string, unknown>;
  const set: Partial<T> = {};
  for (const [opKey, valueKey] of Object.entries(fieldKeyMap)) {
    if (opKey in data) set[valueKey] = values[valueKey];
  }
  return set;
}
```

Apply this (or an equivalent per-table mapping) to `workout_session` and `session_exercise` the
same way `loggedSetUpdateSet` was applied to `logged_set`, and extend `logged_set`'s own guard to
every column, not just `weight_kg`. Add e2e coverage asserting the *other* fields survive a
narrow PATCH (e.g. assert `set_index`/`completed`/`side` are unchanged after the existing
"reps-only" PATCH test, and assert `started_at`/`timezone`/`local_date` survive a
`{status, ended_at}`-only PATCH to `workout_session`).

## Warnings

### WR-01: The single-known-root "heal" can poison legitimately-resolved sibling ops in the same batch — untested by the poison-pill suite

**File:** `apps/api/src/sync/sync.service.ts:369-388`

**Issue:** When an op's parent cannot be resolved at all (`resolvedRoot === null` — e.g. a
`session_exercise`/`logged_set` op whose parent-reference field is entirely absent from `data`,
and no existing DB row supplies it), the code heals it onto the batch's one other known root
*if and only if exactly one other root is resolvable in the whole batch* — and marks that
aggregate `poisoned`:

```ts
if (existing) {
  existing.ops.push(op);
  if (resolvedRoot === null) existing.poisoned = true;   // <- poisons every op already in this aggregate
}
```

`poisoned` rejects **every** op in that aggregate as `missing_parent`, including ops that
resolved their own parent correctly and were added to the aggregate *before* the orphan arrived.
A single malformed op sharing a batch with exactly one legitimate session therefore takes that
entire session's push down — not just the malformed op — and since `missing_parent` is
non-terminal, the client will retry the identical (still-poisoned) batch indefinitely, so the
legitimate session's data never syncs until something removes the malformed op from the queue.

`poison-pill.e2e-spec.ts`'s tests always use two *distinct* `workout_session` ids for the
poisoned and healthy aggregates, which makes `resolvedRoots.size === 2` and skips the heal path
entirely (`healRoot = null`) — the actual "one resolvable root, orphan heals in and poisons it"
branch this code implements has no test coverage anywhere in the given files.

Reachability today: `log-set.ts` always populates `sessionId`/`sessionExerciseId` on every
insert, so the mobile app itself cannot produce an op with a fully-absent parent reference — this
requires a hand-crafted or corrupted HTTP payload. Damage is also self-scoped (ownership is
checked after root resolution, so this cannot be used to touch another user's aggregate) — at
worst it is a self-inflicted, permanent stall of one's own sync queue.

**Fix:** When healing an orphan into an existing (already-non-poisoned) aggregate, poison only
the orphan's own key (or split it into its own `__orphan_N` bucket) instead of retroactively
poisoning ops that already resolved a real root. Add a poison-pill test with a single
`workout_session` root plus one op with a data payload that omits its parent-reference field
entirely, asserting the *other* ops in that same session still apply.

### WR-02: `highestServerSeq` isn't rewound when an aggregate's transaction rolls back

**File:** `apps/api/src/sync/sync.service.ts:438, 490-492, 536-538, 567-568, 593`

**Issue:** On the `catch` path, `applied.length = appliedBefore` correctly undoes credit for ops
whose writes were rolled back by the failed transaction. `highestServerSeq`, however, is a plain
outer-scope variable bumped via `if (seqValue > highestServerSeq) highestServerSeq = seqValue;`
inside the transaction body, and nothing resets it on catch. Postgres sequence `nextval()` calls
are non-transactional by design, so a value obtained inside a rolled-back transaction is real (the
sequence advanced) but was never attached to any row that actually committed.
`SyncPushResponse.server_seq` can therefore report a value ahead of anything durably stored.

No code in this round's `connector.ts` reads `result.server_seq`, so there is no currently
observable client-side effect — this is a latent correctness gap in the response contract, not an
active bug.

**Fix:** Either track `highestServerSeq` per-aggregate and only fold it into the outer value after
a successful commit, or document `server_seq` explicitly as "high-water mark, not guaranteed
committed" so a future consumer doesn't rely on it as a precise checkpoint.

### WR-03: Harness exclusion from the production web bundle is asserted only by comments — nothing in CI verifies it

**File:** `apps/mobile/lib/db/test-support.ts:70-83`, `apps/mobile/app/__durability.web.tsx:33-36`, `.github/workflows/ci.yml`

**Issue:** The load-bearing safety property here — that `DURABILITY_HARNESS_GLOBAL` folds to `''`
and the entire `window[...]` assignment (which wires up real `connectPowerSync`/`SyncConnector`
access against the production PowerSync singleton) is dead-code-eliminated from the web bundle
whenever `EXPO_PUBLIC_DURABILITY_HARNESS` is unset at build time — is real and well-reasoned, and
`apps/mobile/package.json`'s `"build": "expo export --platform web"` script correctly does not
set the flag. But nothing verifies the *output*. `ci.yml`'s `check` job runs `build` but never
inspects the exported bundle; there is no `grep -L '__fitnessDurability' dist/**/*.js`-style
assertion anywhere. The entire mitigation for what this round's own scope calls "the
highest-severity class of defect in this diff" rests on trusting that Metro/Terser's literal
folding behaves as assumed, unverified by any test in this repository.

**Fix:** Add a CI step after `expo export --platform web` that greps the exported web bundle for
the literal `__fitnessDurability` (or `DURABILITY_HARNESS_GLOBAL`/`openTestPowerSync`) and fails
the build if found, so a change to the bundler config, a Terser flag, or an accidental
`EXPO_PUBLIC_DURABILITY_HARNESS=1` in a deploy environment is caught mechanically instead of by
code-review vigilance alone.

### WR-04: `DURABILITY_HARNESS_ENABLED` is exported and never used anywhere

**File:** `apps/mobile/lib/db/test-support.ts:73`

**Issue:** `export const DURABILITY_HARNESS_ENABLED = process.env.EXPO_PUBLIC_DURABILITY_HARNESS
=== '1';` has no importers anywhere in `apps/mobile` (confirmed via repo-wide grep) —
`__durability.web.tsx` re-derives the same check inline instead
(`process.env.EXPO_PUBLIC_DURABILITY_HARNESS !== '1'`) per its own comment explaining why it
compares the literal directly rather than importing this constant. The export is dead code.

**Fix:** Remove the unused export, or if it's meant for a future call site, note that explicitly
so a future reader doesn't have to grep the whole app to confirm it's inert.

## Info

### IN-01: `sync.spec.ts`'s "two clients converge" test proves presence, not content

**File:** `apps/mobile/e2e/sync.spec.ts:359-360`

**Issue:** `await expect.poll(() => readSets(pageA, exerciseB), ...).not.toEqual([])` proves a row
scoped to the other client's `sessionExerciseId` arrived locally, which is meaningful (the id is
unique per test run so there's no ambiguity about *which* row), but it never asserts the pulled
row's `weightKg`/`reps` match what `pageB` actually logged (`{value: '35', unit: 'kg'}, 10`). A
regression that pulled the right row shape with wrong field values would still pass.

**Fix:** Assert on `afterConvergence[0].weightKg`/`reps` against the known logged values, the same
way `durability.spec.ts` does for its own read-back.

### IN-02: `SYNC_TOKEN_PATH` vs `SYNC_PUSH_PATH` URL construction is inconsistent (style only)

**File:** `apps/mobile/lib/db/connector.ts:24, 63`

**Issue:** `SYNC_TOKEN_PATH` is built once at module scope; the push URL is built inline at the
call site (`` `${API_URL}${SYNC_PUSH_PATH}` ``). Functionally identical since `API_URL` is a
build-time-inlined constant, but the two patterns coexisting in the same file is avoidable
inconsistency.

**Fix:** Pick one pattern (a module-scope `SYNC_PUSH_URL` constant would match `SYNC_TOKEN_PATH`).

### IN-03: `apps/mobile/lib/db/log-set.ts`'s `set_index` assignment is a non-atomic read-then-write

**File:** `apps/mobile/lib/db/log-set.ts:127-131`

**Issue:** `setIndex = (maxRow?.maxIndex ?? 0) + 1` is a plain `select` followed by a separate
`insert`, with no transaction wrapping the pair — two concurrent `logSet` calls for the same
`sessionExerciseId` could race to the same index. `schema-redefinition.spec.ts`'s own comment
explicitly documents this constraint and works around it by awaiting each `logSet` call
sequentially rather than via `Promise.all`. This predates this round's diff and is already a
known, documented constraint rather than a new defect — noted here only because a reader tracing
the file for correctness should know it's a live characteristic, not fixed by this round.

**Fix:** No action required for this round; flagging for awareness only.

## CR-01..CR-04 Closure Verdicts (prior round's findings)

- **CR-01 (rejected write silently disappeared)** — **Closed.** `connector.ts`'s `uploadData` now
  reads the response body, branches on `rejected`, and only completes the transaction when every
  rejection is terminal (`isTerminalRejection`); `sync-status.ts` makes rejections and the
  last-successful-push timestamp observable. Backed by a dedicated, well-targeted unit-test
  section (`offline-write.test.ts`'s "reading the push response body (CR-01)" describe block)
  that distinguishes terminal-vs-non-terminal completion and asserts the response body is never
  read on an `'offline'` outcome. Verified correct.
- **CR-02 (null weight coerced to a decimal)** — **Closed for the specific symptom, but see CR-01
  above for the general defect class it belongs to.** Both `conflict-policy.ts`'s
  `normalizedWeightKg` and `sync.service.ts`'s `normalizeWeightKg` correctly distinguish absent
  from explicit `null` and never produce the string `"null"`; `session.ts`'s `weight_kg` column is
  now nullable (`numeric(...)`, no `.notNull()`); the client's `text('weight_kg')` column was
  already nullable. No third instance of `String(null)`-style coercion was found anywhere in the
  reviewed diff (confirmed by grep across every file in scope, and by reading
  `packages/api-contracts/src/units.ts`'s `toCanonicalKg`, which already handled `null` correctly
  before this round). The `weight_kg`-specific symptom is genuinely fixed and well-tested
  (`null-weight.e2e-spec.ts`, `sync.spec.ts`'s full-client-path test). The Critical finding above
  is that the *general* "PATCH must not clobber omitted fields" fix was never generalized beyond
  this one field/table.
- **CR-03 (push-support boundary implicit)** — **Closed.** `PUSH_APPLIED_TABLES`/
  `PUSH_DEFERRED_TABLES` now make the boundary an explicit, exhaustive, tested partition of
  `SYNCED_TABLES` (`sync.test.ts` asserts the two lists concatenate-and-sort to exactly
  `SYNCED_TABLES`, and share no member), and `isTerminalRejection` correctly special-cases
  `unknown_table` by table membership. Verified correct.
- **CR-04 (one bad session_exercise op took the whole batch down)** — **Closed for the case it
  targeted.** Each aggregate now runs in its own `try`/`catch` around its own transaction, with
  `applied.length` correctly rewound on rollback so a failed aggregate never falsely reports
  success; `poison-pill.e2e-spec.ts` proves isolation both when the poisoned aggregate is pushed
  first and when it's pushed second, and proves stable (non-escalating) rejection on identical
  retries. See WR-01 above for a related, narrower, and untested aggregate-isolation gap
  (single-known-root healing) that CR-04's own test suite does not exercise because it always uses
  two distinct session ids.

---

_Reviewed: 2026-08-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
