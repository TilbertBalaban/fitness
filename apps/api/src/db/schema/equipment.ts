import { relations, sql } from 'drizzle-orm';
import { bigint, boolean, index, jsonb, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '../schema';

export const equipmentProfile = pgTable(
  'equipment_profile',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    barbellWeightKg: numeric('barbell_weight_kg', { precision: 6, scale: 3 }),
    availablePlates: jsonb('available_plates'),
    dumbbellIncrementsKg: jsonb('dumbbell_increments_kg'),
    machineAvailability: jsonb('machine_availability'),
    // A gym's hardware is inherently one unit — no per-plate unit field, the profile is the unit.
    nativeUnit: text('native_unit').notNull(),
    archivedAt: timestamp('archived_at'),
    serverSeq: bigint('server_seq', { mode: 'number' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  (table) => [index('equipment_profile_userId_idx').on(table.userId)],
);

export const equipmentProfileRelations = relations(equipmentProfile, ({ one }) => ({
  user: one(user, { fields: [equipmentProfile.userId], references: [user.id] }),
}));
