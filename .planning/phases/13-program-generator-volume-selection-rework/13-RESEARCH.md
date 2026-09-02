# Phase 13: Program Generator Volume & Selection Rework - Research

**Researched:** 2026-09-02
**Domain:** Deterministic program-generation algorithm rework inside an existing pure TypeScript
package (`@fitness/program-generator`) — no new libraries, no I/O, no external services.
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** A single exercise carries at most `MAX_SETS_PER_EXERCISE = 5` sets in any session
  and never fewer than `MIN_SETS_PER_EXERCISE = 2` once it exists. Per-session sets for a muscle
  group are still `round(weeklySets / frequency)`; when that exceeds the cap, the group gets
  `ceil(sessionSets / cap)` exercises in that day and the sets are divided across them as evenly
  as possible (e.g. 10 → 5 + 5, 8 → 4 + 4, 7 → 4 + 3). The split is computed against the
  HARDEST training cycle's target so exercise count is stable across cycles; earlier cycles
  simply carry fewer sets per exercise, never fewer exercises. — **Reversibility:** easy.
- **D-02:** The extra exercise for a group is a real second slot in `GeneratedDay.slots` with
  its own `exerciseId`, ordered directly after the first exercise for that group. It is picked
  by the same picker with the day's and the week's already-picked sets applied (D-05), so it is
  a different movement. Slot keys stay unique and gap-ordered (`ORDER_INDEX_GAP` convention).
- **D-03:** `trimToSessionLength` is replaced by a fit that evaluates the estimate against the
  HARDEST training cycle (the largest per-slot set count any training cycle will assign), never
  cycle 1 alone. `estimateSlotMinutes`, `WORK_SECONDS_PER_SET` and `SESSION_OVERHEAD_MINUTES`
  keep their current values and remain the single time model.
- **D-04:** Fit order, applied until the hardest-cycle estimate fits or nothing more can go:
  1. Reduce sets on every exercise uniformly, one set per pass across the day, down to
     `MIN_SETS_PER_EXERCISE` — the cheapest concession and the one that keeps every muscle group
     trained.
  2. Then remove whole exercises by priority: second exercises of a group before first
     exercises; `small` volume-class groups before `medium` before `large`; later slots before
     earlier slots within the same tier. A day never loses its last `large`-class exercise while
     any other exercise remains.
  The first slot always survives (existing "never empty for non-empty input" rule). Set
  reductions apply proportionally to every cycle's override so the ramp (mev → mav shape) is
  preserved at the reduced ceiling; per-cycle targets are recomputed after the fit, not before.
- **D-05 (degradation contract):** `day_trimmed` keeps its `kind` but its `detail` now reports
  what actually happened: exercises removed and/or sets reduced, and the resulting estimate
  versus the budget. The wizard sentence in `apps/mobile/lib/programs/generation-wizard.ts`
  ("left room for fewer exercises, so some were dropped") is reworded so it is true for both
  outcomes — the generator, not the copy, is the source of truth. No new `DegradationEntry.kind`
  is added, so existing consumers keep working.
- **D-06:** `generateProgram` threads a week-level `pickedByMuscleGroup: Map<MuscleGroupId,
  Set<exerciseId>>` across days. For a slot, a candidate already used for THIS muscle group on
  an earlier day of the week is ranked below every unused candidate of equal quality, and is
  chosen only when no unused candidate scores above zero. The same exercise may still appear
  twice in a week when the pool is genuinely exhausted (e.g. a bodyweight-only gym), and the
  existing per-day `alreadyPicked` rule still forbids the same exercise twice in one day.
  Determinism (Phase 11 D-03) is preserved: the ordering is a pure function of the inputs and
  `variantSeed`.
- **D-07:** Slot scoring becomes a tiered sort key rather than a single weighted sum, so a
  catalog whose primary weights are all `1.00` still produces a defensible order:
  1. primary-muscle score (existing `scoreCandidateForSlot`, unchanged semantics);
  2. compoundness: count of distinct secondary muscle groups the exercise maps (more = more
     compound); the FIRST exercise chosen for a muscle group in a day must be the most compound
     available, the second (D-02) may be an isolation movement;
  3. loadability: `equipmentRequired` in `MODEL_EQUIPMENT_TYPES` (barbell, dumbbell, machine,
     cable — the inventory-modelled types from `@fitness/plate-math`) ranks above bodyweight or
     null, because those are the exercises the progression engine can actually load;
  4. movement-pattern coverage: a candidate whose `movementPattern` is non-null and not yet
     present in the day ranks above one that is null or already covered;
  5. week-level unused-before-used (D-06);
  6. the existing `seededRank` tie-break, then exercise id.
  When `inventory` is `null` (no gym profile) the loadability tier still applies — a loadable
  exercise is a better default than an isometric hold.
- **D-08:** Any exercise whose mapping to the slot's muscle group is only `secondary` is never
  chosen for that slot while a `primary`-mapped candidate exists (today a 0.25-weighted secondary
  can win against nothing; it must not win against a primary).
