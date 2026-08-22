---
phase: 04-program-builder
reviewed: 2026-08-22T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - apps/api/src/sync/sync.service.ts
  - apps/api/src/sync/patch-update-set.ts
  - apps/api/src/db/schema/program.ts
  - apps/api/src/db/schema/preference.ts
  - apps/api/src/db/schema/session.ts
  - apps/api/src/db/schema.ts
  - apps/api/src/seed/generate-corpus.ts
  - packages/api-contracts/src/program.ts
  - packages/api-contracts/src/sync.ts
  - packages/api-contracts/src/units.ts
  - apps/mobile/lib/db/programs/order-index.ts
  - apps/mobile/lib/db/programs/days.ts
  - apps/mobile/lib/db/programs/cycles.ts
  - apps/mobile/lib/db/programs/targets.ts
  - apps/mobile/lib/db/programs/load-program.ts
  - apps/mobile/lib/db/programs/next-up-query.ts
  - apps/mobile/lib/db/programs/lifecycle.ts
  - apps/mobile/lib/db/programs/duplicate-routine.ts
  - apps/mobile/lib/db/programs/create-routine.ts
  - apps/mobile/lib/programs/next-up.ts
  - apps/mobile/lib/programs/reorder-drag.ts
  - apps/mobile/lib/db/log-set.ts
  - apps/mobile/app/(tabs)/programs.tsx
  - apps/mobile/app/(tabs)/index.tsx
  - apps/mobile/app/programs/library.tsx
  - apps/mobile/app/programs/new.tsx
  - apps/mobile/app/programs/_layout.tsx
  - apps/mobile/lib/navigation/root-stack.tsx
  - apps/mobile/components/ExerciseSlotRow.tsx
  - apps/mobile/components/DragHandle.tsx
  - apps/mobile/components/DragHandle.web.tsx
  - apps/mobile/components/DayDeck.tsx
  - apps/mobile/components/CycleStrip.tsx
  - ops/powersync/sync-rules.yaml
findings:
  critical: 4
  warning: 15
  info: 5
  total: 24
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-08-22
**Depth:** standard
**Status:** issues_found

## Summary

