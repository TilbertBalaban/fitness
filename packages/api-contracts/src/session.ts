// Additive-only from this commit forward — every client build in the field reads these tuples
// back through their declared order and membership. Append only; never insert, never reorder.

// `paused` is the value D-29's deliberate pause writes; `discarded` is the value D-28's banner
// discard writes. There is no automatic timeout-based abandoned state — see
// docs/session-vocabularies.md.
export const WORKOUT_SESSION_STATUSES = ['in_progress', 'paused', 'completed', 'discarded'] as const;
export type WorkoutSessionStatus = (typeof WORKOUT_SESSION_STATUSES)[number];

// This phase's UI only ever writes `normal` and `warmup` (D-09, LOG-17); the remaining five
// values are formalised here because sync.service.ts already anticipates them, not because this
// phase writes them — see docs/session-vocabularies.md for the reserved/written split.
export const SET_TYPES = ['normal', 'warmup', 'drop', 'myorep', 'partial', 'failure', 'amrap'] as const;
export type SetType = (typeof SET_TYPES)[number];

// The four PR types D-30 detects.
export const PR_TYPES = ['heaviest_weight', 'best_e1rm', 'most_reps_at_weight', 'best_set_volume'] as const;
export type PrType = (typeof PR_TYPES)[number];

// Named constants so every consumer that needs "the working set type" or "the warm-up set type"
// references one symbol instead of a scattered string literal.
export const WORKING_SET_TYPE: SetType = 'normal';
export const WARMUP_SET_TYPE: SetType = 'warmup';
