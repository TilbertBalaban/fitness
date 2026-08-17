import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Mirrors apps/api/src/db/schema/session.ts. Column names stay snake_case and identical to the
// Postgres table so the two stay structurally comparable (schema-parity's client-side analog).
// server_seq is present locally as a nullable integer — the server owns it, the client only reads it.
export const workoutSession = sqliteTable('workout_session', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  routineDayId: text('routine_day_id'),
  equipmentProfileId: text('equipment_profile_id'),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  status: text('status').notNull(),
  deviceId: text('device_id'),
  serverSeq: integer('server_seq'),
});

export const drizzleSchema = { workoutSession };
