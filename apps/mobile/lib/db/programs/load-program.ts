import { eq, inArray } from 'drizzle-orm';
import { getPowerSync, type WriteDb } from '../powersync';
import { exercise, routine, routineDay, routineExercise, seededExercise } from '../schema';
import { sortByOrderThenId } from './order-index';

const UNKNOWN_EXERCISE_NAME = 'Unknown exercise';

export interface ProgramSlot {
  id: string;
  orderIndex: number;
  exerciseId: string;
  exerciseName: string;
  targetSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRir: number | null;
  targetRestSeconds: number | null;
}

export interface ProgramDay {
  id: string;
  orderIndex: number;
  name: string;
  isRestDay: boolean;
  slots: ProgramSlot[];
}

export interface ProgramTree {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  days: ProgramDay[];
}

// seededExercise (localOnly) unioned with the user's own custom exercise rows — mirrors
// loadCatalogRows' union shape exactly, but only the id/name pair the builder needs to label a
// slot, not the full catalog row. Exported so the builder screen can load this once and pass it
// into loadProgramTree across every cycle-strip selection change (04-08), rather than reloading it
// on every call.
export async function loadExerciseNameMap(db: WriteDb = getPowerSync()): Promise<Map<string, string>> {
  const seededRows = await db.select({ id: seededExercise.id, name: seededExercise.name }).from(seededExercise);
  const customRows = await db.select({ id: exercise.id, name: exercise.name }).from(exercise);

  const names = new Map<string, string>();
  for (const row of seededRows) names.set(row.id, row.name);
  for (const row of customRows) names.set(row.id, row.name);
  return names;
}

// The single read path for the program tree. One query per table, assembled in memory — never a
// query inside a loop over days or exercises (PITFALLS.md §13's textbook N+1, one join level
// deeper than the session-logging case it was originally written against). The builder holds this
// whole tree open and re-renders it on every cycle-strip selection change from 04-08, so a per-row
// read here becomes a per-row read on every interaction.
export async function loadProgramTree(
  routineId: string,
  db: WriteDb = getPowerSync(),
  exerciseNames?: Map<string, string>,
): Promise<ProgramTree | null> {
  const [routineRow] = await db
    .select({ id: routine.id, name: routine.name, goal: routine.goal, status: routine.status })
    .from(routine)
    .where(eq(routine.id, routineId));

  if (!routineRow) return null;

  const dayRows = await db
    .select({ id: routineDay.id, orderIndex: routineDay.orderIndex, name: routineDay.name, isRestDay: routineDay.isRestDay })
    .from(routineDay)
    .where(eq(routineDay.routineId, routineId));

  const dayIds = dayRows.map((row) => row.id);
  const exerciseRows = dayIds.length
    ? await db
        .select({
          id: routineExercise.id,
          routineDayId: routineExercise.routineDayId,
          orderIndex: routineExercise.orderIndex,
          exerciseId: routineExercise.exerciseId,
          targetSets: routineExercise.targetSets,
          targetRepMin: routineExercise.targetRepMin,
          targetRepMax: routineExercise.targetRepMax,
          targetRir: routineExercise.targetRir,
          targetRestSeconds: routineExercise.targetRestSeconds,
        })
        .from(routineExercise)
        .where(inArray(routineExercise.routineDayId, dayIds))
    : [];

  const names = exerciseNames ?? (await loadExerciseNameMap(db));

  const slotsByDayId = new Map<string, ProgramSlot[]>();
  for (const row of exerciseRows) {
    const slot: ProgramSlot = {
      id: row.id,
      orderIndex: row.orderIndex,
      exerciseId: row.exerciseId,
      exerciseName: names.get(row.exerciseId) ?? UNKNOWN_EXERCISE_NAME,
      targetSets: row.targetSets,
      targetRepMin: row.targetRepMin,
      targetRepMax: row.targetRepMax,
      targetRir: row.targetRir,
      targetRestSeconds: row.targetRestSeconds,
    };
    const existing = slotsByDayId.get(row.routineDayId);
    if (existing) existing.push(slot);
    else slotsByDayId.set(row.routineDayId, [slot]);
  }

  const days: ProgramDay[] = sortByOrderThenId(dayRows).map((day) => ({
    id: day.id,
    orderIndex: day.orderIndex,
    name: day.name,
    isRestDay: day.isRestDay,
    slots: sortByOrderThenId(slotsByDayId.get(day.id) ?? []),
  }));

  return {
    id: routineRow.id,
    name: routineRow.name,
    goal: routineRow.goal,
    status: routineRow.status,
    days,
  };
}
