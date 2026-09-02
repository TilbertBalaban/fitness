import type { MovementPattern } from '@fitness/api-contracts';
import { MODEL_EQUIPMENT_TYPES } from '@fitness/plate-math';
import type { CandidatePool, PoolCandidate } from './candidate-pool';
import type { GenerationCatalogExercise } from './result';
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

export type MovementClass = 'compound' | 'isolation' | 'unclassified';

// D-07 tier 2 reads movementPattern, not the count of secondary mappings: in the seeded catalog a
// null pattern is what marks stretches, plyometrics, cardio and strongman entries, and counting
// secondaries ranked exactly those (a bent press, a kipping muscle-up) above a bench press.
export function movementClassOf(exercise: GenerationCatalogExercise): MovementClass {
  if (exercise.movementPattern === null) return 'unclassified';
  return exercise.movementPattern === 'isolation' ? 'isolation' : 'compound';
}

const FIRST_PICK_CLASS_RANK: Record<MovementClass, number> = { compound: 2, isolation: 1, unclassified: 0 };
const SECOND_PICK_CLASS_RANK: Record<MovementClass, number> = { isolation: 2, compound: 1, unclassified: 0 };

function movementClassRank(candidate: PoolCandidate, preferCompound: boolean): number {
  const rank = preferCompound ? FIRST_PICK_CLASS_RANK : SECOND_PICK_CLASS_RANK;
  return rank[movementClassOf(candidate.exercise)];
}

// D-07 tier 3: reads MODEL_EQUIPMENT_TYPES from its single source (@fitness/plate-math,
// candidate-pool.ts's own pattern) rather than a hand-typed list — the array has five members
// (barbell, ez_bar, dumbbell, machine, cable), not the four D-07's prose names. Applies whether or
// not an inventory is in play: the pool has already applied the equipment filter, so this tier is
// purely "is this a type the progression engine can load at all", never a per-gym check.
export function isLoadable(exercise: GenerationCatalogExercise): boolean {
  return exercise.equipmentRequired !== null && MODEL_EQUIPMENT_TYPES.includes(exercise.equipmentRequired);
}

export interface SlotPickContext {
  variantSeed: number;
  alreadyPickedIds: ReadonlySet<string>;
  weekPickedIdsForGroup: ReadonlySet<string>;
  coveredMovementPatterns: ReadonlySet<MovementPattern>;
  // D-07: a group's first exercise in a day ranks compound > isolation > unclassified; a second
  // exercise for the same group (D-02) ranks isolation > compound > unclassified.
  preferCompound: boolean;
}

function hasPrimaryMapping(candidate: PoolCandidate, muscleGroupId: string): boolean {
  return candidate.mappings.some((mapping) => mapping.muscleGroupId === muscleGroupId && mapping.role === 'primary');
}

function movementPatternNoveltyOf(candidate: PoolCandidate, coveredMovementPatterns: ReadonlySet<MovementPattern>): number {
  const pattern = candidate.exercise.movementPattern;
  return pattern !== null && !coveredMovementPatterns.has(pattern) ? 1 : 0;
}

function weekNoveltyOf(candidate: PoolCandidate, weekPickedIdsForGroup: ReadonlySet<string>): number {
  return weekPickedIdsForGroup.has(candidate.exercise.id) ? 0 : 1;
}

// Rewritten as a filter chain followed by a comparator sort over a fresh array. Neither mutates
// nor reorders `pool.candidates`.
//
// Filters, in order: drop candidates already picked for the day; drop candidates whose primary
// score is not greater than zero; D-08 — if any survivor has a primary mapping to
// `slotDef.muscleGroupId`, drop every candidate that has none; D-07 — if any survivor has a
// movement class, drop every unclassified candidate; D-06 — if any survivor is outside
// `context.weekPickedIdsForGroup`, drop every candidate inside it. Every gate is conditional on a
// non-empty survivor set, which is exactly what lets a secondary-only, unclassified or
// week-exhausted candidate still be returned rather than the slot going unfilled. `null` comes
// back only when the chain empties entirely.
//
// D-06's gate is strictly stronger than D-07's tier 5 (week-level novelty, below): once the gate
// has run, every survivor shares the same weekNoveltyOf value, so tier 5 only ever decides among
// candidates that are all already used for the week — the exhaustion case the gate lets through.
export function pickSlotExercise(pool: CandidatePool, slotDef: SplitSlot, context: SlotPickContext): PoolCandidate | null {
  const scored = scoreSlotCandidates(pool, slotDef).filter(
    ({ candidate }) => !context.alreadyPickedIds.has(candidate.exercise.id),
  );

  let eligible = scored.filter(({ score }) => score > 0);
  if (eligible.length === 0) return null;

  const hasPrimaryMapped = eligible.some(({ candidate }) => hasPrimaryMapping(candidate, slotDef.muscleGroupId));
  if (hasPrimaryMapped) {
    eligible = eligible.filter(({ candidate }) => hasPrimaryMapping(candidate, slotDef.muscleGroupId));
  }

  const hasClassified = eligible.some(({ candidate }) => movementClassOf(candidate.exercise) !== 'unclassified');
  if (hasClassified) {
    eligible = eligible.filter(({ candidate }) => movementClassOf(candidate.exercise) !== 'unclassified');
  }

  const hasUnusedThisWeek = eligible.some(({ candidate }) => !context.weekPickedIdsForGroup.has(candidate.exercise.id));
  if (hasUnusedThisWeek) {
    eligible = eligible.filter(({ candidate }) => !context.weekPickedIdsForGroup.has(candidate.exercise.id));
  }

  const sorted = [...eligible].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;

    const classA = movementClassRank(a.candidate, context.preferCompound);
    const classB = movementClassRank(b.candidate, context.preferCompound);
    if (classA !== classB) return classB - classA;

    const loadableA = isLoadable(a.candidate.exercise) ? 1 : 0;
    const loadableB = isLoadable(b.candidate.exercise) ? 1 : 0;
    if (loadableA !== loadableB) return loadableB - loadableA;

    const noveltyA = movementPatternNoveltyOf(a.candidate, context.coveredMovementPatterns);
    const noveltyB = movementPatternNoveltyOf(b.candidate, context.coveredMovementPatterns);
    if (noveltyA !== noveltyB) return noveltyB - noveltyA;

    const weekNoveltyA = weekNoveltyOf(a.candidate, context.weekPickedIdsForGroup);
    const weekNoveltyB = weekNoveltyOf(b.candidate, context.weekPickedIdsForGroup);
    if (weekNoveltyA !== weekNoveltyB) return weekNoveltyB - weekNoveltyA;

    const rankA = seededRank(context.variantSeed, a.candidate.exercise.id);
    const rankB = seededRank(context.variantSeed, b.candidate.exercise.id);
    if (rankA !== rankB) return rankA - rankB;

    return a.candidate.exercise.id < b.candidate.exercise.id ? -1 : 1;
  });

  return sorted[0]!.candidate;
}
