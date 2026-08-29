# Phase 11: Program Generation - Context

**Gathered:** 2026-08-29
**Status:** Ready for planning

<domain>
## Phase Boundary

A user who does not want to author a program by hand answers a short set of questions —
training goal, experience level, days per week, session length, split preference,
muscle-group emphasis, deload preference — and receives a complete, pre-periodized
routine written into the ordinary program tables. From the moment it exists it is
indistinguishable from a hand-built program: the same builder edits it, the same
progression engine moves it.

**In scope:** the generation inputs, the candidate-exercise filter (equipment + exclusions),
the split templates, the volume/periodization math, deload placement, the exclusion list
that GEN-03 requires, and the write path that materializes the result.

**Out of scope:** changes to the builder itself, to the progression engine's rules, to
analytics, and anything body-metrics or dashboard related (Phase 12). Program generation
produces rows; it does not introduce a second kind of program.

</domain>

<decisions>
## Implementation Decisions

### Where generation runs

- **D-01:** Generation is a new shared pure package, `@fitness/program-generator`, imported by
  both the Expo client and the NestJS API — the same one-package rule the project already
  locked for progression (`packages/progression-engine`). No generation logic lives in a screen
  or a controller. — **Reversibility:** costly — once both apps import it, moving the logic
  server-side means re-establishing an offline path for a feature users expect to work in the gym.
- **D-02:** Generation runs **on-device and offline**. It reads the local PowerSync SQLite
  (catalog snapshot, active gym profile, exclusions) and needs no network. The non-negotiable
  local-first constraint applies to this write like every other. — **Reversibility:** one-way —
  a server-only generator would make the feature unavailable exactly where the app promises to
  work, and undoing it means rebuilding the client read path from scratch.
- **D-03:** The generator is a **pure deterministic function**: same inputs → byte-identical
  output. No `Date.now()`, no `Math.random()` inside it. "Regenerate / give me another one" is
  expressed as an explicit `variantSeed` input threaded through candidate selection, so a reroll
  is reproducible and testable.

### Output shape and the GEN-07 guarantee

- **D-04:** The generator returns a **plain data tree** (routine → days → exercises → per-cycle
  target overrides). It performs no writes itself. A thin caller hands that tree to the existing
  program write path, so a generated program is literally constructed from the same rows the
  builder writes. GEN-07 becomes structural rather than a promise to be re-tested.
- **D-05:** Nothing marks a routine as "generated" in a way that changes behaviour. If provenance
  is recorded at all it is an inert metadata stamp — never read by the builder, the progression
  engine, or sync. There is no second program kind. — **Reversibility:** one-way — a behavioural
  generated-vs-hand-built split would fork every downstream surface and could not be merged back.
- **D-06:** Per-cycle prescriptions are emitted as **sparse `routine_exercise_cycle_target`
  overrides** on top of one base `routine_exercise` prescription, honouring the existing
  inherit-on-null rule and the standing no-full-copy-per-cycle ban. A cycle whose targets equal
  the base emits no override row at all (`isEmptyOverride` is the gate).
- **D-07:** Deload and time-off cycles use the existing `CYCLE_KINDS` vocabulary
  (`training | deload | time_off`) and `order_index` for position. The generator introduces no new
  cycle kind.

### Candidate exercise pool (GEN-02, GEN-03)

- **D-08:** The candidate pool is built by filtering the catalog through the **active gym
  profile's resolved inventory**, reusing `packages/plate-math`'s inventory/achievability layer
  rather than re-deriving what the gym supports. An exercise whose required equipment cannot be
  loaded at that gym is never a candidate.
- **D-09:** Exclusions are a **hard filter applied last and unconditionally**. An excluded
  exercise cannot enter a generated program by any path, including the fallback path when a
  muscle group has too few candidates. If filtering empties a slot, the generator degrades the
  slot (fewer exercises, or a substitute group) and reports it — it never reaches past an exclusion.
