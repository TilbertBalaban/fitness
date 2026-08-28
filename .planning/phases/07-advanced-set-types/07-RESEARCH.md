# Phase 7: Advanced Set Types - Research

**Researched:** 2026-08-28
**Domain:** Client-only feature extension on an already-shipped schema — grouped sub-entries, session-scoped supersets, and per-side logging inside a React Native + React Native Web session-logging screen
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carried forward — already locked, do not re-litigate:**
- **CF-01:** Every column this phase needs already ships. `logged_set` has `set_type` (not null),
  `parent_set_id` (self-referencing FK), `side`, `completed` and `rest_taken_seconds`;
  `session_exercise` has `superset_group_id`. All are declared in `apps/api/src/db/schema/session.ts`
  and mirrored in `apps/mobile/lib/db/schema.ts`. `sync.service.ts` already validates all seven
  `set_type` literals and the shape-completeness fields, and `apps/api/test/poison-pill.e2e-spec.ts`
  already pins `completed`/`side`/`parent_set_id`/`rest_taken_seconds` against malformed writes.
  `apps/api/test/schema-parity.e2e-spec.ts` verifies the live database against the schema file.
  This phase fills these columns in; it does not add them. — Reversibility: n/a.
- **CF-02:** `SET_TYPES` is closed, additive-only, and already names this phase.
  `packages/api-contracts/src/session.ts` publishes
  `['normal','warmup','drop','myorep','partial','failure','amrap']`, enforced by the
  `logged_set_set_type_check` Postgres CHECK. Do not add an eighth type, do not reorder, do not
  insert. — Reversibility: one-way.
- **CF-03:** Grouping is annotation, never a different storage shape. `set_index` stays strictly
  incrementing and never fractional ("1, 2, 3, 3a, 3b becomes 1, 2, 3, 4, 5"). Sub-entry display is
  decided in UI-SPEC.md; sub-entry storage is not open. — Reversibility: one-way.
- **CF-04:** The set-number tap target is already built and currently unused. `SetRow.tsx` renders a
  `Pressable` with `accessibilityLabel="Set {setIndex} type"` that wires only `onLongPress` (the note
  trigger). SETS-01 is waiting on its `onPress` — do not introduce a second tap target.
- **CF-05:** Weights are canonical kg, converted only at the display boundary. `SetRow` renders, it
  never converts. — Reversibility: one-way.
- **CF-06:** Snapshot-on-use — anything a session's behaviour depends on is frozen onto the session
  row at start and never re-read from the source.
- **CF-07:** Client-generated UUIDs, aggregate-root ownership, PowerSync as sole ingress. `logged_set`
  and `session_exercise` are children of `workout_session` — no `user_id`, no `server_seq`. A new
  child row this phase writes inherits that and needs no sync-rules change.
- **CF-08:** Manual entry is never fought and never rewritten. A value the lifter typed is logged
  exactly as typed; D-22 applies it to per-side mode.
- **CF-09:** Vocabularies live in `packages/api-contracts/`, additive-only, with a Postgres CHECK and
  the same values on the SQLite side.
- **CF-10:** Platform divergence is a `.web.tsx` sibling, never a `Platform.OS` branch. No Xcode or
  Android SDK on this machine — native claims rest on typecheck; web is the proving ground.

**A. Set-type switcher**
- **D-01:** Tapping a set number opens a bottom sheet listing the set types; you pick one and it
  closes. Rejected: inline cycle-through, anchored popover.
- **D-02:** A non-normal set is marked by extending the existing warm-up badge with a per-type glyph
  (`W / D / M / P / F / A`), not a new row element. Rejected: replacing the set number, badge-plus-
  text-label.
- **D-03:** A set's type stays editable after the checkmark is ticked.
- **D-04:** Partial reps (SETS-05) are a sub-entry attached to a parent set, not a standalone row and
  not a new column. Reversibility: costly (migration + backfill if changed later).

**B. Grouping**
- **D-05:** `parent_set_id` is the single grouping mechanism for all four features — drop sets,
  myoreps, partials and per-side logging. One renderer, one add-control, one delete rule, one
  counting rule. — Reversibility: one-way.
- **D-06:** Children render indented beneath a parent that keeps its own set number.
- **D-07:** A parent row is always a real set — there are no empty container parents, ever.
- **D-08:** The next mini-set is added by an explicit `+` control on the group, revealed once a
  sub-entry is completed.
- **D-09:** Switching a set that has children back to `normal` shows a confirm dialog naming how
  many sub-entries will be lost, then deletes them.
- **D-10:** The counting rule, one rule for all four features: a parent row is one set toward the
  prescription; children add volume but never increment the set count. — Reversibility: one-way.

**C. Supersets**
- **D-11:** A superset is formed and dissolved from the per-exercise action sheet — add `'superset'`
  and `'detach-superset'` to `SessionExerciseActionId`.
- **D-12:** The pager keeps two separate exercise pages. Pairing is shown as a link badge/chip, not a
  merged page.
- **D-13:** Rest is suppressed on every non-final member of a superset group and starts only when a
  set of the final member (highest `order_index` in the group) is completed. — Reversibility:
  reversible (one condition at the rest-start call site).
- **D-14:** Completing a set on a non-final superset member advances to the next member, gated by the
  existing auto-advance preference.
- **D-15:** The UI forms pairs, but every read path must treat `superset_group_id` as a group id of N
  adjacent members and never assume exactly two.
- **D-16:** Session-only. `routine_exercise.superset_group_id` stays null. Program-level authoring is
  deferred.

**D. Counting — volume and records**
- **D-17:** One named predicate replaces the four scattered `!== 'warmup'` filters:
  `countsTowardWorkingVolume(setType)` in `packages/api-contracts/src/session.ts`. `warmup` is the
  only excluded type. — Reversibility: reversible.
- **D-18:** A second predicate, `countsTowardRecords(setType)`, excludes `warmup` AND `partial`.
- **D-19:** `shouldAutoAdvance` must additionally filter to parent rows (`parentSetId === null`).

**E. Per-side logging**
- **D-20:** A per-side set is a parent carrying `side = 'left'` and one child carrying
  `side = 'right'`. No empty container parent, no positional pairing. Counts as ONE set toward the
  prescription per D-10.
- **D-21:** Per-side is a per-exercise mode, derived from data — no new column and no migration. An
  exercise is in per-side mode when any of its sets carries a non-null `side`.
- **D-22:** Toggling per-side governs newly created sets only; already-logged single-sided sets are
  never retroactively rewritten.

**UI Design Contract (from 07-UI-SPEC.md, already approved):** the full anatomy of
`SetTypePickerSheet` (seven fixed rows in `SET_TYPES` order, active-row semibold+checkmark, the
per-row behavior table distinguishing retype-rows from insert-child-rows), `ChangeSetTypeDialog`
(`ArchiveDialog`-shaped destructive confirm), the badge glyph map and its side-wins-over-type
priority rule, child-row anatomy (blank set-number column, `md` 16px indent, 48×48 destructive
remove glyph, no confirm), the "+ Add {type}" dashed-chip control, the four new
`SessionActionSheet` rows and their exact copy, the Exercise Strip link badge and Exercise Page
partner chip, and Phase-Wide Rules R13-R15 are all locked contract — see 07-UI-SPEC.md directly;
not restated in full here to avoid drift between two copies.

