import type { MuscleRole } from '@fitness/api-contracts';
import { buildArchivedSet, sortCatalogResults, type CatalogPreference, type SortableCatalogResult } from './catalog-filter';

// The minimum shape scoreAlternatives needs for both the target and any candidate — deliberately
// the same shape for both, since a candidate is scored against the target using identical fields.
export interface SwapExercise {
  id: string;
  name: string;
  movementPattern: string | null;
  equipmentRequired: string | null;
  variationOfId: string | null;
}

export interface SwapMuscleMapping {
  exerciseId: string;
  muscleGroupId: string;
  role: MuscleRole;
  // Decimal-as-exact-string, matching exercise_muscle_mapping's own convention (exercise-detail.ts,
  // packages/api-contracts/src/catalog.ts) — parsed to a number inside this module only, never
  // compared or stored as a string.
  weightFactor: string;
}

// user_exercise_preference's neverSuggest column alongside catalog-filter's own CatalogPreference
// shape (userId/exerciseId/archivedAt) — one archive predicate is reused from catalog-filter.ts
// (buildArchivedSet); never_suggest has no equivalent there, so its exclusion set is built here.
export interface SwapPreference extends CatalogPreference {
  neverSuggest: boolean;
}

// D-22's seam: equipmentSwapConstraints (session-equipment.ts) turns a session's resolved
// inventory into this shape. An allow-list plus an exclude-list covers both "this gym only has
// these machines" and "this one is taken right now" without this module knowing anything about
// that profile shape.
export interface SwapConstraints {
  excludeEquipment?: string[];
  allowEquipment?: string[];
}

export interface ScoredCandidate {
  id: string;
  name: string;
  score: number;
  why: string;
}

// The match signals explainMatch needs to name the winning signal — computed once per candidate
// during scoring and reused for its "why" string rather than re-derived.
export interface SwapSignal {
  muscleScore: number;
  dominantMuscleGroupId: string | null;
  dominantIsPrimaryPrimary: boolean;
  movementPatternMatch: boolean;
  variationSibling: boolean;
}

// Deliberately not: any embedding, similarity model or learned ranking (PROJECT.md rules those out
// project-wide, and a black-box score cannot produce the explanation this feature's own UI
// contract mandates). Every number below is a reviewable, fixed weight — not a learned parameter.
const MOVEMENT_PATTERN_BONUS = 0.5;
const EQUIPMENT_MATCH_BONUS = 0.15;
const VARIATION_SIBLING_BONUS = 0.1;

// Set well above EQUIPMENT_MATCH_BONUS + VARIATION_SIBLING_BONUS (0.25) so neither bonus, nor
// both combined, can alone qualify a candidate with zero muscle overlap and no movement-pattern
// match — a bad suggestion mid-workout is worse than none, and this is what keeps that structurally
// true rather than merely usually true.
export const SWAP_SCORE_THRESHOLD = 0.3;
export const SWAP_RESULT_CAP = 5;

function roleOverlapWeight(targetRole: MuscleRole, candidateRole: MuscleRole): number {
  if (targetRole === 'primary' && candidateRole === 'primary') return 1;
  if (targetRole === 'secondary' && candidateRole === 'secondary') return 0.25;
  return 0.5;
}

function groupMappingsByExercise(mappings: SwapMuscleMapping[]): Map<string, SwapMuscleMapping[]> {
  const byExercise = new Map<string, SwapMuscleMapping[]>();
  for (const mapping of mappings) {
    const existing = byExercise.get(mapping.exerciseId);
    if (existing) existing.push(mapping);
    else byExercise.set(mapping.exerciseId, [mapping]);
  }
  return byExercise;
}

// The dominant signal: sum, over muscle groups present in both the target's and the candidate's
// mappings, the product of their weight_factor values, weighted so a primary-primary match counts
// strictly more than a primary-secondary one, which in turn counts more than secondary-secondary.
// Also tracks which single muscle group contributed the most, for explainMatch to name.
function computeMuscleOverlap(
  targetMappings: SwapMuscleMapping[],
  candidateMappings: SwapMuscleMapping[],
): { muscleScore: number; dominantMuscleGroupId: string | null; dominantIsPrimaryPrimary: boolean } {
  const candidateByGroup = new Map(candidateMappings.map((mapping) => [mapping.muscleGroupId, mapping]));

  let muscleScore = 0;
  let dominantMuscleGroupId: string | null = null;
  let dominantContribution = 0;
  let dominantIsPrimaryPrimary = false;

  for (const targetMapping of targetMappings) {
    const candidateMapping = candidateByGroup.get(targetMapping.muscleGroupId);
    if (!candidateMapping) continue;

    const roleWeight = roleOverlapWeight(targetMapping.role, candidateMapping.role);
    const contribution = Number(targetMapping.weightFactor) * Number(candidateMapping.weightFactor) * roleWeight;
    muscleScore += contribution;

    if (contribution > dominantContribution) {
      dominantContribution = contribution;
      dominantMuscleGroupId = targetMapping.muscleGroupId;
      dominantIsPrimaryPrimary = targetMapping.role === 'primary' && candidateMapping.role === 'primary';
    }
  }

  return { muscleScore, dominantMuscleGroupId, dominantIsPrimaryPrimary };
}

