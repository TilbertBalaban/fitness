# Phase 11: Program Generation - Research

**Researched:** 2026-08-29
**Domain:** Deterministic program-authoring generator over an existing offline-first program data model (no ML, no server dependency)
**Confidence:** HIGH on write-path/schema/equipment mechanics (all read from source this session); MEDIUM on split-template design; LOW/ASSUMED on the specific volume-landmark numbers (explicitly a project-authored design decision per D-15, not a verified fact)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 … D-22 — do not re-open)

**Where generation runs**
- D-01: Generation is a new shared pure package, `@fitness/program-generator`, imported by both the Expo client and the NestJS API — the same one-package rule already locked for `packages/progression-engine`. No generation logic in a screen or a controller.
- D-02: Generation runs on-device and offline. It reads local PowerSync SQLite (catalog snapshot, active gym profile, exclusions) and needs no network.
- D-03: The generator is a pure deterministic function: same inputs → byte-identical output. No `Date.now()`, no `Math.random()` inside it. "Regenerate" is an explicit `variantSeed` input threaded through candidate selection.

**Output shape and the GEN-07 guarantee**
- D-04: The generator returns a plain data tree (routine → days → exercises → per-cycle target overrides). It performs no writes itself. A thin caller hands that tree to the existing program write path.
- D-05: Nothing marks a routine as "generated" in a way that changes behaviour. Provenance, if recorded at all, is an inert metadata stamp never read by the builder, progression engine, or sync. No second program kind.
- D-06: Per-cycle prescriptions are sparse `routine_exercise_cycle_target` overrides on top of one base `routine_exercise` prescription, honouring inherit-on-null and the no-full-copy-per-cycle ban. A cycle whose targets equal the base emits no override row (`isEmptyOverride` is the gate).
- D-07: Deload and time-off cycles use the existing `CYCLE_KINDS` vocabulary (`training | deload | time_off`) and `order_index` for position. No new cycle kind.

**Candidate exercise pool (GEN-02, GEN-03)**
- D-08: The candidate pool is built by filtering the catalog through the active gym profile's resolved inventory, reusing `packages/plate-math`'s inventory/achievability layer rather than re-deriving what the gym supports.
- D-09: Exclusions are a hard filter applied last and unconditionally. An excluded exercise cannot enter a generated program by any path, including fallback degradation. If filtering empties a slot, the generator degrades the slot and reports it — never reaches past an exclusion.
- D-10: The exclusion list is a synced row-per-exercise table (`excluded_exercise`: user, exercise, timestamp), not an array inside one preference row — row-level LWW resolves each row independently.
- D-11: Exclusions are user-level and global, not per-program and not per-gym.

