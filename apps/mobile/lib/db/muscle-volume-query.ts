import { and, eq, gt, gte, inArray, isNull, lte, or, type SQL } from 'drizzle-orm';
import { countsTowardWorkingVolume, type SetType, type WorkoutSessionStatus } from '@fitness/api-contracts';
import {
  MUSCLE_MAP_WINDOW_DAYS,
  mergeMuscleVolumeCells,
  muscleMapPoints,
  muscleVolumeCells,
  rankMuscleContributions,
  rollingWindowStart,
  windowReadsRollup,
  type MuscleContribution,
  type MuscleMapPoint,
  type MuscleMapWindowId,
  type MuscleVolumeCell,
  type MuscleVolumeExerciseInput,
  type MuscleVolumeSessionInput,
} from '@fitness/analytics-engine';
import { loadExerciseNameMap } from './programs/load-program';
import { getPowerSync, type WriteDb } from './powersync';
import { analyticsWatermark, exerciseMuscleMapping, loggedSet, muscleGroup, muscleVolumeRollup, sessionExercise, workoutSession } from './schema';

const COMPLETED_STATUS: WorkoutSessionStatus = 'completed';

// Same fallback records-query.ts/summary-query.ts/the performance screen already use, so an
// exercise id absent from the catalog renders one recognisable label app-wide.
const UNKNOWN_EXERCISE_NAME = 'Unknown exercise';

// D-01's overlay predicate, exported separately so it is unit-testable without a database. The
// strict comparison is what stops a session dated exactly ON the watermark from being counted
// twice (the rollup already holds it); the null-owner clause is what stops a session backfilled
// offline BELOW the watermark from being missed. workout_session.user_id is stamped server-side on
// push only, which is what makes a null owner a reliable "the server has never seen this" marker.
// When the watermark is null (no watermark row exists yet), this yields no condition at all: every
// session in the window is overlaid and the rollup contributes nothing.
export function muscleMapOverlayFilter(computedThroughDate: string | null): SQL | undefined {
  if (computedThroughDate === null) return undefined;
  return or(gt(workoutSession.localDate, computedThroughDate), isNull(workoutSession.userId));
}

interface LocalReadInput {
  windowStart: string;
  todayLocalDate: string;
  overlayFilter?: SQL;
}

interface LocalReadResult {
  cells: MuscleVolumeCell[];
  sessionCount: number;
}

// The shared local read behind every window: the window's completed sessions, their
// session_exercise rows, those rows' logged_set rows, and the exercise_muscle_mapping rows for the
// union of exercise ids — the same four-batched-select shape weekly-progress-query.ts uses. Two
// deliberate differences from that reader, both from D-04: the mapping read never filters on
// `role` (secondary mappings carry real volume too), and it selects weight_factor as well as
// muscle_group_id. This function performs no summation of its own — it assembles
// MuscleVolumeSessionInput[] and hands it to muscleVolumeCells.
async function loadLocalMuscleVolumeCells(
  { windowStart, todayLocalDate, overlayFilter }: LocalReadInput,
  db: WriteDb,
): Promise<LocalReadResult> {
  const baseFilters = [
    eq(workoutSession.status, COMPLETED_STATUS),
    gte(workoutSession.localDate, windowStart),
    lte(workoutSession.localDate, todayLocalDate),
  ];
  const whereClause = overlayFilter ? and(...baseFilters, overlayFilter) : and(...baseFilters);

  const sessionRows = await db
    .select({ id: workoutSession.id, localDate: workoutSession.localDate })
    .from(workoutSession)
    .where(whereClause);

  const sessionExerciseRows = sessionRows.length
    ? await db
        .select({ id: sessionExercise.id, sessionId: sessionExercise.sessionId, exerciseId: sessionExercise.exerciseId })
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
          weightKg: loggedSet.weightKg,
          reps: loggedSet.reps,
        })
        .from(loggedSet)
        .where(
          inArray(
            loggedSet.sessionExerciseId,
            sessionExerciseRows.map((row) => row.id),
          ),
        )
    : [];

  const exerciseIds = [...new Set(sessionExerciseRows.map((row) => row.exerciseId))];
  const mappingRows = exerciseIds.length
    ? await db
        .select({
          exerciseId: exerciseMuscleMapping.exerciseId,
          muscleGroupId: exerciseMuscleMapping.muscleGroupId,
          weightFactor: exerciseMuscleMapping.weightFactor,
        })
        .from(exerciseMuscleMapping)
        .where(inArray(exerciseMuscleMapping.exerciseId, exerciseIds))
    : [];

  const mappingsByExercise = new Map<string, { muscleGroupId: string; weightFactor: number }[]>();
  for (const row of mappingRows) {
    const list = mappingsByExercise.get(row.exerciseId) ?? [];
    list.push({ muscleGroupId: row.muscleGroupId, weightFactor: Number(row.weightFactor) });
    mappingsByExercise.set(row.exerciseId, list);
  }

  const setsBySessionExerciseId = new Map<string, MuscleVolumeExerciseInput['sets']>();
  for (const row of setRows) {
    const sets = setsBySessionExerciseId.get(row.sessionExerciseId) ?? [];
    // weight_kg is parsed from its stored text form at this one boundary (D-04).
    sets.push({
      setType: row.setType as SetType,
      completed: row.completed,
      weightKg: row.weightKg === null ? null : Number(row.weightKg),
      reps: row.reps,
    });
    setsBySessionExerciseId.set(row.sessionExerciseId, sets);
  }

  const exercisesBySessionId = new Map<string, MuscleVolumeExerciseInput[]>();
  for (const row of sessionExerciseRows) {
    const exercises = exercisesBySessionId.get(row.sessionId) ?? [];
    exercises.push({
      exerciseId: row.exerciseId,
      muscleMappings: mappingsByExercise.get(row.exerciseId) ?? [],
      sets: setsBySessionExerciseId.get(row.id) ?? [],
    });
    exercisesBySessionId.set(row.sessionId, exercises);
  }

  const sessions: MuscleVolumeSessionInput[] = sessionRows.map((row) => ({
    sessionId: row.id,
    localDate: row.localDate,
    exercises: exercisesBySessionId.get(row.id) ?? [],
  }));

  return { cells: muscleVolumeCells(sessions), sessionCount: sessionRows.length };
}

