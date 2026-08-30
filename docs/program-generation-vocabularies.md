# Program Generation Vocabularies Reference

Reference for the five closed vocabularies `packages/api-contracts/src/generation.ts` declares:
`TRAINING_GOALS`, `EXPERIENCE_LEVELS`, `SPLIT_PREFERENCES`, `DELOAD_PLACEMENTS` and
`EMPHASIS_LEVELS`. Each is defined once, as an additive-only `as const` tuple, in
`packages/api-contracts/src/generation.ts`.

## A deliberate asymmetry with `docs/catalog-load-types.md`

`docs/catalog-load-types.md`'s own header names four enforcement layers for a closed vocabulary:
the api-contracts tuple, a Postgres CHECK constraint, `sync.service.ts` application-level
validation on write, and a `docs/` reference. **The five vocabularies below get only the first and
the last of those four layers — the tuple, and this document. There is no Postgres CHECK and no
`sync.service.ts` branch for any of them.**

That asymmetry is deliberate, not an oversight: every other closed vocabulary in this project
(`ROUTINE_STATUSES`, `CYCLE_KINDS`, `LOAD_TYPES`) is the value of a synced database column, so a
malformed or out-of-band write needs a database-level backstop independent of whichever client
produced it. These five vocabularies are never that. They are parameters to `generateProgram`, a
pure function inside `@fitness/program-generator` — they exist only for the duration of one call,
inside a `GenerationInput` object, and never cross the sync boundary as a column value. There is no
row to validate on write because there is no row. The runtime backstop that exists instead is
`isGenerationInput` (`packages/program-generator/src/result.ts`), which rejects a malformed
`GenerationInput` — including an out-of-vocabulary value on any of these five fields — before any
candidate-pool or slot-filling work runs (T-11-05).

## `routine.goal` is not this vocabulary

`routine.goal` is a pre-existing free-text display column, unrelated to `TrainingGoal`. It has
existed since Phase 4, is passed through `createRoutine`/`duplicateRoutine`/`loadProgramTree`
unchanged and unvalidated, and is used today purely as an optional human-readable label (e.g. a
routine named "PPL — Summer Block" might carry `goal: "Hypertrophy"` as a caption). `generateProgram`
writes a human-readable label into this same column (via `GeneratedProgramTree.goal`), but that
write is display-only. **A code path that reads `routine.goal` back out and branches generation
behaviour on it is a bug** — the two are different values with different lifetimes: `TrainingGoal`
lives only inside the input to one `generateProgram` call, while `routine.goal` is a column on an
ordinary, indefinitely-lived program row that a user can freely rename regardless of how (or
whether) the program was generated.

## `TRAINING_GOALS`

| Value | Meaning |
|---|---|
| `strength` | Lower rep ranges (4-6), longer rest, RIR progression favouring heavier top sets |
| `hypertrophy` | Moderate rep ranges (8-12), moderate rest |
| `endurance` | Higher rep ranges (15-20), short rest |

Drives `REP_RANGE_BY_GOAL` and `REST_SECONDS_BY_GOAL` (`packages/program-generator/src/volume-landmarks.ts`).

## `EXPERIENCE_LEVELS`

| Value | Meaning |
|---|---|
| `beginner` | Lowest MEV/MAV volume-landmark bands |
| `intermediate` | Middle bands |
| `advanced` | Highest bands |

Drives `EXPERIENCE_VOLUME_BAND` (`packages/program-generator/src/volume-landmarks.ts`).

## `SPLIT_PREFERENCES`

| Value | Meaning |
|---|---|
| `auto` | The generator picks the template that best fits the chosen days per week — table lookup via `AUTO_SPLIT_BY_DAYS`, never scoring |
| `full_body` | Every training day trains the whole body |
| `upper_lower` | Alternating upper-body and lower-body days |
| `push_pull_legs` | Rotating push, pull and legs days |

Resolved against `SPLIT_TEMPLATES` by `resolveSplitTemplate` (`packages/program-generator/src/split-templates.ts`).
This plan populates `full_body` templates for 2, 3 and 4 days per week; `upper_lower` and
`push_pull_legs` are declared as empty records with the same shape, populated by 11-04.

## `DELOAD_PLACEMENTS`

| Value | Meaning |
|---|---|
| `none` | Every training cycle is a full training cycle; no deload is inserted |
| `every_n_cycles` | A deload cycle is inserted after every N training cycles (N from `deloadEveryNCycles`) |
| `final_cycle_only` | Exactly one deload cycle is appended after the last training cycle |

Consumed by `placeCycles` (`packages/program-generator/src/deload.ts`). A deload is emitted using
the existing `CYCLE_KINDS` vocabulary (`kind: 'deload'`) — this phase introduces no fourth cycle
kind.

## `EMPHASIS_LEVELS`

| Value | Meaning | Multiplier |
|---|---|---|
| `deprioritize` | Reduce this muscle group's weekly sets, never below its band's `mev` | 0.7 |
| `normal` | No adjustment | 1.0 |
| `emphasize` | Increase this muscle group's weekly sets, never above its band's `mav` | 1.3 |

Applied per muscle group by `applyEmphasis` (`packages/program-generator/src/emphasis.ts`), which
multiplies and clamps to `[mev, mav]` in one expression — an emphasized group can never be
prescribed past its adaptive maximum, and a deprioritized group is never dropped below its
minimum-effective bound.

## Split templates

Which `(splitPreference, daysPerWeek)` pairs the generator can build a week for. A supported cell
resolves to a declared template naming an ordered day pattern and each day's muscle-group slots; a
not-supported cell resolves to an explicit `unsupported` resolution that `generateProgram` turns
into a `split_unsupported` degradation entry.

| preference | 2 days | 3 days | 4 days | 5 days | 6 days |
|---|---|---|---|---|---|
| `full_body` | supported | supported | supported | not supported — a five-day full-body week leaves no muscle group a recovery day | not supported — same reason, more so |
| `upper_lower` | supported | supported | supported | supported | supported |
| `push_pull_legs` | not supported — a three-way rotation cannot fit two training days without dropping a third of it | supported | supported | supported | supported |

The three not-supported pairs are declared in `UNSUPPORTED_SPLIT_PAIRS`, not merely absent from the
table, so a test can read them rather than infer them from a missing key.

### `AUTO_SPLIT_BY_DAYS`

`auto` is the default preference, so a user can answer only goal, experience level and days per week
and still get a sensible program.

| days per week | resolves to |
|---|---|
| 2 | `full_body` |
| 3 | `full_body` |
| 4 | `upper_lower` |
| 5 | `push_pull_legs` |
| 6 | `push_pull_legs` |

**`auto` is a lookup, not a heuristic.** With exactly one declared entry per day count there is no
tie to break, so the same inputs always produce the same week — on any device, in any order, on any
run. A ranking function over candidate splits would reintroduce the non-determinism D-03 rules out,
and would leave the user with a week nobody can explain.

**An unsupported pair degrades and reports; it never substitutes.** A day count outside the table
resolves `unsupported` rather than snapping to the nearest count that does have an entry. Handing
someone a four-day program because they asked for seven is the silent substitution D-21 forbids —
the generator says what it could not build and why.

`packages/program-generator/src/__tests__/split-contract.test.ts` keeps this matrix honest. It
enumerates every `(preference, daysPerWeek)` pair from the `SPLIT_PREFERENCES` tuple and
`GENERATION_INPUT_LIMITS` at runtime, so a preference added to the vocabulary later with neither a
template nor an unsupported declaration turns the suite red instead of resolving to nothing.
