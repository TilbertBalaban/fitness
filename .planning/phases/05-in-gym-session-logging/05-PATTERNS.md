# Phase 5: In-Gym Session Logging - Pattern Map

**Mapped:** 2026-08-23
**Files analyzed:** 24
**Analogs found:** 22 / 24

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/mobile/app/(tabs)/workout.tsx` | screen (route) | CRUD + event-driven (timers) | `apps/mobile/app/(tabs)/index.tsx` (Home) | role-match |
| `apps/mobile/app/(tabs)/history.tsx` | screen (route, list) | CRUD | `apps/mobile/app/exercises` catalog list route + `ExercisePickerModal` list pattern | role-match |
| `apps/mobile/app/(tabs)/index.tsx` (extended) | screen (route) | CRUD | itself (existing file, extend in place) | exact |
| `apps/mobile/components/ExerciseStrip.tsx` | component (nav/strip) | CRUD (read local rows) | `apps/mobile/components/CycleStrip.tsx` | exact |
| `apps/mobile/components/SetRow.tsx` | component (form row) | CRUD | `apps/mobile/components/ExercisePickerModal.tsx`'s hook-free `*View` split (no direct row analog; closest structural precedent) | role-match |
| `apps/mobile/components/NumericKeypad.tsx` | component (input) | event-driven | none close — net-new interaction shape | no analog |
| `apps/mobile/components/RestTimerBar.tsx` | component (header widget) | event-driven (wall-clock recompute) | `apps/mobile/components/CycleStrip.tsx` (hook-free View + stateful wrapper split only, not visual) | partial |
| `apps/mobile/components/RestTimerFullScreen.tsx` | component (modal/route) | event-driven | none close | no analog |
| `apps/mobile/components/WorkoutSummary.tsx` | component (aggregate view) | CRUD (read, aggregate) | `apps/mobile/lib/db/programs/next-up-query.ts` (query-shape precedent, not a component) | partial |
| `apps/mobile/components/WorkoutInProgressBanner.tsx` | component (conditional card) | CRUD (conditional read) | `apps/mobile/app/(tabs)/index.tsx`'s "Next Up" card rendering block | role-match |
| `apps/mobile/components/SessionActionSheet.tsx` | component (action sheet) | event-driven | `RoutineActionSheet` (Phase 4, referenced in UI-SPEC, not read this pass — same directory) | role-match (by spec reference) |
| `apps/mobile/lib/db/log-set.ts` (extended) | service (db write) | CRUD | itself (existing file, extend in place) | exact |
| `apps/mobile/lib/db/session-query.ts` | service (db read) | CRUD (batched, N+1-safe) | `apps/mobile/lib/db/programs/next-up-query.ts` | exact |
| `apps/mobile/lib/db/personal-record.ts` | service (db write) | CRUD | `apps/mobile/lib/db/log-set.ts` (`logSet`'s insert shape) | exact |
| `apps/mobile/lib/rest-timer.ts` | utility (pure) | transform | `apps/mobile/lib/programs/next-up.ts` (pure, no-db, no-clock contract) | exact |
| `apps/mobile/lib/rest-timer.web.ts` | utility (platform sibling) | event-driven | `docs/platform-modules.md`'s `.web.tsx` convention (not read this pass; cited directly by CONTEXT/RESEARCH) | role-match |
| `apps/mobile/lib/rest-timer.native.ts` | utility (platform sibling) | event-driven | same as above | role-match |
| `apps/mobile/lib/keep-awake.web.ts` | utility (platform sibling) | event-driven | same `.web.tsx` convention | role-match |
| `packages/pr-rules/src/personal-records.ts` | service (pure logic) | transform | `apps/mobile/lib/programs/next-up.ts` (pure, arguments-in, no ambient state) | exact |
| `packages/pr-rules/src/estimated-1rm.ts` | utility (pure) | transform | `apps/mobile/lib/programs/next-up.ts` | exact |
| `packages/pr-rules/src/warmup.ts` | utility (pure) | transform | `apps/mobile/lib/programs/next-up.ts` | exact |
| `packages/pr-rules/package.json` + `tsconfig.json` | config | — | `packages/progression-engine/package.json` + `tsconfig.json` | exact |
| `apps/api/src/sync/sync.service.ts` (extended: `personal_record` wiring) | service (sync apply path) | event-driven (batched CRUD apply) | itself — `toUserExercisePreferenceValues`/`SINGLETON_ROOT_TYPES` block (existing file, extend in place) | exact |
| `apps/api/src/db/schema/session.ts` (extended: notes, pause, status CHECK) / `records.ts` (PR CHECK) | model (Drizzle schema) | CRUD | itself — existing CHECK-constraint precedent (`routine_status_check`, `routine_cycle_kind_check`, not shown in `session.ts`/`records.ts` excerpts read but referenced in RESEARCH.md) | exact |

## Pattern Assignments

### `apps/mobile/components/ExerciseStrip.tsx` (component, CRUD-read)

**Analog:** `apps/mobile/components/CycleStrip.tsx` (156 lines, read in full)

**Imports pattern** (lines 1-4):
```typescript
import Ionicons from '@expo/vector-icons/Ionicons';
import type { CycleKind } from '@fitness/api-contracts';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';
```

**Core pattern — hook-free `*View` + thin stateful wrapper split** (lines 56-156):
```typescript
export interface CycleStripViewProps {
  cycles: CycleStripCycle[];
  selectedCycleId: string | null;
  colors: ThemeColors;
  onSelectCycle: (cycleId: string) => void;
  onAddCycle: () => void;
  onEditCycle: (cycleId: string) => void;
}

