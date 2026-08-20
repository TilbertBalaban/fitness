# Phase 4: Program Builder - Context

**Gathered:** 2026-08-20
**Status:** Ready for planning

<domain>
## Phase Boundary

The user can author the program they actually train — named days, ordered exercises, per-exercise set/rep-range/RIR/rest targets, cycles with per-cycle targets, a deload, and planned time off — and manage its lifecycle (activate, freeze, duplicate, archive, restore). The targets authored here are the inputs Phase 8's progression engine reads and Phase 5's session logger snapshots.

**In scope:** The `routine` / `routine_day` / `routine_exercise` authoring surface on the Programs tab (today a `PlaceholderScreen`); the cycle model and per-cycle target overrides that PROG-04 requires; deload and time-off placement; the program lifecycle (draft, active, frozen, archived, restored, duplicated); the "next up" surface on the Home tab showing the active program's upcoming workouts with their resolved targets; the schema additions all of that needs on both the Postgres and local-SQLite sides plus their sync rules; and extending the existing session-start snapshot so it resolves per-cycle targets rather than base targets alone.

**Out of scope:** All logging surfaces — no set entry, no rest timer, no plate calculator, no advanced set types (Phase 5). No progression rules or recommendations (Phase 8) — this phase authors the targets the engine will later read and fixes *where* the engine is allowed to write, but implements no rule. No auto-generated programs from goal/experience/equipment (Phase 11) — PROG requirements cover build-from-scratch only. No gym/equipment profile management (Phase 7). No analytics, PR or history surfaces (Phases 9–10). No parallel/specialized concurrent training blocks — deferred to v2 at project init, single active program in v1.

</domain>

<decisions>
## Implementation Decisions

### Carried forward — already locked, do not re-litigate

These are constraints this phase inherits, restated so the planner treats them as fixed inputs rather than open questions.

- **D-01:** **Snapshot-on-use is the mechanism that makes success criterion 4 true, and it already exists.** Phase 2's D-05 and `ARCHITECTURE.md` §1 ("Hard modeling question 3") reject whole-routine versioning outright: `routine_exercise` is freely mutable, and `session_exercise` carries a frozen copy of the prescription taken once at session start and never re-read. `apps/api/src/db/schema/session.ts` implements it (six `target_*` columns plus a no-FK `routine_exercise_id` for traceability only) and `apps/mobile/lib/db/log-set.ts` performs the copy. **This phase must not build a `RoutineRevision` tree, a version branch, or a copy-on-edit scheme** — criterion 4 is satisfied by construction, and the work here is a regression test proving it, not a new mechanism. — **Reversibility:** one-way — replacing the snapshot with versioning after sessions exist means re-deriving every historical prescription from a routine tree that has already drifted.

- **D-02:** **No `ProgramWeek` → `ProgramDay` → `RoutineExercise` duplication per week.** `ARCHITECTURE.md` §1 is explicit: a 12-week program must not become an explosion of near-duplicate day and exercise rows, because "current prescription" must stay singular and mutable for D-01 to work. See D-09 for how cycles are modelled without violating this. — **Reversibility:** one-way — unwinding a materialized per-week tree means merging thousands of drifted rows back into one.

- **D-03:** **Every user-authored row carries a client-generated UUID issued before any network round-trip** (Phase 2 D-02). `apps/mobile/lib/db/id.ts` is the issuer. Programs, days, exercises, cycles and target overrides all obey this. — **Reversibility:** one-way — an ID remapping migration across every synced table plus every client's local database.

- **D-04:** **`SyncModule` / PowerSync is the sole ingress for per-user, offline-mutable data** (Phase 2 D-01, Phase 3 D-01). Program authoring is exactly this kind of data: no REST endpoint writes a routine. `ops/powersync/sync-rules.yaml` lines 26–28 already stream `routine`, `routine_day` and `routine_exercise` scoped by `routine.user_id` through joins. Any new table added by this phase joins back to `routine` the same way. — **Reversibility:** one-way.

- **D-05:** **Archive is a nullable timestamp, never a hard delete** (Phase 3 D-05, `PITFALLS.md` §11). `routine.archived_at` already exists. Restore is setting it back to null. A routine with logged history is never destroyed — `workout_session.routine_day_id` points into it. — **Reversibility:** one-way — a hard delete that reaches production destroys history that cannot be reconstructed.

