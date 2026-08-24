import { eq, inArray } from 'drizzle-orm';
import type { PrType } from '@fitness/api-contracts';
import { detectPrs, foldPriorBest, type CandidateSet, type PriorBest } from '@fitness/pr-rules';
import { generateClientId } from './id';
import { getPowerSync, type WriteDb } from './powersync';
import { loggedSet, personalRecord, sessionExercise } from './schema';
import { loadSessionTree } from './session-query';

export interface LogPersonalRecordInput {
  userId: string | null;
  exerciseId: string;
  prType: PrType;
  value: number;
  loggedSetId: string;
  achievedAt: Date;
}

// The same 3-place decimal-string scale personal_record.value's Postgres column enforces
// (numeric(10,3)), matching weight_kg's own string-not-float convention (D-04) — a lifetime of
// aggregation across sync must never accumulate binary-float error on either side.
function formatPrValue(value: number): string {
  return value.toFixed(3);
}

// Mirrors logSet's insert shape one-to-one (D-01, D-04): generate a client id, insert, return —
// no read-modify-write, no batch buffer. A PR that only becomes durable later is a PR lost to a
// force-quit between detection and write.
export async function logPersonalRecord(input: LogPersonalRecordInput, db: WriteDb = getPowerSync()): Promise<string> {
  const id = generateClientId();

  await db.insert(personalRecord).values({
    id,
    userId: input.userId,
    exerciseId: input.exerciseId,
    prType: input.prType,
    value: formatPrValue(input.value),
    loggedSetId: input.loggedSetId,
    achievedAt: input.achievedAt.toISOString(),
    reconciledAt: null,
  });

  return id;
}

// One batched read per table, never one per exercise (PITFALLS §13): every candidate exercise's
// session_exercise rows in a single inArray, every candidate row's sets in a second. foldPriorBest
// already ignores warm-up/incomplete/null-weight rows on its own, so this passes every row through
// unfiltered rather than re-deriving that exclusion here.
export async function loadPriorBestByExercise(
  exerciseIds: string[],
  beforeSessionId: string,
  db: WriteDb = getPowerSync(),
): Promise<Map<string, PriorBest>> {
  const result = new Map<string, PriorBest>();
  if (exerciseIds.length === 0) return result;

  const candidateRows = await db
    .select({ id: sessionExercise.id, exerciseId: sessionExercise.exerciseId, sessionId: sessionExercise.sessionId })
    .from(sessionExercise)
    .where(inArray(sessionExercise.exerciseId, exerciseIds));

  const priorRows = candidateRows.filter((row) => row.sessionId !== beforeSessionId);
  const exerciseIdBySessionExerciseId = new Map(priorRows.map((row) => [row.id, row.exerciseId]));

  const setRows = priorRows.length
    ? await db
        .select({
          sessionExerciseId: loggedSet.sessionExerciseId,
          weightKg: loggedSet.weightKg,
          reps: loggedSet.reps,
          setType: loggedSet.setType,
          completed: loggedSet.completed,
        })
        .from(loggedSet)
        .where(
          inArray(
            loggedSet.sessionExerciseId,
            priorRows.map((row) => row.id),
          ),
        )
    : [];

  const candidatesByExerciseId = new Map<string, CandidateSet[]>();
  for (const exerciseId of exerciseIds) candidatesByExerciseId.set(exerciseId, []);
  for (const set of setRows) {
    const exerciseId = exerciseIdBySessionExerciseId.get(set.sessionExerciseId);
    if (!exerciseId) continue;
    candidatesByExerciseId.get(exerciseId)?.push({
      weightKg: set.weightKg === null ? null : Number(set.weightKg),
      reps: set.reps,
      setType: set.setType,
      completed: set.completed,
    });
  }

  for (const exerciseId of exerciseIds) {
    result.set(exerciseId, foldPriorBest(candidatesByExerciseId.get(exerciseId) ?? []));
  }

  return result;
}

