import { eq, inArray } from 'drizzle-orm';
import { DEFAULT_PROGRESSION_PREFERENCE, type ProgressionPreference } from '@fitness/api-contracts';
import type { ExerciseSessionSets, LoggedSetInput } from '@fitness/progression-engine';
import { loadProgressionPreference } from '../preferences';
import { getPowerSync, type WriteDb } from '../powersync';
import { loggedSet, sessionExercise, workoutSession } from '../schema';

// D-10: bounded per exercise so a lifter with years of logged history cannot turn exercise-start
// into a scan that hangs the screen (T-8-03). The window is counted in LOGGED SESSIONS, and no
// wall-clock filter exists anywhere in this path — that is the mechanism PRGR-08 rests on. A
// `WHERE started_at > ...` added here later would reintroduce exactly the reduced-after-a-layoff
// behaviour the requirement forbids.
export const RECENT_SESSION_WINDOW = 10;

interface PriorSessionExerciseRow {
  id: string;
  sessionId: string;
  exerciseId: string;
}

export interface RecommendationInputsForSession {
  history: Record<string, ExerciseSessionSets[]>;
  // D-07: read here, joined to this module's own history read, rather than a second read issued
  // by the screen — 08-02's loadProgressionPreference is what narrows a corrupted or future-build
  // value to the default; this module never reads the raw column itself.
  preference: ProgressionPreference;
}

// D-16/D-14: reads logged history and the session's own prescription snapshot, never
// routine_exercise's live targets — editing a program must not change what a logged workout is
// compared against (Phase 4's D-01, resolvePrescriptionForCycle's snapshot-on-use precedent).
//
// Follows previousSetReferencesForSession's shape: four flat selects assembled in memory, never a
// per-exercise query inside a loop (PITFALLS §13).
export async function recommendationHistoryForSession(
  sessionId: string,
  userId: string | null,
  db: WriteDb = getPowerSync(),
): Promise<RecommendationInputsForSession> {
  // A signed-out account (userId null) falls back to the documented default rather than to a
  // locally invented value — the same fallback loadProgressionPreference itself applies to a
  // preference-less row, just applied one layer earlier since there is no row to read at all.
  const preference = userId ? await loadProgressionPreference(userId, db) : DEFAULT_PROGRESSION_PREFERENCE;

  const currentExerciseRows = await db
    .select({ id: sessionExercise.id, exerciseId: sessionExercise.exerciseId })
    .from(sessionExercise)
    .where(eq(sessionExercise.sessionId, sessionId));

  const result: Record<string, ExerciseSessionSets[]> = {};
  for (const row of currentExerciseRows) result[row.id] = [];
  if (currentExerciseRows.length === 0) return { history: result, preference };

  const exerciseIds = [...new Set(currentExerciseRows.map((row) => row.exerciseId))];

  const priorExerciseRows: PriorSessionExerciseRow[] = await db
    .select({ id: sessionExercise.id, sessionId: sessionExercise.sessionId, exerciseId: sessionExercise.exerciseId })
    .from(sessionExercise)
    .where(inArray(sessionExercise.exerciseId, exerciseIds));
  const priorCandidates = priorExerciseRows.filter((row) => row.sessionId !== sessionId);
  if (priorCandidates.length === 0) return { history: result, preference };

  const priorSessionIds = [...new Set(priorCandidates.map((row) => row.sessionId))];
  const priorSessionRows = await db
    .select({ id: workoutSession.id, startedAt: workoutSession.startedAt })
    .from(workoutSession)
    .where(inArray(workoutSession.id, priorSessionIds));
  const startedAtBySessionId = new Map(priorSessionRows.map((row) => [row.id, row.startedAt]));

  const priorSetRows = await db
    .select({
      id: loggedSet.id,
      sessionExerciseId: loggedSet.sessionExerciseId,
      setType: loggedSet.setType,
      weightKg: loggedSet.weightKg,
      reps: loggedSet.reps,
      rir: loggedSet.rir,
      side: loggedSet.side,
      completed: loggedSet.completed,
      parentSetId: loggedSet.parentSetId,
    })
    .from(loggedSet)
    .where(
      inArray(
        loggedSet.sessionExerciseId,
        priorCandidates.map((row) => row.id),
      ),
    );

  const setsBySessionExerciseId = new Map<string, LoggedSetInput[]>();
  for (const row of priorSetRows) {
    const bucket = setsBySessionExerciseId.get(row.sessionExerciseId) ?? [];
    bucket.push({
      id: row.id,
      parentSetId: row.parentSetId ?? null,
      setType: row.setType as LoggedSetInput['setType'],
      weightKg: row.weightKg,
      reps: row.reps,
      rir: row.rir,
      side: row.side ?? null,
      completed: row.completed,
    });
    setsBySessionExerciseId.set(row.sessionExerciseId, bucket);
  }

  for (const row of currentExerciseRows) {
    const matchingCandidates = priorCandidates.filter((candidate) => candidate.exerciseId === row.exerciseId);

    // Most-recent-session-first, the same deterministic tie-break session-query.ts documents for
    // its own pickMostRecent: greater started_at wins, a remaining tie resolves by greater id — so
    // this reader can never drift onto a different session ordering than the rest of the app uses.
    const orderedSessionIds = [...new Set(matchingCandidates.map((candidate) => candidate.sessionId))]
      .sort((a, b) => {
        const startedAtA = startedAtBySessionId.get(a) ?? '';
        const startedAtB = startedAtBySessionId.get(b) ?? '';
        if (startedAtA !== startedAtB) return startedAtA < startedAtB ? 1 : -1;
        return a < b ? 1 : -1;
      })
      .slice(0, RECENT_SESSION_WINDOW);

    result[row.id] = orderedSessionIds.map((priorSessionId) => {
      const candidateIdsForSession = matchingCandidates
        .filter((candidate) => candidate.sessionId === priorSessionId)
        .map((candidate) => candidate.id);
      const sets = candidateIdsForSession.flatMap((candidateId) => setsBySessionExerciseId.get(candidateId) ?? []);
      return { sessionId: priorSessionId, sets };
    });
  }

  return { history: result, preference };
}
