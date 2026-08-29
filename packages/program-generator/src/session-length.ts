import type { GeneratedSlot } from './result';

// This project's own estimates — not measured, not sourced from MacroFactor (which publishes
// none of this math either). WORK_SECONDS_PER_SET is the assumed time actually under load plus
// transition; SESSION_OVERHEAD_MINUTES covers warm-up, changing between stations, and the walk
// to/from the gym floor.
export const WORK_SECONDS_PER_SET = 45;
export const SESSION_OVERHEAD_MINUTES = 10;

export function estimateSlotMinutes(targetSets: number, targetRestSeconds: number): number {
  return (targetSets * (WORK_SECONDS_PER_SET + targetRestSeconds)) / 60;
}

export interface TrimToSessionLengthResult {
  slots: GeneratedSlot[];
  removedCount: number;
  overBudgetMinutes: number;
}

function totalMinutes(slots: GeneratedSlot[]): number {
  const slotMinutes = slots.reduce(
    (sum, slot) => sum + estimateSlotMinutes(slot.base.targetSets ?? 0, slot.base.targetRestSeconds ?? 0),
    0,
  );
  return slotMinutes + SESSION_OVERHEAD_MINUTES;
}

// D-14: session length constrains exercise COUNT per day, never a slot's own set count — cutting
// sets would silently invalidate the volume targets weeklySetTarget/applyEmphasis already
// computed. Removes whole slots from the end of the day until the estimate fits the budget, never
// returns an empty list for a non-empty input (the last slot always survives, reporting the
// shortfall instead), and neither mutates nor reorders its input array.
export function trimToSessionLength(slots: GeneratedSlot[], sessionLengthMinutes: number): TrimToSessionLengthResult {
  let working = [...slots];
  let removedCount = 0;

  while (working.length > 1 && totalMinutes(working) > sessionLengthMinutes) {
    working = working.slice(0, -1);
    removedCount += 1;
  }

  const finalTotal = totalMinutes(working);
  const overBudgetMinutes = finalTotal > sessionLengthMinutes ? finalTotal - sessionLengthMinutes : 0;

  return { slots: working, removedCount, overBudgetMinutes };
}
