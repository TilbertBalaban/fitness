# Phase 11: Program Generation - Pattern Map

**Mapped:** 2026-08-29
**Files analyzed:** 17
**Analogs found:** 17 / 17

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/program-generator/package.json` | config | N/A | `packages/progression-engine/package.json` | exact |
| `packages/program-generator/tsconfig.json` | config | N/A | `packages/progression-engine/tsconfig.json` | exact |
| `packages/program-generator/src/index.ts` | utility (barrel) | transform | `packages/progression-engine/src/index.ts` | exact |
| `packages/program-generator/src/candidate-pool.ts` | service | CRUD-filter/transform | `apps/mobile/lib/db/session-equipment.ts` (`canEquip`) + `apps/mobile/lib/catalog/smart-swap.ts` (exclusion sets) | role-match |
| `packages/plate-math/src/equippable.ts` (promoted `canEquip`) | utility | transform | `apps/mobile/lib/db/session-equipment.ts` (source to extract from) | exact (extraction) |
| `packages/program-generator/src/split-templates.ts` | model (static table) | transform | `packages/progression-engine/src/rir-band.ts` (static lookup table shape) | role-match |
| `packages/program-generator/src/volume-landmarks.ts` | model (static table) | transform | `packages/progression-engine/src/rir-band.ts` | role-match |
| `packages/program-generator/src/emphasis.ts` | utility | transform | `packages/progression-engine/src/snap.ts` (clamp-style pure transform) | role-match |
| `packages/program-generator/src/deload.ts` | utility | transform | `packages/api-contracts/src/program.ts` (`isEmptyOverride`, `TargetOverride`) | role-match |
| `packages/program-generator/src/slot-fill.ts` | service | transform | `apps/mobile/lib/catalog/smart-swap.ts` (`scoreAlternatives`, `computeMuscleOverlap`) | role-match |
| `packages/program-generator/src/degradation.ts` | model | transform | `packages/progression-engine/src/result.ts` (structured result type pattern) | role-match |
| `packages/program-generator/src/generate.ts` | service (entry point) | transform | `packages/progression-engine/src/recommend.ts` (single exported composition entry point) | exact |
| `packages/program-generator/src/__fixtures__/parity.ts` | test fixture | transform | `packages/progression-engine/src/__fixtures__/parity.ts` | exact |
| `packages/program-generator/src/__tests__/*.test.ts` | test | transform | `packages/progression-engine/src/__tests__/*.test.ts` | exact |
| `apps/mobile/lib/db/programs/materialize-generated-program.ts` | model/service (writer) | file-I/O (bulk transaction) | `apps/mobile/lib/db/programs/duplicate-routine.ts` | exact |
| `apps/api/src/db/schema/catalog.ts` (add `excludedExercise`) | model | CRUD | `userExercisePreference` table in same file, lines ~90-117 | exact |
| `apps/mobile/lib/db/schema.ts` (add `excludedExercise`) | model | CRUD | `userExercisePreference` sqliteTable, lines ~200-208 | exact |
| `packages/api-contracts/src/sync.ts` (append tuples) | config | CRUD | `SYNCED_TABLES`/`PUSH_APPLIED_TABLES` append pattern | exact |
| `ops/powersync/sync-rules.yaml` (add stream line) | config | pub-sub | `user_exercise_preference` line, line 47 | exact |
| `apps/api/src/sync/sync.service.ts` (6 edits) | service | event-driven | `user_exercise_preference` treatment throughout the file | exact |
| `packages/api-contracts/src/generation.ts` (new vocab tuples) | model | transform | `packages/api-contracts/src/program.ts` header + tuple style | exact |
| `docs/program-generation-vocabularies.md` | config/docs | N/A | `docs/catalog-load-types.md`, `docs/program-vocabularies.md` | exact |
| `docs/excluded-exercise-shape.md` | config/docs | N/A | `docs/equipment-profile-shape.md` | exact |
| `docs/volume-rir-landmarks.md` | config/docs | N/A | `docs/equipment-profile-shape.md` | role-match |
| `apps/mobile/app/(wizard screens)` (generation wizard, discretion) | component | request-response | existing builder screens (not read this pass — planner's discretion per CONTEXT) | no strong analog yet |
| `apps/mobile/e2e/durability.spec.ts` (append) | test | event-driven | itself — append-only shared file | exact (append-only) |
| `apps/mobile/app/__durability.web.tsx` (append) | component (test harness) | event-driven | itself — append-only shared file | exact (append-only) |

## Pattern Assignments

### `packages/program-generator/package.json` + `tsconfig.json`

**Analog:** `packages/progression-engine/package.json`, `packages/progression-engine/tsconfig.json` (verified verbatim this session)

**package.json** (copy exactly, rename only):
```json
{
  "name": "@fitness/program-generator",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": { "build": "tsc", "typecheck": "tsc --noEmit", "test": "jest" },
  "dependencies": {
    "@fitness/api-contracts": "workspace:*",
    "@fitness/plate-math": "workspace:*"
  },
  "devDependencies": {
    "@types/jest": "^30.0.0",
    "@types/node": "^22.10.0",
    "jest": "^30.0.0",
    "ts-jest": "^29.2.5",
    "typescript": "^5.9.2"
  }
}
```

**tsconfig.json** (identical, `rootDir: src`, `outDir: dist`, excludes `src/__tests__/**/*`):
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "CommonJS", "moduleResolution": "Node",
    "lib": ["ES2022"], "strict": true, "declaration": true,
    "outDir": "dist", "rootDir": "src", "esModuleInterop": true,
    "skipLibCheck": true, "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/__tests__/**/*"]
}
```

