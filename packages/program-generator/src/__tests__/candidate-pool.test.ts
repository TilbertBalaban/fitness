import type { ResolvedInventory } from '@fitness/plate-math';
import type { GenerationCatalog, GenerationCatalogExercise } from '../result';
import { buildCandidatePool } from '../candidate-pool';

function exercise(overrides: Partial<GenerationCatalogExercise> & { id: string }): GenerationCatalogExercise {
  return {
    name: overrides.id,
    equipmentRequired: null,
    movementPattern: null,
    ...overrides,
  };
}

function inventory(overrides: Partial<ResolvedInventory> = {}): ResolvedInventory {
  return {
    nativeUnit: 'kg',
    barbellWeightKg: '20',
    plates: [],
    dumbbells: [],
    machines: [],
    unavailableEquipmentTypes: [],
    ...overrides,
  };
}

function catalogOf(exercises: GenerationCatalogExercise[]): GenerationCatalog {
  return { exercises, mappings: [] };
}

describe('buildCandidatePool', () => {
  it('excludes a dumbbell-requiring exercise from a pool built against a dumbbell-free inventory', () => {
    const catalog = catalogOf([
      exercise({ id: 'bench', equipmentRequired: 'barbell' }),
      exercise({ id: 'db-press', equipmentRequired: 'dumbbell' }),
      exercise({ id: 'push-up', equipmentRequired: null }),
    ]);

    const pool = buildCandidatePool({ catalog, inventory: inventory({ dumbbells: [] }), excludedExerciseIds: [] });
    const ids = pool.candidates.map((candidate) => candidate.exercise.id);

    expect(ids).toContain('bench');
    expect(ids).not.toContain('db-press');
  });

  it('includes a null-equipmentRequired exercise regardless of how empty the inventory is', () => {
    const catalog = catalogOf([exercise({ id: 'push-up', equipmentRequired: null })]);

    const pool = buildCandidatePool({
      catalog,
      inventory: inventory({ barbellWeightKg: null, dumbbells: [], machines: [] }),
      excludedExerciseIds: [],
    });

    expect(pool.candidates.map((candidate) => candidate.exercise.id)).toEqual(['push-up']);
  });

  it('excludes the named exercise even when the inventory equips nothing else', () => {
    const catalog = catalogOf([
      exercise({ id: 'chest-fly', equipmentRequired: 'machine' }),
      exercise({ id: 'push-up', equipmentRequired: null }),
    ]);

    const emptyInventory = inventory({ barbellWeightKg: null, dumbbells: [], machines: [] });
    const pool = buildCandidatePool({ catalog, inventory: emptyInventory, excludedExerciseIds: ['push-up'] });

    expect(pool.candidates.map((candidate) => candidate.exercise.id)).not.toContain('push-up');
  });

  it('runs the exclusion filter last and unconditionally, never reaching past it as a fallback', () => {
    const catalog = catalogOf([exercise({ id: 'only-candidate', equipmentRequired: null })]);

    const pool = buildCandidatePool({ catalog, inventory: null, excludedExerciseIds: ['only-candidate'] });

    expect(pool.candidates).toHaveLength(0);
  });

  it('treats a null inventory as "skip the equipment filter", not as an empty gym', () => {
    const catalog = catalogOf([exercise({ id: 'db-press', equipmentRequired: 'dumbbell' })]);

    const pool = buildCandidatePool({ catalog, inventory: null, excludedExerciseIds: [] });

    expect(pool.candidates.map((candidate) => candidate.exercise.id)).toEqual(['db-press']);
  });

  it('treats a non-modelled equipment type (e.g. kettlebell) as always equippable', () => {
    const catalog = catalogOf([exercise({ id: 'kb-swing', equipmentRequired: 'kettlebell' })]);
    const emptyInventory = inventory({ barbellWeightKg: null, dumbbells: [], machines: [] });

    const pool = buildCandidatePool({ catalog, inventory: emptyInventory, excludedExerciseIds: [] });

    expect(pool.candidates.map((candidate) => candidate.exercise.id)).toEqual(['kb-swing']);
  });
});
