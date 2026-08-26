# Phase 6: Gym Profiles & Plate Math - Research

**Researched:** 2026-08-26
**Domain:** In-repo TypeScript domain logic (bounded-knapsack plate solver, achievability resolution) + Drizzle/Postgres schema completion + PowerSync sync-rules extension + React Native/Web UI, on an existing local-first monorepo. No new external packages.
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carried forward — already locked, do not re-litigate**

- **D-01:** `equipment_profile` already exists and is unused. `apps/api/src/db/schema/equipment.ts` ships `id`, `user_id`, `name`, `is_default`, `barbell_weight_kg` (numeric 6,3), `available_plates`, `dumbbell_increments_kg`, `machine_availability` (all `jsonb`), `native_unit`, `archived_at`, `server_seq`. Nothing in the repository reads it. This phase fills it in; it does not invent it.
- **D-02:** `user_preference.default_equipment_profile_id` already exists as a nullable, no-FK pointer — deliberately no `.references()` so archiving a profile clears a pointer rather than violating a constraint. This is the active-gym pointer.
- **D-03:** Weights are canonical kg, converted only at the display boundary (`packages/api-contracts/src/units.ts`). Exact bigint-fraction conversion, `CANONICAL_KG_SCALE = 3`, `DISPLAY_SCALE = { kg: 2, lb: 1 }`, `KG_PER_LB` as an integer numerator/denominator pair. All plate math happens in canonical kg; `native_unit` is a display and authoring concern only. — Reversibility: one-way.
- **D-04:** Snapshot-on-use — anything a session's behaviour depends on is frozen onto the session row at start and never re-read from the source. D-09 applies this to the gym profile.
- **D-05:** Client-generated UUIDs before any network round-trip, aggregate-root ownership, and PowerSync as the sole ingress for per-user mutable data. `equipment_profile` is user-rooted and already carries `user_id` + `server_seq`; anything added under it joins back through the profile in `ops/powersync/sync-rules.yaml`.
- **D-06:** Vocabularies live in `packages/api-contracts/`, additive-only, with a Postgres check and the same values on the SQLite side. — Reversibility: one-way.
- **D-07:** `EQUIPMENT_TYPES` in `packages/api-contracts/src/catalog.ts` is nullable, has no Postgres CHECK, and its own comment names Phases 6/7 as the expected extenders. It is the per-exercise discriminator this phase resolves against. Extend by appending only — never insert, never reorder.
- **D-08:** Platform divergence is a `.web.tsx` sibling, never a `Platform.OS` branch; NativeWind 4 + `apps/mobile/lib/theme.ts`. No Xcode or Android SDK on this machine — native claims rest on typecheck; the web target is where this phase is exercised end to end.

**Achievability — the rule that makes GYM-06 true**

