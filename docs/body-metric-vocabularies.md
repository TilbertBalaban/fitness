# Body Metric Vocabularies Reference

Reference for `body_metric` (BODY-01/BODY-02, D-01/D-05/D-06/D-08): a synced row-per-entry table
recording a bodyweight or a named measurement, logged at a point in time. Defined once in
`apps/api/src/db/schema/records.ts`, registered in `packages/api-contracts/src/sync.ts` and
`apps/api/src/sync/sync.service.ts`, and delivered per-user through `ops/powersync/sync-rules.yaml`
— the same four-layer enforcement pattern `docs/excluded-exercise-shape.md` and
`docs/program-vocabularies.md` describe for other synced shapes.

## What one row means

One `body_metric` row means: this user recorded this value, for this kind, at this time. Bodyweight
is not a special case — it is one `kind` among the measurement kinds, stored in the same table
(D-05). BODY-01 and BODY-02 differ only in which `kind` is being written; there is no separate
bodyweight table.

## Column table

| Column | Type | Nullable | Absent-value meaning |
|---|---|---|---|
| `id` | text (client-generated UUID) | No | Not applicable — required. |
| `user_id` | text, FK → `user.id`, `ON DELETE CASCADE` | No | Not applicable — required, and always derived from the authenticated session, never from the payload (see "Enforcement" below). |
| `kind` | text | No | Not applicable — required. Drawn from the closed `BODY_METRIC_KINDS` vocabulary below; genuinely client-patchable (D-10), not identity. |
| `value` | `numeric(10,3)` on Postgres, `text` on client SQLite | No | Not applicable — required. Carried as a decimal string on the wire and in client storage (D-03) — never a binary float. Its unit is fixed by `kind`, per `BODY_METRIC_CANONICAL_UNIT` below. |
| `recorded_at` | timestamp | No | Not applicable — always set, either from the client-supplied `recorded_at` or a fresh timestamp if absent. |
| `timezone` | text | No | Not applicable — captured by `captureCalendarDay` (D-04), the same helper every session write uses. |
| `local_date` | date | No | Not applicable — captured alongside `timezone` by `captureCalendarDay`; never re-derived from `recorded_at` on a later read. |
| `server_seq` | bigint | No, defaults to `nextval('sync_seq')` | Not applicable — server-assigned on every insert and every conflict-resolving update. |

Multiple entries per kind per day are allowed and all are kept (D-09) — logging a second bodyweight
the same day inserts a second row rather than overwriting or rejecting the first. A trend series
reads the latest entry per `local_date` per kind; it does not deduplicate at the storage layer.

## `BODY_METRIC_KINDS`

`BODY_METRIC_KINDS` is deliberately closed to exactly these fifteen values, in this exact order
(`packages/api-contracts/src/body-metrics.ts`):

| Kind | Display label (`BODY_METRIC_KIND_LABELS`) | Canonical unit (`BODY_METRIC_CANONICAL_UNIT`) |
|---|---|---|
| `bodyweight` | Weight | `kg` |
| `neck` | Neck | `cm` |
| `shoulders` | Shoulders | `cm` |
| `chest` | Chest | `cm` |
| `left_bicep` | Left Bicep | `cm` |
| `right_bicep` | Right Bicep | `cm` |
| `left_forearm` | Left Forearm | `cm` |
| `right_forearm` | Right Forearm | `cm` |
| `waist` | Waist | `cm` |
| `hips` | Hips | `cm` |
| `left_thigh` | Left Thigh | `cm` |
| `right_thigh` | Right Thigh | `cm` |
| `left_calf` | Left Calf | `cm` |
| `right_calf` | Right Calf | `cm` |
| `body_fat_percent` | Body Fat % | `percent` |

Every kind has exactly one canonical storage unit, fixed by the vocabulary (D-08): `bodyweight` is
the sole mass kind (`kg`), `body_fat_percent` is the sole percentage kind (`percent`), and the
remaining thirteen circumference kinds store `cm`. Display conversion — kg⇄lb, cm⇄in — happens at
the single existing `packages/api-contracts/src/units.ts` boundary, never here and never per-row.

`BODY_METRIC_KIND_ORDER` carries the same fifteen kinds in display order — identical values to
`BODY_METRIC_KINDS` today, kept as a separate tuple so a kind appended later to the wire vocabulary
does not have to land in the same position it renders.

**The tuple is additive-only once rows exist.** Removing a kind orphans every row already logged
against it — the same rule `docs/program-vocabularies.md`'s `ROUTINE_STATUSES` and
`docs/excluded-exercise-shape.md`'s enforcement layers both carry forward. A kind may be appended;
none may be removed or renamed.

## Enforcement layers

| Layer | Owns |
|---|---|
| `@fitness/api-contracts`'s `BODY_METRIC_KINDS`/`BODY_METRIC_KIND_SET` | The single definition of the closed vocabulary — every other layer imports this, never a retyped literal array (RESEARCH Pitfall 4). |
| `apps/api/src/sync/sync.service.ts`'s `hasInvalidField` `body_metric` branch | Write-time validation: `kind` must be a member of `BODY_METRIC_KIND_SET`, `value` must be a non-negative decimal string, `recorded_at` must be a valid ISO string when present, `local_date` must match `YYYY-MM-DD`. |
| `apps/api/src/sync/sync.service.ts`'s `toBodyMetricValues` | Ownership: `user_id` always comes from the authenticated session argument, never from client-supplied `data` (T-12-01), mirroring `toPersonalRecordValues`. |
| `ops/powersync/sync-rules.yaml`'s `body_metric` query, scoped `WHERE user_id = auth.user_id()` | Per-user delivery: a row leaving this query's result set is deleted from every device that is not its owner's. |

## No Postgres CHECK

Unlike `load_type` or the `routine`/`routine_cycle` vocabularies, `body_metric.kind` carries no
Postgres CHECK constraint — the closed vocabulary is enforced at the application layer
(`hasInvalidField`) only, matching `excluded_exercise`'s own precedent of relying on
application-level validation where no CHECK exists. A kind added to `BODY_METRIC_KINDS` without a
matching Postgres migration is safe precisely because there is no CHECK to violate; the vocabulary
module itself is the single source of truth.

## Editing and deleting are ordinary row operations

A logged metric entry is an ordinary row with an ordinary tombstoned delete, exactly like a logged
set (D-10). `body_metric` is absent from `HARD_DELETE_FORBIDDEN`
(`apps/api/src/sync/sync.service.ts`) — deleting a mislogged entry is the legitimate correction
path, not a loss of history some other table references by id.