- **D-10:** The user's exclusion list is stored as a **synced row-per-exercise table**
  (`excluded_exercise`: user, exercise, timestamp), not as an array inside a single
  preference row. Row-level LWW resolves each row independently; a multi-value list packed into
  one column loses concurrent offline edits — the same reasoning that put `active_routine_id`
  on its own column. — **Reversibility:** costly — changing the storage shape after sync rules
  ship means a data migration plus a sync-rule change.
- **D-11:** Exclusions are **user-level and global**, not per-program and not per-gym. An
  exercise the user cannot or will not do is a fact about the user.

### Split selection and day structure

- **D-12:** Splits come from a **declarative template table** keyed by
  `(splitPreference, daysPerWeek)` — each entry naming the ordered day pattern and each day's
  muscle-group slots. Generation is table lookup plus filling, not procedural day invention.
  Deterministic, diffable, and unit-testable without running the whole generator.
- **D-13:** Supported split preferences for v1: **full body, upper/lower, push/pull/legs, and an
  "auto" option that picks the template best fitting the chosen days per week**. `auto` is the
  default so a user can answer only goal/level/days and still get a sensible program.
- **D-14:** Session length constrains **exercise count per day**, not set count per exercise —
  the generator trims slots to fit a per-exercise time estimate derived from the prescribed sets
  and rest. Cutting sets instead would silently invalidate the volume targets D-16 sets.

### Periodization and volume (GEN-05)

- **D-15:** Volume and RIR math live in a **documented constants module plus `docs/` reference
  authored by this project** — MacroFactor's own landmark math is not public, so this is our
  design decision, informed by published volume-landmark and autoregulation literature. The
  research flag on this phase is closed by writing that doc, not by trying to reverse-engineer.
- **D-16:** Weekly set allocation is per **muscle group**, driven by a landmark table indexed by
  experience level (a minimum-effective and an adaptive-maximum bound per group). Sets ramp
  across training cycles from the lower bound toward the upper.
- **D-17:** RIR **descends across training cycles** within a block (easier → harder), and rep
  ranges are set by training goal (strength → lower reps, hypertrophy → moderate, endurance →
  higher). Goal picks the rep band; cycle index picks the RIR; landmarks pick the sets.
- **D-18:** Emphasis is a **three-level per-muscle-group control** — deprioritize / normal /
  emphasize — applied as fixed multipliers on that group's weekly set allocation, then re-clamped
  to the landmark bounds. Emphasis never pushes a group past its adaptive maximum, and
  deprioritize never drops a group below its minimum unless the user excluded it outright.

### Deloads (GEN-06)

- **D-19:** Deload choice is presented as **none / every N cycles / final cycle only**, with
  "every N cycles" as the default. The generator materializes the choice as `deload` cycles at
  the computed `order_index` positions.
- **D-20:** A deload cycle is expressed **only as per-cycle target overrides** — reduced sets and
  raised RIR against the same exercises. It never removes exercises or days, so the user still
  trains the same movements lighter, which is what `deload` already means in this codebase.

### Failure and degradation

- **D-21:** Generation **never produces a silently thin program**. When equipment plus exclusions
  make a slot unfillable, the result carries an explicit, structured list of what was reduced and
  why, surfaced to the user before the program is saved.
- **D-22:** The user **reviews the generated program before it is written**. Generation produces
  a preview tree; saving is a separate confirmed action. A generator that writes on tap would make
  an unwanted result something the user has to clean up.

### Claude's Discretion

- Screen decomposition of the generation wizard, and how many steps it spans.
- Naming of the generated routine (a sensible default derived from goal + split, editable).
- Internal module boundaries inside `@fitness/program-generator`.
- Whether provenance metadata (D-05) is recorded at all in v1.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Program model and vocabularies
- `docs/program-vocabularies.md` — `ROUTINE_STATUSES`, `CYCLE_KINDS`, and the rule that active/frozen/archived are not statuses. Explains why the generator must not invent a program state.
- `packages/api-contracts/src/program.ts` — `ResolvedTarget`, `TargetOverride`, `resolveTarget`, `isEmptyOverride`, `CYCLE_KINDS`. The exact shape D-06 emits.
- `.planning/phases/04-program-builder/04-CONTEXT.md` — the builder decisions the generated tree must satisfy, including the sparse-override rule and day archiving.

