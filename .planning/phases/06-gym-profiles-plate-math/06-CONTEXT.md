# Phase 6: Gym Profiles & Plate Math - Context

**Gathered:** 2026-08-26
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase makes the app aware of the physical hardware a gym actually contains, and constrains
every load it *shows* to what that hardware can produce. It delivers: configurable gym profiles
(bars, plate denominations and counts, dumbbell increments, machine availability, stack ranges,
base resistance, unit system); a live plate breakdown while entering a barbell weight; an
achievability rule that governs every app-generated load; the ability to assign a gym to a workout
and switch gyms mid-program; and marking equipment unavailable mid-workout with equipment-aware
alternatives.

Covers GYM-01 through GYM-07.

**Not this phase:** the progression engine that decides *what* to suggest (Phase 8 — this phase
fixes the rule its output must obey), supersets (Phase 7), and any change to how a logged set is
persisted (Phase 5, shipped and locked).

</domain>

<decisions>
## Implementation Decisions

### Carried forward — already locked, do not re-litigate

- **D-01:** **`equipment_profile` already exists and is unused.** `apps/api/src/db/schema/equipment.ts`
  ships `id`, `user_id`, `name`, `is_default`, `barbell_weight_kg` (numeric 6,3), `available_plates`,
  `dumbbell_increments_kg`, `machine_availability` (all `jsonb`), `native_unit`, `archived_at`,
  `server_seq`. **Nothing in the repository reads it.** This phase fills it in; it does not invent it.

- **D-02:** **`user_preference.default_equipment_profile_id` already exists** as a nullable, no-FK
  pointer (`apps/api/src/db/schema/preference.ts`) — deliberately no `.references()` so archiving a
  profile clears a pointer rather than violating a constraint. This is the active-gym pointer.

- **D-03:** **Weights are canonical kg, converted only at the display boundary**
  (`packages/api-contracts/src/units.ts`). Exact bigint-fraction conversion, `CANONICAL_KG_SCALE = 3`,
  `DISPLAY_SCALE = { kg: 2, lb: 1 }`, `KG_PER_LB` as an integer numerator/denominator pair. All plate
  math happens in canonical kg; `native_unit` is a display and authoring concern only. Phase 2 D-04,
  Phase 5 D-05. — **Reversibility:** one-way.

- **D-04:** **Snapshot-on-use** — anything a session's behaviour depends on is frozen onto the session
  row at start and never re-read from the source (Phase 2 D-05, Phase 4 D-01, Phase 5 D-02). D-09
  below applies this to the gym profile.

- **D-05:** **Client-generated UUIDs before any network round-trip, aggregate-root ownership, and
  PowerSync as the sole ingress for per-user mutable data** (Phase 2 D-01/D-02, Phase 5 D-03/D-04).
  `equipment_profile` is user-rooted and already carries `user_id` + `server_seq`; anything added
  under it joins back through the profile in `ops/powersync/sync-rules.yaml`.

- **D-06:** **Vocabularies live in `packages/api-contracts/`, additive-only, with a Postgres check
  and the same values on the SQLite side** (Phase 4 D-13, Phase 5 D-09; `PITFALLS.md` §9 records the
  cost of skipping this, paid once with `load_type`). — **Reversibility:** one-way.

- **D-07:** **`EQUIPMENT_TYPES` in `packages/api-contracts/src/catalog.ts` is nullable, has no
  Postgres CHECK, and its own comment names Phases 6/7 as the expected extenders.** It is the
  per-exercise discriminator this phase resolves against. Extend by appending only — never insert,
  never reorder.

- **D-08:** **Platform divergence is a `.web.tsx` sibling, never a `Platform.OS` branch**
  (`docs/platform-modules.md`); NativeWind 4 + `apps/mobile/lib/theme.ts`. No Xcode or Android SDK on
  this machine — native claims rest on typecheck; the web target is where this phase is exercised end
  to end (Phase 5 D-10, `.planning/WINDOWS.md`).

### Achievability — the rule that makes GYM-06 true

