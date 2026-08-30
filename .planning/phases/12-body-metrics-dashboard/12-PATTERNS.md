# Phase 12: Body Metrics & Dashboard - Pattern Map

**Mapped:** 2026-08-30
**Files analyzed:** ~38 new/modified files (per 12-UI-SPEC.md Screen & Component Inventory + 12-RESEARCH.md's server/sync touchpoints)
**Analogs found:** 34 / 38

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/api/src/db/schema/records.ts` (`dashboardWidget` table) | model | CRUD | same file, `bodyMetric`/`progressPhoto` tables already present | exact |
| `packages/api-contracts/src/sync.ts` (move 2 entries, append 1) | config | event-driven (sync registry) | same file, `excluded_exercise` (11-02) additions | exact |
| `apps/api/src/sync/patch-update-set.ts` (`DashboardWidgetValues`, `DASHBOARD_WIDGET_PATCH_FIELDS`) | utility | transform | `ExcludedExerciseValues`/`EXCLUDED_EXERCISE_PATCH_FIELDS` in same file | exact |
| `apps/api/src/sync/sync.service.ts` (7 registration points × 3 tables) | service | request-response (push apply) | `excluded_exercise` branches in same file | exact |
| `ops/powersync/sync-rules.yaml` (append `dashboard_widget` query) | config | pub-sub (PowerSync stream) | existing flat per-user queries in same file | exact |
| `apps/api/test/*.e2e-spec.ts` (dashboard_widget, PUSH_DEFERRED_TABLES-empty assertion) | test | request-response | `apps/api/test/excluded-exercise.e2e-spec.ts` | exact |
| `apps/mobile/lib/db/schema.ts` (`dashboardWidget` sqliteTable) | model | CRUD | same file, `excludedExercise`/`bodyMetric`/`progressPhoto` entries | exact |
| `apps/mobile/lib/db/body-metrics.ts` | service | CRUD | `apps/mobile/lib/db/exclusions.ts` | strong (role-match) |
| `apps/mobile/lib/db/progress-photos.ts` | service | CRUD | `apps/mobile/lib/db/exclusions.ts` | role-match |
| `apps/mobile/lib/db/dashboard-widgets.ts` | service | CRUD + reorder | `apps/mobile/lib/db/exclusions.ts` (CRUD) + `apps/mobile/lib/db/programs/order-index.ts` (reorder arithmetic) | strong (composite) |
| `apps/mobile/lib/db/body-metric-trend-query.ts` | service | transform (read/aggregate) | `apps/mobile/lib/db/history-trend-query.ts` / `records-query.ts` | strong (role-match) |
| `apps/mobile/lib/photos/capture.ts` / `capture.web.ts` | utility | file-I/O | `apps/mobile/lib/export/export-training-data.ts` / `.web.ts` (platform split shape only, not capture) | role-match |
| `apps/mobile/lib/photos/downscale.ts` / `downscale.web.ts` | utility | transform | none (new capability) — follow Pattern 2/3's `.web.tsx` split convention | no analog |
| `apps/mobile/lib/photos/photo-store.ts` / `photo-store.web.ts` | utility | file-I/O | `apps/mobile/lib/export/export-training-data.ts` (native `File`/`Paths`) / `export-training-data.web.ts` (Blob idiom, inverted: store not download) | strong (native) / partial (web) |
| `apps/mobile/lib/photos/composite.ts` / `composite.web.ts` | utility | transform + file-I/O | `export-training-data.ts`/`.web.ts` (share/download halves only) | partial |
| `packages/api-contracts/src/units.ts` (extend with `LENGTH_UNITS`, `CM_PER_IN`, `toCanonicalCm`/`fromCanonicalCm`) | utility | transform | same file, `toCanonicalKg`/`fromCanonicalKg` | exact |
| `docs/body-metric-vocabularies.md` | config (docs) | n/a | `docs/excluded-exercise-shape.md` / `docs/program-vocabularies.md` | exact |
| `apps/mobile/app/(tabs)/index.tsx` (restructured) | component (screen) | request-response | same file (current Home tab) | exact (self) |
| `apps/mobile/components/DashboardWidgetHost.tsx` | component | transform (dispatch) | no direct analog — closest shape is a `switch`-based dispatcher; none exists in repo yet | no analog |
| `apps/mobile/components/NextUpWidget.tsx` | component | request-response | current `NextUpCard` logic inside `index.tsx` | exact (extraction) |
| `apps/mobile/components/RecentRecordsWidget.tsx` | component | CRUD (read) | `apps/mobile/components/RecordRow.tsx` + `records-query.ts` reader | strong |
| `apps/mobile/components/MuscleHeatmapWidget.tsx` | component | request-response | `apps/mobile/components/MuscleHeatmap.tsx` (wrapped) | exact (wrapper) |
| `apps/mobile/components/BodyweightTrendWidget.tsx` | component | streaming/read | `apps/mobile/components/HistoryTrendCard.tsx` | strong |
| `apps/mobile/components/DashboardWidgetPicker.tsx` | component | reorder + CRUD | `apps/mobile/components/ReorderExercisesSheet.tsx` | exact |
| `apps/mobile/components/QuickActionSheet.tsx` | component | request-response (navigation menu) | `apps/mobile/components/SessionActionSheet.tsx` | exact |
| `apps/mobile/components/MetricEntrySheet.tsx` | component | CRUD (write) | in-workout `SetRow`/docked-keypad callers of `NumericKeypad.tsx` | strong |
| `apps/mobile/components/MetricValueKeypad.tsx` | component | transform (input reducer UI) | `apps/mobile/components/NumericKeypad.tsx` (digit grid only, no `PlateStrip`) | strong |
| `apps/mobile/components/TrackKindSheet.tsx` | component | request-response | `apps/mobile/components/HistoryActionSheet.tsx` (row-list sheet shape) | role-match |
| `apps/mobile/app/body-metrics.tsx` | component (screen) | CRUD (read list) | `apps/mobile/app/records.tsx` | strong |
| `apps/mobile/components/BodyMetricRow.tsx` | component | CRUD (read row) | `apps/mobile/components/RecordRow.tsx` | strong |
| `apps/mobile/app/body-metric-trend.tsx` | component (screen) | streaming/read | `apps/mobile/app/exercise-performance.tsx` | exact |
| `apps/mobile/components/MetricEntryRow.tsx` | component | CRUD (read row) | `apps/mobile/components/RecordRow.tsx` / session history row | role-match |
| `apps/mobile/components/MetricEntryActionSheet.tsx` (+ `DeleteMetricEntryDialog`) | component | CRUD (edit/delete) | `apps/mobile/components/HistoryActionSheet.tsx` (+ `DeleteWorkoutDialog`) | exact |
| `apps/mobile/app/progress-photos.tsx` | component (screen) | CRUD (read grid) | `apps/mobile/app/records.tsx` (list-screen shell) — grid layout is new | partial |
| `apps/mobile/components/ProgressPhotoTile.tsx` | component | file-I/O (render local bytes) | no direct analog — closest is any `Image`-rendering row component | no analog |
| `apps/mobile/components/ProgressPhotoPlaceholder.tsx` | component | transform (absent-state render) | no direct analog — closest is `HomeScreenState`'s error/empty banners | no analog |
| `apps/mobile/components/PhotoCaptureConfirmSheet.tsx` | component | CRUD (write) + file-I/O | `apps/mobile/components/MetricEntrySheet.tsx` shape (new-this-phase sibling) + `HistoryActionSheet`'s modal card | partial |
| `apps/mobile/components/ProgressPhotoActionSheet.tsx` (+ `DeletePhotoDialog`) | component | CRUD (edit/delete) | `apps/mobile/components/HistoryActionSheet.tsx` (+ `DeleteWorkoutDialog`) | exact |
| `apps/mobile/app/photo-composite.tsx` | component (screen) | transform (client render) + file-I/O | no direct analog — closest is `apps/mobile/lib/export/export-training-data.ts`/`.web.ts` for the share/download half | partial |
| `apps/mobile/app/(tabs)/profile.tsx` (2 new rows) | component (screen) | request-response (navigation) | same file, existing settings rows (e.g. Gym Profiles row) | exact |
| `apps/mobile/e2e/*.spec.ts` + `apps/mobile/app/__durability.web.tsx` (appended) | test | event-driven (Playwright, append-only shared seam) | prior phases' e2e specs against the same durability harness | exact |

## Pattern Assignments

### Sync registration for `body_metric` / `progress_photo` / `dashboard_widget` (server)

**Analog:** `apps/api/src/sync/sync.service.ts`, `excluded_exercise`'s seven touchpoints (verified read this session)

**`TABLE_MAP` / `SINGLETON_ROOT_TYPES` / `ROOT_TABLE_BY_TYPE` context** (lines ~85-158):
```typescript
// line 98
excluded_exercise: excludedExercise,
// line 128-134 (Set<string>)
const SINGLETON_ROOT_TYPES = new Set<string>([
  // ...
  'excluded_exercise',
]);
// line 148-156
const ROOT_TABLE_BY_TYPE = {
  // ...
  excluded_exercise: excludedExercise,
};
```
Add `body_metric: bodyMetric`, `progress_photo: progressPhoto`, `dashboard_widget: dashboardWidget` to all three, and `AGGREGATE_RANK` (line ~217, rank `0` — no children).

**`hasInvalidField` branch** (lines 962-966, `excluded_exercise` shape):
```typescript
if (op.type === 'excluded_exercise') {
  const d = data as ExcludedExerciseOpData;
  if (typeof d.exercise_id !== 'string' || d.exercise_id.length === 0) return true;
  return false;
}
```
`body_metric`'s branch (per RESEARCH.md Code Examples, same file, same shape) validates `kind` against `BODY_METRIC_KIND_SET` (built from `@fitness/api-contracts`'s `BODY_METRIC_KINDS` tuple — see Pitfall 4, never a retyped literal array) and `value` as a non-negative decimal string, mirroring `personal_record`'s existing `pr_type`/value validation (same file, ~line 1013-1020). `dashboard_widget`'s branch validates `widget_kind` against `WIDGET_KIND_SET` and `position` as a valid integer (reuse whatever integer validator `routine_day.order_index` already uses in this file).

**Root-lookup extension** (lines 1546-1580, `excludedExerciseRootIds` pattern):
```typescript
const excludedExerciseRootIds = rootIdsByRootType.get('excluded_exercise') ?? [];
// ...
const existingExcludedExerciseRoots = excludedExerciseRootIds.length
  ? await this.db.select({ id: excludedExercise.id, userId: excludedExercise.userId })
      .from(excludedExercise).where(inArray(excludedExercise.id, excludedExerciseRootIds))
  : [];
```
Copy this shape three times (`bodyMetricRootIds`/`progressPhotoRootIds`/`dashboardWidgetRootIds`), each folded into `existingOwnerByRoot` the same way.

**Insert/upsert branch** (lines 2016-2029, `excluded_exercise`):
```typescript
} else if (op.type === 'excluded_exercise') {
  const nextSeq = sql`nextval('sync_seq')`;
  const excludedExerciseValues = values as ExcludedExerciseValues;
  const [{ serverSeq }] = await tx
    .insert(excludedExercise)
    .values({ ...excludedExerciseValues, serverSeq: nextSeq })
    .onConflictDoUpdate({
      target: excludedExercise.id,
      set: {
        ...patchAwareSet(op, excludedExerciseValues, EXCLUDED_EXERCISE_PATCH_FIELDS),
        serverSeq: nextSeq,
      },
    })
    .returning({ serverSeq: excludedExercise.serverSeq });
  const seqValue = BigInt(serverSeq);
  if (seqValue > highestServerSeq) highestServerSeq = seqValue;
}
```
Copy verbatim three times, substituting the table/values type/patch-field map. **Trap (per RESEARCH.md's own callout):** `body_metric` and `progress_photo` already exist in Postgres and already have pull queries in `sync-rules.yaml` — do NOT touch schema files or `sync-rules.yaml` for those two. `dashboard_widget` is wholly new and needs the schema file, `sync-rules.yaml` query, AND `drizzle-kit push`/`db:verify`.

### Patch-field map (server)

**Analog:** `apps/api/src/sync/patch-update-set.ts`, lines 302-307
```typescript
export const EXCLUDED_EXERCISE_PATCH_FIELDS: PatchFieldMap<ExcludedExerciseValues> = {
  id: null,
  userId: null,
  exerciseId: null,
  createdAt: 'created_at',
};
```
`DASHBOARD_WIDGET_PATCH_FIELDS` differs meaningfully here: `widgetKind`/`position`/`enabled` ARE user-patchable (unlike `excluded_exercise`'s identity-only `exerciseId`) — reordering and toggling visibility are exactly the edits this table exists for (RESEARCH.md Pattern 4, point 4). Map them to their snake_case columns, not `null`.

### `SYNCED_TABLES` / `PUSH_APPLIED_TABLES` tuples (contracts)

**Analog:** `packages/api-contracts/src/sync.ts`, lines 9-24 and the `PUSH_APPLIED_TABLES` header comment
```typescript
export const SYNCED_TABLES = [
  // ...
  'excluded_exercise',
] as const;
```
Append `'dashboard_widget'` as the LAST member of both `SYNCED_TABLES` (already lists `body_metric`/`progress_photo` — no change needed there) and `PUSH_APPLIED_TABLES` — never inserted, never sorted (file header is explicit about additive-only ordering). Moving `body_metric`/`progress_photo` out of `PUSH_DEFERRED_TABLES` into `PUSH_APPLIED_TABLES` empties `PUSH_DEFERRED_TABLES` for the first time — write a falsifiable test asserting the tuple is `[]` (CONTEXT.md's "Specific Ideas").

### Client write/CRUD module (`body-metrics.ts`, `progress-photos.ts`, `dashboard-widgets.ts`)

**Analog:** `apps/mobile/lib/db/exclusions.ts` (full file read this session)

**Imports pattern:**
```typescript
import { and, eq } from 'drizzle-orm';
import { generateClientId } from './id';
import { type WriteDb } from './powersync';
import { excludedExercise } from './schema';
```

**Read-then-insert idempotency pattern** (lines ~68-80, `addExclusion`):
```typescript
export async function addExclusion(db: WriteDb, userId: string, exerciseId: string): Promise<void> {
  if (await findExclusionRow(db, userId, exerciseId)) return;
  await db.insert(excludedExercise).values({
    id: generateClientId(),
    userId,
    exerciseId,
    createdAt: new Date().toISOString(),
  });
}
```
`body-metrics.ts`'s `logMetric` differs deliberately: D-09 allows multiple entries per kind per day, so it is a blind insert, NOT read-then-insert — do not copy the idempotency guard here. `dashboard-widgets.ts`'s `materializeDefaultWidgets` DOES need an existence check first (materialize only when zero rows exist for the user — see Pitfall 3 below).

**Batched, no-N+1 read pattern:** `records-query.ts` (lines 1-6, 40-53) is the template for `body-metric-trend-query.ts`'s read side — one batched query, sorted in application code for determinism (`exclusions.ts`'s `loadExcludedExerciseIds` sorts in JS for the same total-order reason).

### Reorder / position allocation (`dashboard_widget.position`)

**Analog:** `apps/mobile/lib/db/programs/order-index.ts` (full file read this session, 51 lines)
```typescript
export const ORDER_INDEX_GAP = 1024;
export function appendOrderIndex(existing: number[]): number { ... }
export function midpointOrderIndex(before: number | null, after: number | null): number | null { ... }
export function needsRenumber(before: number | null, after: number | null): boolean { ... }
export function renumberOrderIndexes(orderedIds: string[]): { id: string; orderIndex: number }[] { ... }
export function sortByOrderThenId<T extends { id: string; orderIndex: number }>(rows: T[]): T[] { ... }
```
**Import this module directly** for `dashboard-widgets.ts`'s reorder writes — do not reimplement (RESEARCH.md's own "Don't Hand-Roll" table, Anti-Pattern #1). `apps/mobile/lib/db/programs/days.ts`'s `computeReorder` is the higher-level "given siblings + moved id + anchor pair, compute one midpoint write or a full renumber" function to call/extract-generically from, rather than re-deriving the anchor logic in `dashboard-widgets.ts`.

### Drag primitive (`DashboardWidgetPicker.tsx`)

**Analog:** `apps/mobile/components/DragHandle.tsx` (lines 1-45 read this session) + `ReorderExercisesSheet.tsx` (referenced, not re-read — its modal anatomy is specified directly in 12-UI-SPEC.md S2)

**Hook-free row view** (lines 20-31):
```typescript
export function DragHandleView({ exerciseName, colors }: DragHandleViewProps) {
  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={`Reorder ${exerciseName}`}
      style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="reorder-three-outline" size={20} color={colors.foregroundMuted} />
    </View>
  );
}
```
Per 12-UI-SPEC.md's own integration note (S2): `DragHandle`'s props are named for its exercise-reorder origin (`exerciseName`, `exerciseId`); pass a widget's display name/id into those same params — no behavior change required, prop rename is optional cleanup.

### Chart / trend screen (`BodyweightTrendWidget.tsx`, `body-metric-trend.tsx`)

**Analog:** `apps/mobile/components/TrendChart.tsx` (exports verified this session: `TREND_CHART_HEIGHT = 120`, `MIN_CHART_WIDTH = 200`, `MAX_POINT_MARKERS = 12`, `resolveChartWidth(windowWidth)`, `trendChartSummary({ points, metricLabel, rangeLabel })`, `TrendChart(props)`)

Reused **unchanged** (D-11) — `body-metric-trend-query.ts` supplies `{ date, value }[]` points (latest-per-`local_date`, D-09) to the exact same props every exercise trend screen already uses. No new SVG/R16/accessibility work. `apps/mobile/app/exercise-performance.tsx` is the screen-shell analog for `body-metric-trend.tsx` (headline figure + window `SegmentedChipRow` + `TrendChart` + list below).

### Action sheet + destructive dialog pair

**Analog:** `apps/mobile/components/HistoryActionSheet.tsx` (imports/exports verified this session) — the `*ActionSheet` + co-located `Delete*Dialog` shape for `MetricEntryActionSheet`+`DeleteMetricEntryDialog` and `ProgressPhotoActionSheet`+`DeletePhotoDialog`.

**Imports pattern:**
```typescript
import { Pressable, ScrollView, Text, View } from 'react-native';
```

**Row-list sheet + destructive confirm split** (function shapes, same file):
```typescript
export function HistoryActionSheetView({ sessionLabel, colors, onSelect, onCancel }: HistoryActionSheetViewProps) { /* row list */ }
export function HistoryActionSheet(props: HistoryActionSheetProps) { /* modal wrapper */ }
export function DeleteWorkoutDialog({ onConfirm, onCancel }: DeleteWorkoutDialogProps) { /* destructive confirm */ }
```
`GLYPH_COLORS` (local, not `ThemeColors`) is how this file resolves `foreground`/`destructive` — 12-UI-SPEC.md explicitly says do the same locally in the new components rather than widening `theme-colors.ts`.

### Quick-action menu (`QuickActionSheet.tsx`)

**Analog:** `apps/mobile/components/SessionActionSheet.tsx` (lines 1-60 read this session)
```typescript
export interface SessionExerciseAction {
  id: SessionExerciseActionId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
}
export const SESSION_EXERCISE_ACTIONS: SessionExerciseAction[] = [ /* fixed-order row list */ ];
```
`QuickActionSheet`'s six-row `QUICK_ACTIONS` constant mirrors this shape exactly (fixed order, `id`/`label`/`icon`, no `destructive` flag since none of the six rows is destructive per 12-UI-SPEC.md S3).

### Numeric entry (`MetricValueKeypad.tsx`, `MetricEntrySheet.tsx`)

**Analog:** `apps/mobile/components/NumericKeypad.tsx` (lines 1-70+ read this session)
```typescript
export type DigitGridKey = '1' | '2' | ... | '.' | '0' | 'backspace';
export const KEYPAD_KEYS: DigitGridKey[] = ['1','2','3','4','5','6','7','8','9','.','0','backspace'];
export function applyKeypadPress(value: string | null, press: KeypadPress): string | null { /* pure reducer */ }
function trimTrailingZeros(value: string): string { ... }
```
Reuse `KEYPAD_KEYS`/`applyKeypadPress`/`trimTrailingZeros` verbatim inside `MetricValueKeypad` — **do not** carry over `KeypadField` (`'weight'|'reps'|'rir'`), `nextKeypadField`, or `PlateStrip`/`EquipmentBandState` — those are gym-equipment-specific and out of scope per 12-UI-SPEC.md decision 7. `MetricValueKeypad` wraps the same reducer with no band row.

### Unit conversion boundary extension (length units)

**Analog:** `packages/api-contracts/src/units.ts` (lines 1-70+ read this session) — the exact-bigint-fraction pipeline
```typescript
export const WEIGHT_UNITS = ['kg', 'lb'] as const;
export const CANONICAL_KG_SCALE: number = 3;
export const DISPLAY_SCALE: Record<WeightUnit, number> = { kg: 2, lb: 1 };
export const KG_PER_LB = { numerator: 45359237n, denominator: 100000000n } as const;
function parseDecimalToFraction(value: string): Fraction { ... }
function roundExactFractionToScale(fraction: Fraction, scale: number): bigint { ... }
function formatScaledBigInt(scaledValue: bigint, scale: number): string { ... }
function convertFraction(fraction: Fraction, unit: WeightUnit, direction: 'toKg'|'fromKg'): Fraction { ... }
export function toCanonicalKg(value: string | null, unit: WeightUnit): string | null { ... }
```
Add `LENGTH_UNITS = ['cm', 'in'] as const`, `CM_PER_IN = { numerator: 254n, denominator: 100n } as const`, and `toCanonicalCm`/`fromCanonicalCm` that reuse `parseDecimalToFraction`/`roundExactFractionToScale`/`formatScaledBigInt`/a parallel `convertFraction`-shaped helper — same technique, `CM_PER_IN` substituted for `KG_PER_LB`. Never introduce a binary float anywhere in this path (D-03's own rationale, restated by RESEARCH.md's "Don't Hand-Roll" table).

### Platform-split module (`.web.tsx` convention) — photo storage/capture/composite

**Analog:** `apps/mobile/lib/export/export-training-data.ts` / `.web.ts` (both full files read this session)

**Native (`File`/`Paths` idiom):**
```typescript
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function exportTrainingData(): Promise<void> {
  const document = await buildExportDocument(getPowerSync());
  const json = JSON.stringify(document, null, 2);
  const file = new File(Paths.document, exportFilename(new Date()));
  file.create({ overwrite: true });
  file.write(json);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
  }
}
```
`photo-store.ts` copies the `File`/`Paths.document` write shape (writing bytes keyed by `storage_key` instead of a JSON export). `composite.ts` copies the `Sharing.isAvailableAsync()`/`Sharing.shareAsync(uri, ...)` handoff for the rendered composite.

**Web (Blob + `<a download>` idiom):**
```typescript
export async function exportTrainingData(): Promise<void> {
  const document = await buildExportDocument(getPowerSync());
  const json = JSON.stringify(document, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = exportFilename(new Date());
  window.document.body.appendChild(link);
  link.click();
  window.document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
```
`composite.web.ts` copies this verbatim for the share/download half — **never call `expo-sharing` on the web path** (Pitfall 2). `photo-store.web.ts` is a genuine departure — it needs IndexedDB (`indexedDB.open()`/`IDBObjectStore`, no package) for a persistent keyed Blob store, not a one-shot download; `export-training-data.web.ts` proves the "abandon `expo-file-system` entirely on web" posture but is not itself a storage analog (it downloads, it doesn't persist). No existing IndexedDB usage exists in this codebase to copy from — build from the Web API directly, following the same "web sibling takes no new dependency" discipline (D-16).

## Shared Patterns

### Singleton-root sync registration
**Source:** `apps/api/src/sync/sync.service.ts`'s `excluded_exercise` touchpoints (Pattern Assignments section above)
**Apply to:** `apps/api/src/db/schema/records.ts`, `apps/api/src/sync/patch-update-set.ts`, `apps/api/src/sync/sync.service.ts`, `packages/api-contracts/src/sync.ts`, `ops/powersync/sync-rules.yaml`, `apps/mobile/lib/db/schema.ts` for all three of `body_metric`, `progress_photo`, `dashboard_widget`.

### `.web.tsx` platform split
**Source:** `apps/mobile/lib/export/export-training-data.ts` / `.web.ts`
**Apply to:** every file under `apps/mobile/lib/photos/` (`capture`, `downscale`, `photo-store`, `composite`).

### Action-sheet + destructive-dialog pair
**Source:** `apps/mobile/components/HistoryActionSheet.tsx` (`*ActionSheet` + co-located `Delete*Dialog`), `SessionActionSheet.tsx` (fixed-order row-list constant + local `GLYPH_COLORS`)
**Apply to:** `QuickActionSheet.tsx`, `MetricEntryActionSheet.tsx`, `ProgressPhotoActionSheet.tsx`, `TrackKindSheet.tsx`, `DashboardWidgetPicker.tsx`.

### No-N+1, sorted-in-JS batched reads
**Source:** `apps/mobile/lib/db/exclusions.ts`'s `loadExcludedExerciseIds`, `apps/mobile/lib/db/records-query.ts`'s header comment ("Three batched reads, never one per row")
**Apply to:** `body-metrics.ts`, `body-metric-trend-query.ts`, `progress-photos.ts`, `dashboard-widgets.ts`.

### Forward-compatible "skip unknown, never throw" dispatch
**Source:** no direct code excerpt found this session (RESEARCH.md cites `isTerminalRejection`'s reasoning as the precedent, not re-read here) — apply the principle directly: `DashboardWidgetHost`'s render-list must be built by filtering `WIDGET_KINDS`-recognized rows before mapping, never a `switch`'s `default: throw`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `apps/mobile/components/DashboardWidgetHost.tsx` | component | transform (dispatch) | No existing "dispatch a row's `kind` field to one of N known components, skip unknown" component exists in this codebase yet — build directly from R26's requirement (filter-then-map), not from a copied file. |
| `apps/mobile/components/ProgressPhotoTile.tsx` | component | file-I/O (render local bytes) | No existing component renders a locally-stored (non-URL, non-catalog) image; nearest neighbors (`RecordRow`, session rows) are text-only. Build from `12-UI-SPEC.md` S8's anatomy spec directly. |
| `apps/mobile/components/ProgressPhotoPlaceholder.tsx` | component | transform (absent-state render) | Novel state class ("bytes absent on this device") with no prior analog; nearest precedent is prose-only (error/empty banners), not a grid-tile-shaped placeholder. Build from `12-UI-SPEC.md` design decision 11 + R27 directly. |
| `apps/mobile/lib/photos/downscale.ts` / `downscale.web.ts` | utility | transform | No existing image-manipulation code in this codebase (native `expo-image-manipulator` or web `<canvas>` resize) — first use of either. Follow the `.web.tsx` split convention structurally; the manipulation logic itself has no in-repo precedent, only the library APIs cited in 12-RESEARCH.md's Code Examples/Pattern 2-3. |
| `apps/mobile/app/photo-composite.tsx` | component (screen) | transform + file-I/O | No existing screen composes two images into one client-rendered artifact. Structurally nearest is `export-training-data.ts`/`.web.ts` for the share/download half only — the `react-native-view-shot`/`<canvas>` compositing itself is net-new. |

## Metadata

**Analog search scope:** `apps/mobile/lib/db/`, `apps/mobile/components/`, `apps/mobile/app/`, `apps/mobile/lib/export/`, `apps/api/src/sync/`, `apps/api/src/db/schema/`, `packages/api-contracts/src/`, `docs/`
**Files scanned:** ~22 read directly this session (`sync.service.ts`, `sync.ts`, `patch-update-set.ts`, `exclusions.ts`, `records-query.ts`, `order-index.ts`, `export-training-data.ts`/`.web.ts`, `DragHandle.tsx`, `units.ts`, `NumericKeypad.tsx`, `SessionActionSheet.tsx`, `TrendChart.tsx`, `HistoryActionSheet.tsx`, plus CONTEXT.md/RESEARCH.md/UI-SPEC.md in full)
**Pattern extraction date:** 2026-08-30
