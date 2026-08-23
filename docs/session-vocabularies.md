# Session Vocabularies Reference

Reference for the closed vocabularies Phase 5 introduces for in-gym session logging (D-09). Each
vocabulary is defined once in `packages/api-contracts/src/session.ts`, enforced in Postgres by a
CHECK constraint (`apps/api/src/db/schema/session.ts` and `apps/api/src/db/schema/records.ts`),
and — from 05-03 onward — validated on write in `sync.service.ts`, matching the pattern
`docs/program-vocabularies.md` established for `routine.status` and `routine_cycle.kind`.

## `WORKOUT_SESSION_STATUSES`

| Value | Meaning | Where it's written |
|---|---|---|
| `in_progress` | An active, unpaused workout | Session start, resume from pause |
| `paused` | A deliberate pause the lifter initiated (D-29) | Pause action |
| `completed` | A finished workout | Session finish |
| `discarded` | Discarded via the discard banner (D-28) | Discard action |

`WORKOUT_SESSION_STATUSES = ['in_progress', 'paused', 'completed', 'discarded']` is deliberately
closed to exactly these four values, enforced by the `workout_session_status_check` Postgres CHECK
constraint. There is **no automatic timeout-based abandoned state** — a session that is simply
left open never transitions on its own. The seed script and any direct SQL bypass
`sync.service.ts`'s application-level validator entirely, so this constraint — not the validator —
is the real backstop.

Pause is accounted for with a pair of columns on `workout_session`, not a single elapsed
subtraction: `paused_at` (nullable timestamp, set while paused) and
`accumulated_paused_seconds` (integer, not null, default 0, incremented on resume). Displayed
duration is always derived from `started_at` minus the accumulated pause total, so a session that
was paused and resumed multiple times still reports correct elapsed time. Two devices
concurrently toggling pause on the same session is a genuine row-level last-write-wins race on
this pair — accepted as identical in kind to every other column on `workout_session`, not a new
risk this phase introduces.

## `SET_TYPES`

| Value | Meaning | Written by Phase 5? |
|---|---|---|
| `normal` | A working set (`WORKING_SET_TYPE`) | Yes |
| `warmup` | A warm-up set (`WARMUP_SET_TYPE`) | Yes |
| `drop` | A drop set | Reserved for Phase 7 |
| `myorep` | A myorep set | Reserved for Phase 7 |
| `partial` | A partial-rep set | Reserved for Phase 7 |
| `failure` | A to-failure set | Reserved for Phase 7 |
| `amrap` | An as-many-reps-as-possible set | Reserved for Phase 7 |

`SET_TYPES = ['normal', 'warmup', 'drop', 'myorep', 'partial', 'failure', 'amrap']` is deliberately
closed to exactly these seven values, enforced by the `logged_set_set_type_check` Postgres CHECK
constraint. `sync.service.ts` already anticipated all seven literals before this phase — this
phase formalises the existing vocabulary as a published `@fitness/api-contracts` tuple rather than
inventing a new one. **This phase's UI only ever writes `normal` and `warmup`**; the remaining five
values are reserved and unwritten until Phase 7 wires drop sets, myoreps, partials, failure sets
and AMRAP sets into the logging UI.

## `PR_TYPES`

| Value | Meaning |
|---|---|
| `heaviest_weight` | Heaviest weight ever lifted for an exercise |
| `best_e1rm` | Best estimated one-rep max |
| `most_reps_at_weight` | Most reps performed at a given weight |
| `best_set_volume` | Best single-set volume (weight × reps) |

`PR_TYPES = ['heaviest_weight', 'best_e1rm', 'most_reps_at_weight', 'best_set_volume']` is
deliberately closed to exactly these four values — the four types D-30 detects — enforced by the
`personal_record_pr_type_check` Postgres CHECK constraint.

## Notes columns

Three independent, nullable `text('notes')` columns exist on `workout_session`, `session_exercise`
and `logged_set` — one note per entity instance, matching every other per-row annotation already in
this schema (`routine_exercise.notes`, `exercise.cue_text`). There is no note table and no join: a
write to one entity's `notes` column reads or writes neither of the other two (LOG-16). An empty
string is normalised to SQL `NULL` before the write, so absence of a note has exactly one
representation.

## `session_exercise.removed_at`

Mid-workout removal of an exercise from a session is non-destructive: `session_exercise` gains a
nullable `removed_at` timestamp instead of being deleted, so sets already logged against a removed
exercise stay queryable in history (LOG-14).

## `user_preference.auto_advance_enabled` / `user_preference.warmup_sets_enabled`

Two independent `boolean('...').notNull().default(true)` columns on the already-wired
`user_preference` singleton root (LOG-13, LOG-17) — no new table. Both default to `true`, so a
`user_preference` row written before these columns existed reads `true` on both, and a user with no
`user_preference` row at all reads the same default rather than `undefined`. Writing one flag
leaves the other's value unchanged.

## `workout_session.rest_target_at`

A nullable wall-clock timestamp, not a countdown value: the client recomputes remaining rest time
from this target on every foreground, so a stored remaining-seconds number is never wrong the
instant the app is backgrounded (D-21, PITFALLS §6). Extend and skip actions rewrite this same
column rather than a derived duration.

## `workout_session.name`

A nullable text column so a past workout can be renamed. A `null` name is the normal case — the
History row falls back to the session's stamped `local_date` rather than rendering blank or a
generated placeholder (LOG-20).
