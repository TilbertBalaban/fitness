# Catalog `load_type` Reference

Six mutually exclusive values, defined once in `packages/api-contracts/src/catalog.ts`'s
`LOAD_TYPES` tuple and enforced in two places: the Postgres `exercise_load_type_check` CHECK
constraint (`apps/api/src/db/schema/catalog.ts`) and application-level validation on write (added
when `exercise` writes flow through `sync.service.ts`). Every exercise row — seeded and custom —
carries exactly one value. There is no second axis: the phase's Task 1 checkpoint locked a single
flat six-value enum (`flat-six`, RESEARCH.md Pattern 4) over a two-axis (resistance-source x
measured-quantity) alternative, human-confirmed rather than auto-selected.

| Value | Meaning | Canonical example | `bodyweight_contribution_pct` | Phase 5 logging input |
|---|---|---|---|---|
| `external_weight` | Resistance comes entirely from an external load (barbell, dumbbell, machine stack, plate) | Barbell Back Squat | `null` — irrelevant | Weight lifted (kg) |
| `bodyweight` | The lifter's own bodyweight is the entire resistance, no added or subtracted load | Pull-Up | Per-exercise fraction of bodyweight the movement loads; seed default `1.000` | Reps only — weight is derived from `bodyweight_contribution_pct × bodyweight-at-time-of-set` |
| `bodyweight_plus_added` | Bodyweight plus an added external load (weighted vest, dip belt) | Weighted Pull-Up | Same as `bodyweight` — the bodyweight portion still needs the fraction; added load is entered separately | Added weight (kg) + reps; total effective load combines both |
| `assisted` | A machine or band subtracts from bodyweight (assisted dip/pull-up stack) | Assisted Dip | Fraction of bodyweight the movement loads before assistance is subtracted; seed default `0.950` | Assistance amount (kg, subtracted) + reps |
| `time_based` | Progression is tracked by duration held/performed, not reps | Plank | `null` unless a bodyweight-loaded hold (e.g. weighted plank) — seed default `null` for pure holds | Duration (seconds) |
| `distance_based` | Progression is tracked by distance covered | Sled Push | `null` — see the dual-axis resolution rule below; a genuinely non-loaded distance movement would carry a real fraction if one is added | Distance (meters) + duration |

## Dual-axis resolution rule

A movement that is arguably both loaded and distance/time-measured (a farmer's carry is both
loaded and distance-measured) is classified by whichever axis actually varies session-to-session
and drives progression math. For a farmer's carry that is the load, so `external_weight`, with
distance and time captured as instruction/cue text (`instructions_text`/`cue_text`), never as a
second discriminator column. This mirrors RESEARCH.md Pattern 4's own resolution and the Task 1
checkpoint's accepted rationale; it is not a per-row judgment call left open for the seed script
(03-04/03-05) to reinterpret differently per exercise.

## `bodyweight_contribution_pct` semantics

- **What it stores:** the fraction of the lifter's bodyweight that loads the movement — `1.000`
  for a strict bodyweight movement (pull-up), a partial fraction for an assisted or
  leverage-reduced variant, `null` where the concept does not apply (`external_weight`,
  `time_based`/`distance_based` movements with no bodyweight component).
- **What it does NOT do (yet):** compute an effective historical load. Converting this fraction
  into a real kg figure requires joining the lifter's `body_metric` (bodyweight) at or near the
  time of the logged set — whether that join happens at read time or is snapshotted onto the set
  when logged is explicitly Phase 5's decision, per ROADMAP criterion 4 ("before any logging UI
  exists") and by the same reasoning D-05 already applied to prescriptions (snapshot-on-use, not
  live re-read). This phase only makes the number storable and honest.
- **Where it lives:** `exercise.bodyweight_contribution_pct` — Postgres `numeric(4,3)`, SQLite
  mirror as an exact-string `text` column (same decimal-as-string convention `weight_kg` and
  `weight_factor` already follow, per `apps/mobile/lib/db/schema.ts`'s header comment).

## Per-family seed defaults (for 03-04/03-05 to normalize against)

| `load_type` | Default `bodyweight_contribution_pct` | Override when |
|---|---|---|
| `external_weight` | `null` | Never — always null for this family |
| `bodyweight` | `1.000` | A leverage-reduced bodyweight variant (e.g. bent-knee vs. straight-leg movements) reduces the effective fraction below 1.0 |
| `bodyweight_plus_added` | `1.000` for the bodyweight portion | Same override rule as `bodyweight`; the added-load portion is always entered separately at log time, never folded into this column |
| `assisted` | `0.950` | Individual assisted machines vary; the seed default (matching the tracer snapshot's Assisted Dip row) is a starting point for 03-05's per-exercise review, not a value every assisted row should carry unexamined — see PITFALLS.md's warning against uniform 1.0/0.5-style constants applied without per-exercise judgment |
| `time_based` | `null` | A weighted hold (e.g. a weighted plank) sets this to a real fraction |
| `distance_based` | `null` | See the dual-axis resolution rule above — a genuinely non-loaded distance movement would set this if one is ever added to the catalog |