// A bonus, never a filter (CONTEXT.md is explicit: siblings alone are far too narrow — a lat
// pulldown is a reasonable pull-up alternative and shares no parent). A sibling is either: both
// point at the same parent, or one is literally the other's parent.
function isVariationSibling(target: SwapExercise, candidate: SwapExercise): boolean {
  if (target.variationOfId !== null && candidate.variationOfId !== null && target.variationOfId === candidate.variationOfId) {
    return true;
  }
  if (target.variationOfId !== null && candidate.id === target.variationOfId) return true;
  if (candidate.variationOfId !== null && candidate.variationOfId === target.id) return true;
  return false;
}

function buildNeverSuggestSet(preferences: SwapPreference[], userId: string | null): Set<string> {
  if (userId === null) return new Set();
  const excluded = new Set<string>();
  for (const preference of preferences) {
    if (preference.userId === userId && preference.neverSuggest) excluded.add(preference.exerciseId);
  }
  return excluded;
}

function humanizeMuscleGroupId(id: string): string {
  return id.replace(/_/g, ' ');
}

// Returns the one-line, plain-language "why" from the signal that actually won — never a numeric
// score (a score is not an explanation) and never empty. Picks the true dominant contributor by
// comparing each signal's actual point contribution, not merely presence, so a tiny muscle overlap
// alongside a real movement-pattern match is correctly attributed to the pattern.
export function explainMatch(target: SwapExercise, candidate: SwapExercise, signals: SwapSignal): string {
  const musclePoints = signals.muscleScore;
  const movementPoints = signals.movementPatternMatch ? MOVEMENT_PATTERN_BONUS : 0;
  const variationPoints = signals.variationSibling ? VARIATION_SIBLING_BONUS : 0;

  if (musclePoints > 0 && musclePoints >= movementPoints && musclePoints >= variationPoints && signals.dominantMuscleGroupId) {
    const muscleName = humanizeMuscleGroupId(signals.dominantMuscleGroupId);
    return signals.dominantIsPrimaryPrimary ? `Same primary muscle: ${muscleName}` : `Also targets: ${muscleName}`;
  }
  if (movementPoints > 0 && movementPoints >= variationPoints && target.movementPattern) {
    return `Same movement pattern: ${humanizeMuscleGroupId(target.movementPattern)}`;
  }
  if (variationPoints > 0) {
    return 'A variation of the same movement';
  }
  // Not reachable given SWAP_SCORE_THRESHOLD's relationship to the bonus constants above (a
  // candidate cannot clear the threshold on equipment-match alone), kept as a defensive floor so
  // this function's own contract ("never empty") holds even if that relationship is ever changed.
  return 'Similar exercise';
}

// Pure: no database handle, no React import, no module-level mutable state, no Date.now(). Takes
// plain arrays and returns a new array, neither mutating nor reordering its inputs — which is what
// makes two concurrent calls for two different targets return the same results as two sequential
// calls, by construction rather than by luck.
export function scoreAlternatives(
  target: SwapExercise,
  candidates: SwapExercise[],
  mappings: SwapMuscleMapping[],
  preferences: SwapPreference[],
  userId: string | null,
  constraints: SwapConstraints = {},
): ScoredCandidate[] {
  const archived = buildArchivedSet(preferences, userId);
  const neverSuggested = buildNeverSuggestSet(preferences, userId);
  const mappingsByExercise = groupMappingsByExercise(mappings);
  const targetMappings = mappingsByExercise.get(target.id) ?? [];

  const scored: (ScoredCandidate & SortableCatalogResult)[] = [];

  for (const candidate of candidates) {
    if (candidate.id === target.id) continue;
    if (archived.has(candidate.id)) continue;
    if (neverSuggested.has(candidate.id)) continue;
    if (
      constraints.excludeEquipment &&
      candidate.equipmentRequired !== null &&
      constraints.excludeEquipment.includes(candidate.equipmentRequired)
    ) {
      continue;
    }
    if (
      constraints.allowEquipment &&
      candidate.equipmentRequired !== null &&
      !constraints.allowEquipment.includes(candidate.equipmentRequired)
    ) {
      continue;
    }

    const candidateMappings = mappingsByExercise.get(candidate.id) ?? [];
    const { muscleScore, dominantMuscleGroupId, dominantIsPrimaryPrimary } = computeMuscleOverlap(
      targetMappings,
      candidateMappings,
    );
    const movementPatternMatch =
      target.movementPattern !== null && candidate.movementPattern !== null && target.movementPattern === candidate.movementPattern;
    // Additional small bonus atop the exclusion-time equipment filtering above — a like-for-like
    // machine ranks above a different modality when muscle overlap ties.
    const equipmentMatch = target.equipmentRequired !== null && candidate.equipmentRequired === target.equipmentRequired;
    const variationSibling = isVariationSibling(target, candidate);

    let score = muscleScore;
    if (movementPatternMatch) score += MOVEMENT_PATTERN_BONUS;
    if (equipmentMatch) score += EQUIPMENT_MATCH_BONUS;
    if (variationSibling) score += VARIATION_SIBLING_BONUS;

    if (score < SWAP_SCORE_THRESHOLD) continue;

    const signal: SwapSignal = { muscleScore, dominantMuscleGroupId, dominantIsPrimaryPrimary, movementPatternMatch, variationSibling };
    scored.push({ id: candidate.id, name: candidate.name, score, why: explainMatch(target, candidate, signal) });
  }

  return sortCatalogResults(scored).slice(0, SWAP_RESULT_CAP);
}
