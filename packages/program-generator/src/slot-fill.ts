import type { CandidatePool, PoolCandidate } from './candidate-pool';
import type { SplitSlot } from './split-templates';

const PRIMARY_ROLE_WEIGHT = 1;
const SECONDARY_ROLE_WEIGHT = 0.25;

// A deliberate, documented re-implementation of the muscle-overlap scoring shape proven in
// apps/mobile/lib/catalog/smart-swap.ts, not a promotion of computeMuscleOverlap: smart-swap.ts
// ranks candidates against one specific target exercise's full mapping vector, this ranks many
// candidates against a single muscle-group requirement. D-08's no-re-deriving rule is scoped to
// equipment loadability, not to muscle-overlap scoring, so this second implementation is not the
// drift D-08 exists to prevent.
function scoreCandidateForSlot(candidate: PoolCandidate, slotMuscleGroupId: string): number {
  let score = 0;
  for (const mapping of candidate.mappings) {
    if (mapping.muscleGroupId !== slotMuscleGroupId) continue;
    const roleWeight = mapping.role === 'primary' ? PRIMARY_ROLE_WEIGHT : SECONDARY_ROLE_WEIGHT;
    score += Number(mapping.weightFactor) * roleWeight;
  }
  return score;
}

export function scoreSlotCandidates(pool: CandidatePool, slotDef: SplitSlot): { candidate: PoolCandidate; score: number }[] {
  return pool.candidates.map((candidate) => ({
    candidate,
    score: scoreCandidateForSlot(candidate, slotDef.muscleGroupId),
  }));
}

// A small pure string hash (no crypto import, no random source) — deterministic per (variantSeed,
// exerciseId) pair, used only to break score ties. Different variantSeed values reliably produce
// different tie-break orders without any randomness at generation time (D-03).
export function seededRank(variantSeed: number, exerciseId: string): number {
  const seeded = `${variantSeed}:${exerciseId}`;
  let hash = 0;
  for (let i = 0; i < seeded.length; i += 1) {
    hash = (hash * 31 + seeded.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Sorts by score descending, then seededRank ascending, then exercise id ascending, skipping ids
// already picked for that day. Neither mutates nor reorders `pool.candidates` — a fresh scored
// array is built and sorted independently.
export function pickSlotExercise(
  pool: CandidatePool,
  slotDef: SplitSlot,
  variantSeed: number,
  alreadyPickedIds: ReadonlySet<string>,
): PoolCandidate | null {
  const scored = scoreSlotCandidates(pool, slotDef).filter(
    ({ candidate }) => !alreadyPickedIds.has(candidate.exercise.id),
  );

  const eligible = scored.filter(({ score }) => score > 0);
  if (eligible.length === 0) return null;

  const sorted = [...eligible].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    const rankA = seededRank(variantSeed, a.candidate.exercise.id);
    const rankB = seededRank(variantSeed, b.candidate.exercise.id);
    if (rankA !== rankB) return rankA - rankB;
    return a.candidate.exercise.id < b.candidate.exercise.id ? -1 : 1;
  });

  return sorted[0]!.candidate;
}
