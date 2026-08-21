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

## Target resolution

`routine_exercise` keeps its five `target_*` columns as the single mutable base prescription for
an exercise. `routine_exercise_cycle_target` is a sparse override table: a row exists only where a
cycle's prescription actually differs from the base, never once per cycle per exercise — building
a six-week program with one heavier week creates a handful of override rows, not six copies of the
exercise tree (D-02's ban on per-week duplication). It hangs off **two** parents at once
(`routine_exercise_id` and `cycle_id`), the only dual-parent chain in this schema; both must
independently resolve to the same routine before a sync push applies it.

Resolution runs through exactly one exported function, `resolveTarget` in
`packages/api-contracts/src/program.ts`, imported by the builder's cycle strip, the Home tab's
next-up card and `log-set.ts`'s session snapshot — never reimplemented at any of those three call
sites. It resolves per field, not per row: `override.targetSets ?? base.targetSets`, independently
for each of the five columns. A null override field means **inherit from the base**, never "clear
the prescription" — clearing a prescription is done on the base row itself. A cycle with no
override row at all resolves identically to `resolveTarget(base, null)`, which returns the base
unchanged; there is no special case for "no override."

Phase 8's progression engine writes to future cycle overrides only — never the base row, never a
past or current cycle — gated by `routine.progression_frozen` (D-17). That contract is fixed now,
in writing, because it is what gives PROG-10 a concrete meaning; Phase 8 finalises the rule, not
the target it writes to.

## Snapshot on use (PROG-11)

A logged workout is a record of what happened, not a projection of what the program currently
says. That is one mechanism, not a feature: `addSessionExercise`
(`apps/mobile/lib/db/log-set.ts`) resolves the prescription **once**, at the instant an exercise
is added to a session, and copies the five resolved values onto `session_exercise`'s own
`target_*` columns. Resolution runs through `resolveTarget` with the session's cycle — base row
plus that cycle's override, in two selects — so what freezes is exactly what the builder was
showing. Nothing re-reads `routine_exercise` or `routine_exercise_cycle_target` for a session
afterwards; every later read of a logged prescription reads the snapshot.

| Frozen | Where | When |
|---|---|---|
| `target_sets`, `target_rep_min`, `target_rep_max`, `target_rir`, `target_rest_seconds` | `session_exercise` | Once, at session-exercise creation |

**Two columns deliberately carry no foreign key**, and this is what makes the guarantee hold in
the database rather than only in the client:

| Column | Points at | Why no FK |
|---|---|---|
| `session_exercise.routine_exercise_id` | `routine_exercise.id` | Traceability only. With an FK, deleting an exercise from a program would either cascade a logged session's row away or be blocked outright — a legitimate program edit turned into data loss or a wall. |
| `workout_session.routine_day_id` | `routine_day.id` | Same. Deleting a day must stay a free edit; the session keeps the now-dangling id rather than losing its own row. |

Both are plain `text` columns in `apps/api/src/db/schema/session.ts`. Adding a real foreign key
to either one "for referential integrity" would trade an edit users expect to be free for either
a cascade that destroys history or a constraint violation that blocks the edit. There is no
routine version tree, revision history or copy-on-edit scheme anywhere in this schema — the
snapshot is the whole mechanism, and a second one would contradict it. Both halves are asserted:
`apps/mobile/lib/db/__tests__/log-set.test.ts`'s `PROG-11` block proves the client never
re-derives a snapshot, and `apps/api/test/program-sync.e2e-spec.ts`'s `PROG-11` block proves
Postgres never destroys one.
