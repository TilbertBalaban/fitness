---
phase: 02-data-model-sync-engine
reviewed: 2026-08-17T10:36:53Z
depth: deep
files_reviewed: 27
files_reviewed_list:
  - apps/mobile/lib/db/id.ts
  - apps/mobile/lib/db/schema.ts
  - apps/mobile/lib/db/log-set.ts
  - apps/mobile/lib/db/connector.ts
  - apps/mobile/lib/db/powersync.ts
  - apps/mobile/lib/db/powersync.web.ts
  - apps/mobile/lib/sync-status.ts
  - apps/mobile/lib/pending-write-count.ts
  - apps/mobile/lib/sign-out.ts
  - apps/mobile/lib/api-client.ts
  - apps/mobile/lib/session-guard.ts
  - apps/mobile/lib/calendar-day.ts
  - apps/mobile/lib/auth-storage.ts
  - apps/mobile/app/_layout.tsx
  - apps/mobile/app/(tabs)/profile.tsx
  - apps/mobile/lib/db/__tests__/log-set.test.ts
  - apps/mobile/__tests__/offline-write.test.ts
  - apps/api/src/sync/sync.service.ts
  - apps/api/src/sync/sync.controller.ts
  - apps/api/src/sync/conflict-policy.ts
  - apps/api/src/sync/conflict-log.ts
  - apps/api/src/sync/powersync-token.ts
  - apps/api/src/db/schema/session.ts
  - apps/api/src/db/schema/sync.ts
  - apps/api/src/db/schema/catalog.ts
  - packages/api-contracts/src/sync.ts
  - packages/api-contracts/src/units.ts
  - ops/powersync/sync-rules.yaml
  - ops/powersync/powersync.yaml
  - apps/api/test/powersync-token.e2e-spec.ts
  - apps/api/test/sync-push.e2e-spec.ts