**Directory layout to mirror:** `packages/progression-engine/src/` has one file per concern (`expected-performance.ts`, `rir-band.ts`, `snap.ts`, `shortfall.ts`, `preference.ts`, `normalize-history.ts`, `failure-progression.ts`, `recommend.ts`, `result.ts`), a single `index.ts` barrel, `src/__tests__/*.test.ts` (one file per module), and `src/__fixtures__/parity.ts` (data-only, no test-framework import, re-exported through the barrel). Apply this 1:1 to `program-generator`'s planned `candidate-pool.ts` / `split-templates.ts` / `volume-landmarks.ts` / `emphasis.ts` / `deload.ts` / `slot-fill.ts` / `degradation.ts` / `generate.ts` / `result.ts` layout — do not deviate.

Add `"@fitness/program-generator": "workspace:*"` to `apps/mobile/package.json` and `apps/api/package.json`, matching how `@fitness/progression-engine` is already listed in both.

---

### `packages/program-generator/src/index.ts`

**Analog:** `packages/progression-engine/src/index.ts` (read verbatim)
```typescript
export * from './result';
export * from './expected-performance';
export * from './failure-progression';
export * from './normalize-history';
export * from './preference';
export * from './rir-band';
export * from './shortfall';
export * from './snap';
export * from './recommend';
export * from './__fixtures__/parity';
```
Copy this shape: one `export *` per module, plus the fixture re-export at the bottom with the same load-bearing comment reasoning (private workspace-only package → re-exporting `__fixtures__/parity` from the public barrel is the only way apps/mobile and apps/api both import it without depending on `dist/__fixtures__` internal layout).

---

### `packages/program-generator/src/generate.ts` (entry point)

**Analog:** `packages/progression-engine/src/recommend.ts` — the single exported function that composes every other module's pure output into one result. Read `recommend.ts`'s composition shape and the "no `Date.now()`, no I/O" discipline; `generate.ts` must be the same: one exported `generateProgram(input: GenerationInput): GeneratedProgramTree` that calls candidate-pool → split-templates → slot-fill → volume-landmarks/emphasis → deload → degradation, in that order, returning a plain object.

---

### `packages/program-generator/src/candidate-pool.ts`

**Analogs:**
1. `apps/mobile/lib/db/session-equipment.ts` — the `canEquip` predicate (verified verbatim):
```typescript
const MODEL_EQUIPMENT_TYPES: EquipmentType[] = ['barbell', 'ez_bar', 'dumbbell', 'machine', 'cable'];
const NON_MODEL_EQUIPMENT_TYPES: EquipmentType[] = EQUIPMENT_TYPES.filter(
  (type) => !MODEL_EQUIPMENT_TYPES.includes(type),
);
function canEquip(type: EquipmentType, inventory: ResolvedInventory): boolean {
  if (inventory.unavailableEquipmentTypes.includes(type)) return false;
  if (type === 'barbell' || type === 'ez_bar') return inventory.barbellWeightKg !== null;
  if (type === 'dumbbell') return inventory.dumbbells.length > 0;
  return inventory.machines.some((machine) => machine.equipmentType === type);
}
```
This must be **promoted first** to `packages/plate-math/src/equippable.ts` (new file, exported alongside `resolveInventory`/`achievableBarbellLoads`) since `program-generator` cannot depend on `apps/mobile` internals (D-08, D-01). `session-equipment.ts` then imports it back from `@fitness/plate-math` instead of declaring it locally — this is an edit to an existing file, not just an addition.

