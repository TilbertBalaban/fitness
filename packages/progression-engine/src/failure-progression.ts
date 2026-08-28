import { SET_TYPES, type SetType } from '@fitness/api-contracts';
import type { NormalizedPerformance } from './result';

// The failure-shaped members of SET_TYPES (imported, never retyped): 'failure' is an explicit
// zero-RIR set; 'amrap' ("as many reps as possible") is by definition also a set taken to
// failure at the logged load, even when its own RIR entry is missing or nonzero. Both feed the
// same rule below — the midpoint-plus-RIR formula has no meaning at either.
export const FAILURE_SET_TYPES: readonly SetType[] = SET_TYPES.filter(
  (setType): setType is SetType => setType === 'failure' || setType === 'amrap',
);

export function isFailurePerformance(performance: Pick<NormalizedPerformance, 'rir' | 'setType'>): boolean {
  return performance.rir === 0 || FAILURE_SET_TYPES.includes(performance.setType);
}

const MILLI_KG_SCALE = 3;

// Mirrors achievability.ts's own local bigint milli-kg helpers (packages/plate-math) rather than
// importing them — this monorepo has no decimal library and re-implements this pair per module on
// purpose. No binary-float parse of any kind: two spellings of the same stored weight ('100.000'
// vs '100.0') must compare equal, and two genuinely different weights must never accidentally do.
function toMilliKg(value: string): bigint {
  const [wholePart, fractionPart = ''] = value.split('.');
  const padded = fractionPart.padEnd(MILLI_KG_SCALE, '0').slice(0, MILLI_KG_SCALE);
  return BigInt(wholePart) * 1000n + BigInt(padded.length > 0 ? padded : '0');
}

// D-14: exact canonical-kg equality against the weight exactly as it was logged. Two null
// weights compare equal (both are bodyweight); a null against a value never does. This never
// touches what the current gym can produce — whether the lifter beat the same load is a question
// about what happened, answered from stored history alone; whether they can load that weight
// today is a separate question, answered only when computing the next recommendation. Conflating
// the two would silently rewrite training history whenever a lifter trains somewhere new.
export function sameLoad(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return toMilliKg(a) === toMilliKg(b);
}

// PRGR-03: takes the normalised performances most-recent-first, finds the two most recent
// failure performances, and returns whether the newer one strictly beats the older one's reps at
// an equal load. A first failure set — fewer than two failure performances in history — has
// nothing to beat, so it holds rather than progressing. Takes no gym-equipment argument at all;
// D-14 made structural, not documentary.
export function beatsPriorRepsAtSameLoad(history: NormalizedPerformance[]): boolean {
  const failurePerformances = history.filter(isFailurePerformance);
  if (failurePerformances.length < 2) return false;
  const [newest, prior] = failurePerformances;
  return newest.reps > prior.reps && sameLoad(newest.weightKg, prior.weightKg);
}