function maxOrNull(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

// Folds one additional candidate's contribution into an existing PriorBest without re-scanning the
// exercise's whole history — used below to advance the prior best WITHIN a session as its sets are
// evaluated in order, so a session with two progressively heavier sets records the second as the
// PR, not both. A plain elementwise max/map-merge, not a rule of its own — the rules stay entirely
// inside @fitness/pr-rules.
function mergePriorBest(base: PriorBest, addition: PriorBest): PriorBest {
  const mostRepsAtWeight = new Map(base.mostRepsAtWeight);
  for (const [weight, reps] of addition.mostRepsAtWeight) {
    const existing = mostRepsAtWeight.get(weight);
    if (existing === undefined || reps > existing) mostRepsAtWeight.set(weight, reps);
  }
  return {
    heaviestWeight: maxOrNull(base.heaviestWeight, addition.heaviestWeight),
    bestE1rm: maxOrNull(base.bestE1rm, addition.bestE1rm),
    bestSetVolume: maxOrNull(base.bestSetVolume, addition.bestSetVolume),
    mostRepsAtWeight,
  };
}

interface OrderedCandidate extends CandidateSet {
  loggedSetId: string;
  exerciseId: string;
  loggedAt: string;
}

// Loads the session tree, loads each of its exercises' prior bests, then walks every set in
// logged_at order, writing one personal_record row per DetectedPr through logPersonalRecord
// (loggedSetId pointing at the exact set that achieved it) and folding that set into the in-memory
// prior best before moving to the next set — so the prior best advances within the session, not
// only between sessions. detectPrs/foldPriorBest already no-op on warm-up/incomplete/null-weight
// sets, so every set is passed through rather than pre-filtered here.
export async function detectPrsForSession(sessionId: string, userId: string | null, db: WriteDb = getPowerSync()): Promise<void> {
  const tree = await loadSessionTree(sessionId, db);
  if (!tree) return;

  const exerciseIds = [...new Set(tree.exercises.map((exercise) => exercise.exerciseId))];
  const priorBestByExerciseId = await loadPriorBestByExercise(exerciseIds, sessionId, db);

  const candidates: OrderedCandidate[] = [];
  for (const exercise of tree.exercises) {
    for (const set of tree.setsByExerciseId[exercise.id] ?? []) {
      candidates.push({
        loggedSetId: set.id,
        exerciseId: exercise.exerciseId,
        loggedAt: set.loggedAt,
        weightKg: set.weightKg === null ? null : Number(set.weightKg),
        reps: set.reps,
        setType: set.setType,
        completed: set.completed,
      });
    }
  }
  candidates.sort((a, b) => {
    if (a.loggedAt !== b.loggedAt) return a.loggedAt < b.loggedAt ? -1 : 1;
    return a.loggedSetId < b.loggedSetId ? -1 : 1;
  });

  for (const candidate of candidates) {
    const priorBest = priorBestByExerciseId.get(candidate.exerciseId) ?? foldPriorBest([]);
    const detected = detectPrs(candidate, priorBest);

    for (const pr of detected) {
      await logPersonalRecord(
        {
          userId,
          exerciseId: candidate.exerciseId,
          prType: pr.prType,
          value: pr.value,
          loggedSetId: candidate.loggedSetId,
          achievedAt: new Date(candidate.loggedAt),
        },
        db,
      );
    }

    priorBestByExerciseId.set(candidate.exerciseId, mergePriorBest(priorBest, foldPriorBest([candidate])));
  }
}

export interface PersonalRecordRow {
  id: string;
  exerciseId: string;
  prType: string;
  value: string;
  loggedSetId: string | null;
  achievedAt: string;
}

// Joined by logged_set_id against the session's own set ids, never an achieved_at time window
// (T-05-08-03) — a row synced concurrently from another device cannot be misattributed to this
// session's summary that way. Reads every session_exercise row regardless of removed_at: a record
// achieved on a since-removed exercise's set still belongs to this session's history.
export async function loadSessionPersonalRecords(sessionId: string, db: WriteDb = getPowerSync()): Promise<PersonalRecordRow[]> {
  const exerciseRows = await db.select({ id: sessionExercise.id }).from(sessionExercise).where(eq(sessionExercise.sessionId, sessionId));
  if (exerciseRows.length === 0) return [];

  const setRows = await db
    .select({ id: loggedSet.id })
    .from(loggedSet)
    .where(
      inArray(
        loggedSet.sessionExerciseId,
        exerciseRows.map((row) => row.id),
      ),
    );
  if (setRows.length === 0) return [];

  return db
    .select({
      id: personalRecord.id,
      exerciseId: personalRecord.exerciseId,
      prType: personalRecord.prType,
      value: personalRecord.value,
      loggedSetId: personalRecord.loggedSetId,
      achievedAt: personalRecord.achievedAt,
    })
    .from(personalRecord)
    .where(
      inArray(
        personalRecord.loggedSetId,
        setRows.map((row) => row.id),
      ),
    );
}
