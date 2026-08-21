// Every piece of arithmetic the drag handle needs, as pure functions — the gesture layer computes
// nothing itself, it only reads a `translationY` off the pan event and hands it here. Deliberately
// has no react/react-native/drizzle-orm import: this module is testable with zero rendering and
// zero database, and reused identically by DragHandle.tsx and DragHandle.web.tsx.

// The collapsed slot row's height in points — the single constant the row layout (ExerciseSlotRow)
// and this drop calculation share, so a drag of exactly one row's height always resolves to moving
// exactly one position.
export const SLOT_ROW_HEIGHT = 72;

export interface ComputeDropTargetInput {
  fromIndex: number;
  translationY: number;
  count: number;
}

export interface DropTarget {
  toIndex: number;
}

// Rounds the drag distance to whole rows of movement, adds it to the starting index, and clamps
// into [0, count - 1]. count <= 1 always yields 0 — a single-element list (or an empty one) has
// nowhere else to go, so this branch never needs to reach the clamp math.
export function computeDropTarget({ fromIndex, translationY, count }: ComputeDropTargetInput): DropTarget {
  if (count <= 1) return { toIndex: 0 };
  const rowsMoved = Math.round(translationY / SLOT_ROW_HEIGHT);
  const toIndex = Math.min(Math.max(fromIndex + rowsMoved, 0), count - 1);
  return { toIndex };
}

export interface ReorderNeighbours {
  beforeId: string | null;
  afterId: string | null;
}

// Removes movedId from its own neighbour computation first — the off-by-one this function exists
// to get right once, rather than in every caller. beforeId/afterId are read from the remaining
// list at toIndex, so the moved row's own current position never pollutes the answer.
export function neighboursForIndex(orderedIds: string[], movedId: string, toIndex: number): ReorderNeighbours {
  const remaining = orderedIds.filter((id) => id !== movedId);
  const beforeId = toIndex > 0 ? (remaining[toIndex - 1] ?? null) : null;
  const afterId = toIndex < remaining.length ? (remaining[toIndex] ?? null) : null;
  return { beforeId, afterId };
}