- **D-09:** **Manual entry is never fought and never rewritten; app-generated loads are always
  achievable.** This asymmetry is the whole of GYM-06. A weight you type by hand is logged exactly as
  typed — you may have borrowed a plate, used a fractional set, or be at a gym the profile does not
  describe — and the plate strip simply reports that it is not loadable here. Anything the *app* puts
  in the field on its own (Phase 8's recommendation, warm-up sets, the previous-weight prefill) is
  rounded to a load the active resolved inventory can produce, so "a home gym with 5 lb jumps is
  never *shown* a 152.5 lb load" is literally true without policing the keypad. Rejected: snapping on
  commit (overwrites a deliberate entry, wrong whenever reality differs from the profile) and a
  constrained keypad (makes the calculator lie and traps the user when the profile is stale).
  — **Reversibility:** one-way — the entry contract is what makes a logged set trustworthy, and every
  suggestion call site is written against the achievability rule.

- **D-10:** **Rounding is nearest, ties down, and the direction is an explicit parameter — never an
  implicit default.** `packages/pr-rules/src/warmup.ts` already carries the note that a silent
  round-down produces a warm-up one plate light; that is precisely why the direction must be passed
  in at the call site rather than baked into the rounder. Working sets round nearest; warm-ups may
  legitimately round down. — **Reversibility:** costly — the rounder is shared by warm-ups, prefill,
  and Phase 8.

- **D-11:** **A logged weight never recomputes.** A logged set is a fact and renders exactly as
  logged forever, regardless of which profile is active now. Only forward-looking suggestions and the
  live plate strip resolve against the currently active inventory. — **Reversibility:** one-way —
  re-resolving history against the active profile would rewrite the past every time the user changes
  gyms, contradicting Phase 5 D-01's durability guarantee.

### The plate strip — GYM-05, in the band Phase 5 reserved

- **D-12:** **The strip shows the per-side plate stack, largest first, with the bar weight as a quiet
  prefix — not a total, not a barbell graphic.** `20 · 10 · 2.5` is what you physically hang on one
  end, in loading order; the total is already in the field directly above. Phase 5 D-20 reserved the
  band immediately above the docked keypad for exactly this, so the layout slot exists. A mirrored
  barbell illustration was rejected on legibility grounds — Phase 5 D-18 already names this screen's
  tightest constraint, and `04-UI-SPEC.md`'s wrap-and-grow rule (no `numberOfLines`, no
  `ellipsizeMode`, no `allowFontScaling={false}`) applies to this band too.

- **D-13:** **When the entered weight is not loadable, the strip states that and offers the nearest
  loadable value on each side as one-tap corrections** — `not loadable · 150 ← → 155`. This is D-09's
  accept-don't-fight rule made concrete: it informs and offers, never rewrites. Rejected: showing a
  plate breakdown for the nearest load, which would display a stack that does not match the number in
  the field.

- **D-14:** **The band is "what your gym can produce for this exercise", of which plate math is the
  barbell case.** It is driven off the exercise's `equipment_type`/`load_type` (D-07): machine shows
  its stack range and micro-plate increment, dumbbell shows the nearest available pair, and bodyweight
  collapses the band entirely so the keypad sits flush. This is the only place GYM-03's machine and
  stack configuration pays off in-gym. — **Reversibility:** reversible.

- **D-15:** **The breakdown respects plate *counts*, not just denominations.** GYM-02 says
  "denominations and counts" explicitly, and the home gym is exactly where counts bind — a breakdown
  calling for three pairs of 20s the user does not own is worse than no breakdown at all. This makes
  the solver a bounded knapsack rather than greedy largest-first division; the inventory is small
  enough (a handful of denominations, single-digit pair counts) that an exact search is cheap.
  **Flag for the planner:** this runs on every keystroke behind a live field — it must be a pure,
  synchronous, unit-tested function over a resolved inventory, memoized on (inventory, target), and
  it must be exercised against a degenerate inventory (one pair, no pairs) rather than only the
  commercial-gym happy path. — **Reversibility:** costly — counts are load-bearing for the solver's
  shape, and dropping them later silently changes every breakdown.

### Profile shape and gym switching — GYM-01 through GYM-04

- **D-16:** **The three JSONB columns stay JSONB, but their shape is defined and validated in
  `packages/api-contracts/`** the same way D-06 handles vocabularies. A gym's inventory is authored
  and edited as one whole document and is never queried across, so child tables would buy nothing and
  cost three new synced tables plus per-row conflict resolution. Free-form JSONB was rejected outright
  — that is the exact undocumented-shape failure `PITFALLS.md` §9 records. Validation runs in the
  sync push path alongside the existing validators. — **Reversibility:** one-way — the JSON shape is
  a published wire contract every client build reads.

- **D-17:** **`workout_session` gets an `equipment_profile_id` stamped once at session start.**
  Snapshot-on-use (D-04), the same shape as `timezone`/`local_date` (Phase 5 D-06). GYM-04's "switch
  gyms mid-program" is then simply starting the next session under a different profile, and history
  always knows where each workout actually happened. Reading the live pointer instead would make every
  past session retroactively claim it occurred at the newly-selected gym. Snapshotting the whole
  inventory onto the session was rejected as duplication for a fidelity nobody asked for.
  — **Reversibility:** one-way — history's gym attribution is derived from this column.

- **D-18:** **Switching the active gym mid-workout restamps the session going forward.** The session's
  `equipment_profile_id` updates; sets already logged keep their recorded weights untouched (D-11),
  and the strip, achievability and swap candidates resolve against the new gym from that point on.
  This covers the real case — you arrived and it is not the gym you assumed — without the only remedy
  being to discard the workout. — **Reversibility:** reversible.

