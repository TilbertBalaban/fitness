# Phase 8: Progression Engine - Pattern Map

**Mapped:** 2026-08-28
**Files analyzed:** 8 (progression-engine package internals, next-up-query read path, workout screen render path, user_preference dial, plate-math call site, parity fixture, unit tests, e2e/durability spec)
**Analogs found:** 6 strong / 1 partial / 1 none

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/progression-engine/src/index.ts` (+ rule modules) | utility (pure rules package) | transform | `packages/pr-rules/src/index.ts` + `estimated-1rm.ts` | exact |
| `packages/progression-engine/package.json` | config | — | `packages/pr-rules/package.json` | exact |
| `packages/progression-engine/tsconfig.json` | config | — | `packages/pr-rules/tsconfig.json` | exact |
| `packages/progression-engine/jest.config.js` (new) | config | — | `packages/pr-rules/jest.config.js` | exact |
| `packages/progression-engine/src/__tests__/*.test.ts` | test | transform | `packages/pr-rules/src/__tests__/estimated-1rm.test.ts` | exact |
| `packages/progression-engine/src/__fixtures__/parity.ts` (new, no precedent) | test fixture | transform | none in repo | no analog |
| `apps/mobile/lib/db/schema.ts` — new `userPreference` column (D-07 dial) | model | CRUD | `userPreference.autoAdvanceEnabled` / `warmupSetsEnabled` columns, same table, `apps/mobile/lib/db/schema.ts:267-276` | exact |
| `apps/api/src/db/schema/preference.ts` — matching Postgres column | model | CRUD | same file, existing `autoAdvanceEnabled`/`warmupSetsEnabled` columns | exact |
| `apps/mobile/lib/db/preferences.ts` — new getter/setter for the dial | service | CRUD | `loadWorkoutPreferences` / `setWorkoutPreference` in same file | exact |
| `apps/mobile/lib/db/programs/recommendation-query.ts` (new, read path) | service | request-response | `apps/mobile/lib/db/programs/next-up-query.ts` (`loadNextUp`) | role-match |
| `apps/mobile/app/(tabs)/workout.tsx` — call site invoking the engine at exercise start | component (screen) | request-response | same file's existing `resolvedInventory`/`bandState` memo wiring, `workout.tsx:766-858, 942-954` | exact |
| normalisation boundary (D-11) — likely `apps/mobile/lib/db/programs/recommendation-query.ts` or a small adapter inside it | transform | transform | `countCompletedWorkingSets` in `apps/mobile/components/ExerciseStrip.tsx:59-62` and `countsTowardWorkingVolume` in `packages/api-contracts/src/session.ts:31-33` | role-match (predicate shape, not a full analog) |
| `apps/mobile/e2e/progression-recommendation.spec.ts` (new) | test (e2e/durability) | event-driven | `apps/mobile/e2e/workout-screen.spec.ts` | exact |
| `apps/mobile/app/__durability.web.tsx` — new harness exports for this spec | test harness | event-driven | existing exports in same file, e.g. `loadNextUp`/`resolveNextUp` wiring at top of file | exact |

## Pattern Assignments

### `packages/progression-engine/*` (pure rules package)

**Analog:** `packages/pr-rules/` in full (package.json, tsconfig.json, jest.config.js, `src/index.ts`, `src/estimated-1rm.ts`, `src/__tests__/estimated-1rm.test.ts`). `packages/plate-math/` corroborates the same shape one package over.

**package.json** — copy verbatim except the name (`packages/pr-rules/package.json`):
```json
{
  "name": "@fitness/pr-rules",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": { "build": "tsc", "typecheck": "tsc --noEmit", "test": "jest" },
  "dependencies": { "@fitness/api-contracts": "workspace:*" },
  "devDependencies": {
    "@types/jest": "^30.0.0", "@types/node": "^22.10.0",
    "jest": "^30.0.0", "ts-jest": "^29.2.5", "typescript": "^5.9.2"
  }
}
```
`packages/progression-engine/package.json` today has **no** `test` script and **no** `jest`/`ts-jest`/`@types/jest` devDependencies — it was scaffolded before it needed tests. This phase must add them, matching pr-rules exactly (D-08's parity fixture needs a runnable `test` script in this package too, since D-08 says the fixture table is "run by both suites" — the mobile suite and the api suite, so the package itself doesn't need its own separate jest project run in CI beyond what api/mobile already invoke, but keeping `test` present lets the package be typechecked and unit-tested standalone the same way pr-rules and plate-math are).

**tsconfig.json** — copy verbatim (`packages/pr-rules/tsconfig.json`), noting one real divergence from the current `progression-engine/tsconfig.json`: pr-rules' `include`/`exclude` explicitly excludes `src/__tests__/**/*` from the `tsc` build:
```json
"include": ["src/**/*.ts"],
"exclude": ["src/__tests__/**/*"]
```
`packages/progression-engine/tsconfig.json` currently has `"include": ["src/**/*.ts"]` with **no** `exclude` — add the same exclude once tests exist, or `tsc` will try to emit declaration files for test files.

**jest.config.js** — copy verbatim (`packages/pr-rules/jest.config.js`):
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  reporters: ['default', '<rootDir>/../../scripts/jest-suite-integrity.cjs'],
};
```
This file does not exist yet in `progression-engine/` — create it.

