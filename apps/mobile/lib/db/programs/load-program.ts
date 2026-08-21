import type { CycleKind, TargetOverride } from '@fitness/api-contracts';
import { eq, inArray } from 'drizzle-orm';
import { getPowerSync, type WriteDb } from '../powersync';
import { exercise, routine, routineCycle, routineDay, routineExercise, routineExerciseCycleTarget, seededExercise } from '../schema';
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
  // Only the cycles that actually override this slot appear here — the table is sparse by
  // construction (setCycleTarget deletes rather than writing an all-null row), and an override
  // naming a cycle that no longer exists is dropped at load rather than resolved.
  overridesByCycleId: Record<string, TargetOverride>;
}

export interface ProgramCycle {
  id: string;
  name: string;
  kind: CycleKind;
  orderIndex: number;
  durationDays: number | null;
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
  cycles: ProgramCycle[];
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

  const cycleRows = await db
    .select({
      id: routineCycle.id,
      name: routineCycle.name,
      kind: routineCycle.kind,
      orderIndex: routineCycle.orderIndex,
      durationDays: routineCycle.durationDays,
    })
    .from(routineCycle)
    .where(eq(routineCycle.routineId, routineId));

  const cycles: ProgramCycle[] = sortByOrderThenId(cycleRows).map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind as CycleKind,
    orderIndex: row.orderIndex,
    durationDays: row.durationDays,
  }));

  const slotIds = exerciseRows.map((row) => row.id);
  const overrideRows = slotIds.length
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
        .where(inArray(routineExerciseCycleTarget.routineExerciseId, slotIds))
    : [];

  const loadedCycleIds = new Set(cycles.map((cycle) => cycle.id));
  const overridesBySlotId = new Map<string, Record<string, TargetOverride>>();
  for (const row of overrideRows) {
    // A dangling override is unreachable from the strip and would otherwise resolve targets for a
    // cycle the user cannot select.
    if (!loadedCycleIds.has(row.cycleId)) continue;

    const forSlot = overridesBySlotId.get(row.routineExerciseId) ?? {};
    forSlot[row.cycleId] = {
      targetSets: row.targetSets,
      targetRepMin: row.targetRepMin,
      targetRepMax: row.targetRepMax,
      targetRir: row.targetRir,
      targetRestSeconds: row.targetRestSeconds,
    };
    overridesBySlotId.set(row.routineExerciseId, forSlot);
  }

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
      overridesByCycleId: overridesBySlotId.get(row.id) ?? {},
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
    cycles,
  };
}
