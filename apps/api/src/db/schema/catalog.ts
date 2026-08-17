import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { user } from '../schema';

// Global seeded taxonomy, not user-authored: no ownership column and no server_seq. Delivered by
// the first-install catalog download (D-01), not by sync.
export const muscleGroup = pgTable('muscle_group', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  bodyRegion: text('body_region').notNull(),
});

export const exercise = pgTable(
  'exercise',
  {
    id: text('id').primaryKey(),
    // Nullable, unlike every other synced table's ownership column — null for seeded catalog
    // rows, set only for a user's own custom exercises, which are the only exercise rows that sync.
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    aliases: text('aliases').array(),
    movementPattern: text('movement_pattern'),
    equipmentRequired: text('equipment_required'),
    loadType: text('load_type').notNull(),
    unilateral: boolean('unilateral').notNull().default(false),
    instructionsText: text('instructions_text'),
    cueText: text('cue_text'),
    imageUrls: text('image_urls').array(),
    isCustom: boolean('is_custom').notNull().default(false),
    variationOfId: text('variation_of_id').references((): AnyPgColumn => exercise.id),
    source: text('source').notNull(),
    archivedAt: timestamp('archived_at'),
    serverSeq: bigint('server_seq', { mode: 'number' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  (table) => [index('exercise_userId_idx').on(table.userId)],
);

// weight_factor is data, not a hardcoded 1.0/0.5 constant in code — a stiff-leg deadlift is
// primary hamstrings, secondary glutes and secondary lower back at three different weights, and
// volume analytics is only correct if that lives in the row (ARCHITECTURE.md §1).
export const exerciseMuscleMapping = pgTable(
  'exercise_muscle_mapping',
  {
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercise.id, { onDelete: 'cascade' }),
    muscleGroupId: text('muscle_group_id')
      .notNull()
      .references(() => muscleGroup.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    weightFactor: numeric('weight_factor', { precision: 4, scale: 2 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.exerciseId, table.muscleGroupId] }),
    index('exercise_muscle_mapping_exerciseId_idx').on(table.exerciseId),
  ],
);

export const muscleGroupRelations = relations(muscleGroup, ({ many }) => ({
  exerciseMappings: many(exerciseMuscleMapping),
}));

export const exerciseRelations = relations(exercise, ({ one, many }) => ({
  user: one(user, { fields: [exercise.userId], references: [user.id] }),
  variationOf: one(exercise, { fields: [exercise.variationOfId], references: [exercise.id] }),
  muscleMappings: many(exerciseMuscleMapping),
}));

export const exerciseMuscleMappingRelations = relations(exerciseMuscleMapping, ({ one }) => ({
  exercise: one(exercise, { fields: [exerciseMuscleMapping.exerciseId], references: [exercise.id] }),
  muscleGroup: one(muscleGroup, {
    fields: [exerciseMuscleMapping.muscleGroupId],
    references: [muscleGroup.id],
  }),
}));
