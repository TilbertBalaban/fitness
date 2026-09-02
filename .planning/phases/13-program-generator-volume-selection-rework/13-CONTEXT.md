# Phase 13: Program Generator Volume & Selection Rework - Context

**Gathered:** 2026-09-02
**Status:** Ready for planning

<domain>
## Phase Boundary

The generator built in Phase 11 produces unusable programs at low training frequencies. With
the seeded catalog, 2 days / 60 min / intermediate / auto split yields two identical days of two
exercises each, at 5 sets per exercise in cycle 1 rising to 9 in cycle 4, and the last cycle
already breaks the 60-minute budget the first cycle was trimmed to. The user's own report:
"two exercise per workout is not enough", "Full Body A and Full Body B are the same", and
"less days means more intensity — smaller RIR (even 0)".

Five verified root causes, all in `packages/program-generator/src`:

1. `weeklySetTarget / frequency` lands a muscle group's whole weekly target on ONE exercise.
   Quads appear once in the 2-day template, so quads gets 10 sets on one movement (18 for an
   intermediate by the last cycle). No per-exercise cap exists and no second exercise absorbs
   the remainder.
2. `trimToSessionLength` removes whole slots from the END of the day, on cycle-1 numbers only.
   A single 10-set quads slot (27.5 min) blows the budget and takes every later slot with it.
   Later cycles are never checked, so the final cycle overruns anyway.
3. Duplicate avoidance is per day (`alreadyPicked` is rebuilt for every day). Both full-body
   days start with chest then lats, the picker is deterministic, so both days pick the same two
   exercises.
4. Every primary mapping in the catalog carries `weight_factor = 1.00`, so `scoreCandidateForSlot`
   ties across all 82 chest-primary exercises and the seeded hash decides. Isometric Wipers or a
   Guillotine press beat a bench press by coin flip. Nothing prefers compound, loadable, or
   movement-pattern-covering exercises.
5. `RIR_PROGRESSION = [3, 2, 1, 1]` is fixed across cycles regardless of `daysPerWeek`.

**In scope:** the volume distribution, the session-budget fit, week-level exercise variety,
selection scoring, the frequency-aware RIR ladder, their unit tests, one regression test for
the reported scenario, the `docs/volume-rir-landmarks.md` provenance note, and the wizard's
degradation copy where the new trim semantics make the old sentence false.

**Out of scope:** new wizard inputs or `GenerationInput` fields, split-template day shapes
(which muscle groups a day carries), the deload logic, the write path, catalog data changes,
the progression engine, and anything in the builder UI. The public `generateProgram` signature
and `GeneratedProgramTree` shape do not change.

</domain>

<decisions>
## Implementation Decisions

### Volume distribution (GEN-VOL-01)

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

### Session budget (GEN-VOL-02)

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

### Week-level variety (GEN-SEL-01)

- **D-06:** `generateProgram` threads a week-level `pickedByMuscleGroup: Map<MuscleGroupId,
  Set<exerciseId>>` across days. For a slot, a candidate already used for THIS muscle group on
  an earlier day of the week is ranked below every unused candidate of equal quality, and is
  chosen only when no unused candidate scores above zero. The same exercise may still appear
  twice in a week when the pool is genuinely exhausted (e.g. a bodyweight-only gym), and the
  existing per-day `alreadyPicked` rule still forbids the same exercise twice in one day.
  Determinism (Phase 11 D-03) is preserved: the ordering is a pure function of the inputs and
  `variantSeed`.

### Selection quality (GEN-SEL-02)

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

### Frequency-aware RIR (GEN-RIR-01)

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

### Guarantees carried forward

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

</decisions>

<deferred>
## Deferred Ideas

- Per-muscle-group set caps that differ by volume class (e.g. 6 for large groups).
- User-facing controls for RIR aggressiveness or sets-per-exercise.
- Catalog quality work: distinguishing weight factors per primary mapping, or a curated
  "staple" flag on bench/squat/row/press movements. D-07 makes selection defensible without it.
- Rest-time scaling with session length.

</deferred>

<canonical_refs>
## Canonical References

- `packages/program-generator/src/generate.ts` — composition entry point; slot loop and trim call
- `packages/program-generator/src/session-length.ts` — time model and current trim
- `packages/program-generator/src/slot-fill.ts` — scoring and tie-break
- `packages/program-generator/src/volume-landmarks.ts` — bands, rep ranges, rest, RIR ladder
- `packages/program-generator/src/split-templates.ts` — day patterns (read-only in this phase)
- `packages/program-generator/src/__tests__/` — existing unit tests to keep green
- `apps/mobile/lib/programs/generation-wizard.ts` — degradation copy
- `docs/volume-rir-landmarks.md` — provenance note for the landmark math
- `.planning/phases/11-program-generation/11-CONTEXT.md` — Phase 11 decisions D-01..D-21 that
  still bind (pure, deterministic, offline, plain data tree, sparse overrides)

</canonical_refs>
