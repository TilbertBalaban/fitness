import { relations, sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
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

// A cycle is a small orderable row, never a per-week copy of the day/exercise tree — cycles are
// never materialised per-week (D-09). No ownership column: a cycle is a child of its routine,
// resolved through routine.user_id, exactly as routineDay and routineExercise are.
export const routineCycle = pgTable(
  'routine_cycle',
  {
    id: text('id').primaryKey(),
    routineId: text('routine_id')
      .notNull()
      .references(() => routine.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    // Nullable: a training or deload cycle's length is the number of days in the routine's
    // rotation, not a stored number — only a time_off cycle needs a duration, which is what makes
    // PROG-06 expressible without a second column.
    durationDays: integer('duration_days'),
  },
  (table) => [
    index('routine_cycle_routineId_idx').on(table.routineId),
    // The seed script and any future direct-DB tooling bypass sync.service.ts's application-level
    // validator entirely — this constraint is the real backstop, not a formality (mirrors
    // exercise_load_type_check's and routine_status_check's precedent). Literals must match
    // CYCLE_KINDS in packages/api-contracts/src/program.ts exactly.
    check('routine_cycle_kind_check', sql`${table.kind} IN ('training','deload','time_off')`),
  ],
);

// A sparse per-cycle override: a row exists only where a target value actually differs from
// routine_exercise's own five columns, resolved per field as `override ?? base` through the one
// exported resolveTarget (packages/api-contracts/src/program.ts) — never a per-week copy of the
// exercise tree (D-02). No ownership column: hangs off TWO parents (routine_exercise AND
// routine_cycle) that must independently resolve to the same routine before a sync push applies it
// (T-04-33) — the deepest, only dual-parent chain in this schema.
export const routineExerciseCycleTarget = pgTable(
  'routine_exercise_cycle_target',
  {
    // Single TEXT PRIMARY KEY, not a composite key on (routineExerciseId, cycleId): applyBatch
    // resolves every row as eq(table.id, op.id), and PowerSync's local schema gives every managed
    // table one id column — a composite PK would be unwritable through the sync path, the same
    // reason user_exercise_preference (catalog.ts) carries one.
    id: text('id').primaryKey(),
    routineExerciseId: text('routine_exercise_id')
      .notNull()
      .references(() => routineExercise.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => routineCycle.id, { onDelete: 'cascade' }),
    targetSets: integer('target_sets'),
    targetRepMin: integer('target_rep_min'),
    targetRepMax: integer('target_rep_max'),
    targetRir: integer('target_rir'),
    targetRestSeconds: integer('target_rest_seconds'),
  },
  (table) => [
    index('routine_exercise_cycle_target_routineExerciseId_idx').on(table.routineExerciseId),
    index('routine_exercise_cycle_target_cycleId_idx').on(table.cycleId),
    // The structural guarantee that "the override for this exercise in this cycle" is singular —
    // without it, two devices creating an override offline produce two rows with different ids and
    // resolution becomes order-dependent.
    unique('routine_exercise_cycle_target_unique').on(table.routineExerciseId, table.cycleId),
  ],
);

export const routineRelations = relations(routine, ({ one, many }) => ({
  user: one(user, { fields: [routine.userId], references: [user.id] }),
  days: many(routineDay),
  cycles: many(routineCycle),
}));

export const routineDayRelations = relations(routineDay, ({ one, many }) => ({
  routine: one(routine, { fields: [routineDay.routineId], references: [routine.id] }),
  exercises: many(routineExercise),
}));

export const routineExerciseRelations = relations(routineExercise, ({ one, many }) => ({
  routineDay: one(routineDay, { fields: [routineExercise.routineDayId], references: [routineDay.id] }),
  exercise: one(exercise, { fields: [routineExercise.exerciseId], references: [exercise.id] }),
  cycleTargets: many(routineExerciseCycleTarget),
}));

export const routineCycleRelations = relations(routineCycle, ({ one, many }) => ({
  routine: one(routine, { fields: [routineCycle.routineId], references: [routine.id] }),
  cycleTargets: many(routineExerciseCycleTarget),
}));

export const routineExerciseCycleTargetRelations = relations(routineExerciseCycleTarget, ({ one }) => ({
  routineExercise: one(routineExercise, {
    fields: [routineExerciseCycleTarget.routineExerciseId],
    references: [routineExercise.id],
  }),
  routineCycle: one(routineCycle, {
    fields: [routineExerciseCycleTarget.cycleId],
    references: [routineCycle.id],
  }),
}));
