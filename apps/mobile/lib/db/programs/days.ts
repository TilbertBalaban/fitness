import { eq } from 'drizzle-orm';
import { generateClientId } from '../id';
import { getPowerSync, type WriteDb, type WriteTx } from '../powersync';
import { routineDay, routineExercise } from '../schema';
import { appendOrderIndex, midpointOrderIndex, needsRenumber, renumberOrderIndexes, sortByOrderThenId } from './order-index';

export interface AddDayInput {
  routineId: string;
  name: string;
}

// Trimmed and required at the write boundary, matching createRoutine's own name contract — a
// blank day name throws rather than silently skipping the write, so the client never produces an
// op the server's isInvalidRoutineDay would reject anyway.
export async function addDay({ routineId, name }: AddDayInput, db: WriteDb = getPowerSync()): Promise<string> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Day name is required');
  }

  const existingRows = await db
    .select({ orderIndex: routineDay.orderIndex })
    .from(routineDay)
    .where(eq(routineDay.routineId, routineId));

  const id = generateClientId();
  await db.insert(routineDay).values({
    id,
    routineId,
    orderIndex: appendOrderIndex(existingRows.map((row) => row.orderIndex)),
    name: trimmed,
    isRestDay: false,
  });

  return id;
}

export async function renameDay(dayId: string, name: string, db: WriteDb = getPowerSync()): Promise<void> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Day name is required');
  }

  await db.update(routineDay).set({ name: trimmed }).where(eq(routineDay.id, dayId));
}

// The local PowerSync schema and the Postgres FK both cascade routine_exercise rows onto their
// day's delete — a manual per-row delete here would emit redundant crud ops for rows the cascade
// already removes.
export async function removeDay(dayId: string, db: WriteDb = getPowerSync()): Promise<void> {
  await db.delete(routineDay).where(eq(routineDay.id, dayId));
}

export interface SiblingRow {
  id: string;
  orderIndex: number;
}

// Shared move arithmetic behind moveDay/moveExercise — sort siblings, resolve the anchors' current
// indexes (either may be null, meaning "at the start"/"at the end"), and either write one midpoint
// onto the moved row or renumber the whole sibling order in one pass with the moved row already
// placed at its target position. Never renumber-then-midpoint (that would be two writes where the
// gap scheme promises one).
export function computeReorder(
  siblings: SiblingRow[],
  movedId: string,
  beforeId: string | null,
  afterId: string | null,
): { id: string; orderIndex: number }[] {
  const sorted = sortByOrderThenId(siblings);
  const beforeOrderIndex = beforeId ? (sorted.find((row) => row.id === beforeId)?.orderIndex ?? null) : null;
  const afterOrderIndex = afterId ? (sorted.find((row) => row.id === afterId)?.orderIndex ?? null) : null;

  if (!needsRenumber(beforeOrderIndex, afterOrderIndex)) {
    const orderIndex = midpointOrderIndex(beforeOrderIndex, afterOrderIndex) as number;
    return [{ id: movedId, orderIndex }];
  }

  const withoutMoved = sorted.filter((row) => row.id !== movedId);
  const beforeIndex = beforeId ? withoutMoved.findIndex((row) => row.id === beforeId) : -1;
  const insertAt = beforeId ? beforeIndex + 1 : 0;
  const orderedIds = [
    ...withoutMoved.slice(0, insertAt).map((row) => row.id),
    movedId,
    ...withoutMoved.slice(insertAt).map((row) => row.id),
  ];

  const renumbered = renumberOrderIndexes(orderedIds);
  const currentOrderIndexById = new Map(sorted.map((row) => [row.id, row.orderIndex]));
  return renumbered.filter((row) => currentOrderIndexById.get(row.id) !== row.orderIndex);
}

export interface MoveDayInput {
  routineId: string;
  dayId: string;
  beforeId: string | null;
  afterId: string | null;
}

export async function moveDay({ routineId, dayId, beforeId, afterId }: MoveDayInput, db: WriteDb = getPowerSync()): Promise<void> {
  const siblings = await db
    .select({ id: routineDay.id, orderIndex: routineDay.orderIndex })
    .from(routineDay)
    .where(eq(routineDay.routineId, routineId));

  const updates = computeReorder(siblings, dayId, beforeId, afterId);
  // The renumber branch can emit one update per sibling. Interrupted halfway it leaves duplicate
  // order_index values, which sortByOrderThenId still renders stably — so the list is not the one
  // the user dragged to and nothing looks wrong.
  await db.transaction(async (tx: WriteTx) => {
    for (const update of updates) {
      await tx.update(routineDay).set({ orderIndex: update.orderIndex }).where(eq(routineDay.id, update.id));
    }
  });
}

export interface MoveExerciseInput {
  routineDayId: string;
  exerciseId: string;
  beforeId: string | null;
  afterId: string | null;
}

export async function moveExercise(
  { routineDayId, exerciseId, beforeId, afterId }: MoveExerciseInput,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  const siblings = await db
    .select({ id: routineExercise.id, orderIndex: routineExercise.orderIndex })
    .from(routineExercise)
    .where(eq(routineExercise.routineDayId, routineDayId));

  const updates = computeReorder(siblings, exerciseId, beforeId, afterId);
  await db.transaction(async (tx: WriteTx) => {
    for (const update of updates) {
      await tx.update(routineExercise).set({ orderIndex: update.orderIndex }).where(eq(routineExercise.id, update.id));
    }
  });
}

export interface AddExercisesToDayInput {
  routineDayId: string;
  exerciseIds: string[];
}

// One row per id, in the given order, each GAP past the previous — never deduplicated, since a day
// legitimately contains the same movement twice (e.g. a warm-up and a working set of the same
// lift as distinct slots). supersetGroupId/progressionSchemeId/notes stay null (superset authoring
// and progression schemes are out of scope this phase, D-11); all five target_* fields start null —
// a freshly added exercise is unprescribed until the builder sets targets (Task 3/04-03).
export async function addExercisesToDay(
  { routineDayId, exerciseIds }: AddExercisesToDayInput,
  db: WriteDb = getPowerSync(),
): Promise<string[]> {
  if (exerciseIds.length === 0) return [];

  const existingRows = await db
    .select({ orderIndex: routineExercise.orderIndex })
    .from(routineExercise)
    .where(eq(routineExercise.routineDayId, routineDayId));

  let existing = existingRows.map((row) => row.orderIndex);
  const ids: string[] = [];

  // One transaction for the whole multi-select: adding six exercises is one act, and a partial
  // apply would leave the day holding a subset the user never chose.
  await db.transaction(async (tx: WriteTx) => {
    for (const exerciseId of exerciseIds) {
      const id = generateClientId();
      const orderIndex = appendOrderIndex(existing);
      existing = [...existing, orderIndex];

      await tx.insert(routineExercise).values({
        id,
        routineDayId,
        exerciseId,
        orderIndex,
        supersetGroupId: null,
        targetSets: null,
        targetRepMin: null,
        targetRepMax: null,
        targetRir: null,
        targetRestSeconds: null,
        progressionSchemeId: null,
        notes: null,
      });

      ids.push(id);
    }
  });

  return ids;
}

export async function removeExercise(routineExerciseId: string, db: WriteDb = getPowerSync()): Promise<void> {
  await db.delete(routineExercise).where(eq(routineExercise.id, routineExerciseId));
}