- **D-09:** Manual entry is never fought and never rewritten; app-generated loads are always achievable. This asymmetry is the whole of GYM-06. A weight you type by hand is logged exactly as typed; the plate strip simply reports that it is not loadable here. Anything the *app* puts in the field on its own (Phase 8's recommendation, warm-up sets, the previous-weight prefill) is rounded to a load the active resolved inventory can produce. Rejected: snapping on commit and a constrained keypad. — Reversibility: one-way.
- **D-10:** Rounding is nearest, ties down, and the direction is an explicit parameter — never an implicit default. `packages/pr-rules/src/warmup.ts` already carries the note that a silent round-down produces a warm-up one plate light. Working sets round nearest; warm-ups may legitimately round down. — Reversibility: costly.
- **D-11:** A logged weight never recomputes. A logged set is a fact and renders exactly as logged forever, regardless of which profile is active now. Only forward-looking suggestions and the live plate strip resolve against the currently active inventory. — Reversibility: one-way.

**The plate strip — GYM-05, in the band Phase 5 reserved**

- **D-12:** The strip shows the per-side plate stack, largest first, with the bar weight as a quiet prefix — not a total, not a barbell graphic. `20 · 10 · 2.5` is what you physically hang on one end, in loading order. Phase 5 D-20 reserved the band immediately above the docked keypad for exactly this.
- **D-13:** When the entered weight is not loadable, the strip states that and offers the nearest loadable value on each side as one-tap corrections — `not loadable · 150 ← → 155`. Informs and offers, never rewrites. Rejected: showing a plate breakdown for the nearest load.
- **D-14:** The band is "what your gym can produce for this exercise," of which plate math is the barbell case. Driven off the exercise's `equipment_type`/`load_type`: machine shows its stack range and micro-plate increment, dumbbell shows the nearest available pair, bodyweight collapses the band entirely. — Reversibility: reversible.
- **D-15:** The breakdown respects plate *counts*, not just denominations. This makes the solver a bounded knapsack rather than greedy largest-first division; the inventory is small enough for an exact search to be cheap. **Flag for the planner:** this runs on every keystroke behind a live field — it must be a pure, synchronous, unit-tested function over a resolved inventory, memoized on (inventory, target), and exercised against a degenerate inventory (one pair, no pairs). — Reversibility: costly.

**Profile shape and gym switching — GYM-01 through GYM-04**

- **D-16:** The three JSONB columns stay JSONB, but their shape is defined and validated in `packages/api-contracts/`. A gym's inventory is authored and edited as one whole document and is never queried across, so child tables would buy nothing. Validation runs in the sync push path alongside the existing validators. — Reversibility: one-way.
- **D-17:** `workout_session` gets an `equipment_profile_id` stamped once at session start. Snapshot-on-use, the same shape as `timezone`/`local_date`. GYM-04's "switch gyms mid-program" is then simply starting the next session under a different profile. — Reversibility: one-way.
- **D-18:** Switching the active gym mid-workout restamps the session going forward. Sets already logged keep their recorded weights untouched (D-11); the strip, achievability and swap candidates resolve against the new gym from that point on. — Reversibility: reversible.
- **D-19:** A default profile is seeded on first need, not demanded up front. One "My Gym" profile created the first time plate math is required, matching the user's `weight_unit`: standard bar, full commercial plate set, generous counts. `is_default` on the profile and `default_equipment_profile_id` on the preference row both already exist to carry this. — Reversibility: reversible.

**Unavailable equipment mid-workout — GYM-07**

- **D-20:** Marking equipment unavailable is session-scoped by default, with a separate explicit action to write it through to the profile. A distinct "my gym doesn't have this" action performs the profile write. Mirrors Phase 5 D-14's session-vs-program edit split. — Reversibility: costly.
- **D-21:** Unavailability is an inventory subtraction, resolved once and read by everything. The session resolves availability as the snapshotted profile's inventory minus this session's unavailable set. **Flag for the planner:** this resolved inventory is the phase's central abstraction; it should be one named function with one definition, not recomputed per call site. — Reversibility: one-way.
- **D-22:** An "alternative" is a substitute exercise from the catalog, filtered to equipment the resolved inventory still has. Reuses Phase 5 D-13's existing Swap action rather than inventing a second mechanism; the phase's contribution is making the candidate list equipment-aware via `equipment_type`. Load-only alternatives were rejected.
- **D-23:** A swap is session-only and carries the original's targets across. The substitute lands on the `session_exercise` snapshot with the original's target sets/reps/RIR, and the program is untouched. — Reversibility: reversible.

### Claude's Discretion

- The rounding *direction* per call site (D-10) — nearest for working sets, down for warm-ups — is delegated, provided the direction is an explicit parameter rather than a default baked into the rounder.
- The precise JSON shapes behind D-16, the knapsack solver's implementation strategy (D-15), and the seeded default profile's exact plate inventory (D-19) are all implementation choices for the planner, subject to the constraints recorded above.

### Deferred Ideas (OUT OF SCOPE)

- **Load-based alternatives** (same exercise, different loading scheme) as a ranked companion to exercise substitution — rejected for this phase because it needs a ranking rule this phase would have to invent. Revisit alongside Phase 8's progression engine.
- **Program write-back after an equipment-driven swap** — a one-off availability constraint is too weak a signal. If repeated swaps of the same exercise turn out to be common, a prompt belongs in a later phase, driven by history rather than a single session.
- **Gym profiles derived from location** (auto-select the gym by GPS/geofence) — never raised as a requirement; out of scope for v1.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GYM-01 | User can create multiple gym profiles and pick which is active | `equipment_profile` table + `user_preference.default_equipment_profile_id` both already exist and are unwired (D-01/D-02); Pattern 1 (aggregate-root sync push) is the missing piece. |
| GYM-02 | User can configure a profile's bar types and weights, available plate denominations and counts, and unit system | `barbell_weight_kg`, `available_plates` (jsonb), `native_unit` columns already exist; Pattern 2 (JSONB shape validation) and the bounded-knapsack solver (D-15) consume this shape. |
| GYM-03 | User can configure machine availability, weight-stack ranges, and any built-in starting resistance | `machine_availability` (jsonb) column already exists, unshaped; D-14's equipment band branches on it via `EQUIPMENT_TYPES`/`LOAD_TYPES` (already read directly, verified). |
| GYM-04 | User can assign a gym profile to a workout and switch gyms mid-program | `workout_session.equipment_profile_id` column exists (verified `session.ts:38`); `startSession` already accepts `equipmentProfileId` (verified `log-set.ts:15,38`) with zero call sites wired — Pattern 3 closes this gap; D-18 covers mid-session restamping. |
| GYM-05 | User sees a live plate breakdown while entering a barbell weight, without leaving the entry screen | `NumericKeypad.tsx`'s `RESERVED_BAND_HEIGHT` slot (verified lines 70/89) is the exact mount point; the solver (D-15) must be pure/memoized to run per keystroke (Pitfall 5). |
| GYM-06 | User is only ever shown loads their active profile's actual equipment can produce | D-09/D-10's achievability + rounding module, replacing `warmup.ts`'s `roundingIncrementKg` placeholder (verified header comment naming this phase). |
| GYM-07 | User can mark equipment unavailable mid-workout and be offered alternatives | D-20/D-21's resolved-inventory function feeds D-22's extension of the already-present `SwapConstraints` seam in `smart-swap.ts` (verified lines 32-36); WINDOWS #138's db-threading gap (Pitfall 2) must be closed as part of exercising this path. |
</phase_requirements>

## Summary

This phase does not introduce a new technology. `equipment_profile` (Postgres + Drizzle + the PowerSync SQLite mirror) already exists, is already streamed by `ops/powersync/sync-rules.yaml`, and is entirely unread and unwritten by application code — `apps/api/src/sync/sync.service.ts` has **zero** case for `equipment_profile` in its CRUD-op switch (verified by grep: only one match for the string anywhere in that ~2000-line file, and it is the unrelated `workoutSession.equipmentProfileId` read). Phase 6's job is therefore almost entirely: (1) complete the sync push path for `equipment_profile` following the exact pattern already used for `routine`/`personal_record` (aggregate root: `nextval('sync_seq')` on insert, `onConflictDoUpdate` + `patchAwareSet` on update); (2) define and validate the shape of the three JSONB columns in `packages/api-contracts/`; (3) write a pure, synchronous bounded-knapsack plate solver and an achievability/rounding module in a new or existing local package; (4) wire `workout_session.equipment_profile_id` (column exists, unwired — no current call site of `startSession` passes it); (5) fill the reserved 40px band `NumericKeypad.tsx` already carves out (`RESERVED_BAND_HEIGHT = 40`, comment: "R8: an always-rendered, empty layout slot — Phase 6 fills this, Phase 5 leaves it blank"); and (6) extend the existing `SwapConstraints` seam (`excludeEquipment`/`allowEquipment`) in `smart-swap.ts`, which a Phase 5 comment already anticipated for this purpose (mislabeled "Phase 7" in that comment — a stale reference, since CONTEXT.md D-22 assigns GYM-07's alternatives to Phase 6).

