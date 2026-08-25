import { eq, inArray } from 'drizzle-orm';
import { CANONICAL_KG_SCALE, WARMUP_SET_TYPE, type PrType } from '@fitness/api-contracts';
import { estimated1RM } from '@fitness/pr-rules';
import { sortMuscleTargets, type MuscleTarget, type RawMuscleTarget } from '../catalog/exercise-detail';
import { elapsedWorkoutSeconds } from '../rest-timer';
import { loadExerciseNameMap } from './programs/load-program';
import { computeSessionPrTypesBySetId } from './personal-record';
import { getPowerSync, type WriteDb } from './powersync';
import { exerciseMuscleMapping, loggedSet, muscleGroup, sessionExercise, workoutSession } from './schema';
import type { LoggedSetRow } from './session-query';

export interface MusclesTrained {
  primaryMuscles: MuscleTarget[];
  secondaryMuscles: MuscleTarget[];
}

export interface ExerciseBreakdown {
  sessionExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  removedAt: string | null;
  completedSetCount: number;
  totalReps: number;
  topWeightKg: string | null;
  volumeKg: string | null;
  bestE1rmKg: string | null;
  prTypes: PrType[];
  completedSets: LoggedSetRow[];
}

export interface SessionSummarySession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  pausedAt: string | null;
  accumulatedPausedSeconds: number;
}

export interface SessionSummary {
  session: SessionSummarySession;
  durationSeconds: number;
  musclesTrained: MusclesTrained;
  breakdown: ExerciseBreakdown[];
  // A pure re-derivation (LOG-19), not a read of the stored personal_record table — see
  // computeSessionPrTypesBySetId's own doc comment in personal-record.ts.
  personalRecordsBySetId: Map<string, PrType[]>;
}

interface MuscleMappingRow {
  exerciseId: string;
  muscleGroupId: string;
  role: string;
  weightFactor: string;
}

interface MuscleGroupRow {
  id: string;
  name: string;
  bodyRegion: string;
}

// A muscle group trained by more than one exercise this session takes the "loudest" fact any of
// them contributes: primary beats secondary regardless of weight_factor (this is a muscle group
// you were the prime mover for in at least one exercise, full stop), and among ties on role the
// larger weight_factor wins — mirroring exercise-detail.ts's own per-exercise ordering, applied
// across a set of exercises instead of one. sortMuscleTargets (exercise-detail.ts) does the final
// ordering so this file never re-implements that comparison.
function buildMusclesTrained(trainedExerciseIds: Set<string>, mappings: MuscleMappingRow[], groups: MuscleGroupRow[]): MusclesTrained {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const bestByMuscleGroupId = new Map<string, RawMuscleTarget>();

  for (const mapping of mappings) {
    if (!trainedExerciseIds.has(mapping.exerciseId)) continue;
    const group = groupById.get(mapping.muscleGroupId);
    if (!group) continue;

    const role = mapping.role as RawMuscleTarget['role'];
    const existing = bestByMuscleGroupId.get(mapping.muscleGroupId);
    const candidate: RawMuscleTarget = {
      muscleGroupId: group.id,
      name: group.name,
      bodyRegion: group.bodyRegion,
      weightFactor: mapping.weightFactor,
      role,
    };

    if (!existing) {
      bestByMuscleGroupId.set(mapping.muscleGroupId, candidate);
      continue;
    }

    const promotesToPrimary = existing.role !== 'primary' && role === 'primary';
    const sameRoleHeavier = existing.role === role && Number(candidate.weightFactor) > Number(existing.weightFactor);
    if (promotesToPrimary || sameRoleHeavier) bestByMuscleGroupId.set(mapping.muscleGroupId, candidate);
  }

  const sorted = sortMuscleTargets([...bestByMuscleGroupId.values()]);
  const stripRole = ({ role: _role, ...target }: RawMuscleTarget): MuscleTarget => target;

  return {
    primaryMuscles: sorted.filter((target) => target.role === 'primary').map(stripRole),
    secondaryMuscles: sorted.filter((target) => target.role === 'secondary').map(stripRole),
  };
}