2. **Nullable-equipment guard** — `apps/mobile/lib/catalog/smart-swap.ts` (verified verbatim) shows the required null-check discipline before calling any equipment predicate:
```typescript
if (
  constraints.excludeEquipment &&
  candidate.equipmentRequired !== null &&
  constraints.excludeEquipment.includes(candidate.equipmentRequired)
) {
  continue;
}
```
`candidate-pool.ts` must guard `equipmentRequired !== null` the same way before calling `canEquip` — a `null` means "no equipment gate," never "unequippable" (Pitfall 2 in RESEARCH.md).

3. **Exclusion-set pattern** — `smart-swap.ts`'s `scoreAlternatives` builds an exclusion `Set` up front (`archived`, `neverSuggested`) and filters with `continue` before any scoring happens. Apply the identical shape for the hard, unconditional `excluded_exercise` filter (D-09): build the excluded-id set once, filter candidates with it **last**, after the equipment filter, never let a fallback path skip it.

---

### `packages/program-generator/src/slot-fill.ts`

**Analog:** `apps/mobile/lib/catalog/smart-swap.ts`, `computeMuscleOverlap`/`roleOverlapWeight`/`scoreAlternatives` (read verbatim, lines ~4-220):
```typescript
function roleOverlapWeight(targetRole: MuscleRole, candidateRole: MuscleRole): number {
  if (targetRole === 'primary' && candidateRole === 'primary') return 1;
  if (targetRole === 'secondary' && candidateRole === 'secondary') return 0.25;
  return 0.5;
}

function computeMuscleOverlap(
  targetMappings: SwapMuscleMapping[],
  candidateMappings: SwapMuscleMapping[],
): { muscleScore: number; dominantMuscleGroupId: string | null; dominantIsPrimaryPrimary: boolean } {
  const candidateByGroup = new Map(candidateMappings.map((m) => [m.muscleGroupId, m]));
  let muscleScore = 0;
  for (const targetMapping of targetMappings) {
    const candidateMapping = candidateByGroup.get(targetMapping.muscleGroupId);
    if (!candidateMapping) continue;
    const roleWeight = roleOverlapWeight(targetMapping.role, candidateMapping.role);
    muscleScore += Number(targetMapping.weightFactor) * Number(candidateMapping.weightFactor) * roleWeight;
  }
  return { muscleScore, /* ... */ };
}
```
This is a **different use case** than `smart-swap.ts`'s (ranking candidates against a slot's target muscle group, not against one specific target exercise) — RESEARCH.md's Open Question 2 explicitly leaves the choice between promoting these primitives to a shared package versus a documented re-implementation to plan time. Either way, the **scoring shape to copy is**: sum over muscle groups present in both slot-requirement and candidate, weighted by `weightFactor` × `roleOverlapWeight`, seeded deterministically. Since D-03 requires `variantSeed`-driven determinism (not present in `smart-swap.ts`, which has no seed), slot-fill's selection among near-tied scores must be a **seeded** tie-break (e.g., sort by score desc, then by a seeded hash of exercise id), not `Array.sort`'s implementation-defined stability alone.

**Pure-function discipline comment to replicate** (`smart-swap.ts`, verbatim):
```typescript
// Pure: no database handle, no React import, no module-level mutable state, no Date.now(). Takes
// plain arrays and returns a new array, neither mutating nor reordering its inputs...
```

---

### `packages/program-generator/src/deload.ts` and `emphasis.ts`

**Analog:** `packages/api-contracts/src/program.ts` — `ResolvedTarget`, `TargetOverride`, `isEmptyOverride` (verified verbatim):
```typescript
export interface ResolvedTarget {
  targetSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRir: number | null;
  targetRestSeconds: number | null;
}
export type TargetOverride = Partial<ResolvedTarget>;
export function isEmptyOverride(override: TargetOverride): boolean {
  return (
    (override.targetSets ?? null) === null &&
    (override.targetRepMin ?? null) === null &&
    (override.targetRepMax ?? null) === null &&
    (override.targetRir ?? null) === null &&
    (override.targetRestSeconds ?? null) === null
  );
}
```
`deload.ts` must produce `TargetOverride` values and call `isEmptyOverride` (imported from `@fitness/api-contracts`, never reimplemented) before deciding whether a cycle emits a row — this is D-06's exact gate. `CYCLE_KINDS = ['training', 'deload', 'time_off']` is also declared here; deload placement must reuse this literal tuple, never invent a fourth kind.

