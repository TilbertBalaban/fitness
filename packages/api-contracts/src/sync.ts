export const SYNC_PUSH_PATH = '/v1/sync/push' as const;
export const SYNC_MAX_BATCH_OPS = 1000 as const;

// Additive-only from this commit forward — every client build in the field reads this shape.
// muscle_group, exercise_muscle_mapping and sync_conflict_log/sync_tombstone are deliberately
// absent: the first two are catalog content delivered by the first-install download (D-01) —
// now bundled as localOnly seeded_exercise/muscle_group/exercise_muscle_mapping/catalog_meta on
// the client (03-01/03-02) rather than only because of the first-install download alone — the
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
  'user_exercise_preference',
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

// The tables SyncService.TABLE_MAP actually applies today (CR-03). Kept as a separate tuple
// rather than derived from TABLE_MAP so this contract stays importable from the mobile client
// without pulling in the server's Drizzle schema. 'exercise' and 'user_exercise_preference' are
// both singleton aggregate roots with no synced children — exercise has no parent to chain
// through (unlike workout_session's session_exercise/logged_set descendants), and
// user_exercise_preference is always its own root since it is never referenced by another
// synced table's op.
export const PUSH_APPLIED_TABLES = [
  'workout_session',
  'session_exercise',
  'logged_set',
  'exercise',
  'user_exercise_preference',
] as const;
export type PushAppliedTable = (typeof PUSH_APPLIED_TABLES)[number];

// No apply path yet. Each table lands here until the phase that owns its validation rules and
// conflict semantics builds one — moving an entry to PUSH_APPLIED_TABLES is a one-line change
// when that phase ships. Verified against ROADMAP.md's phase ownership, not guessed: equipment_profile
// and user_preference are Phase 6 (Gym Profiles & Plate Math — GYM-01/02 own multi-gym config and
// user_preference.defaultEquipmentProfileId references it), and personal_record is Phase 9
// (Records & Client Analytics — ANLY-01 owns PR detection), not Phase 5/7 as an earlier draft of
// this classification assumed.
export const PUSH_DEFERRED_TABLES = [
  'routine', // Phase 4 — Program Builder
  'routine_day', // Phase 4 — Program Builder
  'routine_exercise', // Phase 4 — Program Builder
  'equipment_profile', // Phase 6 — Gym Profiles & Plate Math
  'user_preference', // Phase 6 — Gym Profiles & Plate Math
  'personal_record', // Phase 9 — Records & Client Analytics
  'body_metric', // Phase 12 — Body Metrics & Dashboard
  'progress_photo', // Phase 12 — Body Metrics & Dashboard
] as const;
export type PushDeferredTable = (typeof PUSH_DEFERRED_TABLES)[number];

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

const TERMINAL_REASONS = new Set<SyncRejectionReason>(['not_owner', 'invalid_field', 'deleted']);
const NON_TERMINAL_REASONS = new Set<SyncRejectionReason>(['missing_parent', 'batch_too_large']);

// Terminal means "retrying this identical op can never succeed" — the only question the client
// needs answered to decide whether completing the crud transaction destroys a recoverable write.
// unknown_table is the one reason whose terminality depends on the table: a name in
// PUSH_DEFERRED_TABLES is a known, permanent gap (terminal), but a name recognized by neither
// list means contract drift a later client/server deploy may cure (not terminal).
export function isTerminalRejection(reason: SyncRejectionReason, table: string): boolean {
  if (TERMINAL_REASONS.has(reason)) return true;
  if (NON_TERMINAL_REASONS.has(reason)) return false;
  return (PUSH_DEFERRED_TABLES as readonly string[]).includes(table);
}
