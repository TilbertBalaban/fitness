import { relations, sql } from 'drizzle-orm';
import { bigint, index, pgSequence, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '../schema';

// Backs workoutSession.serverSeq — the merge-ordering sequence D-03 requires. Deliberately not a
// second pull cursor: pull ordering stays PowerSync's own checkpoint protocol (RESEARCH.md's
// Don't Hand-Roll table). This sequence exists only so the server can express "which of two
// concurrent writes to this row applied last" for a future conflict policy.
export const syncSeq = pgSequence('sync_seq');

export const workoutSession = pgTable(
  'workout_session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    routineDayId: text('routine_day_id'),
    equipmentProfileId: text('equipment_profile_id'),
    startedAt: timestamp('started_at').notNull(),
    endedAt: timestamp('ended_at'),
    status: text('status').notNull(),
    deviceId: text('device_id'),
    serverSeq: bigint('server_seq', { mode: 'number' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  (table) => [index('workout_session_userId_idx').on(table.userId)],
);

export const workoutSessionRelations = relations(workoutSession, ({ one }) => ({
  user: one(user, { fields: [workoutSession.userId], references: [user.id] }),
}));