### Claude's Discretion
The user auto-approved the recommended option for every remaining question after the myorep-parent
question, so D-07 and D-11 through D-22 are Claude's recommendations rather than explicitly debated
choices. They are consistent with the four choices the user made directly (D-01, D-02, D-04, D-09
and the layout/add-control pair D-06/D-08) and with the carried-forward constraints. Any of them may
be overridden at plan review without disturbing the others, with two exceptions: D-05 and D-10 are
the load-bearing decisions the rest hang off.

### Deferred Ideas (OUT OF SCOPE)
- Program-level superset authoring on `routine_exercise.superset_group_id` — Phase 4 territory;
  `days.ts:148` and `duplicate-routine.ts:99` already carry the comments marking the gap.
- Giant sets / three-or-more-member supersets in the *forming* UI (the data model and read paths
  already tolerate them per D-15; only the forming UI is restricted to pairs).
- A dedicated `partialReps` column on `logged_set` — rejected as D-04's third option; revisit only
  if the sub-entry shape proves awkward in real training use.
- Per-side plate math and independent per-hand dumbbell loads — a Phase 6 amendment, not this phase.
- Progression rules that read the new set types (e.g. myorep-driven volume progression) — Phase 8.
- Analytics that separate partial volume from full volume — Phase 9/10.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SETS-01 | User can change a set's type by tapping the set number, without leaving the set row | CF-04 confirms the tap target already exists unused; Pitfall 6 and the picker's per-row dispatch table (Code Examples) cover the retype-vs-insert-child distinction the picker must implement |
| SETS-02 | User can log a drop set as multiple weight/rep sub-entries grouped under one logical set | Pattern 3 (tree-flatten ordering) and Pitfall 2 are the load-bearing findings; `log-set.ts`'s existing `parentSetId` write path (Code Examples) is already correct |
| SETS-03 | User can log a myorep set as an activation set plus grouped rest-pause mini-sets | Same grouping mechanism as SETS-02 (D-05); D-07's "parent IS the activation set" is the one divergence from drop/partial's parent-stays-normal rule |
| SETS-04 | User can log a failure set, recorded at 0 RIR and labelled distinctly | Picker behavior table (retype row, Pitfall 6); no schema or read-path gap found — `rir` is already a plain writable column |
| SETS-05 | User can log partial reps distinctly from full reps | Identical grouping mechanism and read-path gaps as SETS-02 (Pitfall 1, Pattern 3) |
| SETS-06 | User's warm-up sets are distinguished from working sets and excluded from working volume | D-17's `countsTowardWorkingVolume` predicate; Pitfall 3 and Code Examples identify the fifth pre-existing bare-literal location (`ExerciseStrip.tsx`) beyond CONTEXT.md's four |
| SETS-07 | User can superset two adjacent exercises so rest starts only after both are done | D-13; Pitfall 4 (group-scoped "final member" predicate) and Pitfall 5 (do not conflate with `shouldAutoAdvance`) are the load-bearing findings |
| SETS-08 | User can detach an exercise from a superset | D-11/D-16; `SessionActionSheet.tsx`'s existing conditional-row pattern (Pattern 1, Code Examples) is the extension point, already verified |
| SETS-09 | User can log different weights and reps for the left and right side of a unilateral exercise | D-20; same grouping mechanism and same read-path widening gap as SETS-02/03/05 (Pitfall 1) |
</phase_requirements>

## Summary

This phase adds no new library, no new backend endpoint, and no new database column. Every column
`logged_set` and `session_exercise` need (`set_type`, `parent_set_id`, `side`, `completed`,
`rest_taken_seconds`, `superset_group_id`) already exists in Postgres
(`apps/api/src/db/schema/session.ts:121-153`, `:91`), already exists in the SQLite mirror
(`apps/mobile/lib/db/schema.ts:35-59`), and is already validated end-to-end by
`apps/api/src/sync/sync.service.ts` (confirmed below). The work is entirely inside
`apps/mobile/`: extending three read-path type shapes that currently stop short of carrying
`parentSetId`/`side` through to the UI, extending one ordering function that currently cannot
render a group, and adding two new components (`SetTypePickerSheet`, `ChangeSetTypeDialog`) plus
four new conditional rows on an existing action sheet.

The single most important finding this research adds beyond CONTEXT.md/UI-SPEC.md: **the existing
row-ordering pipeline (`orderForDisplay` in `set-row-builders.ts`) sorts by raw ascending
`set_index` within a warmup/non-warmup bucket split, and has no concept of a child needing to
render immediately beneath its parent.** Because a child's `set_index` is always assigned via
`max(set_index) + 1` at insert time (`log-set.ts:196-200`), a child added to an *earlier* set after
a *later* plain set already exists will get a **higher** `set_index` than that later set — and the
current ordering function would render it at the end of the list, not indented beneath its actual
parent. D-05/D-06 require a genuine parent→children tree-flatten pass, not the existing two-bucket
sort. This is detailed in **Common Pitfalls** and **Architecture Patterns** below, with exact line
citations.

The second load-bearing finding: three type shapes in the read pipeline currently do **not** carry
`parentSetId` or `side` at all — `LoggedSetRow` (`session-query.ts:30-40`), `ResolvedSetRow`
(`set-row-builders.ts:40-52`), `ExercisePageSetRow` (`ExercisePage.tsx:22-36`), and
`ExerciseChipSet`/`AutoAdvanceSetInput` (`ExerciseStrip.tsx:44-47`, `auto-advance.ts:3-6`). The SQL
select in `loadSessionTree` (`session-query.ts:130-145`) does not select `parent_set_id` or `side`
at all. Every one of these must be widened before D-05's grouping or D-20's per-side logging can
render anything — this is plumbing work the plan must schedule before or alongside D-02/D-06's
visual work, not an afterthought.

Third: the four-copy `!== 'warmup'` hazard CONTEXT.md names (D-17) actually has a **fifth**
location CONTEXT.md's own decision text does not enumerate: `countCompletedWorkingSets` in
`ExerciseStrip.tsx:51-53`, which feeds the strip's fraction/completion tone and therefore also
needs D-10's `parentSetId === null` filter, not just D-17's warmup predicate.