**Split selection and day structure**
- D-12: Splits come from a declarative template table keyed by `(splitPreference, daysPerWeek)` — each entry naming the ordered day pattern and each day's muscle-group slots. Table lookup plus filling, not procedural day invention.
- D-13: Supported split preferences for v1: full body, upper/lower, push/pull/legs, and "auto" (default) which picks the template best fitting chosen days per week.
- D-14: Session length constrains exercise count per day, not set count per exercise — trims slots to fit a per-exercise time estimate. Never cuts sets (would invalidate D-16's volume targets).

**Periodization and volume (GEN-05)**
- D-15: Volume and RIR math live in a documented constants module plus a `docs/` reference authored by this project — MacroFactor's own math is not public. The phase's research flag is closed by writing that doc, not by reverse-engineering.
- D-16: Weekly set allocation is per muscle group, driven by a landmark table indexed by experience level (a minimum-effective and adaptive-maximum bound per group). Sets ramp across training cycles from the lower bound toward the upper.
- D-17: RIR descends across training cycles within a block (easier → harder); rep ranges are set by training goal (strength → lower reps, hypertrophy → moderate, endurance → higher). Goal picks the rep band; cycle index picks the RIR; landmarks pick the sets.
- D-18: Emphasis is a three-level per-muscle-group control (deprioritize / normal / emphasize), applied as fixed multipliers on weekly set allocation, then re-clamped to landmark bounds. Emphasis never exceeds the adaptive maximum; deprioritize never drops below the minimum unless the group is excluded outright.

**Deloads (GEN-06)**
- D-19: Deload choice is none / every N cycles / final cycle only, with "every N cycles" as default. Materialized as `deload` cycles at computed `order_index` positions.
- D-20: A deload cycle is expressed only as per-cycle target overrides (reduced sets, raised RIR) against the same exercises — never removes exercises or days.

**Failure and degradation**
- D-21: Generation never produces a silently thin program. When equipment + exclusions make a slot unfillable, the result carries an explicit, structured list of what was reduced and why, surfaced before saving.
- D-22: The user reviews the generated program before it is written. Generation produces a preview tree; saving is a separate confirmed action.

### Claude's Discretion
- Screen decomposition of the generation wizard, and how many steps it spans.
- Naming of the generated routine (a sensible default derived from goal + split, editable).
- Internal module boundaries inside `@fitness/program-generator`.
- Whether provenance metadata (D-05) is recorded at all in v1.

### Deferred Ideas (OUT OF SCOPE)
- Multiple concurrent training blocks (already deferred to v2 at project level).
- Regenerating or re-periodizing a program in place after it has logged sessions against it.
- Importing a published program template from an external source.
- Auto-substituting an exercise mid-program when a gym is unavailable that day.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GEN-01 | Generate a complete program from training goal, experience level, days/week, session length | New closed vocabularies for goal/experience level (see "Vocabulary additions" below); `@fitness/program-generator` scaffold template (mirrors `packages/progression-engine`); split-template lookup structure (D-12/D-13) |
| GEN-02 | Generated program only uses exercises the active gym profile's equipment supports | `resolveInventory` (`packages/plate-math/src/inventory.ts`) + the `canEquip` predicate pattern in `apps/mobile/lib/db/session-equipment.ts` — extraction target identified below |
| GEN-03 | Excluded exercises never appear in a generated program | New `excluded_exercise` synced table, modelled exactly on `user_exercise_preference` — full file-by-file checklist below |
| GEN-04 | Choose split preference; set muscle-group emphasis/deprioritization | Split template structure (D-12/D-13), `MUSCLE_GROUPS`/`MUSCLE_ROLES` from `packages/api-contracts/src/catalog.ts`, emphasis multiplier design (D-18) |
| GEN-05 | Generated program arrives pre-periodized with per-cycle set/rep/RIR targets | Volume-landmark and RIR-progression literature below; `resolveTarget`/`isEmptyOverride`/`routine_exercise_cycle_target` sparse-override mechanics (D-06) |
| GEN-06 | Choose whether deloads are included and where | `CYCLE_KINDS` (`training\|deload\|time_off`), `order_index` placement mechanics (D-07/D-19/D-20) |
| GEN-07 | Edit a generated program exactly like a hand-built one; it progresses identically | The exact write path (`createRoutine`/`addCycle`/`addDay`≈`addExercisesToDay`/`setExerciseTargets`/`setCycleTarget`, or the bulk-transaction pattern in `duplicateRoutine`) and the progression-engine input surface (`RecommendInput.prescription`) — both detailed below, giving the parity test in "Specific Ideas" a concrete shape |
</phase_requirements>

## Summary

Program generation in this codebase is not a new subsystem so much as a new *producer* feeding
three subsystems that already exist and are already locked by prior phases: the program tree
(`routine`/`routine_day`/`routine_exercise`/`routine_cycle`/`routine_exercise_cycle_target`, Phase
4), the gym equipment/achievability model (`packages/plate-math`, Phase 6), and the progression
engine's read contract (`packages/progression-engine`, Phase 8). Nothing in this phase invents a
new table shape for the program tree, a new resolution rule, or a new equipment-loadability
check — GEN-07's "progresses identically" guarantee is true by construction only if the generator
never diverges from those three, which is exactly what D-04/D-06/D-08 already commit to.

The one genuinely new piece of schema is `excluded_exercise` (GEN-03/D-10), and this codebase
already contains its exact template: `user_exercise_preference` is a synced, per-user,
per-exercise, singleton-root table with no children, hard-delete allowed, one Postgres unique
constraint, and a five-touchpoint registration in `sync.service.ts`. `excluded_exercise` is a
strict subset of that shape (drop `neverSuggest`, drop `archivedAt`, keep `id`/`userId`/
`exerciseId`/a timestamp) and should be built by copying that pattern exactly, not by inventing a
new one. This project uses `drizzle-kit push` (schema-diff push, not generated migration files),
so "add a migration" in this phase means editing two schema files and re-running `db:push`, not
authoring SQL.

The volume-landmark and RIR-periodization math (D-15) is explicitly *not* something to look up —
MacroFactor's own numbers are not public, and the CONTEXT.md decision already closes this research
gap by mandating an authored, documented constants module. This document supplies literature-
grounded anchors (RP-style MEV/MAV/MRV bands, NSCA rep-range-by-goal, descending-RIR-within-a-block
autoregulation) and a concrete starting table per muscle group and experience level, but the table
itself is this project's own design choice, not a verified external fact, and is flagged
accordingly for confirmation.

**Primary recommendation:** Build `@fitness/program-generator` as a pure package that (1) filters
the catalog through `resolveInventory` + a promoted `canEquip`-style predicate and the new
`excluded_exercise` rows, (2) looks up a static split-template table, (3) fills slots from a static
volume/RIR/rep-range constants module, and (4) emits a plain data tree consumed by one new
`materializeGeneratedProgram` writer that is structurally a copy of `duplicateRoutine`'s
bulk-transaction pattern (routine → cycles → days → exercises → sparse overrides, one
`db.transaction`, fresh `generateClientId()`s throughout) — never the incremental
`addDay`/`addExercisesToDay`/`setExerciseTargets` call sequence, which exists for the interactive
builder and would be far slower and non-atomic for materializing a whole tree at once.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Candidate filtering (equipment + exclusions) | Browser/Client (on-device, D-02) | — | Reads local PowerSync SQLite catalog snapshot, gym profile, and `excluded_exercise` rows; no network round-trip permitted |
| Split template lookup + slot filling | Browser/Client | API/Backend (parity-test import only) | `@fitness/program-generator` is imported by both apps per D-01, but D-02 makes the client the sole live invoker — the API-side import exists to run a shared parity fixture (the same shape `progression-engine`'s D-16 in `08-CONTEXT.md` already established: "no NestJS module, service or endpoint; the api side is a spec test that imports the package directly") |
| Volume/RIR/periodization constants module | Browser/Client (bundled in the shared package) | API/Backend (parity-test import only) | Pure, static data — no I/O tier owns it; both apps read the same frozen object |
| Write path (materializing the generated tree) | Browser/Client (local PowerSync SQLite write) | Database/Storage (Postgres, via existing sync push) | The generator never writes; a client-side caller writes through the ordinary PowerSync CRUD queue exactly as the builder does — Postgres receives the same rows via the existing `sync.service.ts` apply path, no new server code needed for the program tree itself |
| `excluded_exercise` storage | Database/Storage (new synced Postgres table + SQLite mirror) | Browser/Client (local read/write via PowerSync) | A new per-user synced table, registered in `sync.service.ts` exactly like `user_exercise_preference` |
| Generation review/confirm UI (D-22) | Browser/Client | — | Preview-then-save is a screen-level concern; no other tier is involved |

## Standard Stack

### Core

No new external (npm-registry) dependencies are required by this phase. `@fitness/program-generator`
is an internal workspace package, built with the exact toolchain every sibling package
(`packages/plate-math`, `packages/progression-engine`) already uses:

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | `^5.9.2` (matches `packages/plate-math/package.json`, `packages/progression-engine/package.json` — read this session) | Language/build for the new package | Every sibling pure package in this monorepo uses this exact version; drift would be the first inconsistency in the workspace |
| Jest + ts-jest | `^30.0.0` / `^29.2.5` (matches sibling `package.json`s — read this session) | Unit tests for the new package | Same test runner as `plate-math`/`progression-engine`; `apps/mobile` uses `jest-expo`, `apps/api` uses its own `jest.config.js` — no new test framework needed anywhere in this phase |

### Supporting

No supporting libraries beyond what is already a workspace dependency (`@fitness/api-contracts`,
`@fitness/plate-math`) are needed. `@fitness/program-generator`'s own `package.json` should declare:

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
  }
}
```

verbatim structure copied from `packages/plate-math/package.json` [VERIFIED:
packages/plate-math/package.json:1-20, read this session] — same `tsconfig.json` shape
(`target: ES2022`, `module: CommonJS`, `rootDir: src`, `outDir: dist`) [VERIFIED:
packages/plate-math/tsconfig.json:1-15]. Add it to `apps/mobile/package.json` and
`apps/api/package.json` as `"@fitness/program-generator": "workspace:*"` the same way
`@fitness/progression-engine` is already listed in both [VERIFIED: apps/mobile/package.json:23,
apps/api/package.json:38, read this session].

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| A static in-code split-template table (D-12) | A database-backed template table | Rejected by D-12's own wording ("table lookup plus filling", "deterministic, diffable, unit-testable without running the whole generator") — a DB table would require sync-rules/schema work for data that never varies per user and must ship inside the pure package to stay offline-first (D-02) |
| Extracting `canEquip` into `packages/plate-math` (recommended below) | Duplicating the predicate inside `@fitness/program-generator` | Duplication directly violates D-08 ("reusing plate-math's inventory/achievability layer rather than re-deriving") — a second copy would silently drift from `session-equipment.ts`'s the moment either changes |

## Package Legitimacy Audit

Not applicable. This phase installs no external (npm-registry) packages — `@fitness/program-generator`
is a new internal workspace package following the existing `packages/progression-engine` /
`packages/plate-math` precedent [VERIFIED: packages/progression-engine/package.json,
packages/plate-math/package.json, both read this session]. The Package Legitimacy Gate does not
apply; no `npm view`/registry check is needed.

## Architecture Patterns

### System Architecture Diagram

```
[Generation Wizard UI]                         (Browser/Client, Expo Router screen)
        │  goal, experienceLevel, daysPerWeek, sessionLength,
        │  splitPreference, emphasis map, deloadChoice, variantSeed
        ▼
