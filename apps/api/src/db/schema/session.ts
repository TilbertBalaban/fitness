import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
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
    // Traceability-pointer, same rationale as routine_day_id and session_exercise's own
    // routine_exercise_id below: no FK, no index. A historical session naming the program cycle it
    // was started in must never block that cycle's own editing lifecycle. Stamped exactly once
    // inside startSession (D-06's stamp-once pattern) and never re-derived on a read path (LOG-15).
    cycleId: text('cycle_id'),
    equipmentProfileId: text('equipment_profile_id'),
    // The session-scoped equipment mark, D-20/D-21: an UnavailableEquipmentRef[] naming what this
    // workout cannot use right now. Lives here, not on session_exercise and not on
    // equipment_profile, because which row a mark landed in is how every later read distinguishes
    // "busy today" (this column) from "this gym lacks it" (the profile's own inventory columns).
    unavailableEquipment: jsonb('unavailable_equipment'),
    startedAt: timestamp('started_at').notNull(),
    endedAt: timestamp('ended_at'),
    status: text('status').notNull(),
    deviceId: text('device_id'),
    // Captured once at session start from the device's IANA zone (LOG-22); no read path
    // recomputes these from started_at and the reading device's clock (PITFALLS §12).
    timezone: text('timezone').notNull(),
    localDate: date('local_date').notNull(),
    notes: text('notes'),
    // Nullable with no default: a null name is the normal case, and the History row falls back to
    // the stamped local_date rather than to a generated placeholder that would then be
    // indistinguishable from a real user-typed name (LOG-20).
    name: text('name'),
    pausedAt: timestamp('paused_at'),
    accumulatedPausedSeconds: integer('accumulated_paused_seconds').notNull().default(0),
    // A wall-clock target the client recomputes remaining time from on every foreground,
    // deliberately not a countdown value — a stored remaining-seconds number would be wrong the
    // instant the app is backgrounded (D-21, PITFALLS §6).
    restTargetAt: timestamp('rest_target_at'),
    serverSeq: bigint('server_seq', { mode: 'number' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  (table) => [
    index('workout_session_userId_idx').on(table.userId),
    // The seed script and any future direct-DB tooling bypass sync.service.ts's application-level
    // validator entirely — this constraint is the real backstop. Literals must match
    // WORKOUT_SESSION_STATUSES in packages/api-contracts/src/session.ts exactly.
    check('workout_session_status_check', sql`${table.status} IN ('in_progress','paused','completed','discarded')`),
  ],
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
    //
    // RIR is ONE number, not a range. target_rir_min/target_rir_max existed briefly and were
    // removed by user decision during phase 04; do not reintroduce a range. The removal shipped as
    // a `drizzle-kit push` DROP COLUMN with no migration file, which is this project's convention
    // rather than an oversight (there is no ./drizzle directory and no db:generate script — the
    // live database is verified against this file by test/schema-parity.e2e-spec.ts, run as
    // `pnpm --filter api db:verify`). Acceptable only because the project is pre-release and no
    // deployed database held RIR-range data. The first real deployment is the point at which push
    // must be replaced with generated migrations; a database predating this change is detected by
    // schema-parity's FORBIDDEN_COLUMNS gate rather than silently tolerated.
    targetSets: integer('target_sets'),
    targetRepMin: integer('target_rep_min'),
    targetRepMax: integer('target_rep_max'),
    targetRir: integer('target_rir'),
    targetRestSeconds: integer('target_rest_seconds'),
    notes: text('notes'),
    // Non-destructive mid-workout removal: sets already logged for a removed exercise stay
    // queryable in history rather than being deleted (LOG-14).
    removedAt: timestamp('removed_at'),
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
    notes: text('notes'),
  },
  (table) => [
    index('logged_set_sessionExerciseId_idx').on(table.sessionExerciseId),
    index('logged_set_sessionExerciseId_setIndex_idx').on(table.sessionExerciseId, table.setIndex),
    // The seed script and any future direct-DB tooling bypass sync.service.ts's application-level
    // validator entirely — this constraint is the real backstop. Literals must match SET_TYPES in
    // packages/api-contracts/src/session.ts exactly.
    check('logged_set_set_type_check', sql`${table.setType} IN ('normal','warmup','drop','myorep','partial','failure','amrap')`),
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