**Primary recommendation:** Build this phase in three layers, in order: (1) widen the four read-path
type shapes to carry `parentSetId`/`side` and select those two columns in `loadSessionTree`; (2)
replace `orderForDisplay`'s two-bucket sort with a parent-then-children tree-flatten that also
subsumes the existing warmup-first rule; (3) build the two new sheet components and extend
`SessionActionSheet`/`SetRow`/`ExerciseStrip`/`ExercisePage` against that now-correct data shape.
Do not add a new grouping mechanism, a new column, or a new sync-rules entry — none is needed.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Set-type switcher (bottom sheet, retype-or-group logic) | Browser/Client (RN+Web) | — | Pure local-state UI reading/writing already-local SQLite via PowerSync; no server round-trip on the interaction path |
| Grouped sub-entry storage & counting rules (`parentSetId`, `countsTowardWorkingVolume`, `countsTowardRecords`) | Browser/Client (RN+Web) | Database/Storage (SQLite mirror + Postgres CHECK) | Written and read entirely from the local SQLite DB during a live session; Postgres is the sync target, not a live dependency, and its CHECK constraint is the backstop, not the enforcement point |
| Superset formation/detach, rest suppression, cross-exercise auto-advance | Browser/Client (RN+Web) | — | `session_exercise.superset_group_id` is a session-only, client-mutated annotation (D-16); rest-timer state (`workout_session.rest_target_at`) is read/written locally, synced opportunistically |
| Per-side logging mode | Browser/Client (RN+Web) | — | Derived entirely from already-local `logged_set.side` values; no new column, no server computation |
| Sync validation of the seven `set_type` values, `side`, `parent_set_id`, `rest_taken_seconds` shape | API/Backend (`sync.service.ts`) | Database/Storage (Postgres CHECK) | Already implemented and already exercised by `poison-pill.e2e-spec.ts` — this phase's writes flow through an unchanged validator; no new backend work is anticipated but the plan must add a verification step confirming this, not assume it (CONTEXT.md's own instruction) |
| Export document emission of `parent_set_id`/`side` | Browser/Client (`build-export-document.ts`) | — | Already implemented (confirmed below) — downstream consumer, not this phase's write target |

## Package Legitimacy Audit

**Not applicable — this phase introduces zero new npm packages.** CF-01 states the schema this
phase needs already ships; verification below confirms every column, vocabulary tuple, and
sync-validator rule already exists in the codebase. No `package.json` in `apps/mobile`, `apps/api`,
or `packages/*` needs a new dependency to implement SETS-01 through SETS-09. If a plan discovers
mid-implementation that it needs a new package, that is itself a signal the plan has drifted from
CF-01 and should halt per the project's existing dependency-freeze convention (see WINDOWS #113 for
the precedent of exactly this halt-and-report pattern in Phase 5).

## Standard Stack

No new stack additions. This phase extends the identical hand-rolled RN component stack Phases 1–6
already established:

### Core (unchanged, reused)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React Native + React Native Web | as pinned in `apps/mobile/package.json` | Renders every new component (`SetTypePickerSheet`, `ChangeSetTypeDialog`) | Already the project's only UI runtime; shadcn/Radix does not apply (confirmed in 07-UI-SPEC.md's own Design System table) |
| Drizzle ORM | as pinned | Reads/writes the widened `LoggedSetRow` select and the new grouping queries | Already the project's sole query layer for both Postgres and the SQLite mirror |
| PowerSync (`@powersync/react-native`, `@powersync/web`) | as pinned | Sole ingress for every new child-row write (CF-07) | Already the project's local-first sync engine; no new sync-rules entry needed since `logged_set`/`session_exercise` are children resolved through `workout_session`'s aggregate root |

### Supporting
None new. `@expo/vector-icons` (`Ionicons`) supplies every new glyph this phase needs
(`link-outline`, `unlink-outline`, `git-compare-outline`, `git-merge-outline`, `trash-outline`,
`checkmark`) — all standard Ionicons names already used elsewhere in this codebase for the same
icon family.

### Alternatives Considered
Not applicable — CONTEXT.md's CF-01 through CF-10 close off every alternative-stack question before
this research began; there is no library decision left to make.

**Installation:** none required.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌───────────────────────────────────────────────┐
                     │  workout.tsx (live session screen)             │
                     │  handleCheckmarkPress / buildSetRows call site │
                     └───────────────┬─────────────────────────────────┘
                                     │ existingSets: LoggedSetRow[]  (MUST widen: + parentSetId, side)
                                     ▼
        ┌────────────────────────────────────────────────────────────────┐
        │ session-query.ts: loadSessionTree                               │
        │  SELECT ... FROM logged_set  ← MUST add parent_set_id, side     │
        └───────────────┬──────────────────────────────────────────────────┘
                         │ LoggedSetRow[] (flat, set_index ascending — session-query.ts:157)
                         ▼
        ┌────────────────────────────────────────────────────────────────┐
        │ set-row-builders.ts: orderForDisplay → buildSetRows             │
        │  CURRENT: bucket(warmup, non-warmup), concat, no tree awareness │
        │  REQUIRED: tree-flatten by parentSetId, THEN warmup-first rule  │
        └───────────────┬──────────────────────────────────────────────────┘
                         │ ResolvedSetRow[] (MUST widen: + parentSetId, side)
                         ▼
        ┌────────────────────────────────────────────────────────────────┐
        │ ExercisePage.tsx: ExercisePageSetRow → ExercisePageView         │
        │  (MUST widen ExercisePageSetRow: + parentSetId, side)           │
        └───────────────┬──────────────────────────────────────────────────┘
                         │ per-row props
                         ▼
        ┌────────────────────────────────────────────────────────────────┐
        │ SetRow.tsx: SetRowView                                          │
        │  renderWarmupBadge → generalize to badge-glyph-map (D-02)       │
        │  set-number Pressable.onPress → SetTypePickerSheet (D-01, CF-04)│
        │  child rows: blank set-number column, md indent, remove glyph   │
        └────────────────────────────────────────────────────────────────┘

        Parallel path — counting predicates (read by strip, auto-advance, PR detection):
        ExerciseStrip.tsx: countCompletedWorkingSets ─┐
        auto-advance.ts: shouldAutoAdvance ────────────┼─→ ALL must add parentSetId === null filter (D-10/D-19)
        history-query.ts / summary-query.ts / ────────┤     AND route the warmup exclusion through one
        session-query.ts (WORKING_SET_TYPE_EXCLUSION) ─┤     named predicate, countsTowardWorkingVolume (D-17)
        personal-records.ts (pr-rules package) ────────┘     — this one additionally excludes `partial` (D-18)

        Superset path (session-scoped only, D-16):
        SessionActionSheet.tsx (add 'superset'/'detach-superset' rows)
          → session-mutations.ts (write session_exercise.superset_group_id)
          → workout.tsx's handleCheckmarkPress rest-scheduling call site
             (MUST gate on "is this exercise the highest order_index member of its group", D-13)
          → auto-advance-to-next-member (D-14, a NEW, narrower advance than shouldAutoAdvance's
             cross-exercise trigger — do not conflate the two)
```

### Recommended Project Structure

No new directories. New files land beside their siblings:

```
apps/mobile/components/
├── SetRow.tsx                  # extended: badge glyph map, child row anatomy, remove glyph
├── SetTypePickerSheet.tsx      # NEW — D-01 bottom sheet
├── ChangeSetTypeDialog.tsx     # NEW — D-09 destructive confirm, ArchiveDialog-shaped
├── SessionActionSheet.tsx      # extended: 4 new conditional SESSION_EXERCISE_ACTIONS rows
├── ExerciseStrip.tsx           # extended: link badge overlay, parentSetId-aware counting
└── ExercisePage.tsx            # extended: partner chip, widened ExercisePageSetRow

apps/mobile/lib/
├── db/
│   ├── session-query.ts        # extended: select+carry parent_set_id, side
│   ├── log-set.ts              # already accepts parentSetId/supersetGroupId — verify write sites use it
│   └── session-mutations.ts    # extended: form/detach superset, toggle per-side write path
└── session/
    ├── set-row-builders.ts     # extended: tree-flatten ordering replaces two-bucket sort
    └── auto-advance.ts         # extended: parentSetId filter (D-19), + new superset-member advance