### Equipment and the candidate filter
- `docs/equipment-profile-shape.md` — what a gym profile declares.
- `packages/api-contracts/src/equipment.ts` — `EquipmentMachine`, `UnavailableEquipmentRef`, profile limits.
- `packages/plate-math/src/inventory.ts`, `packages/plate-math/src/achievability.ts` — resolved inventory and loadability; the reuse D-08 requires.
- `.planning/phases/06-gym-profiles-plate-math/06-CONTEXT.md` — gym-profile decisions.

### Catalog and muscle taxonomy
- `packages/api-contracts/src/catalog.ts` — `MUSCLE_GROUPS`, `MUSCLE_GROUP_BODY_REGION`, `MUSCLE_ROLES`, `EQUIPMENT_TYPES`. The taxonomy D-16/D-18 allocate against.
- `docs/catalog-load-types.md` — load types and the closed-vocabulary pattern this phase's new vocabularies must follow.

### Progression (the GEN-07 contract)
- `packages/progression-engine/src/index.ts` and `recommend.ts` — what the engine reads off a prescription. A generated program must present the identical surface.
- `.planning/phases/08-progression-engine/08-CONTEXT.md` — progression decisions that constrain what targets are meaningful.

### Requirements and roadmap
- `.planning/REQUIREMENTS.md` — GEN-01 … GEN-07 (lines 127-133).
- `.planning/ROADMAP.md` § Phase 11 — goal and the five success criteria.
- `.planning/research/PITFALLS.md`, `.planning/research/FEATURES.md` — project research; the Phase 11 flag that Smart Generation's volume math is undocumented is answered by D-15.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/plate-math` (`inventory.ts`, `achievability.ts`): already answers "can this gym load this weight" — the equipment filter for GEN-02 is a consumer of it, not a reimplementation.
- `packages/api-contracts/src/program.ts`: `resolveTarget` / `isEmptyOverride` are exactly the base-plus-sparse-override semantics the periodizer emits into.
- `packages/api-contracts/src/catalog.ts`: `MUSCLE_GROUPS` and the primary/secondary role split give the generator its allocation axis for free.
- `packages/progression-engine`: the precedent for a shared pure package imported by client and server — `@fitness/program-generator` copies its structure, its test layout, and its no-I/O discipline.

### Established Patterns
- Closed vocabularies are declared once in `api-contracts`, enforced by a Postgres CHECK, validated in `sync.service.ts`, and documented in `docs/` — any new vocabulary this phase adds (split preference, goal, experience level, deload placement) follows all four steps.
- Additive-only contract tuples: never insert, never reorder — field ordering in `program.ts` is load-bearing for deployed clients.
- Weights are exact decimal strings, never `number` — the generator must not introduce float weight math.
- Archive is a timestamp column, never a status value.

### Integration Points
- Reads: local catalog snapshot, the active gym profile's equipment, the new `excluded_exercise` rows, and user preferences.
- Writes: the existing program write path only (routine, routine_day, routine_exercise, routine_exercise_cycle_target) — plus the new `excluded_exercise` table, which needs a schema migration, a sync rule, and `sync.service.ts` validation.
- Consumed by: the builder (edits the result) and the progression engine (moves it), both unmodified.

</code_context>

<specifics>
## Specific Ideas

- The parity claim in success criterion 5 should be proven by a test that builds a program by hand and generates an equivalent one, then asserts the progression engine returns identical recommendations for both — not by inspection.
- The "what got reduced and why" report from D-21 is a first-class part of the generator's return value, not a log line.

</specifics>

<deferred>
## Deferred Ideas

- Multiple concurrent training blocks — already deferred to v2 at project level; generation does not reopen it.
- Regenerating or re-periodizing a program in place after it has logged sessions against it. v1 generates a new program; reshaping a running one is its own problem.
- Importing a published program template from an external source.
- Auto-substituting an exercise mid-program when a gym is unavailable that day — session-level equipment handling already exists and should not be entangled with generation.

</deferred>

---

*Phase: 11-Program Generation*
*Context gathered: 2026-08-29*