findings:
  critical: 4
  warning: 4
  info: 1
  total: 9
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-08-17T10:36:53Z
**Depth:** deep
**Files Reviewed:** 27 (plus generated-file cross-checks against `@powersync/common`'s `CrudEntry` contract)
**Status:** issues_found

## Summary

This phase built the sync engine and data model everything downstream writes through, so I traced
every write end-to-end: `logSet` → local SQLite → PowerSync's crud queue → `SyncConnector.uploadData`
→ `POST /v1/sync/push` → `SyncService.applyBatch` → Postgres, and the auth surface
(`/v1/sync/token`). The individual pieces (unit-conversion boundary, conflict-log shape, token
scoping, ownership-chain resolution against id collisions) are each well-reasoned and mostly
well-tested in isolation. The problem is the seams between them, which is exactly where an
end-to-end trace and not a per-file read finds bugs.

Two defects compound into the most serious finding: (1) the client-side `SyncConnector` never reads
the sync-push response body — only the HTTP-transport outcome — so **every server-side per-op
rejection is invisible to the client and the crud transaction is marked complete anyway**; and (2) a
bodyweight `logged_set` (the documented, tested, intentional null-weight case) is either **rejected
outright by an over-eager validator** or, for the one path that gets past validation, **silently
coerced to `weight_kg = '0'`** server-side — a value indistinguishable from "lifted zero kilograms"
that will corrupt every volume/PR read downstream, permanently, the moment it lands in Postgres.
Combined, these two mean a real and common workout-logging case (any bodyweight exercise: pull-ups,
push-ups, bodyweight squats) either silently loses the row's true zero-load semantics forever, or is
silently dropped from sync while the client believes it succeeded. Neither has any test coverage
across the client/server boundary — the client-side test for null-weight preservation
(`log-set.test.ts:36-43`) stops at the local insert and never continues through `SyncConnector` or
`SyncService`.

A third defect (missing field validation on `session_exercise` ops, combined with no error boundary
around `SyncService.applyBatch`) creates a poison-pill risk: one malformed op can 500 the entire push
request, and because the client can't distinguish that from ordinary offline/HTTP-level failure, the
crud queue retries the same failing batch indefinitely — wedging that user's sync pipeline.

I also traced the id-collision claim in `id.ts`'s comment and found it is correct for cross-user
collisions but does not hold for same-user, cross-device collisions, which the ownership check
cannot detect.

## Critical Issues

### CR-01: `SyncConnector.uploadData` completes the crud transaction without ever reading the server's per-op result — every rejected op is silently dropped while the client believes it synced

**File:** `apps/mobile/lib/db/connector.ts:41-61`
**Issue:**
```ts
async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
  const transaction = await database.getNextCrudTransaction();
  if (!transaction) return;

  const body: SyncPushRequest = { batch: transaction.crud.map(toSyncCrudOp) };
  const { outcome } = await apiFetch(SYNC_PUSH_PATH, { method: 'POST', body: JSON.stringify(body) });
  recordPushOutcome(outcome);

  if (outcome === 'ok') {
    await transaction.complete();
    return;
  }
  // ...
}
```
`outcome` is derived purely from HTTP status (`classifyAuthOutcome`, `apps/mobile/lib/session-guard.ts:44-56`: any 2xx → `'ok'`). `POST /v1/sync/push` (`apps/api/src/sync/sync.controller.ts:19-31`) always returns HTTP 200/201 and puts per-op failures in the response body's `rejected: [{ op_id, reason }]` array — `SyncService.applyBatch` never throws for a normal validation/ownership/unknown-table rejection, it just appends to `rejected` (`apps/api/src/sync/sync.service.ts:194-521`). `uploadData` destructures only `{ outcome }` from `apiFetch`'s result and never calls `response.json()` — I grepped the whole mobile `lib/` tree and the only `response.json()` call site is in `fetchCredentials` for the *token* endpoint (`connector.ts:37`), not the push endpoint. So:

- Any op the server rejects — `unknown_table` (9 of 12 `SYNCED_TABLES` entries have no server-side apply path, see CR-03), `invalid_field`, `missing_parent`, `not_owner`, `deleted`, even `batch_too_large` — is returned inside a 200 response.
- `outcome === 'ok'` fires regardless.
- `transaction.complete()` is called, which per PowerSync's contract permanently removes those crud entries from the local outbox.
- The client has no record that anything was rejected: `recordPushOutcome(outcome)` only ever sees `'ok'`, so `sync-status.ts`'s `lastPushOutcome` also reports success.

**Failure scenario:** A user offline-logs a custom `exercise` (creates a new movement) or an `equipment_profile` change, then reconnects. `SyncService` rejects the op `unknown_table` (see CR-03) inside a 200 response. `uploadData` sees `outcome: 'ok'`, calls `transaction.complete()`. The edit is now gone from the outbox, was never applied server-side, and is unrecoverable on any other device or after a reinstall — with the app showing no error and `sync-status.ts` reporting a successful last push. This directly contradicts the local-first requirement that a write, once acknowledged as synced, is durable.

**Fix:** Parse the response body and only treat the push as fully successful if `rejected.length === 0`; for a non-empty `rejected` array, either leave the transaction queued (if retry could succeed, e.g. after a server deploy adds the missing table) or route rejected op ids to a dead-letter/conflict surface instead of silently completing them. At minimum, log and surface every `rejected` entry rather than discarding it:
```ts
const { response, outcome } = await apiFetch(SYNC_PUSH_PATH, { method: 'POST', body: JSON.stringify(body) });
recordPushOutcome(outcome);

if (outcome === 'ok' && response) {
  const result = (await response.json()) as SyncPushResponse;
  if (result.rejected.length > 0) {
    recordRejectedOps(result.rejected); // new: surfaced to the user / retried deliberately
  }
  await transaction.complete();
  return;
}
```

---

### CR-02: A bodyweight `logged_set` (`weight_kg = null`, the documented/tested case) is silently corrupted to `weight_kg = '0'` on insert, or rejected outright on update — both paths violate the schema's own stated invariant

**File:** `apps/api/src/sync/sync.service.ts:120-136` (coercion), `apps/api/src/sync/sync.service.ts:150-175` (validator)
**Issue:** Traced end to end:

1. `apps/mobile/lib/db/log-set.ts:130` — `unitsContract.toCanonicalKg(input.weight.value, input.weight.unit)` correctly returns `null` for an empty/absent weight (`packages/api-contracts/src/units.ts:60-66`), and `logSet` writes `weightKg: null` into local SQLite, whose `weight_kg` column is deliberately nullable (`apps/mobile/lib/db/schema.ts:43-45`, explicit comment: "a bodyweight exercise carries no external load"). This is tested directly: `log-set.test.ts:36-43`, "stores null rather than zero for a null weight."
2. Per `@powersync/common`'s own `CrudEntry` contract (`node_modules/.pnpm/@powersync+common@2.1.0/.../CrudEntry.ts:16`): "**PUT**: Insert or replace existing row. **All non-null columns are included in the data.**" A null `weight_kg` on the *first* write of a set (the common bodyweight-exercise path) is therefore **omitted from `opData` entirely** — the server sees `data.weight_kg === undefined`, not `null`.
3. Server: `hasInvalidField` (`sync.service.ts:150-175`) only runs `isNonNegativeDecimal` when `data.weight_kg !== undefined` — so the PUT path skips validation and reaches `toLoggedSetValues` (`sync.service.ts:120-136`):
   ```ts
   weightKg: String(d.weight_kg ?? '0'),
   ```
   `undefined ?? '0'` → `'0'`. The row is inserted into `apps/api/src/db/schema/session.ts:93`'s `numeric(8,3) NOT NULL` column as `0.000` — a value that reads as "logged zero kilograms," not "no external load." This is silent, permanent, and propagates to every other device on next pull.
4. For an **update** (PATCH) to a set that explicitly nulls out a previously-set weight — per the same `CrudEntry` doc, PATCH "contains ... the value of each changed column," so a changed-to-null column plausibly *is* included as explicit `null`. In that case `hasInvalidField` runs `isNonNegativeDecimal(null)`: `typeof null` is `'object'`, matches neither `'string'` nor `'number'`, so it returns `false`, and the field is flagged invalid → the whole op is rejected `invalid_field`. Combined with CR-01, that rejection is invisible to the client, which believes the edit synced while the server silently discarded it.

Either path — silent zero-coercion on insert, or silent-to-the-client rejection on update — violates the exact invariant `apps/mobile/lib/db/schema.ts:43-45` and `packages/api-contracts/src/units.ts:77-79` (`formatWeight` explicitly renders null as `—`, "zero would read as a logged weight of zero") were written to protect.

**Failure scenario:** User logs a set of pull-ups (bodyweight, no added load) via `logSet`. Session syncs. Every future volume/PR calculation on any device reads `weight_kg = 0` for that set instead of "no load recorded" — either double-counting a zero-value data point into averages or (worse, if a later feature computes tonnage as `weight × reps`) reporting 0 volume for a set the user actually performed, silently corrupting the training-analytics feature this whole data layer exists to support. Nothing in the client, server, or test suite currently catches this: I grepped `sync-push.e2e-spec.ts`, `sync-aggregate.e2e-spec.ts`, and `concurrent-edit.e2e-spec.ts` for `weight_kg`/`weightKg` — zero matches.

**Fix:** Distinguish "field absent" from "field explicitly null" only where it matters, and never coerce a legitimately-nullable column to a sentinel value:
```ts
weightKg: d.weight_kg === undefined ? undefined : d.weight_kg === null ? null : String(d.weight_kg),
```
and only pass `weightKg` through to the insert/update `.values()` call when it's actually present (Drizzle will otherwise happily write `null` if you let it), and relax `isNonNegativeDecimal`'s caller to accept an explicit `null` as valid for `weight_kg` specifically (it already correctly rejects `null` for `reps`/`set_index`, which should stay non-nullable).

---

### CR-03: 9 of 12 `SYNCED_TABLES` have no server-side apply path — every offline write to `routine`, `routine_day`, `routine_exercise`, `equipment_profile`, `exercise`, `personal_record`, `body_metric`, or `progress_photo` is rejected, and (per CR-01) rejected invisibly

**File:** `apps/api/src/sync/sync.service.ts:14-24`, `202-206`
**Issue:**
```ts
const TABLE_MAP = {
  workout_session: workoutSession,
  session_exercise: sessionExercise,
  logged_set: loggedSet,
} as const;
```
against `SYNCED_TABLES` in `packages/api-contracts/src/sync.ts:8-21`, which lists all 12 domain tables the mobile schema (`apps/mobile/lib/db/schema.ts`) and the `sync-rules.yaml` bucket definitions (`ops/powersync/sync-rules.yaml:17-28`) already treat as fully synced (pull *and* push). Any op for the other 9 tables hits `!isMappedTable(op.type)` at `sync.service.ts:203` and is rejected `unknown_table` — every time, unconditionally, not just during a migration window.

On its own this might be an acceptable "not implemented yet" gap if it failed loudly. It does not: combined with CR-01, the rejection never reaches the user or any retry logic — the write is accepted locally, appears in the UI, and is then dropped on first sync with no trace. This is strictly worse than "not synced" — it is "synced-looking but not synced."

**Failure scenario:** A user builds a custom `routine` offline (a first-run, offline-friendly flow this architecture is explicitly designed to support), it appears correctly in the local UI (PowerSync's local-first read model), and is queued for push. It is rejected `unknown_table`, the client marks it complete anyway (CR-01), and the routine silently never exists on any other device or after reinstall/data loss on this one.

**Fix:** Either land `TABLE_MAP` entries (and `toXValues` mappers) for the remaining 9 tables before this ships anywhere near real usage, or — if intentionally phased — make the client-visible contract match reality: keep those 9 tables out of the mobile schema/pull rules until push support exists, or have the connector treat `unknown_table` rejections as a hard stop (never `transaction.complete()`) rather than a value indistinguishable from success.

---

### CR-04: `session_exercise` ops have zero field validation, and `SyncService.applyBatch` has no error boundary — a single malformed op can 500 the whole push and wedge that user's sync queue permanently

**File:** `apps/api/src/sync/sync.service.ts:150-175` (validator), `192-519` (`applyBatch`, no try/catch anywhere), `apps/api/src/sync/sync.controller.ts:19-31` (no try/catch)
**Issue:** `hasInvalidField` only validates `op.type === 'workout_session'` and `op.type === 'logged_set'`:
```ts
function hasInvalidField(op: SyncCrudOp): boolean {
  if (op.op === 'DELETE') return false;
  const data = (op.data ?? {}) as Record<string, unknown>;
  if (op.type === 'workout_session') { /* ... */ }
  if (op.type === 'logged_set') { /* ... */ }
  return false;   // session_exercise (and anything else mapped) falls through unvalidated
}
```
`session_exercise` rows carry a `NOT NULL` FK `exercise_id` (`apps/api/src/db/schema/session.ts:58-60`) and several `NOT NULL`/typed integer columns (`order_index`, and nullable-but-typed `target_*`). `toSessionExerciseValues` (`sync.service.ts:102-118`) passes whatever the client sent straight through:
```ts
exerciseId: d.exercise_id ?? '',
orderIndex: d.order_index ?? 0,
```
An empty-string `exercise_id` (any client bug, corrupted local row, or a future op that legitimately omits it) has no matching row in `exercise`, so the FK constraint fires at INSERT time inside `tx.insert(sessionExercise)...` (`sync.service.ts:499-505`). Nothing in `applyBatch`, and nothing in `SyncController.push`, wraps this in a try/catch. The exception propagates out of the per-aggregate `this.db.transaction(...)` (rolling back that aggregate, including any legitimate sibling `logged_set` ops in the same transaction) and then out of `applyBatch` itself, past the `for` loop over `aggregates.values()` — so **every aggregate later in iteration order in the same batch never gets processed at all**, not just the poisoned one. NestJS's default exception handling turns the unhandled rejection into a generic 500.

On the client, `classifyAuthOutcome` (`session-guard.ts:12`) puts every 5xx status into `OFFLINE_STATUSES`, so this reads as `outcome: 'offline'` — indistinguishable from a captive portal or a down server. `uploadData` correctly leaves the transaction queued in that branch, but PowerSync's own retry cadence will simply resend the exact same crud queue on its next attempt, hit the exact same FK violation, and 500 again — indefinitely, with no way for the app or the user to know this is a permanent, not transient, failure.

**Failure scenario:** Any code path that ends up writing a `session_exercise` op with an `exercise_id` that doesn't (yet, or ever) exist server-side — e.g. a custom exercise created offline that itself fails to sync for any reason (including CR-03/CR-01, since `exercise` is one of the 9 unmapped tables!) — permanently wedges that device's sync pipeline: it will 500 on every future push attempt containing that entry, blocking unrelated, otherwise-valid workout data from ever syncing until a human intervenes.

**Fix:** Validate `session_exercise` fields the same way `workout_session`/`logged_set` are validated (non-empty `exercise_id`, non-negative integers for `order_index`/`target_*`), reject with `invalid_field` rather than letting it reach the DB layer; and wrap `applyBatch`'s per-aggregate work in a try/catch that converts an unexpected DB error into a `rejected` entry for that aggregate's ops (logged server-side) instead of letting one poisoned aggregate abort the entire batch and every subsequent aggregate in it.

## Warnings

### WR-01: `id.ts`'s "collision is safe" claim only holds cross-user, not same-user cross-device — a colliding id from the same account's second device silently overwrites the first device's row

**File:** `apps/mobile/lib/db/id.ts:1-12`
**Issue:** The header comment states: "a collision would surface as the server's per-row ownership re-check rejecting the op `not_owner`, not as silent data corruption." I traced `applyBatch`'s ownership resolution (`sync.service.ts:334-368`) and confirmed this is true when the colliding id belongs to a *different* user — `existingOwnerByRoot.get(root)` finds a mismatched `userId` and rejects `not_owner` for `workout_session`, and the same falls out transitively for `session_exercise`/`logged_set` via `resolveSessionIdForSessionExercise`/`resolveSessionExerciseIdForLoggedSet`, which always prefer the *existing* DB linkage over the client-claimed one.

It does **not** hold when the same user's two devices independently generate the same client id (e.g., two different `workout_session` rows on device A and device B both minting the id `"…-4abc-…"` via `Math.random()`, entirely plausible if either device's RNG seed state is degenerate — Hermes/JSC `Math.random()` is not guaranteed cryptographically independent across process restarts on all platforms). Both are owned by the same `userId`, so the ownership check passes for both, and whichever device's push lands second wins the row entirely via `onConflictDoUpdate` (`sync.service.ts:486-497`) — silently merging two logically distinct workout sessions into one row, discarding the first device's session data (its `session_exercise`/`logged_set` children now point at a `sessionId` whose parent row has been overwritten with unrelated content).

The dependency-avoidance rationale (skipping `expo-crypto`'s `randomUUID()` to avoid a mid-task package-legitimacy gate) is a reasonable process call, but the code comment overstates how safe the outcome is — it should say "safe against cross-account collision," not "not as silent data corruption" unconditionally.

**Fix:** Either accept the residual same-user, cross-device collision risk explicitly (narrow the comment's claim), or replace `Math.random()` with a CSPRNG-backed source (`expo-crypto`'s `getRandomBytes`/`randomUUID`, or `crypto.getRandomValues` where available on web) in a follow-up task — the actual collision probability is very low given the ~122 bits of entropy either way, but the failure mode when it does happen is exactly the "silent overwrite" the comment says can't happen.

---

### WR-02: `pendingWriteCount()` swallows every error, including ones that mean "we genuinely don't know," and reports 0 — which is the "safe to sign out" answer, not the safe default

**File:** `apps/mobile/lib/pending-write-count.ts:7-14`
**Issue:**
```ts
export async function pendingWriteCount(): Promise<number> {
  try {
    const stats = await getUploadQueueStats();
    return stats.count;
  } catch {
    return 0;
  }
}
```
The comment justifies this for "a launch where the local database was never opened" (genuinely 0 pending writes). But the bare `catch` also swallows any other failure mode from `getUploadQueueStats()` — a corrupted local DB, a native-module hiccup, a transient PowerSync internal error — none of which mean "there are zero pending writes." `sign-out.ts:24-29` gates the discard-confirmation dialog directly on this return value:
```ts
const pendingCount = await getPendingCount();
if (pendingCount > 0) { /* ask user to confirm discard */ }
```
So any error other than "db never opened" silently skips the user-facing warning and proceeds straight to sign-out. In this phase, `clearCachedSession()` (`apps/mobile/lib/auth-storage.ts:21-27`) only clears the auth cookie, not the local PowerSync DB, so this specific version doesn't destroy data outright — but it does defeat the one safety gate that exists for the case that gate is supposed to catch, and a future change to sign-out (e.g. clearing local state on sign-out for a "switch account" flow) would turn this into real data loss with no test currently distinguishing the two error cases.

**Fix:** Only special-case the "database not yet opened" condition explicitly (PowerSync should expose a distinguishable error/state for that), and let any other error propagate or surface as "unable to determine pending writes — treat as unsafe" rather than a blanket 0.

---

### WR-03: `SyncPushResponse.rejected` conflicts are logged server-side but have no reader anywhere — a resolved conflict's losing value is unrecoverable from the app

**File:** `apps/api/src/sync/conflict-log.ts`, `apps/api/src/db/schema/sync.ts:7-23`
**Issue:** `resolveConflict` (`conflict-policy.ts`) is a pure arrival-order last-write-wins policy for `logged_set` (documented and intentional — no wall-clock comparison, which is correct per the anti-pattern this project explicitly avoids). Every overwrite of a *completed* set with conflicting field values is recorded via `recordConflict` into `sync_conflict_log`. I grepped the whole mobile app and API `src/` tree for any consumer of `syncConflictLog`/`conflict_log` beyond the write path itself — there is none: no controller endpoint, no mobile screen, nothing exposes it. This means: when two devices genuinely disagree about a completed set's weight/reps (a real scenario for an offline-first workout logger — same session edited on phone and reconnected watch/tablet, or a retry after a bad local edit), the loser's data is silently discarded from every user-facing surface and only recoverable via a direct Postgres query. This may be intentional deferral to a later phase (the schema comment says "Plan 02-03 writes the rows; this plan only lands the shape") but is worth flagging explicitly since it currently means genuine conflicting edits are invisible and irreversible from the user's perspective.

**Fix:** If this is deferred, track it explicitly as a follow-up (surface the log via `/v1/sync/conflicts` and a lightweight review UI) rather than letting it remain implicit; if it's considered acceptable long-term (conflicts assumed rare enough not to need UI), document that decision explicitly rather than leaving it as an unexercised audit table.

---

### WR-04: `sync-status.ts`'s lazy `require()` bypasses TypeScript's static checking of the required module's shape

**File:** `apps/mobile/lib/sync-status.ts:34-41`
**Issue:**
```ts
export async function getSyncStatus(): Promise<SyncStatus> {
  const { pendingWriteCount } = require('./pending-write-count') as typeof import('./pending-write-count');
  return { pendingWrites: await pendingWriteCount(), lastPushOutcome, lastSuccessfulPushAt };
}
```
The documented rationale (avoiding an untransformable ESM import under this project's Jest `transformIgnorePatterns`, and avoiding `--experimental-vm-modules` that a real `import()` would need) is sound, and Metro/webpack both statically resolve string-literal `require()` calls at bundle time, so this should behave correctly at runtime on native and web — I don't dispute the mechanism works. The residual risk is narrower than "unsound at runtime": the `as typeof import(...)` cast is a manual type assertion, not a checked import — if `pending-write-count.ts`'s actual runtime export shape ever drifts from its type declaration (e.g., a refactor that changes `pendingWriteCount` to a default export, or renames it), `tsc` will not catch the mismatch here the way it would for a real `import`, and the failure would only surface as a runtime `undefined is not a function` the first time `getSyncStatus()` is actually called — a path this phase's own tests don't appear to exercise (no test file for `sync-status.ts` was in the diff).

**Fix:** Low priority given the working rationale, but worth a small test asserting `getSyncStatus()` actually resolves `pendingWriteCount` correctly (a regression guard for the type-assertion gap), since nothing else in the suite calls this function.

## Info

### IN-01: `hasInvalidField` validates date-shaped strings loosely for `workout_session`

**File:** `apps/api/src/sync/sync.service.ts:83-100`, `154-162`
**Issue:** `started_at`/`ended_at` are taken through `new Date(d.started_at)` with no validity check; an unparseable string produces an `Invalid Date`, which Drizzle/pg will either reject (throwing, same unhandled-exception class as CR-04) or coerce unpredictably depending on the driver. `hasInvalidField` only validates `status` and `local_date` for this table, not the two timestamp fields. Lower severity than CR-04 (this table's rows are somewhat more constrained in practice by `startSession`'s call site), but the same category of gap — worth closing alongside CR-04 rather than separately.
**Fix:** Add an `isValidIsoTimestamp` check for `started_at`/`ended_at` alongside the existing `status`/`local_date` validation.

---

_Reviewed: 2026-08-17T10:36:53Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