packages/api-contracts/src/
└── session.ts                  # extended: countsTowardWorkingVolume, countsTowardRecords predicates

packages/pr-rules/src/
└── personal-records.ts         # extended: swap WARMUP_SET_TYPE-only exclusion for countsTowardRecords
```

### Pattern 1: Hook-free `*View` + stateful wrapper (already established, must be preserved)

**What:** Every shared row/screen component in this codebase splits into a pure, hook-free `XView`
function (direct-invocable by a test with no renderer) and a stateful `X` wrapper that resolves
hooks (`useThemeColors`, `useColorScheme`) and passes them down as props.

**When to use:** Every new component this phase adds (`SetTypePickerSheet`, `ChangeSetTypeDialog`)
and every extension to an existing one (`SetRowView`, `ExercisePageView`,
`SessionActionSheetView`).

**Example (verified, `apps/mobile/components/SessionActionSheet.tsx:38-111`):**
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
  // ...renders visibleActions...
}

export function SessionActionSheet(props: SessionActionSheetProps) {
  const { colorScheme } = useColorScheme();
  const colors = GLYPH_COLORS[colorScheme === 'dark' ? 'dark' : 'light'];
  return <SessionActionSheetView {...props} colors={colors} />;
}
```
D-11's two new rows (`superset`, `detach-superset`) and D-21's two new rows
(`enable-per-side`, `disable-per-side`) extend `SESSION_EXERCISE_ACTIONS` (currently
`swap | remove | reorder | info | equipment`, `SessionActionSheet.tsx:16,30-36`) and the
`visibleActions` filter — appended, never inserted, matching the existing `equipment`
conditional-row precedent exactly.

### Pattern 2: Additive-only closed vocabulary with a named predicate

**What:** A closed set of literals lives once in `packages/api-contracts/src/`, is enforced by a
Postgres CHECK, mirrored in SQLite, and validated in `sync.service.ts` — and any derived rule over
that vocabulary (e.g. "which types count toward X") is a single named exported function, never a
scattered inline literal comparison.

**When to use:** D-17 (`countsTowardWorkingVolume`) and D-18 (`countsTowardRecords`).

**Example (verified, `packages/api-contracts/src/session.ts:1-23`):**
```typescript
export const SET_TYPES = ['normal', 'warmup', 'drop', 'myorep', 'partial', 'failure', 'amrap'] as const;
export type SetType = (typeof SET_TYPES)[number];

export const WORKING_SET_TYPE: SetType = 'normal';
export const WARMUP_SET_TYPE: SetType = 'warmup';
```
This is the exact shape D-17/D-18's two new predicates belong beside:
```typescript
// D-17 — the only excluded type is warmup; drop/myorep/partial/failure/amrap all count.
export function countsTowardWorkingVolume(setType: SetType): boolean {
  return setType !== WARMUP_SET_TYPE;
}

// D-18 — warmup AND partial are excluded; a partial-ROM rep must never set a max-based PR.
export function countsTowardRecords(setType: SetType): boolean {
  return setType !== WARMUP_SET_TYPE && setType !== 'partial';
}
```

### Pattern 3: `set_index` is flat and never repositioned — grouping is a read-time tree-flatten, not a storage change

**What:** `logged_set.set_index` is strictly incrementing per `session_exercise_id`
(`apps/api/src/db/schema/session.ts:128-130`: *"Strictly incrementing, never fractional (1, 2, 3,
3a, 3b becomes 1, 2, 3, 4, 5) — grouping is the annotation columns below, never a different storage
shape"*) and is assigned via `max(set_index) + 1` inside one transaction at insert time
(`apps/mobile/lib/db/log-set.ts:196-200`, quoted in full below). **The existing display-ordering
function does not reorder by `parentSetId` at all** — it only buckets by warmup-vs-not
(`apps/mobile/lib/session/set-row-builders.ts:83-87`, quoted verbatim):
```typescript
function orderForDisplay(existingSets: LoggedSetRow[]): LoggedSetRow[] {
  const warmups = existingSets.filter((row) => row.setType === 'warmup');
  const working = existingSets.filter((row) => row.setType !== 'warmup');
  return [...warmups, ...working];
}
```
Because `existingSets` itself arrives sorted strictly by ascending raw `set_index`
(`apps/mobile/lib/db/session-query.ts:157`, verified: `rows.sort((a, b) => a.setIndex - b.setIndex);`),
a child added to set 1 *after* set 2 already exists gets `set_index = 3` (the next `max()+1`), and
`orderForDisplay`'s current bucket-and-concat would render it **after** set 2, not indented beneath
set 1. This is a correctness gap the plan must close with a genuine tree-flatten pass, e.g.:

