import { sql } from 'drizzle-orm';
import { bigint, date, index, integer, numeric, pgTable, text } from 'drizzle-orm/pg-core';
import { user } from '../schema';
import { muscleGroup } from './catalog';

// Deterministic ids so no call site spells the wire format itself.
export function rollupId(userId: string, muscleGroupId: string, localDate: string): string {
  return `${userId}:${muscleGroupId}:${localDate}`;
}

export function watermarkId(userId: string): string {
  return userId;
}

// A single TEXT primary key is a hard PowerSync constraint, not a style choice — every table
// PowerSync manages needs one id column it can key a row on, exactly as personal_record/body_metric
// already establish (records.ts). exercise_muscle_mapping's composite primaryKey([...]) shape is
// the wrong precedent here: that table is never synced through PowerSync as a queryable row set.
export const muscleVolumeRollup = pgTable(
  'muscle_volume_rollup',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    muscleGroupId: text('muscle_group_id')
      .notNull()
      .references(() => muscleGroup.id),
    localDate: date('local_date').notNull(),
    weightedVolumeKg: numeric('weighted_volume_kg', { precision: 12, scale: 3 }).notNull(),
    weightedSets: numeric('weighted_sets', { precision: 10, scale: 2 }).notNull(),
    setCount: integer('set_count').notNull(),
    serverSeq: bigint('server_seq', { mode: 'number' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  (table) => [
    index('muscle_volume_rollup_userId_idx').on(table.userId),
    index('muscle_volume_rollup_userId_localDate_idx').on(table.userId, table.localDate),
  ],
);

// A per-user singleton, the same option-a wire contract user_preference already uses: id === userId.
export const analyticsWatermark = pgTable('analytics_watermark', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  computedThroughDate: date('computed_through_date').notNull(),
  serverSeq: bigint('server_seq', { mode: 'number' })
    .notNull()
    .default(sql`nextval('sync_seq')`),
});