- **D-09:** `rirForCycle(cycleIndex)` becomes `rirForCycle(cycleIndex, daysPerWeek)` backed by a
  table keyed by `daysPerWeek`, floored at the last member like today:
  - 2 days: `[2, 1, 0, 0]`
  - 3 days: `[2, 1, 1, 0]`
  - 4 days: `[3, 2, 1, 1]` (today's ladder, unchanged)
  - 5 and 6 days: `[3, 2, 2, 1]`
  Fewer sessions mean more recovery between them, so the ladder ends nearer failure; six sessions
  a week never reach RIR 0. `docs/volume-rir-landmarks.md` gains a section stating this table and
  the reasoning as this project's own design decision (same provenance stance as D-15 in Phase 11).
  Deload targets (`deloadOverrideFor`) are untouched.
- **D-10:** `generateProgram` stays pure and deterministic; `GenerationInput`,
  `GeneratedProgramTree`, `GeneratedSlot`, `DegradationEntry.kind` values and the exported
  constants that other packages import keep their names. Apps compile without changes beyond the
  wizard copy in D-05.
- **D-11:** A regression test pins the reported scenario using a fixture derived from the real
  catalog snapshot (`apps/api/src/seed/data/catalog-normalized.json`, copied or trimmed into
  `packages/program-generator/src/__fixtures__` since the package cannot import from `apps/api`):
  2 days, 60 minutes, intermediate, hypertrophy, auto split, 4 cycles, no inventory. It asserts
  at least 4 exercises per day, the two days do not share an exercise for the same muscle group,
  no exercise exceeds 5 sets in any cycle, the hardest-cycle estimate is within 60 minutes, and
  the cycle-4 RIR is 0.

### Claude's Discretion

- Exact tie-break weights inside D-07 tiers, the internal shape of the fit algorithm (D-04) as
  long as the order of concessions holds, and whether the split-and-fit logic lives in new
  modules (`volume-split.ts`, `session-fit.ts`) or extends `session-length.ts`.
- How much of the real catalog the regression fixture carries, provided the fixture is
  deterministic and the reported scenario reproduces the pre-fix failure against the old code.

### Deferred Ideas (OUT OF SCOPE)

- Per-muscle-group set caps that differ by volume class (e.g. 6 for large groups).
- User-facing controls for RIR aggressiveness or sets-per-exercise.
- Catalog quality work: distinguishing weight factors per primary mapping, or a curated
  "staple" flag on bench/squat/row/press movements. D-07 makes selection defensible without it.
- Rest-time scaling with session length.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| GEN-VOL-01 | Per-exercise volume cap with a second exercise absorbing the remainder | Architecture Patterns' call-graph section pinpoints exactly where in `generate.ts` the D-01/D-02 split must be inserted (before the slot-build loop's pick, after the hardest-cycle number is known); Pitfall 1 and the D-11 fixture strategy address the test-fixture gap this creates. |
| GEN-VOL-02 | Session-budget fit against the hardest cycle, sets before exercises | Architecture Patterns' call-graph and "hardest training cycle" math section give the exact index (`trainingCycleCount - 1`) and the verified monotonic-ramp proof that makes it safe to use without searching all cycles; Pitfall 4 flags that `session-length.test.ts` tests the replaced behavior. |
| GEN-SEL-01 | Week-level exercise variety | Anti-Patterns section distinguishes the existing day-scoped `alreadyPicked` from the new week-scoped `pickedByMuscleGroup` D-06 requires; Pitfall 2 covers the `pickSlotExercise` signature break this causes. |
| GEN-SEL-02 | Tiered selection scoring favoring compound/loadable/pattern-covering exercises | Code Examples section verifies `MODEL_EQUIPMENT_TYPES` is a 5-member array (`barbell, ez_bar, dumbbell, machine, cable`, not 4 as CONTEXT.md's prose states) and confirms via direct catalog query that all 82 chest-primary mappings carry `weight_factor: 1.00`, the exact condition D-07 exists to fix. |
| GEN-RIR-01 | daysPerWeek-keyed RIR ladder | Pitfall 2 and Pitfall 3 cover the `rirForCycle` signature break and the cascading hardcoded-RIR-value fix required in the shared `__fixtures__/parity.ts` table (consumed by two other apps' test suites); docs/volume-rir-landmarks.md's existing per-constant table format is confirmed as the pattern the new section should follow. |
</phase_requirements>

## Summary

This phase touches exactly six files inside `packages/program-generator/src` (`generate.ts`,
`session-length.ts`, `slot-fill.ts`, `volume-landmarks.ts`, plus new modules at Claude's
discretion) and one file outside it (`apps/mobile/lib/programs/generation-wizard.ts`). Every
decision in `13-CONTEXT.md` is already fully scoped against code read this session — there is no
external library to evaluate and no new dependency to vet. The work is a **sequencing rewrite**
inside `generateProgram` (`generate.ts:60-203`): today the slot loop computes each slot's `base`
from **cycle-0 numbers only** (`generate.ts:143-149`), trims on that base alone
(`generate.ts:158`), and only then fans out per-cycle overrides (`generate.ts:168-197`). The five
bugs the phase fixes are consequences of that ordering: nothing ever looks at the **last training
cycle** (the hardest one, since `weeklySetTarget` ramps monotonically from `mev` to `mav`,
verified `volume-landmarks.ts:69-83`) before deciding exercise count or trimming, so a session that
fits cycle 1 silently blows its budget by cycle 4, and a muscle group that needs two exercises at
cycle 4 only ever gets one slot, built once, before any cycle exists.

The most consequential ripple effects are two **signature changes**: `pickSlotExercise` gains a
week-level `pickedByMuscleGroup` parameter (D-06) and a full D-07 tiered-scoring rewrite, breaking
every call site including `slot-fill.test.ts`'s five direct calls; and `rirForCycle` gains a
`daysPerWeek` parameter (D-09), breaking `volume-landmarks.test.ts`'s three direct calls **and**
silently invalidating hardcoded RIR values in the shared parity fixture table
(`__fixtures__/parity.ts`), which pins `daysPerWeek: 3` throughout and hardcodes `handBuilt(8, 12,
3)` — a value that is wrong the moment D-09's 3-day ladder (`[2, 1, 1, 0]`) replaces today's
uniform `[3, 2, 1, 1]`. `trimToSessionLength`'s entire test suite (`session-length.test.ts`) tests
behavior D-03/D-04 explicitly replaces and must be rewritten, not patched.

**Primary recommendation:** Sequence the rewrite as (1) compute per-muscle-group hardest-cycle
weekly sets once per day before any slot is built, (2) run the D-01 split + D-04 fit against those
hardest-cycle numbers to fix exercise count and per-exercise set ceiling for the day, (3) only then
loop cycles and derive each cycle's per-exercise sets by re-applying `weeklySetTarget` at that
cycle's index and re-clamping to the fit-determined ceiling — never by linearly scaling the
hardest-cycle number down, which would not reproduce `weeklySetTarget`'s ramp shape for
non-emphasized groups. Update `pickSlotExercise` and `rirForCycle` signatures first, in isolation,
so every downstream compile error surfaces before the harder algorithmic work begins.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-exercise volume cap + split (GEN-VOL-01) | Shared package (`@fitness/program-generator`) | — | Pure deterministic domain logic consumed identically by client and server (Phase 11 D-01); no UI or persistence concern. |
| Session-budget fit (GEN-VOL-02) | Shared package | — | Same — `trimToSessionLength`/its replacement is pure arithmetic over `GeneratedSlot[]`. |
| Week-level variety (GEN-SEL-01) | Shared package | — | State (`pickedByMuscleGroup`) is local to one `generateProgram` call, never persisted or read cross-request. |
| Selection scoring (GEN-SEL-02) | Shared package | — | `slot-fill.ts` is the sole scoring surface; `@fitness/plate-math` is a read-only dependency for `MODEL_EQUIPMENT_TYPES`/`canEquip`, not a new tier. |
| Frequency-aware RIR (GEN-RIR-01) | Shared package | — | `volume-landmarks.ts` constant table; no client/server divergence. |
| Degradation copy reword (D-05) | Frontend Server / Client (Expo, `apps/mobile`) | Shared package (source of truth for `detail` text) | `describeDegradation` (`generation-wizard.ts:288-299`) is presentation-only; the generator's `DegradationEntry.detail` string is the actual source of truth per D-05. |
| Regression fixture (D-11) | Shared package test fixtures | — | Lives under `packages/program-generator/src/__fixtures__` because the package cannot import `apps/api` (Phase 11 boundary). |

## Standard Stack

No new libraries. This phase modifies existing pure TypeScript inside an already-established
workspace package (`@fitness/program-generator`, `packages/program-generator/package.json:1-24`,
read this session) with two existing workspace dependencies — `@fitness/api-contracts` and
`@fitness/plate-math` — and one dev-only workspace dependency, `@fitness/progression-engine`, used
solely by `parity.test.ts`. No `npm install` step is required.

### Package Legitimacy Audit

**N/A — this phase installs no new packages.** All imports used or extended in this phase
(`@fitness/api-contracts`, `@fitness/plate-math`) are existing internal workspace packages, already
present in `package.json` (`dependencies`, read this session) and not subject to registry
legitimacy checks.

## Architecture Patterns

### Current call graph in `generate.ts` (verbatim, read this session)

`generate.ts:60-203`, the whole of `generateProgram`. The load-bearing sequencing:

```
generate.ts:69-73    buildCandidatePool(...)                         — once, whole program
generate.ts:74       resolveSplitTemplate(...)                       — once, whole program
generate.ts:93-97    placeCycles(...)                                — once, whole program
generate.ts:99-106   trainingIndexByCycleKey built                   — maps cycle.key -> 0..N-1

  for each dayPattern (template.dayPatterns.forEach):
    generate.ts:119-130  for each slotDef: pickSlotExercise(pool, slotDef, variantSeed, alreadyPicked)
    generate.ts:137-141  baseWeeklySets = applyEmphasis(weeklySetTarget(experienceLevel, group, 0, trainingCycleCount), ...)
                          ^ CYCLE-0 ONLY — root cause of GEN-VOL-01/02
    generate.ts:143-149  base: ResolvedTarget = { targetSets: round(baseWeeklySets/frequency), ..., targetRir: rirForCycle(0) }
    generate.ts:151-153  builtSlots.push({ key, exerciseId, orderIndex, base, overridesByCycleKey: {} })

    generate.ts:158      trimResult = trimToSessionLength(builtSlots, sessionLengthMinutes)
                          ^ operates on the CYCLE-0 `base` array only — root cause of GEN-VOL-02's
                            "later cycles never checked" bug
    generate.ts:159-166  day_trimmed degradation if trimResult.removedCount > 0

    generate.ts:168-197  finalSlots = trimResult.slots.map(slot => {
                            for each cycle in cycles:
                              if deload: deloadOverrideFor(slot.base)
                              else: cycleSets = round(applyEmphasis(weeklySetTarget(exp, group, trainingIndex, count), ...) / frequency)
                                    cycleRir = rirForCycle(trainingIndex)
                                    override = buildOverride(slot.base, cycleSets, cycleRir)
                            overridesByCycleKey[cycle.key] = override  (if !isEmptyOverride)
                          })
                          ^ per-cycle overrides ARE already computed after the (broken) trim —
                            D-04's "per-cycle targets are recomputed after the fit, not before"
                            is already true structurally; what's missing is that the FIT ITSELF
                            must run against hardest-cycle numbers, not cycle-0 numbers.

    generate.ts:199   days.push({ key: dayKey, ..., slots: finalSlots })
```

**Where D-01/D-03/D-04 must sit:** between the slot-build loop (`generate.ts:119-154`, which picks
exercises and computes `base`) and the per-cycle override loop (`generate.ts:168-197`, which is
already correctly positioned after the fit per D-04's own text). The change is: before trimming,
compute each slot-group's **hardest-cycle** weekly sets — `weeklySetTarget(experienceLevel, group,
trainingCycleCount - 1, trainingCycleCount)` (verified: `weeklySetTarget` ramps monotonically to
`mav` at `cycleIndex = trainingCycleCount - 1`, `volume-landmarks.ts:69-83`, and
`volume-landmarks.test.ts:9-16` asserts `weeklySetTarget(..., 3, 4)` — the last index — is the
band's `mav`-bounded maximum) — then run D-01's split (decide exercise count per group) and D-04's
fit (reduce-then-remove) against **that** number, not cycle-0's. Only after the day's final slot
list and per-exercise set ceiling are fixed does the existing per-cycle loop
(`generate.ts:168-197`) recompute each cycle's actual sets, re-applying `weeklySetTarget` at that
cycle's own index and clamping to the ceiling the fit established — this is what D-04 means by "the
ramp (mev → mav shape) is preserved at the reduced ceiling."

**A structural note for the split (D-01/D-02):** the exercise-count decision (how many slots a
muscle group gets) must be made **before** `pickSlotExercise` is called for that group's second
slot, because the second slot needs `alreadyPicked` (day-level) and `pickedByMuscleGroup`
(week-level, D-06) to already include the first slot's exercise id. This means the slot-build loop
at `generate.ts:119-130` cannot stay a single flat `for (const slotDef of dayPattern.slots)` —
it needs to expand each `slotDef` into 1 or 2 logical slots (per the D-01 split against the
hardest-cycle number) before picking, then pick each expanded slot in order so the second pick sees
the first pick's id in `alreadyPicked`.

### Recommended module layout

Per Claude's Discretion (13-CONTEXT.md line 148), two new modules are the cleanest split — one for
the pure-math split decision, one for the fit:

```
packages/program-generator/src/
├── generate.ts          # composition entry point — now also expands slotDefs per D-01/D-02
├── volume-split.ts       # NEW: computeExerciseSplit(hardestCycleSets, cap, min) -> number[] sets-per-exercise
├── session-fit.ts        # NEW: fitDayToSessionLength(slots, sessionLengthMinutes) replacing trimToSessionLength
├── session-length.ts     # KEEP: estimateSlotMinutes, WORK_SECONDS_PER_SET, SESSION_OVERHEAD_MINUTES unchanged (D-03)
├── slot-fill.ts           # D-06/D-07/D-08 tiered scoring rewrite; pickSlotExercise gains pickedByMuscleGroup param
├── volume-landmarks.ts    # D-09: rirForCycle(cycleIndex, daysPerWeek) + new ladder table
├── split-templates.ts     # UNCHANGED (read-only this phase, per 13-CONTEXT.md line 171)
└── __fixtures__/
    ├── parity.ts           # EXISTING — values at daysPerWeek:3 must be recomputed for new RIR ladder
    └── catalog-2day-regression.ts  # NEW (D-11) — see fixture strategy below
```

`trimToSessionLength`'s exported name and shape are consumed nowhere outside this package (grep
confirmed: no external import of `trimToSessionLength` in `apps/mobile` or `apps/api`), so renaming
it to a new `fitDayToSessionLength` in a new `session-fit.ts` module is a safe internal rename, not
a public API break — `GenerationInput`, `GeneratedProgramTree`, `GeneratedSlot`,
`DegradationEntry.kind` (D-10's compile-surface guarantee) are unaffected either way.

### Pattern: computing the "hardest training cycle" (verified math)

```typescript
// Source: volume-landmarks.ts:72-83, read this session — weeklySetTarget's own ramp
export function weeklySetTarget(
  experienceLevel: ExperienceLevel,
  muscleGroupId: MuscleGroupId,
  cycleIndex: number,
  trainingCycleCount: number,
): number {
  const band = volumeBandFor(experienceLevel, muscleGroupId);
  if (trainingCycleCount <= 1) return band.mev;
  const fraction = cycleIndex / (trainingCycleCount - 1);
  return Math.round(band.mev + (band.mav - band.mev) * fraction);
}
```

Because `fraction` is linear and non-negative, and `applyEmphasis`'s multiplier
(`emphasis.ts:3-7`, `deprioritize: 0.7, normal: 1.0, emphasize: 1.3`) is constant across cycles for
a given slot, the hardest cycle for any single muscle group across a training block is always
`cycleIndex = trainingCycleCount - 1` — the same index `generate.ts:181`
(`trainingIndexByCycleKey.get(cycle.key)`) already resolves for the *last* training cycle. No
search over cycles is needed; the hardest cycle is a known index.

### Pattern: D-07 tiered scoring (concrete shape from verified catalog data)

Verified this session against the real catalog (`apps/api/src/seed/data/catalog-normalized.json`,
34833 lines, 870 exercises, 3177 mappings — counted via `node -e` this session): **every one of the
82 `chest`-primary mappings carries `weight_factor: "1.00"`** (all 82 distinct values collapsed to
a single-element set `['1.00']`), confirming the phase description's claim exactly. Overall mapping
`role` counts: `{ primary: 870, secondary: 2307 }`; `weight_factor` across all mappings (primary and
secondary combined) does vary (`'1.00', '0.50', '0.60', '0.45', '0.70', '0.35', '0.90', '0.25',
'0.85', '0.30', '0.55', '0.40', '0.75', '0.20'`) but **every primary mapping is 1.00** — the
variation lives entirely in `secondary` mappings, which D-08 already prevents from ever outscoring
a primary candidate.

`equipment_required` distribution across the 870 exercises (counted this session):
`{ bodyweight: 110, machine: 67, other: 122, foam_roller: 11, null: 77, kettlebell: 53, dumbbell:
123, cable: 81, barbell: 170, band: 19, medicine_ball: 16, exercise_ball: 12, ez_bar: 9 }`.
`movement_pattern` distribution: `{ isolation: 286, null: 205, vertical_push: 53, horizontal_push:
68, hinge: 87, horizontal_pull: 46, carry: 6, vertical_pull: 29, squat: 73, rotation: 17 }`.

`MODEL_EQUIPMENT_TYPES` — the loadability tier D-07's tier 3 keys off — is:

```typescript
// Source: packages/plate-math/src/equippable.ts:7, read this session
export const MODEL_EQUIPMENT_TYPES: EquipmentType[] = ['barbell', 'ez_bar', 'dumbbell', 'machine', 'cable'];
```

This is **five** types, not the four (barbell, dumbbell, machine, cable) 13-CONTEXT.md's D-07 prose
names — `ez_bar` is a `MODEL_EQUIPMENT_TYPES` member too (verified, and confirmed present in the
real catalog: 9 `ez_bar` exercises). The planner should use the actual exported array
(`MODEL_EQUIPMENT_TYPES.includes(exercise.equipmentRequired)`), never a hand-copied four-item list,
so a future addition to the array is picked up automatically — this is exactly the pattern
`candidate-pool.ts:42` already uses (`if (!MODEL_EQUIPMENT_TYPES.includes(exercise.equipmentRequired)) return true;`).

`MuscleRole` is `['primary', 'secondary']` exactly (`packages/api-contracts/src/catalog.ts:93`,
read this session: `export const MUSCLE_ROLES = ['primary', 'secondary'] as const;`) — D-08's "only
`secondary`" check is `mapping.role === 'secondary'` with no third state to handle.

`MovementPattern` is a 9-member closed vocabulary (`packages/api-contracts/src/catalog.ts:71-79`,
read this session):

```typescript
export const MOVEMENT_PATTERNS = [
  'squat', 'hinge', 'horizontal_push', 'vertical_push',
  'horizontal_pull', 'vertical_pull', 'carry', 'rotation', 'isolation',
] as const;
```

### Anti-Patterns to Avoid

- **Scaling the hardest-cycle set count linearly down to earlier cycles as the per-cycle value.**
  D-04 says the ramp shape must be preserved "at the reduced ceiling" — this means re-running
  `weeklySetTarget(experienceLevel, group, cycleIndex, trainingCycleCount)` for each cycle and then
  clamping to the fit's ceiling, not multiplying the hardest-cycle number by
  `cycleIndex/(trainingCycleCount-1)`. The two are NOT equivalent for `deprioritize`/`emphasize`
  groups once `applyEmphasis`'s clamp to `[mev, mav]` has already been applied at the hardest cycle
  — clamping first then scaling linearly would distort the earlier-cycle values relative to what
  `weeklySetTarget` itself would produce for that cycle.
- **Re-deriving `MODEL_EQUIPMENT_TYPES` as a literal array inside `slot-fill.ts`.** Import it from
  `@fitness/plate-math` (already a package dependency, `package.json` line, read this session) —
  the whole point of D-07 citing it by name is single-sourcing, matching `candidate-pool.ts`'s own
  existing pattern.
- **Treating `pickSlotExercise`'s `alreadyPickedIds` parameter as sufficient for D-06.** It is
  day-scoped only (`generate.ts:114`, `const alreadyPicked = new Set<string>()` is declared inside
  `template.dayPatterns.forEach`, i.e. reset every day) — D-06 requires a *second*, week-scoped
  structure (`pickedByMuscleGroup: Map<MuscleGroupId, Set<exerciseId>>`) threaded across the
  `forEach` from outside it, not folded into the existing per-day set.

## Don't Hand-Roll

Nothing in this phase is a "don't reinvent X, use library Y" situation — the entire domain (volume
periodization math, session-time estimation, exercise selection scoring) is deliberately
project-authored per Phase 11's D-15 (no public MacroFactor math exists to consume, and no external
library models a hypertrophy volume-landmark system to this project's exact taxonomy). The relevant
discipline here is **reuse within the codebase**, not avoiding hand-rolling relative to an external
library:

| Problem | Don't Re-derive | Use Instead | Why |
|---------|------------------|--------------|-----|
| "Which equipment types does the progression engine actually model an inventory for?" | A hand-copied `['barbell', 'dumbbell', 'machine', 'cable']` literal | `MODEL_EQUIPMENT_TYPES` from `@fitness/plate-math` (`equippable.ts:7`) | Already exported, already the single source `candidate-pool.ts` consumes; a second copy drifts the moment the array gains a member. |
| "Is this a primary or secondary mapping?" | A new boolean flag | `mapping.role === 'primary'`/`'secondary'` against `MUSCLE_ROLES` | Closed two-member vocabulary, already typed as `MuscleRole`. |
| ORDER_INDEX_GAP for the new second slot | A locally re-derived gap constant | The existing `ORDER_INDEX_GAP = 1024` already declared at `generate.ts:31` | It is already duplicated (deliberately, with a comment explaining why) from `apps/mobile/lib/db/programs/order-index.ts` — do not add a third copy; extend the existing `slotOrderIndex += ORDER_INDEX_GAP` increment inside the (now slotDef-expanding) loop. |

**Key insight:** the risk in this phase is not "someone reaches for a library instead of writing
math" — it's the opposite: someone re-derives a constant or vocabulary that already has exactly one
source of truth elsewhere in this same package or its two dependencies.

## Common Pitfalls

### Pitfall 1: Existing tests built on a single-exercise-per-muscle-group catalog silently defeat D-01/D-02

**What goes wrong:** `generate.test.ts`'s `tracerInput()` (`generate.test.ts:17-33`) and
`determinism.test.ts`'s equivalent helper, `split-contract.test.ts`'s
`inputWithSingleCandidatePerGroup` (`split-contract.test.ts:151-177`), and `parity.ts`'s
`catalogCovering` (`__fixtures__/parity.ts:67-82`) **all build exactly one exercise per muscle
group**. Under D-02, a muscle group whose hardest-cycle sets exceed
`MAX_SETS_PER_EXERCISE = 5` needs a *second, different* candidate — but these fixtures have none.
**Why it happens:** these fixtures were written for Phase 11, before the per-exercise cap existed;
"one exercise per group, weight 1.0" was sufficient to exercise the old code path.
**How to avoid:** the plan must either (a) update these shared helper functions to include at
least 2 exercises per muscle group so D-02's split has somewhere to place the second slot, or (b)
explicitly assert the degraded behavior (a group whose second-exercise pick returns `null` should
NOT silently drop volume — 13-CONTEXT.md doesn't define this edge case, flagged in Open Questions
below). Either way, this is a **required editorial pass over existing fixtures**, not new fixtures
only.
**Warning signs:** a test that asserts `weeklyTotal <= 18` (the `mav` clamp test,
`generate.test.ts:113-131`) staying green for the wrong reason — because the single-candidate
catalog forces the group to stay at one exercise capped at `MAX_SETS_PER_EXERCISE`, never actually
exercising the "second exercise absorbs the remainder" code path at all.

### Pitfall 2: `pickSlotExercise` and `rirForCycle` signature changes are compile-breaking, not silently-wrong

**What goes wrong:** D-06 changes `pickSlotExercise(pool, slotDef, variantSeed, alreadyPickedIds)`
to accept a fifth argument, and D-09 changes `rirForCycle(cycleIndex)` to
`rirForCycle(cycleIndex, daysPerWeek)`. Both are called directly, with the old arity, in
`slot-fill.test.ts` (5 call sites, `slot-fill.test.ts:20-70`) and `volume-landmarks.test.ts` (3 call
sites, `volume-landmarks.test.ts:24-35`) respectively, plus `generate.ts:120` and `generate.ts:147,
188` for `pickSlotExercise`/`rirForCycle`.
**Why it happens:** TypeScript strict mode makes a missing required argument a compile error, so
this surfaces immediately in `tsc --noEmit` — the actual risk is doing the rewrite in an order that
produces a wall of unrelated compile errors obscuring the real logic bugs.
**How to avoid:** land the two signature changes as their own early step (rewrite the function
signatures and every call site to pass a sensible default/real value), run `pnpm --filter
@fitness/program-generator typecheck` clean, *then* do the algorithmic rewrite of what those new
parameters do.
**Warning signs:** a diff that touches `generate.ts`'s slot loop and `slot-fill.ts`'s scoring
function in the same commit as fixing five different test files' call sites — hard to review, easy
to introduce an unrelated regression.

### Pitfall 3: The shared parity fixture hardcodes RIR values that D-09 invalidates

**What goes wrong:** `__fixtures__/parity.ts`'s `generationInput` (`parity.ts:93-112`) pins
`daysPerWeek: 3` for every case. Under today's uniform `RIR_PROGRESSION = [3, 2, 1, 1]`, cycle 0's
RIR is 3, which is why `handBuilt(8, 12, 3)` (`parity.ts:171`), `handBuilt(4, 6, 3)`
(`parity.ts:182`), `handBuilt(15, 20, 3)` (`parity.ts:193`), and the deload case's `handBuilt(8, 12,
5)` (`parity.ts:204`, `= 3 + DELOAD_RIR_INCREMENT(2)`) are all correct today. Under D-09's 3-day
ladder `[2, 1, 1, 0]`, cycle 0's RIR becomes **2**, not 3 — every one of those four `handBuilt(...)`
calls is now wrong and must be updated to `2` (and the deload case to `2 + 2 = 4`), or the parity
suite will fail for the right reason (a real RIR mismatch) while looking like a regression.
**Why it happens:** `parity.ts` is explicitly a hand-typed "what a user would type into the
builder" table (`parity.ts:154-160`, "Written out, never derived from the generator") — by design
it does NOT recompute from `rirForCycle`, so it does not auto-update when the ladder changes.
**How to avoid:** treat updating `parity.ts`'s hardcoded RIR values as a required, explicit task in
this phase's plan, not an incidental side effect discovered by a failing test. This file is also
imported unchanged by `apps/api/src/generation/__tests__/parity.spec.ts` and
`apps/mobile/lib/db/__tests__/generation-parity.test.ts` (per `parity.test.ts:5-8`'s own comment)
— a wrong value here fails in **three** jest processes, not one.
**Warning signs:** `parity.test.ts`'s `'never passes on two prescriptions the engine could not
read'` test or the base equality assertions failing after the RIR ladder change, with a diff that
touches only `volume-landmarks.ts`.

### Pitfall 4: `trimToSessionLength`'s entire test file targets behavior D-03/D-04 deletes

**What goes wrong:** every one of `session-length.test.ts`'s four `describe('trimToSessionLength',
...)` tests (`session-length.test.ts:20-60`) asserts the OLD behavior by name: "removes whole slots
from the end" (line 30), "never lowering a surviving slot's targetSets" (line 30-40, i.e. sets are
never reduced — exactly what D-04's step 1 now does on purpose). These tests will fail loudly
under the new fit, which is correct — they test behavior the phase explicitly replaces.
**Why it happens:** this file predates D-03/D-04.
**How to avoid:** the plan must replace this describe block with tests asserting D-04's actual
order of concessions (reduce sets uniformly first, down to `MIN_SETS_PER_EXERCISE`; then remove by
priority tier), not attempt to keep it green. The `describe('estimateSlotMinutes', ...)` block
(`session-length.test.ts:14-18`) is unaffected — D-03 keeps that function and its constants
unchanged.
**Warning signs:** a plan task phrased as "keep session-length.test.ts green" without qualification
— it cannot be, by design, for the `trimToSessionLength` describe block specifically.

### Pitfall 5: Determinism discipline extends automatically to new files — verify, don't assume

**What goes wrong:** `determinism.test.ts:91-122` recursively scans every `.ts` file under `src`
(excluding `__tests__`) for `Date.now()`, `new Date(`, `Math.random()`, `crypto.randomUUID()`. Any
new module (`volume-split.ts`, `session-fit.ts`) is automatically covered by this scan — no test
change needed — but a `Math.max`/`Math.round`/`Math.ceil` call that a reviewer skims past as
"looks like Math.random" is a false-positive risk worth flagging, not a real one (the regex-free
substring check only matches the literal token `Math.random(`).
**How to avoid:** nothing to change here; this is confirmation the existing gate already covers new
files, called out so the plan doesn't waste a task re-adding coverage that already exists.

### Pitfall 6: `Object.freeze` on split-templates does not extend to generator-built slot arrays

**What goes wrong:** `split-templates.ts:244-263`'s `deepFreezeTemplate` deep-freezes every
`SplitTemplate`, including `pattern.slots` (the static `SplitSlot[]` describing which muscle groups
a day trains) — **this is frozen and must stay read-only** (13-CONTEXT.md explicitly marks
`split-templates.ts` read-only this phase). The `GeneratedSlot[]` arrays generator code builds at
runtime (`builtSlots`, `finalSlots` in `generate.ts`) are separate, never-frozen objects — D-02's
"real second slot in `GeneratedDay.slots`" is a new entry pushed into `builtSlots`, not a mutation
of any frozen `SplitTemplate.dayPatterns[n].slots` array. Conflating the two — e.g. trying to push
a second `SplitSlot` into a day pattern's frozen `slots` array to represent the split — will throw
`TypeError: Cannot add property N, object is not extensible` in strict mode at runtime.
**How to avoid:** the split (D-01/D-02) must expand a `SplitSlot` into 1-2 `GeneratedSlot`s *after*
reading the (frozen, unmodified) template, inside the generator's own loop — never write back into
`SplitTemplate`.

## Code Examples

### `describeDegradation`'s `day_trimmed` case — the exact sentence D-05 must reword

```typescript
// Source: apps/mobile/lib/programs/generation-wizard.ts:292-293, read this session
case 'day_trimmed':
  return `The session length you chose left room for fewer exercises, so some were dropped from ${whereOf(entry.dayKey)}.`;
```

D-05 requires this sentence become true for BOTH outcomes (sets reduced, and/or exercises removed).
The mobile unit test covering this function (`apps/mobile/lib/programs/__tests__/generation-wizard.test.ts:193-215`,
read this session) only asserts: non-empty, distinct-per-kind, contains the muscle group name when
present, and never phrases a reduction as a user shortcoming (regex check against "you don't/can't"
etc., line 212) — **it does not pin the exact wording**, so the reword has editorial freedom as long
as it stays truthful, non-blaming, and distinct from the other three kinds' sentences. A second
consumer, `apps/mobile/app/programs/__tests__/generate-screen.test.ts:188`, constructs a
`day_trimmed` entry with `detail: 'raw'` (a placeholder, not real generator output) and only checks
sentence uniqueness — also unaffected by the reword's exact text.

### `deloadOverrideFor` — the exact override-object contract (relevant to D-04's "recompute after fit")

```typescript
// Source: deload.ts:73-84, read this session
export function deloadOverrideFor(base: ResolvedTarget): TargetOverride {
  const override: TargetOverride = {};
  if (base.targetSets !== null) {
    override.targetSets = Math.max(1, Math.ceil(base.targetSets * DELOAD_SET_MULTIPLIER));
  }
  if (base.targetRir !== null) {
    override.targetRir = base.targetRir + DELOAD_RIR_INCREMENT;
  }
  return override;
}
```

This reads `slot.base.targetSets`/`targetRir` (the cycle-0 numbers, `generate.ts:143-149`) — since
D-04 does not change what `base` means (only the exercise-count decision and the fit), a deload
cycle's override still derives from `base`, unchanged by this phase, and `deload.test.ts` (4 tests,
`deload.test.ts:54-73`) is unaffected by D-01..D-09.

### Real catalog structure — field names, exactly as `catalog-normalized.json` stores them

```json
// Source: apps/api/src/seed/data/catalog-normalized.json, read this session (head + node -e query)
{
  "catalog_version": "fb701c18b7999d47",
  "exercises": [
    { "id": "seed_3_4_Sit-Up", "equipment_required": "bodyweight", "movement_pattern": "isolation", "name": "3/4 Sit-Up", ... }
  ],
  "mappings": [
    { "exercise_id": "seed_3_4_Sit-Up", "muscle_group_id": "abs", "role": "primary", "weight_factor": "1.00" }
  ]
}
```

This is `CatalogSnapshot` shape (`packages/api-contracts/src/catalog.ts:111-139`, read this
session, snake_case field names: `exercise_id`, `muscle_group_id`, `weight_factor`,
`equipment_required`, `movement_pattern`) — **not** `GenerationCatalog` shape (camelCase
`exerciseId`, `muscleGroupId`, `weightFactor`, `equipmentRequired`, `movementPattern`,
`result.ts:23-42`). The seed pipeline (`apps/api/src/seed/seed-catalog.ts:1-13`, read this session)
upserts this snapshot into Postgres via Drizzle, whose column properties are already camelCase
(`equipmentRequired`, `movementPattern`) mapped to snake_case DB columns by Drizzle's own
`getTableColumns` machinery (`seed-catalog.ts:24-34`) — confirming the camelCase↔snake_case
transform boundary is the seed/ORM layer, not something the client or this package re-derives.
`apps/mobile/lib/db/test-support.ts:116-157`'s `loadGenerationCatalog` (read this session, grep
confirmed) reads already-camelCase local SQLite rows straight into `GenerationCatalog` — no
transform happens client-side either.

### D-11 fixture strategy — concrete, given the actual tooling gap found this session

`tsconfig.json` (`packages/program-generator/tsconfig.json`, read this session) has **no**
`resolveJsonModule: true`, and `jest.config.js` uses `ts-jest` with no override — so `import data
from './foo.json'` inside this package will fail to compile under both `tsc` and `ts-jest` as
currently configured. Two options, in order of preference:

1. **(Recommended) A `.ts` fixture, not `.json`.** Matches the existing precedent exactly —
   `__fixtures__/parity.ts` (already re-exported through `index.ts:17`, read this session, with an
   explicit comment explaining why a `.ts` fixture is re-exported through the public barrel rather
   than deep-imported) is itself a hand-written `.ts` module, not JSON. Write a one-off Node script
   (documented at the top of the fixture file itself, not committed as a build-pipeline step) that
   reads `apps/api/src/seed/data/catalog-normalized.json`, filters to the muscle groups the
   `full_body_2` template needs (`chest`, `lats`, `quads`, `front_delts`, `biceps`, `abs`,
   `hamstrings`, `glutes`, `side_delts`, `triceps` — the union of `SPLIT_TEMPLATES.full_body[2]`'s
   two day patterns, `split-templates.ts:74-101`, read this session), keeps **at least 2-3
   exercises per group** (so D-02's second-exercise-absorption path is actually exercised, not
   starved per Pitfall 1 above), remaps `equipment_required`→`equipmentRequired`,
   `movement_pattern`→`movementPattern`, `exercise_id`→`exerciseId`, `muscle_group_id`→
   `muscleGroupId`, `weight_factor`→`weightFactor`, and writes the result as a literal exported
   `GenerationCatalog` constant to `src/__fixtures__/catalog-2day-regression.ts`. This keeps the
   fixture deterministic (it's a checked-in file, not generated at test time) and reproducible (the
   script is a documented, re-runnable comment or a small `scripts/` file, per 13-CONTEXT.md's
   "provided the fixture is deterministic" discretion clause).
2. Add `"resolveJsonModule": true` to `tsconfig.json` and rely on Jest/ts-jest's native JSON
   support — viable, but touches shared package config for a test-only need and diverges from the
   `.ts`-fixture precedent already established by `parity.ts`. Not recommended unless option 1
   proves awkward.

## State of the Art

| Old Approach (this codebase, pre-Phase-13) | New Approach (D-01..D-09) | When Changed | Impact |
|--------------------------------------------|----------------------------|---------------|--------|
| One exercise absorbs a muscle group's whole weekly target, no cap | `MAX_SETS_PER_EXERCISE = 5`, second exercise absorbs remainder, split fixed against hardest cycle | This phase (D-01/D-02) | Fixes "two exercises per workout" / "10 sets on one movement" |
| `trimToSessionLength` removes whole slots from the end, cycle-1 estimate only | Fit evaluated against hardest cycle; reduce sets uniformly first, then remove by priority tier | This phase (D-03/D-04) | Fixes last-cycle budget overrun |
| `alreadyPicked` rebuilt per day (day-scoped only) | `pickedByMuscleGroup` threaded week-wide (D-06), ranks reused exercises below unused ones | This phase (D-06) | Fixes "Full Body A and Full Body B are the same" |
| Single weighted-sum score; ties broken by seeded hash only | Six-tier sort key: primary score → compoundness → loadability → movement-pattern coverage → week-unused → seeded hash | This phase (D-07/D-08) | Fixes coin-flip selection among 82 tied chest-primary candidates |
| `RIR_PROGRESSION = [3, 2, 1, 1]` fixed for every `daysPerWeek` | `rirForCycle(cycleIndex, daysPerWeek)` — four distinct ladders keyed by day count | This phase (D-09) | Fixes "less days means more intensity" |

**Deprecated/outdated:** `trimToSessionLength`'s exact name/shape may be retired in favor of a
`session-fit.ts` module (Claude's Discretion); no external consumer imports it directly (verified —
grep found no import outside this package), so this is a safe internal rename.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | The cleanest module split is two new files, `volume-split.ts` and `session-fit.ts`, rather than extending `session-length.ts` in place | Architecture Patterns | Low — 13-CONTEXT.md explicitly leaves this to Claude's Discretion; either shape satisfies the phase's actual requirements. |
| A2 | At least 2-3 exercises per muscle group is "enough" to exercise D-02's second-slot path in the D-11 regression fixture | Code Examples (D-11 fixture strategy) | Low-Medium — if the planner picks fewer, the fixture may not actually reach the second-exercise code path for every group at cycle 4's hardest-cycle sets; verify against the actual `MAX_SETS_PER_EXERCISE=5` cap math before finalizing fixture size. |

No claim about package legitimacy, external library choice, or third-party API behavior appears in
this document — every substantive claim traces to a file read or a command run this session (see
Sources). This is the expected shape for a phase with zero new dependencies.

## Open Questions

1. **What happens when D-02's second exercise cannot be found (candidate pool exhausted for that
   muscle group)?**
   - What we know: `pickSlotExercise` already returns `null` when no eligible candidate exists,
     and `generate.ts:121-129` already handles a `null` first pick by emitting a `slot_unfillable`
     degradation and `continue`-ing past that slot entirely.
   - What's unclear: 13-CONTEXT.md's D-01/D-02 don't say what happens when the FIRST exercise for a
     group is picked successfully but the SECOND (required by the split) cannot be. Falling back to
     one exercise carrying all the hardest-cycle sets (violating `MAX_SETS_PER_EXERCISE`) contradicts
     D-01's "at most 5 sets" wording taken literally; emitting a new degradation kind is barred by
     D-10 ("no new `DegradationEntry.kind`"); reusing `slot_unfillable` for a second-slot failure
     while the first slot did fill is defensible but not spelled out.
   - Recommendation: the plan should treat "second exercise unfillable" as a `slot_unfillable`
     degradation with the same `muscleGroupId`, and cap the first exercise at
     `MAX_SETS_PER_EXERCISE` anyway (accepting under-delivered weekly volume for that muscle group
     in that specific gym/exclusion scenario) rather than silently exceeding the cap — consistent
     with D-09/D-21's existing "never silently thin, always report" philosophy from Phase 11.
2. **Exact within-tier ordering when D-07's tiers all produce ties (as they do for the real
   catalog's chest-primary set, where compoundness/loadability/movement-pattern may also tie across
   several candidates)?**
   - What we know: 13-CONTEXT.md line 148 explicitly leaves "exact tie-break weights inside D-07
     tiers" to Claude's Discretion.
   - What's unclear: nothing blocking — this is confirmed-in-scope discretion, not a gap.
   - Recommendation: no action needed; note only that `seededRank` (`slot-fill.ts:33-40`) remains
     the final tie-break exactly as today, so D-07 is additive tiers in front of an unchanged
     bottom rung.

## Environment Availability

Skipped in the sense that no *new* external dependency is introduced — all tooling this phase needs
is already an installed workspace devDependency, confirmed via `package.json`
(`packages/program-generator/package.json`, read this session): `jest ^30.0.0`, `ts-jest ^29.2.5`,
`typescript ^5.9.2`, `@types/jest ^30.0.0`. No environment probe is required.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30 via `ts-jest` (`packages/program-generator/jest.config.js`, read this session: `preset: 'ts-jest', testEnvironment: 'node'`) |
| Config file | `packages/program-generator/jest.config.js` |
| Quick run command | `pnpm --filter @fitness/program-generator test` |
| Full suite command | `pnpm -w test` (the project's own configured `test_command` in `.planning/config.json`, read this session) |

The package's own reporter setup includes `scripts/jest-suite-integrity.cjs` (relative
`<rootDir>/../../scripts/jest-suite-integrity.cjs`, confirmed in `jest.config.js`) — the same
zero-test/skipped-test-fails-the-run guard already documented in `STATE.md`'s accumulated context,
so an accidentally-empty or accidentally-skipped test in this phase's rewrite fails the run, not
just goes quiet.

### Build-before-typecheck requirement (the dist-vs-source gap)

`package.json` (`packages/program-generator/package.json:6-7`, read this session) declares `"main":
"./dist/index.js", "types": "./dist/index.d.ts"` — apps consume the **compiled output**, not
source. Both `apps/mobile/package.json` and `apps/api/package.json` depend on
`"@fitness/program-generator": "workspace:*"` (grep-confirmed this session), resolved through pnpm
workspace symlinks into `node_modules/@fitness/program-generator`, which point at the package root
— so mobile's Jest (`jest-expo` preset, no `moduleNameMapper` override for this package, confirmed
via `apps/mobile/jest.config.js` read this session) and mobile's `tsc` both read `dist/index.js`
and `dist/index.d.ts`, **not** `src/`. `turbo.json` (read this session) declares `test` and
`typecheck` tasks with `"dependsOn": ["^build"]` — meaning `turbo run test`/`turbo run typecheck`
from the repo root correctly rebuilds `@fitness/program-generator` first. **The pitfall is running
`pnpm --filter mobile test` or `pnpm --filter mobile typecheck` directly** (bypassing turbo) after
editing `packages/program-generator/src/*` without an explicit
`pnpm --filter @fitness/program-generator build` first — the mobile process will silently exercise
the stale pre-rewrite `dist/` output. The executor should either always invoke workspace commands
through `turbo run <task>` (which resolves `^build` automatically) or explicitly run `pnpm --filter
@fitness/program-generator build` before any mobile-side verification step in this phase's plan.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|--------------|
| GEN-VOL-01 | Per-exercise cap + second-exercise absorption | unit | `pnpm --filter @fitness/program-generator test -- generate.test.ts` (plus new split-focused tests) | ❌ Wave 0 — needs new assertions; `generate.test.ts`'s existing mav-clamp test needs review per Pitfall 1 |
| GEN-VOL-02 | Session-budget fit against hardest cycle | unit | `pnpm --filter @fitness/program-generator test -- session-length.test.ts` | ⚠️ Exists but tests the OLD behavior (Pitfall 4) — must be rewritten, not merely extended |
| GEN-SEL-01 | Week-level exercise variety | unit | `pnpm --filter @fitness/program-generator test -- generate.test.ts` (new day-vs-day assertions) | ❌ Wave 0 — no existing test asserts cross-day variety |
| GEN-SEL-02 | Tiered selection scoring | unit | `pnpm --filter @fitness/program-generator test -- slot-fill.test.ts` | ⚠️ Exists but tests only the OLD single-score model; signature change (D-06) breaks all 5 existing calls (Pitfall 2) |
| GEN-RIR-01 | daysPerWeek-keyed RIR ladder | unit | `pnpm --filter @fitness/program-generator test -- volume-landmarks.test.ts` | ⚠️ Exists but tests the OLD single-ladder `rirForCycle(cycleIndex)` signature (Pitfall 2) |
| D-11 regression | Reported 2-day scenario, real-catalog-derived fixture | integration (unit-speed, in-package) | `pnpm --filter @fitness/program-generator test -- generate.test.ts` (new describe block) | ❌ Wave 0 — fixture file (`__fixtures__/catalog-2day-regression.ts`) does not exist yet |
| D-05 degradation copy | Reworded `day_trimmed` sentence stays truthful/non-blaming | unit | `pnpm --filter mobile test -- generation-wizard.test.ts` | ✅ Exists (`apps/mobile/lib/programs/__tests__/generation-wizard.test.ts`), loosely-coupled to exact wording (Code Examples section) |
| GEN-07 parity (regression guard, not this phase's own requirement but touched by D-09) | RIR ladder change doesn't break hand-built-vs-generated parity | unit | `pnpm --filter @fitness/program-generator test -- parity.test.ts` | ⚠️ Exists; hardcoded values need updating (Pitfall 3) — same fixture also runs under `apps/api/src/generation/__tests__/parity.spec.ts` and `apps/mobile/lib/db/__tests__/generation-parity.test.ts` |

### Sampling Rate

- **Per task commit:** `pnpm --filter @fitness/program-generator build && pnpm --filter @fitness/program-generator test`
- **Per wave merge:** `pnpm -w typecheck && pnpm -w test` (the project's configured `build_command`/`test_command`, `.planning/config.json`, read this session)
- **Phase gate:** Full suite green (including `apps/mobile` and `apps/api` parity specs, which import this package's fixture table) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/program-generator/src/__fixtures__/catalog-2day-regression.ts` — D-11's fixture, does not exist yet
- [ ] `packages/program-generator/src/volume-split.ts` and/or `session-fit.ts` (or equivalent, per Claude's Discretion) — new modules, do not exist yet
- [ ] `session-length.test.ts`'s `trimToSessionLength` describe block needs a full rewrite (Pitfall 4), not an extension
- [ ] `slot-fill.test.ts`'s 5 direct `pickSlotExercise(...)` calls need the new `pickedByMuscleGroup` argument added (Pitfall 2)
- [ ] `volume-landmarks.test.ts`'s 3 direct `rirForCycle(...)` calls need the new `daysPerWeek` argument added (Pitfall 2)
- [ ] `__fixtures__/parity.ts`'s 4 hardcoded `handBuilt(...)` RIR values need recomputation under the new 3-day ladder (Pitfall 3)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No | This package has no auth surface; it is a pure function over caller-supplied data. |
| V3 Session Management | No | Same. |
| V4 Access Control | No | Same — access control (who may call `generateProgram` for which user) is enforced by the caller (the wizard screen / API controller), unchanged by this phase. |
| V5 Input Validation | Yes — already satisfied, unchanged this phase | `isGenerationInput` (`result.ts:90-141`, read this session) already rejects a malformed `GenerationInput` before any candidate-pool or slot-filling work runs (T-11-05 guarantee, explicitly preserved by D-10's "no changes to `GenerationInput`" clause). New fields this phase might introduce internally (none are added to the public `GenerationInput` shape per D-10) do not need new validation. |
| V6 Cryptography | No | No cryptographic operation anywhere in this package. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Malformed/adversarial `GenerationInput` (e.g. a hand-crafted `emphasis` map with an unknown muscle group id, or a non-integer `daysPerWeek`) reaching deep generator logic | Tampering | Already mitigated by `isGenerationInput`'s exhaustive gate (`result.ts:90-141`) — unchanged by this phase; D-09's new `daysPerWeek`-keyed RIR table must floor/clamp gracefully for any `daysPerWeek` value that passes `isGenerationInput`'s existing `2..6` range check (`GENERATION_INPUT_LIMITS`, `result.ts:66-73`), never throw or index out of bounds for an unexpected key. |
| Denial-of-service via a pathological catalog (e.g. thousands of tied candidates) making selection scoring expensive | Denial of Service | Out of scope for this phase — the generator already runs entirely in-memory, client-side, on a bounded local catalog snapshot (Phase 11 D-02); no new unbounded loop is introduced by D-01..D-09 (the split adds at most one extra `pickSlotExercise` call per slot, a constant-factor increase, not an unbounded one). |

No new attack surface is introduced by this phase: the function remains pure, offline, and
side-effect-free (D-10, unchanged), with no new I/O, no new network call, and no new persisted
field.

## Sources

### Primary (HIGH confidence — read this session)

- `packages/program-generator/src/generate.ts` (full file, 203 lines)
- `packages/program-generator/src/session-length.ts` (full file, 47 lines)
- `packages/program-generator/src/slot-fill.ts` (full file, 68 lines)
- `packages/program-generator/src/volume-landmarks.ts` (full file, 91 lines)
- `packages/program-generator/src/split-templates.ts` (full file, 282 lines)
- `packages/program-generator/src/result.ts` (full file, 188 lines)
- `packages/program-generator/src/candidate-pool.ts` (full file, 63 lines)
- `packages/program-generator/src/degradation.ts` (full file, 41 lines)
- `packages/program-generator/src/emphasis.ts` (full file, 21 lines)
- `packages/program-generator/src/deload.ts` (full file, 85 lines)
- `packages/program-generator/src/index.ts` (full file, 17 lines)
- `packages/program-generator/src/__tests__/generate.test.ts`, `session-length.test.ts`,
  `slot-fill.test.ts`, `volume-landmarks.test.ts`, `determinism.test.ts`, `parity.test.ts`,
  `candidate-pool.test.ts`, `split-contract.test.ts`, `emphasis.test.ts`, `deload.test.ts` (all
  read in full)
- `packages/program-generator/src/__fixtures__/parity.ts` (full file, 229 lines)
- `packages/program-generator/package.json`, `jest.config.js`, `tsconfig.json`
- `packages/plate-math/src/equippable.ts` (full file — `MODEL_EQUIPMENT_TYPES` source)
- `packages/api-contracts/src/catalog.ts` (lines 1-140 — `MUSCLE_GROUPS`, `MOVEMENT_PATTERNS`,
  `EQUIPMENT_TYPES`, `MUSCLE_ROLES`, `CatalogSnapshot*` interfaces)
- `packages/api-contracts/src/program.ts` (lines 1-65 — `ResolvedTarget`, `TargetOverride`,
  `resolveTarget`, `isEmptyOverride`)
- `apps/mobile/lib/programs/generation-wizard.ts` (full file, 300 lines)
- `apps/mobile/lib/programs/__tests__/generation-wizard.test.ts` (lines 185-215)
- `apps/mobile/app/programs/__tests__/generate-screen.test.ts` (grep + targeted read)
- `apps/mobile/lib/db/test-support.ts` (grep for `GenerationCatalog` field usage)
- `apps/mobile/jest.config.js` (full file)
- `apps/api/src/seed/data/catalog-normalized.json` — read head, and queried in full via `node -e`
  this session for exercise count (870), mapping count (3177), `equipment_required` distribution,
  `movement_pattern` distribution, mapping `role` counts, `weight_factor` distinct values, and
  chest-primary-mapping weight-factor uniformity (82 mappings, all `1.00`)
- `apps/api/src/seed/seed-catalog.ts` (lines 1-80 — snake_case↔camelCase transform boundary)
- `docs/volume-rir-landmarks.md` (full file, 164 lines)
- `turbo.json` (full file)
- `.planning/config.json` (lines 1-60 — `nyquist_validation: true`, `security_enforcement: true`,
  `build_command`, `test_command`)
- `.planning/phases/13-program-generator-volume-selection-rework/13-CONTEXT.md` (full file)
- `.planning/phases/11-program-generation/11-CONTEXT.md` (full file)
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md` (full files)

No web search, Context7 lookup, or other external documentation provider was used — every claim in
this document is grounded in code, tests, or config read directly this session. This phase
introduces zero new external dependencies, so no provider-backed research question applied.

## Metadata

**Confidence breakdown:**
- Standard stack: N/A (no new dependencies) — treated as HIGH by default since nothing to verify
- Architecture: HIGH — exact call graph read line-by-line this session, exact function signatures
  and their downstream call sites (test files) enumerated and read
- Pitfalls: HIGH — every pitfall traces to an existing test assertion or hardcoded fixture value
  read this session, not inferred

**Research date:** 2026-09-02
**Valid until:** No expiry driven by external library drift (none used); revalidate only if
`packages/program-generator/src/*` or `apps/api/src/seed/data/catalog-normalized.json` changes
before this phase is planned/executed.
