import { WORKING_SET_TYPE } from '@fitness/api-contracts';

export interface AutoAdvanceSetInput {
  setType: string;
  completed: boolean;
  parentSetId: string | null;
}

export interface ShouldAutoAdvanceInput {
  sets: AutoAdvanceSetInput[];
  enabled: boolean;
  currentIndex: number;
  exerciseCount: number;
  // Which set_type was just completed — required to tell "the last working set just finished"
  // apart from "a warm-up finished while every working set already stood complete." A caller
  // updates this the instant it acts on a completion, so this parameter is always the true source
  // of the just-completed event, never inferred from aggregate row state.
  completedSetType: string;
  // The exercise's prescribed working-set count (session_exercise.target_sets), not merely how
  // many rows happen to exist yet. `sets` only ever contains ROWS THAT EXIST, so on a 3-target
  // exercise, completing the first of three leaves `sets` at length 1 — "every existing working
  // set is complete" is trivially true there, which used to fire advance after set 1 of 3
  // (WINDOWS #136). null/0 means no prescription (a one-off/ad-hoc exercise): falls back to "every
  // logged working set complete", the only definition available with no target to compare against.
  targetWorkingSets: number | null;
}

// Pure — no database, no navigation (LOG-13). Returns the next exercise index, or null when auto-
// advance should not fire: disabled, the prescribed working-set count has not yet all been logged
// and completed, the just-completed set was a warm-up, or the current exercise is already the last
// one (no wrap-around). Filters on set_type explicitly — never infers it from set_index position
// (RESEARCH.md Pitfall 2).
//
// D-10/D-19: a parent row is one set toward the prescription; a drop/myorep/partial/per-side child
// adds volume but never increments the set count, so `sets` is filtered to parent rows
// (parentSetId === null) BEFORE the working-set-type filter below. Without this, the moment a set
// gains children the count inflates and advance fires mid-group — the same failure class WINDOWS
// #136 already fixed once for a different cause (there, missing rows undercounted; here, extra
// child rows overcount).
export function shouldAutoAdvance({
  sets,
  enabled,
  currentIndex,
  exerciseCount,
  completedSetType,
  targetWorkingSets,
}: ShouldAutoAdvanceInput): number | null {
  if (!enabled) return null;
  if (completedSetType !== WORKING_SET_TYPE) return null;

  const parentSets = sets.filter((set) => set.parentSetId === null);
  const workingSets = parentSets.filter((set) => set.setType === WORKING_SET_TYPE);
  if (workingSets.length === 0) return null;

  const requiredCount = targetWorkingSets !== null && targetWorkingSets > 0 ? targetWorkingSets : workingSets.length;
  const allWorkingComplete = workingSets.length >= requiredCount && workingSets.every((set) => set.completed);
  if (!allWorkingComplete) return null;

  if (currentIndex >= exerciseCount - 1) return null;

  return currentIndex + 1;
}
