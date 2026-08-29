# Excluded Exercise Shape Reference

Reference for `excluded_exercise` (11-02, GEN-03/D-10): a synced row-per-exercise table recording
that a user will never train a given exercise. Defined once in
`apps/api/src/db/schema/catalog.ts`, registered in `packages/api-contracts/src/sync.ts` and
`apps/api/src/sync/sync.service.ts`, and delivered per-user through `ops/powersync/sync-rules.yaml`
— the same four-layer enforcement pattern `docs/equipment-profile-shape.md` and
`docs/program-vocabularies.md` describe for other synced shapes.

## What one row means

One `excluded_exercise` row means: this user will never train this exercise, recorded at this
time. It carries no reason, no expiry and no scope beyond the (user, exercise) pair — an exclusion
is a fact about the user (D-11), not about a program, a gym or a training cycle.

## Column table

| Column | Type | Nullable | Absent-value meaning |
|---|---|---|---|
| `id` | text (client-generated UUID) | No | Not applicable — required. Single TEXT PRIMARY KEY, not a composite key on `(user_id, exercise_id)`: `SyncService.applyBatch` resolves every row as `eq(table.id, op.id)`, and PowerSync's local schema gives every managed table one id column, so a composite PK would be unwritable through the sync path. |
| `user_id` | text, FK → `user.id`, `ON DELETE CASCADE` | No | Not applicable — required, and always derived from the authenticated session, never from the payload (see "Enforcement" below). |
| `exercise_id` | text, FK → `exercise.id`, `ON DELETE CASCADE` | No | Not applicable — required. Identity on this table: an op naming a different `exercise_id` against an existing row id is a different row, not an edit of this one. |
| `created_at` | timestamp | No, defaults to `now()` | Not applicable — always set, either from the client-supplied `created_at` or a fresh timestamp if absent. |
| `server_seq` | bigint | No, defaults to `nextval('sync_seq')` | Not applicable — server-assigned on every insert and every conflict-resolving update. |

There is deliberately **no `archived_at` and no `never_suggest`** — the two columns
`user_exercise_preference` carries that `excluded_exercise` does not. Un-excluding an exercise is a
hard DELETE of its row, not an archive/restore toggle; there is no "archived-but-excluded" state to
represent.

## Enforcement layers

| Layer | Owns |
|---|---|
| Postgres `unique('excluded_exercise_user_exercise_unique')` on `(user_id, exercise_id)` | "One row per user per exercise" as a database invariant, not merely a convention. |
| `apps/api/src/sync/sync.service.ts`'s `hasInvalidField` `excluded_exercise` branch | Payload validation: `exercise_id` must be a non-empty string. |
| `apps/api/src/sync/sync.service.ts`'s `toExcludedExerciseValues` | Ownership: `user_id` always comes from the authenticated session argument, never from client-supplied `data`, mirroring `toUserExercisePreferenceValues`. |
| `ops/powersync/sync-rules.yaml`'s `excluded_exercise` query, scoped `WHERE user_id = auth.user_id()` | Per-user delivery: a row leaving this query's result set is deleted from every device that is not its owner's. |

## No Postgres CHECK

Unlike `load_type` or the `routine`/`routine_cycle` vocabularies (`docs/catalog-load-types.md`,
`docs/program-vocabularies.md`), `excluded_exercise` carries no CHECK constraint. There is no
closed-vocabulary column here to constrain — `exercise_id` is validated by its foreign key and by
`hasInvalidField`'s non-empty-string guard, not by membership in a fixed literal set.

## Un-excluding is a hard delete, on purpose

`excluded_exercise` is deliberately absent from `HARD_DELETE_FORBIDDEN`
(`apps/api/src/sync/sync.service.ts`), for the same reason `user_exercise_preference` is: clearing
an exclusion by deleting its row is the legitimate un-exclude action, not a loss of history that
some other table references by id. A DELETE op against an owned `excluded_exercise` row applies
rather than rejecting.

## Scope: user-level and global

Exclusions are **user-level and global** — not per-program and not per-gym (D-11). The table
carries no gym id and no routine id, and no scoping question beyond `user_id` is asked at any
layer. A future reader who finds a use case that seems to want per-program or per-gym exclusions
should not add a scoping column here to "fix" it — that would reopen a question D-11 already
closed: an exercise the user cannot or will not do is a fact about the user, true everywhere they
train.