**Export surface via `index.ts`** (`packages/pr-rules/src/index.ts`, 3 lines, one `export * from` per module):
```typescript
export * from './estimated-1rm';
export * from './personal-records';
export * from './warmup';
```
Replace `packages/progression-engine/src/index.ts`'s current placeholder body (`PROGRESSION_ENGINE_PLACEHOLDER`) entirely with one `export *` line per rule module this phase adds (e.g. `recommend.ts`, `normalize-history.ts`, whatever module names the plan settles on).

**Named-constant + why-comment discipline** (`packages/pr-rules/src/estimated-1rm.ts:1-5`, load-bearing for D-05/D-06's named thresholds):
```typescript
// Both Epley and Brzycki degrade above roughly 10-12 reps (PITFALLS.md Pitfall 8) — this cutoff
// is a deliberate project choice, not a validated study threshold. A summary printing a confident
// 1RM off a set of 20 is worse than one printing nothing, so estimated1RM returns null past it
// rather than a number nobody should trust.
export const E1RM_MAX_VALID_REPS = 10;
```
Copy this exact shape for `SHORTFALL_STREAK_FOR_REDUCTION_OFFER = 3` (D-05) and `RIR_TOLERANCE_BAND = 1` (D-06): a top-level `export const`, immediately preceded by a comment stating *why* this number and not another, citing the ROADMAP/REQUIREMENTS clause it satisfies — not restating what the constant does.

**Test file naming/layout** — `packages/pr-rules/src/__tests__/estimated-1rm.test.ts`, one test file per rule module, same basename, `describe(fnName, ...)` blocks, boundary-first case ordering (exact value at cutoff, one past cutoff, zero, negative, non-finite):
```typescript
import { E1RM_MAX_VALID_REPS, estimated1RM } from '../estimated-1rm';

describe('estimated1RM', () => {
  it('returns the weight itself at 1 rep', () => { ... });
  it('returns a number at the exact validity cutoff', () => {
    expect(estimated1RM(100, E1RM_MAX_VALID_REPS)).not.toBeNull();
  });
  it('returns null one rep above the validity cutoff', () => {
    expect(estimated1RM(100, E1RM_MAX_VALID_REPS + 1)).toBeNull();
  });
});
```

**Dependency on `@fitness/plate-math`** — both `pr-rules` and `plate-math` currently depend only on `@fitness/api-contracts` (see both `package.json`s' `dependencies` block: `"@fitness/api-contracts": "workspace:*"`). `progression-engine` needs an additional workspace dependency for D-04:
```json
"dependencies": {
  "@fitness/api-contracts": "workspace:*",
  "@fitness/plate-math": "workspace:*"
}
```
No existing package in this repo depends on a *sibling* package other than `api-contracts` — this is a new edge in the dependency graph, worth flagging to the planner rather than assuming it "just works" the way the api-contracts edge does.

**One real gap versus the pr-rules/plate-math precedent:** neither `pr-rules` nor `plate-math` is imported anywhere under `apps/api` today (`grep -rln '@fitness/pr-rules' apps/api` and the same for `plate-math` both return no matches — confirmed empty). Both packages are consumed **only from `apps/mobile`** so far, even though ARCHITECTURE.md's stated intent (and this phase's D-01) is both-sides consumption. This means there is **no existing precedent in this repo for calling one of these pure packages from NestJS** — the plan must invent that call site (a service/controller under `apps/api/src` importing `@fitness/progression-engine`), it cannot copy one.

---

### Client/server parity fixture (D-08)

**No analog exists in this repo.** Searched `packages/*/src/__tests__`, `apps/api/test`, `apps/mobile/lib/**/__tests__` for any shared fixture table already exercised by two separate test runners (grep for `fixture` across `packages`, `apps/api/test`, `apps/mobile/lib`, `apps/mobile/e2e`) — every hit is either an unrelated word match (`fixtureless` naming coincidence, e.g. `next-up.ts`'s comment) or a single-suite test file, never a table imported by both an api-side spec and a mobile-side spec. `apps/api/test/schema-parity.e2e-spec.ts` is the closest *conceptual* cousin (it also proves two independently-maintained things stay consistent — TypeScript schema types vs. live Postgres columns) but it is not a shared-fixture-table pattern: it hardcodes its own `REQUIRED_TABLES`/`REQUIRED_COLUMNS` arrays and asserts against a live DB connection, not against data the mobile suite also consumes.

**Recommendation for the planner:** this is new territory. The most natural placement, given the package layout above, is a plain exported array from inside `packages/progression-engine/src/__fixtures__/parity.ts` (pure data, no test-framework import, so it is importable from both Jest configs — mobile's and the api's — without a cross-framework dependency), of the shape:
```typescript
export interface ParityCase {
  name: string;
  input: RecommendInput; // whatever the engine's entry point takes
  expected: RecommendResult;
}
export const PARITY_FIXTURES: ParityCase[] = [ /* ... */ ];
```
Then two thin runner files — one under `packages/progression-engine/src/__tests__/parity.test.ts` (or under `apps/mobile/lib/**/__tests__` and `apps/api/test`) — each doing `it.each(PARITY_FIXTURES)(...)` against its own call path. State this plainly to whoever executes the plan: this is invented, not copied.

---

### `apps/mobile/lib/db/programs/recommendation-query.ts` (new read service)

**Analog:** `apps/mobile/lib/db/programs/next-up-query.ts` (`loadNextUp`, lines 1-93).

**Shape to copy** — a thin async reader that takes `userId`/`exerciseId` + an injectable `db: WriteDb = getPowerSync()`, does a handful of flat `db.select` queries, and hands the raw rows to a *pure* resolver imported from a sibling package/module (here: `resolveNextUp` from `apps/mobile/lib/programs/next-up.ts`) rather than embedding decision logic inline:
```typescript
// apps/mobile/lib/db/programs/next-up-query.ts:31-45
export async function loadNextUp(userId: string | null, db: WriteDb = getPowerSync()): Promise<NextUpData> {
  const today = captureCalendarDay(new Date()).localDate;
  if (!userId) return { ...EMPTY, today };
  const activeRoutineId = await loadActiveRoutineId(userId, db);
  if (!activeRoutineId) return { ...EMPTY, today };
  ...
}
```
This is the model for the new file: `loadRecommendationInputs(userId, exerciseId, db)` reads logged history + prescription + inventory + preference, then hands the assembled plain-value bundle to `@fitness/progression-engine`'s pure entry point — mirroring how `loadNextUp` hands its rows to `resolveNextUp` rather than deciding anything itself. The doc-comment convention above the function (why this reads through a specific pointer, what N+1 risk PITFALLS.md flags) should be preserved for the new file too.

**Where the history read must not read current program targets:** `apps/mobile/lib/db/log-set.ts:69-96` (`resolvePrescriptionForCycle`) is the load-bearing precedent that a *prescription* is a point-in-time snapshot copied onto `session_exercise` at set-log time, never re-derived from the current routine later. The new recommendation read path must read **logged history** (`logged_set`/`session_exercise` rows as recorded), not `routine_exercise`'s live target columns — otherwise D-01's "editing a program must never change a logged workout" invariant from Phase 4 is silently violated by the progression engine reading the wrong source of truth.

---

### `apps/mobile/app/(tabs)/workout.tsx` — the exercise-start render call site

**Analog:** the file's own existing `resolvedInventory`/`bandState` wiring — this is the closest and most literal precedent since the recommendation must be computed and consumed in the exact same screen.

**Async-resolve-into-state pattern** (`workout.tsx:766-770, 851-858`):
```typescript
// Resolved once per session load, through loadSessionInventory's own snapshot read (D-17) —
const [resolvedInventory, setResolvedInventory] = useState<ResolvedInventory | null>(null);
...
void loadSessionInventory(session.session.id, db).then(setResolvedInventory);
...
setResolvedInventory(null);
```
This is the pattern for wiring in a recommendation at exercise start: resolve asynchronously off a `useState`, driven by the same session-load effect, defaulting to `null` on session end/switch — not a `useEffect` re-fetch per keystroke.

**Pure computation memoised on inputs, no solver call in the view layer** (`workout.tsx:945-954`):
```typescript
// T-06-04: the band's whole state, computed once here and memoised on the inventory and the
// in-flight target — the view itself (WorkoutScreenView) performs no computation and runs no
// solver.
const bandState = useMemo<EquipmentBandState>(() => {
  if (!activeField || activeField.field !== 'weight') return { kind: 'collapsed' };
  return resolveEquipmentBand({
    equipmentType: activeEquipmentType,
    targetKg: toCanonicalKg(activeField.value, weightUnit),
    inventory: resolvedInventory,
  });
}, [activeField, activeEquipmentType, resolvedInventory, weightUnit]);
```
The progression-engine call at exercise start should follow this exact shape: a `useMemo` (or the async-state variant above, since it needs a DB read first) that calls the pure package function with already-resolved plain values, and a view component that receives the *result* as a prop and renders it — never calling the engine itself. This is also where D-09's discriminated union pays off: the view branches on `result.kind`, exactly as `PlateStrip`/`ExercisePage` never call `solvePlateBreakdown`/`resolveEquipmentBand` themselves (documented explicitly in `apps/mobile/components/PlateStrip.tsx:165-167`):
```typescript
// The stateful wrapper: resolves theme colors only. Every band computation already happened in the
// caller before this component ever mounts — this file makes no call to solvePlateBreakdown or
// resolveEquipmentBand at any call site.
```

---

### The logged-history read + D-11 normalisation boundary

**Analog for the working-set predicate:** `apps/mobile/components/ExerciseStrip.tsx:47-62`, and the underlying `countsTowardWorkingVolume` in `packages/api-contracts/src/session.ts:31-33`.
```typescript
// apps/mobile/components/ExerciseStrip.tsx:59-62
// D-10: a parent row is one set toward the prescription; children (drop/myorep/partial/per-side
// sub-entries) add volume but never increment the set count...
export function countCompletedWorkingSets(sets: ExerciseChipSet[]): number {
  return sets.filter((set) => set.parentSetId === null && countsTowardWorkingVolume(set.setType as SetType) && set.completed)
    .length;
}
```
```typescript
// packages/api-contracts/src/session.ts:31-33
export function countsTowardWorkingVolume(setType: SetType): boolean {
  return setType !== WARMUP_SET_TYPE;
}
```
This is the closest kin to D-11's normalisation, but it is a narrower predicate (boolean "counts or not") than what D-11 needs (fold a set-with-children into one comparable performance — weight/reps/RIR — collapsing drops/myoreps/partials/per-side rows into a single value per Phase 7 group). There is no existing function in the repo that does this folding; `countCompletedWorkingSets`/`countsTowardWorkingVolume`/`countsTowardRecords` (`packages/api-contracts/src/session.ts:39-41`, which additionally excludes `partial`) are the three existing predicates the new normaliser should compose with or sit beside, not duplicate. The new normaliser belongs in `packages/progression-engine/src/normalize-history.ts` (pure, takes the raw `set_type`/`parent_set_id`/`superset_group_id`/per-side rows as plain values, same as the engine's other inputs) — it is new logic, not a copy, but it must reuse `SetType`/`WARMUP_SET_TYPE`/`countsTowardWorkingVolume` from `@fitness/api-contracts` rather than re-deriving the set-type list (`packages/progression-engine/package.json` will need `@fitness/api-contracts` as a dependency, matching pr-rules/plate-math).

**Failure-set kin:** `countsTowardRecords` in the same file (`session.ts:39-41`) shows the existing precedent for a *stricter* variant predicate living beside the looser one, with a comment stating exactly which requirement it satisfies — copy that same "second predicate beside the first, named for its purpose, one line" style for whatever helper D-11's failure-set handling needs (PRGR-03: "beats the prior rep count at the same load").

---

### `user_preference` — D-07's new preference column

**Analog:** the two most recently added dials on the same row, `autoAdvanceEnabled` and `warmupSetsEnabled`, end to end.

**Mobile schema** (`apps/mobile/lib/db/schema.ts:267-276`):
```typescript
export const userPreference = sqliteTable('user_preference', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  weightUnit: text('weight_unit').notNull(),
  defaultEquipmentProfileId: text('default_equipment_profile_id'),
  activeRoutineId: text('active_routine_id'),
  autoAdvanceEnabled: integer('auto_advance_enabled', { mode: 'boolean' }).notNull().default(true),
  warmupSetsEnabled: integer('warmup_sets_enabled', { mode: 'boolean' }).notNull().default(true),
  serverSeq: integer('server_seq'),
});
```
D-07's dial is a two-value enum (widen-rep-range-first vs match-previous-weight), not a boolean — closer in shape to `weightUnit` (a `text` column holding one of a small closed set of string literals) than to the two boolean flags. Add it as `text('progression_preference').notNull().default('widen_rep_range_first')` (or equivalent), following `weightUnit`'s column style, not the boolean columns'.

**API/Postgres schema** (`apps/api/src/db/schema/preference.ts:14-31`) — same columns mirrored as `pgTable`, with the load-bearing comment about why `id === user_id` (singleton-row wire contract) preserved unmodified; add the matching `text('progression_preference')` column here too, same default.

**Sync rules** (`ops/powersync/sync-rules.yaml:51`):
```yaml
- SELECT * FROM user_preference WHERE user_id = auth.user_id()
```
`SELECT *` means the new column syncs automatically — no sync-rules edit needed, only a schema/migration change on both sides.

**Read/write path** (`apps/mobile/lib/db/preferences.ts`, full file) — the getter/setter pair to copy verbatim in shape:
```typescript
export async function loadWeightUnit(userId: string, db: WriteDb = getPowerSync()): Promise<WeightUnit> {
  const [row] = await db.select({ weightUnit: userPreference.weightUnit }).from(userPreference).where(eq(userPreference.id, userId));
  return (row?.weightUnit as WeightUnit | undefined) ?? (DEFAULT_WEIGHT_UNIT as WeightUnit);
}
```
and the insert-or-update singleton write (`preferences.ts:44-63`, `setWorkoutPreference`) — select-then-branch on `existing`, insert with every column defaulted explicitly on first-ever row. Add `loadProgressionPreference`/`setProgressionPreference` following this exact two-function shape, reusing the same "row id IS the user id" comment convention from `apps/api/src/db/schema/preference.ts:6-13` if the new mobile getter/setter earns a similar why-comment.

**UI read:** no existing settings screen reads `weightUnit`/`autoAdvanceEnabled` was located as a dedicated toggle screen in this pass — the planner should grep `setWorkoutPreference(` call sites when writing that plan to find the actual settings UI, not assume one from this pattern map.

---

### Plate-math call site (D-04)

**Analog:** `apps/mobile/app/(tabs)/workout.tsx`'s existing resolve-then-pass pattern, and `apps/mobile/lib/db/session-equipment.ts:110-126` (`loadSessionInventory`) for how the inventory itself gets resolved from a session.

**Resolve inventory once, from a session-scoped equipment profile** (`session-equipment.ts:110-126`):
```typescript
export async function loadSessionInventory(sessionId: string, db: WriteDb = getPowerSync()): Promise<ResolvedInventory | null> {
  const [session] = await db.select({ equipmentProfileId: workoutSession.equipmentProfileId }).from(workoutSession).where(eq(workoutSession.id, sessionId));
  if (!session?.equipmentProfileId) return null;
  const profile = await loadEquipmentProfile(session.equipmentProfileId, db);
  if (!profile) return null;
  const unavailable = await loadSessionUnavailable(sessionId, db);
  return resolveInventory(profile, unavailable);
}
```
The progression engine's D-04 snapping needs exactly this `ResolvedInventory`, already produced by `loadSessionInventory` and already held in `workout.tsx`'s `resolvedInventory` state (`workout.tsx:770`, populated at `workout.tsx:851`) — the recommendation call site should receive that same state value as an argument, not re-resolve it. Passing the already-resolved inventory straight to the engine's call for `achievableBarbellLoads`/`roundToAchievable` (both already imported in `workout.tsx:25-33`) is the reuse point D-04 asks for.

---

## Shared Patterns

### Pure-package layout (D-01/D-02)
**Source:** `packages/pr-rules/` in full.
**Apply to:** every file under `packages/progression-engine/`.
Package.json/tsconfig/jest.config copied near-verbatim; `index.ts` is a flat `export *` barrel; one rule module per file; one test file per rule module under `src/__tests__/`; every named threshold is a top-level `export const` with a why-not-what comment immediately above it.

### Async-resolve-into-state, pure-compute-in-useMemo
**Source:** `apps/mobile/app/(tabs)/workout.tsx:766-770, 851-858, 945-954`.
**Apply to:** the new recommendation call site in the same file, and any component that renders the result.
DB reads happen once per session load into a `useState`; the pure computation over already-resolved values happens in a `useMemo`; the view layer never calls the engine or the solver directly (`PlateStrip.tsx:165-167` states this constraint explicitly for the existing precedent).

### Singleton-row preference dial
**Source:** `apps/mobile/lib/db/preferences.ts` (full file) + `apps/api/src/db/schema/preference.ts` + `ops/powersync/sync-rules.yaml:51`.
**Apply to:** the D-07 progression-preference column, schema-first on both sides, then the getter/setter pair, no sync-rules change needed since the table syncs via `SELECT *`.

### Discriminated-union result, no fabricated fallback
**Source:** `apps/mobile/components/PlateStrip.tsx`'s `PlateBreakdown`-shaped consumption pattern (`plate-math/src/solver.ts:4-9` for the type itself) and `apps/mobile/lib/programs/next-up.ts:42-46` (`NextUp` union: `'no-active-program' | 'no-days' | 'workout' | 'time-off' | 'program-complete'`).
**Apply to:** D-09's recommendation result type — a closed discriminated union (`{ kind: 'recommendation'; ... } | { kind: 'unavailable'; reason: ... }`), matching the style of `NextUp<D, C>` exactly: one `kind` field, no `null`/sentinel-number outs.

## No Analog Found

| File/Concern | Role | Data Flow | Reason |
|---|---|---|---|
| Shared client/server parity fixture table (D-08) | test fixture | transform | No file in this repo is currently imported by both an `apps/api` test and an `apps/mobile` test. `schema-parity.e2e-spec.ts` proves a related but structurally different kind of two-sided consistency (live DB vs. TS types), not a shared data table. The planner must design this fresh — see the dedicated section above for a proposed shape. |
| Calling a `packages/*` pure rules package from `apps/api` | integration | request-response | Neither `@fitness/pr-rules` nor `@fitness/plate-math` is imported anywhere under `apps/api` today (confirmed via grep — zero matches). ARCHITECTURE.md's both-sides intent for these packages has not actually been exercised from the server side yet in this codebase; this phase's api-side call site is new ground, not a copy. |
| A dedicated settings-screen UI for a `user_preference` dial | component | request-response | Not located in this pass (only the data-layer getter/setter for `weightUnit`/`autoAdvanceEnabled`/`warmupSetsEnabled` was found, not a specific settings-screen component). The planner should grep `setWorkoutPreference(`/`setWorkoutPreference` call sites directly when scoping that specific plan to find the real UI analog. |

## Metadata

**Analog search scope:** `packages/pr-rules`, `packages/plate-math`, `packages/progression-engine`, `packages/api-contracts/src/session.ts`, `apps/mobile/lib/db/**`, `apps/mobile/lib/programs/**`, `apps/mobile/components/ExerciseStrip.tsx`, `apps/mobile/components/PlateStrip.tsx`, `apps/mobile/app/(tabs)/workout.tsx`, `apps/mobile/app/__durability.web.tsx`, `apps/mobile/e2e/workout-screen.spec.ts`, `apps/api/src/db/schema/preference.ts`, `apps/api/test/schema-parity.e2e-spec.ts`, `ops/powersync/sync-rules.yaml`
**Files scanned:** ~30 read/grepped directly, plus repo-wide greps for `@fitness/pr-rules`, `@fitness/plate-math`, `@fitness/progression-engine`, `user_preference`, `fixture`, `countsTowardWorkingVolume`
**Pattern extraction date:** 2026-08-28
