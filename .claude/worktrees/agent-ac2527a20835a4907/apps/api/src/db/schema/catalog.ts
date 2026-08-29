import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
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
    // Fraction of the lifter's bodyweight that loads the movement (docs/catalog-load-types.md) —
    // null where the concept does not apply. Effective historical load (joining body_metric at
    // read time vs. snapshotting at log time) is Phase 5's decision, not this schema's.
    bodyweightContributionPct: numeric('bodyweight_contribution_pct', { precision: 4, scale: 3 }),
    isCustom: boolean('is_custom').notNull().default(false),
    variationOfId: text('variation_of_id').references((): AnyPgColumn => exercise.id),
    source: text('source').notNull(),
    archivedAt: timestamp('archived_at'),
    serverSeq: bigint('server_seq', { mode: 'number' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  (table) => [
    index('exercise_userId_idx').on(table.userId),
    // The seed script and any future direct-DB tooling bypass sync.service.ts's application-level
    // validator entirely — this constraint is the real backstop, not a formality. Literals must
    // match LOAD_TYPES in packages/api-contracts/src/catalog.ts exactly.
    check(
      'exercise_load_type_check',
      sql`${table.loadType} IN ('external_weight','bodyweight','bodyweight_plus_added','assisted','time_based','distance_based')`,
    ),
  ],
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

// Per-user state on any exercise (seeded or custom), never a mutation of the shared row itself.
// exercise.userId is nullable and SyncService.applyBatch's ownership resolver rejects a PATCH
// against a null-owner row (never adoptable) — so archiving/never-suggesting a seeded exercise
// cannot go through exercise.archived_at. This table is the owner-having row instead.
export const userExercisePreference = pgTable(
  'user_exercise_preference',
  {
    // Single TEXT PRIMARY KEY, not a composite key on (user_id, exercise_id): SyncService's
    // applyBatch resolves every row as eq(table.id, op.id), and PowerSync's local schema gives
    // every managed table one id column — a composite PK would be unwritable through the sync
    // path. id is a client-generated UUID per D-02.
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercise.id, { onDelete: 'cascade' }),
    archivedAt: timestamp('archived_at'),
    neverSuggest: boolean('never_suggest').notNull().default(false),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    serverSeq: bigint('server_seq', { mode: 'number' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  (table) => [
    // The database invariant that makes "one preference row per user per exercise" true, not
    // merely conventional — the id PK above is what keeps the row syncable.
    unique('user_exercise_preference_user_exercise_unique').on(table.userId, table.exerciseId),
    index('user_exercise_preference_userId_idx').on(table.userId),
  ],
);

export const muscleGroupRelations = relations(muscleGroup, ({ many }) => ({
  exerciseMappings: many(exerciseMuscleMapping),
}));

export const exerciseRelations = relations(exercise, ({ one, many }) => ({
  user: one(user, { fields: [exercise.userId], references: [user.id] }),
  variationOf: one(exercise, { fields: [exercise.variationOfId], references: [exercise.id] }),
  muscleMappings: many(exerciseMuscleMapping),
  userPreferences: many(userExercisePreference),
}));

export const exerciseMuscleMappingRelations = relations(exerciseMuscleMapping, ({ one }) => ({
  exercise: one(exercise, { fields: [exerciseMuscleMapping.exerciseId], references: [exercise.id] }),
  muscleGroup: one(muscleGroup, {
    fields: [exerciseMuscleMapping.muscleGroupId],
    references: [muscleGroup.id],
  }),
}));

export const userExercisePreferenceRelations = relations(userExercisePreference, ({ one }) => ({
  user: one(user, { fields: [userExercisePreference.userId], references: [user.id] }),
  exercise: one(exercise, { fields: [userExercisePreference.exerciseId], references: [exercise.id] }),
}));