// One select over muscle_group, same shape summary-query.ts's own read uses — returned as a map
// so the render boundary does the labelling rather than this reader.
async function loadMuscleGroupNames(db: WriteDb): Promise<Map<string, string>> {
  const rows = await db.select({ id: muscleGroup.id, name: muscleGroup.name }).from(muscleGroup);
  return new Map(rows.map((row) => [row.id, row.name]));
}

export interface LoadMuscleMapWindowInput {
  userId: string | null;
  todayLocalDate: string;
  windowId: MuscleMapWindowId;
}

export interface MuscleMapWindowData {
  points: MuscleMapPoint[];
  muscleNames: Map<string, string>;
  overlaySessionCount: number;
  watermarkDate: string | null;
}

const EMPTY_MUSCLE_MAP_WINDOW: MuscleMapWindowData = {
  points: muscleMapPoints([]),
  muscleNames: new Map(),
  overlaySessionCount: 0,
  watermarkDate: null,
};

// The reader behind ANLY-04: it assembles inputs, calls the pure package, and computes nothing
// itself, exactly as weekly-progress-query.ts does. `1w` never reads the rollup or the watermark at
// all (D-01); the rollup windows read the watermark and the rollup rows, then run the shared local
// read with the D-01 overlay predicate applied and merge the two sources.
export async function loadMuscleMapWindow(
  { userId, todayLocalDate, windowId }: LoadMuscleMapWindowInput,
  db: WriteDb = getPowerSync(),
): Promise<MuscleMapWindowData> {
  if (!userId) return EMPTY_MUSCLE_MAP_WINDOW;

  const windowStart = rollingWindowStart(todayLocalDate, MUSCLE_MAP_WINDOW_DAYS[windowId]);
  const muscleNames = await loadMuscleGroupNames(db);

  if (!windowReadsRollup(windowId)) {
    const { cells } = await loadLocalMuscleVolumeCells({ windowStart, todayLocalDate }, db);
    const totals = mergeMuscleVolumeCells([], cells);
    return { points: muscleMapPoints(totals), muscleNames, overlaySessionCount: 0, watermarkDate: null };
  }

  const watermarkRows = await db
    .select({ computedThroughDate: analyticsWatermark.computedThroughDate })
    .from(analyticsWatermark)
    .where(eq(analyticsWatermark.userId, userId));
  const watermarkDate = watermarkRows[0]?.computedThroughDate ?? null;

  const rollupRows = await db
    .select({
      muscleGroupId: muscleVolumeRollup.muscleGroupId,
      localDate: muscleVolumeRollup.localDate,
      weightedVolumeKg: muscleVolumeRollup.weightedVolumeKg,
      weightedSets: muscleVolumeRollup.weightedSets,
      setCount: muscleVolumeRollup.setCount,
    })
    .from(muscleVolumeRollup)
    .where(
      and(
        eq(muscleVolumeRollup.userId, userId),
        gte(muscleVolumeRollup.localDate, windowStart),
        lte(muscleVolumeRollup.localDate, todayLocalDate),
      ),
    );

  const rollupCells: MuscleVolumeCell[] = rollupRows.map((row) => ({
    muscleGroupId: row.muscleGroupId,
    localDate: row.localDate,
    weightedVolumeKg: Number(row.weightedVolumeKg),
    weightedSets: Number(row.weightedSets),
    setCount: row.setCount,
  }));

  const overlayFilter = muscleMapOverlayFilter(watermarkDate);
  const { cells: overlayCells, sessionCount } = await loadLocalMuscleVolumeCells({ windowStart, todayLocalDate, overlayFilter }, db);

  const totals = mergeMuscleVolumeCells(rollupCells, overlayCells);
  return { points: muscleMapPoints(totals), muscleNames, overlaySessionCount: sessionCount, watermarkDate };
}