// Hook-free — direct-invocable by a test, matching the ExerciseSlotRowView/DayDeckView split. Owns
// no database call and performs no write: selecting a cycle is view state, and a selection that
// mutated rows would rewrite the program by browsing it.
export function CycleStripView({ cycles, selectedCycleId, colors, onSelectCycle, onAddCycle, onEditCycle }: CycleStripViewProps) {
  if (cycles.length === 0) return null; // "Absent, not empty" rule
  // ... ScrollView horizontal, Pressable per chip, minWidth/minHeight: 48 hit target
}

export function CycleStrip(props: CycleStripProps) {
  const colors = useThemeColors();
  return <CycleStripView {...props} colors={colors} />;
}
```

**Chip tone/selection derivation as pure functions, exported for tests** (lines 33-54):
```typescript
export interface CycleChipTone {
  icon: CycleChipIcon | null;
  borderStyle: 'solid' | 'dashed';
  selectionIndicator: 'accent-border' | 'muted-underline';
  opacity: number;
}
const TONES: Record<CycleKind, CycleChipTone> = { /* ... */ };
export function cycleChipTone(kind: CycleKind): CycleChipTone {
  return TONES[kind];
}
```
`ExerciseStrip` should follow this exact shape: a pure `chipTone`/`chipLabel`-style helper for current/completed/in-progress states (05-UI-SPEC.md §Exercise Strip chip anatomy — border-accent/bg-surface current, border-foreground-muted/bg-secondary completed with a checkmark glyph replacing the fraction, border-foreground-muted/bg-surface in-progress), a hook-free `ExerciseStripView`, and a thin `ExerciseStrip` wrapper resolving `useThemeColors()`. The 48×48 minimum hit target and horizontal-scroll-never-wrap rule carry over unchanged. Add the trailing dashed `+` "Add Exercise" chip as a fourth Pressable following the same `Add Cycle`/`Edit Cycle` trailing-pressable pattern (lines 120-140).

---

### `apps/mobile/app/(tabs)/workout.tsx` (screen route, session-mode dispatch)

**Analog:** `apps/mobile/components/DayDeck.tsx` (101 lines, read in full) for the pager, plus `apps/mobile/app/(tabs)/index.tsx` (lines 1-80 read) for the screen-state-derivation pattern.

**Pager core pattern** (`DayDeck.tsx` lines 44-101):
```typescript
export function clampDeckIndex(index: number, dayCount: number): number {
  if (dayCount <= 0) return 0;
  if (index < 0) return 0;
  if (index > dayCount - 1) return dayCount - 1;
  return index;
}

