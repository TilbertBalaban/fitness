import { relations, sql } from 'drizzle-orm';
import { bigint, date, index, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '../schema';
import { exercise } from './catalog';
import { loggedSet } from './session';

export const personalRecord = pgTable(
  'personal_record',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercise.id),
    prType: text('pr_type').notNull(),
    value: numeric('value', { precision: 10, scale: 3 }).notNull(),
    loggedSetId: text('logged_set_id').references(() => loggedSet.id),
    achievedAt: timestamp('achieved_at').notNull(),
    reconciledAt: timestamp('reconciled_at'),
    serverSeq: bigint('server_seq', { mode: 'number' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  (table) => [index('personal_record_userId_idx').on(table.userId)],
);

export const bodyMetric = pgTable(
  'body_metric',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    value: numeric('value', { precision: 10, scale: 3 }).notNull(),
    recordedAt: timestamp('recorded_at').notNull(),
    timezone: text('timezone').notNull(),
    localDate: date('local_date').notNull(),
    serverSeq: bigint('server_seq', { mode: 'number' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  (table) => [index('body_metric_userId_idx').on(table.userId)],
);

export const progressPhoto = pgTable(
  'progress_photo',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    takenAt: timestamp('taken_at').notNull(),
    timezone: text('timezone').notNull(),
    localDate: date('local_date').notNull(),
    storageKey: text('storage_key').notNull(),
    note: text('note'),
    serverSeq: bigint('server_seq', { mode: 'number' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  (table) => [index('progress_photo_userId_idx').on(table.userId)],
);

export const personalRecordRelations = relations(personalRecord, ({ one }) => ({
  user: one(user, { fields: [personalRecord.userId], references: [user.id] }),
  exercise: one(exercise, { fields: [personalRecord.exerciseId], references: [exercise.id] }),
  loggedSet: one(loggedSet, { fields: [personalRecord.loggedSetId], references: [loggedSet.id] }),
}));

export const bodyMetricRelations = relations(bodyMetric, ({ one }) => ({
  user: one(user, { fields: [bodyMetric.userId], references: [user.id] }),
}));

export const progressPhotoRelations = relations(progressPhoto, ({ one }) => ({
  user: one(user, { fields: [progressPhoto.userId], references: [user.id] }),
}));
