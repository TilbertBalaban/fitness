import { canEquip, MODEL_EQUIPMENT_TYPES, type ResolvedInventory } from '@fitness/plate-math';
import type { GenerationCatalog, GenerationCatalogExercise, GenerationCatalogMapping } from './result';

export interface PoolCandidate {
  exercise: GenerationCatalogExercise;
  mappings: GenerationCatalogMapping[];
}

export interface CandidatePool {
  candidates: PoolCandidate[];
  mappingsByExerciseId: Map<string, GenerationCatalogMapping[]>;
}

export interface CandidatePoolInput {
  catalog: GenerationCatalog;
  // null means "no gym profile chosen yet" — the equipment filter is skipped entirely. This is
  // deliberately distinct from an empty ResolvedInventory (a real gym with nothing in it), which
  // filters out every equipment-requiring exercise.
  inventory: ResolvedInventory | null;
  excludedExerciseIds: string[];
}

function groupMappingsByExercise(mappings: GenerationCatalogMapping[]): Map<string, GenerationCatalogMapping[]> {
  const byExercise = new Map<string, GenerationCatalogMapping[]>();
  for (const mapping of mappings) {
    const existing = byExercise.get(mapping.exerciseId);
    if (existing) existing.push(mapping);
    else byExercise.set(mapping.exerciseId, [mapping]);
  }
  return byExercise;
}

// D-08: a candidate whose equipmentRequired is null passes unconditionally — no equipment gate
// applies, guarded exactly the way smart-swap.ts guards every equipment comparison
// (`candidate.equipmentRequired !== null && ...`). A candidate whose equipmentRequired is a
// NON_MODEL_EQUIPMENT_TYPES member (kettlebell, bodyweight, band, medicine_ball, exercise_ball,
// foam_roller, other) also passes unconditionally — there is no inventory concept for those types
// yet (Pattern 2), so canEquip is only ever called for a MODEL_EQUIPMENT_TYPES member.
function equipmentPasses(exercise: GenerationCatalogExercise, inventory: ResolvedInventory | null): boolean {
  if (exercise.equipmentRequired === null) return true;
  if (inventory === null) return true;
  if (!MODEL_EQUIPMENT_TYPES.includes(exercise.equipmentRequired)) return true;
  return canEquip(exercise.equipmentRequired, inventory);
}

// D-09: exclusions are a hard filter applied LAST and unconditionally, never conditional on how
// many candidates the equipment filter already dropped. Filter order here is (a) equipment, then
// (b) exclusion — never the reverse, and never merged into one pass.
export function buildCandidatePool(input: CandidatePoolInput): CandidatePool {
  const excluded = new Set(input.excludedExerciseIds);
  const mappingsByExerciseId = groupMappingsByExercise(input.catalog.mappings);

  const afterEquipment = input.catalog.exercises.filter((exercise) => equipmentPasses(exercise, input.inventory));
  const afterExclusion = afterEquipment.filter((exercise) => !excluded.has(exercise.id));

  const candidates: PoolCandidate[] = afterExclusion.map((exercise) => ({
    exercise,
    mappings: mappingsByExerciseId.get(exercise.id) ?? [],
  }));

  return { candidates, mappingsByExerciseId };
}
