import { countsTowardWorkingVolume } from '@fitness/api-contracts';
import type { ExerciseSessionSets, LoggedSetInput, NormalizedPerformance } from './result';

function toMilliForCompare(weightKg: string | null): bigint {
  if (weightKg === null) return 0n;
  const [wholePart, fractionPart = ''] = weightKg.split('.');
  const padded = fractionPart.padEnd(3, '0').slice(0, 3);
  return BigInt(wholePart) * 1000n + BigInt(padded.length > 0 ? padded : '0');
}

// The tie-break (heaviest weight, then higher reps, then lower id) is stated explicitly because a
// sort whose ties are unspecified is not deterministic across engines — the same input set could
// otherwise fold to a different NormalizedPerformance on Node vs Hermes vs JSC depending on each
// engine's (unspecified) stable-sort tie behaviour for equal comparator results.
function pickTopSet(sets: LoggedSetInput[]): LoggedSetInput {
  const [winner] = sets.slice().sort((a, b) => {
    const weightDiff = toMilliForCompare(b.weightKg) - toMilliForCompare(a.weightKg);
    if (weightDiff !== 0n) return weightDiff > 0n ? 1 : -1;
    if (b.reps !== a.reps) return b.reps - a.reps;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return winner;
}

// D-11's boundary: folds a session's raw logged rows (drop/myorep/partial groups, per-side pairs,
// warm-ups) down to at most one comparable performance. Supersets need no handling here at all —
// the grouping lives on session_exercise across two DIFFERENT exercises and is invisible to this
// per-exercise fold; that is a deliberate absence, not a gap. 08-03 expands this function to
// per-side pairs and failure sets.
export function normalizeHistory(sessions: ExerciseSessionSets[]): NormalizedPerformance[] {
  const results: NormalizedPerformance[] = [];

  for (const session of sessions) {
    const candidates = session.sets.filter(
      (set) => set.completed && countsTowardWorkingVolume(set.setType) && set.parentSetId === null,
    );
    if (candidates.length === 0) continue;

    const topSet = pickTopSet(candidates);
    results.push({
      sessionId: session.sessionId,
      weightKg: topSet.weightKg,
      reps: topSet.reps,
      rir: topSet.rir,
      setType: topSet.setType,
    });
  }

  return results;
}
