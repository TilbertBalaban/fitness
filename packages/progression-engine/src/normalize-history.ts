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

export type PerSideStrategy = 'weaker' | 'stronger';

// D-12 [CLAUDE'S CALL], 08-CONTEXT.md: a project decision, not a sourced one. Both sides are
// genuinely working performance, so the drop-chain top-set precedent above does not transfer —
// deriving from the weaker side keeps the prescribed load achievable for both limbs, whereas
// deriving from the stronger side would systematically over-prescribe the weaker one, which is
// the exact failure unilateral work exists to correct.
export const PER_SIDE_STRATEGY: PerSideStrategy = 'weaker';

// Mirrors apps/mobile/lib/session/per-side.ts's SIDE_RIGHT value. This package cannot import from
// an app (the dependency direction runs the other way), so the literal is restated rather than
// shared — the two grouping mechanisms share parent_set_id but never each other's triggers.
const PER_SIDE_RIGHT_VALUE = 'right';

// Reduces a per-side pair to one performance under `strategy` (PER_SIDE_STRATEGY by default),
// comparing weight first and reps second. Returns one side's own weight, reps and rir together —
// mixing one side's weight with the other's rep count would describe a set nobody performed.
export function foldPerSidePair(
  left: LoggedSetInput,
  right: LoggedSetInput,
  strategy: PerSideStrategy = PER_SIDE_STRATEGY,
): LoggedSetInput {
  const leftMilli = toMilliForCompare(left.weightKg);
  const rightMilli = toMilliForCompare(right.weightKg);
  if (leftMilli !== rightMilli) {
    const lighter = leftMilli < rightMilli ? left : right;
    const heavier = lighter === left ? right : left;
    return strategy === 'weaker' ? lighter : heavier;
  }
  const fewerReps = left.reps <= right.reps ? left : right;
  const moreReps = fewerReps === left ? right : left;
  return strategy === 'weaker' ? fewerReps : moreReps;
}

// D-11's boundary: folds a session's raw logged rows (drop/myorep/partial groups, per-side pairs,
// warm-ups) down to at most one comparable performance. Supersets need no handling here at all —
// the grouping lives on session_exercise across two DIFFERENT exercises and is invisible to this
// per-exercise fold; that is a deliberate absence, not a gap, proven by this module's own test
// rather than only claimed here.
export function normalizeHistory(sessions: ExerciseSessionSets[]): NormalizedPerformance[] {
  const results: NormalizedPerformance[] = [];

  for (const session of sessions) {
    const topLevelCandidates = session.sets.filter(
      (set) => set.completed && countsTowardWorkingVolume(set.setType) && set.parentSetId === null,
    );
    if (topLevelCandidates.length === 0) continue;

    // A parent carrying no side is a drop/myorep/partial chain and keeps 08-01's parent-only
    // behaviour unchanged. A parent carrying a side is a per-side pair: fold it with its
    // completed right-side child if one exists, or stand alone if one does not — the child
    // appears on completion, not on creation, so its absence is ordinary mid-set state, not a
    // malformed group.
    const effectiveCandidates = topLevelCandidates.map((candidate) => {
      if (candidate.side === null) return candidate;
      const rightChild = session.sets.find(
        (row) => row.parentSetId === candidate.id && row.side === PER_SIDE_RIGHT_VALUE && row.completed,
      );
      return rightChild ? foldPerSidePair(candidate, rightChild) : candidate;
    });

    const topSet = pickTopSet(effectiveCandidates);
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
