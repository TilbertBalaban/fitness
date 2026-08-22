import { eq, inArray } from 'drizzle-orm';
import { generateClientId } from '../id';
import { getPowerSync, type WriteDb } from '../powersync';
import { routine, routineCycle, routineDay, routineExercise, routineExerciseCycleTarget } from '../schema';
import { loadProgramTree } from './load-program';
import { appendOrderIndex } from './order-index';

export interface DuplicateResult {
  id: string;
}

export interface DuplicateRoutineInput {
  sourceRoutineId: string;
  name: string;
}

// A copy has no exercise names to render, so an empty map short-circuits loadProgramTree's own
// name-map load — two selects that would otherwise run per duplicate purely to populate a field this
// function never reads.
const NO_EXERCISE_NAMES = new Map<string, string>();

// Deep copy with fresh client ids throughout (D-18/D-03). The whole correctness argument is the id
// maps: one per source table, every copied foreign key rewritten through the map that owns it. A key
// rewritten from the wrong map — or not rewritten at all — produces a copy whose children point back
// into the source program, which stays invisible until the user edits one copy and both change.
//
// The source is read through loadProgramTree's fixed five queries rather than a query per day or per
// exercise, so the read cost is the same for a three-exercise program and a thirty-exercise one.
export async function duplicateRoutine(
  { sourceRoutineId, name }: DuplicateRoutineInput,
  db: WriteDb = getPowerSync(),
): Promise<DuplicateResult> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Program name is required');
  }

  const tree = await loadProgramTree(sourceRoutineId, db, NO_EXERCISE_NAMES);
  if (!tree) {
    throw new Error('Program not found');
  }

  const routineId = generateClientId();
  await db.insert(routine).values({
    id: routineId,
    name: trimmed,
    goal: tree.goal,
    // A duplicate is always a fresh draft: it has been authored by nobody yet, progression has never
    // touched it, and it is not archived. It also never becomes the active program by being created —
    // nothing in this function reads or writes user_preference.
    status: 'draft',
    progressionFrozen: false,
    source: 'user',
    createdFromTemplateId: sourceRoutineId,
    archivedAt: null,
  });

  const cycleIdBySourceId = new Map<string, string>();
  for (const cycle of tree.cycles) {
    const id = generateClientId();
    cycleIdBySourceId.set(cycle.id, id);
    await db.insert(routineCycle).values({
      id,
      routineId,
      orderIndex: cycle.orderIndex,
      name: cycle.name,
      kind: cycle.kind,
      durationDays: cycle.durationDays,
    });
  }

  for (const day of tree.days) {
    const dayId = generateClientId();
    // The source's gaps are preserved rather than renumbered densely: order_index is gap-based, and
    // a copy that renumbers would give the duplicate a different insertion headroom than the program
    // it was copied from.
    await db.insert(routineDay).values({
      id: dayId,
      routineId,
      orderIndex: day.orderIndex,
      name: day.name,
      isRestDay: day.isRestDay,
    });

    for (const slot of day.slots) {
      const slotId = generateClientId();
      await db.insert(routineExercise).values({
        id: slotId,
        routineDayId: dayId,
        exerciseId: slot.exerciseId,
        orderIndex: slot.orderIndex,
        // supersetGroupId, progressionSchemeId and notes are written null rather than copied because
        // loadProgramTree does not return them and nothing in the app writes them yet (D-11 defers
        // supersets and progression schemes; addExercisesToDay hardcodes all three to null). The fix
        // when they become writable is to widen ProgramSlot so every tree consumer sees them, not to
        // bolt a second read onto this one caller.
        supersetGroupId: null,
        targetSets: slot.targetSets,
        targetRepMin: slot.targetRepMin,
        targetRepMax: slot.targetRepMax,
        targetRir: slot.targetRir,
        targetRestSeconds: slot.targetRestSeconds,
        progressionSchemeId: null,
        notes: null,
      });

      for (const [sourceCycleId, override] of Object.entries(slot.overridesByCycleId)) {
        const cycleId = cycleIdBySourceId.get(sourceCycleId);
        if (!cycleId) continue;

        await db.insert(routineExerciseCycleTarget).values({
          id: generateClientId(),
          routineExerciseId: slotId,
          cycleId,
          targetSets: override.targetSets ?? null,
          targetRepMin: override.targetRepMin ?? null,
          targetRepMax: override.targetRepMax ?? null,
          targetRir: override.targetRir ?? null,
          targetRestSeconds: override.targetRestSeconds ?? null,
        });
      }
    }
  }

  return { id: routineId };
}

