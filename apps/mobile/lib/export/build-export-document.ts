import type { getPowerSync } from '../db/powersync';
import { loggedSet, sessionExercise, workoutSession } from '../db/schema';
import { pendingWriteCount } from '../pending-write-count';
import { CLIENT_VERSION } from '../client-version';

export interface ExportedLoggedSet {
  id: string;
  set_index: number;
  set_type: string;
  weight_kg: string;
  reps: number;
  rir: number | null;
  side: string | null;
  completed: boolean;
  parent_set_id: string | null;
  rest_taken_seconds: number | null;
  logged_at: string;
}

export interface ExportedSessionExercise {
  id: string;
  exercise_id: string;
  order_index: number;
  superset_group_id: string | null;
  routine_exercise_id: string | null;
  target_sets: number | null;
  target_rep_min: number | null;
  target_rep_max: number | null;
  target_rir_min: number | null;
  target_rir_max: number | null;
  target_rest_seconds: number | null;
  sets: ExportedLoggedSet[];
}

export interface ExportedSession {
  id: string;
  routine_day_id: string | null;
  equipment_profile_id: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
  device_id: string | null;
  timezone: string;
  local_date: string;
  session_exercises: ExportedSessionExercise[];
}

export interface ExportManifest {
  exported_at: string;
  app_version: string;
  session_count: number;
  set_count: number;
  unsynced_write_count: number;
  scope: string;
  // Non-null only when part of the local database could not be read — the honesty requirement
  // this field exists for is that an incomplete export says so in the file itself, rather than
  // silently looking complete.
  incomplete_reason: string | null;
}

export interface TrainingExport {
  manifest: ExportManifest;
  sessions: ExportedSession[];
}

const EXPORT_SCOPE =
  'Everything held on this device for this account, including writes that have not yet reached ' +
  'the server. Does not include the shared exercise catalog, which is app content, not personal data.';

export type ExportDb = ReturnType<typeof getPowerSync>;

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const bucket = map.get(key(row));
    if (bucket) bucket.push(row);
    else map.set(key(row), [row]);
  }
  return map;
}

// Reads every row of the three session-aggregate tables in one shot each, then groups in JS,
// rather than issuing a query per session/exercise — this is a whole-device export, not a
// scoped read, and there is exactly one local account so no user_id filter applies.
type Row = Record<string, unknown>;

export async function buildExportDocument(db: ExportDb): Promise<TrainingExport> {
  let sessions: Row[] = [];
  let exercises: Row[] = [];
  let sets: Row[] = [];
  let incompleteReason: string | null = null;

  try {
    [sessions, exercises, sets] = (await Promise.all([
      db.select().from(workoutSession),
      db.select().from(sessionExercise),
      db.select().from(loggedSet),
    ])) as [Row[], Row[], Row[]];
  } catch (error) {
    incompleteReason = `Could not read the full local database: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }

  const exercisesBySession = groupBy(exercises, (row) => row.sessionId as string);
  const setsByExercise = groupBy(sets, (row) => row.sessionExerciseId as string);

  const exportedSessions: ExportedSession[] = sessions.map((session): ExportedSession => {
    const sessionId = session.id as string;
    const sessionExercises = (exercisesBySession.get(sessionId) ?? []).map((exercise): ExportedSessionExercise => {
      const exerciseId = exercise.id as string;
      const exerciseSets = (setsByExercise.get(exerciseId) ?? [])
        .slice()
        .sort((a, b) => (a.setIndex as number) - (b.setIndex as number))
        .map(
          (setRow): ExportedLoggedSet => ({
            id: setRow.id as string,
            set_index: setRow.setIndex as number,
            set_type: setRow.setType as string,
            weight_kg: setRow.weightKg as string,
            reps: setRow.reps as number,
            rir: (setRow.rir as number | null) ?? null,
            side: (setRow.side as string | null) ?? null,
            completed: setRow.completed as boolean,
            parent_set_id: (setRow.parentSetId as string | null) ?? null,
            rest_taken_seconds: (setRow.restTakenSeconds as number | null) ?? null,
            logged_at: setRow.loggedAt as string,
          }),
        );

      return {
        id: exerciseId,
        exercise_id: exercise.exerciseId as string,
        order_index: exercise.orderIndex as number,
        superset_group_id: (exercise.supersetGroupId as string | null) ?? null,
        routine_exercise_id: (exercise.routineExerciseId as string | null) ?? null,
        target_sets: (exercise.targetSets as number | null) ?? null,
        target_rep_min: (exercise.targetRepMin as number | null) ?? null,
        target_rep_max: (exercise.targetRepMax as number | null) ?? null,
        target_rir_min: (exercise.targetRirMin as number | null) ?? null,
        target_rir_max: (exercise.targetRirMax as number | null) ?? null,
        target_rest_seconds: (exercise.targetRestSeconds as number | null) ?? null,
        sets: exerciseSets,
      };
    });

    return {
      id: sessionId,
      routine_day_id: (session.routineDayId as string | null) ?? null,
      equipment_profile_id: (session.equipmentProfileId as string | null) ?? null,
      started_at: session.startedAt as string,
      ended_at: (session.endedAt as string | null) ?? null,
      status: session.status as string,
      device_id: (session.deviceId as string | null) ?? null,
      timezone: session.timezone as string,
      local_date: session.localDate as string,
      session_exercises: sessionExercises,
    };
  });

  const manifest: ExportManifest = {
    exported_at: new Date().toISOString(),
    app_version: CLIENT_VERSION,
    session_count: exportedSessions.length,
    set_count: sets.length,
    unsynced_write_count: await pendingWriteCount(),
    scope: EXPORT_SCOPE,
    incomplete_reason: incompleteReason,
  };

  return { manifest, sessions: exportedSessions };
}
