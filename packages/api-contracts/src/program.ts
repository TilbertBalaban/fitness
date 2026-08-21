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

// The five target_* columns routine_exercise carries as its single mutable base prescription —
// routine_exercise_cycle_target (04-07) mirrors this exact shape as a sparse per-cycle override.
export interface ResolvedTarget {
  targetSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRir: number | null;
  targetRestSeconds: number | null;
}

// A partial ResolvedTarget: an override row only ever carries the fields that actually differ
// from the base, never a full five-column copy.
export type TargetOverride = Partial<ResolvedTarget>;

export const EMPTY_TARGET: ResolvedTarget = Object.freeze({
  targetSets: null,
  targetRepMin: null,
  targetRepMax: null,
  targetRir: null,
  targetRestSeconds: null,
});

// null in an override means "not overridden" (inherit the base value), never "cleared" — clearing
// a prescription is done on the base row itself. Without that rule an override table with no way
// to express "inherit" degenerates into a per-cycle copy, which is exactly the duplication D-02
// bans. Resolved per field, in five explicit lines rather than a loop, so a field added to
// ResolvedTarget later is a compile-time addition here, never a silent passthrough. Neither
// argument is mutated — this always returns a fresh object.
export function resolveTarget(
  base: ResolvedTarget,
  override: TargetOverride | null | undefined,
): ResolvedTarget {
  if (override == null) {
    return { ...base };
  }
  return {
    targetSets: override.targetSets ?? base.targetSets,
    targetRepMin: override.targetRepMin ?? base.targetRepMin,
    targetRepMax: override.targetRepMax ?? base.targetRepMax,
    targetRir: override.targetRir ?? base.targetRir,
    targetRestSeconds: override.targetRestSeconds ?? base.targetRestSeconds,
  };
}

// True when every one of the five fields is null or absent — the boundary between "an override
// that overrides nothing" (must not be written as a row) and a real override. Zero is a value, not
// an absence: isEmptyOverride({ targetSets: 0 }) is false.
export function isEmptyOverride(override: TargetOverride): boolean {
  return (
    (override.targetSets ?? null) === null &&
    (override.targetRepMin ?? null) === null &&
    (override.targetRepMax ?? null) === null &&
    (override.targetRir ?? null) === null &&
    (override.targetRestSeconds ?? null) === null
  );
}