- **D-06:** **Weights are stored canonically in kg as decimal, converted only at the display boundary** (Phase 2 D-04, `packages/api-contracts/src/units.ts`). Nothing in this phase stores a load, but any weight shown or entered in a builder field obeys it. — **Reversibility:** one-way.

- **D-07:** **NativeWind 4 + `apps/mobile/lib/theme.ts` / `theme-colors.ts`, Phase 1's five-tab Expo Router scaffold, and `.web.tsx` siblings — never `Platform.OS` branches at a call site** (Phase 1 D-09/D-11, `docs/platform-modules.md`). This phase fills in the Programs tab and the Home tab; it does not restructure navigation. — **Reversibility:** reversible.

- **D-08:** **Single active program in v1.** Parallel/"Specialized Training" concurrent blocks were deferred to v2 at project init. The builder must not grow a concept of simultaneous blocks. — **Reversibility:** reversible — v2 adds a second active pointer, it does not undo this one.

### Cycles and targets — the schema this phase must invent

The user delegated every schema-level decision. These are not coin flips: `routine_exercise.progression_scheme_id` is a bare `text` column that **nothing in the repository references**, there is no cycle table, no deload column and no time-off column. PROG-04, PROG-05 and PROG-06 currently have no home in the shipped schema.

- **D-09:** **A cycle is a first-class row (`routine_cycle`), and this does not violate D-02.** New table: `id`, `routine_id` (FK, cascade), `order_index`, `name`, `kind`, and a nullable `duration_days`. Ownership resolves through `routine.user_id` exactly as `routine_day` does — no `user_id` column, no `server_seq` (Phase 2's aggregate-root rule, T-02-03). The prohibition in D-02 is on duplicating the *day and exercise tree* per week; a cycle row that owns no children is 4–8 rows per program, not an explosion, and the user's chosen UI (a cycle selector strip pinned above the days, with the deload and time off visibly distinct inside it) requires cycles to be addressable, orderable and individually styleable. Deriving them from an integer count would make PROG-05 and PROG-06 unexpressible. — **Reversibility:** one-way — cycles become the addressing key for every target override and for the Home tab's position resolution.

- **D-10:** **Per-cycle targets are sparse override rows, not per-cycle copies.** New table `routine_exercise_cycle_target`: `id`, `routine_exercise_id` (FK, cascade), `cycle_id` (FK, cascade), and the same six nullable `target_*` columns `routine_exercise` already carries. `routine_exercise` keeps its existing columns as the **base prescription**. Resolution is `override ?? base`, and a row exists **only where the user actually changed a value** — building a 6-week program with one heavier week materializes a handful of rows, not six full copies. This satisfies PROG-04 literally ("each with its own targets") and PROG-09 ("see per-cycle rep/RIR targets") without a formula language, and keeps D-01's "current prescription is singular" property intact because the base row is still the single mutable prescription. — **Reversibility:** one-way — the override table is what every read path, the session snapshot and Phase 8's write target all key on.

- **D-11:** **`ARCHITECTURE.md` §1's `PeriodizationScheme` is Phase 8's, not this phase's — and this is a deliberate deviation, recorded here so the researcher does not "fix" it.** §1 proposes that per-cycle drift be described by a rule behind `progression_scheme_id`. That is the right home for *engine-computed* drift, which is Phase 8's subject. PROG-04 is about drift the **user authors by hand**, and a rule engine cannot express "I want 8 reps in week 3 because I said so." D-10 stores what the user authored; a scheme can be layered behind `progression_scheme_id` later without touching it. **`progression_scheme_id` stays a nullable, unowned `text` column in this phase — do not define it, do not add an FK, do not build a scheme table.** — **Reversibility:** reversible — adding the scheme table later is additive.

- **D-12:** **Deload and time off are cycle kinds, not separate columns.** `routine_cycle.kind` ∈ `'training' | 'deload' | 'time_off'`. PROG-05's "deload at the start or end of a cycle" — read against `FEATURES.md` line 40's "Deload First Cycle" vs "Deload Last Cycle" — is a deload cycle at `order_index` 0 or at the last index; position needs no enum of its own, `order_index` already carries it. Time off (PROG-06) is a cycle with `kind = 'time_off'` and a `duration_days`, which is why that column exists. The user's UI decision reinforces this: both read as visually distinct entries **in the same cycle strip** as training cycles, which only works if they are the same kind of row. — **Reversibility:** costly — `kind` is a discriminator the strip UI, the position resolver and Phase 8 all branch on; widening the vocabulary later is additive, changing its meaning is not.

- **D-13:** **The `kind` vocabulary lives in `packages/api-contracts/`, alongside the Phase 3 `load_type` precedent, and is enforced on both sides.** `PITFALLS.md` §9 is precisely the failure of leaving a discriminator as undocumented free text — Phase 3 already paid this cost once with `load_type` (`docs/catalog-load-types.md` is the remediation). Do not repeat it: one exported vocabulary, a Postgres check constraint, and the same values on the local SQLite side. The contract package is additive-only while any client is in the field. — **Reversibility:** one-way — the value lands in a notNull column and is a published contract.

### Program lifecycle

- **D-14:** **"Active" is `user_preference.active_routine_id`, not a value of `routine.status`.** This is the decision that makes PROG-08 correct offline. If active were a status value, two devices each activating a different program while offline would both push `status = 'active'` and row-level LWW would leave two active routines with no way to pick a winner — a partial unique index on Postgres would then reject a sync push and jam the upload queue. Moving the pointer to a single column on a single per-user row makes LWW resolve it correctly and makes two-actives **structurally unrepresentable**. `user_preference` already exists with exactly this shape and already holds `default_equipment_profile_id`. Add a nullable `active_routine_id`. — **Reversibility:** one-way — the pointer is the invariant; reintroducing a status flag reintroduces the divergence.

- **D-15:** **`routine.status` is `'draft' | 'ready'` and nothing else; archive stays on `archived_at`.** With active moved to D-14, status carries only whether the program has been finished being authored. Archive is `archived_at` per D-05 — one source of truth, so restore cannot leave a row that is both archived and not. Note `apps/api/src/seed/generate-corpus.ts` writes the literal `'active'` today and must be migrated. Same enforcement as D-13: contract package, Postgres check, matching SQLite side. — **Reversibility:** one-way — a notNull column on every routine row.

- **D-16:** **Freeze is an independent boolean (`routine.progression_frozen`, default false), never a status value.** PROG-10 is "progression stops modifying it" — a program is frozen *while active*, so `active AND frozen` must be representable, which a single status enum cannot do. This matches the user's UI choice (an always-visible "Update program" switch on the active program screen, mirroring MacroFactor's own toggle at `FEATURES.md` line 39) — a toggle needs an orthogonal boolean behind it. — **Reversibility:** reversible.