// userId is accepted, not filtered on, mirroring loadSessionTree/loadLiveSession's own documented
// reasoning (session-query.ts): workout_session.user_id is stamped server-side on sync push only,
// so a session finished the instant it was started, still offline, has no user_id to filter by yet.
// The route only ever reaches this with the id of a session that was just live, so sessionId alone
// is a sufficient key. Kept as a parameter for the same early-guard shape every reader in this
// module family carries, and for a future caller that does need it.
export async function loadSessionSummary(sessionId: string, userId: string | null, db: WriteDb = getPowerSync()): Promise<SessionSummary | null> {
  void userId;

  const [sessionRow] = await db
    .select({
      id: workoutSession.id,
      startedAt: workoutSession.startedAt,
      endedAt: workoutSession.endedAt,
      pausedAt: workoutSession.pausedAt,
      accumulatedPausedSeconds: workoutSession.accumulatedPausedSeconds,
    })
    .from(workoutSession)
    .where(eq(workoutSession.id, sessionId));

  if (!sessionRow) return null;

  // Every session_exercise row for this session, removed or not — a removed exercise with
  // completed sets still belongs in the breakdown (its sets stay in the user's history), which is
  // why this reads the raw table directly rather than loadSessionTree's own removed_at-filtered
  // view (that filter exists for the live pager, not for a durable record of what happened).
  const exerciseRows = await db
    .select({
      id: sessionExercise.id,
      exerciseId: sessionExercise.exerciseId,
      orderIndex: sessionExercise.orderIndex,
      removedAt: sessionExercise.removedAt,
    })
    .from(sessionExercise)
    .where(eq(sessionExercise.sessionId, sessionId))
    .orderBy(sessionExercise.orderIndex);

  const sessionExerciseIds = exerciseRows.map((row) => row.id);
  const setRows = sessionExerciseIds.length
    ? await db
        .select({
          id: loggedSet.id,
          sessionExerciseId: loggedSet.sessionExerciseId,
          setIndex: loggedSet.setIndex,
          setType: loggedSet.setType,
          weightKg: loggedSet.weightKg,
          reps: loggedSet.reps,
          rir: loggedSet.rir,
          completed: loggedSet.completed,
          loggedAt: loggedSet.loggedAt,
        })
        .from(loggedSet)
        .where(inArray(loggedSet.sessionExerciseId, sessionExerciseIds))
    : [];

  const names = await loadExerciseNameMap(db);
  const mappings = await db
    .select({
      exerciseId: exerciseMuscleMapping.exerciseId,
      muscleGroupId: exerciseMuscleMapping.muscleGroupId,
      role: exerciseMuscleMapping.role,
      weightFactor: exerciseMuscleMapping.weightFactor,
    })
    .from(exerciseMuscleMapping);
  const groups = await db.select({ id: muscleGroup.id, name: muscleGroup.name, bodyRegion: muscleGroup.bodyRegion }).from(muscleGroup);

  const setsBySessionExerciseId = new Map<string, typeof setRows>();
  for (const row of setRows) {
    const list = setsBySessionExerciseId.get(row.sessionExerciseId) ?? [];
    list.push(row);
    setsBySessionExerciseId.set(row.sessionExerciseId, list);
  }

  const trainedExerciseIds = new Set<string>();
  const sessionExerciseIdBySetId = new Map<string, string>();
  const breakdown: ExerciseBreakdown[] = [];

  for (const exercise of exerciseRows) {
    const rows = (setsBySessionExerciseId.get(exercise.id) ?? []).slice().sort((a, b) => a.setIndex - b.setIndex);
    const workingCompleted = rows.filter((row) => row.completed && row.setType !== WARMUP_SET_TYPE);
    if (workingCompleted.length === 0) continue;

    trainedExerciseIds.add(exercise.exerciseId);

    let totalReps = 0;
    let topWeightKg: string | null = null;
    let topWeightNumeric = -Infinity;
    let volumeSum = 0;
    let hasWeight = false;
    let bestE1rm: number | null = null;

    for (const set of workingCompleted) {
      sessionExerciseIdBySetId.set(set.id, exercise.id);
      totalReps += set.reps;

      if (set.weightKg === null) continue;
      hasWeight = true;
      const weightNumeric = Number(set.weightKg);
      if (weightNumeric > topWeightNumeric) {
        topWeightNumeric = weightNumeric;
        topWeightKg = set.weightKg;
      }
      volumeSum += weightNumeric * set.reps;

      const e1rm = estimated1RM(weightNumeric, set.reps);
      if (e1rm !== null && (bestE1rm === null || e1rm > bestE1rm)) bestE1rm = e1rm;
    }

    breakdown.push({
      sessionExerciseId: exercise.id,
      exerciseId: exercise.exerciseId,
      exerciseName: names.get(exercise.exerciseId) ?? 'Unknown exercise',
      removedAt: exercise.removedAt,
      completedSetCount: workingCompleted.length,
      totalReps,
      topWeightKg,
      volumeKg: hasWeight ? volumeSum.toFixed(CANONICAL_KG_SCALE) : null,
      bestE1rmKg: bestE1rm === null ? null : bestE1rm.toFixed(CANONICAL_KG_SCALE),
      prTypes: [],
      completedSets: workingCompleted,
    });
  }

  const musclesTrained = buildMusclesTrained(trainedExerciseIds, mappings, groups);

  // A pure re-derivation of "what would detectPrsForSession say right now" (LOG-19), never a read
  // of the stored personal_record rows directly — this is what keeps a corrected-away PR's badge
  // from surviving on screen after the correction, without ever deleting or superseding the
  // durable row detectPrsForSession wrote for the original value (personal-record.ts's own
  // computeSessionPrTypesBySetId doc comment).
  const personalRecordsBySetId = await computeSessionPrTypesBySetId(sessionId, db);
  const prTypesBySessionExerciseId = new Map<string, Set<PrType>>();
  for (const [loggedSetId, prTypes] of personalRecordsBySetId) {
    const sessionExerciseId = sessionExerciseIdBySetId.get(loggedSetId);
    if (!sessionExerciseId) continue;
    const set = prTypesBySessionExerciseId.get(sessionExerciseId) ?? new Set<PrType>();
    for (const prType of prTypes) set.add(prType);
    prTypesBySessionExerciseId.set(sessionExerciseId, set);
  }
  for (const row of breakdown) {
    row.prTypes = [...(prTypesBySessionExerciseId.get(row.sessionExerciseId) ?? [])];
  }

  const durationSeconds = elapsedWorkoutSeconds({
    startedAtMs: Date.parse(sessionRow.startedAt),
    accumulatedPausedSeconds: sessionRow.accumulatedPausedSeconds,
    pausedAtMs: sessionRow.pausedAt ? Date.parse(sessionRow.pausedAt) : null,
    nowMs: sessionRow.endedAt ? Date.parse(sessionRow.endedAt) : Date.now(),
  });

  return {
    session: sessionRow,
    durationSeconds,
    musclesTrained,
    breakdown,
    personalRecordsBySetId,
  };
}
