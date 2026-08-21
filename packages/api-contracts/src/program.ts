// Additive-only from this commit forward — every client build in the field reads this tuple
// back through its declared order and membership. Append only; never insert, never reorder.

export const ROUTINE_STATUSES = ['draft', 'ready'] as const;
export type RoutineStatus = (typeof ROUTINE_STATUSES)[number];

// A deload is a cycle you still train (lighter); time off is a cycle you do not train at all —
// those are the only two exceptions to a training cycle PROG-05/PROG-06 name. Deload/time-off
// position (start or end of the program) is order_index, not a fourth/fifth kind — see
// docs/program-vocabularies.md.
export const CYCLE_KINDS = ['training', 'deload', 'time_off'] as const;
export type CycleKind = (typeof CYCLE_KINDS)[number];
