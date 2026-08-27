# Phase 6: Gym Profiles & Plate Math - Pattern Map

**Mapped:** 2026-08-27
**Files analyzed:** 24
**Analogs found:** 22 / 24

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/api/src/sync/sync.service.ts` (add `equipment_profile` case) | controller/sync-handler | CRUD | same file, `'routine'`/`'workout_session'` cases | exact |
| `packages/api-contracts/src/equipment.ts` (NEW) | model/validator | transform | `packages/api-contracts/src/catalog.ts` (`isCatalogSnapshot`) | exact |
| `packages/plate-math/src/solver.ts` (NEW) | utility (pure) | transform | `packages/pr-rules/src/warmup.ts` | role-match |
| `packages/plate-math/src/achievability.ts` (NEW) | utility (pure) | transform | `packages/pr-rules/src/warmup.ts` (`roundToIncrement`) | exact |
| `packages/plate-math/src/inventory.ts` (NEW) | utility (pure) | transform | `apps/mobile/lib/catalog/smart-swap.ts` (`scoreAlternatives`, pure-function discipline) | role-match |
| `packages/plate-math/package.json` (NEW) | config | — | `packages/pr-rules/package.json` | exact |
| `apps/mobile/lib/db/log-set.ts` (wire `equipmentProfileId` into `startSession` call sites) | service | CRUD | same file, `startSession` (param already exists, unwired) | exact |
| `apps/mobile/lib/catalog/smart-swap.ts` (fill `excludeEquipment`/`allowEquipment`) | service | transform | same file, `scoreAlternatives` | exact |
| `apps/mobile/app/gym-profiles/index.tsx` (NEW) | screen/route | request-response (live query) | `apps/mobile/app/programs/library.tsx` | exact |
| `apps/mobile/app/gym-profiles/new.tsx` (NEW) | screen/route | CRUD | `apps/mobile/app/exercises/new.tsx` | exact |
| `apps/mobile/app/gym-profiles/edit/[id].tsx` (NEW) | screen/route | CRUD | `apps/mobile/app/exercises/edit/[id].tsx` | exact |
| `apps/mobile/components/GymProfileEditor.tsx` (NEW) | component (form) | CRUD | exercise editor form component (shared by new/edit) | role-match |
| `apps/mobile/components/GymProfileActionSheet.tsx` (NEW) | component (sheet) | event-driven | `apps/mobile/components/RoutineActionSheet.tsx` | exact |
| `apps/mobile/components/ArchiveDialog.tsx` (extend `ArchiveDialogSubject`) | component (dialog) | event-driven | same file (add `'gym'` to existing union + COPY table) | exact |
| `apps/mobile/components/PlateStrip.tsx` (NEW) | component (view) | transform (pure render of solver output) | `apps/mobile/components/NumericKeypad.tsx` (`NumericKeypadView`, hook-free view pattern) | role-match |
| `apps/mobile/components/NumericKeypad.tsx` (mount `PlateStrip` in reserved band) | component | event-driven | same file (`RESERVED_BAND_HEIGHT` slot) | exact |
| `apps/mobile/components/SessionActionSheet.tsx` (add `equipment` row) | component (sheet) | event-driven | same file, `SESSION_EXERCISE_ACTIONS` constant | exact |
| `apps/mobile/components/EquipmentAvailabilitySheet.tsx` (NEW) | component (sheet) | event-driven | `apps/mobile/components/SessionActionSheet.tsx` + reuses `SwapSuggestionList.tsx` | exact |
| `apps/mobile/components/SwitchGymSheet.tsx` (NEW) | component (sheet) | event-driven | `apps/mobile/components/SessionActionSheet.tsx` (list-of-rows sheet shape) | exact |
| `apps/mobile/app/(tabs)/workout.tsx` (Session Menu: add Switch Gym row) | screen | event-driven | same file's existing Menu popover (Pause/Resume, Session Note, Discard) | exact |
| `apps/mobile/app/(tabs)/profile.tsx` (add Gyms nav row) | screen | request-response | same file, `ToggleRow` section pattern (adapted to a nav row w/ chevron) | role-match |
| `apps/mobile/lib/db/session-lifecycle.ts` or similar (mid-session gym restamp, D-18) | service | CRUD | `apps/mobile/lib/db/log-set.ts` (`startSession`, update-in-place mutation helpers) | role-match |
| `apps/mobile/app/exercise/[id]/index.tsx` `ExercisePage.tsx` (`handleSwapPick` db-threading fix, WINDOWS #138) | component | event-driven | same file's other write helpers (Targets/Note/Reorder `db ?? getPowerSync()` pattern) | exact |
| `docs/equipment-profile-shape.md` (NEW) | docs | — | `docs/catalog-load-types.md`, `docs/program-vocabularies.md`, `docs/session-vocabularies.md` | exact |

## Pattern Assignments

### `apps/api/src/sync/sync.service.ts` — add `equipment_profile` push case (controller/sync-handler, CRUD)

**Analog:** same file, the `'routine'` case (aggregate root, own `server_seq`) and the `'workout_session'` case (mutation shape).

**Core CRUD pattern** (verified, lines 1746-1754 for `workout_session`; equivalent `routine` shape referenced in RESEARCH.md):
```typescript
} else if (op.type === 'equipment_profile') {
  const nextSeq = sql`nextval('sync_seq')`;
  const equipmentProfileValues = values as EquipmentProfileValues;
  const [{ serverSeq }] = await tx
    .insert(equipmentProfile)
    .values({ ...equipmentProfileValues, serverSeq: nextSeq })
    .onConflictDoUpdate({
      target: equipmentProfile.id,
      set: { ...patchAwareSet(op, equipmentProfileValues, EQUIPMENT_PROFILE_PATCH_FIELDS), serverSeq: nextSeq },
    })
    .returning({ serverSeq: equipmentProfile.serverSeq });
  const seqValue = BigInt(serverSeq);
  if (seqValue > highestServerSeq) highestServerSeq = seqValue;
}
```

**Validation gate pattern** — mirror the `isInvalidField`-style guard used for `'routine'`/`'user_preference'` (lines 855-885):
```typescript
if (op.type === 'routine') {
  const d = data as RoutineOpData;
  if (d.status !== undefined && !(typeof d.status === 'string' && ROUTINE_STATUSES.has(d.status))) {
    return true;
  }
  if (d.name !== undefined && !(typeof d.name === 'string' && d.name.trim().length > 0)) return true;
  return false;
}
```
For `equipment_profile`, call the new `isEquipmentProfilePlates`/`isEquipmentDumbbellIncrements`/`isEquipmentMachineAvailability` guards from `packages/api-contracts/src/equipment.ts` here, following exactly this shape — reject before the transaction opens, never write a partial/corrupt shape.

**Security note (V4):** scope every write through the authenticated `userId`, never a client-supplied one, exactly as `toRoutineValues`/`toWorkoutSessionValues` already do.

---

### `packages/api-contracts/src/equipment.ts` (NEW) — JSONB shape validators (model/validator, transform)

**Analog:** `packages/api-contracts/src/catalog.ts`, `isCatalogSnapshot` (lines 143-161).

**Core pattern to copy:**
```typescript
export function isEquipmentProfilePlates(value: unknown): value is EquipmentProfilePlate[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).weightKg === 'string' &&
      typeof (entry as Record<string, unknown>).count === 'number' &&
      (entry as Record<string, unknown>).count >= 0,
  );
}
```
Same discipline: pure function, no I/O, returns a type predicate, bounds array size (V5/DoS mitigation per RESEARCH.md Security Domain), parses decimal fields through `parseDecimalToFraction` from `units.ts` rather than `Number()` coercion (D-03's no-float-path guarantee).

**Serialize/deserialize helper (Pitfall 3):** co-locate one shared JSON.stringify/parse pair here for `available_plates`/`dumbbell_increments_kg`/`machine_availability`, since Postgres stores these as real `jsonb` (`apps/api/src/db/schema/equipment.ts:15-17`) but the SQLite mirror stores them as plain `text` (`apps/mobile/lib/db/schema.ts:128-130`). Route every read/write on both sides through this helper — never inline `JSON.parse`/`JSON.stringify` at a call site.

---

### `packages/plate-math/src/solver.ts` + `achievability.ts` + `inventory.ts` (NEW package) — pure functions (utility, transform)

**Analog for module shape/exports/header-comment convention:** `packages/pr-rules/src/warmup.ts` (full file, reproduced above in Research). Reuse:
- The explicit-parameter discipline: `roundToIncrement(value, increment)` takes no implicit default for anything load-bearing — this phase's `roundToAchievable(targetKg, inventory, direction)` must take `direction` as an explicit parameter, never a default baked into the rounder (D-10).
- The "why" comment convention for a non-obvious tie-break: `warmup.ts`'s comment on `Math.round`'s ties-toward-+Infinity is the exact model for documenting the solver's rounding direction and the knapsack's exactness guarantee.
- Zero DB/React dependency, pure and synchronous, matching `warmupSets`'s own signature exactly (no hooks, directly unit-testable).

**Analog for "one resolved function, no re-derivation" discipline:** `apps/mobile/lib/catalog/smart-swap.ts`, `scoreAlternatives` header comment (verified lines immediately above its signature):
```typescript
// Pure: no database handle, no React import, no module-level mutable state, no Date.now(). Takes
// plain arrays and returns a new array, neither mutating nor reordering its inputs — which is what
// makes two concurrent calls for two different targets return the same results as two sequential
// calls, by construction rather than by luck.
export function scoreAlternatives(...) { ... }
```
`resolveInventory(profile, sessionUnavailableSet)` (D-21) must follow this same purity contract verbatim — it is the phase's other central "one named function" abstraction besides the solver.

**`packages/plate-math/package.json`:** mirror `packages/pr-rules/package.json` verbatim (Jest 30 + ts-jest, same `"test": "jest"` script, same TypeScript `^5.9.2` pin) — no new devDependency versions.

---

### `apps/mobile/lib/db/log-set.ts` — wire `equipmentProfileId` at `startSession` call sites (service, CRUD)

**Analog:** the same file — `startSession` already accepts and forwards `equipmentProfileId` (verified lines 8-45):
```typescript
export interface StartSessionInput {
  routineDayId?: string | null;
  cycleId?: string | null;
  equipmentProfileId?: string | null;
  deviceId?: string | null;
  now?: Date;
}

