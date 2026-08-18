import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { workoutSession, sessionExercise, loggedSet, workoutSessionRelations, syncSeq } from './schema/session';
import {
  muscleGroup,
  exercise,
  exerciseMuscleMapping,
  userExercisePreference,
  userExercisePreferenceRelations,
} from './schema/catalog';
import { equipmentProfile } from './schema/equipment';
import { routine, routineDay, routineExercise } from './schema/program';
import { personalRecord, bodyMetric, progressPhoto } from './schema/records';
import { userPreference } from './schema/preference';
import { syncConflictLog, syncTombstone } from './schema/sync';

export {
  workoutSession,
  sessionExercise,
  loggedSet,
  workoutSessionRelations,
  syncSeq,
  muscleGroup,
  exercise,
  exerciseMuscleMapping,
  userExercisePreference,
  userExercisePreferenceRelations,
  equipmentProfile,
  routine,
  routineDay,
  routineExercise,
  personalRecord,
  bodyMetric,
  progressPhoto,
  userPreference,
  syncConflictLog,
  syncTombstone,
};

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  workoutSessions: many(workoutSession),
  routines: many(routine),
  equipmentProfiles: many(equipmentProfile),
  exercises: many(exercise),
  exercisePreferences: many(userExercisePreference),
  personalRecords: many(personalRecord),
  bodyMetrics: many(bodyMetric),
  progressPhotos: many(progressPhoto),
  syncConflictLogs: many(syncConflictLog),
  syncTombstones: many(syncTombstone),
  preference: one(userPreference, { fields: [user.id], references: [userPreference.userId] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const schema = {
  user,
  session,
  account,
  verification,
  workoutSession,
  sessionExercise,
  loggedSet,
  muscleGroup,
  exercise,
  exerciseMuscleMapping,
  userExercisePreference,
  equipmentProfile,
  routine,
  routineDay,
  routineExercise,
  personalRecord,
  bodyMetric,
  progressPhoto,
  userPreference,
  syncConflictLog,
  syncTombstone,
};
