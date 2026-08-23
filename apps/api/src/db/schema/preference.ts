import { relations, sql } from 'drizzle-orm';
import { bigint, boolean, pgTable, text } from 'drizzle-orm/pg-core';
import { user } from '../schema';

// Single TEXT PRIMARY KEY id, deterministically equal to user_id — not keyed on user_id itself,
// and not a composite PK: SyncService's applyBatch resolves every row as eq(table.id, op.id), and
// PowerSync's local schema gives every managed table one id column (the same reasoning
// catalog.ts's userExercisePreference already documents). id === user_id is a wire contract every
// client build reads, and it is what makes this row's singleton invariant structurally true: a
// client-generated UUID (userExercisePreference's own pattern) would let two offline devices each
// create a distinct preference row for the same user, which would break the single-active-program
// guarantee (D-14) this row exists to carry. userId keeps a unique constraint so "one row per
// user" is still enforced at the database level, independent of the id contract holding.
export const userPreference = pgTable('user_preference', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  weightUnit: text('weight_unit').notNull(),
  defaultEquipmentProfileId: text('default_equipment_profile_id'),
  // Nullable pointer to the one routine this user is running (D-14/PROG-08). No .references() —
  // following defaultEquipmentProfileId's precedent above: a foreign key here would turn archiving
  // the active routine into a constraint violation instead of a pointer clear.
  activeRoutineId: text('active_routine_id'),
  // FEATURES.md item 6 records that hardcoded auto-advance with no override is the regression
  // versus MacroFactor, so both toggles exist and default on (LOG-13, LOG-17).
  autoAdvanceEnabled: boolean('auto_advance_enabled').notNull().default(true),
  warmupSetsEnabled: boolean('warmup_sets_enabled').notNull().default(true),
  serverSeq: bigint('server_seq', { mode: 'number' })
    .notNull()
    .default(sql`nextval('sync_seq')`),
});

export const userPreferenceRelations = relations(userPreference, ({ one }) => ({
  user: one(user, { fields: [userPreference.userId], references: [user.id] }),
}));
