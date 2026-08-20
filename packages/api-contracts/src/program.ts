// Additive-only from this commit forward — every client build in the field reads this tuple
// back through its declared order and membership. Append only; never insert, never reorder.

export const ROUTINE_STATUSES = ['draft', 'ready'] as const;
export type RoutineStatus = (typeof ROUTINE_STATUSES)[number];