`emphasis.ts` must apply the multiplier and clamp as one atomic step (`clamp(base * multiplier, landmark.mev, landmark.mav)`), per Pitfall 3 — do not split the multiply and clamp across two call sites.

---

### `packages/program-generator/src/__fixtures__/parity.ts`

**Analog:** `packages/progression-engine/src/__fixtures__/parity.ts` (verified verbatim):
```typescript
export interface ParityCase {
  name: string;
  requirement: string;
  input: RecommendInput;
  expected: ProgressionResult;
}
function inventoryFrom(overrides: Partial<EquipmentProfileLike> = {}) {
  return resolveInventory({ nativeUnit: 'kg', barbellWeightKg: '20.000', plates: [], dumbbells: [], machines: [], ...overrides });
}
```
Data-only file: no `describe`/`it`/`expect`, no test-framework import — so `packages/program-generator/src/__tests__/parity.test.ts`, a future `apps/api/src/*/__tests__/parity.spec.ts`, and `apps/mobile/lib/db/__tests__/*parity.test.ts` can all import the identical fixture object, exactly as `progression-engine`'s D-08 fixture convention already does. Per Pitfall 5, the GEN-07 parity test **must** call `recommendNextPrescription` (`packages/progression-engine/src/recommend.ts`) with `resolveTarget`-resolved prescriptions from both a hand-built and generated tree and assert `deepEqual` on the two `ProgressionResult`s — never assert by diffing tree shapes.

---

### `apps/mobile/lib/db/programs/materialize-generated-program.ts` (new writer)

**Analog:** `apps/mobile/lib/db/programs/duplicate-routine.ts` (read verbatim, lines 1-60+):
```typescript
import { generateClientId } from '../id';
import { getPowerSync, type WriteDb, type WriteTx } from '../powersync';
import { routine, routineCycle, routineDay, routineExercise, routineExerciseCycleTarget } from '../schema';
import { appendOrderIndex } from './order-index';

export async function duplicateRoutine(
  { sourceRoutineId, name }: DuplicateRoutineInput,
  db: WriteDb = getPowerSync(),
): Promise<DuplicateResult> {
  const routineId = generateClientId();
  await db.transaction(async (tx: WriteTx) => {
    await tx.insert(routine).values({
      id: routineId, name: trimmed, goal: tree.goal,
      status: 'draft', progressionFrozen: false, source: 'user',
      createdFromTemplateId: sourceRoutineId, archivedAt: null,
    });
    const cycleIdBySourceId = new Map<string, string>();
    for (const cycle of tree.cycles) {
      const id = generateClientId();
      cycleIdBySourceId.set(cycle.id, id);
      await tx.insert(routineCycle).values({ id, routineId, orderIndex: cycle.orderIndex,
        name: cycle.name, kind: cycle.kind, durationDays: cycle.durationDays });
    }
    // ...days, then routineExercise rows, then routineExerciseCycleTarget rows only where
    // !isEmptyOverride(override)
  });
}
```
`materializeGeneratedProgram` copies this exact shape: **one `db.transaction`**, one id map per table (`cycleIdBySourceId`, `dayIdBySourceId`, `exerciseIdBySourceId`), `generateClientId()` per row, `status: 'draft'`, `source: 'user'` (no new status/source value per D-05), and `routine_exercise_cycle_target` rows inserted **only when `!isEmptyOverride(override)`** (import `isEmptyOverride` from `@fitness/api-contracts`, do not hand-roll). Use `appendOrderIndex` (`apps/mobile/lib/db/programs/order-index.ts`) for any ordering, never ad-hoc increments. This is a bulk-tree writer, structurally distinct from the incremental `addDay`/`addExercisesToDay`/`setExerciseTargets` call sequence — do not use those for materialization (Anti-Pattern in RESEARCH.md).

**Error handling pattern** (from `duplicateRoutine`, verbatim): throw plain `Error` for precondition failures before the transaction opens (e.g. `if (trimmed.length === 0) throw new Error('Program name is required')`), never inside the transaction body.

---

### `apps/api/src/db/schema/catalog.ts` — add `excludedExercise`

