// Additive-only from this commit forward — every client build in the field reads these tuples
// back through their declared order and membership. Append only; never insert, never reorder.

export const TRAINING_GOALS = ['strength', 'hypertrophy', 'endurance'] as const;
export type TrainingGoal = (typeof TRAINING_GOALS)[number];

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const SPLIT_PREFERENCES = ['auto', 'full_body', 'upper_lower', 'push_pull_legs'] as const;
export type SplitPreference = (typeof SPLIT_PREFERENCES)[number];

export const DELOAD_PLACEMENTS = ['none', 'every_n_cycles', 'final_cycle_only'] as const;
export type DeloadPlacement = (typeof DELOAD_PLACEMENTS)[number];

export const EMPHASIS_LEVELS = ['deprioritize', 'normal', 'emphasize'] as const;
export type EmphasisLevel = (typeof EMPHASIS_LEVELS)[number];

// These five vocabularies get NO Postgres CHECK and NO sync.service.ts branch, unlike
// docs/catalog-load-types.md's four-layer pattern — they are parameters to the pure
// generateProgram function (packages/program-generator) and never become a synced column. There
// is no row to validate on write because there is no row at all (11-RESEARCH.md Pattern 4).
