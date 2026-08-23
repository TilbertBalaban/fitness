import type { CycleKind } from '@fitness/api-contracts';
import { sortByOrderThenId } from '../db/programs/order-index';

// D-20: where you are in the program is derived from logged history at read time, never stored as
// a cursor. This module is the whole derivation, and it is pure — no database, no React, and no
// clock read of any kind. `today` arrives as an argument so every calendar boundary below is a
// unit test rather than a fixture. sortByOrderThenId is imported rather than re-implemented; it is a
// dependency-free comparator that happens to live under lib/db, and a second copy of the
// tie-breaking rule is exactly how two reads of the same data start disagreeing.

// Structural minimums, so ProgramDay/ProgramCycle (lib/db/programs/load-program) satisfy these
// without this module importing them. The generic parameters carry the caller's richer types
// straight back out through the result.
export interface PositionDay {
  id: string;
  orderIndex: number;
}

export interface PositionCycle {
  id: string;
  orderIndex: number;
  kind: CycleKind;
  durationDays: number | null;
}

export interface SessionRecord {
  id: string;
  routineDayId: string | null;
  status: string;
  startedAt: string;
  localDate: string;
}

export interface ResolveNextUpInput<D extends PositionDay, C extends PositionCycle> {
  routine: { id: string } | null;
  days: D[];
  cycles: C[];
  history: SessionRecord[];
  today: string;
}

export type NextUp<D extends PositionDay, C extends PositionCycle> =
  | { kind: 'no-active-program' }
  | { kind: 'no-days' }
  | { kind: 'workout'; cycle: C | null; day: D }
  | { kind: 'time-off'; cycle: C; daysRemaining: number }
  | { kind: 'program-complete'; lastCycle: C | null };

const COMPLETED = 'completed';

function completedSessions(sessions: SessionRecord[]): SessionRecord[] {
  return sessions
    .filter((row) => row.status === COMPLETED && row.routineDayId !== null)
    .sort((a, b) => {
      if (a.localDate !== b.localDate) return a.localDate < b.localDate ? -1 : 1;
      if (a.startedAt !== b.startedAt) return a.startedAt < b.startedAt ? -1 : 1;
      if (a.id === b.id) return 0;
      return a.id < b.id ? -1 : 1;
    });
}

// The sessions that count toward rotation position: completed, logged against a routine day, and
// against a day that still exists. A session whose day was deleted stops consuming a position, so
// deleting a day rewinds the rotation instead of pushing the lifter forward through a program that
// is now shorter than the history claims.
export function countableHistory<D extends PositionDay>(
  sessions: SessionRecord[],
  days: D[],
): SessionRecord[] {
  const dayIds = new Set(days.map((row) => row.id));
  return completedSessions(sessions).filter((row) => dayIds.has(row.routineDayId as string));
}

// Which day of the rotation the lifter last actually trained (D-20: "the next day is the one
// following the most recent completed session's routine_day_id"). Null when there is no history at
// all, and null when that day has since been deleted — 04-UI-SPEC's Pitfall-5 rule turns the
// second case into a silent fall back to the first day of the current cycle, never a visible
// error.
export function lastLoggedDayIndex<D extends PositionDay>(
  sessions: SessionRecord[],
  days: D[],
): number | null {
  const completed = completedSessions(sessions);
  const last = completed[completed.length - 1];
  if (!last) return null;
  const index = sortByOrderThenId(days).findIndex((row) => row.id === last.routineDayId);
  return index === -1 ? null : index;
}

// How many rotation positions a cycle consumes. A deload is a lighter week you still train, so it
// consumes a full rotation exactly like a training cycle; time off is not trained at all, so it
// consumes none and its length is measured in calendar days instead (docs/program-vocabularies.md).
export function cycleSpan(cycle: PositionCycle, dayCount: number): number {
  return cycle.kind === 'time_off' ? 0 : dayCount;
}

const MS_PER_DAY = 86_400_000;

// Whole calendar days between two YYYY-MM-DD local-date strings. The device stamps local_date at
// session start (LOG-22) precisely so this arithmetic never goes through a timezone, and a clock
// that has moved backwards floors at zero rather than inventing time that has not passed.
function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.round((dayNumber(to) - dayNumber(from)) / MS_PER_DAY));
}

function dayNumber(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function resolveNextUp<D extends PositionDay, C extends PositionCycle>({
  routine,
  days,
  cycles,
  history,
  today,
}: ResolveNextUpInput<D, C>): NextUp<D, C> {
  if (!routine) return { kind: 'no-active-program' };

  const orderedDays = sortByOrderThenId(days);
  const dayCount = orderedDays.length;
  if (dayCount === 0) return { kind: 'no-days' };

  const lastIndex = lastLoggedDayIndex(history, orderedDays);
  const dayIndex = lastIndex === null ? 0 : (lastIndex + 1) % dayCount;
  const day = orderedDays[dayIndex];

  const orderedCycles = sortByOrderThenId(cycles);
  if (orderedCycles.length === 0) {
    return { kind: 'workout', cycle: null, day };
  }

  const countable = countableHistory(history, orderedDays);
  const completed = completedSessions(history);
  const lastCompleted = completed[completed.length - 1];
  let remaining = countable.length;
  let elapsed = daysBetween(lastCompleted ? lastCompleted.localDate : today, today);

  for (const cycle of orderedCycles) {
    if (cycle.kind === 'time_off') {
      // Unreachable while preceding cycles still owe rotation positions — a time-off cycle spans
      // zero of them — but a routine synced from another client is not required to be coherent.
      if (remaining > 0) continue;
      // updateCycle makes this shape unwritable from this client, but routine_cycle reconciles by
      // row-level LWW like every other row, so a concurrent kind change and duration clear can
      // still converge to it. Stepping over the cycle keeps the walk finite; the user repairs the
      // duration in the Edit Cycle form.
      if (cycle.durationDays === null) continue;
      if (elapsed < cycle.durationDays) {
        return { kind: 'time-off', cycle, daysRemaining: Math.max(0, cycle.durationDays - elapsed) };
      }
      elapsed -= cycle.durationDays;
      continue;
    }

    const span = cycleSpan(cycle, dayCount);
    if (remaining >= span) {
      remaining -= span;
      continue;
    }
    return { kind: 'workout', cycle, day };
  }

  // The block does not loop. Silently restarting it would make "which cycle am I in" answer
  // differently for the same history depending only on how long ago the block ended.
  return { kind: 'program-complete', lastCycle: orderedCycles[orderedCycles.length - 1] ?? null };
}