- **D-17:** **Phase 8's engine writes to future cycle overrides only — never the base prescription, never a past or current cycle — and `progression_frozen` is the gate on those writes.** This phase does not implement the engine, but it must fix the write target now, because that is what gives PROG-10 a concrete meaning and what stops a recommendation from silently rewriting what the user authored. History is already safe via D-01 regardless. Record this as the contract Phase 8 inherits; Phase 8 finalizes the rule, not the target. — **Reversibility:** costly — every later read path assumes user-authored and engine-authored values are distinguishable by which row they live in.

- **D-18:** **Duplicate is a deep copy with fresh client UUIDs.** PROG-07 duplicates both a whole program and a single workout within one. Whole program: copy `routine` + `routine_cycle` + `routine_day` + `routine_exercise` + `routine_exercise_cycle_target`, all with new UUIDs per D-03, `created_from_template_id` (the column already exists, unused) set to the source routine id, `archived_at` null, `status = 'draft'`, `progression_frozen` false, and **never** touching `user_preference.active_routine_id`. Single day: copy `routine_day` + its `routine_exercise` rows + their overrides, appended at the end of the day order. — **Reversibility:** reversible.

### Scheduling and "upcoming"

- **D-19:** **The program is a floating sequence, not calendar-bound, and `routine_day.is_rest_day` goes unused in this phase.** This follows directly from the user's decision that rest days are not authored in the builder: a program is the training days in order, and when you train is not something the builder pins to weekdays. `is_rest_day` stays on the table (Phase 2 shipped it) and stays `false`; do not remove the column, do not surface it. Calendar-bound scheduling is deferred. — **Reversibility:** reversible — a calendar binding is an additive layer over an ordered sequence.

