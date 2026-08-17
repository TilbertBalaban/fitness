export const SYNC_PUSH_PATH = '/v1/sync/push' as const;
export const SYNC_MAX_BATCH_OPS = 1000 as const;

// Additive-only from this commit forward — every client build in the field reads this shape.
// muscle_group, exercise_muscle_mapping and sync_conflict_log/sync_tombstone are deliberately
// absent: the first two are catalog content delivered by the first-install download (D-01), the
// last two are server-owned audit rows, never a client op.
export const SYNCED_TABLES = [
  'workout_session',
  'session_exercise',
  'logged_set',
  'routine',
  'routine_day',
  'routine_exercise',
  'equipment_profile',
  'exercise',
  'personal_record',
  'body_metric',
  'progress_photo',
  'user_preference',
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export type SyncCrudOpType = 'PUT' | 'PATCH' | 'DELETE';

export interface SyncCrudOp {
  op_id: string;
  op: SyncCrudOpType;
  type: string;
  id: string;
  data?: Record<string, unknown> | null;
}

export interface SyncPushRequest {
  batch: SyncCrudOp[];
}

// 'deleted' is unused by any op this plan emits — plan 02-03 is what emits it. Present from the
// first commit because the contract is additive-only afterwards.
export type SyncRejectionReason =
  | 'not_owner'
  | 'unknown_table'
  | 'invalid_field'
  | 'missing_parent'
  | 'batch_too_large'
  | 'deleted';

export interface SyncPushResponse {
  applied: string[];
  rejected: { op_id: string; reason: SyncRejectionReason }[];
  // Stringified bigint — a Postgres bigint does not survive a JSON number.
  server_seq: string;
}
