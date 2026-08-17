# Deferred Items

Out-of-scope discoveries logged during execution, per the executor's scope-boundary rule
(only auto-fix issues directly caused by the current task's changes; log the rest here rather
than fixing them).

## 02-10 — recurring `drizzle-kit push` drift on unrelated tables

**Found during:** Task 3 (`pnpm --filter api db:push`), plan 02-10.

**Observation:** Every invocation of `drizzle-kit push` against the live dev Postgres instance —
including a clean re-run immediately after a prior push reported "Changes applied" — reports and
re-applies the same batch of statements, unrelated to `logged_set.weight_kg`:

```
ALTER TABLE "workout_session" ALTER COLUMN "server_seq" SET DEFAULT nextval('sync_seq');
ALTER TABLE "personal_record" ALTER COLUMN "server_seq" SET DEFAULT nextval('sync_seq');
ALTER TABLE "exercise" ALTER COLUMN "server_seq" SET DEFAULT nextval('sync_seq');
ALTER TABLE "progress_photo" ALTER COLUMN "server_seq" SET DEFAULT nextval('sync_seq');
ALTER TABLE "equipment_profile" ALTER COLUMN "server_seq" SET DEFAULT nextval('sync_seq');
ALTER TABLE "body_metric" ALTER COLUMN "server_seq" SET DEFAULT nextval('sync_seq');
ALTER TABLE "routine" ALTER COLUMN "server_seq" SET DEFAULT nextval('sync_seq');
ALTER TABLE "user_preference" ALTER COLUMN "server_seq" SET DEFAULT nextval('sync_seq');
ALTER TABLE "exercise_muscle_mapping" DROP CONSTRAINT "exercise_muscle_mapping_exercise_id_muscle_group_id_pk";
ALTER TABLE "exercise_muscle_mapping" ADD CONSTRAINT "exercise_muscle_mapping_exercise_id_muscle_group_id_pk" PRIMARY KEY("exercise_id","muscle_group_id");
```

**Assessed impact:** Semantically a no-op each time (re-setting an identical `nextval('sync_seq')`
default expression; dropping and immediately recreating an unchanged composite primary key).
Confirmed non-destructive — `exercise_muscle_mapping` held 0 rows throughout, and no column type,
precision, or nullability changed on any of the listed tables. Almost certainly a Drizzle
introspection quirk: Postgres's catalog representation of a `nextval(...)` default expression and
of a composite PK constraint doesn't byte-match what Drizzle derives from the schema file, so
`drizzle-kit push` perpetually detects "drift" that isn't a real schema difference.

**Why deferred, not fixed:** Unrelated to `logged_set.weight_kg` and CR-02; none of the eight
tables involved are touched by this plan's `files_modified`. Root-causing a Drizzle
introspection/normalization mismatch is its own investigation, not a one-line fix alongside a
nullability change.

**Suggested follow-up:** A small phase (or a task folded into the next schema-touching plan) that
either (a) confirms this is purely cosmetic and safe to ignore, or (b) finds the schema-file
change (e.g. an explicit `sql` default expression matching Postgres's normalized form, or ordering
columns in the composite PK identically to how Postgres reports them) that makes `drizzle-kit
push` converge to "no changes" on a clean re-run.
