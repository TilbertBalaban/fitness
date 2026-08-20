// Gap-based ordering (04-02's answer to the discretion item CONTEXT.md left open) — integer gaps,
// not fractional indices. Both approaches solve the offline-reorder-conflict problem (two devices
// each rewriting a whole contiguous list offline produce a row-level-LWW interleaving that matches
// neither user's intent); integer gaps were chosen because routine_day.order_index and
// routine_exercise.order_index are already `integer NOT NULL` on both Postgres and SQLite, so this
// needs no column widening, no change to sync.service.ts's isNonNegativeInteger validator, and no
// divergence from session_exercise.order_index, which stays an integer.
//
// Pure, synchronous, no database import — every day/exercise write helper in this phase (and every
// cycle write helper from 04-06) seeds its arithmetic from here, and every read path sorts through
// sortByOrderThenId, so an LWW-produced tie can never render differently on two renders of the
// same data.

export const ORDER_INDEX_GAP = 1024;

export function appendOrderIndex(existing: number[]): number {
  if (existing.length === 0) return ORDER_INDEX_GAP;
  return Math.max(...existing) + ORDER_INDEX_GAP;
}

// Inserting before the current first row must not produce 0 or a negative index, since the server
// rejects a negative order_index — the "only after" branch floors at half of after rather than
// after - GAP.
export function midpointOrderIndex(before: number | null, after: number | null): number | null {
  if (before !== null && after !== null) {
    return after - before >= 2 ? Math.floor((before + after) / 2) : null;
  }
  if (before === null && after !== null) {
    return after >= 2 ? Math.floor(after / 2) : null;
  }
  if (before !== null && after === null) {
    return before + ORDER_INDEX_GAP;
  }
  return ORDER_INDEX_GAP;
}

export function needsRenumber(before: number | null, after: number | null): boolean {
  return midpointOrderIndex(before, after) === null;
}

export function renumberOrderIndexes(orderedIds: string[]): { id: string; orderIndex: number }[] {
  return orderedIds.map((id, index) => ({ id, orderIndex: (index + 1) * ORDER_INDEX_GAP }));
}

// Ascending orderIndex, ties broken by ascending id — the order is total and stable even when two
// rows share an index (an LWW artifact), so the same local database always produces the same
// sequence regardless of how many times it is rendered.
export function sortByOrderThenId<T extends { id: string; orderIndex: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
}