export async function startSession(
  input: StartSessionInput = {},
  db: WriteHandle = getPowerSync(),
): Promise<string> {
  const id = generateClientId();
  // ...
  await db.insert(workoutSession).values({
    id,
    routineDayId: input.routineDayId ?? null,
    cycleId: input.cycleId ?? null,
    equipmentProfileId: input.equipmentProfileId ?? null,
    // ...
  });
}
```
No signature change needed — the gap is purely that zero current call sites (`history.tsx`, `session-lifecycle.ts`, `history-mutations.ts`, `__durability.web.tsx`) pass `equipmentProfileId`. Thread `user_preference.default_equipment_profile_id` (read via the same live-query pattern other screens use for preferences) into each call site.

**Mid-session restamp (D-18):** follow the same `db: WriteHandle = getPowerSync()` optional-injectable-handle convention for a new `restampSessionGym(sessionId, equipmentProfileId, db?)` function, matching `startSession`'s own signature shape and the WriteHandle default-param pattern used throughout `log-set.ts`.

---

### `apps/mobile/lib/catalog/smart-swap.ts` — fill `SwapConstraints` (service, transform)

**Analog:** same file, already-present but unused constraint fields (verified lines 32-36, 179, 193-203):
```typescript
export interface SwapConstraints {
  excludeEquipment?: string[];
  allowEquipment?: string[];
}
// scoreAlternatives(target, candidates, mappings, preferences, userId, constraints) already
// applies constraints.excludeEquipment / constraints.allowEquipment as filters before scoring.
if (
  constraints.excludeEquipment &&
  candidate.equipmentRequired !== null &&
  constraints.excludeEquipment.includes(candidate.equipmentRequired)
) {
  continue;
}
```
No new mechanism — D-22 only requires computing the correct `excludeEquipment`/`allowEquipment` arrays from `resolveInventory`'s output and passing them in at the call site (the Equipment Availability Sheet). **Note:** the file's own comment "Phase 7 owns `equipment_profile.machine_availability`" is stale relative to CONTEXT.md D-22 — correct it while touching this file.

---

### `apps/mobile/app/gym-profiles/index.tsx` (NEW) — list screen (screen/route, request-response)

**Analog:** `apps/mobile/app/programs/library.tsx` — same active-item-pinned-first + alphabetical-rest + collapsed-archived-trailing-section structure (per UI-SPEC E1, "mirrors Program Library's own structure exactly"). Read `programs/library.tsx`'s live-query wiring (PowerSync `useQuery`/`watch` hook usage), row-rendering, and the `•••` overflow trigger pattern; reuse verbatim for `equipment_profile` rows, single-item "Active" partition instead of the active/drafts/ready split.

---

### `apps/mobile/app/gym-profiles/new.tsx` / `edit/[id].tsx` + `GymProfileEditor.tsx` (NEW) — create/edit form (screen + component, CRUD)

**Analog:** `apps/mobile/app/exercises/new.tsx` / `apps/mobile/app/exercises/edit/[id].tsx` — the exact "one shared form component, differing only in initial values and the write call" shape (UI-SPEC explicitly names this pair as the model). Reuse:
- The `new.tsx`/`edit/[id].tsx` split (route owns navigation + initial-values resolution; the shared component owns the form and its local state).
- `TextField`, `SelectField`, `DetailSection` composition already used by the exercise editor form for section layout.
- The `ExerciseSlotRow` stepper anatomy (`-`/`+`, 48×48, floor 0) for the Plates section's count control — locate and copy verbatim rather than reinventing a stepper.
- The dashed-border "+ Add" chip visual language from the Exercise Strip (Phase 5) for "+ Add Weight"/"+ Add Plate"/"+ Add Machine".

---

### `apps/mobile/components/GymProfileActionSheet.tsx` (NEW) — row overflow sheet (component, event-driven)

**Analog:** `apps/mobile/components/RoutineActionSheet.tsx` (full file read, verified lines 1-40+):
```typescript
export interface RoutineAction {
  key: string;
  label: string;
  destructive?: boolean;
}

