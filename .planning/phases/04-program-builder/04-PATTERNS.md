# Phase 4: Program Builder - Pattern Map

**Mapped:** 2026-08-20
**Files analyzed:** ~24 (create/modify) drawn from CONTEXT.md D-09–D-28 and RESEARCH.md's Recommended Project Structure
**Analogs found:** 20 / 24 (drag-handle reorder and swipe deck have no direct in-tree analog — flagged explicitly below)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/api/src/db/schema/program.ts` (add `routineCycle`, `routineExerciseCycleTarget`) | model | CRUD | same file — `routineDay`/`routineExercise` definitions | exact (same file, extend in place) |
| `apps/api/src/db/schema/preference.ts` (add `activeRoutineId`) | model | CRUD | same file — `userPreference` | exact |
| `apps/mobile/lib/db/schema.ts` (add `routineCycle`, `routineExerciseCycleTarget`, `userPreference.activeRoutineId`) | model | CRUD | same file — `routine`/`routineExercise`/`userPreference` sqliteTables | exact |
| `apps/api/src/sync/sync.service.ts` (TABLE_MAP/AGGREGATE_RANK/OpData/toXValues/hasInvalidField entries for `routine`, `routine_day`, `routine_exercise`, `routine_cycle`, `routine_exercise_cycle_target`, `user_preference`) | service (sync apply) | event-driven (CRUD-op batch apply) | same file — `toSessionExerciseValues`/`toWorkoutSessionValues`/`SessionExerciseOpData`/`isInvalidSessionExercise` (parent+child aggregate shape) | exact |
| `apps/api/src/sync/patch-update-set.ts` (add `RoutineValues`/`RoutineDayValues`/`RoutineExerciseValues`/`RoutineCycleValues`/`RoutineExerciseCycleTargetValues`/`UserPreferenceValues` + their `*_PATCH_FIELDS` maps) | utility (pure field-presence filter) | transform | same file — `SessionExerciseValues`/`SESSION_EXERCISE_PATCH_FIELDS` | exact |
| `packages/api-contracts/src/sync.ts` (move `routine`/`routine_day`/`routine_exercise` from `PUSH_DEFERRED_TABLES` to `PUSH_APPLIED_TABLES`; add `routine_cycle`, `routine_exercise_cycle_target`, `user_preference`) | config (contract vocabulary) | transform | same file | exact |
| `packages/api-contracts/src/program.ts` (NEW — `CYCLE_KINDS`, `ROUTINE_STATUSES`, `resolveTarget`) | utility (shared pure vocab + function) | transform | `packages/api-contracts/src/catalog.ts` — `LOAD_TYPES`/`MOVEMENT_PATTERNS` tuples | exact |
| `ops/powersync/sync-rules.yaml` (add `routine_cycle`, `routine_exercise_cycle_target` joined queries) | config (pull-side sync scoping) | pub-sub | same file — existing `routine_day`/`routine_exercise` joined queries | exact |
| `apps/mobile/lib/db/log-set.ts` (`addSessionExercise` resolves cycle override before snapshot) | service (local write helper) | CRUD (read-then-write) | same file — existing base-only `routineExercise` select block (lines ~69-93) | exact (modify in place) |
| `apps/mobile/lib/db/programs/*.ts` (NEW — `createRoutine`, `duplicateRoutine`, `activateRoutine`, `reorderExercise`, cycle CRUD helpers) | service (local write helper) | CRUD | `apps/mobile/lib/db/log-set.ts` (`startSession`/`addSessionExercise`/`logSet` shape: `generateClientId()` + `db.insert(...).values(...)`) | exact |
| `apps/mobile/lib/db/id.ts` | utility | n/a (reused, not modified) | — | n/a — consumed as-is by every new write helper |
| `apps/mobile/app/(tabs)/programs.tsx` (becomes active-program screen, D-26) | component (screen) | request-response (live query + render) | `apps/mobile/app/exercises/index.tsx` (`ExercisesScreen`) | role-match (screen has no builder precedent, but query/state/render shape is identical) |
| `apps/mobile/app/(tabs)/index.tsx` (Home "next up" card, D-27) | component (screen) | request-response | `apps/mobile/app/exercises/index.tsx` for data-loading shape; current `index.tsx` itself for placement | role-match |
| `apps/mobile/app/programs/library.tsx` (NEW) | component (screen) | CRUD (list + archive/restore/duplicate actions) | `apps/mobile/app/exercises/index.tsx` (list+filter shape) + `apps/mobile/components/ArchiveDialog.tsx` (archive/restore confirmation) | role-match |
| `apps/mobile/app/programs/new.tsx` (NEW — blank/duplicate choice, D-28) | component (screen) | CRUD | `apps/mobile/components/SelectField.tsx` / `PrimaryButton.tsx` composition (no direct screen analog) | partial |
| `apps/mobile/components/CycleStrip.tsx` (NEW) | component | request-response (selection state) | `apps/mobile/components/FilterChipRow.tsx` (chip row selection pattern) | role-match |
| `apps/mobile/components/DayDeck.tsx` (NEW, D-21) | component | streaming/gesture (swipe paging) | **no in-tree analog** — see "No Analog Found" | none |
| `apps/mobile/components/ExerciseSlotRow.tsx` (NEW, D-23/D-25) | component | event-driven (drag + inline expand) | `apps/mobile/components/ExerciseListRow.tsx` (row shape/layout) for the static parts only; drag handle itself has no analog | partial |
| `apps/mobile/components/ExercisePickerModal.tsx` (NEW, D-24 — Phase 3 catalog reused full-screen, multi-select) | component | request-response | `apps/mobile/app/exercises/index.tsx` (search + `FilterChipRow` + `FlashList` + `ExerciseListRow` composition) | exact (reuse, not rebuild) |
| `apps/api/src/seed/generate-corpus.ts` (line 279, migrate `status = 'active'` → `'ready'` + `user_preference.active_routine_id` write) | script | batch | same file, same line | exact |
| `apps/mobile/lib/db/__tests__/programs.test.ts` (NEW) | test | n/a | `apps/mobile/lib/db/__tests__/log-set.test.ts` (`fakeDb` injection-seam pattern) | exact |
| `apps/api/src/sync/*.e2e-spec.ts` (extend or add for routine push) | test | n/a | existing sync e2e spec asserting a Postgres row after push (pattern only, not read this session — see note in Shared Patterns) | role-match |

## Pattern Assignments

### `apps/api/src/db/schema/program.ts` (model, CRUD) — add `routineCycle` / `routineExerciseCycleTarget`

**Analog:** same file, `routineDay`/`routineExercise` (lines 27–65)

**Existing shape to copy exactly** (`apps/api/src/db/schema/program.ts` lines 27-65):
```typescript
export const routineDay = pgTable(
  'routine_day',
  {
    id: text('id').primaryKey(),
    routineId: text('routine_id')
      .notNull()
      .references(() => routine.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    name: text('name').notNull(),
    isRestDay: boolean('is_rest_day').notNull().default(false),
  },
  (table) => [index('routine_day_routineId_idx').on(table.routineId)],
);
```
No `userId`, no `serverSeq` on the child — ownership resolves through `routine.userId` only. `routine` itself is the aggregate root and does carry `serverSeq` (line 20-21):
```typescript
serverSeq: bigint('server_seq', { mode: 'number' })
  .notNull()
  .default(sql`nextval('sync_seq')`),
```
RESEARCH.md's Pattern 1 already drafted `routineCycle`/`routineExerciseCycleTarget` in this exact shape — use it verbatim, add relations mirroring `routineDayRelations`/`routineExerciseRelations` (lines 71-82) and a Postgres CHECK constraint on `kind` (there is no existing CHECK-constraint example in this file for `status`, `source`, or `loadType` — those are `.notNull()` text columns validated only in `sync.service.ts`; follow `docs/catalog-load-types.md`'s precedent for how `load_type`'s CHECK was added, since that is the direct precedent D-13 names).

### `apps/api/src/db/schema/preference.ts` (model, CRUD) — add `activeRoutineId`

**Analog:** same file, `userPreference` table (full file, 18 lines)
```typescript
export const userPreference = pgTable('user_preference', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  weightUnit: text('weight_unit').notNull(),
  defaultEquipmentProfileId: text('default_equipment_profile_id'),
  serverSeq: bigint('server_seq', { mode: 'number' })
    .notNull()
    .default(sql`nextval('sync_seq')`),
});
```
Add `activeRoutineId: text('active_routine_id')` as a nullable column, same style as `defaultEquipmentProfileId` (no FK enforced in Postgres on that column either — follow that precedent, do not add a `.references()` unless the existing column has one; it does not).

### `apps/mobile/lib/db/schema.ts` (model, CRUD) — SQLite mirror

**Analog:** same file, `routine`/`routineDay`/`routineExercise`/`userPreference` sqliteTables (lines 55-89, 231-236)
```typescript
export const routineDay = sqliteTable('routine_day', {
  id: text('id').primaryKey(),
  routineId: text('routine_id').notNull(),
  orderIndex: integer('order_index').notNull(),
  name: text('name').notNull(),
  isRestDay: integer('is_rest_day', { mode: 'boolean' }).notNull(),
});
```
Note the pattern: no `userId` on children, `integer(..., { mode: 'boolean' })` for booleans, plain `integer`/`text` for the rest — `routineCycle`/`routineExerciseCycleTarget` copy this exactly. `userPreference` mirror:
```typescript
export const userPreference = sqliteTable('user_preference', {
  userId: text('user_id').primaryKey(),
  weightUnit: text('weight_unit').notNull(),
  defaultEquipmentProfileId: text('default_equipment_profile_id'),
  serverSeq: integer('server_seq'),
});
```
Add `activeRoutineId: text('active_routine_id')` the same way. Remember to add every new table to the `drizzleSchema` export object at the bottom of the file (the existing `routine, routineDay, routineExercise, equipmentProfile, ..., userPreference` list, lines 242-251) and to whichever `powersync.ts`/`powersync.web.ts` table-registration list mirrors `SYNCED_TABLES` (not shown this session — grep for where `routine` is registered as a non-`localOnly` table before assuming the schema alone is sufficient).

### `apps/api/src/sync/sync.service.ts` (service, event-driven CRUD-op apply) — the highest-risk file this phase touches

**Analog:** same file — `workout_session`/`session_exercise`/`logged_set` three-level aggregate (this is a closer structural match than the two singleton-root tables, because `routine` → `routine_day` → `routine_exercise` → `routine_exercise_cycle_target` is a **four**-level chain, one level deeper than anything existing).

**TABLE_MAP / AGGREGATE_RANK pattern** (lines 29-65):
```typescript
const TABLE_MAP = {
  workout_session: workoutSession,
  session_exercise: sessionExercise,
  logged_set: loggedSet,
  exercise: exercise,
  user_exercise_preference: userExercisePreference,
} as const;
...
const AGGREGATE_RANK: Record<MappedTable, number> = {
  workout_session: 0,
  session_exercise: 1,
  logged_set: 2,
  exercise: 0,
  user_exercise_preference: 0,
};
```
Add: `routine: 0, routine_day: 1, routine_exercise: 2, routine_cycle: 1, routine_exercise_cycle_target: 3` (RESEARCH.md's own annotation, verbatim) and `user_preference: 0` (singleton root, joins `SINGLETON_ROOT_TYPES` — see below).

**OpData interface + toXValues mapper pattern** (lines 79-104, `SessionExerciseOpData`/`toSessionExerciseValues`):
```typescript
interface SessionExerciseOpData {
  session_id?: string;
  exercise_id?: string;
  order_index?: number;
  superset_group_id?: string | null;
  routine_exercise_id?: string | null;
  target_sets?: number | null;
  ...
}

function toSessionExerciseValues(id: string, sessionId: string, data: Record<string, unknown> | null | undefined): SessionExerciseValues {
  const d = (data ?? {}) as SessionExerciseOpData;
  return {
    id,
    sessionId,
    exerciseId: d.exercise_id ?? '',
    orderIndex: d.order_index ?? 0,
    ...
  };
}
```
Every new table (`routine`, `routine_day`, `routine_exercise`, `routine_cycle`, `routine_exercise_cycle_target`) needs one `*OpData` interface + one `to*Values(id, parentId, data)` mapper in exactly this shape. `routine` is the aggregate root, so its mapper takes `userId` the way `toWorkoutSessionValues`/`toExerciseValues` do (line 143, 213) — **never trust `data.user_id`**, always the authenticated session's own id:
```typescript
// userId always comes from the authenticated session argument, never from data.user_id — a
// client cannot take ownership of a row it does not already own by naming a different owner in
// the payload (T-03-02 pattern, mirrored from toWorkoutSessionValues).
```

**hasInvalidField pattern for the `kind`/`status` enums** (lines 267-289, the `exercise` branch's `load_type` check):
```typescript
if (op.type === 'exercise') {
  const d = data as ExerciseOpData;
  if (d.load_type !== undefined && !(typeof d.load_type === 'string' && LOAD_TYPES.has(d.load_type))) {
    return true;
  }
  ...
}
```
`routine_cycle.kind` and `routine.status` validation copies this exactly, built from `CYCLE_KINDS`/`ROUTINE_STATUSES` tuples imported from the new `packages/api-contracts/src/program.ts` (mirroring how `LOAD_TYPES`/`EQUIPMENT_TYPES`/`MOVEMENT_PATTERNS` are imported at the top of this file, lines 3-10, then turned into `Set`s at lines 71-73).

**FK-required-field guard pattern** (`isInvalidSessionExercise`, lines 291-303):
```typescript
function isInvalidSessionExercise(data: SessionExerciseOpData): boolean {
  if (typeof data.exercise_id !== 'string' || data.exercise_id.length === 0) return true;
  if (data.order_index !== undefined && !isNonNegativeInteger(data.order_index)) return true;
  ...
}
```
`routine_exercise_cycle_target` needs the equivalent for `routine_exercise_id`/`cycle_id` (both NOT NULL FKs) — reject absent/empty exactly like `exercise_id` here, never fall back to `''`.

**Root-resolution / ownership-chain pattern** (lines 372-451, the `resolveSessionIdForSessionExercise`/root-by-op-id walk): this is the part of the file this phase's four-level chain stresses hardest. The existing code resolves through **one** intermediate level (`session_exercise` → `workout_session`); `routine_exercise_cycle_target` needs to resolve through **two** independent parents (`routine_exercise_id` → ... → `routine`, AND `cycle_id` → `routine_cycle` → `routine`) and reject the op `missing_parent` if either chain doesn't land on the same `routine` id. Read the full root-resolution block (lines 372-451) before writing this — it is the file's most load-bearing section and the one place a four-level chain diverges from the three-level precedent.

**HARD_DELETE_FORBIDDEN / SINGLETON_ROOT_TYPES** (lines 43-56): add `'routine'` to `HARD_DELETE_FORBIDDEN` (mirrors `'exercise'` — archived, never hard-deleted, D-05) and add `'user_preference'` to `SINGLETON_ROOT_TYPES` (mirrors `'user_exercise_preference'` — no synced children, always its own root).

### `apps/api/src/sync/patch-update-set.ts` (utility, transform)

**Analog:** same file — `SessionExerciseValues` / `SESSION_EXERCISE_PATCH_FIELDS` (lines 21-33, 99-111)
```typescript
export interface SessionExerciseValues {
  id: string;
  sessionId: string;
  exerciseId: string;
  orderIndex: number;
  ...
}

export const SESSION_EXERCISE_PATCH_FIELDS: PatchFieldMap<SessionExerciseValues> = {
  id: null,
  sessionId: null,
  exerciseId: 'exercise_id',
  orderIndex: 'order_index',
  ...
};
```
Every new `*Values` interface needs a matching `*_PATCH_FIELDS` map with the same rule: identity/immutable-at-insert fields map to `null` (never patchable), everything else maps to its wire (`snake_case`) name. This is the file's own documented exhaustiveness gate (`PatchFieldMap<V>` mapped type, line 82's comment) — do not skip a field, TypeScript will refuse to compile an incomplete map, which is the intended guardrail.

### `packages/api-contracts/src/sync.ts` (config, transform)

**Analog:** same file, `PUSH_APPLIED_TABLES`/`PUSH_DEFERRED_TABLES` (lines 27-58)
```typescript
export const PUSH_APPLIED_TABLES = [
  'workout_session',
  'session_exercise',
  'logged_set',
  'exercise',
  'user_exercise_preference',
] as const;
...
export const PUSH_DEFERRED_TABLES = [
  'routine', // Phase 4 — Program Builder
  'routine_day', // Phase 4 — Program Builder
  'routine_exercise', // Phase 4 — Program Builder
  'equipment_profile', // Phase 6 — Gym Profiles & Plate Math
  'user_preference', // Phase 6 — Gym Profiles & Plate Math
  ...
] as const;
```
This phase moves `routine`/`routine_day`/`routine_exercise` from deferred to applied, and — per RESEARCH.md Pitfall 2 — must **also** move `user_preference` (currently attributed to Phase 6) since D-14/PROG-08 needs it now; update the ownership comment so Phase 6 knows the apply path already exists. `routine_cycle` and `routine_exercise_cycle_target` are added fresh to `SYNCED_TABLES` (lines 12-25) and `PUSH_APPLIED_TABLES` directly (they never existed in either list before — no deferred-to-applied move needed for these two, just addition).

### `packages/api-contracts/src/program.ts` (NEW) (utility, transform)

**Analog:** `packages/api-contracts/src/catalog.ts` — `LOAD_TYPES`/`MOVEMENT_PATTERNS` tuple pattern (lines 1-11, 65-73)
```typescript
// Additive-only from this commit forward — every client build in the field reads these tuples
// back through their declared order and membership. Append only; never insert, never reorder.

export const LOAD_TYPES = [
  'external_weight',
  'bodyweight',
  'bodyweight_plus_added',
  'assisted',
  'time_based',
  'distance_based',
] as const;
export type LoadType = (typeof LOAD_TYPES)[number];
```
Copy this exact shape for:
```typescript
export const CYCLE_KINDS = ['training', 'deload', 'time_off'] as const;
export type CycleKind = (typeof CYCLE_KINDS)[number];

export const ROUTINE_STATUSES = ['draft', 'ready'] as const;
export type RoutineStatus = (typeof ROUTINE_STATUSES)[number];
```
`resolveTarget` is a new pure function, not modeled on an existing analog in this package — RESEARCH.md's Code Examples section (`resolveTarget`, `ResolvedTarget`) is the drafted shape; use it as written there, since no closer in-repo precedent exists for a pure `override ?? base` resolver.

### `apps/mobile/lib/db/log-set.ts` (service, CRUD read-then-write) — modify `addSessionExercise`

**Analog:** same file, existing base-only read (lines 69-93) — **this is the single highest-risk integration point RESEARCH.md flags.**
```typescript
let prescription = EMPTY_PRESCRIPTION;
if (input.routineExerciseId) {
  const [row] = await db
    .select({
      targetSets: routineExercise.targetSets,
      targetRepMin: routineExercise.targetRepMin,
      ...
    })
    .from(routineExercise)
    .where(eq(routineExercise.id, input.routineExerciseId));
  if (row) prescription = row;
}
```
Must become: select the base row (as today) AND left-join/select `routineExerciseCycleTarget` filtered to the session's current cycle id, then `resolveTarget(base, override)` (imported from `@fitness/api-contracts`) before assigning `prescription`. The current-cycle id itself is the D-20 position-derivation logic's output — this function needs that value passed in (likely a new `input.cycleId?: string | null` parameter) rather than deriving it itself, to keep `log-set.ts` a pure write helper and not a query-shape owner.

### `apps/mobile/lib/db/programs/*.ts` (NEW) (service, CRUD) — write helpers

**Analog:** `apps/mobile/lib/db/log-set.ts` — `startSession`/`logSet` shape (full file)
```typescript
export async function startSession(
  input: StartSessionInput = {},
  db: WriteDb = getPowerSync(),
): Promise<string> {
  const id = generateClientId();
  ...
  await db.insert(workoutSession).values({ id, ... });
  return id;
}
```
Every new write helper (`createRoutine`, `duplicateRoutine`, `activateRoutine`, `reorderExercise`, cycle CRUD) follows this exact three-part shape: `generateClientId()` (from `apps/mobile/lib/db/id.ts`) → build the values object → `db.insert(table).values(...)`, with `db: WriteDb = getPowerSync()` as the default-injectable-database parameter (the "database-injection seam," WINDOWS #23 — see Shared Patterns below, this is load-bearing for testability). `duplicateRoutine` in particular should be one function per RESEARCH.md's Don't-Hand-Roll table, walking `routine` → `routineCycle`/`routineDay` → `routineExercise` → `routineExerciseCycleTarget` issuing a fresh `generateClientId()` per row and rewriting every FK to the new parent ids — no existing in-tree function does a multi-table deep copy, so this is new logic, just built on the same insert-helper primitive.

### `apps/mobile/app/(tabs)/programs.tsx` and `apps/mobile/app/programs/library.tsx` (component, request-response)

**Analog:** `apps/mobile/app/exercises/index.tsx` (`ExercisesScreen`, full file) — the load/query/render shape to copy:
```typescript
useEffect(() => {
  let mounted = true;
  (async () => {
    const db = getPowerSync();
    try {
      const loaded = await loadCatalogRows(db);
      if (mounted) setCatalog(loaded);
    } catch (error) {
      console.error('catalog snapshot load failed', error);
      if (mounted) setFailed(true);
    }
  })();
  return () => { mounted = false; };
}, []);
```
and the `FlashList` + `Link`-wrapped-row + `ListHeaderComponent` composition (same file, tail section):
```typescript
<FlashList
  data={screenState === 'populated' ? results : []}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => (
    <Link href={{ pathname: '/exercises/[id]', params: { id: item.id } }} asChild>
      <ExerciseListRow ... />
    </Link>
  )}
  ListHeaderComponent={...}
/>
```
The active-program screen (`programs.tsx`) replaces this list with the `CycleStrip` + `DayDeck` composition, but the outer data-loading effect, `mounted` guard, and error/empty-state branching (`screenState` derivation, `deriveExerciseListScreenState`) is the exact shape to reuse for "load the active routine's full tree." `library.tsx` reuses the list/`FlashList`/`ArchiveDialog` shape directly, one program row at a time instead of one exercise row at a time.

### `apps/mobile/components/ExercisePickerModal.tsx` (D-24) (component, request-response)

**Analog:** `apps/mobile/app/exercises/index.tsx` in full — this is a **reuse**, not a rebuild: `SearchField`, `FilterChipRow` (one per facet, `muscleGroupOptions`/`equipmentOptions`/`movementPatternOptions`), `FlashList`, `ExerciseListRow`, `applyCatalogFilters`/`sortCatalogResults`/`buildSearchIndex`/`searchCatalog` from `apps/mobile/lib/catalog/`. The only behavioral delta for multi-select mode: `onPress` on each row toggles inclusion in a local `Set<string>` instead of navigating via `Link`, and an "Add" button (in the `PrimaryButton` style, see `apps/mobile/components/PrimaryButton.tsx`) commits the accumulated selection. Do not reimplement search/filter/index — import the same `@/lib/catalog/*` functions this screen already imports (lines 8-20 of `apps/mobile/app/exercises/index.tsx`).

### `apps/mobile/components/CycleStrip.tsx` (component, request-response)

**Analog:** `apps/mobile/components/FilterChipRow.tsx` (full file, 47 lines) — chip-row selection shape:
```typescript
{options.map((option) => {
  const selected = selectedIds.includes(option.id);
  return (
    <Pressable
      key={option.id}
      onPress={() => onToggle(option.id)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`... ${selected ? 'border-accent' : 'border-foreground-muted'}`}
      style={{ minWidth: 48, minHeight: 48 }}
    >
      ...
    </Pressable>
  );
})}
```
`CycleStrip` is single-select (one active cycle at a time) rather than `FilterChipRow`'s multi-select toggle, and needs distinct styling for `kind = 'deload'`/`'time_off'` chips (D-12) — copy the `Pressable`/`accessibilityState`/48×48-hit-target structure, change the selection model from array-toggle to single-index, and add a `kind`-keyed style branch instead of the plain `selected` boolean branch.

### `apps/mobile/components/ExerciseSlotRow.tsx` (D-23/D-25) (component, event-driven)

**Analog (static row shell only):** `apps/mobile/components/ExerciseListRow.tsx` — read this file for the row-layout/image/tags convention before building the slot row's collapsed state; the inline-expand behavior (D-25) has no existing analog (`DetailSection.tsx` is the closest expand/collapse precedent in `apps/mobile/components/` for a labeled content block, worth reading before inventing a new expand pattern, but it was not read this session — flag for the planner to open it directly).

### `apps/mobile/app/programs/new.tsx` (D-28) (component, CRUD)

**Analog:** `apps/mobile/components/SelectField.tsx` + `apps/mobile/components/PrimaryButton.tsx` (component composition, not a screen analog — no existing screen offers a binary blank-vs-duplicate choice). Read `SelectField.tsx` directly before building; it was not opened this session.

### `apps/api/src/seed/generate-corpus.ts` (script, batch)

**Analog:** same file, line 279 (not read this session — RESEARCH.md cites it directly: `writes the literal 'active'` for `routine.status`). Must change to `status: 'ready'` plus a separate `user_preference.active_routine_id` write for whichever seeded routine should appear active in generated fixtures.

### `apps/mobile/lib/db/__tests__/programs.test.ts` (NEW) (test)

**Analog:** `apps/mobile/lib/db/__tests__/log-set.test.ts` (full file) — the `fakeDb`-injection-seam pattern every new write-helper test should copy:
```typescript
jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../id', () => ({ generateClientId: jest.fn(() => 'fixed-id') }));

function fakeDb(insertedValuesSpy: jest.Mock) {
  return {
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    insert: () => ({ values: (values) => { insertedValuesSpy(values); return Promise.resolve(); } }),
  } as unknown as ReturnType<typeof getPowerSync>;
}
```
and the explicit-db-vs-fallback pair of tests ("writes to an explicitly-passed database and never resolves getPowerSync" / "falls back to getPowerSync() when no database argument is passed") — every new `apps/mobile/lib/db/programs/*.ts` helper needs this same pair, per the file's own "WINDOWS #23" convention.

## Shared Patterns

### Aggregate-root ownership (no `user_id`/`server_seq` on children)
**Source:** `apps/api/src/db/schema/program.ts` (`routineDay`, `routineExercise`) and `apps/api/src/db/schema/session.ts` (`sessionExercise`, `loggedSet`)
**Apply to:** `routineCycle`, `routineExerciseCycleTarget` schema files (both Postgres and SQLite) — no `userId`, no `serverSeq`, ownership resolved through `routine.userId` only, per D-09/D-10.

### The database-injection seam ("WriteDb = getPowerSync()")
**Source:** `apps/mobile/lib/db/log-set.ts` — every exported write function's signature (`db: WriteDb = getPowerSync()`)
**Apply to:** every new function in `apps/mobile/lib/db/programs/*.ts` — this is what makes `programs.test.ts` possible without a real PowerSync instance.

### Sync apply-path five-piece shape (OpData / toXValues / TABLE_MAP+AGGREGATE_RANK / hasInvalidField / PUSH_APPLIED_TABLES move)
**Source:** `apps/api/src/sync/sync.service.ts` (full file) + `packages/api-contracts/src/sync.ts`
**Apply to:** `routine`, `routine_day`, `routine_exercise`, `routine_cycle`, `routine_exercise_cycle_target`, `user_preference` — this is the phase's central cross-cutting risk (RESEARCH.md Pitfall 1) and touches nearly every plan in this phase in some way, since nothing persists across devices without it.

### Client-generated UUID before any network round-trip
**Source:** `apps/mobile/lib/db/id.ts` — `generateClientId()`
**Apply to:** every row any new write helper creates (routine, day, exercise, cycle, override) — D-03.

### Archive-as-nullable-timestamp, never hard delete
**Source:** `routine.archivedAt` (already shipped) + `apps/mobile/components/ArchiveDialog.tsx` (confirmation UI shape)
**Apply to:** `library.tsx`'s archive/restore actions — reuse `ArchiveDialog` directly (it already parameterizes `unarchiving`), do not build a new confirmation dialog.

### `.web.tsx` platform-split convention (never `Platform.OS` at a call site)
**Source:** `docs/platform-modules.md` (Phase 1 convention, not read this session but authoritatively named in CONTEXT.md D-07/D-21/D-23)
**Apply to:** the drag-handle component only if the RN-Web spike (RESEARCH.md Open Question 2) shows gesture-handler's web story has gaps — this is the phase's flagged, unresolved risk, not a pattern with an existing in-tree example to copy from (Phase 1's `_layout.tsx`/`_layout.web.tsx` split is the named precedent for the *convention*, but has no code overlap with a drag gesture).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `apps/mobile/components/DayDeck.tsx` (D-21, horizontally swipeable day pages) | component | streaming/gesture | No pager/tab-view/swipe-deck component exists anywhere in `apps/mobile/components/` or `apps/mobile/app/`. RESEARCH.md recommends `react-native-tab-view` (not yet installed) as the library; there is no first-party in-repo code to copy a pattern from — the planner should follow RESEARCH.md's Pattern 2 code example (`TabView`/`SceneMap`-style usage) directly, verified against the library's own docs at implementation time, not against this repo. |
| Drag-handle reorder logic inside `ExerciseSlotRow.tsx` (D-23) | component (interaction) | event-driven (gesture) | `apps/mobile/package.json` has no `react-native-gesture-handler`, no `react-native-reanimated`, and no reorder library installed (RESEARCH.md, confirmed this session by the absence noted in CONTEXT.md's `<code_context>`). This is the phase's largest unbudgeted technical risk and RESEARCH.md explicitly recommends a spike before sizing — there is nothing in this codebase to point the planner at as a pattern; do not invent one. |
| `apps/mobile/app/programs/new.tsx`'s blank-vs-duplicate choice screen (D-28) | component | CRUD | No screen in the tree offers a two-option creation-time fork; closest available primitives are `SelectField`/`PrimaryButton` (component-level, not screen-level) — flagged as `partial` above rather than `none` since those primitives do exist. |
| `resolveTarget`'s consumption inside the Home tab "next up" card query shape (D-20's rotation/position derivation) | service (query logic) | transform | No existing "derive position from history" logic exists anywhere in the mobile app — `log-set.ts` only ever writes forward, never reads workout history to derive a cursor. This is genuinely new logic; RESEARCH.md's Common Pitfall 5 documents the two edge cases (deleted day, time-off cycle) that must be handled but there is no code to copy from. |

## Metadata

**Analog search scope:** `apps/api/src/db/schema/`, `apps/api/src/sync/`, `packages/api-contracts/src/`, `apps/mobile/lib/db/`, `apps/mobile/lib/catalog/`, `apps/mobile/components/`, `apps/mobile/app/`, `ops/powersync/`
**Files scanned (read this session):** `apps/api/src/db/schema/program.ts`, `apps/api/src/db/schema/session.ts`, `apps/api/src/db/schema/preference.ts`, `apps/api/src/sync/sync.service.ts` (first ~500 lines), `apps/api/src/sync/patch-update-set.ts`, `packages/api-contracts/src/sync.ts`, `packages/api-contracts/src/catalog.ts`, `apps/mobile/lib/db/log-set.ts`, `apps/mobile/lib/db/id.ts`, `apps/mobile/lib/db/schema.ts`, `apps/mobile/lib/db/__tests__/log-set.test.ts`, `ops/powersync/sync-rules.yaml`, `apps/mobile/app/(tabs)/programs.tsx`, `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/exercises/index.tsx`, `apps/mobile/components/SearchField.tsx`, `apps/mobile/components/FilterChipRow.tsx`, `apps/mobile/components/ArchiveDialog.tsx`
**Pattern extraction date:** 2026-08-20
