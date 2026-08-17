import { relations } from 'drizzle-orm';
import { bigint, index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '../schema';

// Server-owned audit trail — never in SYNCED_TABLES, never written by a client op. Plan 02-03
// writes the rows; this plan only lands the shape so the whole schema pushes once.
export const syncConflictLog = pgTable(
  'sync_conflict_log',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tableName: text('table_name').notNull(),
    rowId: text('row_id').notNull(),
    losingValue: jsonb('losing_value'),
    winningValue: jsonb('winning_value'),
    losingServerSeq: bigint('losing_server_seq', { mode: 'number' }).notNull(),
    winningServerSeq: bigint('winning_server_seq', { mode: 'number' }).notNull(),
    detectedAt: timestamp('detected_at').notNull().defaultNow(),
  },
  (table) => [index('sync_conflict_log_userId_idx').on(table.userId)],
);

// Server-owned deletion record, keyed on (table_name, row_id) — never in SYNCED_TABLES.
export const syncTombstone = pgTable(
  'sync_tombstone',
  {
    tableName: text('table_name').notNull(),
    rowId: text('row_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    deletedServerSeq: bigint('deleted_server_seq', { mode: 'number' }).notNull(),
    deletedAt: timestamp('deleted_at').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tableName, table.rowId] }),
    index('sync_tombstone_userId_idx').on(table.userId),
  ],
);

export const syncConflictLogRelations = relations(syncConflictLog, ({ one }) => ({
  user: one(user, { fields: [syncConflictLog.userId], references: [user.id] }),
}));

export const syncTombstoneRelations = relations(syncTombstone, ({ one }) => ({
  user: one(user, { fields: [syncTombstone.userId], references: [user.id] }),
}));