The phase's dual-parent resolver, anti-reparenting precedence and cascade-tombstone gathering are
individually careful and well argued. The defects that matter are one level up from those: the
**aggregate map keys on a client-supplied id with no type discriminator**, which lets a two-op batch
route an ownership check at the wrong table and take over a shared seeded catalog row (CR-01); and
the **rejection-reason vocabulary is coarser than the failure modes it now has to describe**, so
every server-side surprise lands on either `invalid_field` (terminal → the client destroys the
offline write) or `missing_parent` (non-terminal → the client's upload queue stalls forever). Three
separate, reachable paths land on those two cliffs (CR-02/03/04).

The client side is solid arithmetic with a thin, unguarded shell: reorder/duplicate/target writes are
multi-statement with no transaction, every failure path terminates at `console.error`, and the Home
card never refreshes after mount.

No `Platform.OS` branch was introduced at a call site, every `@expo/vector-icons` usage passes
`color={colors.*}` (never a `className`), and the `SYNCED_TABLES` / `PUSH_APPLIED_TABLES` tuples were
appended to, never reordered. Those three house rules are clean.

## Structural Findings (fallow)

No structural pre-pass was supplied for this review.

## Narrative Findings (AI reviewer)

## Critical

### CR-01: Aggregate ownership can be routed at the wrong table by reusing one id across two root types — shared seeded-catalog takeover

**File:** `apps/api/src/sync/sync.service.ts:1106-1120` (aggregate keying), `:1132-1145`
(`rootTypeByRootId`), `:1152-1162` (root-table split), `:1194-1236` (ownership branch)

**Issue:** `aggregates` is keyed on the bare root id string, and `rootTypeByRootId` is a plain
`Map.set` per op with **last-writer-wins and no collision detection**. Both keys are attacker-chosen
(`op.id` is a client-generated uuid; the client picks it). A batch containing two root-type ops that
share one `id` therefore collapses into a single aggregate whose *recorded root type* is the one
that appeared last — and the ownership query at `:1152-1192` is then issued against that table only.

The comment at `:132-133` states the assumption directly — *"aggregates are keyed by distinct root
id, and a workout_session aggregate never shares a key with an exercise, user_exercise_preference or
routine aggregate"* — and nothing enforces it.

**Concrete failure scenario (seeded-catalog takeover):**

```jsonc
POST /v1/sync/push  (authenticated as any ordinary user)
{ "batch": [
  { "op_id": "1", "op": "PUT", "type": "exercise",        "id": "seed-ex-bench-press", "data": { "name": "pwned" } },
  { "op_id": "2", "op": "PUT", "type": "workout_session", "id": "seed-ex-bench-press", "data": {} }
]}
```

1. Both ops self-root, so `rootByOpId` = `seed-ex-bench-press` for both; one aggregate, `poisoned:
   false`.
2. `rootTypeByRootId` is set to `'exercise'` by op 1, then **overwritten to `'workout_session'`** by
   op 2.
3. `workoutSessionRootIds` = `['seed-ex-bench-press']`; `exerciseRootIds` = `[]`. The
   `workout_session` lookup returns nothing, so `existingOwnerByRoot` is **empty**.
4. `owner = existingOwnerByRoot.get(root)` → `undefined`, so the `owner === null` guard at `:1220`
   — described in its own comment as *"the single most safety-critical branch in this plan"* — is
   never reached.
5. `:1225` sees `rootOp` (the exercise PUT, not a DELETE) and grants `owner = userId`.
6. The apply loop runs op 1 through `toExerciseValues(id, userId, data)` and
   `onConflictDoUpdate({ target: exercise.id, set: patchAwareSet(...) })` — a PUT, so the *full*
   value set is written, including `userId: <attacker>`, `isCustom: true`, `source: 'user'` and the
   attacker's `name`.

Result: a shared, unowned seeded `exercise` row (referenced by every user's
`routine_exercise.exercise_id` and `session_exercise.exercise_id`) is overwritten and re-owned by an
arbitrary account. The same shape works against any known id in any root table — swap the second op
to `type: 'exercise'` and the first to `type: 'routine'` and it becomes a cross-user routine takeover
(`user_id` rewritten to the pusher, name/status/archived_at clobbered).

**Fix:** key both maps on `(rootFamilyOrType, id)`, not on `id` alone, and fail closed on a
collision:

```ts
const rootKey = (type: string, id: string) => `${rootFamilyOf(type)}:${id}`;

// rootTypeByRootId
for (const op of remaining) {
  if (AGGREGATE_ROOT_TYPES.has(op.type) || SINGLETON_ROOT_TYPES.has(op.type)) {
    const existing = rootTypeByRootId.get(op.id);
    if (existing !== undefined && existing !== op.type) {
      // Two root types claiming one id is never a legitimate batch — reject both, do not pick one.
      conflictingRootIds.add(op.id);
      continue;
    }
    rootTypeByRootId.set(op.id, op.type as RootTableType);
  }
  // ...
}
```

and reject every op whose root id is in `conflictingRootIds` with `not_owner` before aggregation.
Additionally, remove the `owner === undefined → owner = userId` adoption at `:1225` for
`SINGLETON_ROOT_TYPES` roots whose table was not actually queried — adoption must only be reachable
after a lookup in the *op's own* table has genuinely returned no row.

---

### CR-02: Any transaction-level error is reported as `invalid_field`, which the client treats as terminal and permanently discards the write

**File:** `apps/api/src/sync/sync.service.ts:1586-1602`; consumed at
`apps/mobile/lib/db/connector.ts:110-118` and `packages/api-contracts/src/sync.ts:110-122`

**Issue:** The catch around `this.db.transaction(...)` maps **every** thrown error to
`invalid_field` for every op in the aggregate. `invalid_field` is in `TERMINAL_REASONS`, and the
connector's `allTerminal` branch calls `transaction.complete()` — which tells PowerSync the crud
transaction is done and **deletes it from the local queue**. A transient server-side failure is
therefore indistinguishable, on the wire, from "this data is permanently unacceptable", and the
client responds to both by destroying the user's offline writes.

**Concrete failure scenario:** two devices belonging to the same user push overlapping routine
aggregates at the same moment. Each transaction takes `SELECT ... FOR UPDATE` row locks
(`:1279`) in whatever order `orderedOps` produced. Postgres detects a deadlock and aborts one
transaction with SQLSTATE `40P01`. The catch fires, every op in that aggregate is rejected
`invalid_field`, the connector sees `allTerminal === true`, calls `transaction.complete()`, and an
entire offline editing session (days, exercises, cycles, targets) is gone with no error surfaced to
the user. The same applies to `40001` serialization failures, statement timeouts, and connection
resets.

**Fix:** classify the error before choosing a reason, and add a genuinely retryable reason to the
contract (append-only, so this is a legal addition):

```ts
// packages/api-contracts/src/sync.ts
export type SyncRejectionReason = /* ...existing... */ | 'server_error';
const NON_TERMINAL_REASONS = new Set<SyncRejectionReason>([
  'missing_parent', 'batch_too_large', 'server_error',
]);
```

```ts
// sync.service.ts catch
const code = (error as { code?: string }).code;
const permanent = code === '23514' /* check_violation */ || code === '22P02' /* invalid_text_repr */;
const reason: SyncRejectionReason = permanent ? 'invalid_field' : 'server_error';
```

Constraint violations that genuinely mean "this payload can never be stored" stay `invalid_field`;
everything else must be retryable.

---

### CR-03: Two devices creating the same per-cycle override offline destroys the whole routine aggregate's writes

**File:** `apps/api/src/db/schema/program.ts:141` (the unique constraint),
`apps/mobile/lib/db/programs/cycles.ts:164-198` (`setCycleTarget`),
`apps/api/src/sync/sync.service.ts:1534-1549` (the acknowledged uncovered conflict target)

**Issue:** `routine_exercise_cycle_target` carries `unique(routineExerciseId, cycleId)`, but the
upsert's only conflict target is `routineExerciseCycleTarget.id`. The comment at `:1536-1541` is
explicit that a pair collision *"therefore throws, the transaction below rolls back, and the existing
catch rejects the whole aggregate invalid_field"* — and per CR-02 that reason is terminal, so the
client completes the transaction away.

`setCycleTarget`'s read-then-insert (`readOverrideId` at `:175`, insert at `:192`) protects a single
device only. Two devices editing offline is precisely the case the local-first constraint exists for,
and the schema comment at `program.ts:138-140` names it as the reason the constraint was added — but
the constraint converts an *ordering* problem into a *data-loss* problem.

**Concrete failure scenario:** phone and browser are both offline. On each, the user opens the
"Deload" cycle and sets Sets = 2 on the bench-press slot. Two rows are created with different client
uuids but the same `(routine_exercise_id, cycle_id)`. Phone syncs first and applies. Browser syncs
second: the insert violates `routine_exercise_cycle_target_unique`, the transaction rolls back,
**every op in the browser's routine aggregate** — the new days it added, the exercises, the reorders,
the base-target edits, all of which were valid — is rejected `invalid_field`, and the connector
deletes the entire crud transaction. The user loses a whole offline session because they touched one
override twice.

**Fix:** make the pair the upsert's conflict target so the collision resolves as LWW instead of
throwing:

```ts
await tx
  .insert(routineExerciseCycleTarget)
  .values(routineExerciseCycleTargetValues)
  .onConflictDoUpdate({
    target: [routineExerciseCycleTarget.routineExerciseId, routineExerciseCycleTarget.cycleId],
    set: patchAwareSet(op, routineExerciseCycleTargetValues, ROUTINE_EXERCISE_CYCLE_TARGET_PATCH_FIELDS),
  });
```

The two conflict targets (`id` and the pair) cannot both be expressed in one statement, so the apply
path needs an explicit "does a row already exist for this pair under a different id?" read, resolving
to the lexicographically-lower id and tombstoning the loser — the same deterministic tie-break
`sortByOrderThenId` already uses. Alternatively, make the row id itself a deterministic function of
`(routine_exercise_id, cycle_id)` so two devices generate the *same* id and the existing `id`-keyed
upsert converges naturally. That second option is simpler and matches the option-a precedent already
used for `user_preference`.

---

### CR-04: An op whose parent was deleted on another device rejects `missing_parent` forever, permanently stalling the device's upload queue

**File:** `apps/api/src/sync/sync.service.ts:1021-1034` (`resolveRoutineIdForCycleTarget`),
`:1106-1120` (heal/poison), `:1194-1198`; consumed at `apps/mobile/lib/db/connector.ts:115-118`

**Issue:** The up-front tombstone short-circuit at `:783-800` covers **DELETE ops only**. A
non-DELETE op is tombstone-checked at `:1273`, *inside* the transaction — but an op whose parent
chain does not resolve never reaches the transaction: it is orphaned at `:1112`, marks its aggregate
`poisoned`, and every op in that aggregate is rejected `missing_parent` at `:1196`.
`missing_parent` is in `NON_TERMINAL_REASONS`, so `allTerminal` is false and the connector never
calls `transaction.complete()`. PowerSync re-sends the same crud transaction on every retry, and
because the queue is ordered, **nothing behind it ever uploads again**.

**Concrete failure scenario:** device A deletes a routine day. The cascade removes its
`routine_exercise` rows and their `routine_exercise_cycle_target` rows; the server tombstones all
three levels (`:1309-1369`). Device B was offline and had created a new override for one of those
exercises. Device B reconnects and pushes:

- `resolveRoutineExerciseIdForCycleTarget` finds no DB row, falls back to the client-claimed
  `routine_exercise_id`.
- `resolveRoutineDayIdForRoutineExercise(RE)` finds nothing in the DB (row is gone) and nothing in
  the batch → `undefined`.
- `routineIdViaExercise === undefined` → `{ routineId: null, conflict: false }` (`:1027-1029`).
- Orphan → poisoned aggregate → `missing_parent` for every op in it → non-terminal → retry.

The parent is *permanently* gone, so this never resolves. Device B's sync is dead until the app's
local database is wiped. The same shape reaches `routine_exercise` (deleted `routine_day`) and
`logged_set` (deleted `session_exercise`) — the cycle-target's two parents merely double the surface.

**Fix:** run the tombstone check for **all** ops, not just DELETEs, before root resolution, and
reject a non-DELETE op whose id *or whose claimed parent id* is tombstoned with `deleted` (terminal —
the row is genuinely gone and retrying can never succeed):

```ts
// alongside the existing deleteOpsInBatch pass
const parentIdsToCheck = [
  ...cetRoutineExerciseIdFromData.entries(), // ('routine_exercise', id)
  ...cetCycleIdFromData.entries(),           // ('routine_cycle', id)
  ...routineExerciseRoutineDayIdFromData.entries(),
  ...loggedSetSessionExerciseIdFromData.entries(),
];
// batch one query against sync_tombstone; any hit → reject that op 'deleted', not 'missing_parent'.
```

Separately, cap retries client-side: an op rejected `missing_parent` on N consecutive pushes should
be escalated to a surfaced, user-visible failure rather than retried indefinitely.

## Warnings

### WR-01: `stepBoundedValue`'s decrement guard is wrong for any step > 1 — produces a negative rest target the server terminally rejects

**File:** `apps/mobile/components/ExerciseSlotRow.tsx:30-39`, used at `:469`

**Issue:** `if (current <= floor) return null; return current - step;` only clears to null when
`current` is already at or below the floor. With `step = 15` (rest) and `floor = 0`, any value in
`(0, 15)` decrements straight past the floor into a negative. `validateTargets`
(`lib/db/programs/targets.ts:44-58`) checks only `targetSets`, `targetRepMin` and the min/max
ordering — it never checks rest or RIR — so the negative reaches `setExerciseTargets` and syncs.
`isNonNegativeIntegerOrNull` (`sync.service.ts:542`) then rejects the op `invalid_field`, which per
CR-02 is terminal.

**Concrete failure scenario:** a program synced from another device (or produced by a future importer
/ template) carries `target_rest_seconds = 10`. The user opens that slot and taps "−" once on Rest.
`10 <= 0` is false → `10 - 15 = -5` is written locally, the row displays `-1:-5`, and the push is
terminally rejected, silently discarding that crud transaction.

**Fix:**

```ts
if (current === null) return null;
const next = current - step;
return next < floor ? null : next;
```

and add the missing non-negative checks to `validateTargets` so the client cannot ever emit a value
the server's shape validator will terminally reject:

```ts
if (draft.targetRir !== null && draft.targetRir < 0) errors.targetRir = 'negative';
if (draft.targetRestSeconds !== null && draft.targetRestSeconds < 0) errors.targetRestSeconds = 'negative';
```

---

### WR-02: `loadNextUp` reads `user_preference` with no `WHERE` clause

**File:** `apps/mobile/lib/db/programs/next-up-query.ts:34`

**Issue:** `db.select({ activeRoutineId }).from(userPreference)` takes the **first row in the table**
with no filter and no ordering. Every other reader of this row filters correctly —
`lifecycle.ts:13-20`'s `loadActiveRoutineId` uses `eq(userPreference.id, userId)` — so this is an
inconsistency, not a convention.

**Concrete failure scenario:** the local SQLite file outlives a user switch (sign out → sign in as a
different account without a full local wipe), or a stale row from a prior identity has not yet been
reconciled. `loadNextUp` reads whichever row SQLite returns first and the Home card renders the wrong
account's active program — or, once two rows exist, renders non-deterministically between launches.

**Fix:** thread `userId` in the same way `loadActiveRoutineId` does:

```ts
export async function loadNextUp(userId: string, db: WriteDb = getPowerSync()): Promise<NextUpData> {
  const [preference] = await db
    .select({ activeRoutineId: userPreference.activeRoutineId })
    .from(userPreference)
    .where(eq(userPreference.id, userId));
```

`HomeScreen` already has `authClient.useSession()` available to supply it.

---

### WR-03: Web drag handle never captures the pointer — the drag is a silent no-op and leaves the grip stuck offset

**File:** `apps/mobile/components/DragHandle.web.tsx:68-94`

**Issue:** `onPointerDown` records the pointer id and start Y but never calls
`setPointerCapture`. DOM pointer events only fire on the element the pointer is over, so as soon as
the finger/cursor leaves the 48×48 handle — which a one-row (72 px) drag guarantees — `pointermove`
and `pointerup` stop arriving. `handlePointerUp` never runs, so `commitDrop` never fires and
`endDrag` never resets state.

**Concrete failure scenario:** on web, the user drags the grip down past one row and releases. No
reorder is written, and `translationY` state is left at its last observed value, so the grip stays
visually displaced until the row re-renders. `docs/platform-modules.md` records that the web pointer
path was never exercised beyond `expo export --platform web` bundling, which is consistent with this
going unnoticed.

**Fix:** capture on down and release on up/cancel:

```ts
const handlePointerDown = useCallback((event: PointerEvent) => {
  activePointerId.current = event.nativeEvent.pointerId;
  startY.current = event.nativeEvent.clientY;
  (event.target as Element | null)?.setPointerCapture?.(event.nativeEvent.pointerId);
}, []);
```

and release it in both `handlePointerUp` and `endDrag`. Also register `onPointerUp` behaviour for the
cancel path so state is reset even when the browser revokes capture.

---

### WR-04: The Home card loads once on mount and never refreshes

**File:** `apps/mobile/app/(tabs)/index.tsx:174-192`

**Issue:** The `useEffect` has an empty dependency array and there is no `useFocusEffect`, no
PowerSync watched query, and no reload trigger. In a tab navigator both tabs stay mounted, so nothing
re-runs the read.

**Concrete failure scenario:** a new user opens the app → Home shows "No active program". They go to
Programs → Library → Activate a program → return to Home. Home still shows "No active program", and
keeps showing it until the app is killed and relaunched. The same staleness applies to every
day/exercise/target edit and to anything arriving from the other device via sync — the local-first
premise is that these reads are reactive.

**Fix:** use PowerSync's live query (`db.watch(...)`) so the card re-derives whenever any of
`user_preference`, `routine`, `routine_day`, `routine_exercise`, `routine_cycle`,
`routine_exercise_cycle_target` or `workout_session` changes. As a minimum, wrap the load in
`useFocusEffect` from `expo-router` so returning to the tab re-reads.

---

### WR-05: `resolveNextUp`'s time-off countdown is reset by a session logged against a *different* program

**File:** `apps/mobile/lib/programs/next-up.ts:144-147`;
`apps/mobile/lib/db/programs/next-up-query.ts:53-62`

**Issue:** `loadNextUp`'s history query filters on `status = 'completed' AND routine_day_id IS NOT
NULL` but **not on the active routine**, so it returns completed sessions from every program the user
has ever run. `resolveNextUp` then computes `elapsed` from `completedSessions(history)` — the
unfiltered list — rather than from `countableHistory`, which *is* scoped to the current routine's
days.

**Concrete failure scenario:** the user is 5 days into a 7-day time-off cycle in program B. They open
their old program A and log one session against it. On the next Home render, `lastCompleted` is that
program-A session, `elapsed` resets to 0, and the time-off card jumps back from "2 days left" to
"7 days left".

**Fix:** either scope the query (`... AND routine_day_id IN (<the active routine's day ids>)`) or,
in the resolver, seed `elapsed` from the last **countable** session:

```ts
const lastCountable = countable[countable.length - 1];
let elapsed = daysBetween(lastCountable ? lastCountable.localDate : today, today);
```

The second is preferable: `countableHistory` already encodes "counts toward this program's position",
and the two derivations must not disagree.

---

### WR-06: A cycle override is validated in isolation, so a base edit can leave a cycle resolving to `repMin > repMax`

**File:** `apps/mobile/lib/db/programs/cycles.ts:142-144, 168-173`;
`apps/mobile/lib/db/programs/targets.ts:44-58`

**Issue:** `normalizeOverride` runs `resolveTarget(EMPTY_TARGET, override)`, so `validateTargets`
only ever sees the sparse override with nulls for un-overridden fields. The `min-above-max` rule at
`targets.ts:53` requires **both** values to be non-null, so an override naming only one half of the
range is never range-checked against the base it will actually be merged with. `setExerciseTargets`
has the mirror-image gap: it validates the new base against itself, never against the overrides that
will inherit from it.

**Concrete failure scenario:** base is `repMin 8 / repMax 12`. In the Deload cycle the user steps Rep
max down to 9, storing `{ targetRepMax: 9 }`. They then deselect the cycle and raise the **base**
Rep min to 11 — valid on its own (`11 <= 12`). The Deload cycle now resolves to `repMin 11 /
repMax 9`, which the slot row renders as "11–9 reps" and which `resolvePrescriptionForCycle`
(`log-set.ts`) will snapshot verbatim into a session in Phase 5.

**Fix:** validate the *resolved* pair, not the raw override. `setCycleTarget` should read the base
row and validate `resolveTarget(base, override)`; `setExerciseTargets` should read this slot's
overrides and validate each resolved pair before writing the new base, rejecting (or warning) rather
than silently producing an inverted range.

---

### WR-07: Clearing a target inside a cycle is unrepresentable, and attempting it deletes the whole override row

**File:** `apps/mobile/app/(tabs)/programs.tsx:139-145` (`overrideDelta`);
`packages/api-contracts/src/program.ts:36-56`; `apps/mobile/lib/db/programs/cycles.ts:177-182`

**Issue:** `resolveTarget`'s contract is that `null` in an override means "inherit", never "cleared"
— which is correct and deliberate. But `overrideDelta` maps *any* field the user cleared to `null`
(`next[field] === base[field] ? null : next[field]`, and a cleared `next[field]` is `null` while the
base is not), so "clear this field for this cycle" is written as "inherit this field from the base".
The stepper's decrement-to-null behaviour makes clearing a one-tap action.

**Concrete failure scenario:** base = `{ sets 3, repMin 8, repMax 12, rir 2, rest 90 }`. The Deload
cycle overrides `{ targetSets: 2 }`. The user selects Deload, opens the slot (shows Sets 2), and taps
"−" twice: 2 → 1 → null. `overrideDelta` produces all-nulls, `isEmptyOverride` returns true, and
`setCycleTarget` **deletes the override row**. The tree reloads and Sets reads 3 — the user pressed
"−" and the number went *up*. Any other overridden field on that same slot/cycle pair is destroyed in
the same write.

**Fix:** either disable the clear-to-null step while a cycle is selected (the base is the only place
a prescription is cleared, matching the contract comment at `program.ts:36-38`), or extend the
override representation to distinguish "inherit" from "cleared" — a sentinel is not viable in a
five-nullable-integer row, so the disable is the honest fix. At minimum, `setCycleTarget` should not
delete a row containing other live overrides just because one field was cleared.

---

### WR-08: The `routineId` route parameter is never validated or cleared

**File:** `apps/mobile/app/(tabs)/programs.tsx:154, 162, 482-506`;
`apps/mobile/app/programs/library.tsx:233`; `apps/mobile/app/programs/new.tsx:95`

**Issue:** `displayedRoutineId = routineIdParam ?? activeRoutineId` is fed straight into
`loadProgramTree` and the whole editable builder, and the render branches on `displayedRoutineId`
(`:506`) **before** `screenState` is consulted (`:773`). `deriveProgramsScreenState`'s documented
rule — *"A pointer naming a routine that is not in the list — archived on another device, or deleted
— reads as no-active"* (`:56-57`) — is therefore bypassed entirely whenever the param is present.

**Concrete failure scenarios:**
1. On web, `/(tabs)/programs?routineId=<id-of-an-archived-program>` renders that program fully
   editable, with Add Day / Add Exercises / target steppers live, contradicting the archive
   treatment the library enforces.
2. `routineId` naming a program that does not exist locally makes `loadProgramTree` return `null`;
   `tree ? … : null` at `:538` then renders a header and two nav links and nothing else — no error,
   no empty state, no explanation.
3. After Duplicate navigates with `params: { routineId }` (`library.tsx:233`), nothing ever clears
   it. Tapping the Programs tab thereafter keeps re-opening the duplicate, not the active program.

**Fix:** validate the param against the loaded, non-archived routine list before honouring it, and
fall through to `screenState` when it fails:

```ts
const paramIsUsable =
  routineIdParam !== undefined &&
  routines?.some((r) => r.id === routineIdParam && r.archivedAt === null) === true;
const displayedRoutineId = paramIsUsable ? routineIdParam : activeRoutineId;
```

and clear the param (`router.setParams({ routineId: undefined })`) once the user navigates away from
the duplicate.

---

### WR-09: `archiveRoutine` is two unrelated row writes, so "archived AND active" is representable under LWW

**File:** `apps/mobile/lib/db/programs/lifecycle.ts:84-104`

**Issue:** The comment claims *"The conditional pointer clear is what keeps 'archived AND active'
unrepresentable — the two rows would otherwise be free to disagree."* It does not: `routine.archived_at`
and `user_preference.active_routine_id` are two independent rows reconciled by row-level LWW, so
concurrent offline writes converge to exactly the state the comment says cannot exist.

**Concrete failure scenario:** device A archives routine R (sets `archived_at`, clears the pointer).
Device B, offline, activates R (sets the pointer to R). Both push. LWW leaves `archived_at` set
*and* `active_routine_id = R`. Consumers happen to defend against it (`next-up-query.ts:46`,
`partitionRoutines`), but the invariant asserted here is not enforced anywhere, and the comment will
mislead the next reader into assuming it is.

**Fix:** correct the comment to state that this is a best-effort local reconciliation, and add the
reconciliation on the read side explicitly (a single helper that resolves "the active routine" and
treats an archived target as no active routine) so there is one place that owns the rule rather than
three independent defences.

---

### WR-10: Multi-row program writes are not transactional

**File:** `apps/mobile/lib/db/programs/days.ts:107-109, 128-131, 158-179`;
`apps/mobile/lib/db/programs/cycles.ts:120-123`;
`apps/mobile/lib/db/programs/duplicate-routine.ts:44-123, 192-235`

**Issue:** Every one of these helpers issues a `for` loop of independent `await db.update(...)` /
`db.insert(...)` calls with no surrounding transaction, even though PowerSync exposes
`writeTransaction`. `computeReorder`'s renumber branch (`days.ts:74-90`) can emit up to N updates in
one call, and `duplicateRoutine` emits `1 + cycles + days + slots + overrides` inserts.

**Concrete failure scenario:** the user duplicates a 4-day / 20-exercise program and the app is
backgrounded and killed mid-loop (or the browser tab is closed). A `routine` row exists with some
days, one partially-populated day, and no cycles — a half-copy that looks like a real program in the
library and can be activated. For the reorder path, an interrupted renumber leaves duplicate
`order_index` values; `sortByOrderThenId` keeps rendering *stable*, but the resulting order is not
the one the user dragged to, and the failure is invisible.

**Fix:** wrap each helper's writes in `db.writeTransaction(async (tx) => { ... })` so a partial
apply is impossible and the whole unit lands in one PowerSync crud transaction (which also makes the
server-side aggregate atomicity meaningful).

---

### WR-11: Every program mutation swallows or drops its error; several have no `catch` at all

**File:** `apps/mobile/app/(tabs)/programs.tsx:266-273, 286-302, 333-340, 414-438, 443-450`;
`apps/mobile/app/programs/library.tsx:219-266`;
`apps/mobile/components/ExerciseSlotRow.tsx:435-443`

**Issue:** Two distinct problems. (a) The handlers that *do* catch (`handleAddDay`,
`handleRenameCycle`, `handleSetCycleKind`, `handleAddExercises`, `handleSaveRename`,
`ExerciseSlotRow.applyDraft`) terminate at `console.error` with no user-visible feedback. (b) The
handlers that do **not** catch — `handleToggleFreeze`, `handleRemoveDay`, `handleRemoveExercise`,
`handleResetCycleTarget`, `handleMoveCycle`, `handleRemoveCycle`, `handleReorderExercise`, and
library's `ACTIVATE` / `DUPLICATE` / `handleConfirm` — are async functions passed straight to
`onPress`, so a rejection is an unhandled promise rejection.

**Concrete failure scenario:** `applyDraft` (`ExerciseSlotRow.tsx:438`) sets local draft state *then*
fires the write. If `setCycleTarget` throws (WR-06's validation, a locked database, a quota error on
web), the stepper shows the new number, the console logs, and the next tree reload silently reverts
it — the user watches their edit vanish with no explanation. `duplicateRoutine` throwing leaves the
library sheet closed and nothing else happening at all.

**Fix:** add an error banner to the builder and library screens, route every mutation through a
single `runMutation(fn)` helper that catches, records, and surfaces the failure, and never pass a
bare async function to `onPress`.

---

### WR-12: `patchAwareSet`'s field maps do the opposite of what their comments claim, and the `user_exercise_preference` map lets a PATCH re-target a row

**File:** `apps/api/src/sync/patch-update-set.ts:216-225, 254-263, 295-308, 317-332`

**Issue:** `patchAwareSet` includes a column in the update set when `wireKey === null` — i.e. a
`null` mapping means **"always write the server-derived value"**, not "never write". The comments say
the opposite in four places: *"this map backs it up structurally by never letting a PATCH write
routineId at all"* (`:256`), *"a PATCH must reparent neither … never letting a PATCH write either
parent column"* (`:297-298`). For `routine_day` / `routine_exercise` / `routine_cycle` /
`routine_exercise_cycle_target` the behaviour happens to be safe, because the values those columns
carry come from the DB-first resolvers — but the stated guarantee is not the one the code provides,
and a future maintainer relying on the comment will introduce the reparenting hole it describes.

The one place the mismatch is already a live defect is
`USER_EXERCISE_PREFERENCE_PATCH_FIELDS.exerciseId: null` (`:220`) combined with
`toUserExercisePreferenceValues`' `d.exercise_id ?? ''` (`sync.service.ts:396`), which reads the
**client-supplied** value. Since `hasInvalidField` requires `exercise_id` present on every non-DELETE
op (`:685`), a PATCH always carries one, and it is always written.

**Concrete failure scenario:** a PATCH on an existing `user_exercise_preference` naming a different
`exercise_id` silently re-points that preference row at another exercise — so an "archived" or
"never suggest" flag jumps to a different movement.

**Fix:** rewrite the comments to describe the real rule ("`null` means the value is server-derived
and written unconditionally"), and either move `exerciseId` off the `null` mapping or make
`toUserExercisePreferenceValues` resolve it from the existing row when one exists, matching the
DB-wins-over-client-claimed precedence every other parent column uses.

---

### WR-13: Unbounded per-op query fan-out in the push apply path

**File:** `apps/api/src/sync/sync.service.ts:785-792, 1266-1279, 1353-1369`

**Issue:** The file's own comments repeatedly insist on batched `inArray` reads and reference a
query-count assertion (`:857`, `:1149-1151`), but three loops break that rule:

1. `:786-788` — `Promise.all(deleteOpsInBatch.map((op) => isTombstoned(...)))` issues **one query per
   DELETE op, all concurrently**. With `SYNC_MAX_BATCH_OPS = 1000`, a delete-heavy batch fires up to
   1000 simultaneous queries and can exhaust the connection pool for every other request.
2. `:1273` and `:1279` — one `isTombstoned` and one `SELECT ... FOR UPDATE` per op inside the
   transaction, serially.
3. `:1353-1369` — one `recordTombstone` INSERT per cascaded child. A day delete on a 30-exercise
   program with 6 cycles is up to 180 sequential inserts inside one transaction, all holding locks.

**Fix:** replace (1) with a single `inArray` over `sync_tombstone` keyed on `(table, row_id)`;
batch (2) into one `SELECT ... WHERE id IN (...) FOR UPDATE` per table per aggregate; and replace (3)
with a single multi-row `insert(...).values([...])`.

---

### WR-14: `session_exercise.target_rir_min` / `target_rir_max` were dropped and replaced with no migration, and the export document shape changed with them

**File:** `apps/api/src/db/schema/session.ts:69-73`; `apps/mobile/lib/db/schema.ts:30-35`;
`apps/mobile/lib/export/build-export-document.ts:26-31, 136-140`

**Issue:** Two columns were removed from an already-shipped synced table (`session_exercise` is in
`SYNCED_TABLES` since Phase 2) and replaced by a single `target_rir`. There are no migration files
anywhere in `apps/api` — `drizzle.config.ts` points at `./drizzle`, which does not exist — so the
change is presumably applied by `drizzle-kit push`, which will issue a destructive `DROP COLUMN`
against any existing database.

The pull side is also affected: `ops/powersync/sync-rules.yaml` uses `SELECT *`, so a client build in
the field that still declares `target_rir_min` in its local schema will receive rows without it.

**Concrete failure scenario:** the exported training-data JSON (`PLAT` export) silently changes shape
from `{ target_rir_min, target_rir_max }` to `{ target_rir }` with no version marker, so any consumer
of a previously exported document breaks with no signal. On the database side, a `push` against a
non-empty environment discards whatever RIR-range data those two columns held with no reversal path.

**Fix:** commit a real migration that adds `target_rir` and backfills it from the old pair before
dropping them, and add a version field to the export document so a shape change is detectable. If
this is judged acceptable because the project is pre-release, record that explicitly next to the
schema so the decision is not re-litigated.

---

### WR-15: Nothing enforces that a cycle target's two parents belong to the same routine, and the pull rule only walks one of them

**File:** `apps/api/src/db/schema/program.ts:115-143`; `ops/powersync/sync-rules.yaml` (the
`routine_exercise_cycle_target` stream query)

**Issue:** The schema comment claims the dual-parent agreement is a property of the table (*"hangs
off TWO parents … that must independently resolve to the same routine"*), but the only enforcement is
`resolveRoutineIdForCycleTarget` in the application layer. There is no `CHECK`, no composite FK, and
no trigger. Any write path that bypasses `applyBatch` — the seed script, admin tooling, a future
bulk importer — can create a row whose `cycle_id` belongs to a different user's routine. The sync
rule then walks **only** the exercise chain, so such a row is delivered to the exercise's owner.

**Concrete failure scenario:** a maintenance script mis-joins and writes a cycle target linking user
A's `routine_exercise` to user B's `routine_cycle`. The pull query matches on user A's exercise chain
and delivers the row to A, leaking the existence (and target values) of B's cycle id.
`loadProgramTree:145` drops it at render time, so the leak is invisible but real, and the row
thereafter poisons A's routine pushes per CR-04.

**Fix:** denormalise `routine_id` onto `routine_exercise_cycle_target` with FKs to both parents
carrying it (a composite FK on `(routine_exercise_id, routine_id)` and `(cycle_id, routine_id)`
against matching unique indexes on the parents), so the agreement is a database invariant rather than
an application convention. Then make the pull query filter on that single column.

## Info

### IN-01: `skippedTimeOffCycleIds` is computed, threaded through every return, and never read

**File:** `apps/mobile/lib/programs/next-up.ts:44-46, 126, 155`

Every `NextUp` variant carries `skippedTimeOffCycleIds`, and the comment at `:42-43` says a
durationless time-off cycle is *"reported here rather than blocking the walk forever"* — but no
consumer reads it. `HomeScreen` renders `nextUp` without touching it; the only other references are
in the test file. Either surface it (the Home card should tell the user a cycle was skipped because
it has no duration) or drop it from the type.

### IN-02: `daysBetween` returns `NaN` on a malformed `local_date`

**File:** `apps/mobile/lib/programs/next-up.ts:110-117`

`dayNumber` does no validation; `Date.UTC(NaN, …)` is `NaN`, and `Math.max(0, NaN)` is `NaN`. Every
subsequent comparison against `NaN` is false, so the walk silently steps past every time-off cycle
and reports `program-complete`. `local_date` is device-stamped so this should not occur, but the
`Math.max(0, …)` floor already exists to defend against a moved clock — the same defensiveness should
cover an unparseable string. Return `0` (or throw) when `Number.isNaN(dayNumber(...))`.

### IN-03: `computeReorder` silently drops a moved row to the front when its anchor is missing

**File:** `apps/mobile/lib/db/programs/days.ts:79-86`

`beforeOrderIndex` resolves to `null` when `beforeId` is not among the siblings (concurrently
deleted), and in the renumber branch `findIndex` then returns `-1`, making `insertAt = 0`. The row
lands at the head of the list rather than near where it was dropped. Reachable only when
`needsRenumber` is also true, so it is rare, but the two `null` meanings ("at the start" and "not
found") should be distinguished.

### IN-04: `ensureUserPreference`'s upsert arbiter does not match the table's primary key

**File:** `apps/api/src/seed/generate-corpus.ts` (`ensureUserPreference`)

`INSERT INTO user_preference (id, user_id, …) VALUES (userId, userId, …) ON CONFLICT (user_id) DO
UPDATE` names `user_id` as the arbiter, but `id` is the primary key and is written to the *same*
value, so both unique indexes conflict on a re-run. Postgres resolves the arbiter index first so this
happens to work, but the script is one schema tweak away from `duplicate key value violates unique
constraint "user_preference_pkey"`. Use `ON CONFLICT (id)` to match the primary key it actually
writes.

### IN-05: Duplicate program names compound

**File:** `apps/mobile/app/programs/library.tsx:230`

`name: \`${row.name} copy\`` produces "PPL copy", "PPL copy copy", "PPL copy copy copy". Since
`loadLibraryRoutines` sorts by name then id and the library shows no other disambiguator, several
duplicates of the same program become indistinguishable in the list. Suffix with a counter derived
from the existing names, as the New Program flow could also do.

---

_Reviewed: 2026-08-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