- **D-19:** **A default profile is seeded on first need, not demanded up front.** One "My Gym" profile
  created the first time plate math is required, matching the user's `weight_unit`: standard bar,
  full commercial plate set, generous counts. The feature works before anyone configures anything, and
  editing it is discoverable from the plate strip itself. Blocking the in-gym flow with a setup form
  at the moment of first use was rejected as the worst possible timing. `is_default` on the profile
  and `default_equipment_profile_id` on the preference row both already exist to carry this.
  — **Reversibility:** reversible.

### Unavailable equipment mid-workout — GYM-07

- **D-20:** **Marking equipment unavailable is session-scoped by default, with a separate explicit
  action to write it through to the profile.** An occupied rack is a temporary fact; silently editing
  the gym profile because someone else was using a machine is the wrong default and the user would
  never think to undo it. A distinct "my gym doesn't have this" action performs the profile write.
  This mirrors Phase 5 D-14's session-vs-program edit split exactly, and for the same reason.
  — **Reversibility:** costly — which row the mark landed in is how every later read distinguishes
  "busy today" from "this gym lacks it".

- **D-21:** **Unavailability is an inventory subtraction, resolved once and read by everything.**
  The session resolves availability as *the snapshotted profile's inventory minus this session's
  unavailable set*. Achievability (D-09), the plate strip (D-12/D-14) and swap candidates (D-22) all
  read that single resolved view, so nothing can disagree with anything else — a machine just marked
  broken cannot still be suggested a load. **Flag for the planner:** this resolved inventory is the
  phase's central abstraction; it should be one named function with one definition, not recomputed
  per call site. — **Reversibility:** one-way — every consumer in this phase is written against it.

- **D-22:** **An "alternative" is a substitute exercise from the catalog, filtered to equipment the
  resolved inventory still has.** Leg press unavailable → hack squat, goblet squat, split squat.
  This reuses Phase 5 D-13's existing Swap action rather than inventing a second mechanism; the
  phase's contribution is making the candidate list equipment-aware via `equipment_type` (D-07).
  Load-only alternatives were rejected — they do not answer "the rack is taken".

- **D-23:** **A swap is session-only and carries the original's targets across.** The substitute lands
  on the `session_exercise` snapshot with the original's target sets/reps/RIR, and the program is
  untouched. Same rule and same rationale as Phase 5 D-14: a one-off gym constraint can never silently
  rewrite the program authored in Phase 4. Unlike a deliberate target edit (Phase 5 D-15), "the rack
  was busy once" is too weak a signal to offer a program write-back at all.
  — **Reversibility:** reversible.

### Claude's Discretion

- The rounding *direction* per call site (D-10) — nearest for working sets, down for warm-ups — is
  delegated, provided the direction is an explicit parameter rather than a default baked into the
  rounder.
- The precise JSON shapes behind D-16, the knapsack solver's implementation strategy (D-15), and the
  seeded default profile's exact plate inventory (D-19) are all implementation choices for the
  planner, subject to the constraints recorded above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prior phase decisions this phase is built on
- `.planning/phases/05-in-gym-session-logging/05-CONTEXT.md` — D-02 (snapshot-on-use), D-05 (canonical
  kg), D-13 (per-exercise action bar + overflow, where the swap action lives), D-14/D-15 (the
  session-vs-program edit split this phase's D-20/D-23 mirror), **D-20 (reserves the band above the
  docked keypad for this phase's plate strip)**, D-18 (the set row's layout constraint)
- `.planning/phases/04-program-builder/04-CONTEXT.md` — D-01 (snapshot-on-use), D-10 (`override ?? base`
  target resolution), D-13 (the contract-package vocabulary pattern), D-14 (single-pointer-not-status,
  the reasoning behind `default_equipment_profile_id`)
- `.planning/phases/05-in-gym-session-logging/05-VERIFICATION.md` — what Phase 5 actually shipped and
  which four items are deferred to ROADMAP Phase 999.1

### Schema and contracts
- `apps/api/src/db/schema/equipment.ts` — `equipment_profile`, the table this phase fills in
- `apps/api/src/db/schema/preference.ts` — `default_equipment_profile_id`, and the documented reasoning
  for a no-FK pointer
- `apps/api/src/db/schema/session.ts` — `workout_session` / `session_exercise`, where D-17's
  `equipment_profile_id` lands and where the target snapshot lives
- `packages/api-contracts/src/units.ts` — canonical kg, `KG_PER_LB`, `CANONICAL_KG_SCALE`,
  `DISPLAY_SCALE`; all plate math goes through this