[@fitness/program-generator]  (pure, no I/O, no Date.now/Math.random)
        │
        ├─ 1. Candidate pool
        │     catalog snapshot (local SQLite) ──┐
        │     resolveInventory(gymProfile) ─────┼─► filter by canEquip(equipmentRequired)
        │     excluded_exercise rows ───────────┘   then subtract excluded exercise ids (D-09, last & unconditional)
        │
        ├─ 2. Split template lookup
        │     SPLIT_TEMPLATES[splitPreference ?? auto][daysPerWeek] → ordered day patterns,
        │     each day naming muscle-group slots
        │
        ├─ 3. Slot filling
        │     pick best-scoring candidate per slot (reusing the muscle-overlap scoring
        │     approach already proven in packages... apps/mobile/lib/catalog/smart-swap.ts,
        │     seeded deterministically by variantSeed)
        │
        ├─ 4. Periodization
        │     VOLUME_LANDMARKS[experienceLevel][muscleGroup] → weekly set range
        │     REP_RANGE_BY_GOAL[trainingGoal] → rep band
        │     RIR_PROGRESSION[cycleIndex] → RIR target
        │     emphasis multipliers, re-clamped to landmark bounds (D-18)
        │     deload cycles inserted per D-19/D-20 as pure override rows
        │
        └─ 5. Degradation report (D-21)
              structured list of {slot, reason, whatWasReduced}
        ▼
[GeneratedProgramTree]  (plain data: routine/day/exercise/cycle/override shape — D-04)
        ▼
[Preview screen]  (D-22 — user reviews before any write)
        │  user confirms
        ▼
