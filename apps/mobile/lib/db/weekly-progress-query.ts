import { and, eq, gte, inArray } from 'drizzle-orm';
import { resolveTarget, type ResolvedTarget, type SetType, type WorkoutSessionStatus } from '@fitness/api-contracts';
import {
  PROGRESS_WINDOW_DAYS,
  rollingWindowStart,
  type ProgramTargetInput,
  type WeeklyProgressExerciseInput,
  type WeeklyProgressSessionInput,
} from '@fitness/analytics-engine';
import { resolveNextUp } from '../programs/next-up';
import type { ProgramCycle, ProgramDay, ProgramSlot } from './programs/load-program';
import { loadNextUp } from './programs/next-up-query';
import { getPowerSync, type WriteDb } from './powersync';
import { exerciseMuscleMapping, loggedSet, sessionExercise, workoutSession } from './schema';

const COMPLETED_STATUS: WorkoutSessionStatus = 'completed';
const PRIMARY_ROLE = 'primary';

export interface WeeklyProgressData {
  sessions: WeeklyProgressSessionInput[];
  programTarget: ProgramTargetInput | null;
}

export interface LoadWeeklyProgressInput {
  userId: string | null;
  todayLocalDate: string;
}

const EMPTY: WeeklyProgressData = { sessions: [], programTarget: null };

interface CurrentProgram {
  days: ProgramDay[];
  cycleId: string | null;
}

// The full five-field base a slot prescribes, so resolveTarget's per-field override rule is applied
// by the shipped function rather than re-implemented for the one field this reader wants.
function baseOf(slot: ProgramSlot): ResolvedTarget {
  return {
    targetSets: slot.targetSets,
    targetRepMin: slot.targetRepMin,
    targetRepMax: slot.targetRepMax,
    targetRir: slot.targetRir,
    targetRestSeconds: slot.targetRestSeconds,
  };
}

// Which cycle the lifter is actually in, answered by the same loadNextUp + resolveNextUp pair the
// Next Up card directly above this one already uses. Re-deriving cycle selection here would be a
// second answer to a question the app already answers, and the two cards would eventually disagree
// about which program week they are describing.
//
// Only the `workout` verdict yields a target: `no-active-program`, `no-days`, `program-complete`
// and `time-off` all mean the program expresses no prescribed work to measure against right now,
// which D-08 renders as an achieved figure with no denominator rather than an invented one.
async function loadCurrentProgram(
  userId: string,
  todayLocalDate: string,
  db: WriteDb,
): Promise<CurrentProgram | null> {
  const data = await loadNextUp(userId, db);
  const nextUp = resolveNextUp<ProgramDay, ProgramCycle>({
    routine: data.routine,
    days: data.days,
    cycles: data.cycles,
    history: data.history,
    today: todayLocalDate,
  });

  if (nextUp.kind !== 'workout') return null;
  return { days: data.days, cycleId: nextUp.cycle?.id ?? null };
}

function programTargetFrom(program: CurrentProgram, primaryMuscleGroupIds: Map<string, string[]>): ProgramTargetInput {
  return {
    days: program.days.map((day) => ({
      slots: day.slots.map((slot) => ({
        exerciseId: slot.exerciseId,
        targetSets: resolveTarget(
          baseOf(slot),
          program.cycleId ? (slot.overridesByCycleId[program.cycleId] ?? null) : null,
        ).targetSets,
        primaryMuscleGroupIds: primaryMuscleGroupIds.get(slot.exerciseId) ?? [],
      })),
    })),
  };
}

