import { relations, sql } from 'drizzle-orm';
import { bigint, pgTable, text } from 'drizzle-orm/pg-core';
import { user } from '../schema';

// Keyed on user_id itself, not a separate client-UUID id — this is the row that makes the
// kg/lb display unit (PLAT-08) a per-account fact rather than device state.
export const userPreference = pgTable('user_preference', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  weightUnit: text('weight_unit').notNull(),
  defaultEquipmentProfileId: text('default_equipment_profile_id'),
  serverSeq: bigint('server_seq', { mode: 'number' })
    .notNull()
    .default(sql`nextval('sync_seq')`),
});

export const userPreferenceRelations = relations(userPreference, ({ one }) => ({
  user: one(user, { fields: [userPreference.userId], references: [user.id] }),
}));