**Primary recommendation:** Treat this phase as schema-completion + pure-function-library work, not new-infrastructure work. Every extension point (the JSONB columns, the reserved keypad band, the `SwapConstraints` allow/exclude lists, `workout_session.equipment_profile_id`, `EQUIPMENT_TYPES`'s explicit "Phase 6/7" comment) was deliberately left waiting by Phases 4–5. Build the plate solver and achievability resolver as pure, dependency-free functions in a shared package (mirroring `packages/pr-rules`'s shape) so both the live-typing plate strip and Phase 8's progression engine can import the same rounding contract without duplicating it.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Gym profile CRUD (bars, plates, dumbbells, machines) | Client (local-first write via PowerSync) | API (sync push validation) | Same pattern as `routine`/`exercise` — client-generated UUID, written locally first, validated and upserted server-side on sync push (D-05). |
| JSONB shape validation for the three profile columns | Shared package (`packages/api-contracts`) | API (`sync.service.ts` push path) | D-16: shape defined once in the contract package, enforced at the same layer every other vocabulary/shape is enforced (the sync push validator), matching `isCatalogSnapshot`'s existing pattern. |
| Plate/dumbbell/machine solver (bounded knapsack) | Shared package (pure function) | Client (called live, per keystroke) | D-15 requires a pure, synchronous, memoized function — it must be importable by both the client's live keypad UI and (via the same import) any future server-side sanity check, with zero DB or React dependency. |
| Achievability rounding (nearest/down, explicit direction param) | Shared package (pure function) | Client (prefill/warm-up call sites), Phase 8 (progression output) | D-10: one rounder, direction passed explicitly at each call site — `packages/pr-rules/src/warmup.ts` already has a placeholder comment naming this phase as its replacement for `roundingIncrementKg`. |
| Resolved inventory (profile − session-unavailable set) | Client (local-first read, session-scoped) | — | D-21: one named function, computed from locally-held `equipment_profile` + session-local unavailable-equipment state; never re-derived per call site, never touches the network. |
| Plate strip / equipment band UI | Client (React Native + `.web.tsx` sibling only if a genuine divergence appears) | — | D-12/D-14: mounts into the reserved band `NumericKeypadView` (client component) already carves out; D-08 default is one shared file unless a real platform gesture/rendering gap forces a split. |
| Gym profile write-through for "my gym doesn't have this" (D-20) | Client (write to `equipment_profile` JSONB via sync) | API (sync push validation, same as any other profile edit) | It is an ordinary profile edit distinguished only by which UI action triggers it — no new server capability. |
| Session-scoped "unavailable right now" | Client (session-local; likely a new nullable/JSON column or table on `session_exercise`/`workout_session`, per-planner) | — | D-20/D-21: this is new client+schema surface this phase adds — it is not the same row as the profile edit. |
| Alternative-exercise filtering by equipment | Shared package (extends existing `scoreAlternatives`/`SwapConstraints` in `smart-swap.ts`) | Client (`SessionActionSheet`'s existing `swap` action) | D-22: reuses Phase 5's Swap action and its already-present `excludeEquipment`/`allowEquipment` constraint shape — no new mechanism. |

## Standard Stack

### Core

No new runtime dependencies. This phase is built entirely on packages already installed and versioned in this monorepo:

| Library | Version (as pinned in this repo) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | Already installed (see `apps/api/package.json`; used throughout `apps/api/src/db/schema/*`) | `equipment_profile` table definition, new push-path handling | Already the project's sole Postgres ORM (D-06/D-16 pattern). |
| TypeScript (project-pinned `^5.9.2` per `packages/pr-rules/package.json`) | 5.9.2 | Pure-function plate solver, achievability module | Matches every other shared package in the monorepo. |
| Jest (`^30.0.0`, project-pinned) + `ts-jest` (`^29.2.5`) | as pinned | Unit tests for the solver (D-15's "must be exercised against a degenerate inventory" requirement) | Matches `packages/pr-rules`'s existing test setup exactly — no new test runner. |
| `@fitness/api-contracts` (workspace package) | `0.0.0` (internal, unversioned workspace package) | Home for `EQUIPMENT_TYPES` (already present), the new equipment-profile JSON shape validators, and any new vocabularies this phase needs | Existing convention (D-06). |

### Supporting

No new supporting libraries. Reused, already-present modules:

| Asset | Location | Purpose | When to Use |
|---------|---------|---------|-------------|
| `toCanonicalKg`/`fromCanonicalKg`/`KG_PER_LB`/`CANONICAL_KG_SCALE`/`DISPLAY_SCALE` | `packages/api-contracts/src/units.ts` | Exact bigint-fraction kg/lb conversion | Every plate-math computation converts through this, never introduces its own float or decimal arithmetic. |
| `roundToIncrement`, `WARMUP_STEPS`, `warmupSets` | `packages/pr-rules/src/warmup.ts` | Existing rounding call site this phase's achievability module replaces `roundingIncrementKg` for | This is the first real consumer of achievable-load rounding — read its existing signature before designing the new rounder so the replacement is a drop-in, not a rewrite. |
| `scoreAlternatives`, `SwapConstraints`, `SwapExercise` | `apps/mobile/lib/catalog/smart-swap.ts` | Equipment-aware exercise-swap candidate filtering | D-22 extends this — do not build a second candidate-scoring mechanism. |
| `EQUIPMENT_TYPES`, `EquipmentType` | `packages/api-contracts/src/catalog.ts` (lines 81-95) | Per-exercise discriminator this phase's plate/machine/dumbbell branch (D-14) switches on | Already on every catalog exercise row (`exercise.equipment_required`); no migration needed to read it. |
| `patchAwareSet`, aggregate-root insert pattern (`routine`, `personal_record` cases) | `apps/api/src/sync/sync.service.ts` | The exact push-path shape to replicate for `equipment_profile` | `equipment_profile` is a user-rooted aggregate with its own `server_seq` — same shape as `routine`/`personal_record`, not a child row like `session_exercise`. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure bounded-knapsack in a shared TS package | A generic constraint-solver library (e.g. a JS CP/ILP package) | Rejected — inventory sizes are trivially small (a handful of denominations, single-digit pair counts per D-15), and CONTEXT.md explicitly wants a hand-written, unit-tested pure function, not a new dependency for a problem this small. |
| Extending `equipment_profile`'s existing JSONB columns | Splitting plates/dumbbells/machines into three new synced child tables | Rejected by D-16 explicitly: "a gym's inventory is authored and edited as one whole document and is never queried across, so child tables would buy nothing and cost three new synced tables plus per-row conflict resolution." |
| Session-scoped unavailable-equipment as a new column/table | Overloading `machine_availability` on the live profile to mean "right now" | Rejected by D-20/D-21: conflating temporary and permanent unavailability in the same JSONB would make "busy today" indistinguishable from "this gym lacks it" for every later reader. |

**Installation:**
```bash
# No installation required — this phase adds no package.json dependency.
# All work is new files/exports inside apps/api, apps/mobile, and packages/{api-contracts,pr-rules}
# (or a new packages/plate-math workspace package, at the planner's discretion — see Open Questions).
```

**Version verification:** N/A — no new package versions to verify. If the planner elects to create a new workspace package (e.g. `packages/plate-math`), its `package.json` should mirror `packages/pr-rules/package.json` verbatim (verified content above) rather than introducing new devDependency versions.

## Package Legitimacy Audit

**Not applicable — this phase installs no external packages.** No `npm view` / registry check was run because there is nothing to check; every dependency this phase touches (`drizzle-orm`, `jest`, `ts-jest`, TypeScript, `@expo/vector-icons`, NativeWind) is already installed and in use elsewhere in the repo. If the planner's task breakdown introduces any new package, it must re-run the Package Legitimacy Gate at that point — this section is a placeholder confirming the gate was considered, not skipped by omission.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────── Client (React Native + Web) ───────────────────────────────┐
│                                                                                              │
│  Profile tab (apps/mobile/app/(tabs)/profile.tsx)                                          │
│    │  create/edit gym profile (bars, plates+counts, dumbbells, machines, stack ranges)      │
│    ▼                                                                                        │
│  equipment_profile (local SQLite mirror, PowerSync)  ◄──────────────┐                       │
│    │  write via PowerSync (client-generated UUID, D-05)             │ pull (auto_subscribe) │
│    ▼                                                                 │                       │
│  startSession(equipmentProfileId) ──► workout_session.equipment_profile_id (stamped once,   │
│    │                                   D-17; restampable mid-session, D-18)                  │
│    ▼                                                                                        │
│  resolveInventory(profile, sessionUnavailableSet)  ◄── D-21: ONE named function              │
│    │                                                                                        │
│    ├──► Achievability module (packages/*, pure)                                             │
│    │      roundToAchievable(targetKg, inventory, direction) ── D-09/D-10                    │
│    │      used by: warm-up generator, prefill, (later) Phase 8 recommendations              │
│    │                                                                                        │
│    ├──► Plate/stack/dumbbell solver (packages/*, pure, memoized on (inventory,target))       │
│    │      solvePlateBreakdown(targetKg, inventory) ── D-15, bounded knapsack over counts     │
│    │      called on every keystroke from the reserved keypad band (NumericKeypad.tsx,        │
│    │      RESERVED_BAND_HEIGHT slot) ── D-12/D-13/D-14                                       │
│    │                                                                                        │
│    └──► scoreAlternatives(..., { excludeEquipment, allowEquipment }) ── D-22                 │
│           (extends existing smart-swap.ts; surfaced via SessionActionSheet's 'swap' action)  │
│                                                                                              │
│  Manual weight entry (NumericKeypad) ──► logged_set.weight_kg, UNCHANGED, never re-rounded   │
│    (D-09: strip reports "not loadable · 150 ← → 155", never rewrites the field)              │
│                                                                                              │
└──────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                                 │ PowerSync CRUD ops (push queue)
                                                 ▼
┌────────────────────────────────── NestJS API (sync.service.ts) ────────────────────────────┐
│                                                                                              │
│  CRUD-op switch — NEW case needed: op.type === 'equipment_profile'                          │
│    validateEquipmentProfileShape(data)  ── D-16, mirrors isCatalogSnapshot's gate            │
│    insert/onConflictDoUpdate, nextval('sync_seq'), same shape as 'routine'/'personal_record' │
│                                                                                              │
└──────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                                 ▼
                                    Postgres: equipment_profile (already migrated, D-01)
                                    ops/powersync/sync-rules.yaml already streams it (line 34)
```

### Recommended Project Structure

No new top-level directories. Additions land inside existing locations:

```
packages/
├── api-contracts/src/
│   └── equipment.ts          # NEW: EquipmentProfile JSON shape, EQUIPMENT_TYPES already lives
│                              #      in catalog.ts (no move needed — just import it)
├── pr-rules/src/
│   └── warmup.ts              # MODIFIED: roundingIncrementKg param replaced by the new
│                              #           achievability module's rounder (signature already
│                              #           anticipates this, per its own header comment)
└── plate-math/  (NEW package, planner's discretion — or fold into pr-rules)
    └── src/
        ├── solver.ts          # solvePlateBreakdown — bounded knapsack over denominations+counts
        ├── achievability.ts   # roundToAchievable(targetKg, inventory, direction)
        └── inventory.ts       # resolveInventory(profile, sessionUnavailableSet) — D-21

apps/api/src/
├── db/schema/equipment.ts     # UNCHANGED — table already complete (D-01)
└── sync/sync.service.ts       # MODIFIED: add EquipmentProfileOpData interface,
                                #           toEquipmentProfileValues(), CRUD-switch case,
                                #           EQUIPMENT_PROFILE_PATCH_FIELDS, shape validation call

apps/mobile/
├── app/(tabs)/profile.tsx     # MODIFIED: gym profile list/create/edit entry point
├── components/
│   ├── NumericKeypad.tsx      # MODIFIED: RESERVED_BAND_HEIGHT slot (line 89) now renders the
│   │                          #           plate/machine/dumbbell band instead of an empty View
│   ├── PlateStrip.tsx         # NEW (or similar name) — D-12/D-13/D-14's band UI
│   └── SessionActionSheet.tsx # LIKELY MODIFIED — D-20's "mark unavailable" action needs a home;
│                              #           confirm against the fixed 4-row list (swap/remove/
│                              #           reorder/info) before assuming a 5th row is correct
└── lib/
    ├── db/log-set.ts          # MODIFIED: wire equipmentProfileId into startSession call sites
    │                          #           (currently zero call sites pass it — verified by grep)
    └── catalog/smart-swap.ts  # MODIFIED: SwapConstraints already has excludeEquipment/
                                #           allowEquipment (D-22 fills these in, doesn't invent them)
```

### Pattern 1: Aggregate-root sync push (equipment_profile)

**What:** Follow the exact shape `routine` and `personal_record` already use in `sync.service.ts` — both are user-rooted aggregates with their own `server_seq`, unlike child rows (`session_exercise`, `logged_set`) which inherit ordering from their parent.

**When to use:** For the `equipment_profile` push-path case this phase must add — it is currently entirely absent from the switch.

**Example:**
```typescript
// Source: apps/api/src/sync/sync.service.ts, verified pattern from the 'routine' case
// (op.type === 'routine' branch) — equipment_profile is the same shape: user-rooted,
// carries its own server_seq, no parent to inherit ordering from.
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

### Pattern 2: JSONB shape validation gate (mirrors `isCatalogSnapshot`)

**What:** A pure type-guard function that runs before the transaction opens, rejecting a malformed op rather than writing a partial/corrupt shape.

**When to use:** For validating `available_plates`, `dumbbell_increments_kg`, `machine_availability` shapes on every `equipment_profile` push (D-16).

**Example:**
```typescript
// Source: packages/api-contracts/src/catalog.ts (verified, lines 148-166) —
// isCatalogSnapshot is the existing precedent for "validate shape before any DB write."
// The equipment-profile equivalent should follow this exact contract: pure function,
// no I/O, returns a type predicate, called before the sync transaction opens.
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

### Pattern 3: Snapshot-on-use for the session's equipment profile

**What:** `workout_session.equipment_profile_id` (column already exists, verified `apps/api/src/db/schema/session.ts:38`) is stamped once at session start and restamped only by the explicit mid-session gym-switch action (D-17/D-18) — never re-derived from `user_preference.default_equipment_profile_id` on a later read.

**When to use:** Every session-start call site.

**Example:**
```typescript
// Source: apps/mobile/lib/db/log-set.ts (verified, lines 15/26-42) — startSession already
// accepts equipmentProfileId; no current call site (history.tsx, session-lifecycle.ts,
// history-mutations.ts, __durability.web.tsx) passes one. This phase's job is exclusively
// to thread the active gym's id through at each of these call sites, following the same
// "stamped once, D-06's stamp-once pattern" the function's own header comment already documents.
export async function startSession(
  input: StartSessionInput = {},
  db: WriteHandle = getPowerSync(),
): Promise<string> {
  // ... existing body, equipmentProfileId: input.equipmentProfileId ?? null already wired
}
```

### Anti-Patterns to Avoid

- **Snapping the entered value on commit:** D-09 explicitly rejects this — a manually typed weight is logged exactly as typed, forever. Only app-generated values (prefill, warm-ups, future Phase 8 output) get rounded before they ever reach the field.
- **Recomputing a logged set's plate breakdown against the currently active profile:** D-11 — a logged weight never recomputes. The plate strip and achievability only ever resolve against the *live* session's *currently* active inventory for forward-looking display, never to reinterpret history.
- **A second solver reimplementation per call site:** D-15 flags this explicitly — the solver must be one pure function, memoized, imported everywhere it's needed (warm-up rounding, live strip, future Phase 8), not reimplemented ad hoc at each site.
- **Greedy largest-first plate division ignoring counts:** Rejected by D-15 — GYM-02 says "denominations and counts" explicitly; a greedy solution that assumes infinite plates will recommend combinations the user does not physically own.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exact decimal kg↔lb conversion | A new float-based or decimal-string conversion routine for plate math | `toCanonicalKg`/`fromCanonicalKg`/`KG_PER_LB` (`packages/api-contracts/src/units.ts`, verified bigint-fraction implementation) | D-03: all plate math happens in canonical kg; reusing the existing exact-fraction machinery avoids reintroducing the exact float-drift bug this package was built to prevent. |
| Exercise substitute candidate list | A second scoring/filtering mechanism for equipment-driven swaps | `scoreAlternatives` + `SwapConstraints` (`apps/mobile/lib/catalog/smart-swap.ts`) | D-22: reuses Phase 5's Swap action rather than inventing a second mechanism; the constraint shape (`excludeEquipment`/`allowEquipment`) already exists and is unused. |
| Vocabulary/enum enforcement | A new ad hoc validation pattern for the JSONB shapes or any new closed vocabulary this phase adds | The contract-package + Postgres CHECK + sync-validator triple (`docs/catalog-load-types.md`, `docs/program-vocabularies.md`, `docs/session-vocabularies.md` all document this same pattern) | D-06: PITFALLS.md §9's "undocumented discriminator" cost was paid once already (`load_type`); do not pay it again for equipment shapes. |
| Rounding-direction defaults | A rounder that silently defaults to round-down or round-nearest | D-10's explicit-parameter rounder, following `packages/pr-rules/src/warmup.ts`'s own documented hazard (a silent round-down produces a warm-up one plate light) | The direction must be passed at the call site — baking in a default is exactly the bug this decision exists to prevent. |

**Key insight:** Every "don't hand-roll" item in this phase is a case of *reusing a seam Phases 4-5 already built and deliberately left unfilled* — not avoiding a third-party library. The discipline here is architectural (one solver, one rounder, one resolved-inventory function, one validation pattern), not about avoiding npm packages.

## Common Pitfalls

### Pitfall 1: `equipment_profile` sync push path does not exist yet

**What goes wrong:** A plan that assumes "the table already syncs, I just need to build UI on top of it" will discover mid-implementation that writes silently fail or throw, because `sync.service.ts`'s CRUD-op switch has no case for `op.type === 'equipment_profile'`.

**Why it happens:** D-01 in CONTEXT.md is easy to misread as "fully wired but unread" — it is actually "table exists, is streamed for *pull*, and has zero push handling." Verified directly: grepping `apps/api/src/sync/sync.service.ts` for `'equipment_profile'` (the CRUD-switch string form other tables use) returns nothing; the only match for `equipmentProfile` in the whole file is the unrelated `workoutSession.equipmentProfileId` field mapping.

**How to avoid:** Task 1 of this phase's plan should add the full push-path case (Pattern 1 above) before any client UI that writes to a gym profile is built, or the first save silently fails against production sync semantics.

**Warning signs:** A gym-profile save in the UI appears to succeed locally (PowerSync's optimistic local write) but the profile never appears after a fresh pull on a second device — the classic symptom of a local-only write with no server-side upsert.

### Pitfall 2: `swapSessionExercise`'s db-threading gap (WINDOWS #138)

**What goes wrong:** `handleSwapPick` in `ExercisePage.tsx` calls `swapSessionExercise(sessionExerciseId)` without threading the isolated test/harness `db` handle through — the same defect Phase 5 found and fixed for Targets/Note/Reorder (WINDOWS #134/#135/#138), but left unfixed for Swap because no plan had yet browser-tested that path.

**Why it happens:** Every write helper in this codebase defaults to `db: WriteHandle = getPowerSync()`, which resolves the production singleton unless a caller explicitly threads a test-scoped handle through. The pattern is well-established (D-05's write-path convention) but must be applied at every new call site individually.

**How to avoid:** Since D-22 is the first phase to actually exercise the Swap path end-to-end (equipment-aware alternatives), this phase's plan must include the fix for `handleSwapPick` — pass `db ?? getPowerSync()` through, matching the pattern already used for Targets/Note/Reorder.

**Warning signs:** A Playwright durability spec for the equipment-driven swap flow passes against the wrong SQLite file (writes silently land in the production singleton instead of the test harness's isolated database) — exactly the failure mode WINDOWS #138 already describes for this same code path.

### Pitfall 3: JSONB shape drift between Postgres and the SQLite mirror

**What goes wrong:** The Postgres columns (`available_plates`, `dumbbell_increments_kg`, `machine_availability`) are real `jsonb` (verified `apps/api/src/db/schema/equipment.ts:15-17`); the SQLite mirror stores the identical columns as plain `text` (verified `apps/mobile/lib/db/schema.ts:128-130`). A write path that forgets to `JSON.stringify` before the local insert, or `JSON.parse` before reading, produces a value that looks correct in Postgres but is unusable (or a literal `"[object Object]"` string) on the client, or vice versa.

**Why it happens:** Drizzle's `jsonb()` column type on the Postgres side auto-serializes; SQLite has no native JSON column type, so the mirror is a plain text column and the serialize/deserialize step is entirely manual, on both the read and write path.

**How to avoid:** Write one shared serialize/deserialize helper (co-located with the shape validators in `packages/api-contracts/src/equipment.ts`) and route every read/write of these three columns through it, on both the API and client sides — never inline `JSON.parse`/`JSON.stringify` at each call site.

**Warning signs:** A gym profile created on web appears empty (`[]` or `null`-equivalent) when read on native, or the plate solver throws on a value that "should" be an array.

### Pitfall 4: `EQUIPMENT_TYPES` has no Postgres CHECK constraint

**What goes wrong:** Unlike `load_type` (which has both a contract-package tuple AND a Postgres CHECK, per `docs/catalog-load-types.md`), `EQUIPMENT_TYPES` (`packages/api-contracts/src/catalog.ts:81-95`) is explicitly documented as having no CHECK — "Phases 6/7 are expected to extend it, so keeping enforcement in the contract package plus the sync validator leaves this additive without a migration." A plan that assumes database-level enforcement of this vocabulary will be wrong.

**Why it happens:** This was a deliberate Phase 3/4 tradeoff, documented directly in the source comment, to avoid a migration every time this phase (or Phase 7) needs to append a new equipment type.

**How to avoid:** If this phase needs to append a new value to `EQUIPMENT_TYPES` (append-only, never reorder — per the file's own header comment), the sync-validator-side `EQUIPMENT_TYPES` Set (already built from the tuple in `sync.service.ts`, not retyped) is the only enforcement; do not assume a CHECK constraint will catch an invalid write.

**Warning signs:** A malformed equipment-type value passes a Postgres write silently because there is genuinely no database-level constraint to catch it — the sync validator is the sole backstop, and a bug there is invisible until a client renders `undefined` for an unrecognized type.

### Pitfall 5: Live per-keystroke solver performance

**What goes wrong:** D-15 flags this directly — the plate solver runs on every keystroke behind a live-typing field. An unmemoized or non-pure implementation (e.g. one that re-reads the profile from the reactive DB on every call, or allocates heavily per call) will visibly lag the keypad.

**Why it happens:** It is tempting to make the solver "just work" against the live PowerSync query result directly, coupling it to React re-render timing instead of treating it as a pure function of `(inventory, target)`.

**How to avoid:** The solver must be pure and synchronous with no DB/React dependency, and memoized on its `(inventory, target)` input pair (per D-15's explicit instruction) at the call-site layer, not inside the solver itself.

**Warning signs:** Typing a weight value feels laggy or the plate strip flickers/lags behind the keypad's own digit-by-digit updates.

## Code Examples

Verified patterns from this repository (no external docs needed — this phase extends existing in-repo conventions exclusively):

### Existing reserved UI slot the plate strip fills

```typescript
// Source: apps/mobile/components/NumericKeypad.tsx (verified, lines 70/85-91)
const RESERVED_BAND_HEIGHT = 40;
// ...
return (
  <View className="border-t border-foreground-muted bg-background">
    {/* R8: an always-rendered, empty layout slot — Phase 6 fills this, Phase 5 leaves it blank. */}
    <View style={{ height: RESERVED_BAND_HEIGHT }} />
    {/* ... digit grid ... */}
  </View>
);
```

### Existing achievability-adjacent rounder this phase's module supersedes

```typescript
// Source: packages/pr-rules/src/warmup.ts (verified, full file read)
// The 40/60/80 percent, 10/5/3 rep warm-up scheme is this project's own evidence-informed
// convention, not MacroFactor's undocumented internal formula — no public specification exists
// (PITFALLS.md Pitfall 8). Phase 6 replaces roundingIncrementKg with the active gym profile's
// real plate increments behind this same signature.
export const DEFAULT_ROUNDING_INCREMENT_KG = 2.5;
export function roundToIncrement(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}
export function warmupSets(
  workingWeightKg: number | null,
  roundingIncrementKg: number = DEFAULT_ROUNDING_INCREMENT_KG
): WarmupSet[] { /* ... */ }
```

### Existing equipment-aware swap seam (unused until this phase)

```typescript
// Source: apps/mobile/lib/catalog/smart-swap.ts (verified, lines 32-36, 179, 193-203)
// "Phase 7 owns equipment_profile.machine_availability" — this comment predates the current
// phase numbering; CONTEXT.md D-22 assigns this filtering to Phase 6. Flag as a stale in-repo
// comment to correct when this constraint is finally filled in.
export interface SwapConstraints {
  excludeEquipment?: string[];
  allowEquipment?: string[];
}
// scoreAlternatives(target, candidates, mappings, preferences, userId, constraints) already
// applies constraints.excludeEquipment / constraints.allowEquipment as filters before scoring.
```

## State of the Art

Not applicable in the usual sense — there is no external "state of the art" for this phase's core problem (bounded-knapsack plate math over a small, user-owned inventory is a closed, well-understood combinatorial problem, not an evolving external API). The one relevant "old approach → current approach" shift is internal to this project:

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `warmupSets`'s `roundingIncrementKg` param defaults to a flat `2.5` for every user | Rounding increment resolved from the active gym profile's real plate/dumbbell/machine increments via this phase's achievability module | This phase | Warm-ups (and any future prefill/recommendation) become gym-aware instead of assuming a generic commercial-gym increment. |

**Deprecated/outdated:** None — `DEFAULT_ROUNDING_INCREMENT_KG` in `warmup.ts` should likely remain as a fallback for a user with no configured profile (or become the seeded default profile's own increment, per D-19), not be deleted outright; confirm with the planner whether it stays as a genuine fallback constant.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A new `packages/plate-math` workspace package is the right home for the solver/achievability module, rather than folding it into `packages/pr-rules` | Recommended Project Structure | Low — either location works structurally (both are plain workspace packages with the same `tsconfig`/`jest` shape); this is a naming/organization choice, not a technical constraint, and CONTEXT.md leaves it to the planner. |
| A2 | The "mark equipment unavailable mid-workout" action (D-20) needs a new entry point in the UI, most likely `SessionActionSheet` or the plate/equipment band itself, rather than an entirely separate screen | Recommended Project Structure | Medium — if the planner picks a different UI location, downstream `04-UI-SPEC.md`/`05-UI-SPEC.md`-style contract work may need to re-derive the exact interaction; this is explicitly left to the planner's UI-SPEC pass, not locked by CONTEXT.md. |
| A3 | Session-scoped "unavailable equipment" (D-20/D-21) requires a new column or small table, not reuse of an existing column | Architectural Responsibility Map | Medium — the exact shape (JSON column on `workout_session`, or a new child table keyed by session + equipment identifier) is unspecified in CONTEXT.md and is genuinely a planner decision; getting the cardinality wrong (e.g. one unavailable item vs. a set) would need a follow-up migration. |
| A4 | `EQUIPMENT_TYPES`'s "Phase 7" comment in `smart-swap.ts` is simply stale relative to the current phase numbering, not evidence of a deliberate hand-off to a later phase | Code Examples | Low — CONTEXT.md D-22 is explicit and recent (2026-08-26) that this phase owns GYM-07's alternatives; the comment predates that decision and should be corrected as part of this phase's work, not treated as a scope boundary. |

## Open Questions

1. **Exact JSON shape for the three `equipment_profile` JSONB columns**
   - What we know: `available_plates` needs denomination + count (D-15); `dumbbell_increments_kg` is an array of available increments; `machine_availability` needs per-exercise or per-machine boolean/range data plus stack range and base resistance (GYM-03, `machine_availability` jsonb column already exists).
   - What's unclear: the precise field names and nesting — CONTEXT.md D-16 explicitly delegates this to the planner ("The precise JSON shapes behind D-16 ... are all implementation choices for the planner").
   - Recommendation: Design the shape in the plan itself, validate it with `isEquipmentProfilePlates`-style guards (Pattern 2), and document it in a new `docs/equipment-profile-shape.md` following the exact structure `docs/catalog-load-types.md` and `docs/program-vocabularies.md` already establish for this project.

2. **Where the "mark unavailable" action surfaces in the UI**
   - What we know: `SessionActionSheet` currently has exactly 4 fixed rows (`swap`, `remove`, `reorder`, `info` — verified `apps/mobile/components/SessionActionSheet.tsx:16,29-32`); D-14 says the equipment/plate band is "the only place GYM-03's machine and stack configuration pays off in-gym," suggesting the mark-unavailable action might live there instead of the overflow sheet.
   - What's unclear: CONTEXT.md does not specify a UI location for D-20's action, only its two-tier behavior (session-scoped default vs. explicit profile write-through).
   - Recommendation: This phase should run a `gsd-ui-phase`/UI-SPEC pass (workflow config has `ui_phase: true`) before locking the interaction, rather than the planner guessing a location from research alone.

3. **Whether `DEFAULT_ROUNDING_INCREMENT_KG` in `warmup.ts` is deleted, kept as a no-profile fallback, or becomes the seeded default profile's own value**
   - What we know: D-19 seeds a default "My Gym" profile on first need with "standard bar, full commercial plate set, generous counts."
   - What's unclear: whether the constant survives as a literal code fallback for the (should-be-impossible-after-D-19) case of no profile at all, or is removed once every user always has a resolvable profile.
   - Recommendation: Keep it as a documented last-resort fallback (never silently reached in normal operation) rather than deleting it — cheap insurance against an edge case in the achievability module's input contract.

## Environment Availability

Skipped — this phase has no new external dependencies (no new CLI tools, services, runtimes, or package managers beyond what every prior phase already established: Node, pnpm, Postgres, the existing Expo/RN toolchain). All work is in-repo TypeScript, Drizzle/Postgres (already running), and PowerSync (already wired).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30 (client: `apps/mobile`; shared packages: `packages/pr-rules`, and any new `packages/plate-math`) — matches every existing package's `"test": "jest"` script |
| Config file | Per-package `jest.config` inherited from each `package.json`'s existing `"test": "jest"` script (no new config needed — mirror `packages/pr-rules/package.json`'s verified shape) |
| Quick run command | `pnpm --filter @fitness/plate-math test` (or `--filter @fitness/pr-rules` if folded in) |
| Full suite command | `pnpm -w test` (root Turborepo task, as used by prior phases) plus `pnpm --filter mobile test:e2e:durability` for the browser-authorized durability project |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GYM-01 | Create multiple gym profiles, pick active | unit (write helper) + e2e (Playwright) | `pnpm --filter mobile test` / `pnpm --filter mobile test:e2e` | ❌ Wave 0 |
| GYM-02 | Configure bars, plate denominations+counts, unit system | unit (shape validator + solver honoring counts) | `pnpm --filter @fitness/plate-math test -- solver` | ❌ Wave 0 |
| GYM-03 | Machine availability, stack ranges, base resistance | unit (shape validator) + e2e | `pnpm --filter @fitness/plate-math test -- machine` | ❌ Wave 0 |
| GYM-04 | Assign profile to a workout, switch mid-program | unit (`startSession`/session-lifecycle) + e2e | `pnpm --filter mobile test -- log-set` | ❌ Wave 0 (extends existing `log-set.test.ts` if present) |
| GYM-05 | Live plate breakdown while typing | unit (solver, per-keystroke behavior) + e2e (keypad interaction) | `pnpm --filter @fitness/plate-math test -- solver` | ❌ Wave 0 |
| GYM-06 | Only achievable loads ever shown by the app | unit (achievability module, degenerate-inventory cases per D-15) | `pnpm --filter @fitness/plate-math test -- achievability` | ❌ Wave 0 |
| GYM-07 | Mark equipment unavailable, offered alternatives | unit (`resolveInventory`, extended `scoreAlternatives`) + e2e | `pnpm --filter mobile test -- smart-swap` (existing file, extend) | ✅ partial — `smart-swap.test.ts` exists, extend it |

### Sampling Rate
- **Per task commit:** the relevant package's `pnpm --filter <pkg> test`
- **Per wave merge:** `pnpm -w test`
- **Phase gate:** Full suite green, plus (per this repo's authorized standing exception) a real Playwright durability run — `pnpm --filter mobile test:e2e:durability` — before `/gsd-verify-work`, consistent with how Phase 5 closed out (WINDOWS #140).

### Wave 0 Gaps
- [ ] `packages/plate-math/src/solver.ts` + `__tests__/solver.test.ts` — covers GYM-02, GYM-05, D-15's degenerate-inventory requirement (one pair, no pairs)
- [ ] `packages/plate-math/src/achievability.ts` + `__tests__/achievability.test.ts` — covers GYM-06, D-09/D-10's explicit-direction requirement
- [ ] `packages/plate-math/src/inventory.ts` + `__tests__/inventory.test.ts` — covers D-21's resolved-inventory function
- [ ] `apps/api/src/sync/__tests__/` extension (or existing sync e2e spec) — covers the new `equipment_profile` push-path case, following whatever pattern `program-sync.e2e-spec.ts` already establishes for `routine`
- [ ] `packages/plate-math/package.json` — mirror `packages/pr-rules/package.json` verbatim (verified content above) if the planner creates a new package rather than folding into `pr-rules`
- [ ] Fix for WINDOWS #138 (`handleSwapPick`'s missing `db` threading) — needed once this phase's e2e tests actually exercise the equipment-aware swap path

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Unchanged — this phase adds no new auth surface. |
| V3 Session Management | No | Unchanged. |
| V4 Access Control | Yes | `equipment_profile`'s new sync push case must scope every write through `auth.user_id()`/the session's `userId`, exactly as `routine`/`personal_record` already do — never trust a client-supplied `user_id` field (the existing `user_id?: unknown` pattern in `UserPreferenceOpData`, "Never read — accepted only so a present user_id key does not crash the presence check," is the established defense; apply the same discipline to the new `EquipmentProfileOpData`). |
| V5 Input Validation | Yes | The JSONB shape validators (Pattern 2) are this phase's primary V5 surface — malformed `available_plates`/`dumbbell_increments_kg`/`machine_availability` must be rejected before any write, mirroring `isCatalogSnapshot`'s existing gate. |
| V6 Cryptography | No | Not applicable — no new cryptographic surface. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR on `equipment_profile` (fetching/mutating another user's gym profile by guessing/incrementing an id) | Tampering / Information Disclosure | Scope every push-path write through the authenticated session's `userId`, never a client-supplied one — same pattern the existing `hasInvalidField`/`toWorkoutSessionValues`-style functions already use project-wide (PITFALLS.md's own "No per-user scoping check on nested resource fetches" security mistake, already flagged as a named risk for this codebase). |
| Malformed/oversized JSONB payload (e.g. an absurdly large `available_plates` array) | Denial of Service | Bound the array sizes in the shape validator (a gym plausibly has single-digit-to-low-tens of distinct plate denominations) — reject rather than silently truncate, matching the fail-closed pattern `isCatalogSnapshot` already uses. |
| Sync-push type confusion (a client sending a `weightKg` as a non-numeric string into the plate breakdown solver) | Tampering | Run every JSONB value through the existing exact-decimal parsing path (`parseDecimalToFraction` in `units.ts`, which already throws on non-decimal input) rather than trusting `Number()` coercion, consistent with D-03's "no float path" guarantee. |

## Sources

### Primary (HIGH confidence — read directly this session)
- `apps/api/src/db/schema/equipment.ts` — full file read, `equipment_profile` table definition
- `apps/api/src/db/schema/session.ts` — full file read, `workout_session`/`session_exercise`/`logged_set`, `equipment_profile_id` column, status CHECK constraints
- `apps/api/src/db/schema/preference.ts` — full file read, `default_equipment_profile_id`
- `packages/api-contracts/src/units.ts` — full file read, exact bigint-fraction kg/lb conversion
- `packages/api-contracts/src/catalog.ts` — full file read, `EQUIPMENT_TYPES`, `LOAD_TYPES`, `isCatalogSnapshot`
- `packages/pr-rules/src/warmup.ts` — full file read, existing rounding call site
- `ops/powersync/sync-rules.yaml` — full file read, confirmed `equipment_profile` is streamed (line 34)
- `apps/api/src/sync/sync.service.ts` — read lines 180-400 and 1860-1900; grep-confirmed zero push-path case for `equipment_profile`
- `apps/mobile/lib/db/schema.ts` — grep-confirmed SQLite mirror shape (`equipmentProfile` table, `text`-typed JSONB mirrors)
- `apps/mobile/lib/db/log-set.ts` — full relevant section read, `startSession`'s existing `equipmentProfileId` param and zero call sites passing it
- `apps/mobile/components/NumericKeypad.tsx` — full file read, `RESERVED_BAND_HEIGHT` reserved slot
- `apps/mobile/lib/catalog/smart-swap.ts` — full file read, `SwapConstraints`/`scoreAlternatives`
- `apps/mobile/components/SwapSuggestionList.tsx` — full file read
- `apps/mobile/components/SessionActionSheet.tsx` — grep-confirmed fixed 4-action list
- `docs/catalog-load-types.md`, `docs/program-vocabularies.md`, `docs/session-vocabularies.md`, `docs/platform-modules.md` — full files read, established documentation pattern for this phase to follow
- `.planning/research/PITFALLS.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/FEATURES.md` — relevant sections read
- `.planning/WINDOWS.md` — tail read, WINDOWS #138 (swap db-threading gap)
- `.planning/config.json` — full file read, `nyquist_validation: true`, `security_enforcement: true`, `security_asvs_level: 1`

### Secondary (MEDIUM confidence)
- None — this phase required no external web research; every finding is grounded in the existing codebase and CONTEXT.md's own citations.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; every reused piece was read directly this session.
- Architecture: HIGH — the sync push-path gap, reserved UI slot, and swap-constraint seam were all confirmed by direct file reads and targeted greps, not inferred.
- Pitfalls: HIGH for the five documented pitfalls (all traced to a specific, quoted line in this repo); MEDIUM for the three Open Questions genuinely left to the planner by CONTEXT.md's own explicit delegation.

**Research date:** 2026-08-26
**Valid until:** No external time pressure (in-repo research, no third-party API/version drift risk) — revisit only if Phase 7 or Phase 8 begins before this phase's plan is written, since both are named as direct consumers of this phase's contracts.
