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

// D-17. The single place the "which set types count toward working volume" rule lives — every
// call site that used to inline `!== 'warmup'` must route through this instead:
// apps/mobile/lib/db/session-query.ts, apps/mobile/lib/db/history-query.ts,
// apps/mobile/lib/db/summary-query.ts, apps/mobile/components/ExerciseStrip.tsx, and
// packages/pr-rules/src/personal-records.ts. `warmup` is the only excluded type — drop, myorep,
// partial, failure and amrap are all genuine working effort and all count.
export function countsTowardWorkingVolume(setType: SetType): boolean {
  return setType !== WARMUP_SET_TYPE;
}

// D-18. A second, stricter predicate for PR detection: excludes `warmup` AND `partial`. A
// partial-ROM rep must never set a `heaviest_weight` or `best_e1rm` PR — that is the one place
// counting a partial as a full rep would produce a wrong, durable, user-visible number. Drops,
// myoreps, failure and AMRAP sets remain PR-eligible.
export function countsTowardRecords(setType: SetType): boolean {
  return setType !== WARMUP_SET_TYPE && setType !== 'partial';
}

// Derived tuples for SQL callers: a Drizzle `where` clause cannot call a JavaScript predicate per
// row, so session-query.ts/history-query.ts express the same rule as
// `notInArray(loggedSet.setType, ...)` over these — computed FROM the predicates above so the
// rule still lives in exactly one place.
export const WORKING_VOLUME_EXCLUDED_SET_TYPES = SET_TYPES.filter((setType) => !countsTowardWorkingVolume(setType));
export const RECORDS_EXCLUDED_SET_TYPES = SET_TYPES.filter((setType) => !countsTowardRecords(setType));