export interface LoadMuscleDrilldownInput {
  userId: string | null;
  todayLocalDate: string;
  windowId: MuscleMapWindowId;
  muscleGroupId: string;
}

export interface MuscleDrilldownTotals {
  weightedVolumeKg: number;
  setCount: number;
}

export interface MuscleDrilldownData {
  contributions: MuscleContribution[];
  totals: MuscleDrilldownTotals;
}

const EMPTY_DRILLDOWN: MuscleDrilldownData = { contributions: [], totals: { weightedVolumeKg: 0, setCount: 0 } };

// Always local, never the rollup (D-06), and bounded by one muscle group and one window. Reads the
// window's completed sessions and their sets exactly as loadLocalMuscleVolumeCells does, but folds
// per exercise rather than per muscle group, and restricts the mapping read to this one
// muscle_group_id. Names are resolved with loadExerciseNameMap — the synced `exercise` table holds
// only a user's custom lifts, so a lookup that read it alone would return the unknown-exercise
// fallback for every seeded lift.
export async function loadMuscleDrilldown(
  { userId, todayLocalDate, windowId, muscleGroupId }: LoadMuscleDrilldownInput,
  db: WriteDb = getPowerSync(),
): Promise<MuscleDrilldownData> {
  if (!userId) return EMPTY_DRILLDOWN;

  const windowStart = rollingWindowStart(todayLocalDate, MUSCLE_MAP_WINDOW_DAYS[windowId]);

  const sessionRows = await db
    .select({ id: workoutSession.id })
    .from(workoutSession)
    .where(and(eq(workoutSession.status, COMPLETED_STATUS), gte(workoutSession.localDate, windowStart), lte(workoutSession.localDate, todayLocalDate)));

  if (sessionRows.length === 0) return EMPTY_DRILLDOWN;

  const sessionExerciseRows = await db
    .select({ id: sessionExercise.id, exerciseId: sessionExercise.exerciseId })
    .from(sessionExercise)
    .where(
      inArray(
        sessionExercise.sessionId,
        sessionRows.map((row) => row.id),
      ),
    );

  if (sessionExerciseRows.length === 0) return EMPTY_DRILLDOWN;

  const setRows = await db
    .select({
      sessionExerciseId: loggedSet.sessionExerciseId,
      setType: loggedSet.setType,
      completed: loggedSet.completed,
      weightKg: loggedSet.weightKg,
      reps: loggedSet.reps,
    })
    .from(loggedSet)
    .where(
      inArray(
        loggedSet.sessionExerciseId,
        sessionExerciseRows.map((row) => row.id),
      ),
    );

  const mappingRows = await db
    .select({ exerciseId: exerciseMuscleMapping.exerciseId, weightFactor: exerciseMuscleMapping.weightFactor })
    .from(exerciseMuscleMapping)
    .where(eq(exerciseMuscleMapping.muscleGroupId, muscleGroupId));

  if (mappingRows.length === 0) return EMPTY_DRILLDOWN;

  const weightFactorByExercise = new Map(mappingRows.map((row) => [row.exerciseId, Number(row.weightFactor)]));

  const setsBySessionExerciseId = new Map<string, typeof setRows>();
  for (const row of setRows) {
    const list = setsBySessionExerciseId.get(row.sessionExerciseId) ?? [];
    list.push(row);
    setsBySessionExerciseId.set(row.sessionExerciseId, list);
  }

  const names = await loadExerciseNameMap(db);

  const byExercise = new Map<string, { setCount: number; weightedVolumeKg: number }>();
  for (const row of sessionExerciseRows) {
    const weightFactor = weightFactorByExercise.get(row.exerciseId);
    if (weightFactor === undefined) continue;

    const qualifyingSets = (setsBySessionExerciseId.get(row.id) ?? []).filter(
      (set) => set.completed && countsTowardWorkingVolume(set.setType as SetType),
    );
    if (qualifyingSets.length === 0) continue;

    const existing = byExercise.get(row.exerciseId) ?? { setCount: 0, weightedVolumeKg: 0 };
    for (const set of qualifyingSets) {
      existing.setCount += 1;
      existing.weightedVolumeKg += (set.weightKg === null ? 0 : Number(set.weightKg)) * set.reps * weightFactor;
    }
    byExercise.set(row.exerciseId, existing);
  }

  const contributions: MuscleContribution[] = [...byExercise.entries()].map(([exerciseId, entryTotals]) => ({
    exerciseId,
    exerciseName: names.get(exerciseId) ?? UNKNOWN_EXERCISE_NAME,
    setCount: entryTotals.setCount,
    weightedVolumeKg: entryTotals.weightedVolumeKg,
  }));

  if (contributions.length === 0) return EMPTY_DRILLDOWN;

  const totals = contributions.reduce(
    (acc, contribution) => ({
      weightedVolumeKg: acc.weightedVolumeKg + contribution.weightedVolumeKg,
      setCount: acc.setCount + contribution.setCount,
    }),
    { weightedVolumeKg: 0, setCount: 0 },
  );

  return { contributions: rankMuscleContributions(contributions), totals };
}