// The assembling half of the Last 7 Days card: everything the pure weekly aggregation needs, read
// in a bounded number of batched queries, and not one figure more. The set predicate, the distinct
// counts and the target sums all live in @fitness/analytics-engine — applying any of them here as
// well is exactly how this card's numbers and the exercise strip's start to disagree (R18).
//
// Four selects at any scale: the window's completed sessions, their session_exercise rows, those
// rows' logged_set rows, and ONE primary-role muscle read over the union of the trained and the
// programmed exercise ids. A loop issuing a query per session or per exercise is the N+1 shape
// every sibling reader in this module family already forbids in its own comment.
//
// Deliberately does not filter workout_session.user_id: that column is stamped server-side on sync
// push only, so a session finished offline carries a null locally. The guard is "is anyone signed
// in at all", exactly as history-query.ts documents.
export async function loadWeeklyProgress(
  { userId, todayLocalDate }: LoadWeeklyProgressInput,
  db: WriteDb = getPowerSync(),
): Promise<WeeklyProgressData> {
  if (!userId) return EMPTY;

  // R21/D-07: the boundary comes from the package's single window helper, never a literal and
  // never a calendar-week derivation.
  const windowStart = rollingWindowStart(todayLocalDate, PROGRESS_WINDOW_DAYS);

  const sessionRows = await db
    .select({ id: workoutSession.id, localDate: workoutSession.localDate })
    .from(workoutSession)
    .where(and(eq(workoutSession.status, COMPLETED_STATUS), gte(workoutSession.localDate, windowStart)));

  const sessionExerciseRows = sessionRows.length
    ? await db
        .select({
          id: sessionExercise.id,
          sessionId: sessionExercise.sessionId,
          exerciseId: sessionExercise.exerciseId,
        })
        .from(sessionExercise)
        .where(
          inArray(
            sessionExercise.sessionId,
            sessionRows.map((row) => row.id),
          ),
        )
    : [];

  const setRows = sessionExerciseRows.length
    ? await db
        .select({
          id: loggedSet.id,
          sessionExerciseId: loggedSet.sessionExerciseId,
          setType: loggedSet.setType,
          completed: loggedSet.completed,
          parentSetId: loggedSet.parentSetId,
        })
        .from(loggedSet)
        .where(
          inArray(
            loggedSet.sessionExerciseId,
            sessionExerciseRows.map((row) => row.id),
          ),
        )
    : [];

  const program = await loadCurrentProgram(userId, todayLocalDate, db);

  const exerciseIds = new Set(sessionExerciseRows.map((row) => row.exerciseId));
  for (const day of program?.days ?? []) {
    for (const slot of day.slots) exerciseIds.add(slot.exerciseId);
  }

  // PRIMARY only: the card's third track counts the muscle groups an exercise is the prime mover
  // for, and letting a secondary mapping through would inflate every figure on it.
  const mappingRows = exerciseIds.size
    ? await db
        .select({ exerciseId: exerciseMuscleMapping.exerciseId, muscleGroupId: exerciseMuscleMapping.muscleGroupId })
        .from(exerciseMuscleMapping)
        .where(and(eq(exerciseMuscleMapping.role, PRIMARY_ROLE), inArray(exerciseMuscleMapping.exerciseId, [...exerciseIds])))
    : [];

  const primaryMuscleGroupIds = new Map<string, string[]>();
  for (const row of mappingRows) {
    const ids = primaryMuscleGroupIds.get(row.exerciseId) ?? [];
    ids.push(row.muscleGroupId);
    primaryMuscleGroupIds.set(row.exerciseId, ids);
  }

  const setsBySessionExerciseId = new Map<string, WeeklyProgressSessionInput['exercises'][number]['sets']>();
  for (const row of setRows) {
    const sets = setsBySessionExerciseId.get(row.sessionExerciseId) ?? [];
    sets.push({
      id: row.id,
      setType: row.setType as SetType,
      completed: row.completed,
      parentSetId: row.parentSetId,
    });
    setsBySessionExerciseId.set(row.sessionExerciseId, sets);
  }

  // One entry per session_exercise row rather than per distinct exercise: the pure aggregation
  // folds both the set count and the distinct-exercise set itself, so an exercise entered twice in
  // one session (a superset re-entry, a re-add) contributes its sets once each and its id once.
  const exercisesBySessionId = new Map<string, WeeklyProgressExerciseInput[]>();
  for (const row of sessionExerciseRows) {
    const exercises = exercisesBySessionId.get(row.sessionId) ?? [];
    exercises.push({
      exerciseId: row.exerciseId,
      primaryMuscleGroupIds: primaryMuscleGroupIds.get(row.exerciseId) ?? [],
      sets: setsBySessionExerciseId.get(row.id) ?? [],
    });
    exercisesBySessionId.set(row.sessionId, exercises);
  }

  return {
    sessions: sessionRows.map((row) => ({
      sessionId: row.id,
      localDate: row.localDate,
      exercises: exercisesBySessionId.get(row.id) ?? [],
    })),
    programTarget: program ? programTargetFrom(program, primaryMuscleGroupIds) : null,
  };
}