[materializeGeneratedProgram]  (Browser/Client, one PowerSync db.transaction —
        │                       structurally = duplicateRoutine's bulk-insert pattern)
        ▼
[routine / routine_cycle / routine_day / routine_exercise / routine_exercise_cycle_target]
        │   (ordinary PowerSync CRUD queue — no new server code)
        ▼
[Postgres, via existing sync.service.ts applyBatch]   (Database/Storage)
        │
        ▼
[Builder screens]  ──── read via loadProgramTree, edit exactly like a hand-built program (GEN-07)
[Progression engine] ── reads via resolveTarget(base, override) → RecommendInput.prescription
```

### Recommended Project Structure

```
packages/program-generator/
├── src/
│   ├── index.ts                 # barrel export, mirrors progression-engine's index.ts
│   ├── candidate-pool.ts        # catalog + resolveInventory + excluded_exercise filtering (D-08/D-09)
│   ├── split-templates.ts       # static SPLIT_TEMPLATES table (D-12/D-13)
│   ├── volume-landmarks.ts      # VOLUME_LANDMARKS, REP_RANGE_BY_GOAL, RIR_PROGRESSION constants (D-15/D-16/D-17)
│   ├── emphasis.ts              # per-muscle-group multiplier + re-clamp (D-18)
│   ├── deload.ts                # deload cycle placement + override materialization (D-19/D-20)
│   ├── slot-fill.ts             # deterministic candidate selection per slot, seeded by variantSeed (D-03)
│   ├── degradation.ts           # structured reduction report (D-21)
│   ├── generate.ts              # the single exported entry point, composes the above into a GeneratedProgramTree
│   ├── result.ts                # GeneratedProgramTree / GenerationInput / DegradationReport types
│   └── __tests__/
├── package.json
└── tsconfig.json
```

### Pattern 1: Bulk-tree materialization, not incremental builder calls

**What:** A generated program's write caller inserts the whole tree — `routine`, then every
`routine_cycle`, then every `routine_day`, then every `routine_exercise`, then every non-empty
`routine_exercise_cycle_target` — inside one `db.transaction`, generating a fresh
`generateClientId()` per row and rewriting every foreign key through an in-memory id map keyed by
the generator's own (non-persisted) ids.

**When to use:** Any time a whole program tree must land atomically from a data structure that
already fully describes it — which is exactly D-04's contract (the generator returns a plain tree,
a thin caller writes it).

**Example (the exact existing precedent to copy — not generation code, but its structural twin):**
```typescript
// Source: apps/mobile/lib/db/programs/duplicate-routine.ts (read this session)
await db.transaction(async (tx: WriteTx) => {
  await tx.insert(routine).values({ id: routineId, name: trimmed, goal: tree.goal,
    status: 'draft', progressionFrozen: false, source: 'user',
    createdFromTemplateId: sourceRoutineId, archivedAt: null });

  const cycleIdBySourceId = new Map<string, string>();
  for (const cycle of tree.cycles) {
    const id = generateClientId();
    cycleIdBySourceId.set(cycle.id, id);
    await tx.insert(routineCycle).values({ id, routineId, orderIndex: cycle.orderIndex,
      name: cycle.name, kind: cycle.kind, durationDays: cycle.durationDays });
  }
  // ...days, then routineExercise rows, then routineExerciseCycleTarget rows only where
  // `!isEmptyOverride(override)` — never a five-column copy per cycle (D-02/D-06).
});
```
`materializeGeneratedProgram` should be this same shape with `source: 'user'` and `status: 'draft'`
unchanged (generation produces an ordinary draft program, per D-05 — no new `source` value, no new
`status`), inserting `routine_exercise_cycle_target` rows only when `isEmptyOverride` is false
[VERIFIED: packages/api-contracts/src/program.ts:1-70, read this session — `isEmptyOverride`'s
exact gate: `"True when every one of the five fields is null or absent"`].

### Pattern 2: Equipment-loadability predicate — reuse, do not re-derive (D-08)

**What:** "Can this gym load this exercise" already has one function-shaped answer in this
codebase, `canEquip`, currently private inside `apps/mobile/lib/db/session-equipment.ts`:

```typescript
// Source: apps/mobile/lib/db/session-equipment.ts (read this session, verbatim)
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

`NON_MODEL_EQUIPMENT_TYPES` (`kettlebell, bodyweight, band, medicine_ball, exercise_ball,
foam_roller, other`) [VERIFIED: apps/mobile/lib/db/session-equipment.ts, read this session — exact
comment: `"the other seven EQUIPMENT_TYPES members ... have no inventory model at all (D-14) and are
never gated by this function"`] are treated as always-equippable — there is no inventory concept
for them yet, so a candidate requiring one of these types is never excluded by the equipment filter.

**Concrete finding — do this, do not duplicate:** `canEquip` is private to `apps/mobile`, which
`@fitness/program-generator` (a package importable by `apps/api` too, per D-01) cannot depend on
without breaking the platform boundary. D-08 forbids re-deriving this logic inside the generator.
**The correct move is to promote `canEquip` (plus its `MODEL_EQUIPMENT_TYPES`/
`NON_MODEL_EQUIPMENT_TYPES` partition) out of `apps/mobile/lib/db/session-equipment.ts` and into
`packages/plate-math`**, exported alongside `resolveInventory`/`achievableBarbellLoads`, then have
both `session-equipment.ts` (its existing consumer) and `@fitness/program-generator` (its new
consumer) import the one function. This turns a currently-single-consumer private helper into the
second genuine reuse `plate-math` was built for, and is the literal mechanism that makes D-08's "no
re-deriving" true rather than aspirational.

**When to use:** Any candidate-pool filtering step that needs a boolean "can this gym produce this
equipment type" — never re-implement the barbell/dumbbell/machine branching inline.

### Pattern 3: New synced table, five-touchpoint checklist (`excluded_exercise`, GEN-03/D-10)

`user_exercise_preference` is the exact template to copy. Every file that must change:

1. **`packages/api-contracts/src/sync.ts`** — append `'excluded_exercise'` to both `SYNCED_TABLES`
   and `PUSH_APPLIED_TABLES` [VERIFIED: packages/api-contracts/src/sync.ts:1-27, read this
   session — both are literal `as const` tuples with the header comment `"Additive-only from this
   commit forward"`]. Append-only, at the end of each tuple.

2. **`apps/api/src/db/schema/catalog.ts`** (or a new sibling file) — new `pgTable('excluded_exercise', …)`:
   ```typescript
   // Modelled directly on userExercisePreference, apps/api/src/db/schema/catalog.ts:90-117 (read this session)
   export const excludedExercise = pgTable(
     'excluded_exercise',
     {
       id: text('id').primaryKey(),
       userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
       exerciseId: text('exercise_id').notNull().references(() => exercise.id, { onDelete: 'cascade' }),
       createdAt: timestamp('created_at').notNull().defaultNow(),
       serverSeq: bigint('server_seq', { mode: 'number' }).notNull().default(sql`nextval('sync_seq')`),
     },
     (table) => [
       unique('excluded_exercise_user_exercise_unique').on(table.userId, table.exerciseId),
       index('excluded_exercise_userId_idx').on(table.userId),
     ],
   );
   ```
   Every field name/type quoted above is taken verbatim from `userExercisePreference`'s own columns
   [VERIFIED: apps/api/src/db/schema/catalog.ts:90-117, read this session — quoted: `"id: text('id').primaryKey()"`,
   `"userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' })"`,
   `"exerciseId: text('exercise_id').notNull().references(() => exercise.id, { onDelete: 'cascade' })"`,
   `"unique('user_exercise_preference_user_exercise_unique').on(table.userId, table.exerciseId)"`],
   with `neverSuggest`/`archivedAt` dropped (D-10 only needs "user excluded exercise X at time T")
   and `archivedAt` replaced by a plain `createdAt` (exclusions are hard-deleted to un-exclude, per
   D-10's own row-per-exercise reasoning — there is no archive/restore concept for an exclusion).

3. **`apps/mobile/lib/db/schema.ts`** — mirror `userExercisePreference`'s mobile shape (SQLite
   `text`/`integer` types), following the exact sibling block already present at lines ~200-208
   [VERIFIED: apps/mobile/lib/db/schema.ts:200-208, read this session — quoted:
   `"export const userExercisePreference = sqliteTable('user_exercise_preference', { id: text('id').primaryKey(), userId: text('user_id').notNull(), exerciseId: text('exercise_id').notNull(), archivedAt: text('archived_at'), neverSuggest: integer('never_suggest', { mode: 'boolean' }).notNull(), updatedAt: text('updated_at').notNull(), serverSeq: integer('server_seq') })"`].

4. **`ops/powersync/sync-rules.yaml`** — add one line to the `user_data` stream:
   ```yaml
   - SELECT * FROM excluded_exercise WHERE user_id = auth.user_id()
   ```
   placed beside the existing `user_exercise_preference` line
   [VERIFIED: ops/powersync/sync-rules.yaml, read this session — exact existing line:
   `"SELECT * FROM user_exercise_preference WHERE user_id = auth.user_id()"`].

5. **`apps/api/src/sync/sync.service.ts`** — six edits, all mirroring `user_exercise_preference`'s
   existing treatment exactly [VERIFIED: apps/api/src/sync/sync.service.ts, read this session]:
   - Import `excludedExercise` from the schema.
   - Add `excluded_exercise: excludedExercise` to `TABLE_MAP` (line ~86 region).
   - Add `'excluded_exercise'` to `SINGLETON_ROOT_TYPES` (quoted comment on that set: `"An
     aggregate root owns synced children and is looked up in its own table; a singleton root ...
     owns none"` — `excluded_exercise` owns no children, exactly like `user_exercise_preference`).
   - Add `excluded_exercise: excludedExercise` to `ROOT_TABLE_BY_TYPE`.
   - Add `excluded_exercise: 0` to `AGGREGATE_RANK`.
   - **Do NOT add `'excluded_exercise'` to `HARD_DELETE_FORBIDDEN`** — that set currently holds
     only `['exercise', 'routine']` [VERIFIED: apps/api/src/sync/sync.service.ts, read this
     session, quoted: `"const HARD_DELETE_FORBIDDEN = new Set(['exercise', 'routine']);"`, with the
     comment `"Deliberately NOT include user_exercise_preference — clearing a preference by
     deleting its row is legitimate"`]. Un-excluding an exercise is exactly this same legitimate
     delete.
   - Add a `hasInvalidField` branch:
     ```typescript
     if (op.type === 'excluded_exercise') {
       const d = data as ExcludedExerciseOpData;
       if (typeof d.exercise_id !== 'string' || d.exercise_id.length === 0) return true;
       return false;
     }
     ```
     copied from the existing `user_exercise_preference` branch [VERIFIED:
     apps/api/src/sync/sync.service.ts, read this session, quoted: `"if (op.type ===
     'user_exercise_preference') { const d = data as UserExercisePreferenceOpData; if (typeof
     d.exercise_id !== 'string' || d.exercise_id.length === 0) return true; ..."`].
   - Add a `toExcludedExerciseValues` function and an `applyBatch` insert branch, both structurally
     identical to `toUserExercisePreferenceValues`/its insert branch (`onConflictDoUpdate` targeting
     the primary key, `serverSeq: nextSeq` on insert).

6. **Schema push, not a migration file** — this project uses `drizzle-kit push`
   [VERIFIED: apps/api/package.json, read this session, quoted: `"db:push": "drizzle-kit push"`,
   and `"test:e2e": "pnpm run db:push && nest build && jest ..."`]. There is no `drizzle/*.sql`
   migrations directory in this repo (confirmed empty this session). "Add a migration" for this
   phase means: edit the two schema files above, then run `pnpm --filter api db:push` (or let the
   existing `test:e2e` script's `db:push` step apply it) — never hand-author a SQL migration file.

7. **`docs/` reference** — add a new doc (e.g. `docs/excluded-exercise-shape.md`) documenting the
   table, following the exact structure `docs/program-vocabularies.md`/`docs/equipment-profile-
   shape.md` already establish (what it stores, enforcement layer, size limits if any).

### Pattern 4: New closed vocabularies for generation inputs — the four-step pattern does NOT fully apply

`docs/catalog-load-types.md`'s header names four enforcement layers for a closed vocabulary:
api-contracts tuple → Postgres CHECK → `sync.service.ts` validation → `docs/` reference. **This
phase's four new vocabularies — training goal, experience level, split preference, deload
placement — are function *parameters* to the generator, not synced database columns**, unless
D-05's discretion decides to persist provenance. That distinction matters:

- **If provenance is NOT persisted (the simpler default under D-05's discretion):** only steps 1
  and 4 of the four-step pattern apply. Declare each vocabulary as an additive-only tuple in
  `packages/api-contracts` (a new file, e.g. `src/generation.ts`, following the exact header
  comment convention already used in `program.ts`/`catalog.ts`: `"Additive-only from this commit
  forward — every client build in the field reads this tuple back through its declared order and
  membership. Append only; never insert, never reorder."` [VERIFIED: packages/api-contracts/src/
  program.ts:1-2 and packages/api-contracts/src/catalog.ts:1-2, read this session, identical
  wording in both]), and document it in a new `docs/program-generation-vocabularies.md`. **No
  Postgres CHECK and no `sync.service.ts` branch are needed**, because there is no column to
  validate — the vocabulary only ever lives inside a `GenerationInput` object passed to a pure
  function and never crosses the sync boundary.
- **If provenance IS persisted (Claude's Discretion, D-05):** model it on the **JSONB-no-CHECK**
  precedent (`equipment_profile`'s three JSON columns), not the enum-CHECK precedent — a nested
  "what the user asked for" object is closer in shape to `equipment_profile.machine_availability`
  than to a scalar `routine.status`. `docs/equipment-profile-shape.md`'s own stated reason
  [VERIFIED: docs/equipment-profile-shape.md, read this session, quoted: `"This asymmetry is
  deliberate and intentional (D-16, .planning/phases/06-.../06-CONTEXT.md): a gym's inventory is
  authored and edited as one whole JSON document and never queried across rows, so splitting it
  into child tables ... would buy nothing"`] applies just as well to a generation-provenance blob:
  it is authored once, read as a whole (if read at all), and never queried per-field. Validate it
  with a type-guard function in `sync.service.ts`'s `hasInvalidField`, exactly like
  `isEquipmentProfilePlates` — never a Postgres CHECK.

**`routine.goal` is a pre-existing free-text column, not this vocabulary.** `routine.goal` already
exists [VERIFIED: apps/api/src/db/schema/program.ts, read this session, quoted: `"goal:
text('goal')"`] and is used today purely as an optional human label passed through
`createRoutine`/`duplicateRoutine`/`loadProgramTree` unchanged and unvalidated [VERIFIED:
apps/mobile/lib/db/programs/create-routine.ts:9-17, read this session, quoted: `"goal?: string |
null"` / `"goal: input.goal ?? null"`]. It is legitimate for the generator to write a human-
readable label into it (e.g. `"Hypertrophy — Push/Pull/Legs"`), but that write is display-only and
must not be confused with, or made to double as, the closed `trainingGoal` vocabulary that drives
the periodization math — the two are different values with different lifetimes.

### Anti-Patterns to Avoid

- **Re-implementing plate/dumbbell/machine loadability inside the generator.** `resolveInventory` +
  the promoted `canEquip` (Pattern 2) is the one allowed answer; a second implementation is exactly
  the drift D-08 exists to prevent.
- **Writing the generated tree through the incremental builder functions
  (`addDay`/`addExercisesToDay`/`setExerciseTargets`, one call per row).** These exist for an
  interactive UI making one edit at a time; they are correct but slow and non-atomic for
  materializing dozens of rows at once. Use the bulk-transaction shape (Pattern 1) instead.
  This does not create a second write path in the sense D-04 forbids — it inserts into the exact
  same tables through the exact same PowerSync/Drizzle layer; it is a different call sequence
  reaching the same destination, precisely the way `duplicateRoutine` already is a different call
  sequence from `addDay`+`addExercisesToDay` reaching the same tables.
- **Persisting `trainingGoal`/`experienceLevel`/`splitPreference`/`deloadPlacement` on `routine` as
  real columns "for good measure."** D-05 is explicit that provenance must be inert if recorded at
  all, and the four-step vocabulary pattern's heavier half (Postgres CHECK, `sync.service.ts`
  validation) is unnecessary work if these values never leave the generator's own function
  boundary — see Pattern 4.
- **A per-week materialized cycle copy for periodization.** D-06/D-02 are explicit: emit sparse
  `routine_exercise_cycle_target` rows only where a cycle's resolved value differs from the base,
  gated by `isEmptyOverride`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Can this gym load this equipment type" | A new equipment-availability check inside the generator | `resolveInventory` (`packages/plate-math/src/inventory.ts`) + promoted `canEquip` (Pattern 2) | D-08 forbids re-deriving; the barbell/dumbbell/machine branching already has edge cases (`unavailableEquipmentTypes`, stack min/max) worked out and tested |
| Sparse per-cycle override resolution | A custom merge function inside the generator | `resolveTarget`/`isEmptyOverride` from `packages/api-contracts/src/program.ts` | These are the one exported resolution path every other consumer (builder cycle strip, Home next-up, `log-set.ts`) already uses — a second implementation risks disagreeing with them on a null-vs-zero edge case |
| Exercise scoring for a slot ("best chest exercise available") | A bespoke scoring function from scratch | The muscle-overlap scoring shape already proven in `apps/mobile/lib/catalog/smart-swap.ts`'s `scoreAlternatives`/`computeMuscleOverlap` | Same underlying data (`exercise_muscle_mapping`'s `weightFactor`/`role`), same "primary-primary counts more than secondary-secondary" reasoning; re-deriving would risk two different opinions about what a "good" chest exercise is inside the same app |
| Ordering new rows in a day/cycle | Ad-hoc integer increments | `appendOrderIndex`/`ORDER_INDEX_GAP` from `apps/mobile/lib/db/programs/order-index.ts` | Gap-based ordering is this codebase's one deliberate answer to the offline-reorder-conflict problem; a generator writing its own increments would produce order values indistinguishable from hand-authored ones only by luck |
| ID generation | `crypto.randomUUID()`, a new UUID library, or a sequential id | `generateClientId()` (`apps/mobile/lib/db/id.ts`) | Deliberately dependency-free per its own header comment; adding a new package for this is an explicit package-legitimacy-checkpoint trigger the codebase's own convention calls out |

**Key insight:** almost every "hard part" of program generation in this specific codebase already
has one canonical implementation from a prior phase; the generator's actual novel work is (1) the
split-template/slot-filling logic and (2) the volume-landmark/RIR constants — everything else is
composition of existing exports.

## Runtime State Inventory

Not applicable — this is a greenfield phase (new package, new table, new UI flow). No rename,
refactor, or migration of existing runtime state is involved.

## Common Pitfalls

### Pitfall 1: Treating `routine.goal` as the closed `trainingGoal` vocabulary
**What goes wrong:** A planner wires the generator's `trainingGoal` input directly into
`routine.goal` and then reads it back later to decide periodization behaviour for an already-
generated program (e.g., "regenerate uses `routine.goal` to remember the original goal").
**Why it happens:** The column is right there, named `goal`, and looks like an obvious fit.
**How to avoid:** `routine.goal` is free text with no validation anywhere in the write path
[VERIFIED: apps/api/src/sync/sync.service.ts's `hasInvalidField` `routine` branch, read this
session, validates only `status`, `name`, `progression_frozen` — `goal` is never checked]. Treat it
as a display label only; the real `trainingGoal` value lives solely inside the `GenerationInput`
passed to the pure generator function, per Pattern 4.
**Warning signs:** Any code path that reads `routine.goal` back out and branches generation logic
on it.

### Pitfall 2: Rejecting a candidate because its `equipment_required` is `null`
**What goes wrong:** `CatalogSnapshotExercise.equipment_required` is nullable (bodyweight-only
movements, or exercises the seed data never tagged) [VERIFIED: packages/api-contracts/src/
catalog.ts, read this session, quoted: `"equipment_required: EquipmentType | null"`]. A naive
filter that calls `canEquip(exercise.equipmentRequired, inventory)` unconditionally will throw or
mis-classify a `null` as "unequippable."
**Why it happens:** Most exercises do have an `equipment_required` value, so the null case is easy
to miss in casual testing.
**How to avoid:** A `null` `equipment_required` means "no equipment gate applies" — the candidate
passes the equipment filter unconditionally, the same way `smart-swap.ts`'s constraint checks treat
it (`candidate.equipmentRequired !== null && ...` guards every comparison) [VERIFIED: apps/mobile/
lib/catalog/smart-swap.ts, read this session, quoted: `"constraints.excludeEquipment &&
candidate.equipmentRequired !== null && constraints.excludeEquipment.includes(candidate.
equipmentRequired)"`].
**Warning signs:** Bodyweight-only exercises silently vanishing from every generated program.

### Pitfall 3: Letting emphasis multipliers push a group past its landmark bound
**What goes wrong:** D-18 requires emphasis to be re-clamped to `[MEV, MAV]` after the multiplier
is applied; an implementation that applies the multiplier and stores the raw result can produce a
weekly set count above MAV (overreaching) or, for "deprioritize," below MEV even when the group is
not excluded.
**Why it happens:** Clamping is easy to treat as an afterthought when the multiplier math itself is
the more interesting code to write.
**How to avoid:** Structure the emphasis function as `clamp(base * multiplier, landmark.mev,
landmark.mav)` as one atomic step, unit-tested with a case at each of the three multiplier levels
crossing both bounds.
**Warning signs:** A generated program's "emphasize" muscle group ends up with dramatically more
sets than the landmark table's own MAV for that experience level.

### Pitfall 4: Deload cycles that remove exercises instead of overriding targets
**What goes wrong:** D-20 requires a deload to keep the same exercises and days, expressed purely
as `routine_exercise_cycle_target` overrides (fewer sets, higher RIR). An implementation that
"simplifies" a deload week by dropping exercises breaks GEN-06's own wording and produces a
`routine_day` structure that differs cycle-to-cycle, which nothing downstream (builder, progression
engine, `resolveNextUp`) is built to expect — the day/exercise tree is meant to be invariant across
cycles (D-02, `docs/program-vocabularies.md`'s "A cycle owns no children").
**How to avoid:** A deload is exclusively a set of override rows against the routine's existing
`routine_exercise` ids for that cycle's `cycle_id` — never a day or exercise deletion, never a
`routine_day` created only for the deload cycle.
**Warning signs:** A generated program's deload week has fewer exercises listed than its training
weeks.

### Pitfall 5: Parity test comparing generator output to hand-built output by inspection
**What goes wrong:** The CONTEXT.md "Specific Ideas" parity claim ("builds a program by hand and
generates an equivalent one, then asserts the progression engine returns identical
recommendations") is satisfied only if the test actually calls `recommendNextPrescription`
[VERIFIED: packages/progression-engine/src/recommend.ts, read this session] with the resolved
`prescription` (`resolveTarget(base, override)`'s output — `targetRepMin`/`targetRepMax`/
`targetRir` — [VERIFIED: packages/api-contracts/src/program.ts, read this session]) from both the
hand-built and generated trees, for the same synthetic session history, and asserts the two
`ProgressionResult`s are `deepEqual`. A test that only diffs the two program trees' shapes (row
counts, column presence) is not this parity test — it does not exercise the progression engine at
all.
**How to avoid:** Route both programs' resolved targets through the actual
`recommendNextPrescription` entry point, using the shared `RecommendInput` shape
[VERIFIED: packages/progression-engine/src/result.ts, read this session, quoted: `"export interface
RecommendInput { sessions: ExerciseSessionSets[]; prescription: { targetRepMin: number | null;
targetRepMax: number | null; targetRir: number | null; }; equipmentType: EquipmentType | null;
inventory: ResolvedInventory | null; preference: ProgressionPreference; }"`].
**Warning signs:** A "parity" test file that never imports `recommendNextPrescription`.

## Code Examples

### Extracting the equipment predicate (Pattern 2), before/after

```typescript
// BEFORE — private to apps/mobile, not importable by a shared package
// apps/mobile/lib/db/session-equipment.ts (current, read this session)
function canEquip(type: EquipmentType, inventory: ResolvedInventory): boolean { /* ... */ }

// AFTER — exported from packages/plate-math, imported by both the existing caller and the
// new generator (mirrors resolveInventory/achievableBarbellLoads's own export style)
// packages/plate-math/src/equippable.ts (new file)
export const MODEL_EQUIPMENT_TYPES: EquipmentType[] = ['barbell', 'ez_bar', 'dumbbell', 'machine', 'cable'];
export const NON_MODEL_EQUIPMENT_TYPES: EquipmentType[] = EQUIPMENT_TYPES.filter(
  (type) => !MODEL_EQUIPMENT_TYPES.includes(type),
);
export function canEquip(type: EquipmentType, inventory: ResolvedInventory): boolean {
  if (inventory.unavailableEquipmentTypes.includes(type)) return false;
  if (type === 'barbell' || type === 'ez_bar') return inventory.barbellWeightKg !== null;
  if (type === 'dumbbell') return inventory.dumbbells.length > 0;
  return inventory.machines.some((machine) => machine.equipmentType === type);
}
```

### Sparse override emission, the only allowed shape (D-06)

```typescript
// Source: packages/api-contracts/src/program.ts (read this session, verbatim)
export function isEmptyOverride(override: TargetOverride): boolean {
  return (
    (override.targetSets ?? null) === null &&
    (override.targetRepMin ?? null) === null &&
    (override.targetRepMax ?? null) === null &&
    (override.targetRir ?? null) === null &&
    (override.targetRestSeconds ?? null) === null
  );
}
// The generator must call this before deciding to emit a routine_exercise_cycle_target row for
// a given (exercise, cycle) pair — a cycle whose computed targets equal the base emits nothing.
```

## State of the Art

Not applicable in the conventional sense — there is no external library or framework version to
track here. The one relevant "current vs. superseded" fact is internal: this codebase's own
program-tree schema (Phase 4) already supersedes the `ARCHITECTURE.md` §1 `ProgramWeek`/
`PeriodizationScheme` sketch in favour of the sparse-override model — the generator must target the
model that actually shipped (`routine_exercise_cycle_target`), not the earlier architecture-doc
sketch.

| Old Approach (architecture sketch, pre-Phase-4) | Current Approach (shipped, Phase 4) | When Changed | Impact |
|--------------------------------------------------|--------------------------------------|---------------|--------|
| Per-cycle `PeriodizationScheme` behind `progression_scheme_id` | Sparse `routine_exercise_cycle_target` override rows, resolved via `resolveTarget` | Phase 4 (04-CONTEXT.md D-11) | The generator emits override rows, not a scheme reference; `progression_scheme_id` stays null and unused, exactly as the builder leaves it |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Specific numeric volume-landmark table (MEV/MAV per muscle group × experience level) proposed below | Volume/RIR literature and constants table | A generated program could over- or under-load a muscle group relative to what evidence-based practice would suggest; low physical risk (generation is followed by ordinary progressive-overload logging, not a one-shot prescription) but affects perceived program quality. Explicitly sanctioned as a project design decision by D-15 — needs a human sanity-check during planning/discuss, not a "correctness" fix |
| A2 | Proposed vocabulary tokens: `trainingGoal ∈ {strength, hypertrophy, endurance}`, `experienceLevel ∈ {beginner, intermediate, advanced}`, `deloadPlacement ∈ {none, every_n_cycles, final_cycle_only}` | Vocabulary additions (below) and Pattern 4 | No existing code or prior-phase CONTEXT.md fixes these exact string tokens; a different naming choice is equally valid and this is genuinely open, not verified |
| A3 | Rep-range bands per goal (`strength: 4–6`, `hypertrophy: 8–12`, `endurance: 15–20`) are the project's own numbers, informed by but not identical to the cited NSCA %1RM-derived rep counts (1–5 / 6–12 / 15+) | Volume/RIR literature and constants table | A narrower or wider band than intended could make PRGR-04's rep-widening preference (Phase 8) behave differently than expected on generated programs specifically |
| A4 | RIR progression sequence `[3, 2, 1, 1]` (by cycle index within a block, floor at 1) is this project's own choice, informed by but not copied from the cited general autoregulation pattern (which some sources extend to a true 0 RIR) | Volume/RIR literature and constants table | A generated program's later training cycles could feel easier or harder than a hand-authored equivalent would have specified |
| A5 | `canEquip`/`MODEL_EQUIPMENT_TYPES` should be promoted from `apps/mobile/lib/db/session-equipment.ts` into `packages/plate-math` | Pattern 2 | If the planner instead leaves `canEquip` where it is and has the generator call into `apps/mobile` internals, or duplicates it, D-08's "no re-deriving" intent is technically violated even though the visible behaviour might initially match |

**If this table is empty:** N/A — see entries above; all are flagged for confirmation during
planning/discuss rather than silently locked.

## Open Questions

1. **Does D-05's "inert metadata stamp" get implemented at all in v1?**
   - What we know: it is explicitly Claude's Discretion, and D-05 requires that if implemented it
     must never be read by the builder, progression engine, or sync.
   - What's unclear: whether the planner should scope a `routine.generation_metadata` JSONB column
     (no CHECK, type-guard-only per Pattern 4) into this phase's plan at all, or defer it entirely.
   - Recommendation: default to NOT persisting it in v1 (simpler, zero new column, zero new
     `hasInvalidField` branch) unless the discuss/plan step surfaces a concrete need (e.g., "show
     the user their original wizard answers if they revisit a generated program") that only
     persistence can satisfy.

2. **Where exactly does slot-filling scoring logic live relative to `smart-swap.ts`?**
   - What we know: the muscle-overlap scoring approach in `smart-swap.ts` is proven and reusable in
     spirit (same underlying `exercise_muscle_mapping` data).
   - What's unclear: `smart-swap.ts` lives in `apps/mobile/lib/catalog/`, not in a shared package —
     it cannot be imported directly by `@fitness/program-generator` any more than `canEquip` can.
   - Recommendation: either (a) promote the muscle-overlap scoring primitives
     (`computeMuscleOverlap`, `roleOverlapWeight`) into `packages/api-contracts` or a new shared
     scoring package alongside the `canEquip` promotion, or (b) accept a deliberate, documented
     re-implementation inside `@fitness/program-generator` specifically for slot-filling (a
     different use case — ranking many candidates for an empty slot, not scoring alternatives to
     one target exercise) and note it is not covered by D-08 (which is scoped to equipment,
     not muscle-overlap scoring). This needs a plan-time decision, not a research-time one.

## Environment Availability

Not applicable — this phase adds no new external tool, service, or runtime dependency. Postgres,
PowerSync, Node/pnpm/Jest are all already required and available per prior phases.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (`^30.0.0`) + `ts-jest` for `packages/*`; `jest-expo` for `apps/mobile`; Jest with a separate `jest-e2e.json` config for `apps/api` end-to-end specs [VERIFIED: packages/progression-engine/package.json, apps/mobile/package.json, apps/api/package.json — all read this session] |
| Config file | `packages/program-generator/package.json`'s own `"test": "jest"` script (new, mirrors `packages/progression-engine/package.json`); no separate `jest.config.js` needed at the package level per the sibling precedent |
| Quick run command | `pnpm --filter @fitness/program-generator test` |
| Full suite command | `pnpm -w test` (root `package.json`'s `"test": "turbo run test"` — runs every workspace package's `test` script) [VERIFIED: package.json (root), read this session] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GEN-01 | Generator produces a complete tree from goal/level/days/session-length | unit | `pnpm --filter @fitness/program-generator test -- generate.test.ts` | ❌ Wave 0 |
| GEN-02 | Candidate pool excludes exercises the active gym can't load | unit | `pnpm --filter @fitness/program-generator test -- candidate-pool.test.ts` | ❌ Wave 0 |
| GEN-03 | `excluded_exercise` rows are never selected, including in degraded slots | unit | `pnpm --filter @fitness/program-generator test -- candidate-pool.test.ts` (same file, dedicated cases) | ❌ Wave 0 |
| GEN-03 | New synced table push/pull round-trips correctly | e2e | `pnpm --filter api test:e2e -- excluded-exercise` | ❌ Wave 0 |
| GEN-04 | Split preference + emphasis change slot selection and set counts | unit | `pnpm --filter @fitness/program-generator test -- split-templates.test.ts`, `emphasis.test.ts` | ❌ Wave 0 |
| GEN-05 | Emitted tree carries correct per-cycle set/rep/RIR targets, sparse-override gated | unit | `pnpm --filter @fitness/program-generator test -- volume-landmarks.test.ts` | ❌ Wave 0 |
| GEN-06 | Deload cycles land at correct `order_index`, only as overrides | unit | `pnpm --filter @fitness/program-generator test -- deload.test.ts` | ❌ Wave 0 |
| GEN-07 | Hand-built and generated equivalent programs yield identical `recommendNextPrescription` output | unit (parity) | `pnpm --filter @fitness/program-generator test -- parity.test.ts` (mirrors `progression-engine`'s D-08 shared-fixture pattern) | ❌ Wave 0 |
| GEN-07 | Generated program is editable via ordinary builder mutation functions post-save | e2e (durability) | `pnpm --filter mobile test:e2e:durability` (append to `apps/mobile/e2e/durability.spec.ts` / `apps/mobile/app/__durability.web.tsx`) | ⚠️ append-only shared file, per project memory (`fitness-durability-harness-seam`) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @fitness/program-generator test` (fast, pure-function unit tests — no PowerSync, no Postgres)
- **Per wave merge:** `pnpm -w test` plus, if the generation wizard or write path changed,
  `pnpm --filter mobile test:e2e:durability`
- **Phase gate:** Full suite green (`pnpm -w test`) plus a real Playwright durability run before
  `/gsd-verify-work` — this repo's standing memory authorizes running Playwright freely here
  (`fitness-e2e-authorized`), and a green run against the real `@powersync/web` database is real
  evidence, not a formality.

### Wave 0 Gaps
- [ ] `packages/program-generator/` — the whole package does not exist yet; scaffold
  `package.json`/`tsconfig.json` per the Standard Stack section before any generation logic can be
  written or tested.
- [ ] `packages/program-generator/src/__tests__/parity.test.ts` (or `__fixtures__/parity.ts`,
  mirroring `progression-engine`'s exact D-08 shared-fixture convention) — the GEN-07 parity test
  needs a fixture table importable by whichever test files exercise it.
- [ ] `apps/api/src/db/schema/excluded-exercise.ts` (or an addition to `catalog.ts`) and its
  matching `apps/api/test/*.e2e-spec.ts` coverage — no existing test file covers a table that does
  not exist yet.
- [ ] Framework install: none — Jest/ts-jest are already workspace devDependencies wherever needed.

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` [VERIFIED: .planning/config.json, read this
session].

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No (new work) | Unaffected — generation runs against the already-authenticated local session; no new auth surface |
| V3 Session Management | No | Unaffected |
| V4 Access Control | Yes | `excluded_exercise` ownership must resolve through `userId` exactly like `user_exercise_preference` — `sync.service.ts`'s existing per-op ownership resolution (userId always taken from the authenticated session, never trusted from client-supplied `data`, per the established `toUserExercisePreferenceValues` pattern quoted above) is the standard control; do not invent a second ownership check |
| V5 Input Validation | Yes | `hasInvalidField`'s `excluded_exercise` branch (non-empty `exercise_id` string) is the standard control, mirroring every other synced-table branch in that function; the generator's own inputs (goal/level/days/session-length/split/emphasis/deload choice) should be validated with TypeScript closed-union types plus a runtime type guard at the wizard's submit boundary, the same discipline `isCatalogSnapshot`/`isEquipmentProfilePlates` already apply to other wire-crossing shapes |
| V6 Cryptography | No | Unaffected — no new secrets, tokens, or crypto primitives in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| A push naming another user's `exercise_id` in an `excluded_exercise` op, attempting to exclude/probe another user's custom exercise | Tampering / Information Disclosure | The existing FK (`exercise_id references exercise.id`) plus ownership resolution through the authenticated session's `userId` — a client cannot name another user's private custom exercise id and have it resolve, since `exercise` rows are themselves owned per-user and cross-user reads are already blocked by `sync-rules.yaml`'s `WHERE user_id = auth.user_id()` scoping on every stream, including `exercise` itself |
| A malformed/oversized generation input (e.g., an absurd `daysPerWeek` or a huge `emphasis` map) crashing the pure generator or producing a pathological tree | Denial of Service | Bound every generator input at the function boundary (closed unions for `splitPreference`/`trainingGoal`/`experienceLevel`/`deloadPlacement`, a sane numeric range for `daysPerWeek`/`sessionLength`, `emphasis` restricted to `MUSCLE_GROUPS`' 19 known ids) before any candidate-pool or slot-filling logic runs — same "reject the whole input, never partially process it" discipline `isCatalogSnapshot`/`isEquipmentProfilePlates` already apply |
| A generated tree with an inconsistent id map (a `routine_exercise_cycle_target` pointing at a `cycle_id`/`routine_exercise_id` that doesn't exist in the same transaction) reaching Postgres | Tampering (data integrity) | `sync.service.ts`'s existing dual-parent-chain verification for `routine_exercise_cycle_target` (`resolveRoutineIdForCycleTarget`, already verifying both parent chains resolve to the same routine, per the `sync-rules.yaml` header comment quoted above) already rejects this class of malformed push — the write-path pattern (Pattern 1) generating ids from one in-memory map per table before any insert is what keeps a correctly-implemented generator from ever producing this in the first place |

## Sources

### Primary (HIGH confidence — read directly this session)
- `packages/api-contracts/src/program.ts`, `catalog.ts`, `equipment.ts`, `sync.ts` — closed vocabularies, `resolveTarget`/`isEmptyOverride`, `MUSCLE_GROUPS`/`MUSCLE_ROLES`, `SYNCED_TABLES`/`PUSH_APPLIED_TABLES`
- `packages/plate-math/src/inventory.ts`, `achievability.ts`, `band.ts` — `resolveInventory`, achievable-load functions, machine-selection ordering
- `packages/progression-engine/src/index.ts`, `recommend.ts`, `result.ts`, `expected-performance.ts`, `rir-band.ts`, `__fixtures__/parity.ts` — the exact input surface a generated prescription must present, and the D-08 shared-fixture parity-test convention to mirror
- `apps/mobile/lib/db/programs/create-routine.ts`, `days.ts`, `cycles.ts`, `targets.ts`, `load-program.ts`, `duplicate-routine.ts`, `order-index.ts` — the entire existing write/read path for the program tree
- `apps/mobile/lib/db/schema.ts`, `apps/mobile/lib/db/id.ts` — mobile SQLite schema, `generateClientId`
- `apps/mobile/lib/db/session-equipment.ts`, `apps/mobile/lib/catalog/smart-swap.ts` — the `canEquip` and muscle-overlap scoring precedents
- `apps/api/src/db/schema/program.ts`, `apps/api/src/db/schema/catalog.ts` — Postgres schema, `userExercisePreference`'s exact shape
- `apps/api/src/sync/sync.service.ts` — `TABLE_MAP`, `SINGLETON_ROOT_TYPES`, `ROOT_TABLE_BY_TYPE`, `AGGREGATE_RANK`, `HARD_DELETE_FORBIDDEN`, `hasInvalidField`, `toUserExercisePreferenceValues`
- `ops/powersync/sync-rules.yaml` — the `user_data` stream and its per-table join scoping
- `docs/program-vocabularies.md`, `docs/equipment-profile-shape.md`, `docs/catalog-load-types.md` — the enforcement-layer conventions this phase's new vocabularies/table must follow
- `.planning/phases/04-program-builder/04-CONTEXT.md`, `06-gym-profiles-plate-math/06-CONTEXT.md`, `08-progression-engine/08-CONTEXT.md` — prior-phase locked decisions this phase must not re-litigate
- `apps/api/package.json`, `apps/mobile/package.json`, root `package.json`, `packages/plate-math/package.json`, `packages/progression-engine/package.json`, `pnpm-workspace.yaml`, `turbo.json`, `apps/api/drizzle.config.ts` — workspace/build/test tooling, confirming `drizzle-kit push` (no migration files) and the Jest/turbo test-command shape
- `.planning/config.json` — `nyquist_validation: true`, `security_enforcement: true`, `security_asvs_level: 1`

### Secondary (MEDIUM confidence — WebSearch, cross-checked against widely-cited training-science sources)
- [RP Strength — Training Volume Landmarks for Muscle Growth](https://rpstrength.com/expert-advice/training-volume-landmarks-muscle-growth) — MEV/MAV/MRV/MV band shapes (MV ~4–8, MEV ~8–12, MAV ~16–18, MRV ~20–22 weekly sets for a typical muscle group in a trained lifter)
- NSCA-style %1RM-to-rep-range mapping (strength 1–5 reps / 85–100% 1RM, hypertrophy 6–12 reps / 67–85% 1RM, endurance 15+ reps / <67% 1RM), and descending-RIR-within-a-block autoregulation (e.g., week 1 at 3 RIR, week 2 at 2, week 3 at 1, then deload) — cross-checked across multiple general fitness-education sources returned by WebSearch, no single canonical citation

### Tertiary (LOW confidence / project-authored, flagged in Assumptions Log)
- The specific numeric volume-landmark table and RIR-progression sequence proposed in this document — explicitly this project's own design decision per D-15, not a verified external fact

## Metadata

**Confidence breakdown:**
- Standard stack / write-path / schema mechanics: HIGH — every claim traced to a file read this session, with exact quotes
- Architecture patterns (bulk-tree write, equipment predicate reuse, new-table checklist): HIGH — modelled directly on existing, working code in this repo
- Volume-landmark/RIR numeric table: LOW/ASSUMED by design (D-15 mandates project authorship; literature anchors are MEDIUM, the specific numbers are a fresh proposal pending confirmation)
- Vocabulary token names (goal/experience-level/split/deload strings): LOW/ASSUMED — genuinely open, no prior-phase precedent fixes them

**Research date:** 2026-08-29
**Valid until:** Stable — this phase's core mechanics (schema, write path, sync registration) do not depend on any external library version and will not go stale on a normal timescale. Re-verify only if a prior-phase schema file (`program.ts`, `catalog.ts`, `sync.service.ts`) changes before this phase is planned.
