# Phase 10: Server Analytics & Reconciliation - Pattern Map

**Mapped:** 2026-08-29
**Files analyzed:** 21
**Analogs found:** 21 / 21

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/api/src/analytics/analytics.module.ts` | module | request-response (none — no controller) | `apps/api/src/sync/sync.module.ts` | role-match |
| `apps/api/src/analytics/reconciliation.service.ts` | service | event-driven (triggered by sync push) | `apps/api/src/sync/sync.service.ts` (`applyBatch`) | role-match |
| `apps/api/src/analytics/muscle-volume.ts` | service (query helpers) | CRUD (read/upsert) | `apps/api/src/sync/sync.service.ts` upsert idiom + `apps/mobile/lib/db/weekly-progress-query.ts` join shape | role-match |
| `apps/api/src/analytics/__tests__/reconciliation.spec.ts` | test | event-driven | `apps/api/src/sync/__tests__/conflict-policy.spec.ts` | role-match |
| `apps/api/src/db/schema/analytics.ts` | model (Drizzle schema) | CRUD | `apps/api/src/db/schema/records.ts` (personalRecord/bodyMetric) | exact |
| `apps/api/src/sync/sync.service.ts` (MODIFIED — recompute hook) | service | event-driven | itself, existing `workout_session` aggregate-transaction branch | exact |
| `ops/powersync/sync-rules.yaml` (MODIFIED) | config | streaming (pull) | itself — `body_metric`/`progress_photo` query lines | exact |
| `packages/api-contracts/src/sync.ts` (NOT modified for new tables — see note) | config | — | itself — `SYNCED_TABLES` tuple | exact |
| `apps/mobile/lib/db/schema.ts` (MODIFIED) | model (Drizzle schema, client mirror) | CRUD (pull-only) | itself — `bodyMetric`/`progressPhoto` sqliteTable defs | exact |
| `apps/mobile/lib/db/muscle-volume-query.ts` | service (client query module) | CRUD / transform | `apps/mobile/lib/db/weekly-progress-query.ts`, `history-trend-query.ts` | exact |
| `apps/mobile/lib/db/__tests__/muscle-volume-query.test.ts` | test | transform | `apps/mobile/lib/db/__tests__/weekly-progress-query.spec.ts` (or sibling) | role-match |
| `packages/analytics-engine/src/muscle-volume.ts` | utility (pure aggregation) | transform | `packages/analytics-engine/src/weekly-progress.ts`, `exercise-series.ts` | exact |
| `packages/analytics-engine/src/muscle-body-view.ts` | utility (pure constant map) | transform | `packages/analytics-engine/src/constants.ts` | role-match |
| `apps/mobile/components/BodyMap.tsx` / `MuscleHeatmap.tsx` | component | transform (props-in, render-out) | `apps/mobile/components/TrendChart.tsx` | exact |
| `apps/mobile/components/__tests__/MuscleHeatmap.test.tsx` | test | transform | `apps/mobile/components/__tests__/TrendChart.test.tsx` | exact |
| `apps/mobile/components/MuscleVolumeRow.tsx` | component | request-response (nav) | `apps/mobile/components/RecordRow.tsx` | exact |
| `apps/mobile/components/MuscleDrilldownSheet.tsx` | component | request-response (modal) | `apps/mobile/components/RenameSessionDialog.tsx` / `HistoryActionSheet.tsx` | role-match |
| `apps/mobile/app/muscle-map.tsx` | component (route/screen) | request-response | `apps/mobile/app/records.tsx` | exact |
| `apps/api/src/seed/generate-corpus.ts` (MODIFIED) | utility (seed) | batch | itself — `ensureExerciseCatalog` | exact |
| `apps/api/src/seed/corpus-shape.ts` (MODIFIED) | config | — | itself — `PERF_BUDGET` | exact |
| `apps/api/test/seeded-corpus-perf.e2e-spec.ts` (MODIFIED) | test | batch | itself — `countQueries` harness | exact |
| `apps/api/test/schema-parity.e2e-spec.ts` (MODIFIED) | test | — | itself — `REQUIRED_TABLES`/`REQUIRED_COLUMNS` | exact |
| `apps/mobile/app/__durability.web.tsx` (MODIFIED, append-only) | test harness registration | — | itself — screen-import/render registry | exact |

## Pattern Assignments

### `apps/api/src/db/schema/analytics.ts` (model, CRUD)

**Analog:** `apps/api/src/db/schema/records.ts`

**Imports pattern:**
```typescript
import { relations, sql } from 'drizzle-orm';
import { bigint, date, index, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '../schema';
import { muscleGroup } from './catalog';
```

**Core deterministic-single-TEXT-PK pattern** (records.ts lines 6-31, `personalRecord`/`bodyMetric` shape):
```typescript
export const muscleVolumeRollup = pgTable(
  'muscle_volume_rollup',
  {
    id: text('id').primaryKey(), // deterministic: `${userId}:${muscleGroupId}:${localDate}`
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    muscleGroupId: text('muscle_group_id').notNull().references(() => muscleGroup.id),
    localDate: date('local_date').notNull(),
    weightedVolumeKg: numeric('weighted_volume_kg', { precision: 12, scale: 3 }).notNull(),
    serverSeq: bigint('server_seq', { mode: 'number' }).notNull().default(sql`nextval('sync_seq')`),
  },
  (table) => [index('muscle_volume_rollup_userId_idx').on(table.userId)],
);

export const analyticsWatermark = pgTable('analytics_watermark', {
  id: text('id').primaryKey(), // == userId — a per-user singleton, same shape user_preference uses
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  computedThroughDate: date('computed_through_date').notNull(),
  serverSeq: bigint('server_seq', { mode: 'number' }).notNull().default(sql`nextval('sync_seq')`),
});
```
Note: `exercise_muscle_mapping`'s composite-PK-with-`primaryKey([...])` shape (`catalog.ts` lines 68-84) is the wrong precedent here — that table is never synced through PowerSync directly as a queryable row set with an `id`; `personal_record`/`body_metric`'s single-TEXT-PK is the correct one since both new tables must sync down.

**Server_seq default idiom** — every synced table's `serverSeq` column is `bigint(..., { mode: 'number' }).notNull().default(sql\`nextval('sync_seq')\`)` verbatim across `records.ts`; copy exactly, do not invent a second sequence.

---

### `apps/api/src/sync/sync.service.ts` (MODIFIED — recompute hook)

**Analog:** itself, existing per-aggregate transaction (read this session, lines 1637-1990+)

**Hook location** — end of the existing `this.db.transaction(async (tx) => {...})` body, only for `aggregate.rootType === 'workout_session'`, after the existing per-op upsert loop (around line 1990, where `personal_record`/`equipment_profile`/`user_preference` singleton branches already sit as later cases in the same `if/else if` op-type chain starting at line 1851):
```typescript
if (aggregate.rootType === 'workout_session') {
  await this.reconciliation.reconcileSession(tx, userId, root, {
    touchedExerciseIds,   // collected while iterating orderedOps above
    oldLocalDate: existingRow[0]?.localDate ?? null, // captured via .for('update') BEFORE the op applied — line 1676
    newLocalDate: workoutSessionValues.localDate,
  });
}
```

**Old-local-date capture pattern** (line 1676, already in codebase, reuse verbatim — do not re-read the row after the update):
```typescript
const existingRow = await tx.select().from(table).where(eq(table.id, op.id)).for('update');
```

**Ownership check reused, never re-derived** — reconciliation must run only after the existing `owner !== userId` rejection branch (lines 1619-1635) has already passed; do not add a second ownership lookup.

**TABLE_MAP pattern** (lines 80-95) — `muscle_volume_rollup`/`analytics_watermark` must NOT be added here (server-only writes via direct `tx.update`/`tx.insert`, never through the generic `op.type` dispatch).

---

### `apps/api/src/analytics/reconciliation.service.ts` (service, event-driven)

**Analog:** `apps/mobile/lib/db/personal-record.ts` (`detectPrsForSession`'s idempotency discipline) + `@fitness/pr-rules`

**Idempotency key pattern to replicate server-side** (client precedent, read this session):
```typescript
const alreadyRecorded = new Set(
  (await loadSessionPersonalRecords(sessionId, db))
    .filter((record) => record.loggedSetId !== null)
    .map((record) => `${record.loggedSetId}:${record.prType}`),
);
```
Server version imports `detectPrs`/`foldPriorBest` from `@fitness/pr-rules` (never reimplements PR math) and, per D-03, is additionally allowed to DELETE a previously-recorded row a fresh replay no longer confirms — the client function's own comment explicitly defers this case to Phase 10.

**Upsert idiom to copy** (`sync.service.ts`, e.g. lines 1851-1863, `workout_session` branch):
```typescript
await tx
  .insert(muscleVolumeRollup)
  .values({ ...rollupValues, serverSeq: sql`nextval('sync_seq')` })
  .onConflictDoUpdate({
    target: muscleVolumeRollup.id,
    set: { weightedVolumeKg: rollupValues.weightedVolumeKg, serverSeq: sql`nextval('sync_seq')` },
  });
```

---

### `ops/powersync/sync-rules.yaml` (MODIFIED)

**Analog:** itself — `body_metric`/`progress_photo` query lines (the established "pull-only, no push wiring" precedent)

**Pattern to append** (verbatim shape of the existing per-table `auth.user_id()` queries):
```yaml
      - SELECT * FROM muscle_volume_rollup WHERE user_id = auth.user_id()
      - SELECT * FROM analytics_watermark WHERE user_id = auth.user_id()
```
Do NOT add these two tables to `packages/api-contracts/src/sync.ts`'s `SYNCED_TABLES` tuple — `body_metric`/`progress_photo` are proof this asymmetry (in `sync-rules.yaml` pull query, absent from `SYNCED_TABLES`/`TABLE_MAP`) is load-bearing, not a gap. `SYNCED_TABLES` only lists tables a client is allowed to push as an `op.type`; these two are never a valid push op.

---

### `apps/mobile/lib/db/schema.ts` (MODIFIED)

**Analog:** itself — `bodyMetric`/`progressPhoto` sqliteTable definitions (lines 243-260ish)

**Pattern:**
```typescript
export const muscleVolumeRollup = sqliteTable('muscle_volume_rollup', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  muscleGroupId: text('muscle_group_id').notNull(),
  localDate: text('local_date').notNull(),
  weightedVolumeKg: real('weighted_volume_kg').notNull(),
  serverSeq: integer('server_seq').notNull(),
});
```
Add to `drizzleSchema` object (lines 280-294) as one more entry, exactly like `bodyMetric`/`progressPhoto` — NOT to `localOnlyCatalogTables` (these are real synced tables, never client-written, distinct from the client-local seeded-catalog tables that pattern serves).

---

### `apps/mobile/lib/db/muscle-volume-query.ts` (service, CRUD/transform)

**Analog:** `apps/mobile/lib/db/weekly-progress-query.ts`

**Imports pattern** (weekly-progress-query.ts lines 1-14):
```typescript
import { and, eq, gte, inArray } from 'drizzle-orm';
import { countsTowardWorkingVolume, type SetType } from '@fitness/api-contracts';
import { MUSCLE_MAP_WINDOW_DAYS, type MuscleVolumeInput } from '@fitness/analytics-engine';
import { getPowerSync, type WriteDb } from './powersync';
import { exerciseMuscleMapping, loggedSet, sessionExercise, workoutSession, muscleVolumeRollup, analyticsWatermark } from './schema';
```

**Core windowed-read + overlay pattern (D-01)** — mirrors `weekly-progress-query.ts`'s "join loggedSet -> sessionExercise -> workoutSession, filter by rollingWindowStart" shape for the 1-week path; for 1-month/3-month, read `muscleVolumeRollup` rows plus `analyticsWatermark.computedThroughDate`, then run the SAME local-join query filtered to `local_date > computedThroughDate` and sum the two sources — never a third, separately-invented aggregation.

**Predicate discipline (D-07):** must call `countsTowardWorkingVolume` (never `countsTowardRecords`) exactly as `weekly-progress-query.ts` already does for its own volume-adjacent reads.

---

### `packages/analytics-engine/src/muscle-volume.ts` (utility, transform)

**Analog:** `packages/analytics-engine/src/weekly-progress.ts`

**Structural pattern to copy** (weekly-progress.ts lines 1-40): pure input interfaces named `*Input`, a pure compute function taking only those inputs (no DB import, no hook), re-exported through `packages/analytics-engine/src/index.ts`. Follow the same "only primary muscle ids cross this boundary... this module performs no lookup" discipline, adapted: this module DOES need secondary muscles + `weightFactor` (D-04), so its `MuscleVolumeExerciseInput` should carry `muscleMappings: { muscleGroupId: string; weightFactor: number }[]` resolved by the caller, exactly as `weekly-progress.ts`'s caller resolves `primaryMuscleGroupIds` before calling in.

**Predicate reuse:** import `countsTowardWorkingVolume` from `@fitness/api-contracts`, same import path `weekly-progress.ts` uses, never re-derive it (this package's own `exercise-series.ts` file-level comment warns collapsing `countsTowardWorkingVolume`/`countsTowardRecords` is "the single most likely correctness defect").

---

### `apps/mobile/components/MuscleHeatmap.tsx` (component, transform)

**Analog:** `apps/mobile/components/TrendChart.tsx`

**Imports pattern** (TrendChart.tsx lines 1-7):
```typescript
import { Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { ThemeColors } from '@/lib/theme-colors';
```
Never import `Text`/`TSpan`/`TextPath` from `react-native-svg` under any alias (R16/D-05).

**Width resolver pattern** (TrendChart.tsx lines 22-27, `resolveChartWidth`) — copy shape exactly for `resolveMuscleMapFigureWidth`:
```typescript
export function resolveChartWidth(windowWidth: number): number {
  const safeWindowWidth = Number.isFinite(windowWidth) ? windowWidth : 0;
  return Math.max(MIN_CHART_WIDTH, safeWindowWidth - 2 * SCREEN_PADDING - 2 * CARD_PADDING);
}
```

**Accessibility contract** (TrendChart.tsx lines 72-100+):
```typescript
const HIDDEN_FROM_ASSISTIVE_TECH = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;
// ...
<Svg width={width} height={TREND_CHART_HEIGHT} accessible accessibilityRole="image" accessibilityLabel={label}>
  <Path d={geometry.area} fill={colors.accent} fillOpacity={AREA_FILL_OPACITY} {...HIDDEN_FROM_ASSISTIVE_TECH} />
```
Every muscle-group `<Rect>`/`<Circle>` zone spreads `{...HIDDEN_FROM_ASSISTIVE_TECH}`; the `<Svg>` root alone carries `accessible accessibilityRole="image" accessibilityLabel={muscleMapFigureSummary(...)}`, one per figure (front/back) — two `<Svg>` roots, two announcements, per D-05/UI-SPEC.

**Pure summary-string export pattern** (TrendChart.tsx line 58, `trendChartSummary`) — write `muscleMapFigureSummary` the same way: exported, unit-testable with no renderer, composing one sentence from already-bucketed props.

**Component must stay hook-free / computation-free** (matches UI-SPEC's explicit contract) — mirrors `TrendChart`'s own "props in, JSX out" shape; no `useEffect`, no data fetching inside the component.

---

### `apps/mobile/components/__tests__/MuscleHeatmap.test.tsx`

**Analog:** `apps/mobile/components/__tests__/TrendChart.test.tsx` (implied sibling to `TrendChart.tsx`, not read this session but referenced by `trendChartSummary`'s own comment: "unit-tested on its own so the CONTENT of the announcement is proven without a renderer") — mirror its structure: (1) unit tests for the pure summary function across both cases (some trained / none trained), (2) a held-out assertion that no `SvgText`-family element renders anywhere in the tree.

---

### `apps/mobile/components/MuscleVolumeRow.tsx`

**Analog:** `apps/mobile/components/RecordRow.tsx` (per UI-SPEC's own explicit reference — "modelled on `RecordRow`'s shipped anatomy")

Reuse: single `Pressable`, `flex-1`, `minHeight: 48`, `accessibilityRole="button"`, composed `accessibilityLabel` string built from trained/untrained branch, trailing chevron-forward Ionicons at `colors.foregroundMuted`.

---

### `apps/mobile/components/MuscleDrilldownSheet.tsx`

**Analog:** `RenameSessionDialog.tsx` / `HistoryActionSheet.tsx` (per UI-SPEC's own reference — "the same idiom... already use")

Reuse: `<Modal transparent animationType="fade" onRequestClose={onClose}>`, resolve-before-present (no spinner), Close as a plain text link with `minHeight/minWidth: 48`.

---

### `apps/mobile/app/muscle-map.tsx`

**Analog:** `apps/mobile/app/records.tsx` (per UI-SPEC's own reference — "matching the shipped `app/records.tsx` convention")

Reuse: flat route, no query params, `NavBackButton` header, `ScrollView` with `contentContainerStyle={{ gap: 24, padding: 24 }}`, view-state-only window selection (never persisted), same shipped card-container discipline as `WorkoutSummaryView`/Performance screens.

---

### `apps/api/src/seed/generate-corpus.ts` (MODIFIED)

**Analog:** itself — `ensureExerciseCatalog()` (lines 248-256)

**Pattern to extend** (same raw-`db.execute` idiom, add a sibling loop):
```typescript
async function ensureExerciseCatalog(): Promise<void> {
  for (const ex of EXERCISE_CATALOG) {
    await db.execute(sql`
      INSERT INTO exercise (id, user_id, name, movement_pattern, equipment_required, load_type, unilateral, is_custom, source)
      VALUES (${ex.id}, NULL, ${ex.name}, ${ex.movementPattern}, ${ex.equipmentRequired}, ${ex.loadType}, ${ex.unilateral}, false, 'seed')
      ON CONFLICT (id) DO NOTHING
    `);
  }
  // NEW: insert exercise_muscle_mapping rows for each seed-ex-* id, referencing the real
  // muscle_group ids (packages/api-contracts/src/catalog.ts MUSCLE_GROUPS), same ON CONFLICT DO NOTHING idiom.
}
```

---

### `apps/api/src/seed/corpus-shape.ts` (MODIFIED) / `apps/api/test/seeded-corpus-perf.e2e-spec.ts` (MODIFIED)

**Analog:** itself — `PERF_BUDGET` object (corpus-shape.ts line 14) and `countQueries` helper (seeded-corpus-perf.e2e-spec.ts, read this session)

**Reuse verbatim, do not reimplement:**
```typescript
async function countQueries<T>(fn: () => Promise<T>): Promise<{ result: T; queryCount: number }> {
  const original = pool.query.bind(pool);
  let count = 0;
  (pool as any).query = (...args: unknown[]) => {
    count += 1;
    return (original as any)(...args);
  };
  try {
    const result = await fn();
    return { result, queryCount: count };
  } finally {
    pool.query = original;
  }
}
```
New `PERF_BUDGET.maxQueriesPerReconcile` constant, `[ASSUMED]`-tagged like every existing `PERF_BUDGET` entry; new `it(...)` block follows the exact shape of the existing "issues the same query count reading a three-set session and a thirty-set session" test (lines ~326-340).

---

### `apps/api/test/schema-parity.e2e-spec.ts` (MODIFIED)

**Analog:** itself — `REQUIRED_TABLES` (line 11) / `REQUIRED_COLUMNS` (line 43)

Add `'muscle_volume_rollup'`, `'analytics_watermark'` to `REQUIRED_TABLES`; add a `REQUIRED_COLUMNS` entry per new table listing every column, following the exact `workout_session: [...]` array-of-strings shape at line 44.

---

### `apps/mobile/app/__durability.web.tsx` (MODIFIED, append-only)

**Analog:** itself — the existing screen-import + render registry (imports `HistoryScreen`, `RecordsScreen`, `HomeScreen`, etc. at the top, lines 1-13, plus corresponding `lib/db/*` function imports lower down)

**Pattern:** import `MuscleMapScreen` from `./muscle-map` alongside the other screen imports (same import block, append only — never reorder or remove an existing import); render it behind whatever toggle/section the harness already uses to switch between registered screens. Per project memory (`fitness-durability-harness-seam`), every e2e-bearing plan edits this file — dispatch changes here as append-only to avoid clobbering a sibling plan's own addition.

## Shared Patterns

### Server-seq / deterministic-id upsert (server)
**Source:** `apps/api/src/db/schema/records.ts` (column shape) + `apps/api/src/sync/sync.service.ts` lines 1851-1863 (`.onConflictDoUpdate` idiom)
**Apply to:** `analytics.ts` schema, `reconciliation.service.ts`, `muscle-volume.ts`

### Ownership resolution — never re-derived
**Source:** `apps/api/src/sync/sync.service.ts` lines 1610-1635
**Apply to:** `reconciliation.service.ts` — reconciliation must run only after `applyBatch`'s own ownership check has passed for the aggregate root; never perform a second, independently-trusted `userId` lookup (V4/Access Control, per RESEARCH.md's Security Domain section).

### SVG accessibility contract (client)
**Source:** `apps/mobile/components/TrendChart.tsx` lines 1-4 (no-SvgText rule), 72-100 (`HIDDEN_FROM_ASSISTIVE_TECH`, `accessibilityRole="image"`)
**Apply to:** `MuscleHeatmap.tsx` (two `<Svg>` roots, one per figure)

### Pull-only synced table (no push-path wiring)
**Source:** `packages/api-contracts/src/sync.ts` lines 10-26 (comment on `body_metric`/`progress_photo` asymmetry), `ops/powersync/sync-rules.yaml` `body_metric`/`progress_photo` query lines
**Apply to:** `muscle_volume_rollup`, `analytics_watermark` end-to-end (server schema, sync-rules.yaml, mobile schema.ts) — never added to `SYNCED_TABLES`/`TABLE_MAP`

### Query-count budget harness
**Source:** `apps/api/test/seeded-corpus-perf.e2e-spec.ts` `countQueries` helper
**Apply to:** the new reconcile-on-edit assertion; do not build a second instrumentation wrapper

### Working-volume vs. records predicate discipline
**Source:** `packages/api-contracts/src/session.ts` (`countsTowardWorkingVolume`, `countsTowardRecords`), warned against conflation in `packages/analytics-engine/src/exercise-series.ts`
**Apply to:** `muscle-volume.ts` (analytics-engine), `muscle-volume-query.ts` (mobile), `reconciliation.service.ts` (server) — volume math uses `countsTowardWorkingVolume` only; PR math uses `countsTowardRecords` only

## No Analog Found

None — every file in scope has at least a role-match analog in the existing codebase (see table above). The one genuinely novel design element, the front/back muscle-view split (`MUSCLE_GROUP_FIGURE_SIDE`), has no code analog but is already fully specified in `10-UI-SPEC.md`'s "Muscle → Figure Assignment" table, so the planner does not need a codebase pattern for it — it needs the UI-SPEC table transcribed verbatim into `packages/analytics-engine/src/muscle-body-view.ts` (or co-located per UI-SPEC's "Named Constants" home column).

## Metadata

**Analog search scope:** `apps/api/src/{sync,db/schema,seed}`, `apps/api/test`, `apps/mobile/lib/db`, `apps/mobile/components`, `apps/mobile/app`, `packages/analytics-engine/src`, `packages/api-contracts/src`, `ops/powersync`
**Files scanned:** ~25 (direct reads) plus grep-located line ranges across `sync.service.ts` (2070 lines, targeted non-overlapping reads)
**Pattern extraction date:** 2026-08-29