export interface DuplicateDayInput {
  routineDayId: string;
  name: string;
}

// A day duplicated within its own program, appended after the last one. Its overrides keep their
// cycleId untouched: the copy lives in the same program and therefore under the same cycles, so
// remapping cycle ids here would point every copied override at a cycle that does not exist.
export async function duplicateDay(
  { routineDayId, name }: DuplicateDayInput,
  db: WriteDb = getPowerSync(),
): Promise<DuplicateResult> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Day name is required');
  }

  const [sourceDay] = await db
    .select({ id: routineDay.id, routineId: routineDay.routineId, isRestDay: routineDay.isRestDay })
    .from(routineDay)
    .where(eq(routineDay.id, routineDayId));

  if (!sourceDay) {
    throw new Error('Day not found');
  }

  const siblings = await db
    .select({ orderIndex: routineDay.orderIndex })
    .from(routineDay)
    .where(eq(routineDay.routineId, sourceDay.routineId));

  const sourceSlots = await db
    .select({
      id: routineExercise.id,
      exerciseId: routineExercise.exerciseId,
      orderIndex: routineExercise.orderIndex,
      supersetGroupId: routineExercise.supersetGroupId,
      targetSets: routineExercise.targetSets,
      targetRepMin: routineExercise.targetRepMin,
      targetRepMax: routineExercise.targetRepMax,
      targetRir: routineExercise.targetRir,
      targetRestSeconds: routineExercise.targetRestSeconds,
      progressionSchemeId: routineExercise.progressionSchemeId,
      notes: routineExercise.notes,
    })
    .from(routineExercise)
    .where(eq(routineExercise.routineDayId, routineDayId));

  const sourceSlotIds = sourceSlots.map((slot) => slot.id);
  const sourceOverrides = sourceSlotIds.length
    ? await db
        .select({
          routineExerciseId: routineExerciseCycleTarget.routineExerciseId,
          cycleId: routineExerciseCycleTarget.cycleId,
          targetSets: routineExerciseCycleTarget.targetSets,
          targetRepMin: routineExerciseCycleTarget.targetRepMin,
          targetRepMax: routineExerciseCycleTarget.targetRepMax,
          targetRir: routineExerciseCycleTarget.targetRir,
          targetRestSeconds: routineExerciseCycleTarget.targetRestSeconds,
        })
        .from(routineExerciseCycleTarget)
        .where(inArray(routineExerciseCycleTarget.routineExerciseId, sourceSlotIds))
    : [];

  const dayId = generateClientId();
  await db.insert(routineDay).values({
    id: dayId,
    routineId: sourceDay.routineId,
    orderIndex: appendOrderIndex(siblings.map((row) => row.orderIndex)),
    name: trimmed,
    isRestDay: sourceDay.isRestDay,
  });

  const slotIdBySourceId = new Map<string, string>();
  for (const slot of sourceSlots) {
    const slotId = generateClientId();
    slotIdBySourceId.set(slot.id, slotId);
    await db.insert(routineExercise).values({
      id: slotId,
      routineDayId: dayId,
      exerciseId: slot.exerciseId,
      orderIndex: slot.orderIndex,
      supersetGroupId: slot.supersetGroupId,
      targetSets: slot.targetSets,
      targetRepMin: slot.targetRepMin,
      targetRepMax: slot.targetRepMax,
      targetRir: slot.targetRir,
      targetRestSeconds: slot.targetRestSeconds,
      progressionSchemeId: slot.progressionSchemeId,
      notes: slot.notes,
    });
  }

  for (const override of sourceOverrides) {
    const routineExerciseId = slotIdBySourceId.get(override.routineExerciseId);
    if (!routineExerciseId) continue;

    await db.insert(routineExerciseCycleTarget).values({
      id: generateClientId(),
      routineExerciseId,
      cycleId: override.cycleId,
      targetSets: override.targetSets,
      targetRepMin: override.targetRepMin,
      targetRepMax: override.targetRepMax,
      targetRir: override.targetRir,
      targetRestSeconds: override.targetRestSeconds,
    });
  }

  return { id: dayId };
}
