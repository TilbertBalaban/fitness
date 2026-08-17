import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgSequence,
  pgTable,
  text,
  timestamp,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { user } from '../schema';
import { exercise } from './catalog';

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
    // Captured once at session start from the device's IANA zone (LOG-22); no read path
    // recomputes these from started_at and the reading device's clock (PITFALLS §12).
    timezone: text('timezone').notNull(),
    localDate: date('local_date').notNull(),
    serverSeq: bigint('server_seq', { mode: 'number' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  (table) => [index('workout_session_userId_idx').on(table.userId)],
);

// No user_id and no server_seq: this is a child of its aggregate root. Ownership and merge
// ordering are resolved once through workout_session, never duplicated onto every child row
// (T-02-03).
export const sessionExercise = pgTable(
  'session_exercise',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => workoutSession.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercise.id),
    orderIndex: integer('order_index').notNull(),
    supersetGroupId: text('superset_group_id'),
    // Traceability only — the routine_exercise this was copied from, never read again for the
    // prescription itself. No FK: the routine's own editing lifecycle should never be blocked by
    // a historical session pointing back at it.
    routineExerciseId: text('routine_exercise_id'),
    // Copied once at session start and never re-read from routine_exercise afterward (D-05) — a
    // six-month-old workout renders from this snapshot regardless of how the routine has changed.
    targetSets: integer('target_sets'),
    targetRepMin: integer('target_rep_min'),
    targetRepMax: integer('target_rep_max'),
    targetRirMin: integer('target_rir_min'),
    targetRirMax: integer('target_rir_max'),
    targetRestSeconds: integer('target_rest_seconds'),
  },
  (table) => [index('session_exercise_sessionId_idx').on(table.sessionId)],
);

export const loggedSet = pgTable(
  'logged_set',
  {
    id: text('id').primaryKey(),
    sessionExerciseId: text('session_exercise_id')
      .notNull()
      .references(() => sessionExercise.id, { onDelete: 'cascade' }),
    // Strictly incrementing, never fractional (1, 2, 3, 3a, 3b becomes 1, 2, 3, 4, 5) — grouping
    // is the annotation columns below, never a different storage shape (ARCHITECTURE.md §1).
    setIndex: integer('set_index').notNull(),
    setType: text('set_type').notNull(),
    // numeric, not real/doublePrecision — Drizzle surfaces numeric as a string in JavaScript,
    // which is exactly the point: a value that never becomes a binary float cannot accumulate
    // conversion error across a lifetime of aggregation (D-04).
    weightKg: numeric('weight_kg', { precision: 8, scale: 3 }),
    reps: integer('reps').notNull(),
    rir: integer('rir'),
    side: text('side'),
    completed: boolean('completed').notNull().default(false),
    parentSetId: text('parent_set_id').references((): AnyPgColumn => loggedSet.id),
    restTakenSeconds: integer('rest_taken_seconds'),
    loggedAt: timestamp('logged_at').notNull(),
  },
  (table) => [
    index('logged_set_sessionExerciseId_idx').on(table.sessionExerciseId),
    index('logged_set_sessionExerciseId_setIndex_idx').on(table.sessionExerciseId, table.setIndex),
  ],
);

export const workoutSessionRelations = relations(workoutSession, ({ one, many }) => ({
  user: one(user, { fields: [workoutSession.userId], references: [user.id] }),
  sessionExercises: many(sessionExercise),
}));

export const sessionExerciseRelations = relations(sessionExercise, ({ one, many }) => ({
  session: one(workoutSession, { fields: [sessionExercise.sessionId], references: [workoutSession.id] }),
  exercise: one(exercise, { fields: [sessionExercise.exerciseId], references: [exercise.id] }),
  loggedSets: many(loggedSet),
}));

export const loggedSetRelations = relations(loggedSet, ({ one }) => ({
  sessionExercise: one(sessionExercise, {
    fields: [loggedSet.sessionExerciseId],
    references: [sessionExercise.id],
  }),
}));
