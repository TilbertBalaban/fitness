// Additive-only from this commit forward — every client build in the field reads this tuple back
// through its declared order and membership. Append only; never insert, never reorder.

export const PROGRESSION_PREFERENCES = ['widen_rep_range_first', 'match_previous_weight'] as const;
export type ProgressionPreference = (typeof PROGRESSION_PREFERENCES)[number];

// Double progression is the gentler behaviour for a lifter whose plate inventory is coarse, and
// it is what a user who never opens this setting gets.
export const DEFAULT_PROGRESSION_PREFERENCE: ProgressionPreference = 'widen_rep_range_first';

const PROGRESSION_PREFERENCE_SET = new Set<string>(PROGRESSION_PREFERENCES);

export function isProgressionPreference(value: unknown): value is ProgressionPreference {
  return typeof value === 'string' && PROGRESSION_PREFERENCE_SET.has(value);
}
