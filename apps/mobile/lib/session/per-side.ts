// Pure module, no React and no database access — mirrors superset.ts's shape. Every function
// takes the already-loaded rows for ONE exercise as its first argument; nothing here resolves its
// own state.
export const SIDE_LEFT = 'left';
export const SIDE_RIGHT = 'right';

export interface PerSideRowInput {
  id: string;
  parentSetId: string | null;
  side: string | null;
  setType: string;
  completed: boolean;
}

// D-21 makes the mode derived from data with no column: an exercise is in per-side mode when any
// of its rows carries a non-null side. D-22 requires the mode to be switchable OFF while paired
// sets already exist — a purely derived value can never express that, since the data that made it
// true never goes away. The override is what makes "turn it off" expressible at all: when defined
// it wins outright over the derived value in either direction. The override is deliberately
// ephemeral — it lives in screen state (workout.tsx's perSideOverrideByExercise), never a
// persisted column, so after an app restart the derived-from-data value takes over again.
export function isPerSideMode(rows: PerSideRowInput[], override: boolean | undefined): boolean {
  if (override !== undefined) return override;
  return rows.some((row) => row.side !== null);
}

// A new set is never stamped 'right' — the right row is always created as a child of a left
// parent on completion (D-20), never as a fresh draft's own side.
export function sideForNewSet(rows: PerSideRowInput[], override: boolean | undefined): string | null {
  return isPerSideMode(rows, override) ? SIDE_LEFT : null;
}

// The trigger source for the automatic right-side child: a per-side pair is always exactly two
// entries — never an open-ended group the lifter chooses when to stop adding to (unlike drop/
// myorep/partial's explicit "+" control) — which is why per-side has no add control of its own
// even though it reuses every other part of the grouped-row contract. Returns the id of every
// COMPLETED parent carrying side left that has no child carrying side right yet; returns nothing
// once that child exists (the idempotency the call site relies on), for an incomplete parent (the
// child appears on completion, not on creation), or for a parent with a null side (a drop/myorep/
// partial group's own parent never gains a phantom right row — the two grouping mechanisms share
// parent_set_id but never each other's triggers).
export function parentsAwaitingRightSide(rows: PerSideRowInput[]): string[] {
  const awaiting: string[] = [];
  for (const row of rows) {
    if (row.parentSetId !== null) continue;
    if (row.side !== SIDE_LEFT) continue;
    if (!row.completed) continue;
    const hasRightChild = rows.some((candidate) => candidate.parentSetId === row.id && candidate.side === SIDE_RIGHT);
    if (!hasRightChild) awaiting.push(row.id);
  }
  return awaiting;
}
