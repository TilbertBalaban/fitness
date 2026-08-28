# Phase 7: Advanced Set Types - Pattern Map

**Mapped:** 2026-08-28
**Files analyzed:** 13
**Analogs found:** 13 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/mobile/components/SetTypePickerSheet.tsx` (new) | component (bottom sheet) | request-response (local, sync dispatch table) | `apps/mobile/components/SessionActionSheet.tsx` (`SessionActionSheetView`) | exact |
| `apps/mobile/components/ChangeSetTypeDialog.tsx` (new) | component (destructive confirm) | request-response | `apps/mobile/components/ArchiveDialog.tsx` | exact |
| `apps/mobile/components/SetRow.tsx` (extended) | component (row) | CRUD (renders local state, dispatches writes) | itself — extend `renderWarmupBadge`, child anatomy | exact (self-analog) |
| `apps/mobile/components/SessionActionSheet.tsx` (extended) | component (action sheet) | request-response | itself — `SESSION_EXERCISE_ACTIONS`, `RemoveExerciseDialog` | exact (self-analog) |
| `apps/mobile/components/ExerciseStrip.tsx` (extended) | component (nav strip) | transform (badge overlay + counting predicate) | itself; predicate pattern from `apps/mobile/lib/session/auto-advance.ts` | exact (self-analog) + role-match |
| `apps/mobile/components/ExercisePage.tsx` (extended) | component (page/header) | request-response | itself — `ExercisePageSetRow`, header composition | exact (self-analog) |
| `apps/mobile/lib/db/session-query.ts` (extended) | service/query | CRUD (SQL select) | itself — `LoggedSetRow`, `loadSessionTree` | exact (self-analog) |
| `apps/mobile/lib/session/set-row-builders.ts` (extended) | utility/transform | transform (ordering pipeline) | itself — `orderForDisplay`, `buildSetRows` | exact (self-analog) |
| `apps/mobile/lib/session/auto-advance.ts` (extended) | utility/transform | transform (predicate) | itself — `shouldAutoAdvance` | exact (self-analog) |
| `apps/mobile/lib/db/session-mutations.ts` (extended) | service (mutation) | CRUD (write) | itself — warm-up write path (`WARMUP_SET_TYPE`) | exact (self-analog) |
| `apps/mobile/lib/db/log-set.ts` (verify only, no change expected) | service (mutation) | CRUD (write) | itself — already accepts `parentSetId`/`side` | exact (self-analog) |
| `packages/api-contracts/src/session.ts` (extended) | config/vocabulary | transform (predicate) | itself — `SET_TYPES`, `WORKING_SET_TYPE` | exact (self-analog) |
| `packages/pr-rules/src/personal-records.ts` (extended) | utility (pure) | transform (fold/detect) | itself — `foldPriorBest`, `detectPrs` | exact (self-analog) |

## Pattern Assignments

### `apps/mobile/components/SetTypePickerSheet.tsx` (new component, request-response)

**Analog:** `apps/mobile/components/SessionActionSheet.tsx` (`SessionActionSheetView`/`SessionActionSheet` split) and `apps/mobile/components/ArchiveDialog.tsx` for the overlay shape.

**Imports pattern:**
```typescript
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColorScheme } from 'nativewind';
import { Pressable, ScrollView, Text, View } from 'react-native';
```

**Hook-free View + stateful wrapper split** (`SessionActionSheet.tsx:79-90`, verbatim structure to copy):
```typescript
export interface SessionActionSheetViewProps {
  exerciseName: string;
  colors: { foreground: string; destructive: string };
  hasEquipment: boolean;
  onSelect: (id: SessionExerciseActionId) => void;
  onCancel: () => void;
}
export function SessionActionSheetView({ exerciseName, colors, hasEquipment, onSelect, onCancel }: SessionActionSheetViewProps) {
  const visibleActions = SESSION_EXERCISE_ACTIONS.filter((action) => action.id !== 'equipment' || hasEquipment);
  // ...
}
export function SessionActionSheet(props: SessionActionSheetProps) {
  const { colorScheme } = useColorScheme();
  const colors = GLYPH_COLORS[colorScheme === 'dark' ? 'dark' : 'light'];
  return <SessionActionSheetView {...props} colors={colors} />;
}
```
`SetTypePickerSheetView` must take the same shape: `currentSetType`, `hasChildren: boolean`, `childCount: number`, `onSelect(type)`, `onCancel()`. Resolve theme colors in the stateful wrapper exactly as above — do not call `useColorScheme`/`useThemeColors` inside the `*View` function (hook-free rule).

**Overlay/ScrollView shape to copy verbatim** (`SessionActionSheet.tsx:52-56`, also `ArchiveDialog.tsx:73-77`):
```typescript
<View className="flex-1 items-center justify-center bg-background/80 px-lg">
  <ScrollView
    className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg"
    contentContainerStyle={{ flexGrow: 1 }}
  >