**Analog:** `userExercisePreference` in the same file, lines ~90-117 (verified verbatim):
```typescript
export const userExercisePreference = pgTable(
  'user_exercise_preference',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id').notNull().references(() => exercise.id, { onDelete: 'cascade' }),
    archivedAt: timestamp('archived_at'),
    neverSuggest: boolean('never_suggest').notNull().default(false),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    serverSeq: bigint('server_seq', { mode: 'number' }).notNull().default(sql`nextval('sync_seq')`),
  },
  (table) => [
    unique('user_exercise_preference_user_exercise_unique').on(table.userId, table.exerciseId),
    index('user_exercise_preference_userId_idx').on(table.userId),
  ],
);
```
New `excludedExercise` table: same `id`/`userId`/`exerciseId` columns verbatim, `archivedAt`/`neverSuggest` dropped, `archivedAt` replaced with plain `createdAt: timestamp('created_at').notNull().defaultNow()` (no archive concept — un-excluding is a hard delete), same `unique(...).on(table.userId, table.exerciseId)` and `index(...).on(table.userId)` shape, table name `excluded_exercise_user_exercise_unique` / `excluded_exercise_userId_idx`.

---

### `apps/mobile/lib/db/schema.ts` — add `excludedExercise`

**Analog:** `userExercisePreference` sqliteTable, lines ~200-208 (verified verbatim):
```typescript
export const userExercisePreference = sqliteTable('user_exercise_preference', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  archivedAt: text('archived_at'),
  neverSuggest: integer('never_suggest', { mode: 'boolean' }).notNull(),
  updatedAt: text('updated_at').notNull(),
  serverSeq: integer('server_seq'),
});
```
New: `id`, `userId`, `exerciseId` unchanged; drop `archivedAt`/`neverSuggest`; add `createdAt: text('created_at').notNull()`; keep `serverSeq: integer('server_seq')`.

---

### `packages/api-contracts/src/sync.ts` — append tuples