- `packages/api-contracts/src/catalog.ts` — `EQUIPMENT_TYPES` (nullable, no Postgres CHECK, explicitly
  flagged for Phase 6/7 extension) and `LOAD_TYPES`; the per-exercise discriminator D-14 branches on
- `ops/powersync/sync-rules.yaml` — how user-rooted tables are streamed; any new column or table joins
  back the same way

### Project constraints and prior failures
- `.planning/research/PITFALLS.md` §9 — the undocumented-discriminator failure D-06/D-16 exist to avoid
- `.planning/research/FEATURES.md` — MacroFactor's own plate-math and equipment-profile behaviour,
  including the plate strip's position relative to the keypad
- `.planning/research/ARCHITECTURE.md` §1 — the data-model decisions the schema already encodes
- `docs/catalog-load-types.md` — the remediation doc `load_type` needed; the model for documenting any
  vocabulary this phase adds
- `docs/program-vocabularies.md`, `docs/session-vocabularies.md` — the established shape for a
  phase-owned vocabulary doc
- `docs/platform-modules.md` — `.web.tsx` sibling rule (D-08)
- `.planning/WINDOWS.md` — open verification windows, including the absent native toolchain
- `packages/pr-rules/src/warmup.ts` — already anticipates real plate increments behind its signature
  and documents the silent-round-down hazard behind D-10

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `equipment_profile` table — complete, synced, and entirely unread. No migration needed for the
  profile itself; only `workout_session.equipment_profile_id` (D-17) is new.
- `packages/api-contracts/src/units.ts` — exact bigint-fraction kg/lb conversion with no float path.
  The plate solver builds on this rather than introducing its own arithmetic.
- `EQUIPMENT_TYPES` / `LOAD_TYPES` in `packages/api-contracts/src/catalog.ts` — already on every
  catalog exercise, already the right discriminator for D-14 and D-22.
- Phase 5's docked keypad and its reserved band (D-20) — the plate strip has a layout slot waiting.
- Phase 5's per-exercise Swap action (D-13, behind the `⋮` overflow) — D-22 extends its candidate
  filter rather than adding a new action.
- `packages/pr-rules/src/warmup.ts` — the first consumer of achievable-load rounding.

### Established Patterns
- Contract-package vocabulary + Postgres CHECK + matching SQLite values (D-06) — the shape any new
  vocabulary or JSON schema in this phase must follow.
- Snapshot-on-use for anything a session's behaviour depends on (D-04 → D-17).
- Single nullable pointer instead of a status value, so offline LWW resolves correctly (Phase 4 D-14)
  — already applied to `default_equipment_profile_id`.
- Session-scoped edit by default, program write-back as a separate explicit action (Phase 5 D-14)
  → D-20 and D-23.
- Archive via nullable timestamp, never a hard delete (Phase 3 D-05) — `archived_at` already on the
  profile.

### Integration Points
- `workout_session` — new `equipment_profile_id`, stamped at session start, restampable mid-session
  (D-17/D-18).
- The active workout screen's keypad band — the plate strip mounts into Phase 5's reserved slot.
- The Profile tab (`apps/mobile/app/(tabs)/profile.tsx`) — where gym profiles are listed, created and
  edited.
- The sync push validator — new JSON-shape validation for the three `equipment_profile` JSONB columns.
- `ops/powersync/sync-rules.yaml` — `equipment_profile` must actually be streamed to clients.
- Phase 8 inherits D-09/D-10 as a hard contract on what its engine is allowed to emit.

</code_context>

<specifics>
## Specific Ideas

- The plate strip reads `20 · 10 · 2.5` — per side, largest first, loading order, bar weight as a
  quiet prefix.
- The not-loadable state reads `not loadable · 150 ← → 155`, with both neighbours tappable.
- The seeded default profile is named "My Gym" and matches the user's existing `weight_unit`.
- The persist-through action for unavailable equipment is phrased as "my gym doesn't have this", to
  distinguish it from the temporary "someone's using it" default.

</specifics>

<deferred>
## Deferred Ideas

- **Load-based alternatives** (same exercise, different loading scheme) as a ranked companion to
  exercise substitution — considered under D-22 and rejected for this phase because it needs a ranking
  rule this phase would have to invent. Revisit alongside Phase 8's progression engine, which will
  have the signal to rank.
- **Program write-back after an equipment-driven swap** — considered under D-23 and rejected: a
  one-off availability constraint is too weak a signal. If repeated swaps of the same exercise turn
  out to be common, a "you've swapped this five times — update your program?" prompt belongs in a
  later phase, driven by history rather than by a single session.
- **Gym profiles derived from location** (auto-select the gym by GPS/geofence) — never raised as a
  requirement; noted only because "switch gyms mid-program" invites it. Out of scope for v1.

</deferred>

---

*Phase: 6-Gym Profiles & Plate Math*
*Context gathered: 2026-08-26*
