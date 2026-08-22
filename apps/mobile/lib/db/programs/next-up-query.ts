import { and, eq, isNotNull } from 'drizzle-orm';
import { captureCalendarDay } from '../../calendar-day';
import type { SessionRecord } from '../../programs/next-up';
import { getPowerSync, type WriteDb } from '../powersync';
import { exerciseMuscleMapping, muscleGroup, routine, userPreference, workoutSession } from '../schema';
import { loadProgramTree, type ProgramCycle, type ProgramDay } from './load-program';

export interface NextUpData {
  routine: { id: string; name: string } | null;
  days: ProgramDay[];
  cycles: ProgramCycle[];
  history: SessionRecord[];
  musclesByExerciseId: Record<string, string[]>;
  today: string;
}

const EMPTY: Omit<NextUpData, 'today'> = {
  routine: null,
  days: [],
  cycles: [],
  history: [],
  musclesByExerciseId: {},
};

const COMPLETED = 'completed';

// The read half of the Home card, kept apart from resolveNextUp so the resolver stays testable
// without a database and this module stays testable without a renderer. Every read is one select
// per table, assembled in memory — this is the screen the app opens on, and PITFALLS.md §13's N+1
// shape is one nested loop away.
export async function loadNextUp(db: WriteDb = getPowerSync()): Promise<NextUpData> {
  const today = captureCalendarDay(new Date()).localDate;

  const [preference] = await db.select({ activeRoutineId: userPreference.activeRoutineId }).from(userPreference);
  const activeRoutineId = preference?.activeRoutineId ?? null;
  // A fresh account's Home tab must not cost twelve queries to learn there is nothing to show.
  if (!activeRoutineId) return { ...EMPTY, today };

  // Both halves of this check are reachable through ordinary sync ordering — the pointer is one
  // row and the routine is another, and PowerSync delivers them independently, so a pointer can
  // name a routine that has not arrived or one this device has not yet seen archived.
  const [routineRow] = await db
    .select({ id: routine.id, archivedAt: routine.archivedAt })
    .from(routine)
    .where(eq(routine.id, activeRoutineId));
  if (!routineRow || routineRow.archivedAt !== null) return { ...EMPTY, today };

  const tree = await loadProgramTree(activeRoutineId, db);
  if (!tree) return { ...EMPTY, today };

  // Filtered in SQL, not in JavaScript, and deliberately unlimited: countableHistory counts these
  // rows to place the lifter in the program, so a LIMIT would silently move them backwards.
  const history = await db
    .select({
      id: workoutSession.id,
      routineDayId: workoutSession.routineDayId,
      status: workoutSession.status,
      startedAt: workoutSession.startedAt,
      localDate: workoutSession.localDate,
    })
    .from(workoutSession)
    .where(and(eq(workoutSession.status, COMPLETED), isNotNull(workoutSession.routineDayId)));

  const mappings = await db
    .select({ exerciseId: exerciseMuscleMapping.exerciseId, muscleGroupId: exerciseMuscleMapping.muscleGroupId })
    .from(exerciseMuscleMapping);
  const groups = await db.select({ id: muscleGroup.id, name: muscleGroup.name }).from(muscleGroup);
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));

  const musclesByExerciseId: Record<string, string[]> = {};
  for (const day of tree.days) {
    for (const slot of day.slots) musclesByExerciseId[slot.exerciseId] ??= [];
  }
  for (const mapping of mappings) {
    const names = musclesByExerciseId[mapping.exerciseId];
    if (!names) continue;
    names.push(groupNames.get(mapping.muscleGroupId) ?? mapping.muscleGroupId);
  }

  return {
    routine: { id: tree.id, name: tree.name },
    days: tree.days,
    cycles: tree.cycles,
    history,
    musclesByExerciseId,
    today,
  };
}
