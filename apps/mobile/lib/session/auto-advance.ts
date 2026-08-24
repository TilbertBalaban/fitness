import { WORKING_SET_TYPE } from '@fitness/api-contracts';

export interface AutoAdvanceSetInput {
  setType: string;
  completed: boolean;
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
}

// Pure — no database, no navigation (LOG-13). Returns the next exercise index, or null when auto-
// advance should not fire: disabled, an incomplete WORKING set remains, the just-completed set was
// a warm-up, or the current exercise is already the last one (no wrap-around). Filters on set_type
// explicitly — never infers it from set_index position (RESEARCH.md Pitfall 2).
export function shouldAutoAdvance({
  sets,
  enabled,
  currentIndex,
  exerciseCount,
  completedSetType,
}: ShouldAutoAdvanceInput): number | null {
  if (!enabled) return null;
  if (completedSetType !== WORKING_SET_TYPE) return null;

  const workingSets = sets.filter((set) => set.setType === WORKING_SET_TYPE);
  const allWorkingComplete = workingSets.length > 0 && workingSets.every((set) => set.completed);
  if (!allWorkingComplete) return null;

  if (currentIndex >= exerciseCount - 1) return null;

  return currentIndex + 1;
}
