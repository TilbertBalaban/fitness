// D-01: a single exercise never carries more than MAX_SETS_PER_EXERCISE sets in the hardest
// training cycle a program will ever assign it. When a muscle group's hardest-cycle per-session
// target exceeds the cap, it gets a second (or third, ...) exercise rather than one exercise
// absorbing the whole target. MIN_SETS_PER_EXERCISE is the floor session-fit.ts's reduction phase
// may not cross once an exercise exists — it is not a floor this module raises small targets to;
// splitSessionSets(1) still returns [1], matching the pre-existing Math.max(1, ...) guard on the
// caller's session-set rounding.
//
// D-04 amendment (2026-09-02): raised from 2 to 3 — two working sets is below the effective range
// for any goal this generator serves.
export const MAX_SETS_PER_EXERCISE = 5;
export const MIN_SETS_PER_EXERCISE = 3;

export function exerciseCountForSessionSets(sessionSets: number): number {
  return Math.max(1, Math.ceil(sessionSets / MAX_SETS_PER_EXERCISE));
}

// Splits totalSets as evenly as possible across exerciseCount entries: every entry gets
// Math.floor(totalSets / exerciseCount), and the first (totalSets % exerciseCount) entries get one
// more, so the result is non-increasing and sums to totalSets whenever totalSets >= exerciseCount.
// Every entry is floored at 1 regardless — a caller passing a small totalSets against a larger
// exerciseCount (e.g. distributeSets(1, 2)) gets [1, 1], not [1, 0].
export function distributeSets(totalSets: number, exerciseCount: number): number[] {
  const base = Math.floor(totalSets / exerciseCount);
  const remainder = totalSets % exerciseCount;
  return Array.from({ length: exerciseCount }, (_, index) => Math.max(1, base + (index < remainder ? 1 : 0)));
}

export function splitSessionSets(sessionSets: number): number[] {
  return distributeSets(sessionSets, exerciseCountForSessionSets(sessionSets));
}
