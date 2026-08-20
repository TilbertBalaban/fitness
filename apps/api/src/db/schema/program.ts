import { relations, sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '../schema';
import { exercise } from './catalog';

export const routine = pgTable(
  'routine',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    goal: text('goal'),
    status: text('status').notNull(),
    // Independent of status and of user_preference.active_routine_id — a program that is both
    // active and frozen must be representable, and a single status enum could not express that
    // (D-16). Freezing changes neither status nor the active pointer; activating changes neither
    // this flag nor status.
    progressionFrozen: boolean('progression_frozen').notNull().default(false),
    source: text('source').notNull(),
    createdFromTemplateId: text('created_from_template_id'),
    archivedAt: timestamp('archived_at'),
    serverSeq: bigint('server_seq', { mode: 'number' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  (table) => [
    index('routine_userId_idx').on(table.userId),
    // The seed script and any future direct-DB tooling bypass sync.service.ts's application-level
    // validator entirely — this constraint is the real backstop, not a formality (mirrors
    // exercise_load_type_check's precedent in catalog.ts). Literals must match ROUTINE_STATUSES in
    // packages/api-contracts/src/program.ts exactly. 'active', 'frozen' and 'archived' are
    // deliberately never values here — see docs/program-vocabularies.md for why each of those
    // three facts lives on a different column instead.
    check('routine_status_check', sql`${table.status} IN ('draft','ready')`),
  ],
);

// Deliberately no ProgramWeek table and no routine version tree — a repeating day sequence whose
// prescriptions drift by rule, plus SessionExercise's per-session snapshot, is what makes history
// correct (ARCHITECTURE.md §1, Hard modeling question 3). No ownership column: a day is a child of
// its routine, resolved through routine.user_id.
export const routineDay = pgTable(
  'routine_day',
  {
    id: text('id').primaryKey(),
    routineId: text('routine_id')
      .notNull()
      .references(() => routine.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    name: text('name').notNull(),
    isRestDay: boolean('is_rest_day').notNull().default(false),
  },
  (table) => [index('routine_day_routineId_idx').on(table.routineId)],
);

export const routineExercise = pgTable(
  'routine_exercise',
  {
    id: text('id').primaryKey(),
    routineDayId: text('routine_day_id')
      .notNull()
      .references(() => routineDay.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercise.id),
    orderIndex: integer('order_index').notNull(),
    supersetGroupId: text('superset_group_id'),
    targetSets: integer('target_sets'),
    targetRepMin: integer('target_rep_min'),
    targetRepMax: integer('target_rep_max'),
    targetRir: integer('target_rir'),
    targetRestSeconds: integer('target_rest_seconds'),
    progressionSchemeId: text('progression_scheme_id'),
    notes: text('notes'),
  },
  (table) => [index('routine_exercise_routineDayId_idx').on(table.routineDayId)],
);

export const routineRelations = relations(routine, ({ one, many }) => ({
  user: one(user, { fields: [routine.userId], references: [user.id] }),
  days: many(routineDay),
}));

export const routineDayRelations = relations(routineDay, ({ one, many }) => ({
  routine: one(routine, { fields: [routineDay.routineId], references: [routine.id] }),
  exercises: many(routineExercise),
}));

export const routineExerciseRelations = relations(routineExercise, ({ one }) => ({
  routineDay: one(routineDay, { fields: [routineExercise.routineDayId], references: [routineDay.id] }),
  exercise: one(exercise, { fields: [routineExercise.exerciseId], references: [exercise.id] }),
}));