```

**Row anatomy to copy** (`SessionActionSheet.tsx:60-70`) — 48px-min row, icon + label, active-row treatment is new (UI-SPEC: semibold `text-accent` + trailing checkmark on the current type):
```typescript
<Pressable
  key={action.id}
  onPress={() => onSelect(action.id)}
  accessibilityRole="button"
  accessibilityLabel={action.label}
  style={{ minHeight: 48 }}
  className="flex-row items-center gap-sm rounded-md px-md py-sm"
>
  <Ionicons name={action.icon} size={20} color={action.destructive ? colors.destructive : colors.foreground} />
  <Text className={`text-body font-normal ${action.destructive ? 'text-destructive' : 'text-foreground'}`}>{action.label}</Text>
</Pressable>
```
Extend with a trailing `<Ionicons name="checkmark" size={16} color={colors.accent} />` and `font-semibold text-accent` label class when the row is the active type (per UI-SPEC "Set-Type Picker Sheet" table).

**Dispatch table, not a generic setter** — per D-01/Pitfall 6, `onSelect` must not be `(type) => setSetType(type)`. Model it as a lookup keyed by `SET_TYPES` value returning `'retype' | 'insert-child'`, then branch: retype types call the existing set-mutation write path (see `session-mutations.ts` below); `drop`/`partial` either no-op-close (children already matching), confirm-and-clear (children of a different kind — reuses `ChangeSetTypeDialog`), or insert one child via `logSet` with `parentSetId` set.

**Error handling:** no try/catch shown in sibling sheets — local writes are synchronous SQLite via PowerSync; on failure, render `ErrorBanner` inline above the sheet and keep it open (see `ChangeSetTypeDialog` section below for the exact banner reuse).

---

### `apps/mobile/components/ChangeSetTypeDialog.tsx` (new component, request-response)

**Analog:** `apps/mobile/components/ArchiveDialog.tsx` in full — this component is explicitly "`ArchiveDialog`-shaped" per CONTEXT D-09 and UI-SPEC.

**Full structural pattern to copy** (`ArchiveDialog.tsx:63-97`):
```typescript
export function ArchiveDialog({ unarchiving = false, subject = 'exercise', onConfirm, onCancel }: ArchiveDialogProps) {
  const copy = unarchiving ? COPY[subject].unarchive : COPY[subject].archive;
  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg" contentContainerStyle={{ flexGrow: 1 }}>
        <Text className="text-heading font-semibold text-foreground">{copy.heading}</Text>
        <Text className="mt-sm text-body text-foreground-muted">{copy.body}</Text>
        <View className="mt-lg flex-row justify-end gap-sm">
          <Pressable onPress={onCancel} accessibilityRole="button" style={{ minWidth: 48, minHeight: 48 }}
            className="items-center justify-center rounded-md px-md py-sm">
            <Text className="text-body text-foreground-muted">Cancel</Text>
          </Pressable>
          <Pressable onPress={onConfirm} accessibilityRole="button" style={{ minWidth: 48, minHeight: 48 }}
            className={`items-center justify-center rounded-md px-md py-sm ${unarchiving ? '' : 'bg-destructive'}`}>
            <Text className={`text-body font-semibold ${unarchiving ? 'text-foreground' : 'text-background'}`}>{copy.confirmLabel}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
```
For `ChangeSetTypeDialog`, copy props are `{ subEntryCount: number; onConfirm: () => void; onCancel: () => void }` — no `subject`/`unarchiving` union needed (single fixed copy per UI-SPEC's Copywriting Contract: "Change Set Type?" / "This set has {n} sub-entr{y/ies}...").

**Alternative sibling pattern** (simpler, no COPY table): `RemoveExerciseDialog` in `SessionActionSheet.tsx:117-142` is a leaner single-purpose destructive-confirm component in the same file family — copy this shape if you prefer inlining fixed copy directly rather than building a `COPY` lookup table (this dialog has only one variant, so the table pattern is unnecessary overhead).

---

### `apps/mobile/components/SetRow.tsx` (extended, CRUD)

**Analog:** itself — `renderWarmupBadge`, the set-number `Pressable`, `SetRowView`.

**Existing badge to generalize** (`SetRow.tsx:138-149`):
```typescript
function renderWarmupBadge() {
  return (
    <View accessibilityLabel="Warm-up set" className="items-center justify-center rounded-full bg-secondary"
      style={{ width: 14, height: 14, marginRight: 4 }}>
      <Text className="text-label font-normal text-foreground-muted" style={{ fontSize: 9, lineHeight: 12 }}>W</Text>
    </View>
  );
}
```
Generalize to `renderTypeBadge(glyph: string)` taking any of `W/D/M/P/F/A/L/R`, called from `SetRowView` per the badge-glyph-map priority rule (side wins over type — R14: at most one glyph ever).

**Existing unused set-number tap target** (`SetRow.tsx:183-194`, CF-04 — wire `onPress` here, do not add a second Pressable):
```typescript
<View style={{ width: 24, minHeight: 24, alignItems: 'center', justifyContent: 'center' }}>
  <Pressable
    onLongPress={onLongPress}
    accessibilityRole="button"
    accessibilityLabel={`Set ${setIndex} type`}
    style={{ minHeight: 24, minWidth: 24, alignItems: 'center', justifyContent: 'center' }}
    {...noteActionProps(onLongPress)}
  >
    <Text className="text-body font-normal text-foreground">{setIndex}</Text>
  </Pressable>
</View>
```
Add `onPress={onSetNumberPress}` here (opens `SetTypePickerSheet`); `onLongPress` (note) stays wired unchanged, exactly the coexistence pattern the field Pressables below it already use.

**Checkmark 48×48 hit-target pattern to copy for the new child remove glyph** (`SetRow.tsx:233-247`):
```typescript
<Pressable
  onPress={onCheckmarkPress}
  onLongPress={onLongPress}
  accessibilityRole="button"
  accessibilityLabel={completed ? 'Mark set incomplete' : 'Mark set complete'}
  accessibilityState={{ selected: completed }}
  className={completed ? 'items-center justify-center rounded-full bg-accent' : 'items-center justify-center rounded-full border border-foreground-muted'}
  style={{ width: 48, height: 48 }}
  {...noteActionProps(onLongPress)}
>
  {completed ? <Ionicons name="checkmark" size={20} color="white" /> : null}
</Pressable>
```
Copy this exact 48×48 `Pressable` shape for the child row's `trash-outline` remove glyph (`accessibilityLabel="Remove sub-entry"`, `text-destructive`, no confirm per UI-SPEC).

**Hook-free `*View` discipline** — `SetRowView` (`SetRow.tsx:159-251`) is a plain function, no hooks; keep every new prop (`parentSetId`, `side`, `setType`, `isChild`, `onSetNumberPress`, `onRemoveChild`) optional and additive, exactly the existing `warmup?: boolean`/`hasNote?: boolean` discipline.

---

### `apps/mobile/components/SessionActionSheet.tsx` (extended, request-response)

**Analog:** itself.

**The closed-union + conditional-filter pattern to extend** (`SessionActionSheet.tsx:16-33,53`):
```typescript
export type SessionExerciseActionId = 'swap' | 'remove' | 'reorder' | 'info' | 'equipment';
export const SESSION_EXERCISE_ACTIONS: SessionExerciseAction[] = [
  { id: 'swap', label: 'Swap', icon: 'swap-horizontal-outline' },
  { id: 'remove', label: 'Remove', icon: 'trash-outline', destructive: true },
  { id: 'reorder', label: 'Reorder', icon: 'reorder-three-outline' },
  { id: 'info', label: 'Info', icon: 'information-circle-outline' },
  { id: 'equipment', label: 'Equipment', icon: 'construct-outline' },
];
// ...
const visibleActions = SESSION_EXERCISE_ACTIONS.filter((action) => action.id !== 'equipment' || hasEquipment);
```
Append (never insert) `'superset' | 'detach-superset' | 'enable-per-side' | 'disable-per-side'` to the union and array, per D-11/D-21 and UI-SPEC's exact labels/icons (`link-outline`, `unlink-outline`, `git-compare-outline`, `git-merge-outline`). Extend the `visibleActions` filter with the same `!== id || condition` shape, one clause per new conditional row — mirroring the `equipment` precedent exactly, not a new filtering mechanism.

**Destructive confirm dialog to copy for `RemoveExerciseDialog`'s sibling if a per-side/superset dialog is ever needed** (none is — both are immediate, no-confirm per UI-SPEC) — `RemoveExerciseDialog` (`SessionActionSheet.tsx:117-142`) stays the confirm-dialog reference pattern in this file only.

---

### `apps/mobile/lib/db/session-query.ts` (extended, CRUD/select)

**Analog:** itself.

**Current `LoggedSetRow` shape to widen** (`session-query.ts:29-40`):
```typescript
export interface LoggedSetRow {
  id: string;
  sessionExerciseId: string;
  setIndex: number;
  setType: string;
  weightKg: string | null;
  reps: number;
  rir: number | null;
  completed: boolean;
  loggedAt: string;
  notes: string | null;
}
```
Add `parentSetId: string | null; side: string | null;` and select both columns in `loadSessionTree`'s query (verified gap at the SQL select — the columns exist on the table but are not selected).

**The bare-literal exclusion this phase must route through the new predicate** (`session-query.ts:211,294,382`):
```typescript
const WORKING_SET_TYPE_EXCLUSION = 'warmup';
// ...
ne(loggedSet.setType, WORKING_SET_TYPE_EXCLUSION),
```
Replace both `ne(...)` use sites with a call through `countsTowardWorkingVolume` from `@fitness/api-contracts` (D-17) — do not keep the bare local constant once the shared predicate exists.

---

### `apps/mobile/lib/session/set-row-builders.ts` (extended, transform)

**Analog:** itself — `orderForDisplay`, `buildSetRows`.

**Current two-bucket sort that must become a tree-flatten** (`set-row-builders.ts:83-87`, full function, the load-bearing gap this phase must close per Pitfall 2):
```typescript
function orderForDisplay(existingSets: LoggedSetRow[]): LoggedSetRow[] {
  const warmups = existingSets.filter((row) => row.setType === 'warmup');
  const working = existingSets.filter((row) => row.setType !== 'warmup');
  return [...warmups, ...working];
}
```
Replace with: bucket warmups first (unchanged), then tree-flatten the remainder by `parentSetId` (parent immediately followed by its children sorted by `setIndex`) — see RESEARCH.md Pattern 3's illustrative `flattenGroups` for the exact shape to implement and unit-test.

**`ResolvedSetRow` shape to widen** (`set-row-builders.ts:40-52`):
```typescript
export interface ResolvedSetRow {
  setId: string | null;
  setIndex: number;
  values: SetRowValues;
  reference: SetRowReference;
  completed: boolean;
  setType?: string;
  noteText?: string | null;
}
```
Add `parentSetId?: string | null; side?: string | null;` — same optional/additive discipline as the rest of this interface, and thread through in `buildSetRows`'s row-mapping (`set-row-builders.ts:118-121` `return { setId: row.id, setIndex: row.setIndex, values, reference, completed, setType: row.setType, noteText: row.notes };`).

**`draftSetIndex` computation pattern to reuse for D-23's parent-position display** (`set-row-builders.ts:143`):
```typescript
const draftSetIndex = existingSets.length === 0 ? 1 : Math.max(...existingSets.map((row) => row.setIndex)) + 1;
```
D-23's "position among parent rows only" display value is a similar derived-not-stored computation — compute it once during the tree-flatten pass (count of `parentSetId === null` rows seen so far), never persist it, matching this file's existing "derive at read time, never trust a stored ordinal" discipline.

---

### `apps/mobile/lib/session/auto-advance.ts` (extended, transform/predicate)

**Analog:** itself, full file (52 lines) already read in RESEARCH.md.

**Current predicate to extend** (`auto-advance.ts:1-52` relevant excerpt):
```typescript
import { WORKING_SET_TYPE } from '@fitness/api-contracts';

export interface AutoAdvanceSetInput {
  setType: string;
  completed: boolean;
}

export function shouldAutoAdvance({ sets, enabled, currentIndex, exerciseCount, completedSetType, targetWorkingSets }: ShouldAutoAdvanceInput): number | null {
  if (!enabled) return null;
  if (completedSetType !== WORKING_SET_TYPE) return null;
  const workingSets = sets.filter((set) => set.setType === WORKING_SET_TYPE);
  if (workingSets.length === 0) return null;
  const requiredCount = targetWorkingSets !== null && targetWorkingSets > 0 ? targetWorkingSets : workingSets.length;
  const allWorkingComplete = workingSets.length >= requiredCount && workingSets.every((set) => set.completed);
  if (!allWorkingComplete) return null;
  if (currentIndex >= exerciseCount - 1) return null;
  return currentIndex + 1;
}
```
D-19's exact required change: add `parentSetId: string | null` to `AutoAdvanceSetInput`, insert `.filter((set) => set.parentSetId === null)` before the existing `.filter((set) => set.setType === WORKING_SET_TYPE)` line. Add a second, separate, narrower function for D-14's superset-internal advance — do not fold it into `shouldAutoAdvance` (Pitfall 5).

---

### `apps/mobile/lib/db/session-mutations.ts` and `apps/mobile/lib/db/log-set.ts` (extended/verify, CRUD write)

**Analog:** itself — the warm-up write path is CONTEXT.md's own named closest analog for writing a non-`normal` type; `log-set.ts`'s transaction shape is the write path for grouping (already correct, verify only).

**Verified insertion pattern already supporting `parentSetId`/`side`** (`log-set.ts:189-216`, full transaction, quoted directly from RESEARCH.md — no change expected, only new call sites):
```typescript
await db.transaction(async (tx: WriteTx) => {
  const [maxRow] = await tx
    .select({ maxIndex: sql<number | null>`max(${loggedSet.setIndex})` })
    .from(loggedSet)
    .where(eq(loggedSet.sessionExerciseId, input.sessionExerciseId));
  const setIndex = (maxRow?.maxIndex ?? 0) + 1;

  await tx.insert(loggedSet).values({
    id,
    sessionExerciseId: input.sessionExerciseId,
    setIndex,
    setType: input.setType ?? 'normal',
    weightKg,
    reps: input.reps,
    rir: input.rir ?? null,
    side: input.side ?? null,
    completed: input.completed ?? false,
    parentSetId: input.parentSetId ?? null,
    restTakenSeconds: input.restTakenSeconds ?? null,
    loggedAt,
  });
});
```
Every new write this phase needs (retype via update, insert-child via `logSet({ parentSetId, setType: 'drop'|'myorep'|'partial'|'failure'|'amrap', side })`) calls into this existing function — do not write a second insert path.

---

### `packages/api-contracts/src/session.ts` (extended, transform/predicate)

**Analog:** itself.

**Existing vocabulary shape to extend beside** (`session.ts:1-23`):
```typescript
export const SET_TYPES = ['normal', 'warmup', 'drop', 'myorep', 'partial', 'failure', 'amrap'] as const;
export type SetType = (typeof SET_TYPES)[number];
export const WORKING_SET_TYPE: SetType = 'normal';
export const WARMUP_SET_TYPE: SetType = 'warmup';
```
Add exactly beside these, per D-17/D-18 (verbatim recommended shape from RESEARCH.md):
```typescript
export function countsTowardWorkingVolume(setType: SetType): boolean {
  return setType !== WARMUP_SET_TYPE;
}
export function countsTowardRecords(setType: SetType): boolean {
  return setType !== WARMUP_SET_TYPE && setType !== 'partial';
}
```
Model on `docs/program-vocabularies.md`'s established pattern for publishing a derived predicate beside a closed vocabulary (per CONTEXT.md canonical refs) — do not add an eighth `SET_TYPES` literal, do not reorder (CF-02).

---

### `packages/pr-rules/src/personal-records.ts` (extended, transform/pure)

**Analog:** itself, both guard sites already isolated in RESEARCH.md.

**Current warmup-only guards to swap** (`personal-records.ts:32-36,63-66`):
```typescript
export function foldPriorBest(sets: CandidateSet[]): PriorBest {
  const priorBest = emptyPriorBest();
  for (const set of sets) {
    if (set.setType === WARMUP_SET_TYPE || !set.completed || set.weightKg === null) continue;
    // ...
```
```typescript
export function detectPrs(candidate: CandidateSet, priorBest: PriorBest): DetectedPr[] {
  if (candidate.setType === WARMUP_SET_TYPE || !candidate.completed || candidate.weightKg === null) {
    return [];
  }
  // ...
```
D-18's change: both `set.setType === WARMUP_SET_TYPE` conditions become `!countsTowardRecords(set.setType)` (and `candidate.setType` analogously), importing `countsTowardRecords` from `@fitness/api-contracts`. No other structural change to either function.

---

### `apps/mobile/components/ExerciseStrip.tsx` (extended, transform)

**Analog:** itself (the fifth bare-literal location this phase must migrate, per RESEARCH.md's own finding beyond CONTEXT.md's four).

**Current predicate to extend** (`ExerciseStrip.tsx:44-53`, quoted in full from RESEARCH.md):
```typescript
export interface ExerciseChipSet {
  setType: string;
  completed: boolean;
}
export function countCompletedWorkingSets(sets: ExerciseChipSet[]): number {
  return sets.filter((set) => set.setType !== 'warmup' && set.completed).length;
}
```
Same two changes as `auto-advance.ts`: add `parentSetId: string | null` to `ExerciseChipSet`, `.filter((set) => set.parentSetId === null)` before the existing filter, and route the `'warmup'` literal through `countsTowardWorkingVolume` (R13).

---

### `apps/mobile/components/ExercisePage.tsx` (extended, request-response)

**Analog:** itself — `ExercisePageSetRow` interface (already carries an optional `setType` per CONTEXT.md's own note that `workout.tsx` doesn't yet thread it through).

Widen `ExercisePageSetRow` (`ExercisePage.tsx:22-36`) the same way as `ResolvedSetRow` above — add optional `parentSetId`/`side` fields, additive-only. Add the superset partner chip beneath the header per UI-SPEC (`bg-secondary rounded-full` pill, tap jumps pager) — this is new visual composition with no direct existing analog in this file; base its "chip beneath header, tap navigates" mechanic on the Exercise Strip's own chip-tap-jumps-pager mechanic (Phase 5 D-12), reused rather than reinvented.

## Shared Patterns

### Hook-free `*View` + stateful wrapper
**Source:** `apps/mobile/components/SessionActionSheet.tsx:38-90` (also `SetRow.tsx`'s `SetRowView`, `ExercisePage.tsx`'s `ExercisePageView`)
**Apply to:** `SetTypePickerSheet.tsx`, `ChangeSetTypeDialog.tsx`, and every extension to `SetRow.tsx`/`SessionActionSheet.tsx`/`ExercisePage.tsx`. The `*View` function takes fully-resolved props (including theme colors) and contains zero hooks; a thin wrapper resolves hooks and renders the `*View`.

### Additive-only optional props on shared row/type interfaces
**Source:** `SetRow.tsx`'s `warmup?: boolean`, `hasNote?: boolean`; `ResolvedSetRow`'s `setType?: string`, `noteText?: string | null`
**Apply to:** every widened interface this phase touches (`LoggedSetRow`, `ResolvedSetRow`, `ExercisePageSetRow`, `AutoAdvanceSetInput`, `ExerciseChipSet`) — new fields (`parentSetId`, `side`) are additive so existing callers/tests render unchanged.

### Overlay/ScrollView sheet shape
**Source:** `apps/mobile/components/SessionActionSheet.tsx:52-56`, `apps/mobile/components/ArchiveDialog.tsx:73-77`
```typescript
<View className="flex-1 items-center justify-center bg-background/80 px-lg">
  <ScrollView className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg" contentContainerStyle={{ flexGrow: 1 }}>
```
**Apply to:** `SetTypePickerSheet`, `ChangeSetTypeDialog` — identical geometry, no new overlay/positioning system.

### Closed vocabulary + named derived predicate, never an inline literal comparison
**Source:** `packages/api-contracts/src/session.ts:1-23`
**Apply to:** `countsTowardWorkingVolume`/`countsTowardRecords` (new), and every call site currently inlining `!== 'warmup'` (`session-query.ts`, `history-query.ts`, `summary-query.ts`, `ExerciseStrip.tsx`, `personal-records.ts`) must be migrated to call the shared predicate (R13, this phase's explicit contract rule).

### 48×48 minimum Pressable hit target
**Source:** `SetRow.tsx:233-247` (checkmark), `SessionActionSheet.tsx:60-70`/`117-142` (rows, dialog buttons)
**Apply to:** every new interactive element this phase adds (picker rows, "+ Add" chip, child remove glyph, four new action-sheet rows).

### Additive-only closed-union + conditional-filter for action sheet rows
**Source:** `SessionActionSheet.tsx:16-33,53` (`SESSION_EXERCISE_ACTIONS`, `equipment`'s conditional filter)
**Apply to:** the four new rows (`superset`, `detach-superset`, `enable-per-side`, `disable-per-side`) — appended, never inserted; one `filter` clause per row, same `!== id || condition` shape.

## No Analog Found

None — every file in scope has a direct or self-analog in the existing codebase (this phase adds no new library, no new backend endpoint, no new database column per RESEARCH.md's own summary).

## Metadata

**Analog search scope:** `apps/mobile/components/`, `apps/mobile/lib/db/`, `apps/mobile/lib/session/`, `packages/api-contracts/src/`, `packages/pr-rules/src/`
**Files scanned:** `SetRow.tsx`, `SessionActionSheet.tsx`, `ArchiveDialog.tsx`, `ExercisePage.tsx`, `ExerciseStrip.tsx`, `session-query.ts`, `set-row-builders.ts`, `auto-advance.ts`, `log-set.ts`, `session.ts` (api-contracts), `personal-records.ts`
**Pattern extraction date:** 2026-08-28
