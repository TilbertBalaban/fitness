import { and, eq, inArray } from 'drizzle-orm';
import { PR_TYPES, type PrType } from '@fitness/api-contracts';
import { detectPrs, emptyPriorBest, foldPriorBest, type CandidateSet, type PriorBest } from '@fitness/pr-rules';
import type { Database } from '../db/drizzle.module';
import { loggedSet, sessionExercise, workoutSession } from '../db/schema/session';

type QueryExecutor = Pick<Database, 'select'>;

export interface ReplaySetInput {
  loggedSetId: string;
  localDate: string;
  loggedAt: string;
  setIndex: number;
  setType: string;
  completed: boolean;
  weightKg: number | null;
  reps: number;
}

export interface PersonalRecordReplayInput {
  exerciseId: string;
  sets: ReplaySetInput[];
}

export interface ReplayedRecord {
  exerciseId: string;
  prType: PrType;
  value: number;
  loggedSetId: string;
  achievedAt: string;
}

// weight_kg arrives as a Drizzle decimal string at the read boundary — parsed once here, with a
// non-finite result dropped rather than coerced into a silent NaN that could otherwise decide a
// record on its own (T-10-09).
function parseFiniteNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareReplaySets(a: ReplaySetInput, b: ReplaySetInput): number {
  if (a.localDate !== b.localDate) return a.localDate < b.localDate ? -1 : 1;
  if (a.loggedAt !== b.loggedAt) return a.loggedAt < b.loggedAt ? -1 : 1;
  return a.setIndex - b.setIndex;
}

// Built FROM the rules package's own PR_TYPES tuple, never a second literal list of the four
// values — this is what lets the final sort order the (localDate, loggedAt, setIndex, prType)
// tuple without this file re-naming a single PR type.
const PR_TYPE_ORDER = new Map(PR_TYPES.map((type, index) => [type, index]));

function maxOrNull(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

// A plain elementwise max/map merge, not a rule of its own — mirrors the mobile client's own
// mergePriorBest (apps/mobile/lib/db/personal-record.ts), which folds one more candidate's
// contribution into a running PriorBest without re-scanning the exercise's whole history. The PR
// eligibility predicate stays entirely inside foldPriorBest/detectPrs; this function only combines
// two already-computed PriorBest values.
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

// Replays one exercise's whole completed history from scratch: sorted chronologically, walked
// against an advancing PriorBest, with detectPrs/foldPriorBest supplying every eligibility and
// improvement rule. A fresh answer every call — never an append to a previous run — so the
// caller (reconcilePersonalRecords) can diff this result against the stored ledger and delete
// whatever a fresh replay no longer confirms (D-03).
export function replayPersonalRecords(input: PersonalRecordReplayInput): ReplayedRecord[] {
  const sorted = [...input.sets].sort(compareReplaySets);

  let priorBest = emptyPriorBest();
  const dated: { record: ReplayedRecord; localDate: string; setIndex: number }[] = [];

  for (const set of sorted) {
    const candidate: CandidateSet = {
      weightKg: set.weightKg,
      reps: set.reps,
      setType: set.setType,
      completed: set.completed,
    };

    for (const detected of detectPrs(candidate, priorBest)) {
      dated.push({
        record: {
          exerciseId: input.exerciseId,
          prType: detected.prType,
          value: detected.value,
          loggedSetId: set.loggedSetId,
          achievedAt: set.loggedAt,
        },
        localDate: set.localDate,
        setIndex: set.setIndex,
      });
    }

    priorBest = mergePriorBest(priorBest, foldPriorBest([candidate]));
  }

  dated.sort((a, b) => {
    if (a.localDate !== b.localDate) return a.localDate < b.localDate ? -1 : 1;
    if (a.record.achievedAt !== b.record.achievedAt) return a.record.achievedAt < b.record.achievedAt ? -1 : 1;
    if (a.setIndex !== b.setIndex) return a.setIndex - b.setIndex;
    const orderA = PR_TYPE_ORDER.get(a.record.prType) ?? 0;
    const orderB = PR_TYPE_ORDER.get(b.record.prType) ?? 0;
    return orderA - orderB;
  });

  return dated.map((entry) => entry.record);
}

function coerceTimestamp(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

// Exactly three selects regardless of history size: session_exercise joined to workout_session
// for the dates, then logged_set, and nothing else — the join above already supplied the dates,
// so there is no third round trip for workout_session. Never one query per exercise or per
// session (PITFALLS §13).
export async function loadExerciseSetHistory(
  tx: QueryExecutor,
  userId: string,
  exerciseIds: string[],
): Promise<Map<string, ReplaySetInput[]>> {
  const result = new Map<string, ReplaySetInput[]>();
  for (const exerciseId of exerciseIds) result.set(exerciseId, []);
  if (exerciseIds.length === 0) return result;

  const sessionExercises = await tx
    .select({
      id: sessionExercise.id,
      exerciseId: sessionExercise.exerciseId,
      localDate: workoutSession.localDate,
    })
    .from(sessionExercise)
    .innerJoin(workoutSession, eq(sessionExercise.sessionId, workoutSession.id))
    .where(
      and(
        eq(workoutSession.userId, userId),
        eq(workoutSession.status, 'completed'),
        inArray(sessionExercise.exerciseId, exerciseIds),
      ),
    );

  const sessionExerciseIds = sessionExercises.map((row) => row.id);
  const loggedSets = sessionExerciseIds.length
    ? await tx
        .select({
          sessionExerciseId: loggedSet.sessionExerciseId,
          loggedSetId: loggedSet.id,
          setIndex: loggedSet.setIndex,
          setType: loggedSet.setType,
          completed: loggedSet.completed,
          weightKg: loggedSet.weightKg,
          reps: loggedSet.reps,
          loggedAt: loggedSet.loggedAt,
        })
        .from(loggedSet)
        .where(inArray(loggedSet.sessionExerciseId, sessionExerciseIds))
    : [];

  const infoBySessionExerciseId = new Map(sessionExercises.map((row) => [row.id, row]));

  for (const row of loggedSets) {
    const info = infoBySessionExerciseId.get(row.sessionExerciseId);
    if (!info) continue;
    const list = result.get(info.exerciseId) ?? [];
    list.push({
      loggedSetId: row.loggedSetId,
      localDate: info.localDate,
      loggedAt: coerceTimestamp(row.loggedAt),
      setIndex: row.setIndex,
      setType: row.setType,
      completed: row.completed,
      weightKg: parseFiniteNumber(row.weightKg),
      reps: row.reps,
    });
    result.set(info.exerciseId, list);
  }

  return result;
}
