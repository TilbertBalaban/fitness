# Phase 6: Gym Profiles & Plate Math - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-26
**Phase:** 6-gym-profiles-plate-math
**Areas discussed:** Achievability enforcement, Plate strip behavior, Profile shape & switching, Unavailable equipment mid-workout

---

## Achievability enforcement

### Q1 — Entering an unachievable weight

| Option | Description | Selected |
|--------|-------------|----------|
| Accept, show it's not loadable | Logs what you typed; strip reports not-loadable and nearest values | ✓ |
| Snap to nearest achievable on commit | Guarantees loadable history, overwrites a deliberate entry | |
| Block entry — keypad only produces valid loads | Strongest guarantee, traps the user when the profile is stale | |

**Notes:** Reality can differ from the profile (borrowed plate, different gym, fractional set). → D-09

### Q2 — Are app suggestions held to a stricter rule than manual entry?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — suggestions always achievable | Asymmetric rule; makes GYM-06 literally true without policing entry | ✓ |
| Same rule as manual entry | One code path, but a 42.7 kg computed warm-up surfaces as-is | |

**Notes:** → D-09

### Q3 — Rounding direction for suggested loads

| Option | Description | Selected |
|--------|-------------|----------|
| Nearest, ties down | Closest real load; tie prefers lighter | ✓ |
| Always down | Never overshoots; systematically under-loads at coarse gyms | |
| You decide | Per-call-site, direction as explicit parameter | |

**Notes:** `warmup.ts` already documents the silent-round-down hazard; direction must be an explicit parameter. → D-10

### Q4 — Recomputing loads under a different profile

| Option | Description | Selected |
|--------|-------------|----------|
| Logged weights never recompute | History is fact; only suggestions and the live strip resolve against the active profile | ✓ |
| Re-resolve everything against active profile | Consistent display, rewrites history on gym switch | |

**Notes:** → D-11

---

## Plate strip behavior

### Q1 — Strip content for a loadable barbell weight

| Option | Description | Selected |
|--------|-------------|----------|
| Per-side plates, largest first | `20 · 10 · 2.5` with bar weight as quiet prefix | ✓ |
| Per-side plates + running total | Redundant with the field above | |
| Both sides mirrored visually | Prettiest, worst legibility at max font scale | |

**Notes:** Phase 5 D-18 flags this screen's layout as the tightest constraint. → D-12

### Q2 — Not-loadable state

| Option | Description | Selected |
|--------|-------------|----------|
| Nearest loadable on each side, tappable | `not loadable · 150 ← → 155` | ✓ |
| Just state it's not loadable | Leaves arithmetic to the user at the rack | |
| Show plates for the nearest load | Breakdown wouldn't match the field | |

**Notes:** → D-13

### Q3 — Non-barbell exercises

| Option | Description | Selected |
|--------|-------------|----------|
| Equipment-appropriate hint, same band | Machine stack range, dumbbell pair, bodyweight collapses band | ✓ |
| Collapse the band for anything non-barbell | Wastes the only payoff for GYM-03's machine config | |
| Always render, empty when N/A | Stable layout, permanent dead line | |

**Notes:** Driven off catalog `equipment_type`/`load_type`. → D-14

### Q4 — Plate counts vs denominations

| Option | Description | Selected |
|--------|-------------|----------|
| Respect counts | Bounded knapsack; correct in the home gym this feature is for | ✓ |
| Denominations only | Greedy and fast, wrong where it matters | |

**Notes:** GYM-02 names counts explicitly. → D-15

---

## Profile shape & switching

### Q1 — JSONB vs normalized

| Option | Description | Selected |
|--------|-------------|----------|
| Typed JSONB with a contract schema | Shape defined/validated in api-contracts; no new synced tables | ✓ |
| Normalize into child tables | Queryable, at the cost of three tables and per-row conflicts | |
| Leave as free-form JSONB | The PITFALLS §9 failure, again | |

**Notes:** Inventory is authored as one document and never queried across. → D-16

### Q2 — How a session knows its gym

| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot profile id onto the session at start | Same pattern as timezone/local_date and the target snapshot | ✓ |
| Pointer only — read the preference row | Past sessions retroactively claim the new gym | |
| Snapshot the whole inventory | Self-contained but duplicative | |

**Notes:** → D-17

### Q3 — Switching mid-workout

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, restamps the session going forward | Logged sets untouched; strip/suggestions follow the new gym | ✓ |
| No — fixed once the session starts | Cleaner invariant, wrong-gym case only fixable by discarding | |

**Notes:** → D-18

### Q4 — First run with no profile

| Option | Description | Selected |
|--------|-------------|----------|
| Seed a sensible default profile | "My Gym", matches weight unit, full commercial set | ✓ |
| Prompt to configure first | Blocks the in-gym flow at the worst moment | |
| Degrade — no strip until configured | Silently hides the headline feature | |

**Notes:** → D-19

---

## Unavailable equipment mid-workout

### Q1 — Where the mark writes

| Option | Description | Selected |
|--------|-------------|----------|
| Session-only, with an option to persist | Default "just today"; separate action writes through to the profile | ✓ |
| Always writes to the profile | A busy machine permanently deletes equipment | |
| Session-only, never persists | Genuinely-absent equipment needs re-marking every workout | |

**Notes:** Mirrors Phase 5 D-14's session-vs-program split. → D-20

### Q2 — What an alternative is

| Option | Description | Selected |
|--------|-------------|----------|
| Substitute exercises from the catalog | Equipment-filtered candidates via the existing Swap action | ✓ |
| Same exercise, different loading | Doesn't answer "the rack is taken" | |
| Both, ranked | Needs a ranking rule this phase would have to invent | |

**Notes:** → D-22

### Q3 — What happens to the program after a swap

| Option | Description | Selected |
|--------|-------------|----------|
| Session-only; targets carry over | Program untouched; substitute inherits sets/reps/RIR | ✓ |
| Offer to update the program too | "The rack was busy once" is too weak a signal | |

**Notes:** → D-23

### Q4 — Does unavailability feed plate math and suggestions

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — one resolved inventory | Profile inventory minus session's unavailable set, read by everything | ✓ |
| No — only filters swap candidates | A machine marked broken could still be suggested a load | |

**Notes:** → D-21

---

## Claude's Discretion

- Per-call-site rounding direction (nearest for working sets, down for warm-ups), provided the
  direction is an explicit parameter — D-10.
- The concrete JSON shapes for the three `equipment_profile` columns — D-16.
- The knapsack solver's implementation strategy — D-15.
- The seeded default profile's exact plate inventory — D-19.

## Deferred Ideas

- Load-based alternatives ranked alongside exercise substitutions — revisit with Phase 8.
- Program write-back after repeated equipment-driven swaps, driven by history rather than one session.
- Location/geofence-based automatic gym selection — out of scope for v1.