export function RoutineActionSheet({ programName, actions, onSelect, onCancel }: RoutineActionSheetProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg" contentContainerStyle={{ flexGrow: 1 }}>
        <Text className="text-heading font-semibold text-foreground">{programName}</Text>
        <View className="mt-md gap-xs">
          {actions.map((action) => (
            <Pressable key={action.key} onPress={() => onSelect(action.key)} accessibilityRole="button"
              accessibilityLabel={action.label} style={{ minHeight: 48 }} className="justify-center rounded-md px-md py-sm">
              <Text /* ... */ />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
```
Copy this verbatim — dynamic action list passed in as a prop (never derived inside the sheet), same overlay/ScrollView/max-w-[400px] geometry every sibling sheet uses. `GymProfileActionSheet`'s dynamic rows: `Set Active` (omitted if already active), `Edit`, `Duplicate`, `Archive`/`Restore`.

---

### `apps/mobile/components/ArchiveDialog.tsx` — extend `ArchiveDialogSubject` (component, event-driven)

**Analog:** same file (full file read above). Add `'gym'` to the union and a matching `COPY.gym` entry with `archive`/`unarchive` keys, following the exact `exercise`/`program` shape already present:
```typescript
export type ArchiveDialogSubject = 'exercise' | 'program' /* | 'gym' */;

const COPY = {
  /* exercise: {...}, program: {...}, */
  gym: {
    archive: {
      heading: 'Archive Gym',
      body: 'Archiving removes it from your gym list, but any workouts logged there stay in your history. Archive anyway?',
      confirmLabel: 'Archive',
    },
    unarchive: {
      heading: 'Restore Gym',
      body: 'This gym will reappear in your gym list.',
      confirmLabel: 'Restore',
    },
  },
} as const;
```
No new component — this is the exact extension point the union type exists for, per UI-SPEC's own note.

---

### `apps/mobile/components/PlateStrip.tsx` (NEW) — equipment/plate band (component, transform)

**Analog for the hook-free, props-driven view shape:** `apps/mobile/components/NumericKeypad.tsx`, `NumericKeypadView` (verified lines 70-91):
```typescript
// Hook-free — direct-invocable by a test, matching SetRowView/CycleStripView. Every field value
// display lives in SetRow, not here: this component only ever emits presses and a submit signal.
export function NumericKeypadView({ field, stepAmount, colors, onPress, onSubmit }: NumericKeypadViewProps) {
  return (
    <View className="border-t border-foreground-muted bg-background">
      <View style={{ height: RESERVED_BAND_HEIGHT }} />
      {/* ... */}
    </View>
  );
}
```
`PlateStrip` should follow the same "hook-free where possible, pure function of props" shape: it receives the resolved inventory + current field value already computed upstream (memoized on `(inventory, target)` per D-15's flag), and renders synchronously — never runs the solver itself inside a `useEffect`.

**Mount point (exact target for the Modified file):**
```typescript
const RESERVED_BAND_HEIGHT = 40;
// ...
<View className="border-t border-foreground-muted bg-background">
  {/* R8: an always-rendered, empty layout slot — Phase 6 fills this, Phase 5 leaves it blank. */}
  <View style={{ height: RESERVED_BAND_HEIGHT }} />
  {/* digit grid below, unchanged */}
</View>
```
Replace the empty `<View style={{ height: RESERVED_BAND_HEIGHT }} />` with `<PlateStrip ... />`, whose own internal height defaults to 40 and grows only for a genuine tap target (not-loadable/zero-plates states), per UI-SPEC's documented exception.

---

### `apps/mobile/components/SessionActionSheet.tsx` — add `equipment` row (component, event-driven)

**Analog:** same file, the existing `SESSION_EXERCISE_ACTIONS` constant (verified lines 15-29):
```typescript
export type SessionExerciseActionId = 'swap' | 'remove' | 'reorder' | 'info';

export const SESSION_EXERCISE_ACTIONS: SessionExerciseAction[] = [
  { id: 'swap', label: 'Swap', icon: 'swap-horizontal-outline' },
  { id: 'remove', label: 'Remove', icon: 'trash-outline', destructive: true },
  { id: 'reorder', label: 'Reorder', icon: 'reorder-three-outline' },
  { id: 'info', label: 'Info', icon: 'information-circle-outline' },
];
```
Append (never insert/reorder, per D-06's additive-only rule applied to a UI constant): `{ id: 'equipment', label: 'Equipment', icon: 'construct-outline' }`. Widen `SessionExerciseActionId` to include `'equipment'`. Gate rendering with R11's one shared predicate (same function `PlateStrip` uses to decide collapse-vs-render), never a second independently-computed check.

**Color pattern for a non-destructive glyph:** the file's local `GLYPH_COLORS` resolution (lines 8-13) is the established pattern for a themed icon color outside `ThemeColors` — the `equipment` row uses `foreground` (default), never `destructive`.

---

### `apps/mobile/components/EquipmentAvailabilitySheet.tsx` (NEW) — two-tier action sheet (component, event-driven)

**Analog:** `apps/mobile/components/SessionActionSheet.tsx` for the sheet shell (overlay/ScrollView/max-w-[400px]/rounded-md bg-surface p-lg), plus reuse `SwapSuggestionList.tsx` verbatim for the post-action alternatives transition (per UI-SPEC's explicit instruction — "reuses `SwapSuggestionList` verbatim").

**Asymmetric action-weight pattern:** mirror the Targets sheet's existing "Also update my program" precedent (Phase 5) for the primary/secondary button-weight split — `PrimaryButton` for "Mark Unavailable" (session-scoped, immediate, D-20's default), a lower-weight `text-accent` link for "My gym doesn't have this" (opens an `ArchiveDialog`-shaped confirm before writing through to the profile).

---

### `apps/mobile/components/SwitchGymSheet.tsx` (NEW) — gym list sheet (component, event-driven)

**Analog:** `apps/mobile/components/SessionActionSheet.tsx`'s row-list-in-a-sheet shape (same overlay/ScrollView geometry, same 48×48 row minimum). Active row uses the `text-accent`/`border-accent` treatment — same token `apps/mobile/app/programs/library.tsx`'s active-partition styling and `SelectField`'s selected-chip styling already use for "this is the one in effect."

---

### `apps/mobile/app/(tabs)/workout.tsx` — Session Menu: add Switch Gym row (screen, event-driven)

**Analog:** the same file's existing Menu popover (Phase 5 Amendment A.2: Pause/Resume · Session Note · Discard). Insert `Switch Gym` between Session Note and Discard — Discard stays last and `text-destructive`, matching Amendment A.2's own stated rule that a destructive action is never adjacent to a newly-added benign one. Selecting it closes the menu then opens `SwitchGymSheet` (no confirmation step, D-18 already establishes reversibility).

---

### `apps/mobile/app/(tabs)/profile.tsx` — add "Gyms" section (screen, request-response)

**Analog:** same file, `ToggleRow` (verified lines 21-37) — for row geometry only (border, `bg-surface`, `rounded-md`, 48px minimum), not its toggle behavior:
```typescript
export function ToggleRow({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      className="flex-row items-center justify-between rounded-md border border-foreground-muted bg-surface px-md py-sm"
      style={{ minHeight: 48 }}
    >
      {/* ... */}
    </Pressable>
  );
}
```
The new "Gym Profiles" nav row copies this bordered-surface shape but swaps `accessibilityRole="switch"`/the On/Off pill for `accessibilityRole="link"` (or `"button"`) + a trailing chevron + the active gym's name in muted Label — per UI-SPEC's explicit instruction ("Row geometry matches `ToggleRow`'s existing bordered 48px-minimum surface shape ... just with a chevron instead of a toggle").

---

### `apps/mobile/app/exercise/[id]/index.tsx` (`ExercisePage.tsx`) — `handleSwapPick` db-threading fix (component, event-driven)

**Analog:** the same file's other write helpers for Targets/Note/Reorder, which already thread an injectable `db` handle (WINDOWS #134/#135/#138 precedent). Apply the identical `db ?? getPowerSync()` pattern to `handleSwapPick`'s call to `swapSessionExercise(sessionExerciseId)` so Playwright durability specs exercise the isolated test database rather than the production singleton — this is Pitfall 2 from RESEARCH.md and must land as part of this phase since D-22 is the first phase to exercise Swap end-to-end.

---

### `docs/equipment-profile-shape.md` (NEW) — vocabulary/shape doc (docs)

**Analog:** `docs/catalog-load-types.md`, `docs/program-vocabularies.md`, `docs/session-vocabularies.md` — read one of these for the exact section structure (shape/values table, Postgres enforcement note, SQLite mirror note, extension-point comment) and reproduce it for the three `equipment_profile` JSONB shapes (`available_plates`, `dumbbell_increments_kg`, `machine_availability`).

## Shared Patterns

### Aggregate-root sync push (server_seq + onConflictDoUpdate)
**Source:** `apps/api/src/sync/sync.service.ts`, `'routine'`/`'workout_session'` cases
**Apply to:** `equipment_profile`'s new push-path case — the only new server-side case this phase adds.

### JSONB/vocabulary shape validation gate
**Source:** `packages/api-contracts/src/catalog.ts`, `isCatalogSnapshot`
**Apply to:** all three `equipment_profile` JSONB columns' new validators in `packages/api-contracts/src/equipment.ts`, called from the sync push validator before any write.

### Pure, synchronous, dependency-free domain functions
**Source:** `packages/pr-rules/src/warmup.ts` (`roundToIncrement`, `warmupSets`); `apps/mobile/lib/catalog/smart-swap.ts` (`scoreAlternatives`)
**Apply to:** `packages/plate-math`'s `solvePlateBreakdown`, `roundToAchievable`, `resolveInventory` — no DB handle, no React import, no module-level mutable state, memoized at the call-site layer (per D-15), one definition each (per D-21's explicit "one named function" flag).

### Sheet shell (overlay + ScrollView + max-w-[400px] + rounded-md bg-surface p-lg)
**Source:** `apps/mobile/components/RoutineActionSheet.tsx`, `apps/mobile/components/SessionActionSheet.tsx`, `apps/mobile/components/ArchiveDialog.tsx`
**Apply to:** `GymProfileActionSheet`, `EquipmentAvailabilitySheet`, `SwitchGymSheet` — identical geometry for every new sheet this phase adds; never invent a second modal shell.

### Additive-only fixed-list extension (never insert/reorder)
**Source:** `apps/mobile/components/SessionActionSheet.tsx`'s `SESSION_EXERCISE_ACTIONS`; `packages/api-contracts/src/catalog.ts`'s `EQUIPMENT_TYPES` header comment; D-06
**Apply to:** the new `equipment` action row (append only), any new `EQUIPMENT_TYPES` value this phase needs (append only, no Postgres CHECK — Pitfall 4).

### Optional injectable WriteHandle (`db: WriteHandle = getPowerSync()`)
**Source:** `apps/mobile/lib/db/log-set.ts`, `startSession`
**Apply to:** every new/modified client write helper this phase touches (`restampSessionGym`, `handleSwapPick`'s fix, any new gym-profile write helper) — always accept an optional `db` param defaulting to the production singleton, never hardcode `getPowerSync()` inline inside the function body.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `packages/plate-math/src/solver.ts` (bounded-knapsack search itself) | utility | transform | No existing combinatorial/knapsack solver anywhere in this codebase to pattern-match against; only the surrounding pure-function/module conventions have analogs (see Pattern Assignments above). Implement fresh per D-15's constraints (exact search over small counts), following RESEARCH.md's Architecture Patterns section for the algorithm shape. |
| `apps/mobile/lib/db/session-lifecycle.ts` mid-session restamp function (exact file/function name TBD by planner) | service | CRUD | RESEARCH.md's Assumption A3 flags this file/shape as genuinely unspecified — the closest analog (`startSession`) covers the write pattern but not the "restamp an already-open session" cardinality; planner must confirm exact placement (new function in `log-set.ts` vs. a new file) before implementation. |

## Metadata

**Analog search scope:** `apps/api/src/db/schema/`, `apps/api/src/sync/`, `packages/api-contracts/src/`, `packages/pr-rules/src/`, `apps/mobile/components/`, `apps/mobile/app/`, `apps/mobile/lib/db/`, `apps/mobile/lib/catalog/`
**Files scanned:** ~20 (equipment.ts, preference.ts, session.ts, sync.service.ts, catalog.ts, units.ts, warmup.ts, smart-swap.ts, NumericKeypad.tsx, SessionActionSheet.tsx, ArchiveDialog.tsx, RoutineActionSheet.tsx, profile.tsx, log-set.ts, plus CONTEXT/RESEARCH/UI-SPEC cross-references)
**Pattern extraction date:** 2026-08-27
