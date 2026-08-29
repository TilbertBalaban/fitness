# Volume, RIR and Session-Length Landmarks — Provenance

MacroFactor's own volume-landmark and autoregulation math is not publicly documented. Every number
in this document is **this project's own design decision** — informed by published volume-landmark
and autoregulation literature (Renaissance Periodization-style MEV/MAV bands, NSCA-style
%1RM-to-rep-range mapping, descending-RIR-within-a-block autoregulation), never copied from a
specific source and never reverse-engineered from MacroFactor's product. This document is the
research flag's resolution (D-15, `.planning/phases/11-program-generation/11-RESEARCH.md`
Assumptions Log A1-A4): the flag is closed by writing this table down, not by trying to match an
undocumented competitor exactly.

Generation is followed by ordinary progressive-overload logging (Phase 8's rules), so **every
number below affects perceived program quality, never correctness** — a wrong constant makes a
generated program feel too easy, too hard, or oddly paced. It never produces an invalid or
unsafe prescription, because the progression engine that takes over afterward has no dependency
on how the starting point was chosen.

## `MUSCLE_GROUP_VOLUME_CLASS`

Every one of the 19 `MUSCLE_GROUPS` (`packages/api-contracts/src/catalog.ts`) is assigned to one of
three volume classes, which in turn selects its `EXPERIENCE_VOLUME_BAND` row below. Assignment is
by typical muscle size and multi-joint involvement — larger, more compound-heavy muscle groups
tolerate and require more weekly sets than small, isolation-dominant ones.

| Muscle Group | Class |
|---|---|
| `chest` | large |
| `lats` | large |
| `upper_back_traps` | large |
| `quads` | large |
| `hamstrings` | large |
| `glutes` | large |
| `front_delts` | medium |
| `side_delts` | medium |
| `rear_delts` | medium |
| `biceps` | medium |
| `triceps` | medium |
| `abs` | medium |
| `adductors` | medium |
| `calves` | medium |
| `lower_back` | small |
| `forearms` | small |
| `obliques` | small |
| `abductors` | small |
| `neck` | small |

**Literature anchor:** RP-style volume-landmark tables, which group muscles by typical
tolerance/requirement tier rather than assigning every muscle its own unique band.
**If wrong:** a misclassified muscle group ramps toward a lower or higher ceiling than a lifter
training it would expect — a perceived-pacing issue, not a correctness failure.

## `EXPERIENCE_VOLUME_BAND`

Minimum-effective (`mev`) and adaptive-maximum (`mav`) weekly sets per volume class, per experience
level. `weeklySetTarget` ramps linearly from `mev` at the first training cycle to `mav` at the
last.

| Experience | Class | `mev` | `mav` |
|---|---|---|---|
| beginner | large | 8 | 12 |
| beginner | medium | 6 | 10 |
| beginner | small | 4 | 6 |
| intermediate | large | 10 | 18 |
| intermediate | medium | 8 | 14 |
| intermediate | small | 4 | 8 |
| advanced | large | 12 | 22 |
| advanced | medium | 10 | 16 |
| advanced | small | 6 | 10 |

**Literature anchor:** RP-style MEV/MAV bands, scaled up by experience level (a more trained
lifter can both tolerate and requires more weekly volume for continued adaptation).
**If wrong:** a generated program under- or over-shoots the weekly volume a lifter at that
experience level would typically respond well to — again a perceived-quality effect, since
Phase 8's progression rules operate on top of whatever starting prescription is set here.

## `REP_RANGE_BY_GOAL`

| Goal | Rep range |
|---|---|
| `strength` | 4-6 |
| `hypertrophy` | 8-12 |
| `endurance` | 15-20 |

**Literature anchor:** NSCA-style %1RM-to-rep-range mapping (roughly 1-5 / 6-12 / 15+ reps for
strength/hypertrophy/endurance intents) — this project's bands are informed by, but not identical
to, that mapping (Assumptions Log A3).
**If wrong:** a generated program's rep target feels mismatched to the stated goal (e.g. a
"strength" program that reads more like a hypertrophy block) — a perceived-fit issue, not a
correctness failure, since Phase 8's `widen_rep_range_first` preference already tolerates a range
of rep targets.

## `REST_SECONDS_BY_GOAL`

| Goal | Rest (seconds) |
|---|---|
| `strength` | 180 |
| `hypertrophy` | 120 |
| `endurance` | 60 |

**Literature anchor:** the same NSCA-style goal-to-rep-range mapping above conventionally pairs
longer rest with lower rep/heavier-load work and shorter rest with higher-rep work.
**If wrong:** `estimateSlotMinutes`'s session-length trimming becomes slightly more or less
aggressive than intended — a session-fit effect, not a correctness failure.

## `RIR_PROGRESSION`

`[3, 2, 1, 1]`, indexed by training-cycle position within a block and floored at its final member
for any cycle index past the end (Assumptions Log A4).

| Cycle index | RIR |
|---|---|
| 0 | 3 |
| 1 | 2 |
| 2 | 1 |
| 3+ | 1 |

**Literature anchor:** descending-RIR-within-a-block autoregulation — starting a block further
from failure and progressively autoregulating closer to it. This project's ladder floors at 1
rather than extending to a true 0 RIR that some sources describe, a deliberate simplification.
**If wrong:** later training cycles in a generated block feel easier or harder than a hand-authored
equivalent would have specified — a perceived-difficulty effect.

## `EMPHASIS_MULTIPLIERS`

| Level | Multiplier |
|---|---|
| `deprioritize` | 0.7 |
| `normal` | 1.0 |
| `emphasize` | 1.3 |

**Literature anchor:** not literature-derived — a project-authored proportional adjustment, chosen
so that `deprioritize`/`emphasize` produce a clearly perceptible but not extreme shift, always
re-clamped to `[mev, mav]` by `applyEmphasis` so neither direction can push a muscle group outside
its already-literature-informed band.
**If wrong:** emphasis feels too subtle or too aggressive relative to what a lifter expects from
"deprioritize"/"emphasize" — a perceived-strength-of-effect issue; it can never push a group past
its landmark bounds regardless, since the clamp is unconditional.

## `DELOAD_SET_MULTIPLIER` and `DELOAD_RIR_INCREMENT`

| Constant | Value |
|---|---|
| `DELOAD_SET_MULTIPLIER` | 0.5 |
| `DELOAD_RIR_INCREMENT` | +2 |

**Literature anchor:** conventional deload-week guidance (roughly half volume, meaningfully more
reps in reserve) rather than a specific cited source.
**If wrong:** a deload week feels too light or not light enough relative to a hand-authored
deload — a perceived-recovery-value issue, not a correctness failure (the deload still trains the
same exercises on the same days, per D-20).

## `WORK_SECONDS_PER_SET` and `SESSION_OVERHEAD_MINUTES`

| Constant | Value |
|---|---|
| `WORK_SECONDS_PER_SET` | 45 seconds |
| `SESSION_OVERHEAD_MINUTES` | 10 minutes |

**Literature anchor:** not literature-derived — this project's own estimate of time actually under
load plus transition between sets, and of warm-up/changeover/gym-floor overhead.
**If wrong:** `trimToSessionLength` trims more or fewer exercises than a lifter's actual session
pace would need — a session-length-estimate accuracy issue, never a correctness failure, since the
trimmer never reduces a surviving slot's own prescribed sets (D-14).