- **D-20:** **Position in the program is derived from logged history, never stored as a cursor.** The Home tab's "next up" resolves: the next day is the one following the most recent completed `workout_session`'s `routine_day_id` in the rotation, and the current cycle follows from how many rotations have completed. A stored cursor would be one more mutable synced row for two offline devices to diverge on; a derived position cannot conflict and self-heals after a skipped or duplicated session. The user can always start a different day explicitly (Phase 5). **Flag for the researcher:** confirm this resolves sanely when a day is deleted from the routine after being logged against, and when time-off cycles sit between rotations. — **Reversibility:** reversible — adding a stored cursor later is additive.

### Authoring surface — decided by the user

- **D-21:** **Days are a horizontally swipeable deck.** Push / Pull / Legs are pages you swipe between; each page is a vertical list of that day's exercises. Comparing two days is one swipe. Rest days are not pages (D-19).

- **D-22:** **A cycle selector strip is pinned above the day deck.** Cycle chips (`1 2 3 Deload 4 · Time off`) sit above the swipeable days; picking a cycle re-renders the days below with that cycle's resolved targets (D-10) without losing your place in the day. Deload and time-off cycles are unmistakably styled inside that same strip (D-12) so the whole block structure reads at a glance.

- **D-23:** **Exercises reorder by an always-visible drag handle.** A grip on every row, press and drag to reposition. See the platform note in `<code_context>` — this is the phase's largest unbudgeted technical risk.

- **D-24:** **Adding exercises opens the Phase 3 catalog full-screen in multi-select mode.** The existing search and filter-chip surface, but selections accumulate and land in the day together on Add. Optimized for building a day from empty.

- **D-25:** **Targets are entered inline on the expanded exercise row.** Tapping an exercise expands it in place to reveal sets / rep range / RIR range / rest. No modal, no screen change — neighbouring exercises stay visible while numbers are set.

- **D-26:** **The Programs tab is the active program; a separate library screen holds the rest and the archive.** The everyday screen stays focused on the one program being run. Duplicate, archive, restore and rename live in the library; the freeze toggle is on the active screen (D-16).

- **D-27:** **Upcoming workouts appear on the Home tab, not the Programs tab.** Home leads with "next up" — the next workout and its resolved targets, with target-muscle chips. PROG-09 is satisfied on Home; Programs stays about authoring and managing. Note `apps/mobile/app/(tabs)/index.tsx` is currently a placeholder and becomes real in this phase.

- **D-28:** **"New program" offers blank or duplicate-an-existing as the first choice.** PROG-07 needs duplication anyway; surfacing it at creation is where it is actually useful. On a truly empty account, blank is the only live option.

### Claude's Discretion

The user delegated every schema-level area (D-09 through D-20 above resolve them explicitly rather than leaving them open) and asked to be consulted on UI only. The following remain genuinely open for research and planning:

- **A reorder and paging library that works on React Native *and* React Native Web.** See `<code_context>` — neither exists in the tree today and this blocks D-21 and D-23. This is the item most likely to change the phase's plan count.
- **`order_index` rewrite strategy under offline concurrency.** Contiguous integers mean a single drag rewrites many rows, and two devices reordering the same day offline produce a row-level-LWW interleaving that may not be either user's intent. Fractional or gap-based indices avoid the rewrite; decide deliberately and record why. Applies to both `routine_day.order_index` and `routine_exercise.order_index`.
- **Draft persistence.** The house architecture (D-04) argues a half-built program is a real `routine` row with `status = 'draft'` written locally from the first keystroke — it survives an app kill and reaches the other device — rather than in-memory state committed at the end. Confirm this against the builder's editing model, and decide what discarding a draft does (`archived_at`, or a real delete, which is safe only while no session has ever referenced it).
- **Where target resolution lives.** `override ?? base` (D-10) is needed by the builder, by the Home tab's next-up card, and by `apps/mobile/lib/db/log-set.ts`'s session snapshot. It must be one shared pure function, not three implementations — `packages/api-contracts/` or a small shared module. Getting this wrong makes the snapshot disagree with what the builder displayed.
- **What a blank target means.** All six `target_*` columns are nullable on `routine_exercise` today and will be on the override table. Define what Phase 8 and Phase 5 should read from a null — unset, or deliberately unprescribed — and whether the builder is allowed to save an exercise with no targets at all.
- **Query shape for the builder and the next-up card.** `PITFALLS.md` §13 names program → days → exercises → sets as the textbook N+1 setup and asks for query-count assertions on program detail. The builder holds the whole tree open at once.
- **Whether `zustand` is introduced here.** `STACK.md` names it for ephemeral UI state and it is not installed. The swipe deck's current page, the expanded row, and multi-select picker state are candidates — or component state may be enough. Decide once; this phase sets the precedent for Phases 5–11.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The data model — read before touching any schema
- `.planning/research/ARCHITECTURE.md` §1 — the `Routine` / `RoutineDay` / `RoutineExercise` entities, the explicit "no `ProgramWeek` table" ruling (line 51), and "Hard modeling question 3" (line 78) establishing snapshot-on-use over routine versioning. D-02 and D-11 are deviations *from* and *within* this document — read it before disagreeing with either.
- `apps/api/src/db/schema/program.ts` — the shipped `routine` / `routine_day` / `routine_exercise` tables, including the code comment recording why no `ProgramWeek` exists and why days carry no ownership column.
- `apps/api/src/db/schema/session.ts` — `session_exercise`'s six frozen `target_*` columns and the no-FK `routine_exercise_id`; the mechanism behind success criterion 4.
- `apps/api/src/db/schema/preference.ts` — `user_preference`, the row D-14 extends with `active_routine_id`.
- `apps/mobile/lib/db/schema.ts` — the local SQLite mirror; gains `routine_cycle` and `routine_exercise_cycle_target`.
- `ops/powersync/sync-rules.yaml` lines 26–28 — the existing routine-scoped joins any new table must copy.