**Analog:** the `SYNCED_TABLES`/`PUSH_APPLIED_TABLES` tuples themselves (verified — both contain `'user_exercise_preference'` at line 23/58). Header comment above both tuples reads (verbatim, matches `program.ts`'s wording pattern): **"Additive-only from this commit forward... Append only; never insert, never reorder."** Append `'excluded_exercise'` at the **end** of both `SYNCED_TABLES` and `PUSH_APPLIED_TABLES` arrays — never insert alphabetically or mid-array.

---

### `ops/powersync/sync-rules.yaml`

**Analog:** line 47 (verified verbatim): `- SELECT * FROM user_exercise_preference WHERE user_id = auth.user_id()`

New line, same `user_data` stream, same scoping: `- SELECT * FROM excluded_exercise WHERE user_id = auth.user_id()`

---

### `apps/api/src/sync/sync.service.ts` — six edits

**Analog:** every `user_exercise_preference` touchpoint in this file (verified at lines 86, 106-122, 143, 195, 920, plus insert/upsert branches near 1858-2065). Concretely:

1. `TABLE_MAP` (line ~86): add `excluded_exercise: excludedExercise,` next to `user_exercise_preference: userExercisePreference,`
2. `SINGLETON_ROOT_TYPES` (line ~122): add `'excluded_exercise',` — comment context (verbatim): *"exercise, user_exercise_preference and user_preference are singleton aggregate roots: each is looked up in its own table"*
3. `ROOT_TABLE_BY_TYPE` (line ~143): add `excluded_exercise: excludedExercise,`
4. `AGGREGATE_RANK` (line ~195): add `excluded_exercise: 0,`
5. **Do NOT** add to `HARD_DELETE_FORBIDDEN` — comment (verbatim, lines ~106): *"NOT include user_exercise_preference — clearing a preference by deleting its row is legitimate"* — un-excluding is the same legitimate delete.
6. `hasInvalidField` (analog at line 920, verified verbatim):
```typescript
if (op.type === 'user_exercise_preference') {
  const d = data as UserExercisePreferenceOpData;
  if (typeof d.exercise_id !== 'string' || d.exercise_id.length === 0) return true;
  if (d.never_suggest !== undefined && typeof d.never_suggest !== 'boolean') return true;
  return false;
}
```
New branch (drop the `never_suggest` check, no such field):
```typescript
if (op.type === 'excluded_exercise') {
  const d = data as ExcludedExerciseOpData;
  if (typeof d.exercise_id !== 'string' || d.exercise_id.length === 0) return true;
  return false;
}
```
7. Add `toExcludedExerciseValues` + its `applyBatch` insert branch, mirroring `toUserExercisePreferenceValues`'s `onConflictDoUpdate` targeting the primary key with `serverSeq: nextSeq` on insert (locate this function by grepping `toUserExercisePreferenceValues` in the same file before writing the new one — not re-read in this pass, budget a targeted grep+read at plan/implementation time).

---

### `packages/api-contracts/src/generation.ts` (new closed vocabularies)

**Analog:** `packages/api-contracts/src/program.ts` header + tuple declarations (verified verbatim):
```typescript
// Additive-only from this commit forward — every client build in the field reads this tuple
// back through its declared order and membership. Append only; never insert, never reorder.

export const ROUTINE_STATUSES = ['draft', 'ready'] as const;
export type RoutineStatus = (typeof ROUTINE_STATUSES)[number];
```
New file follows the identical header comment and `as const` tuple + derived type pattern for `TRAINING_GOALS`, `EXPERIENCE_LEVELS`, `SPLIT_PREFERENCES`, `DELOAD_PLACEMENTS`. Per RESEARCH.md Pattern 4: **no Postgres CHECK, no `sync.service.ts` branch** for these — they are `GenerationInput` function parameters, not synced columns, unless D-05's discretion decides to persist provenance (then follow the JSONB-no-CHECK precedent from `equipment_profile` instead, validated via a `hasInvalidField` type-guard, never a CHECK).

---

## Shared Patterns

### Pure-function discipline (no I/O, no Date.now, no Math.random)
**Source:** `packages/progression-engine/src/recommend.ts`, `apps/mobile/lib/catalog/smart-swap.ts`'s own header comment
**Apply to:** every file under `packages/program-generator/src/` — D-03 requires byte-identical output for identical input; any hidden clock/random call breaks the parity test and reroll reproducibility.

### Bulk-transaction write, one id map per table
**Source:** `apps/mobile/lib/db/programs/duplicate-routine.ts`
**Apply to:** `materialize-generated-program.ts` only — never the incremental builder call sequence.

### Sparse-override gate (`isEmptyOverride`)
**Source:** `packages/api-contracts/src/program.ts`
**Apply to:** `deload.ts`, `volume-landmarks.ts`/`emphasis.ts` composition inside `generate.ts`, and the writer — every `routine_exercise_cycle_target` row emission must be gated by this exact imported function, never a local reimplementation.

### New synced table, five/six-touchpoint checklist
**Source:** `user_exercise_preference`'s full footprint (schema × 2, `sync.ts`, `sync-rules.yaml`, `sync.service.ts` × 6 edits)
**Apply to:** `excluded_exercise` only — enumerated file-by-file above. `drizzle-kit push` is used (no migration files); "add a migration" means edit the two schema files and run `pnpm --filter api db:push`.

### Equipment loadability — single promoted predicate
**Source:** `apps/mobile/lib/db/session-equipment.ts`'s `canEquip`, promoted to `packages/plate-math/src/equippable.ts`
**Apply to:** `candidate-pool.ts` (new consumer) and `session-equipment.ts` (existing consumer, updated to import instead of declare) — never a third implementation.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Generation wizard screens (`apps/mobile/app/...`) | component | request-response | Screen decomposition is explicit Claude's Discretion in CONTEXT.md; no existing multi-step wizard flow was located in this pass — planner should treat this as net-new UI following the app's existing Expo Router screen conventions rather than a specific analog. |
| Preview/confirm screen (D-22) | component | request-response | Same as above — new UI, no strong precedent identified in the files read this session. |

## Metadata

**Analog search scope:** `packages/progression-engine/`, `packages/plate-math/`, `packages/api-contracts/src/`, `apps/mobile/lib/db/programs/`, `apps/mobile/lib/db/session-equipment.ts`, `apps/mobile/lib/catalog/smart-swap.ts`, `apps/api/src/db/schema/`, `apps/api/src/sync/sync.service.ts`, `ops/powersync/sync-rules.yaml`, `apps/mobile/e2e/`
**Files scanned:** ~20 (all read verbatim this session; no stale/cached excerpts)
**Pattern extraction date:** 2026-08-29

**IMPORTANT — shared append-only files:** `apps/mobile/e2e/durability.spec.ts` (318 lines) and `apps/mobile/app/__durability.web.tsx` (697 lines) are edited by every phase that adds e2e-bearing durability coverage (per standing project memory `fitness-durability-harness-seam`). Any plan touching GEN-07's durability e2e requirement must **append only** — new scenario blocks at the end of each file — and must not restructure or reorder existing scenarios, since concurrent/other-phase plans may also be appending to the same seam.
