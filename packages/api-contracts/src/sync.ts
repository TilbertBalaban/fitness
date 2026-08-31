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
  'routine_cycle',
  'routine_exercise_cycle_target',
  'excluded_exercise',
  'dashboard_widget',
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

// The tables SyncService.TABLE_MAP actually applies today (CR-03). Kept as a separate tuple
// rather than derived from TABLE_MAP so this contract stays importable from the mobile client
// without pulling in the server's Drizzle schema. 'exercise' and 'user_exercise_preference' are
// singleton aggregate roots with no synced children — exercise has no parent to chain through
// (unlike workout_session's session_exercise/logged_set descendants), and
// user_exercise_preference is always its own root since it is never referenced by another synced
// table's op. 'routine' is a third class: an aggregate root that DOES own synced children
// (routine_day, routine_exercise) — it resolves to itself the same way workout_session does, but
// is not a singleton. routine_day and routine_exercise (04-02) chain to 'routine' the same way
// session_exercise/logged_set chain to workout_session, two hops deep for routine_exercise.
// 'user_preference' (04-04) is a fourth singleton root, alongside exercise/user_exercise_preference
// — built early because PROG-08's active pointer (user_preference.active_routine_id) needs a
// working push apply path now; Phase 6 extends the same toUserPreferenceValues with
// default_equipment_profile_id rather than building this path from scratch.
// 'routine_cycle' (04-06) is a fourth child of the 'routine' aggregate root, a sibling of
// routine_day/routine_exercise one level below the root. 'routine_exercise_cycle_target' (04-07)
// hangs off TWO parents at once — routine_exercise and routine_cycle — the deepest, only
// dual-parent child in this schema; both parent chains must independently resolve to the same
// routine before it applies (T-04-33). 'personal_record' (05-03) is a fifth singleton root,
// alongside exercise/user_exercise_preference/user_preference — D-30 moved PR detection's write
// path into Phase 5 so a PR logged on the gym floor survives to Postgres the same session it is
// achieved; Phase 9 keeps browsing, retrospective reconciliation and cross-device authority.
// 'equipment_profile' (06-01) is a sixth singleton root — a gym profile owns no synced children and
// is never a sync parent, the same shape personal_record carries. 'excluded_exercise' (11-02) is a
// seventh singleton root, alongside exercise/user_exercise_preference/user_preference/
// personal_record/equipment_profile — a user's exclusion of an exercise owns no synced children and
// is never referenced as a parent by another table's op. 'body_metric' (12-01) is an eighth: a
// logged weigh-in or measurement owns no synced children and is never referenced as a parent — the
// same shape personal_record already established (D-01/D-05). 'progress_photo' (12-03) is a ninth:
// the metadata row for an on-device photo owns no synced children and is never referenced as a
// parent — the bytes themselves never cross this boundary at all (D-15), only the row does.
// 'dashboard_widget' (12-05) is a tenth: unlike the two above, it is not a previously-deferred
// table moving here — it is a wholly new table created directly in PUSH_APPLIED_TABLES, because a
// dashboard layout row is a first-class, forward-compatible singleton root from the moment it
// exists (D-21). It owns no synced children and is never referenced as a parent by another table's
// op, the same shape body_metric/progress_photo/personal_record already established.
export const PUSH_APPLIED_TABLES = [
  'workout_session',
  'session_exercise',
  'logged_set',
  'exercise',
  'user_exercise_preference',
  'routine',
  'routine_day',
  'routine_exercise',
  'user_preference',
  'routine_cycle',
  'routine_exercise_cycle_target',
  'personal_record',
  'equipment_profile',
  'excluded_exercise',
  'body_metric',
  'progress_photo',
  'dashboard_widget',
] as const;
export type PushAppliedTable = (typeof PUSH_APPLIED_TABLES)[number];

// No apply path yet. Each table lands here until the phase that owns its validation rules and
// conflict semantics builds one — moving an entry to PUSH_APPLIED_TABLES is a one-line change
// when that phase ships. Verified against ROADMAP.md's phase ownership, not guessed:
// routine_day and routine_exercise moved to PUSH_APPLIED_TABLES in 04-02, user_preference moved
// in 04-04 (PROG-08 needed activation to sync before Phase 6 could exist), personal_record moved in
// 05-03 (D-30 — the apply path could not wait for Phase 9), equipment_profile moved in 06-01,
// body_metric moved in 12-01, and progress_photo moved in 12-03 — Phase 4 no longer owes either of
// its two here, Phase 9 no longer owes personal_record, Phase 6 no longer owes equipment_profile,
// and Phase 12 no longer owes body_metric or progress_photo. This tuple is now empty for the first
// time in the project's life; 12-08 owns asserting that as a falsifiable test.
export const PUSH_DEFERRED_TABLES = [] as const;
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
// 'server_error' is appended, never inserted: an older client that has not heard of it falls
// through isTerminalRejection's trailing table check and treats it as non-terminal, which is the
// safe direction (the write stays queued rather than being destroyed).
export type SyncRejectionReason =
  | 'not_owner'
  | 'unknown_table'
  | 'invalid_field'
  | 'missing_parent'
  | 'batch_too_large'
  | 'deleted'
  | 'server_error';

export interface SyncPushResponse {
  applied: string[];
  rejected: { op_id: string; reason: SyncRejectionReason }[];
  // Stringified bigint — a Postgres bigint does not survive a JSON number.
  server_seq: string;
}

const TERMINAL_REASONS = new Set<SyncRejectionReason>(['not_owner', 'invalid_field', 'deleted']);
const NON_TERMINAL_REASONS = new Set<SyncRejectionReason>(['missing_parent', 'batch_too_large', 'server_error']);

// Terminal means "retrying this identical op can never succeed" — the only question the client
// needs answered to decide whether completing the crud transaction destroys a recoverable write.
// server_error is the answer to the case that used to be misfiled as invalid_field: the server
// failed for a reason that has nothing to do with the payload (a deadlock between the same user's
// two devices, a serialization failure, a statement timeout, a dropped connection). Telling the
// client that is terminal makes it call transaction.complete() and delete an entire offline
// editing session from the local queue over a blip (CR-02).
// unknown_table is the one reason whose terminality depends on the table: a name in
// PUSH_DEFERRED_TABLES is a known, permanent gap (terminal), but a name recognized by neither
// list means contract drift a later client/server deploy may cure (not terminal).
export function isTerminalRejection(reason: SyncRejectionReason, table: string): boolean {
  if (TERMINAL_REASONS.has(reason)) return true;
  if (NON_TERMINAL_REASONS.has(reason)) return false;
  return (PUSH_DEFERRED_TABLES as readonly string[]).includes(table);
}