### Requirements and scope
- `.planning/ROADMAP.md` "Phase 4: Program Builder" — the four success criteria, and Phase 5/8's boundaries.
- `.planning/REQUIREMENTS.md` lines 39–49 — PROG-01 through PROG-11 verbatim.
- `.planning/PROJECT.md` — core value, the local-first constraint, and the rule-based-not-AI commitment.

### The reference product
- `.planning/research/FEATURES.md` lines 32–40 — MacroFactor's own Build From Scratch flow, the cycle-as-periodization-unit statement, the program library screen layout, the "Update Program" freeze toggle (line 39), and Deload First/Last Cycle (line 40).

### Pitfalls this phase must not walk into
- `.planning/research/PITFALLS.md` §5 — React Native Web platform divergence; the live risk behind D-21 and D-23.
- `.planning/research/PITFALLS.md` §9 — domain modelling that cannot express real training data; the reason D-13 refuses another undocumented free-text discriminator.
- `.planning/research/PITFALLS.md` §11 — editing history and deleting rows corrupting downstream analytics; behind D-05 and D-18.
- `.planning/research/PITFALLS.md` §13 — N+1 on nested program data; behind the query-shape discretion item.

### What Phases 1–3 built and locked
- `.planning/phases/02-data-model-sync-engine/02-CONTEXT.md` — D-01 (sync ingress), D-02 (client UUIDs), D-04 (kg canonical), D-05 (snapshot-on-use).
- `.planning/phases/03-exercise-catalog/03-CONTEXT.md` — the catalog delivery model, per-user exercise state, and the component patterns this phase reuses.
- `docs/platform-modules.md` — the `.web.tsx` convention and the native-capability web audit; the governing document for any library added under D-21/D-23.
- `docs/catalog-load-types.md` — the precedent for how a shared discriminator vocabulary is documented and enforced; D-13 follows its shape.
- `.planning/WINDOWS.md` — open unrun-verify entries; native verification remains deferred to Phase 999.1 (no Xcode, no Android SDK on this machine).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/mobile/components/` — Phase 3 shipped the house style this phase inherits: `SearchField`, `FilterChipRow`, `ExerciseListRow`, `DetailSection`, `SelectField`, `TextField`, `PrimaryButton`, `ArchiveDialog`, `ErrorBanner`, `NavBackButton`. D-24's picker is the Phase 3 catalog screen in multi-select mode, and `ArchiveDialog` already covers the archive/restore confirmation shape D-05 needs.
- `apps/mobile/lib/catalog/` — `catalog-filter.ts`, `search-index.ts` (backed by `minisearch`), `smart-swap.ts`. The picker should not reimplement search.
- `apps/mobile/lib/db/id.ts` — the client UUID issuer every new row uses (D-03).
- `packages/api-contracts/src/` — `catalog.ts`, `sync.ts`, `units.ts`. The home for D-13's and D-15's vocabularies.
- `@shopify/flash-list` 2.0.2 — the installed virtualized list; the exercise list inside a day page is a candidate.

### Established Patterns
- **Aggregate-root ownership**: child tables carry no `user_id` and no `server_seq`; ownership and merge order resolve through the root (`workout_session`, `routine`). `routine_cycle` and `routine_exercise_cycle_target` follow this.
- **Platform divergence is a `.web.tsx` sibling resolved at build time, never a `Platform.OS` branch at a call site** (Phase 1, `docs/platform-modules.md`).
- **Suite integrity is enforced by a Jest reporter** (`scripts/jest-suite-integrity.cjs`) — a zero-test or all-skipped run fails. New surfaces need real tests, not placeholders.
- **`apps/api` has no `test` script by design** — every API test is end-to-end.

### Integration Points
- `apps/mobile/app/(tabs)/programs.tsx` — a `PlaceholderScreen` today; becomes the active-program screen (D-26).
- `apps/mobile/app/(tabs)/index.tsx` — a placeholder today; gains the "next up" card (D-27, D-20).
- `apps/mobile/lib/db/log-set.ts` — `snapshotPrescription` currently reads `routine_exercise` alone. **It must be extended to resolve `override ?? base` for the current cycle** (D-10), or every session logged against a program with per-cycle targets will snapshot the wrong numbers. This is the single highest-risk integration point in the phase.
- `ops/powersync/sync-rules.yaml` — two new joined queries.
- `apps/api/src/seed/generate-corpus.ts` line 279 — writes `status = 'active'`; must migrate to D-14/D-15.

### The phase's largest technical risk — flagged, not solved
`apps/mobile/package.json` contains **no `react-native-gesture-handler`, no `react-native-reanimated`, no pager/tab-view library and no drag-and-drop library.** Both the swipeable day deck (D-21) and the always-visible drag handle (D-23) require dependencies that do not exist in the tree and that must behave identically on React Native and React Native Web — `PITFALLS.md` §5 is exactly this failure mode, and Phase 1's sanctioned escape hatch is a `.web.tsx` split rather than a second implementation. The researcher must resolve library choice, New-Architecture compatibility (mandatory on Expo SDK 57, cannot be disabled) and the web story **before** the planner sizes the builder screens. If no single library serves both targets, the `.web.tsx` split is the answer, not abandoning the interaction.

### Environment constraint
No Xcode and no Android SDK on this machine — every native claim rests on typecheck plus correct API usage, and native observation is deferred to ROADMAP Phase 999.1. The web target is where this phase can actually be exercised end to end. That makes D-21/D-23's web behaviour verifiable now and its native behaviour an explicit `.planning/WINDOWS.md` entry.

</code_context>

<specifics>
## Specific Ideas

- **"Comparing two days is one swipe."** The reason the day deck won over a single scrolling page and over drill-down screens — the split is the thing being judged, not one day in isolation.
- **The cycle strip should read like a block plan at a glance**: `1 2 3 Deload 4 · Time off`. Deload and time off are visually distinct *in the strip itself*, so the shape of the mesocycle is legible without opening anything.
- **MacroFactor's "Update Program" toggle** is the explicit model for the freeze control (`FEATURES.md` line 39) — an always-visible switch on the active program screen, so it is never ambiguous whether your numbers are still moving.
- **The builder should not put anything between the user and building** — but duplicating an existing program is offered at creation, because that is where it is actually useful.

</specifics>

<deferred>
## Deferred Ideas

- **Calendar-bound scheduling** (Mon/Wed/Fri, missed-day handling, planned dates) — D-19 chose a floating sequence. A calendar binding is an additive layer if a later phase wants it.
- **Authored rest days in the builder** — `routine_day.is_rest_day` stays on the table, unused (D-19). Revisit only if calendar scheduling arrives.
- **`PeriodizationScheme` behind `progression_scheme_id`** — engine-computed per-cycle drift; Phase 8's subject (D-11).
- **Superset authoring in the builder** — `routine_exercise.superset_group_id` already exists but no PROG requirement covers authoring it, and advanced set types are Phase 5's (LOG requirements). The column stays null in this phase.
- **Auto-generated programs** from goal, experience, equipment and schedule — Phase 11.
- **Parallel / "Specialized Training" concurrent blocks** — v2, per project init.
- **A `RoutineRevision` audit timeline** ("you changed your program on this date") — `ARCHITECTURE.md` §1 explicitly calls this optional and low-stakes, and says not to build it until a concrete feature asks. Nothing in Phase 4 asks.

</deferred>

---

*Phase: 4-program-builder*
*Context gathered: 2026-08-20*