```typescript
// Illustrative shape — not verified against a shipped implementation, since none exists yet.
function flattenGroups(rows: LoggedSetRow[]): LoggedSetRow[] {
  const parents = rows.filter((r) => r.parentSetId === null);
  const childrenByParent = new Map<string, LoggedSetRow[]>();
  for (const row of rows) {
    if (row.parentSetId === null) continue;
    const list = childrenByParent.get(row.parentSetId) ?? [];
    list.push(row);
    childrenByParent.set(row.parentSetId, list);
  }
  for (const list of childrenByParent.values()) list.sort((a, b) => a.setIndex - b.setIndex);

  const result: LoggedSetRow[] = [];
  for (const parent of parents) {
    result.push(parent);
    result.push(...(childrenByParent.get(parent.id) ?? []));
  }
  return result;
}
```
This must compose with, not replace, the existing warmup-first rule — warm-ups are never grouped
(D-20/D-07 restrict grouping's parent role to `normal`/`myorep`-typed rows), so bucketing warm-ups
ahead of everything else and *then* tree-flattening the remainder is the correct order of
operations. This composition is not specified anywhere in CONTEXT.md/UI-SPEC.md and is a genuine
planning decision the plan must make explicit.

**Verified `log-set.ts` insertion logic (the source of the ordering hazard above), full quote:**
```typescript
// apps/mobile/lib/db/log-set.ts:189-216
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
`logSet` already accepts and writes `parentSetId` and `side` — the write path for grouping and
per-side already exists and needs no change. Confirms CONTEXT.md's Reusable Assets claim for this
file exactly.

### Pattern 4: Set-number display gap when a group exists — unresolved by CONTEXT.md/UI-SPEC.md

**What:** UI-SPEC.md's Set Row section fixes that a **child** row's set-number column renders blank
(never the raw integer). It does not fix what a **parent** row displays. `SetRowView` currently
renders `setIndex` verbatim as the visible number
(`apps/mobile/components/SetRow.tsx:193`: `<Text ...>{setIndex}</Text>`), and `buildSetRows` passes
the row's **raw storage** `setIndex` straight through
(`apps/mobile/lib/session/set-row-builders.ts:119`: `setIndex: row.setIndex`). Once a child consumes
a storage index between two parents (per Pattern 3 above), the parent that follows will carry a
raw `set_index` with a gap (e.g. parent-1 = 1, child = 2, parent-2 = 4 if a second child or a
later-added set occupied 3) — displaying that raw integer as "Set 4" when it is actually the
lifter's second real working set is a real, visible correctness question this research could not
resolve from existing docs.

**When to use:** This is a planning decision, not a research finding with a single right answer —
flag it for the plan (and if warranted, a `checkpoint:human-verify` or a discuss-phase follow-up)
rather than silently picking one option. See **Open Questions**.

### Anti-Patterns to Avoid

- **Inventing a second grouping mechanism** (e.g. a `groupId` column, a JSON array of child IDs) —
  D-05 is explicit and one-way: `parent_set_id` is the only mechanism, for all four grouped
  features. A plan that adds any other grouping column is out of contract.
- **Re-deriving the warmup/partial exclusion inline** instead of calling `countsTowardWorkingVolume`/
  `countsTowardRecords` — R13 in the UI-SPEC states this explicitly: *"A UI surface that inlines
  its own `set_type !== 'warmup'` or `parentSetId` check instead of calling the shared predicate is
  out of contract, even if it happens to render correctly today."* This research found a fifth
  pre-existing inline copy (`ExerciseStrip.tsx:52`) that must also be migrated, not just the four
  CONTEXT.md names.
- **Positional inference from `set_index`** — the codebase's own repeatedly-cited Pitfall 2 (from
  Phase 5's `05-RESEARCH.md:419-423`, quoted below) applies with full force to this phase's grouping
  work: a child's `set_index` carries no signal about which parent it belongs to; only
  `parent_set_id` does.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Grouping drop sets, myoreps, partials, and per-side pairs | A second grouping column, a JSON blob, or a tree table | `parent_set_id` self-FK, already on `logged_set` | D-05 is one-way — every Phase 8-10 read path is written against this exact shape; a second mechanism would fork every downstream consumer |
| Counting which sets count toward a prescription | A new "isWorkingSet" boolean column | `parentSetId === null` filter composed with `countsTowardWorkingVolume` | Both are derivable from existing columns; a stored boolean would need to be kept in sync with `set_type`/`parent_set_id` by hand and could drift |
| Superset formation across N members | A join table or an array column | The existing `superset_group_id` text column, treated as "a group id of N adjacent members" per D-15 | Already exists on `session_exercise`; the column's shape already supports N ≥ 2, only the forming UI restricts to pairs |
| Rest-timer suppression logic | A per-exercise timer state machine | The existing single `workout_session.rest_target_at` wall-clock column, gated by one new condition at the scheduling call site | D-13 explicitly frames this as "one condition at the rest-start call site," not a new timer concept |

**Key insight:** every mechanism this phase needs to add new user-facing behavior already exists as
a column or a function signature in this codebase — the entire engineering risk is in **read-path
plumbing and ordering correctness**, not in inventing new storage or new libraries. Treat any task
that proposes new storage as a signal to re-read CF-01/D-05 before proceeding.

## Common Pitfalls

### Pitfall 1: Extending badge/grouping without first widening the read-path types

**What goes wrong:** A plan implements `SetTypePickerSheet` and the badge glyph map against
`SetRow.tsx` directly, but `workout.tsx`'s data never reaches the row with `parentSetId`/`side`
populated, because `LoggedSetRow`, `ResolvedSetRow`, and `ExercisePageSetRow` were never widened —
the badge renders correctly in a Storybook-style unit test and does nothing in the actual app.

**Why it happens:** `SetRow.tsx`'s own prop surface (`warmup?`, `hasNote?`) is intentionally
optional and additive (CONTEXT.md CF-04's own framing), so a component-level plan can add and test
new props without ever noticing the upstream select statement doesn't supply the data.

**How to avoid:** Schedule the read-path widening (session-query.ts's SELECT, all three
intermediate type shapes) as an explicit, verifiable-in-isolation early task, with its own test
(e.g. asserting `loadSessionTree` returns non-null `parentSetId`/`side` for a seeded grouped row)
before wiring the UI against it.

**Warning signs:** A plan's task list has "add badge to SetRow" before "add parent_set_id/side to
LoggedSetRow's select" — the badge task cannot be manually verified against real data until the
plumbing task lands.

### Pitfall 2: The two-bucket `orderForDisplay` silently mis-orders a group (verified defect risk, not yet a bug because no caller writes children today)

**What goes wrong:** A child inserted via D-08's "+" control, or via the picker's Drop
Set/Partial/Myorep flow, renders in the wrong position — after a later, unrelated set — instead of
indented directly beneath its own parent, because `orderForDisplay` only knows "warmup" vs "not
warmup," not "child of X."

**Why it happens:** This function predates grouping entirely (Phase 5 built it for warm-up-only
ordering) and its bucket-then-concat shape looks superficially sufficient because `set_index` today
is always monotonic in insertion order — a fact that stops being true the instant a child is
inserted onto an *earlier* set after a *later* one already exists.

**How to avoid:** Replace `orderForDisplay` with a genuine parent-then-children flatten (Pattern 3
above), composed with the existing warmup-first bucket rule, and add a unit test that seeds:
set 1 (parent, normal), set 2 (normal, unrelated), then a child of set 1 — asserting the child
renders at position 2 (directly after set 1), not position 3 (after set 2).

**Warning signs:** A durability/e2e spec that logs sets out of "natural" order and checks visual
position, or a manual QA pass converting an early set to a drop set after already logging a later
one.

### Pitfall 3: Auto-advance and the strip fraction inflating on grouped rows (D-19, and its 5th location)

**What goes wrong:** Once children exist, `shouldAutoAdvance` (which currently filters only on
`setType === WORKING_SET_TYPE`, `auto-advance.ts:43`) and `countCompletedWorkingSets` (which
filters only on `setType !== 'warmup'`, `ExerciseStrip.tsx:52`) both count every child row as an
additional working set, inflating "3/4" to a number the exercise never actually prescribed and
firing auto-advance a set early — the exact class of bug WINDOWS #136 already fixed once for a
different cause (missing `targetWorkingSets` comparison).

**Why it happens:** Both functions were written before grouping existed and iterate the flat
`sets`/`ExerciseChipSet[]` array with no `parentSetId` field to filter on yet (confirmed: neither
`AutoAdvanceSetInput` (`auto-advance.ts:3-6`) nor `ExerciseChipSet` (`ExerciseStrip.tsx:44-47`)
currently declares a `parentSetId` field).

**How to avoid:** Add `parentSetId: string | null` to both input interfaces, and add
`.filter((set) => set.parentSetId === null)` before the existing `setType` filter in both
functions — this is D-19's rule applied to a location (`ExerciseStrip.tsx`) that CONTEXT.md's own
decision text does not name, so the plan must add this file to its scope explicitly rather than
relying on CONTEXT.md's four-location list being exhaustive.

**Warning signs:** A per-side or drop-set exercise's strip chip reads "4/4" after only 2-3 real
prescribed sets are done, or the pager advances mid-drop-set.

### Pitfall 4: Rest suppression naively keyed off `session_exercise.order_index` alone, without checking the CURRENT session's group membership

**What goes wrong:** D-13 requires the rest timer to stay suppressed until the highest
`order_index` member of the *current* superset group completes a set. A naive implementation reads
`order_index` globally (across the whole session) instead of scoping "highest" to only the members
sharing this exercise's own `superset_group_id`, and either never starts rest for a superset near
the end of the session, or starts it too early for one near the start.

**Why it happens:** `session_exercise.order_index` is a session-wide sequence, not scoped per
group; "final member" must be computed as `max(order_index)` filtered to
`superset_group_id = thisExercise.superset_group_id`, a join/filter step that is easy to skip when
the call site (`workout.tsx`'s `handleCheckmarkPress`, confirmed at
`apps/mobile/app/(tabs)/workout.tsx:1177-1284`) currently has zero group-awareness at all.

**How to avoid:** Resolve "is this exercise's completed set the group's final member" as one named,
testable predicate taking the full `sessionExercises` list and the completing exercise's id — never
inline arithmetic at the call site.

**Warning signs:** A two-exercise superset where rest starts after the *first* exercise's set
instead of the second's, or a 3-exercise chain (D-15's tolerated N≥3 case) where rest never starts
because the predicate assumed exactly two members.

### Pitfall 5: Confusing D-14's superset-internal advance with `shouldAutoAdvance`'s cross-exercise advance

**What goes wrong:** A plan tries to make `shouldAutoAdvance` itself understand supersets (adding a
`supersetGroupId` parameter and internal branching), producing one function serving two
conceptually different triggers: "the whole exercise's prescription is done, move to the next
exercise" (existing) vs. "this member of the superset just did a set, move to the paired member
regardless of that exercise's own completion" (D-14, new).

**Why it happens:** Both triggers change `currentIndex` in the same pager, so they look like the
same problem from the call site.

**How to avoid:** Keep `shouldAutoAdvance` exactly as it is (D-19 only adds the `parentSetId`
filter) and add a second, narrower predicate for D-14's per-set superset-internal advance, called
first at the completion call site — D-14 fires on *every* completed set on a non-final member
regardless of that exercise's own target-set completion; `shouldAutoAdvance` fires only once the
whole exercise's prescription is met. Conflating them would make a superset's first exercise never
advance until its own targets are met, defeating D-14 entirely.

**Warning signs:** A superset where completing set 1 of exercise A does not immediately pager-jump
to exercise B.

### Pitfall 6: Set-type picker's "Drop Set"/"Partial" rows silently no-op instead of following the documented behavior table

**What goes wrong:** UI-SPEC.md's own behavior table (Set-Type Picker Sheet section) specifies that
tapping "Drop Set" on a row with **no** children inserts a child and leaves the row's own type
unchanged — a materially different effect from every other row in the same list, which retypes the
row. A naive implementation that treats the picker as "pick a value, set `set_type` to it" for
every row will incorrectly retype a `normal` row to `'drop'` (a value that per CF-02/D-07 should
never appear on a parent row at all).

**Why it happens:** Six of the seven rows *do* retype the tapped row; only Drop Set and Partial
diverge (insert-child-only). This inconsistency is a genuine UX/data-model subtlety, not a
copy-paste variant.

**How to avoid:** Implement the picker's `onSelect` as a per-row dispatch table matching UI-SPEC's
own table exactly (Normal/Warm-up/Failure/AMRAP → retype; Drop Set/Partial → insert child, unless
existing children require the confirm-and-clear branch; Myorep → retype), not a single generic
"set setType to X" handler.

**Warning signs:** A drop set's parent row reads `set_type = 'drop'` in the database instead of
staying `'normal'` — directly contradicting D-07's *"For a drop the parent is the top set"* and the
badge map's *"drop (child only — a drop's parent stays `normal` and shows no type badge)"* rule.

## Code Examples

### Verified: `sync.service.ts` already validates every field this phase writes

```typescript
// apps/api/src/sync/sync.service.ts:258-265 (interface shape) and :866-872 (validator)
set_type?: string;
side?: string | null;
completed?: boolean;
parent_set_id?: string | null;
rest_taken_seconds?: number | null;
...
if (d.set_type !== undefined && !(typeof d.set_type === 'string' && SET_TYPES.has(d.set_type))) {
  return true; // reject
}
if (!isValidOptionalBoolean(d.completed)) return true;
if (!isValidOptionalStringOrNull(d.side)) return true;
if (!isValidOptionalStringOrNull(d.parent_set_id)) return true;
if (d.rest_taken_seconds !== undefined && !isNonNegativeIntegerOrNull(d.rest_taken_seconds)) return true;
```
`SET_TYPES` at line 12 is imported as `SET_TYPES as SET_TYPE_TUPLE` directly from
`@fitness/api-contracts`, and instantiated as `new Set<string>(SET_TYPE_TUPLE)` at line 213 —
confirming all seven literals (not just `normal`/`warmup`) are already accepted. **No sync-layer
change is anticipated**, but CONTEXT.md correctly instructs the plan to add a verification step
confirming this rather than assuming it, since a future refactor could silently narrow this set.

### Verified: the Postgres CHECK constraint pinning the vocabulary

```sql
-- apps/api/src/db/schema/session.ts:151 (as Drizzle `check(...)`)
check('logged_set_set_type_check', sql`${table.setType} IN ('normal','warmup','drop','myorep','partial','failure','amrap')`)
```

### Verified: current `AutoAdvanceSetInput`/`shouldAutoAdvance` (D-19's exact extension point)

```typescript
// apps/mobile/lib/session/auto-advance.ts:1-52, full file
import { WORKING_SET_TYPE } from '@fitness/api-contracts';

export interface AutoAdvanceSetInput {
  setType: string;
  completed: boolean;
}

export interface ShouldAutoAdvanceInput {
  sets: AutoAdvanceSetInput[];
  enabled: boolean;
  currentIndex: number;
  exerciseCount: number;
  completedSetType: string;
  targetWorkingSets: number | null;
}

export function shouldAutoAdvance({
  sets, enabled, currentIndex, exerciseCount, completedSetType, targetWorkingSets,
}: ShouldAutoAdvanceInput): number | null {
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
D-19's required change: add `parentSetId: string | null` to `AutoAdvanceSetInput`, and insert
`.filter((set) => set.parentSetId === null)` immediately before (or fused into) the existing
`sets.filter((set) => set.setType === WORKING_SET_TYPE)` line.

### Verified: `personal-records.ts`'s two functions D-18 must change (both currently warmup-only)

```typescript
// packages/pr-rules/src/personal-records.ts:32-36 and :63-66
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
D-18's change: both `set.setType === WARMUP_SET_TYPE` / `candidate.setType === WARMUP_SET_TYPE`
guards become `!countsTowardRecords(set.setType)` / `!countsTowardRecords(candidate.setType)`,
importing the new predicate from `@fitness/api-contracts`.

### Verified: the fifth bare-literal location this research found beyond CONTEXT.md's four

```typescript
// apps/mobile/components/ExerciseStrip.tsx:44-53
export interface ExerciseChipSet {
  setType: string;
  completed: boolean;
}

export function countCompletedWorkingSets(sets: ExerciseChipSet[]): number {
  return sets.filter((set) => set.setType !== 'warmup' && set.completed).length;
}
```
Requires the same two changes as `auto-advance.ts`: add `parentSetId` to `ExerciseChipSet`, filter
to `parentSetId === null` before the `setType`/`completed` filter, and route the `'warmup'` literal
through `countsTowardWorkingVolume` per R13's shared-predicate rule.

## State of the Art

Not applicable in the conventional sense — there is no external library or API surface this phase
adopts a newer version of. The relevant "state of the art" is entirely internal: this phase turns
five *reserved* vocabulary values into five *written* ones
(`docs/session-vocabularies.md`, quoted: *"This phase's UI only ever writes `normal` and `warmup`;
the remaining five values are reserved and unwritten until Phase 7..."*), and that document itself
must be updated by this phase's own plan to reflect the new written/reserved split — this is a
concrete required-edit, not optional documentation debt.

| Old State | New State (this phase) | Where | Impact |
|-----------|------------------------|-------|--------|
| `SET_TYPES` values `drop`/`myorep`/`partial`/`failure`/`amrap` are validated but never written by any client code path | All five become writable via `SetTypePickerSheet` | `docs/session-vocabularies.md`, `packages/api-contracts/src/session.ts` | The doc's own table must flip "Reserved for Phase 7" to "Yes" per row |
| `logged_set.parent_set_id`/`side` are validated and exported by `build-export-document.ts` but never populated by any write path except direct DB manipulation | Populated by real user interaction via drop/myorep/partial/per-side flows | `apps/mobile/lib/db/log-set.ts` (write path, already correct), read path (needs widening per Pitfall 1) | First real data ever to exercise these columns end-to-end |
| `session_exercise.superset_group_id` is written only by nothing (confirmed null in both `days.ts:148` and `duplicate-routine.ts:99-104`, with comments explicitly marking the gap) | Written ad hoc, session-only, by `SessionActionSheet`'s new rows (D-16) | `apps/mobile/lib/db/session-mutations.ts` | First real write to a column that has existed since Phase 4 but was never populated |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The tree-flatten ordering function (Pattern 3's illustrative code) composes with the warmup-first bucket by bucketing warmups first and then tree-flattening the remainder, rather than some other composition order | Architecture Patterns, Pattern 3 | If the wrong composition is chosen, a warmup that somehow gains a child (not expected under D-20/D-07's restriction, but not structurally prevented by a DB constraint) could render in an unexpected position; low risk since warm-ups are never grouped by any UI path this phase builds, but the DB itself does not forbid it |
| A2 | The parent row's displayed set number should probably NOT be its raw, gap-containing `set_index`, but this research could not find a specification resolving it either way | Architecture Patterns, Pattern 4; Open Questions | If the plan picks "raw index" and it's wrong, lifters see confusing gaps ("Set 1", "Set 4") in the common drop-set/myorep case — a visible, dogfooding-blocking defect; if the plan picks "recomputed position" and it's wrong, `set_index`'s role as a stable historical record identifier could be misread as mutable |
| A3 | `ExerciseStrip.tsx`'s `countCompletedWorkingSets` is genuinely in-scope for this phase's D-17/D-19 predicate migration even though CONTEXT.md's decision text names only four locations, not five | Common Pitfalls, Pitfall 3 | If out of scope, the strip fraction and `exerciseChipState`'s completion tone will undercount/overcount once grouped rows exist, contradicting the phase's own success criteria about honest counting |

## Open Questions

1. **What does a parent row's set-number column display once earlier sub-entries have consumed
   storage indices between it and the previous parent?**
   - What we know: children render with a blank set-number column (UI-SPEC, explicit); `set_index`
     is strictly incrementing at the storage layer and is not renumbered (CF-03, explicit);
     `SetRowView` currently renders the raw `setIndex` prop verbatim with no gap-closing logic
     (verified, `SetRow.tsx:193`).
   - What's unclear: whether a parent row should display its raw `set_index` (which will show gaps
     like 1, 4, 5 once children exist) or a recomputed "position among parent rows only" (which
     would always read 1, 2, 3 but diverges from the row's actual storage identity).
   - Recommendation: raise this explicitly at plan review or via a `checkpoint:human-verify` before
     implementation — it is a genuine UX decision with no single objectively correct answer inside
     the existing CONTEXT.md/UI-SPEC.md text, and it touches every grouped-set screenshot a
     UAT reviewer will look at.

2. **How does D-13's "highest `order_index` member" predicate behave when a superset member is
   mid-session removed (`session_exercise.removed_at` set) per LOG-14?**
   - What we know: `session_exercise.removed_at` already exists and is already filtered by
     `loadSessionTree`'s `isNull(sessionExercise.removedAt)` clause (`session-query.ts:126`); a
     removed exercise drops out of the live pager entirely.
   - What's unclear: whether a 2-member superset where one member is removed mid-workout should
     collapse to acting like a non-superset exercise (rest starts on every completion again) or
     should preserve the group's `superset_group_id` and simply have one fewer live member.
   - Recommendation: treat as an edge case for the plan to make an explicit, tested decision on
     rather than leave implicit — the "final member" predicate (Pitfall 4) must define its behavior
     when the group's membership shrinks to 1 live exercise.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (`apps/mobile/package.json` `"test": "jest"`, config at `apps/mobile/jest.config.js`) for unit/component tests; Playwright (`apps/mobile/playwright.config.ts`, projects `durability` and `sync`) for e2e; NestJS e2e specs under `apps/api/test/*.e2e-spec.ts` for sync validation |
| Config file | `apps/mobile/jest.config.js`; `apps/mobile/playwright.config.ts` |
| Quick run command | `pnpm --filter mobile test -- <pattern>` (Jest, targeted); `pnpm --filter api test -- <spec-name>` for a single e2e spec |
| Full suite command | `pnpm -w test` (project's own configured `build_command`/`test_command` in `.planning/config.json`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SETS-01 | Tap set number opens picker, retypes/groups per behavior table | unit (component) | `pnpm --filter mobile test -- SetRow` (existing `SetRow.test.tsx`), plus new `SetTypePickerSheet.test.tsx` | ✅ existing SetRow.test.tsx / ❌ new picker test — Wave 0 |
| SETS-02 | Drop set logs as grouped sub-entry | unit + e2e | `pnpm --filter mobile test -- set-row-builders` (new grouping cases), `durability.spec.ts` extension | ❌ Wave 0 (no grouping test exists yet — `set-row-builders.test.ts` not found in this research pass) |
| SETS-03 | Myorep logs as activation set + rest-pause mini-sets | unit + e2e | same as SETS-02, myorep-specific case | ❌ Wave 0 |
| SETS-04 | Failure set recorded at 0 RIR, labelled | unit | picker behavior-table test asserting `rir` write alongside `set_type = 'failure'` | ❌ Wave 0 |
| SETS-05 | Partial reps distinct sub-entry | unit | same grouping test file as SETS-02/03, partial case | ❌ Wave 0 |
| SETS-06 | Warm-up excluded from working volume | unit | `pnpm --filter mobile test -- session-query` (existing `session-query.test.ts`) extended for `countsTowardWorkingVolume`; `packages/pr-rules` existing `warmup.test.ts` | ✅ existing files, extend in place |
| SETS-07 | Superset rest starts only after both done | unit + e2e | new predicate test for "final member of group," `durability.spec.ts` extension | ❌ Wave 0 |
| SETS-08 | Detach superset | unit | `SessionActionSheet.test.tsx` (existing) extended for `detach-superset` row | ✅ existing file, extend in place |
| SETS-09 | Per-side left/right logging | unit + e2e | new grouping test (per-side is `parent_set_id` + `side`, same mechanism as SETS-02) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted Jest run for the file(s) touched (e.g. `pnpm --filter mobile test -- auto-advance`)
- **Per wave merge:** `pnpm -w test` (full suite) plus the `durability` Playwright project
  (`pnpm --filter mobile test:e2e:durability`) — standing-authorized in this repo per
  `.claude/CLAUDE.md` § Conventions, no ask-first needed
- **Phase gate:** Full suite green, plus at least one clean `durability` Playwright run exercising a
  grouped set (drop or per-side) end to end, before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/mobile/lib/session/__tests__/set-row-builders.test.ts` — does not exist yet; needed to
  cover the tree-flatten ordering function (Pattern 3) and its composition with the warmup bucket
  rule, including the out-of-order-child regression case from Pitfall 2
- [ ] `apps/mobile/components/__tests__/SetTypePickerSheet.test.tsx` — new component, no existing
  coverage
- [ ] `apps/mobile/components/__tests__/ChangeSetTypeDialog.test.tsx` — new component, no existing
  coverage
- [ ] Extend `apps/mobile/lib/session/__tests__/auto-advance.test.ts` — add `parentSetId`-bearing
  cases (D-19)
- [ ] Extend `apps/mobile/components/__tests__/ExerciseStrip` coverage (no `__tests__` file found
  for `ExerciseStrip.tsx` in this research pass — confirm before assuming one exists) for
  `countCompletedWorkingSets`'s new `parentSetId` filter
- [ ] Extend `packages/pr-rules/src/__tests__/personal-records.test.ts` (exists) for D-18's
  `countsTowardRecords` swap

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: high` (confirmed,
`.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Unchanged by this phase — no new auth surface |
| V3 Session Management | No | Unchanged — this phase's "session" is a workout session, not an auth session |
| V4 Access Control | Yes (already enforced, verify no regression) | `sync.service.ts`'s existing ownership resolution through `workout_session`'s aggregate root (CF-07) — a new child row this phase writes inherits ownership with no new access-control code required; the plan should add a verification step confirming a `logged_set` child cannot be pushed by sync for a `session_exercise` the pushing user does not own, exactly as an existing `logged_set` row already cannot |
| V5 Input Validation | Yes | `sync.service.ts`'s existing shape validator (confirmed above) already rejects malformed `set_type`/`side`/`parent_set_id`/`rest_taken_seconds` — no new validation code is anticipated, only a verification step |
| V6 Cryptography | No | Not touched by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A malicious/buggy client pushes a `parent_set_id` pointing at a `logged_set` belonging to a *different* user's session, attempting to graft a child onto someone else's set | Tampering | Verify `sync.service.ts`'s existing poison-pill isolation tests (`apps/api/test/poison-pill.e2e-spec.ts`, confirmed exists and already exercises `parent_set_id`/`side`/`completed` round-trips per CONTEXT.md) cover cross-user `parent_set_id` grafting specifically; if not, this phase's plan should add that case rather than assume the existing suite covers it by name alone |
| A client sends a `superset_group_id` referencing a `session_exercise` in a *different* session, attempting to pair exercises across sessions | Tampering | `session_exercise` has no server-side FK validation of `superset_group_id`'s cross-session scope (it is a bare text column, `apps/api/src/db/schema/session.ts:91`) — this is a shape-validation gap only sync.service.ts's existing generic child-of-aggregate-root ownership check would catch (via `session_id` ownership, not via `superset_group_id` itself); the plan should add a targeted verification step, not assume this is already covered since D-16's session-only design was not present in the schema when `poison-pill.e2e-spec.ts` was originally written |

## Sources

### Primary (HIGH confidence — read directly this session)
- `apps/api/src/db/schema/session.ts:1-171` — full schema, CHECK constraints, comments
- `packages/api-contracts/src/session.ts:1-23` — full vocabulary file
- `apps/mobile/components/SetRow.tsx:1-270` — full file
- `apps/mobile/components/SessionActionSheet.tsx:1-153` — full file
- `apps/mobile/components/ExercisePage.tsx:1-348` — full file
- `apps/mobile/lib/db/session-query.ts:1-435` — full file
- `apps/mobile/lib/session/auto-advance.ts:1-52` — full file
- `packages/pr-rules/src/personal-records.ts:1-97` — full file
- `apps/mobile/lib/db/log-set.ts:1-289` — full file
- `apps/mobile/lib/session/set-row-builders.ts:1-178` — full file
- `apps/mobile/components/ExerciseStrip.tsx:1-60` — relevant excerpt
- `apps/mobile/lib/rest-timer.ts:1-40` — relevant excerpt
- `apps/mobile/app/(tabs)/workout.tsx:1177-1300` — `handleCheckmarkPress` call site
- `apps/api/src/sync/sync.service.ts` (grep-confirmed lines 12, 209-213, 258-265, 866-872) —
  vocabulary import and shape validator
- `apps/mobile/lib/db/schema.ts` (grep-confirmed lines 35, 46-59, 90) — SQLite mirror
- `apps/mobile/lib/export/build-export-document.ts` (grep-confirmed lines 13, 15, 122, 124) —
  export emission of `side`/`parent_set_id`
- `docs/session-vocabularies.md:1-50` — vocabulary reference and written/reserved split
- `.planning/research/ARCHITECTURE.md` §1 — original grouping/set_index design rationale
- `.planning/phases/05-in-gym-session-logging/05-RESEARCH.md:419-436` — Pitfalls 2-4
- `.planning/WINDOWS.md` lines 123, 127, 150 (entries #109, #113, #136) — precedent for badge/
  dependency-freeze/auto-advance issues this phase must not repeat
- `apps/mobile/lib/db/programs/days.ts:146-150,176-178`, `duplicate-routine.ts:97-104` —
  confirmed `superset_group_id` is nulled everywhere on the program side, program-level authoring
  genuinely not built
- `.planning/config.json` — confirmed `workflow.nyquist_validation: true`,
  `workflow.security_enforcement: true`, `workflow.security_asvs_level: 1`,
  `workflow.security_block_on: "high"`, `test_command: "pnpm -w test"`

### Secondary (MEDIUM confidence)
- `.planning/phases/07-advanced-set-types/07-CONTEXT.md` and `07-UI-SPEC.md` — both already
  user-approved design contracts; treated as authoritative for decisions, cross-verified against
  code where they made a factual claim about existing code (all claims checked in this research
  confirmed accurate)

### Tertiary (LOW confidence)
- None — every claim in this document that could be checked against a file was checked; the two
  Open Questions are flagged as genuinely unresolved rather than guessed at.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new stack, every existing piece verified by direct file read
- Architecture: HIGH — the tree-flatten gap and the read-path widening gap were found by direct
  code inspection, not inferred from documentation
- Pitfalls: HIGH — each pitfall cites the exact current code that would produce the failure
- Open Questions: genuinely open — flagged rather than resolved with a guess

**Research date:** 2026-08-28
**Valid until:** No external dependency; valid until the underlying files change (i.e., effectively
for the duration of this phase's planning and execution — re-verify only if another phase modifies
`set-row-builders.ts`, `session-query.ts`, or `auto-advance.ts` before Phase 7 executes)
