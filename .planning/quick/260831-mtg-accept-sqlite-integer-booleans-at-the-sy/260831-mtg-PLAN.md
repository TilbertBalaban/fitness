---
quick_id: 260831-mtg
slug: accept-sqlite-integer-booleans-at-the-sy
date: 2026-08-31
mode: quick
---

# Accept SQLite integer booleans at the sync op-validator boundary

## Objective

Stop the sync push from silently discarding every op that carries a boolean column.

`apps/api/src/sync/sync.service.ts` validated `logged_set.completed` (and, via the same
helper, `dashboard_widget.enabled`) with `typeof value === 'boolean'`. Those columns are
declared `integer(..., { mode: 'boolean' })` on the client; Drizzle converts only at its
own boundary, while PowerSync's `CrudEntry.opData` reads raw SQLite and `connector.ts`
forwards it untouched. The server therefore received `1`/`0`, marked the op invalid, and —
because an invalid op is dropped rather than retried — the client's crud queue drained
while the rows never reached Postgres. The app reported itself synced; the sets were lost.

Introduced by `144b3ee` (2026-08-25). Found by the v1.0 milestone audit; see
`.planning/v1.0-MILESTONE-AUDIT.md`.

## Tasks

1. **Accept the wire's actual shape.** Widen `isValidOptionalBoolean` to admit `0` and `1`
   alongside real booleans, keeping strings, out-of-range integers and `null` rejected.
2. **Normalize before writing.** Add `toBoolean(value, fallback)` and route every
   op-sourced boolean through it. `d.flag ?? fallback` is not sufficient — `0` is not
   nullish, so the fallback never fires and a falsy integer reaches a Postgres boolean
   column. Apply at the `logged_set` row builder, the `dashboard_widget` row builder, the
   two `user_preference` flags, and the `logged_set` conflict merge.
3. **Fix the same latent bug on `user_preference`.** `auto_advance_enabled` and
   `warmup_sets_enabled` used bare inline `typeof !== 'boolean'` checks; route them through
   the shared helper.
4. **Regression test.** Assert the wire shape (`1`/`0`) is accepted and genuinely invalid
   values are still rejected, across all four table/column pairs.

## Verification

- New spec passes.
- `pnpm -w typecheck` and `pnpm -w test` stay green.
- The `sync` Playwright project — the suite that caught this — goes from 0/5 to passing.
