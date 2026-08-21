# Program Vocabularies Reference

Reference for the closed vocabularies that describe a `routine`'s lifecycle (D-13/D-15). Each
vocabulary is defined once in `packages/api-contracts/src/program.ts`, enforced in Postgres by a
CHECK constraint (`apps/api/src/db/schema/program.ts`), and validated on write in
`sync.service.ts`, matching the pattern `docs/catalog-load-types.md` established for
`load_type`.

## `ROUTINE_STATUSES`

| Value | Meaning | Transitions to |
|---|---|---|
| `draft` | Being authored; may still be incomplete (no days, no exercises, unset targets) | `ready` |
| `ready` | Fully authored and eligible to be activated | `draft` (unusual — reopened for editing) |

`ROUTINE_STATUSES = ['draft', 'ready']` is deliberately closed to exactly these two values,
enforced by the `routine_status_check` Postgres CHECK constraint. The seed script and any direct
SQL bypass `sync.service.ts`'s application-level validator entirely, so this constraint — not the
validator — is the real backstop.

## Active, frozen and archived are not statuses

Three lifecycle facts about a routine sound like they could be `status` values, and are
deliberately not:

| Fact | Lives in | Not in `routine.status` because |
|---|---|---|
| **Active** (the one program a user is currently running) | `user_preference.active_routine_id` (D-14) | Two devices activating different programs offline would both push `status = 'active'` on their own routine row. Row-level LWW resolves each row independently — it has no way to know a second row also claims `'active'` — so both rows would land as `'active'` and two programs would be active at once. A single nullable column on one `user_preference` row makes a second active pointer structurally unrepresentable: the second push simply overwrites the first, and exactly one program ends up active regardless of push order. |
| **Frozen** (progression stops moving this routine's prescriptions) | `routine.progression_frozen` (D-16) | A program is frequently both active and frozen at the same time — pausing progression mid-block without deactivating it. One status enum cannot hold two independent boolean facts simultaneously; an independent column can. |
| **Archived** (removed from the active list, history preserved) | `routine.archived_at` (D-05) | Archiving already has an established, working pattern on this exact table (`exercise.archived_at`'s sibling) that preserves logged history without a hard delete. Reusing it for `routine` avoids reinventing archive semantics as a third status value. |

If a partial unique index were used instead to enforce "at most one active routine per user"
directly on `routine.status = 'active'`, a sync push naming a second `'active'` row would be
**rejected** by that index rather than silently overwritten — which would jam the client's
upload queue on a legitimate offline write instead of quietly resolving to the last writer. The
pointer design avoids this failure mode entirely: a `user_preference` PUT is never rejected for
racing another device's activation, it just loses (or wins) last-write-wins on one row.

## `CYCLE_KINDS`

A cycle is a first-class, orderable row on the `routine_cycle` table — a child of `routine`,
resolved through `routine.user_id` exactly as `routine_day` and `routine_exercise` are, and never
a per-week copy of the day/exercise tree (D-09). `CYCLE_KINDS = ['training', 'deload', 'time_off']`
is deliberately closed to exactly these three values, enforced by the `routine_cycle_kind_check`
Postgres CHECK constraint.

| Value | Meaning | Trained? | `duration_days` applies? |
|---|---|---|---|
| `training` | A regular training cycle | Yes | No — length is the routine's own day rotation, not a stored number |
| `deload` | A lighter week the lifter still trains (PROG-05) | Yes | No — same reason as `training` |
| `time_off` | Planned time off from training (PROG-06) | No | Yes — the only kind that stores a length, in whole days |

**Position is not a kind.** A deload placed at the start of the program (PROG-05's "Deload First
Cycle") is a `deload` cycle at `order_index` 0; a deload at the end ("Deload Last Cycle") is the
same kind at the highest `order_index` in the routine's cycle sequence. There is no `first_deload`
or `last_deload` value, and no separate position column — `order_index`, the same column every
other ordered child table in this schema already uses, is where "start or end" lives.

**A cycle owns no children.** `routine_exercise_cycle_target` (04-07) points at a cycle to carry a
per-cycle override, but `routine_cycle` itself never multiplies the day/exercise tree — a program
with zero cycles is valid (every exercise resolves to its base prescription), and a program with
exactly one cycle is valid and offers no previous or next cycle.
