# Phase 8: Progression Engine - Research

**Researched:** 2026-08-28
**Domain:** Rule-based strength-training progression logic (double progression, RIR autoregulation), implemented as a pure cross-runtime TypeScript package
**Confidence:** MEDIUM — the mechanical rules (double progression, expected-performance formula, e1RM validity, plate snapping) are well-grounded, either in this codebase's own already-shipped precedent or in published training literature. The two numeric thresholds this phase must pick (shortfall count, RIR band width) are **explicitly undocumented anywhere** — this is not a gap in this research pass, it is a fact about the domain, stated plainly below rather than papered over.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The rules live in `packages/progression-engine`, which already exists as a reserved slot. `packages/progression-engine/src/index.ts` currently exports only `PROGRESSION_ENGINE_PLACEHOLDER`. This phase fills that slot. Success criterion 6 is satisfied by construction, not by a second implementation kept in sync. Reversibility: one-way in practice.
- **D-02:** The package is pure: no I/O, no database handle, no clock, no network. Every input arrives as an argument and every output is a value. Follows the precedent of `@fitness/plate-math` and `@fitness/pr-rules`.
- **D-03:** Recommendations are derived on read, never persisted as a denormalized column. Reversibility: reversible; caching later is additive.
- **D-04:** Snapping goes through `@fitness/plate-math` against the active gym profile. PRGR-05 is satisfied by calling it, not re-deriving increments.
- **D-05 [CLAUDE'S CALL]:** A shortfall holds the prescription, and a reduction is offered only after **three** consecutive shortfalls — never applied automatically. Named constant, one-line change to 2 if overturned. Reversibility: reversible.
- **D-06 [CLAUDE'S CALL]:** RIR is matched with a tolerance band of **±1**, not exactly. Named constant. Reversibility: reversible.
- **D-07 [CLAUDE'S CALL]:** The PRGR-04 preference is a per-user setting, defaulting to **widening the rep range first** (textbook double progression). Belongs on the existing `user_preference` row, not per-exercise. Reversibility: reversible; per-exercise override is additive.
- **D-08 [CLAUDE'S CALL]:** Client/server parity is proven by a **shared fixture table** exercised by both suites, not asserted. Reversibility: reversible.
- **D-09 [CLAUDE'S CALL]:** "No valid recommendation" is a **distinct typed result** (discriminated union), never null or a sentinel number. Reversibility: one-way once call sites depend on the shape, but cheap while the package is new.
- **D-10 [CLAUDE'S CALL]:** Recency is measured in **sessions logged, never elapsed wall-clock time**. This is the mechanism that makes PRGR-08 true. Reversibility: one-way in spirit — reintroducing a time-decay term later reintroduces the exact behavior PRGR-08 prohibits.
- **D-11 [CLAUDE'S CALL]:** A failure set progresses on beating the prior rep count at the same load (PRGR-03); per-side and grouped Phase 7 sets are reduced to a single comparable performance **before** the rules see them, at one normalization boundary, not a branch per set type.

### Claude's Discretion

CONTEXT.md does not carry a separate "Claude's Discretion" section for this phase — every grey area was resolved as one of the `[CLAUDE'S CALL]` decisions above (D-05 through D-11), each explicitly marked reversible and isolated to a named constant so a later reader can overturn it cheaply. This research evaluates each `[CLAUDE'S CALL]` against the literature below rather than treating it as pre-settled.

### Deferred Ideas (OUT OF SCOPE)

- Per-exercise overrides of the D-07 preference — the global dial ships first.
- Any automatic acceptance of a reduction. D-05 offers; it never applies.
- Progression analytics and visualisation — Phase 9.
- Server-side recomputation or reconciliation of recommendations — Phase 10.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRGR-01 | Weight and reps recommendation computed from logged history | §Recommended Rule Formulation, entry point signature |
| PRGR-02 | Progression triggers when performance exceeds rep-range midpoint + RIR target | §Expected Performance Formula — confirmed as MacroFactor's own public description (CITED), with the exact midpoint tie-break this project must pin explicitly (determinism hazard) |
| PRGR-03 | Failure sets progress on beating prior rep count at the same load | §Failure-Set Rule; the "same load" comparison hazard is called out in §Common Pitfalls |
| PRGR-04 | User can choose expand-rep-range vs. weight-match preference | §D-07 evaluation — matches MacroFactor's two documented adjustment modes (CITED) |
| PRGR-05 | Recommendations snap to gym's real increments | §Snapping via plate-math — reuses D-04, package boundary already shipped and read this session |
| PRGR-06 | Explicit "unavailable" state, never an invented number | §Discriminated Union Result (D-09) |
| PRGR-07 | User picks own starting weight with no history; engine takes over after | §First-Session Handling |
| PRGR-08 | Never a reduced recommendation as a consequence of missing sessions | §Recency-by-Sessions (D-10), §Common Pitfalls — Ratchet/Layoff |
| PRGR-09 | Shortfall holds prescription; reduction offered after 2-3 sessions running | §The Honesty Problem — evaluates D-05's choice of 3 against the SBS/RP literature, which does not directly speak to this exact axis |
| PRGR-10 | Tolerance bands, not exact RIR matching | §RIR Tolerance Band — evaluates D-06's ±1 |
| PRGR-11 | Zero-connectivity recommendation at exercise start | Satisfied by construction via D-02/D-03 (pure, derived-on-read); no network dependency anywhere in the recommended design |
</phase_requirements>

## Summary

This phase is rule design, not library selection — there is no package that decides how much weight to add next. The published, checkable parts of the domain are: double progression itself (add reps within a fixed rep range, then add weight and reset to the bottom of the range — a mechanic dating to 1911, standard across the strength-training coaching literature); MacroFactor's own publicly documented positive-case rule (`expected performance = rep-range midpoint + RIR target`, progression triggers on beating it, failure sets progress on beating the prior rep count); and the two documented adjustment modes (expand-rep-range vs. weight-match) that map directly onto PRGR-04/D-07. All three of these are grounded in this project's own already-fetched research (`.planning/research/PITFALLS.md` Pitfall 8, itself sourced from MacroFactor's help center) and are treated here as `[CITED]`, not re-derived from scratch.

The unpublished part — and this is the deliverable this research exists to be honest about — is MacroFactor's exact negative-case logic: the numeric threshold for "hold" vs. "offer a reduction," and any deload trigger. **No public source states this.** `.planning/STATE.md`'s standing research flag is correct: this is invented, not sourced. D-05's choice of 3 consecutive shortfalls and D-06's ±1 RIR band are this project's own design, informed by two things that are themselves imperfect analogs: RP's set-count volume landmarks (a volume-prescription framework, not a per-set regression trigger) and Stronger By Science's autoregulation model (which, on inspection this session, operates on a **different axis** — SBS reduces a training max based on *how many reps you missed by within a single set*, not on *how many consecutive sessions* fell short — see §The Honesty Problem for why this matters for D-05 specifically).

The engine's real implementation risk is not the training-science formula — it's the software engineering seam: reducing Phase 7's five extra set-type shapes (drop, myorep, partial, per-side, superset-adjacent) to one comparable performance before the rules run (D-11), and proving client/server parity (D-08) in a codebase where, as of this research, **no shared pure package has ever actually been imported by `apps/api`** — `@fitness/pr-rules` and `@fitness/plate-math` are both mobile-only today despite the architecture doc's "both sides" framing. Phase 8 is the first phase that will make that framing literally true, and the setup work required to do so (new `apps/api` workspace dependency, a jest config the sibling packages already have but `progression-engine` currently lacks, and reconciling two different test-file-naming conventions between the two apps) is a concrete, citable gap, not a hypothetical one.

**Primary recommendation:** Implement the engine as a single pure entry point — `(history, prescription, inventory, preference) => Recommendation` — following `@fitness/pr-rules`'s exact package layout (multiple small modules, one `index.ts` barrel, `src/__tests__/*.test.ts`, `ts-jest` + `jest-suite-integrity.cjs`). Normalize Phase 7's set vocabulary at the boundary using the "top set" principle already stated in `ARCHITECTURE.md` §1 (drops/myoreps/partials read through their parent; supersets need no special handling at all because progression is per-exercise). Treat D-05/D-06 as our own numbers, state that plainly in the UI copy this phase's plan will need to write, and prove D-08's parity claim with an actual `apps/api` spec test — not just a mobile one — because today there is no evidence apps/api can import a `@fitness/*` pure package at all.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Compute the recommendation (rules) | Browser/Client (on-device, both native and web via the shared package) | API/Backend (same package, reconciliation only — Phase 10) | PRGR-11 requires zero-connectivity computation at exercise start; `ARCHITECTURE.md` §4 already settled this — client-side is not optional, it is the load-bearing requirement the whole phase exists to satisfy. |
| Read logged history for the exercise | Database/Storage (local SQLite via existing `apps/mobile/lib/db` query helpers) | — | The engine itself is pure and takes history as an argument (D-02); a thin query helper in `apps/mobile/lib/db` (following `summary-query.ts`'s existing pattern) is the actual DB-touching caller. |
| Snap to gym-achievable increments | Database/Storage-adjacent pure package (`@fitness/plate-math`) | — | D-04 — already shipped in Phase 6, consumed not re-derived. |
| Persist/display the user's D-07 preference | Database/Storage (`user_preference` row) | Browser/Client (settings UI) | Mirrors the existing pattern for `weightUnit`, `autoAdvanceEnabled`, `warmupSetsEnabled` on the same table (`apps/mobile/lib/db/schema.ts:267-276`) — this phase adds one more boolean/enum column there, not a new table. |
| Prove client/server rule parity | API/Backend (new: an `apps/api` spec test importing the package directly) | Browser/Client (existing: a mobile test importing the same package) | D-08 — the "proof," not just the mobile-side unit test that would otherwise be the path of least resistance. |
| Reconcile recommendations against fully-merged cross-device history | API/Backend | — | Explicitly out of scope for Phase 8 per the CONTEXT.md phase boundary ("Deferred... Server-side aggregate reconciliation (Phase 10)"). Phase 8 proves the package *can* run server-side; it does not wire it into a live NestJS reconciliation flow. |

## Standard Stack

### Core

No new external runtime dependency is needed. This phase is pure rule logic; the "stack" is this project's own established pure-package pattern.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | `^5.9.2` | The whole package | Matches `packages/pr-rules/package.json:23` and `packages/plate-math`'s existing devDependency exactly `[VERIFIED: packages/pr-rules/package.json:23]`. |
| Jest + ts-jest | `^30.0.0` / `^29.2.5` | Unit tests, including the D-08 shared fixture table | Matches `packages/pr-rules/package.json:17-22` and its `jest.config.js` (`preset: 'ts-jest'`, `testEnvironment: 'node'`, `reporters: ['default', '<rootDir>/../../scripts/jest-suite-integrity.cjs']`) `[VERIFIED: packages/pr-rules/jest.config.js:1-5]`. `packages/progression-engine/package.json` currently has **no** `test` script and **no** `jest.config.js` — this must be added by the plan, copying the sibling packages' exact config rather than inventing a new one. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@fitness/plate-math` | `workspace:*` | Increment snapping (D-04) | Every recommendation that needs a real, loadable weight — call `solvePlateBreakdown`/`achievableBarbellLoads`/`achievableDumbbellLoads`/`achievableMachineLoads`/`roundToAchievable` (all `[VERIFIED: packages/plate-math/src/*.ts, read in full this session]`) rather than re-deriving rounding. |
| `@fitness/api-contracts` | `workspace:*` | `SetType`, `SET_TYPES`, `countsTowardWorkingVolume`, `ResolvedTarget`, `WeightUnit`, `toCanonicalKg`/`fromCanonicalKg` | The engine's inputs (prescription, weight unit) and the normalization boundary's set-type predicates all already live here `[VERIFIED: packages/api-contracts/src/session.ts, program.ts, units.ts, read in full this session]`. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written bigint decimal math for any weight arithmetic inside the engine | A generic decimal library (`decimal.js`, `big.js`) | The codebase already has zero dependency on either — `plate-math` and `units.ts` both hand-roll a bigint-milli-kg pattern instead (`[VERIFIED: packages/api-contracts/src/units.ts:9,36-45]`, `[VERIFIED: packages/plate-math/src/achievability.ts:9-23]`). Introducing a decimal library for this one phase would be the only package in the monorepo to do so — not worth it, since the engine should barely touch weight arithmetic directly (D-04 delegates that to `plate-math`) and every value it does touch (reps, sets, RIR, the shortfall counter) is already an integer. |

**Installation:** none — no new runtime package. Setup work is: (1) add `jest.config.js` + `"test": "jest"` to `packages/progression-engine/package.json`, mirroring `packages/pr-rules/jest.config.js` exactly; (2) add `@fitness/plate-math` and `@fitness/api-contracts` as `packages/progression-engine` dependencies; (3) add `@fitness/progression-engine` as a new devDependency of **both** `apps/mobile/package.json` and `apps/api/package.json` — the latter is a genuinely new addition, since `apps/api/package.json` currently lists only `@fitness/api-contracts` under `@fitness/*` `[VERIFIED: apps/api/package.json:10-30, read in full this session — dependencies block contains exactly one @fitness/* entry]`.

## Package Legitimacy Audit

Not applicable. This phase introduces zero new external (non-workspace) packages — every dependency named above is either already `[VERIFIED]` in this monorepo (`typescript`, `jest`, `ts-jest`) or a first-party `workspace:*` package this project already owns. No `npm view`/registry legitimacy check is meaningful for a workspace-internal import.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌───────────────────────────────────────────┐
                    │        User starts an exercise             │
                    │   (in-gym, possibly zero connectivity)      │
                    └───────────────────┬─────────────────────────┘
                                        ▼
        ┌──────────────────────────────────────────────────────────┐
        │  apps/mobile query helper (new, mirrors summary-query.ts) │
        │  Reads from local SQLite (via PowerSync/Drizzle):          │
        │   - last N logged_set rows for this exercise               │
        │   - the current session_exercise prescription snapshot     │
        │   - the active gym's resolved equipment inventory          │
        │   - the user's D-07 preference (user_preference row)       │
        └───────────────────┬──────────────────────────────────────┘
                            ▼
        ┌──────────────────────────────────────────────────────────┐
        │  Normalization boundary (D-11, inside progression-engine) │
        │  Grouped Phase 7 rows → one comparable performance:        │
        │   - drop/myorep/partial children → read through PARENT     │
        │     ("top set" — ARCHITECTURE.md §1)                       │
        │   - per-side pair → reduce left+right (see Open Questions) │
        │   - superset partner → NO special handling (per-exercise)  │
        └───────────────────┬──────────────────────────────────────┘
                            ▼
        ┌──────────────────────────────────────────────────────────┐
        │  @fitness/progression-engine (pure, this phase's package) │
        │   1. Expected performance = rep-range midpoint + RIR target│
        │   2. Compare normalized history against expected/failure   │
        │   3. Apply shortfall counter (D-05) / RIR tolerance (D-06) │
        │   4. Apply D-07 preference (expand range vs. weight-match)  │
        │   5. Call @fitness/plate-math to snap to a real increment   │
        │   6. Return Recommendation | Unavailable (D-09)             │
        └───────────────────┬──────────────────────────────────────┘
                            ▼
        ┌──────────────────────────────────────────────────────────┐
        │  ExercisePage UI renders the recommendation or the         │
        │  explicit "progression unavailable" state (PRGR-06)         │
        └──────────────────────────────────────────────────────────┘

  Parity proof (D-08), independent of the above runtime path:
        packages/progression-engine/src/__fixtures__/cases.ts
                    │                              │
                    ▼                              ▼
     apps/mobile/**/__tests__/*.test.ts   apps/api/src/**/*.spec.ts
     (jest-expo preset)                    (plain ts-jest, node env)
     both import the SAME fixture array and assert against the SAME
     exported function — a real divergence fails CI, not a gym session.
```

### Recommended Project Structure

```
packages/progression-engine/
├── src/
│   ├── index.ts               # barrel export, mirrors pr-rules/index.ts exactly
│   ├── expected-performance.ts  # PRGR-02: midpoint + RIR, the positive-case rule
│   ├── failure-progression.ts   # PRGR-03: beat prior reps at same load
│   ├── normalize.ts             # D-11: Phase 7 set-vocabulary → one comparable performance
│   ├── shortfall.ts             # D-05: named 3-shortfall constant, holds vs. offers reduction
│   ├── rir-band.ts              # D-06: named ±1 constant, tolerance matching
│   ├── recommend.ts             # the one public entry point; composes the above
│   ├── result.ts                # D-09: the discriminated union type
│   └── __tests__/
│       ├── expected-performance.test.ts
│       ├── failure-progression.test.ts
│       ├── normalize.test.ts
│       ├── shortfall.test.ts
│       ├── rir-band.test.ts
│       └── recommend.test.ts
├── src/__fixtures__/
│   └── cases.ts                # D-08: the shared input/expected-output table, imported by
│                                #  BOTH apps/mobile's test and apps/api's spec — not run here
├── jest.config.js               # NEW — copy packages/pr-rules/jest.config.js verbatim
├── package.json                  # add test script, jest/ts-jest devDeps, plate-math/api-contracts deps
└── tsconfig.json                 # unchanged, already correct
```

### Pattern 1: The Positive-Case Rule (Expected Performance)

**What:** `expectedPerformance = midpoint(targetRepMin, targetRepMax) + targetRir`. Progression triggers when the best normalized set of the exercise's last logged session **strictly exceeds** this value in reps at the prescribed weight.

**When to use:** Every exercise with a rep-range + RIR prescription (i.e. `session_exercise.targetRepMin/targetRepMax/targetRir` all non-null, matching `[VERIFIED: apps/mobile/lib/db/schema.ts:38-40]`).

**Source and confidence:** `[CITED: help.macrofactorapp.com/en/articles/305-understanding-and-using-smart-progressions]` — MacroFactor's own help-center documentation states exactly this formula with a worked example (7-9 reps at 2 RIR → midpoint 8 + RIR 2 = expected 10 reps), fetched and recorded verbatim in `.planning/research/PITFALLS.md:188` during Phase 0 research. PRGR-02's wording ("rep-range midpoint plus RIR target") is a direct restatement of this same public rule — the requirement itself is `[CITED]`, not invented.

**The determinism gap this project's own precedent demands be pinned explicitly:** MacroFactor's example (7-9) has an integer midpoint. A range like 6-9 does not (`(6+9)/2 = 7.5`). Neither MacroFactor's docs nor any source found this session state the tie-break rule for an even-width range. This codebase already has a strong, citable precedent for *not* leaving such a tie-break implicit: `packages/plate-math/src/achievability.ts` documents "Ties (equal distance) resolve down" as a deliberate, commented rule (`[VERIFIED: packages/plate-math/src/achievability.ts:60]`), while `packages/pr-rules/src/warmup.ts` documents the *opposite* convention, "ties toward positive infinity," for its own rounding function, and explicitly notes it differs from the other package's rule (`[VERIFIED: packages/pr-rules/src/warmup.ts:31-33]`). The progression engine must pick its own midpoint tie-break and name it as its own decision with its own comment — not silently inherit either sibling's convention.

```typescript
// Illustrative only — not sourced from any external code, follows this project's own
// documented tie-break-must-be-explicit convention (see plate-math/warmup.ts precedent above).
export function repRangeMidpoint(min: number, max: number): number {
  // Ties round UP (toward the harder target) — consistent with warmup.ts's own precedent for
  // "ambiguous rounding defaults to the more conservative outcome," not silently inherited.
  return Math.ceil((min + max) / 2);
}

export function expectedPerformance(targetRepMin: number, targetRepMax: number, targetRir: number): number {
  return repRangeMidpoint(targetRepMin, targetRepMax) + targetRir;
}
```

### Pattern 2: The Failure-Set Rule

**What:** For a set logged at `rir = 0` (or `setType === 'failure'`), progression triggers on beating the **prior rep count at the same weight** — not the midpoint+RIR formula, which has no meaning at RIR 0.

**Source:** `[CITED: help.macrofactorapp.com/en/articles/305-understanding-and-using-smart-progressions]`, recorded in `.planning/research/PITFALLS.md:189` ("11 reps beats a prior 10 reps at 150 lb"). PRGR-03 restates this directly.

**The "same weight" comparison hazard:** the prior performance and the current one must be compared at the *canonical kg* value (`weightKg` as stored, e.g. `"100.000"`), never a display-unit or re-rounded value — this project already treats `weight_kg` as a `numeric(8,3)`/bigint-milli-kg-scale value precisely so equality comparisons like this don't drift (`[VERIFIED: apps/api/src/db/schema/session.ts, "numeric, not real/doublePrecision... a value that never becomes a binary float"]`). If the user switched gyms between the two sessions being compared (GYM-04, D-04's snapping now runs against a different inventory), "beating the prior rep count at the same load" can fail to have a same-weight candidate at all — this is a real edge case, listed in Open Questions.

### Pattern 3: The Normalization Boundary (D-11)

**What:** Before any rule runs, reduce Phase 7's set vocabulary to one "comparable performance" per exercise per session.

**Grounded in existing project documentation, not invented this session:** `ARCHITECTURE.md` §1 already answers this for drop/myorep/partial chains: "analytics can exclude drops from 'top set' progression tracking queries — these are different consumers of the same rows" and "progression care about the initiating heavy set, not each drop" `[VERIFIED: .planning/research/ARCHITECTURE.md:68,86]`. This means: for any `logged_set` row with a non-null `parentSetId` pointing at a `drop`/`partial` child, or any `myorep` group, **the comparable performance is the parent row** — the sub-entries are real logged effort (they count toward `countsTowardWorkingVolume`, `[VERIFIED: packages/api-contracts/src/session.ts:31-33]`) but they are not what the progression rule compares against the prescription.

**Supersets need no special handling at all.** A superset (`session_exercise.supersetGroupId`, `[VERIFIED: apps/mobile/lib/db/schema.ts:35]`) groups two *different exercises* for rest-timer sequencing. The progression engine operates per-exercise, per `session_exercise` — grouping across exercises is invisible to it. This is a genuine research finding worth stating plainly to the planner: D-11 lists supersets among "what the boundary has to absorb," but the correct absorption is doing nothing, and a plan that writes superset-aware branching into the engine would be solving a problem that does not exist at this layer.

**Per-side (SETS-09) is the one case without a precedent in `ARCHITECTURE.md`.** A per-side pair is structurally identical to a drop/myorep group (a parent `left` row, a child `right` row sharing `parentSetId`, `[VERIFIED: apps/mobile/lib/session/per-side.ts:4-52]`) but the "top set" reduction rule doesn't obviously apply — for a drop set the parent genuinely *is* the highest-effort set, but for a unilateral exercise, left and right are independently meaningful, and the "comparable performance" is not obviously either one alone. This is flagged explicitly in Open Questions below rather than silently resolved.

```typescript
// Illustrative — the actual grouping predicate and SET_TYPES import already exist and should be
// reused, not retyped (packages/api-contracts/src/session.ts:13, per this project's own
// no-retyped-literals convention documented at units.ts:1-4).
import { SET_TYPES, type SetType } from '@fitness/api-contracts';

interface NormalizedPerformance {
  weightKg: string | null;
  reps: number;
  rir: number | null;
  setType: SetType;
}

// Drops/partials/myoreps: parent only. Per-side: see Open Questions — NOT resolved by this
// research, deliberately left as a named gap for the plan/discuss step to close.
export function comparablePerformance(rows: NormalizedRow[]): NormalizedPerformance | null {
  const topSet = rows.find((row) => row.parentSetId === null);
  return topSet ? toNormalizedPerformance(topSet) : null;
}
```

### Pattern 4: Snapping via `@fitness/plate-math` (D-04)

**What:** Once the rule layer decides "the next prescription is N reps at weight W," W must become a weight the active gym can actually produce.

**Already shipped, read this session:** `solvePlateBreakdown(targetKg, inventory)` returns a discriminated union (`loadable | not_loadable | no_plates | unsupported`) `[VERIFIED: packages/plate-math/src/solver.ts:9-13]`; `roundToAchievable(targetKg, loads, direction)` takes an explicit, non-defaulted direction (`'nearest' | 'down' | 'up'`) — "a caller that wants 'nearest' must say so" `[VERIFIED: packages/plate-math/src/achievability.ts:33-35]`; `nearestLoadable` gives the not-loadable neighbour pair the UI already knows how to render (`06-...` gym profile work). The progression engine's job is to call these with the right target and the right direction — not to reimplement rounding.

**Direction choice matters and is a genuine design decision this phase must make explicitly:** when the ideal next weight isn't achievable, does the engine round down (conservative, never overshoots the intended stimulus) or nearest (closer to the textbook progression but might overshoot)? Neither MacroFactor's public docs nor the training literature found this session states a preference — `plate-math` supports all three directions and takes no position on which a caller should choose. Recorded as an Open Question.

### Anti-Patterns to Avoid

- **A single scoring function with tunable weights** instead of explicit, auditable per-case rules. `PITFALLS.md` Pitfall 8's own warning sign list names this directly `[CITED: .planning/research/PITFALLS.md:215]` — it directly contradicts the project's "no AI/black-box progression" constraint (`REQUIREMENTS.md`'s Out of Scope table: "AI/LLM-driven programming or progression... MacroFactor itself deliberately uses deterministic rule-based logic").
- **Treating a missed session as a missed rep.** D-10's "recency measured in sessions logged" already forecloses this, but it's worth restating as the anti-pattern it prevents: a time-decay term anywhere in the engine reintroduces exactly the behavior PRGR-08 forbids. If the plan ever reaches for `Date.now()` or an elapsed-days calculation inside `progression-engine`, that is itself a defect signal, not a style nit — the package must remain clockless per D-02.
- **Comparing history across a gym-profile switch as if nothing changed.** The plate-math snapping is per-inventory; a "same weight" comparison (Pattern 2) or a stored prior recommendation computed against a different gym's achievable set can silently misfire. See Open Questions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rounding a target weight to a real, loadable value | A second rounding function inside `progression-engine` | `@fitness/plate-math`'s `solvePlateBreakdown`/`roundToAchievable`/`nearestLoadable` (D-04) | Already shipped, tested, and exercises an exact bounded-knapsack search against the gym's actual plate counts — `[VERIFIED: packages/plate-math/src/solver.ts, read in full]`. A second implementation would drift the moment either one is patched, exactly the failure mode `ARCHITECTURE.md` §4 warns against for the progression engine itself. |
| Decimal-safe weight arithmetic | A generic decimal library, or naive JS float math on weight strings | The bigint-milli-kg pattern already established in `units.ts`/`achievability.ts`/`solver.ts` | Every other weight-touching module in this codebase reimplements this same small `toMilliKg`/`fromMilliKg` pair locally rather than sharing it across a dependency edge (`achievability.ts`'s own comment: "Duplicated from solver.ts rather than imported... keeps this module importable with zero dependency on solver.ts" `[VERIFIED: packages/plate-math/src/achievability.ts:5-8]`) — this is a deliberate, established local convention, not an oversight to "fix" by introducing a shared decimal dependency. |
| e1RM / PR-adjacent math | Any estimated-1RM or PR-detection logic inside `progression-engine` | Out of scope for this phase entirely — `@fitness/pr-rules` already owns `estimated1RM`/`E1RM_MAX_VALID_REPS` (`[VERIFIED: packages/pr-rules/src/estimated-1rm.ts]`) and PR detection, and Phase 9 (Analytics) is where that surfaces, not Phase 8. |
| Set-type/working-volume predicates | A local re-implementation of "which set types count" | `countsTowardWorkingVolume`/`SET_TYPES` from `@fitness/api-contracts` | Single source of truth, already enforced elsewhere by name (`[VERIFIED: packages/api-contracts/src/session.ts:25-30]` — the file itself lists every call site required to route through it). |

**Key insight:** almost everything this phase would be tempted to hand-roll (rounding, decimal safety, set-type vocabulary, e1RM) is already solved elsewhere in this exact monorepo. The actual new work is small: the rule sequencing (expected performance → shortfall counter → RIR band → preference branch) and the normalization boundary. Keep the package correspondingly small — `@fitness/pr-rules` (three ~40-line modules) is the right size precedent, not a large state-machine framework.

## Common Pitfalls

### Pitfall 1: Unbounded ratcheting / oscillation

**What goes wrong:** Double progression with no upper bound (no rep-range ceiling forcing a weight increase, no deload mechanism) drives weight up indefinitely until form breaks or the lifter stalls hard; a naive implementation can also oscillate — add weight, fail immediately, get offered a reduction, accept it, add weight again — if the shortfall counter resets incorrectly on a single subsequent success that isn't itself convincing.

**Why it happens:** The bounded-range mechanic (progression is capped by the programmed rep range; a full weight increase always resets you to the bottom of the range) is what prevents unbounded ratcheting, per `[CITED: .planning/research/PITFALLS.md:206]`. If the plan implements "add weight" without also implementing "reset to the bottom of the rep range" as a single atomic transition, ratcheting reappears.

**How to avoid:** The weight-increase branch of the rule must always pair with resetting the target back toward `targetRepMin` (textbook double progression, confirmed via WebSearch this session, `[CITED: legionathletics.com/double-progression, alphaprogression.com/en/glossary/double-progression]`) — never "add weight, keep the same rep target."

**Warning signs:** A test fixture where the recommendation weight increases session-over-session with no corresponding drop in the recommended rep target.

### Pitfall 2: The layoff-ratchet problem (PRGR-08)

**What goes wrong:** Any mechanism that treats "no recent session" as evidence of decline produces exactly the reduced-after-absence recommendation PRGR-08 forbids.

**Why it happens:** The most natural implementation of "recency" in almost any other domain is wall-clock elapsed time — this is precisely why D-10 pins recency to sessions-logged instead, and why this is marked one-way-in-spirit in CONTEXT.md.

**How to avoid:** The engine's history-read must be "last N sessions with a logged set for this exercise," full stop — never filtered or weighted by how long ago those sessions were. `resolveNextUp` (`apps/mobile/lib/programs/next-up.ts`) already establishes the precedent for this kind of pure, clockless positional derivation in this codebase (`today` arrives as an argument, `[VERIFIED: apps/mobile/lib/programs/next-up.ts:9-10, "today arrives as an argument so every calendar boundary below is a unit test"]`) — the progression engine should follow the identical discipline for its own inputs.

**Warning signs:** Any `Date`, `Date.now()`, or elapsed-days calculation appearing inside `packages/progression-engine/src`.

### Pitfall 3: Unit drift between kg and lb

**What goes wrong:** A gym profile's native unit (`nativeUnit: WeightUnit`, `[VERIFIED: packages/plate-math/src/inventory.ts:8]`) may differ from the user's display preference, and if the engine's arithmetic ever passes through a display-unit intermediate (rather than staying in canonical kg end-to-end and converting only at render time), repeated conversion drifts the stored/compared value.

**Why it happens:** This is `PITFALLS.md` Pitfall 10, already flagged project-wide — the mitigation (`toCanonicalKg`/`fromCanonicalKg`, convert only at the input/display boundary) is already built and used correctly elsewhere (`[VERIFIED: packages/api-contracts/src/units.ts:64-79]`).

**How to avoid:** The engine's public inputs and outputs should be canonical-kg strings throughout; unit conversion happens only in the UI layer that calls it, exactly as every other module in this codebase already does.

### Pitfall 4: The very first session (PRGR-07) — no history to compute from

**What goes wrong:** An engine that assumes at least one prior logged set exists will crash or silently invent a starting weight for a brand-new exercise.

**How to avoid:** PRGR-07 states the resolution directly: the user picks their own starting weight, and the engine "takes over afterward." This means the engine's public entry point must accept an empty-history input and return an explicit "no history — user must supply a starting point" branch of the D-09 discriminated union (a fourth case alongside "recommendation" and "unavailable within target rep range," or a documented reason code on the unavailable case — this exact shape is a planning decision, not resolved here, since D-09 as written in CONTEXT.md describes a two-way union and doesn't explicitly name a third "no-history" case).

**Warning signs:** A fixture table (D-08) that has no zero-history test case is not exercising PRGR-07 at all.

### Pitfall 5: Test-infrastructure divergence undermines D-08's whole point

**What goes wrong:** D-08's entire justification is "prove it, don't assert it" — a fixture table that only one side of the client/server boundary actually runs is a false proof.

**Concrete, verified-this-session facts that make this a real risk, not a hypothetical:**
- `apps/api/jest.config.js` sets `testRegex: '\\.spec\\.ts$'` `[VERIFIED: apps/api/jest.config.js:5]` — an api-side test file must be named `*.spec.ts`.
- `apps/mobile/jest.config.js` uses the `jest-expo` preset with no `testRegex` override and every existing test file in this codebase's mobile-side `__tests__` directories is named `*.test.ts`/`*.test.tsx` (confirmed by directory listing this session) — a mobile-side test file must be named `*.test.ts` to match this project's own established convention (jest's own default `testMatch` also accepts `*.spec.ts`, but no mobile test in this repo uses that naming today, so a `*.spec.ts` file would be the first and would break the "same convention across the repo" expectation, not the run itself).
- `packages/progression-engine/package.json` currently has **no** `"test"` script at all — unlike `packages/pr-rules` and `packages/plate-math`, both of which do `[VERIFIED: packages/progression-engine/package.json:1-15 vs. packages/pr-rules/package.json:8-11]`.
- `apps/api/package.json`'s `@fitness/*` dependency block contains exactly one entry (`@fitness/api-contracts`) — `@fitness/pr-rules` and `@fitness/plate-math` are not listed there at all `[VERIFIED: apps/api/package.json, grep result this session]`. This means **no shared pure package has ever actually been imported from `apps/api`**, despite `ARCHITECTURE.md` describing both `pr-rules` and the (then-hypothetical) progression engine as consumed from both sides.

**How to avoid:** The plan must explicitly add: (1) `packages/progression-engine`'s own `jest.config.js` + `test` script (copy `pr-rules`'s verbatim); (2) `@fitness/progression-engine` as a new `apps/api/package.json` devDependency; (3) at least one real `apps/api/src/**/*.spec.ts` file that imports the shared fixture table and the package's entry point directly, run via `pnpm --filter api test`, not merely assumed to pass because the mobile-side test does. This is new setup, not a reuse of an existing cross-package test pattern — no such pattern exists yet in this repo.

### Pitfall 6: "Same load" comparison across a gym switch

**What goes wrong:** PRGR-03's failure-set rule and the general progression comparison both implicitly assume "the weight logged last time" is a meaningful reference point today. GYM-04 lets a user switch gyms mid-program; a barbell+plates combination achievable at Gym A may not exist at Gym B, and the "same load" the failure rule wants to compare against may not even be re-loadable today.

**How to avoid:** Not fully resolved by this research — flagged as an Open Question. At minimum, the comparison should be an exact canonical-kg equality check against the *historical* logged value (never re-snapped to today's gym before comparing), and the *next* recommendation (if any) should be snapped against *today's* active inventory — these are two different weights and must not be conflated.

## Code Examples

### Discriminated Union Result (D-09)

```typescript
// Source: this project's own established pattern for "unavailable" states — mirrors
// EquipmentBandState (packages/plate-math/src/band.ts:16-22, VERIFIED read this session) exactly:
// a data-only discriminated union, no display strings, formatting left to the caller.
export type ProgressionResult =
  | { kind: 'recommendation'; weightKg: string; reps: number; rir: number | null }
  | { kind: 'unavailable'; reason: 'no_achievable_weight_in_range' | 'equipment_unresolved' }
  | { kind: 'no_history' }; // PRGR-07 — see Pitfall 4; exact shape TBD by planner
```

### The Shared Fixture Table (D-08)

```typescript
// Source: no direct precedent exists in this repo yet (Pitfall 5) — this shape follows the
// input/expected-output convention already used by this project's own test files
// (e.g. packages/pr-rules/src/__tests__/personal-records.test.ts's table-driven style), lifted
// to package level so BOTH apps/mobile and apps/api import the same array object, not a copy.
export interface ProgressionFixtureCase {
  name: string;
  history: NormalizedPerformance[];
  prescription: ResolvedTarget;
  inventory: ResolvedInventory;
  preference: 'expand_range' | 'match_weight';
  expected: ProgressionResult;
}

export const PROGRESSION_FIXTURES: ProgressionFixtureCase[] = [
  // ... populated during planning/execution, not research.
];
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Two independent test suites, each hand-writing its own progression test cases | One shared fixture table (`__fixtures__/cases.ts`), imported and run by both `apps/mobile` and `apps/api` test runners | This phase (D-08), 2026-08-28 | A rule change that makes client and server disagree fails CI at the fixture level, not silently in a gym — matches the standard this project already held Phases 4 and 7 to per CONTEXT.md. |

**Deprecated/outdated:** Nothing in this domain is deprecated — double progression and RIR-based autoregulation are both stable, decades- and years-old respectively, standard practice with no newer competing paradigm found this session.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | D-05's 3-consecutive-shortfall threshold and D-06's ±1 RIR band are **this project's own invention**, not derived from any published MacroFactor, RP, or SBS source — no source found this session states either number for this exact "consecutive-session shortfall" axis. | The Honesty Problem, PRGR-09/PRGR-10 evaluation | If a future contributor believes these numbers are sourced from published literature, they may resist changing them even when in-app data (once collected) suggests a different threshold works better. The named-constant structure (D-05/D-06's own reversibility framing) already mitigates this; this assumption just makes explicit that "informed by RP/SBS" (STATE.md's own phrasing) means general posture, not a specific borrowed number. |
| A2 | Reducing a per-side pair (left/right) to "one comparable performance" should default to the **weaker/limiting side**, if the planner needs a default — not stated by any requirement or by CONTEXT.md's D-11, and not found in any source consulted this session. | Pattern 3 / Open Questions | If wrong, a user training an asymmetric unilateral movement could be over-progressed on their weaker side (safety/form risk) or under-progressed on their stronger side (slower gains) depending on which default is chosen instead. |
| A3 | The midpoint tie-break for an even-width rep range (Pattern 1, `Math.ceil`) is a reasonable, conservative default — not derived from any MacroFactor documentation, since the only public worked example (7-9 reps) has an odd width and never exercises this case. | Pattern 1 | Low — this is a single named, isolated constant/function exactly like D-05/D-06, cheap to change, and the fixture table (D-08) will pin its behavior with a test either way. |
| A4 | `Math.round`/`Math.ceil`/`Math.floor`/basic arithmetic (`+`, `-`, `*`, `/`) on JS numbers are deterministic across V8 (web), JSC (iOS), and Hermes (Android/default RN) for the integer-and-simple-arithmetic operations this engine needs, because these are IEEE-754/ECMA-262-mandated behaviors, not ICU-data-dependent like `Intl`/`toLocaleString`. This is reasoned from general JS-engine-spec knowledge, not empirically verified on-device this session (no simulator/device available per this project's own STATE.md standing note). | Determinism / Common Pitfalls | If wrong in some edge case (e.g., a specific transcendental function this engine ends up needing but doesn't currently plan to use), the D-08 fixture table run on both `apps/mobile` (jest-expo, effectively V8/node under Jest, not actually Hermes) and `apps/api` (node/V8) would **not** catch a Hermes-specific divergence, because neither test environment runs on-device Hermes. This is itself worth naming as a gap the D-08 "proof" does not fully close — see Open Questions. |

## Open Questions

1. **Per-side (SETS-09) normalization — what is "one comparable performance" for a unilateral pair?**
   - What we know: The drop/myorep/partial case has a clear, already-documented precedent ("top set," `ARCHITECTURE.md` §1). Per-side shares the identical parent/child storage shape but not the same semantic — both sides are independently meaningful working performance, not a "lead set + assistance."
   - What's unclear: Should the engine compare the weaker side, the stronger side, an average, or track each side as an independent progression stream (which would mean the "one recommendation per exercise" entry-point shape in the Architectural Responsibility Map is itself wrong for unilateral exercises)?
   - Recommendation: Surface this explicitly in `/gsd-discuss-phase` or the plan-checker step before locking the normalization function — this is exactly the kind of design call CONTEXT.md's `[CLAUDE'S CALL]` pattern exists for, and it was not covered by any existing decision (D-11 mentions per-side as something the boundary "has to absorb" but does not specify how).

2. **Rounding direction when the ideal weight isn't achievable (feeds D-04/PRGR-05).**
   - What we know: `plate-math`'s `roundToAchievable` supports `'nearest' | 'down' | 'up'` and takes no default (`[VERIFIED: packages/plate-math/src/achievability.ts:33-35]`).
   - What's unclear: MacroFactor's public docs describe the *existence* of the equipment constraint but not which rounding direction it uses when the exact target isn't achievable, and neither RP nor SBS speak to plate-rounding at all (it's not their domain).
   - Recommendation: Default to `'down'` — never overshoot the intended stimulus/RIR target with an unrequested extra jump — but flag this as a `[CLAUDE'S CALL]`-style named constant for the plan, exactly like D-05/D-06, so it's cheap to reverse.

3. **"Same load" comparison across a gym-profile switch (Pitfall 6).**
   - What we know: GYM-04 permits switching gyms mid-program; the failure-set rule (PRGR-03) and the general progression comparison both reference "the same weight/load" as logged previously.
   - What's unclear: Whether a switched-gym history entry should be excluded from the shortfall/failure comparison entirely, treated as a fresh no-history case for that exercise, or compared as-is (canonical kg equality, regardless of achievability today).
   - Recommendation: Compare canonical kg values as-stored (never re-snap history before comparing) as the minimum-viable rule; treat "is this weight still achievable at the *current* gym" as a separate question answered only when computing the *next* recommendation, not when reading the *past* one. Needs explicit confirmation before planning locks the comparison function's signature.

4. **The exact shape of PRGR-07's "no history" case in the D-09 union (Pitfall 4).**
   - What we know: D-09 as written names two branches ("a recommendation" and "no valid recommendation... typed result"). PRGR-07 describes a third, distinct situation (no history at all, user supplies the number) that is not the same as "unavailable within target rep range."
   - What's unclear: Whether "no history" is its own union member or a `reason` field on the existing unavailable case.
   - Recommendation: A third union member (`{ kind: 'no_history' }`) is cleaner for callers (exhaustive switch forces the UI to handle "ask the user to pick a starting weight" distinctly from "we tried and couldn't find a valid weight") — but this is a small enough decision to leave to the planner rather than lock here.

5. **Does apps/api need a live invocation site in Phase 8, or only the D-08 parity spec test?**
   - What we know: CONTEXT.md's phase boundary explicitly defers "server-side aggregate reconciliation" to Phase 10. `ARCHITECTURE.md` §4 describes server invocation as "for reconciliation and browser-based program planning... never as the primary path."
   - What's unclear: Whether Phase 8's plan should add a real (even if unused-in-production) NestJS service/endpoint that calls the package, or whether a standalone `apps/api/src/**/*.spec.ts` that imports the package directly (no NestJS module wiring at all) fully satisfies D-08 and success criterion 6 ("the same rule code runs on client and server").
   - Recommendation: The literal reading of D-08 ("run by both suites") is satisfied by a spec test with no NestJS wiring — this is the minimal, correct scope for Phase 8, leaving the actual reconciliation service to Phase 10 as CONTEXT.md's boundary already states. Flagging only because "wire it into NestJS" is an easy scope-creep trap for a planner skimming ARCHITECTURE.md's diagram without reading the phase boundary closely.

## Environment Availability

Not applicable — this phase has no external service, CLI, or runtime dependency beyond the Node/TypeScript/Jest toolchain already verified present and working across every prior phase in this monorepo (`pnpm -w typecheck`, `pnpm -w test` are this project's own standing build/test commands per `.planning/config.json`).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest `^30.0.0` + `ts-jest` `^29.2.5`, matching `packages/pr-rules`/`packages/plate-math` exactly `[VERIFIED: packages/pr-rules/package.json:17-22]` |
| Config file | `packages/progression-engine/jest.config.js` — does not exist yet, must be created (copy `packages/pr-rules/jest.config.js` verbatim, `[VERIFIED: packages/pr-rules/jest.config.js]`) |
| Quick run command | `pnpm --filter @fitness/progression-engine test` |
| Full suite command | `pnpm -w test` (this project's standing `workflow.test_command` per `.planning/config.json`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRGR-01 | Recommendation computed from logged history | unit | `pnpm --filter @fitness/progression-engine test -- recommend` | ❌ Wave 0 |
| PRGR-02 | Expected performance = midpoint + RIR triggers progression | unit | `pnpm --filter @fitness/progression-engine test -- expected-performance` | ❌ Wave 0 |
| PRGR-03 | Failure sets progress on beating prior reps at same load | unit | `pnpm --filter @fitness/progression-engine test -- failure-progression` | ❌ Wave 0 |
| PRGR-04 | D-07 preference branches expand-range vs. weight-match | unit | `pnpm --filter @fitness/progression-engine test -- recommend` (preference cases) | ❌ Wave 0 |
| PRGR-05 | Recommendations snap to gym increments | unit | `pnpm --filter @fitness/progression-engine test -- recommend` (integrates plate-math) | ❌ Wave 0 |
| PRGR-06 | Explicit unavailable state, never invented | unit | `pnpm --filter @fitness/progression-engine test -- recommend` (unavailable cases) | ❌ Wave 0 |
| PRGR-07 | No-history starting-weight handoff | unit | `pnpm --filter @fitness/progression-engine test -- recommend` (empty-history case) | ❌ Wave 0 |
| PRGR-08 | No reduction from missed sessions (recency-by-sessions) | unit | `pnpm --filter @fitness/progression-engine test -- shortfall` | ❌ Wave 0 |
| PRGR-09 | Reduction offered only after 3 consecutive shortfalls | unit | `pnpm --filter @fitness/progression-engine test -- shortfall` | ❌ Wave 0 |
| PRGR-10 | RIR tolerance band (±1) | unit | `pnpm --filter @fitness/progression-engine test -- rir-band` | ❌ Wave 0 |
| PRGR-11 | Zero-connectivity computation | integration (implicit — proven by D-02 purity, no network mock needed) | same as PRGR-01 | ❌ Wave 0 |
| SC6 (parity) | Same fixture table passes on both client and server | cross-runtime | `pnpm --filter @fitness/progression-engine test && pnpm --filter mobile test -- progression && pnpm --filter api test -- progression` | ❌ Wave 0 (all three sides) |

### Sampling Rate

- **Per task commit:** `pnpm --filter @fitness/progression-engine test`
- **Per wave merge:** `pnpm -w test` (must include the new `apps/api` spec and the new `apps/mobile` test, per D-08)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus the explicit three-way parity command above (package suite + mobile suite + api suite), since D-08's entire point is that a green mobile suite alone is not proof.

### Wave 0 Gaps

- [ ] `packages/progression-engine/jest.config.js` — does not exist; copy `packages/pr-rules/jest.config.js`
- [ ] `packages/progression-engine/package.json` — needs `"test": "jest"` script, `jest`/`ts-jest`/`@types/jest` devDependencies, `@fitness/plate-math` and `@fitness/api-contracts` dependencies (none of these currently present, `[VERIFIED: packages/progression-engine/package.json, read in full this session]`)
- [ ] `apps/api/package.json` — needs `@fitness/progression-engine` added; no `@fitness/*` pure-rules package has ever been added here before (Pitfall 5) — this is new integration surface, budget real time for it
- [ ] `apps/api/src/**/*.spec.ts` (new directory/module, e.g. `apps/api/src/progression/`) — the first file in this codebase to import a shared pure package from the API side; does not exist
- [ ] `apps/mobile/**/__tests__/*.test.ts` — the mobile-side half of the D-08 parity proof, following the existing `apps/mobile/lib/db/__tests__/*.test.ts` convention

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | The engine is a pure function with no session/identity concept; auth happens above it (existing Better Auth session on the caller side). |
| V3 Session Management | No | Not applicable to a pure package. |
| V4 Access Control | No | The engine never touches which user's data it's given — the caller (existing query helpers) is already responsible for scoping reads to the authenticated user, matching the existing project-wide pattern (`PITFALLS.md`'s own Security Mistakes table: "always scope nested-resource queries through the owning chain"). |
| V5 Input Validation | Yes | The engine must defensively reject malformed numeric input (negative reps, `NaN`/`Infinity` weights, a rep range where `min > max`) rather than propagate garbage into a recommendation — following the exact pattern `pr-rules`'s `estimated1RM` already uses (`if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return null`, `[VERIFIED: packages/pr-rules/src/estimated-1rm.ts:8-11]`). |
| V6 Cryptography | No | No cryptographic operation in this package. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed/adversarial local-history input (e.g. a corrupted or maliciously edited local SQLite row) crashing the engine or producing a nonsensical recommendation (e.g. a negative weight) | Tampering | Input validation at the engine boundary (V5 above) — return `unavailable`/`no_history` rather than throw, matching D-09's discriminated-union philosophy: a caller must handle the "we couldn't compute this" branch to compile, so a bad input degrades gracefully rather than crashing the workout screen mid-set. |
| A stored/cached recommendation silently going stale after the user edits their program or switches gyms (not a classic security threat, but an integrity concern this phase's own D-03 already forecloses) | Tampering (data integrity, not confidentiality) | D-03: never persist a denormalized recommendation — always derive-on-read. Already locked; noted here only because it is, structurally, the correct mitigation for a class of integrity bug this domain is prone to. |

## Sources

### Primary (HIGH confidence)
- `packages/pr-rules/src/*.ts` (all four files) — read in full this session; the direct structural and stylistic precedent this package should follow
- `packages/plate-math/src/*.ts` (all four files) — read in full this session; D-04's snapping dependency, and the bigint-decimal-math convention
- `packages/api-contracts/src/session.ts`, `program.ts`, `units.ts` — read in full this session; the exact vocabulary and shape (`SetType`, `ResolvedTarget`, `WeightUnit`) the engine must accept
- `apps/mobile/lib/db/schema.ts` (relevant tables read directly, with line citations) — the real column shapes (`session_exercise`, `logged_set`, `user_preference`)
- `apps/api/src/db/schema/session.ts` — the Postgres-side schema and its own commentary confirming the `numeric`/no-float weight-storage rationale
- `apps/mobile/lib/programs/next-up.ts`, `apps/mobile/lib/db/log-set.ts`, `apps/mobile/lib/session/per-side.ts` — read in full this session; the recency-by-history and snapshot-on-use precedents this phase must match
- `.planning/phases/08-progression-engine/08-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — read in full this session

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` §1, §4 — this project's own prior research pass, itself citing MacroFactor's help center and RP/PMC volume-landmark sources
- `.planning/research/PITFALLS.md` Pitfall 8 — this project's own prior research pass, directly fetching MacroFactor's help-center documentation (the source of PRGR-02/PRGR-03/PRGR-04's public grounding)
- `.planning/config.json` — confirms `nyquist_validation: true`, `security_enforcement: true`, standing `build_command`/`test_command`

### Tertiary (LOW confidence)
- WebSearch: "double progression rep-range scheme definition and mechanics" — cross-checked across `legionathletics.com`, `alphaprogression.com`, `hevycoach.com` — general coaching-content consensus, no single authoritative source, but internally consistent and matches this project's own D-07 default
- WebSearch: "Stronger By Science RIR autoregulation... consecutive missed reps" — surfaced that SBS's actual trigger is intra-session (reps missed within one set), not inter-session (this phase's PRGR-09 axis) — this distinction is the main new finding from this search and is reflected in §The Honesty Problem and Assumption A1

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, entirely reuses already-`[VERIFIED]`-this-session sibling packages and conventions
- Architecture: HIGH — the normalization boundary's drop/myorep/partial case and the client-first placement are both directly grounded in this project's own prior architecture research, read in full this session; the per-side case is honestly flagged MEDIUM/open
- Pitfalls: HIGH for the mechanical/engineering pitfalls (test infra divergence, unit drift, layoff-ratchet — all verified against real files this session); MEDIUM for the training-science pitfalls (grounded in `PITFALLS.md`'s own prior MacroFactor-help-center fetch, not re-fetched this session)
- The two negative-case constants (D-05, D-06): LOW confidence as *sourced* facts — correctly so, since no source states them; this research's job was to confirm that absence, not manufacture a citation

**Research date:** 2026-08-28
**Valid until:** 30 days for the engineering/codebase findings (stable domain, low churn risk); the training-science citations (MacroFactor help-center content) should be treated as valid until MacroFactor materially changes its public documentation, which this research has no way to monitor — re-verify if a future phase revisits progression rules after a long gap.