export function DayDeckView<T extends DayDeckDay>({ days, index, onIndexChange, renderDay, width }: DayDeckViewProps<T>) {
  // ... TabView navigationState={{ index: safeIndex, routes }} swipeEnabled renderTabBar={() => null}
}

export function DayDeck<T extends DayDeckDay>({ days, renderDay }: DayDeckProps<T>) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex((current) => clampDeckIndex(current, days.length));
  }, [days.length]);
  return <DayDeckView days={days} index={clampDeckIndex(index, days.length)} onIndexChange={setIndex} renderDay={renderDay} width={width} />;
}
```
This is the exact reuse target D-11 names — `ExercisePager` (or reused `DayDeck` directly, parameterized on `session_exercise` rows instead of days) should copy `clampDeckIndex` verbatim: a deleted/removed exercise mid-session must not throw or blank the pager, same as a deleted program day today.

**Screen-state derivation pattern** (`index.tsx` lines 14-26):
```typescript
export type HomeScreenState = 'error' | 'loading' | 'no-program' | 'ready';

export interface HomeScreenStateInput {
  failed: boolean;
  data: { routine: unknown } | null;
}

export function deriveHomeScreenState({ failed, data }: HomeScreenStateInput): HomeScreenState {
  if (failed) return 'error';
  if (data === null) return 'loading';
  if (data.routine === null) return 'no-program';
  return 'ready';
}
```
Copy this shape for `workout.tsx`'s own `WorkoutScreenState` (`'error' | 'loading' | 'no-session-no-program' | 'ready'`) — a pure derivation function taking `{ failed, data }`, testable with no renderer, matching the "no renderer installed" constraint from RESEARCH.md's Validation Architecture section.

**D-32's `SessionScreenMode` context** has no existing analog in this codebase (net-new pattern) — RESEARCH.md's own code shows the intended shape: a single typed value (`'live' | 'editing' | 'summary-correction'`) provided once at the screen root via React context, gating every timer-scheduling and auto-advance call site. Model it as a small `SessionModeContext` alongside the screen file, not inside a shared component, since it is this screen's own concern.

---

### `apps/mobile/lib/db/session-query.ts` (service, batched CRUD read)

**Analog:** `apps/mobile/lib/db/programs/next-up-query.ts` (97 lines, read in full) — the house "one select per table, assembled in memory" pattern RESEARCH.md §7 explicitly names as the model to follow.

**Imports pattern** (lines 1-7):
```typescript
import { and, eq, isNotNull } from 'drizzle-orm';
import { captureCalendarDay } from '../../calendar-day';
import type { SessionRecord } from '../../programs/next-up';
import { getPowerSync, type WriteDb } from '../powersync';
import { exerciseMuscleMapping, muscleGroup, routine, workoutSession } from '../schema';
import { loadActiveRoutineId, resolveLiveRoutineId } from './lifecycle';
import { loadProgramTree, type ProgramCycle, type ProgramDay } from './load-program';
```

**Core pattern — sequential selects, assembled in-memory, early-return on empty state** (lines 37-97):
```typescript
export async function loadNextUp(userId: string | null, db: WriteDb = getPowerSync()): Promise<NextUpData> {
  const today = captureCalendarDay(new Date()).localDate;
  if (!userId) return { ...EMPTY, today };           // cheap early-out — costs zero queries
  const activeRoutineId = await loadActiveRoutineId(userId, db);
  if (!activeRoutineId) return { ...EMPTY, today };
  // ...
  const history = await db.select({ /* narrow column set */ }).from(workoutSession).where(and(/* ... */));
  const mappings = await db.select({ /* ... */ }).from(exerciseMuscleMapping);
  const groups = await db.select({ /* ... */ }).from(muscleGroup);
  // joined/assembled in a plain JS Map/object here, never a second query per row
  return { /* ... */ };
}
```
The live workout screen's 4-select shape (session row, `session_exercise` rows, batched `logged_set` rows via `inArray`, batched `exercise` metadata via `inArray`) and the History list's grouped-aggregate query (RESEARCH.md §7) both follow this exact discipline: narrow `select({...})` column projections, `WHERE ... IN (...)` batched lookups fed from a prior query's ids, never a query inside a loop. `loadNextUp`'s "cost nothing on the empty path" early-return is also the direct precedent for D-28's "the banner's presence must not cost a query on the common no-session path" requirement.

---

### `apps/mobile/lib/db/log-set.ts` (extended — service, CRUD write)

**Analog:** itself (171 lines, read in full) — this file is extended, not replaced.

**Imports pattern** (lines 1-7):
```typescript
import { and, eq, sql } from 'drizzle-orm';
import * as unitsContract from '@fitness/api-contracts';
import { EMPTY_TARGET, resolveTarget, type ResolvedTarget } from '@fitness/api-contracts';
import { captureCalendarDay } from '../calendar-day';
import { generateClientId } from './id';
import { getPowerSync, type WriteDb } from './powersync';
import { loggedSet, routineExercise, routineExerciseCycleTarget, sessionExercise, workoutSession } from './schema';
```

**Durable-write-and-return pattern, no batching** (lines 142-171):
```typescript
// Writes the row and returns — no network call, no batching, no deferral to a finish action. A
// set that only becomes durable when the workout is finished is a set lost to a force-quit.
export async function logSet(input: LogSetInput, db: WriteDb = getPowerSync()): Promise<string> {
  const id = generateClientId();
  const [maxRow] = await db.select({ maxIndex: sql<number | null>`max(${loggedSet.setIndex})` })
    .from(loggedSet).where(eq(loggedSet.sessionExerciseId, input.sessionExerciseId));
  const setIndex = (maxRow?.maxIndex ?? 0) + 1;
  const weightKg = unitsContract.toCanonicalKg(input.weight.value, input.weight.unit);
  await db.insert(loggedSet).values({ id, sessionExerciseId: input.sessionExerciseId, setIndex, setType: input.setType ?? 'normal', weightKg, reps: input.reps, rir: input.rir ?? null, /* ... */ completed: input.completed ?? false, loggedAt: (input.now ?? new Date()).toISOString() });
  return id;
}
```

**Timezone/local_date single-writer pattern** (lines 16-24) — the exact precedent D-33's `setSessionDate` must extend, not duplicate:
```typescript
// Stamps timezone and local_date once, here, from the device's IANA zone (LOG-22) — nothing else
// in this codebase ever writes those two columns, and no read path recomputes them (PITFALLS §12).
export async function startSession(input: StartSessionInput = {}, db: WriteDb = getPowerSync()): Promise<string> {
  const id = generateClientId();
  const startedAt = input.now ?? new Date();
  const { timezone, localDate } = captureCalendarDay(startedAt);
  await db.insert(workoutSession).values({ id, /* ... */ startedAt: startedAt.toISOString(), status: 'in_progress', timezone, localDate });
  return id;
}
```
Extend `logSet` for notes/warm-up `set_type`/`rest_taken_seconds` writes and `startSession`/`addSessionExercise` for D-33's date param exactly in place — do not fork a second write path. `apps/mobile/lib/db/personal-record.ts`'s `logPersonalRecord()` should mirror `logSet`'s insert shape 1:1 (generate id, insert, return id — no read-modify-write).

---

### `apps/mobile/lib/rest-timer.ts` / `packages/pr-rules/src/*.ts` (pure logic modules)

**Analog:** `apps/mobile/lib/programs/next-up.ts` (171 lines, read in full) — RESEARCH.md and CONTEXT.md both name this file directly as "the model for how this phase's pure logic (PR rules, warm-up scaling, 1RM estimation) should be shaped."

**Contract header comment pattern** (lines 1-9):
```typescript
// D-20: where you are in the program is derived from logged history at read time, never stored as
// a cursor. This module is the whole derivation, and it is pure — no database, no React, and no
// clock read of any kind. `today` arrives as an argument so every calendar boundary below is a
// unit test rather than a fixture.
```

**Pure-function-with-explicit-clock-argument pattern** (lines 34-40, 111-117):
```typescript
export interface ResolveNextUpInput<D extends PositionDay, C extends PositionCycle> {
  routine: { id: string } | null;
  days: D[];
  cycles: C[];
  history: SessionRecord[];
  today: string;                 // clock/date arrives as an argument, never Date.now() inside
}

export function resolveNextUp<D extends PositionDay, C extends PositionCycle>({ routine, days, cycles, history, today }: ResolveNextUpInput<D, C>): NextUp<D, C> {
  if (!routine) return { kind: 'no-active-program' };
  // ... pure arithmetic only, no ambient state
}
```

**Exact pattern already sketched in RESEARCH.md, matching this file's shape:**
```typescript
// apps/mobile/lib/rest-timer.ts — pure, testable without a notification library at all
export function remainingSeconds(targetTimestampMs: number, nowMs: number = Date.now()): number {
  return Math.max(0, Math.round((targetTimestampMs - nowMs) / 1000));
}
```
`packages/pr-rules/src/personal-records.ts`'s `detectPrs(candidate, priorBest)` and `warmup.ts`'s `warmupSets(workingWeightKg, roundingIncrementKg)` must follow this identical shape: arguments in, no database call, no `Date.now()` read except as a defaulted-but-overridable parameter, every boundary condition a plain unit test.

---

### `packages/pr-rules/` package scaffold (config)

**Analog:** `packages/progression-engine/package.json` + `tsconfig.json` (both read in full — 5-line `index.ts`, currently near-empty, the explicit precedent D-30/RESEARCH §10 cites).

```json
{
  "name": "@fitness/progression-engine",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": { "build": "tsc", "typecheck": "tsc --noEmit" },
  "devDependencies": { "typescript": "^5.9.2" }
}
```
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "CommonJS", "moduleResolution": "Node",
    "lib": ["ES2022"], "strict": true, "declaration": true, "outDir": "dist", "rootDir": "src",
    "esModuleInterop": true, "skipLibCheck": true, "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"]
}
```
Copy both files verbatim for `packages/pr-rules/`, renaming only the package name. This package currently has no test runner configured (`progression-engine` has none either) — RESEARCH.md's Wave 0 Gaps table expects a `src/__tests__/*.test.ts` scaffold; confirm which test runner the monorepo root wires for `packages/*` (likely Jest via a root config, not per-package) before assuming one needs adding here.

---

### `apps/api/src/sync/sync.service.ts` (extended — `personal_record` apply path)

**Analog:** itself (1768 lines total; relevant sections read at lines 60-240, 380-450) — extend the existing `SINGLETON_ROOT_TYPES` pattern (`exercise`/`user_exercise_preference`/`user_preference`), not the `AGGREGATE_ROOT_TYPES` pattern (`workout_session`/`routine`), since `personal_record` has no synced children (confirmed in RESEARCH.md §6).

**TABLE_MAP / SINGLETON_ROOT_TYPES / ROOT_TABLE_BY_TYPE / AGGREGATE_RANK, the four places a new singleton root must be added** (lines 65-174):
```typescript
const TABLE_MAP = {
  workout_session: workoutSession,
  // ...
  routine_exercise_cycle_target: routineExerciseCycleTarget,
} as const;

const SINGLETON_ROOT_TYPES = new Set<string>(['exercise', 'user_exercise_preference', 'user_preference']);

const ROOT_TABLE_BY_TYPE = {
  workout_session: workoutSession,
  routine: routine,
  exercise: exercise,
  user_exercise_preference: userExercisePreference,
  user_preference: userPreference,
} as const;

const AGGREGATE_RANK: Record<MappedTable, number> = {
  workout_session: 0,
  // ...
  user_preference: 0,
  routine_exercise_cycle_target: 3,
};
```
`personal_record` must be added to all four: `TABLE_MAP`, `SINGLETON_ROOT_TYPES`, `ROOT_TABLE_BY_TYPE`, `AGGREGATE_RANK` (rank 0, alongside the other singletons).

**Ownership function pattern — `userId` always from the authenticated session, never from payload data** (lines 406-431, `toUserExercisePreferenceValues`, the exact precedent to mirror for `toPersonalRecordValues`):
```typescript
// userId always comes from the authenticated session argument, never from data — a PUT naming
// another user's user_id in its payload is stored against the pusher's own id regardless
// (T-03-02/T-03-13).
function toUserExercisePreferenceValues(
  id: string,
  userId: string,
  data: Record<string, unknown> | null | undefined,
  storedExerciseId?: string,
): UserExercisePreferenceValues {
  const d = (data ?? {}) as UserExercisePreferenceOpData;
  return {
    id,
    userId,
    exerciseId: storedExerciseId ?? d.exercise_id ?? '',
    archivedAt: d.archived_at ? new Date(d.archived_at) : null,
    neverSuggest: d.never_suggest ?? false,
    updatedAt: d.updated_at ? new Date(d.updated_at) : new Date(),
  };
}
```
`toPersonalRecordValues(id, userId, data)` should follow this exact shape — plain object mapping snake_case op data to camelCase Drizzle values, `userId` as a hard function argument never read from `data.user_id`.

**Closed-vocabulary validation pattern** (lines 176-186, 654-672 — `SESSION_STATUSES`/`SET_TYPES` and their `hasInvalidField` checks):
```typescript
const SESSION_STATUSES = new Set(['in_progress', 'completed', 'discarded']);
const SET_TYPES = new Set(['normal', 'warmup', 'drop', 'myorep', 'partial', 'failure', 'amrap']);
// ...
if (data.status !== undefined && !(typeof data.status === 'string' && SESSION_STATUSES.has(data.status))) { /* invalid */ }
if (data.set_type !== undefined && !(typeof data.set_type === 'string' && SET_TYPES.has(data.set_type))) { /* invalid */ }
```
Add a `PR_TYPES = new Set(['heaviest_weight', 'best_e1rm', 'most_reps_at_weight', 'best_set_volume'])` following this exact shape, plus a `hasInvalidField` branch for `personal_record` validating `pr_type` against it and `value` via the existing `isNonNegativeDecimalOrNull` helper (line 568, already used for `weight_kg`) — reuse it directly, do not write a second decimal validator.

**D-09 vocabulary-promotion precedent** (lines 176-186 comment): `SESSION_STATUSES`/`SET_TYPES` are currently retyped literal `Set`s rather than built from `packages/api-contracts` tuples — contrast with `LOAD_TYPES`/`ROUTINE_STATUSES` etc. (lines 181-186) which ARE built from shared tuples:
```typescript
// Built from the shared @fitness/api-contracts tuples, never retyped literals, so the
// client-facing invalid_field rejection and the Postgres CHECK constraint can never drift apart.
const LOAD_TYPES = new Set<string>(LOAD_TYPE_TUPLE);
const ROUTINE_STATUSES = new Set<string>(ROUTINE_STATUS_TUPLE);
```
This phase's job (RESEARCH.md §1/§2) is to promote `SESSION_STATUSES`/`SET_TYPES`/new `PR_TYPES` to this same tuple-sourced shape — export the tuples from `packages/api-contracts` first, then rebuild these three `Set`s from them, matching `LOAD_TYPES`'s pattern exactly.

---

### `apps/api/src/db/schema/session.ts` / `records.ts` (model, Drizzle schema)

**Analog:** itself — both files read in full (133 and 79 lines).

**Column definition + explanatory-comment pattern** (`session.ts` lines 24-46, `records.ts` lines 7-27):
```typescript
export const workoutSession = pgTable(
  'workout_session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    routineDayId: text('routine_day_id'),
    startedAt: timestamp('started_at').notNull(),
    status: text('status').notNull(),
    timezone: text('timezone').notNull(),
    localDate: date('local_date').notNull(),
    serverSeq: bigint('server_seq', { mode: 'number' }).notNull().default(sql`nextval('sync_seq')`),
  },
  (table) => [index('workout_session_userId_idx').on(table.userId)],
);
```
```typescript
export const personalRecord = pgTable(
  'personal_record',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id').notNull().references(() => exercise.id),
    prType: text('pr_type').notNull(),
    value: numeric('value', { precision: 10, scale: 3 }).notNull(),
    loggedSetId: text('logged_set_id').references(() => loggedSet.id),
    achievedAt: timestamp('achieved_at').notNull(),
    reconciledAt: timestamp('reconciled_at'),
    serverSeq: bigint('server_seq', { mode: 'number' }).notNull().default(sql`nextval('sync_seq')`),
  },
  (table) => [index('personal_record_userId_idx').on(table.userId)],
);
```
Add `notes: text('notes')` (nullable) to `logged_set`, `session_exercise`, `workout_session`; add `pausedAt: timestamp('paused_at')` and `accumulatedPausedSeconds: integer('accumulated_paused_seconds').notNull().default(0)` to `workout_session`, following the exact column-definition style (snake_case DB name via `text()`/`timestamp()`/`integer()`, camelCase JS key, inline comment explaining any non-obvious constraint — see the `weightKg`/`setIndex` comments at `session.ts` lines 95-101 for the comment density expected). CHECK constraints (`routine_status_check`-style, referenced but not directly read this pass) live in the same file's `pgTable` third argument array alongside the existing `index(...)` entries — locate the actual `routine_status_check` definition in `apps/api/src/db/schema/program.ts` or similar before writing the new `workout_session_status_check`/`logged_set_set_type_check`/`personal_record_pr_type_check` constraints, to match its exact Drizzle `check()` call shape.

---

## Shared Patterns

### Hook-free `*View` + thin stateful wrapper (mandatory, no-renderer constraint)
**Source:** `apps/mobile/components/CycleStrip.tsx` (`CycleStripView`/`CycleStrip`), `apps/mobile/components/DayDeck.tsx` (`DayDeckView`/`DayDeck`)
**Apply to:** every new component in this phase — `ExerciseStrip`, `SetRow`, `NumericKeypad`, `RestTimerBar`, `RestTimerFullScreen`, `WorkoutSummary`, `SessionActionSheet`, `WorkoutInProgressBanner`. RESEARCH.md's Validation Architecture section states this explicitly: `apps/mobile` has no `@testing-library/react-native`/`react-test-renderer` installed, so every screen's rendering logic must be extractable into a pure function taking plain props, directly invocable from Jest with no renderer. Naming convention: `XView` for the pure function, bare `X` for the hook-owning wrapper.
```typescript
export function CycleStripView({ cycles, selectedCycleId, colors, onSelectCycle, /* ...plain props, no hooks */ }: CycleStripViewProps) { /* ... */ }
export function CycleStrip(props: CycleStripProps) {
  const colors = useThemeColors();
  return <CycleStripView {...props} colors={colors} />;
}
```

### Pure logic modules — arguments in, no ambient state, clock as an overridable parameter
**Source:** `apps/mobile/lib/programs/next-up.ts` (entire file)
**Apply to:** `apps/mobile/lib/rest-timer.ts`, all of `packages/pr-rules/src/*.ts`. No database read, no `useThemeColors()`, no bare `Date.now()`/`new Date()` inside the function body — `now`/`today` arrive as a defaulted argument so every boundary is a fixture-free unit test, matching `resolveNextUp`'s `today: string` input and RESEARCH.md's own `remainingSeconds(targetTimestampMs, nowMs = Date.now())` sketch.

### `.web.tsx`/`.web.ts` platform-divergence sibling (D-08, mandatory — no `Platform.OS` branches)
**Source:** `docs/platform-modules.md` (cited directly by CONTEXT.md/RESEARCH.md, not re-read this pass — treat its convention as binding per D-08)
**Apply to:** `apps/mobile/lib/rest-timer.web.ts` / `rest-timer.native.ts` (or a guarded `.ts` per D-08's stated exception note), `apps/mobile/lib/keep-awake.web.ts`. A shared `.ts` entry point re-exports the platform file Metro/webpack resolves at build time; never an `if (Platform.OS === 'web')` branch at a call site.

### Durable-write-on-entry, no draft buffer (D-01, mandatory)
**Source:** `apps/mobile/lib/db/log-set.ts`'s `logSet()` (lines 142-171)
**Apply to:** every new write this phase performs — `personal-record.ts`'s `logPersonalRecord()`, warm-up row materialization (writes real `logged_set` rows via `logSet()` itself, `completed: false`), notes/pause-state PATCHes. No file in this phase may introduce an in-memory array committed on a "finish"/"save" action.

### Ownership resolution — `userId` from session, never from client payload (security-critical, mandatory)
**Source:** `apps/api/src/sync/sync.service.ts`, comment above `toUserExercisePreferenceValues` (lines 406-408) and identical comment above `toExerciseValues` (lines 380-383)
**Apply to:** the new `toPersonalRecordValues(id, userId, data)` function — `userId` is a hard function parameter sourced from `req.user.id` upstream, never read from `op.data.user_id`, matching every existing `to*Values` function in this file without exception.

### Closed-vocabulary validation, Set-from-shared-tuple (D-09, mandatory)
**Source:** `apps/api/src/sync/sync.service.ts` lines 176-186 (`SESSION_STATUSES`/`SET_TYPES` vs. `LOAD_TYPES`/`ROUTINE_STATUSES`)
**Apply to:** `PR_TYPES`, the promoted `SESSION_STATUSES` (adding `'paused'`), the promoted `SET_TYPES` (already anticipates Phase 7's values, just needs tuple export + CHECK constraint). Export the tuple from `packages/api-contracts` first; build both the server-side `Set` and the Postgres `CHECK` constraint from the same exported list so they cannot drift.

### Snapshot-on-use, single-writer for derived/frozen fields (D-02/D-06/D-33, mandatory)
**Source:** `apps/mobile/lib/db/log-set.ts`'s `resolvePrescriptionForCycle`/`addSessionExercise` (copies prescription once, never re-reads) and `startSession`'s `captureCalendarDay` call (stamps timezone/local_date once)
**Apply to:** D-33's new `setSessionDate` function — the ONLY other place in the codebase permitted to write `timezone`/`local_date` after session creation. Follow `startSession`'s exact call to `captureCalendarDay`, do not reimplement the timezone-capture logic inline.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `apps/mobile/components/NumericKeypad.tsx` | component (input) | event-driven | No existing component in this codebase implements a non-native-focusable custom input surface; this is a genuinely new interaction primitive (D-20/RESEARCH §12). Build from the UI-SPEC's explicit layout spec (reserved band, 3×4 digit grid, stepper row, next/submit arrow) and the hook-free `*View` shared pattern above — there is no shortcut analog to copy the input-handling core from. |
| `apps/mobile/components/RestTimerFullScreen.tsx` | component (modal/route) | event-driven | No existing full-screen modal-over-timer surface exists in Phases 1-4. Closest structural precedent is any existing modal route under `apps/mobile/app/` for the dismiss-button/route-shape convention only — worth a quick `Glob` for `apps/mobile/app/**/*.tsx` modal routes during planning, not found in this pass's scope. |

## Metadata

**Analog search scope:** `apps/mobile/components/`, `apps/mobile/app/(tabs)/`, `apps/mobile/lib/db/`, `apps/mobile/lib/programs/`, `apps/api/src/sync/`, `apps/api/src/db/schema/`, `packages/progression-engine/`
**Files scanned:** 13 read in full or targeted sections (CycleStrip.tsx, DayDeck.tsx, log-set.ts, next-up.ts, next-up-query.ts, sync.service.ts [~250 lines across 2 targeted reads], session.ts, records.ts, progression-engine package.json/tsconfig.json, ExercisePickerModal.tsx [partial], index.tsx [partial])
**Pattern extraction date:** 2026-08-23
