import type { ResolvedInventory } from '@fitness/plate-math';
import type { GenerationCatalog, GenerationCatalogExercise, GenerationInput } from '../result';
import { buildCandidatePool } from '../candidate-pool';
import { generateProgram } from '../generate';

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

// D-09 degraded path: the exclusion filter runs last and unconditionally, so a muscle group whose
// every other candidate has already been dropped by equipment does NOT get the excluded id back as
// a fallback. The generator reports the gap instead of filling it with the refused movement.
describe('buildCandidatePool under D-09 degradation', () => {
  it('returns no chest candidate when the only equippable one is excluded', () => {
    const catalog: GenerationCatalog = {
      exercises: [
        exercise({ id: 'bench-press', equipmentRequired: 'barbell' }),
        exercise({ id: 'machine-press', equipmentRequired: 'machine' }),
      ],
      mappings: [
        { exerciseId: 'bench-press', muscleGroupId: 'chest', role: 'primary', weightFactor: '1.0' },
        { exerciseId: 'machine-press', muscleGroupId: 'chest', role: 'primary', weightFactor: '1.0' },
      ],
    };
    // No machines, so machine-press is dropped by the equipment filter; bench-press is the only
    // survivor, and it is the one the user excluded.
    const barbellOnly = inventory({ plates: [{ weightKg: '20', pairCount: 2 }], machines: [] });

    const pool = buildCandidatePool({
      catalog,
      inventory: barbellOnly,
      excludedExerciseIds: ['bench-press'],
    });

    expect(pool.candidates.map((candidate) => candidate.exercise.id)).not.toContain('bench-press');
    expect(pool.candidates.map((candidate) => candidate.exercise.id)).not.toContain('machine-press');
    expect(pool.candidates).toHaveLength(0);
  });

  it('keeps the exclusion out even when it is the last candidate of any kind', () => {
    const catalog = catalogOf([exercise({ id: 'only-one' })]);

    const pool = buildCandidatePool({ catalog, inventory: null, excludedExerciseIds: ['only-one'] });

    expect(pool.candidates).toHaveLength(0);
  });
});

// The same D-09 guarantee asserted end to end: an excluded id is absent from every emitted slot,
// and the gap it leaves is reported rather than filled.
describe('generateProgram under D-09 degradation', () => {
  const MUSCLE_GROUPS_IN_FULL_BODY_3 = [
    'chest',
    'lats',
    'quads',
    'hamstrings',
    'glutes',
    'front_delts',
    'side_delts',
    'biceps',
    'triceps',
    'abs',
  ] as const;

  function inputWithSingleCandidatePerGroup(overrides: Partial<GenerationInput> = {}): GenerationInput {
    const exercises = MUSCLE_GROUPS_IN_FULL_BODY_3.map((muscleGroupId) => exercise({ id: `ex-${muscleGroupId}` }));
    const mappings = MUSCLE_GROUPS_IN_FULL_BODY_3.map((muscleGroupId) => ({
      exerciseId: `ex-${muscleGroupId}`,
      muscleGroupId,
      role: 'primary' as const,
      weightFactor: '1.0',
    }));

    return {
      routineName: 'My Program',
      trainingGoal: 'hypertrophy',
      experienceLevel: 'intermediate',
      daysPerWeek: 3,
      sessionLengthMinutes: 60,
      splitPreference: 'full_body',
      emphasis: {},
      deloadPlacement: 'none',
      deloadEveryNCycles: null,
      trainingCycleCount: 4,
      variantSeed: 1,
      catalog: { exercises, mappings },
      inventory: null,
      excludedExerciseIds: [],
      ...overrides,
    };
  }

  it('emits no slot for the excluded id and reports the chest gap instead of filling it', () => {
    const tree = generateProgram(inputWithSingleCandidatePerGroup({ excludedExerciseIds: ['ex-chest'] }));

    const slotExerciseIds = tree.days.flatMap((day) => day.slots.map((slot) => slot.exerciseId));
    expect(slotExerciseIds).not.toContain('ex-chest');
    expect(
      tree.degradations.some((entry) => entry.kind === 'slot_unfillable' && entry.muscleGroupId === 'chest'),
    ).toBe(true);
  });

  it('still fills every other muscle group — one exclusion degrades one slot, not the program', () => {
    const tree = generateProgram(inputWithSingleCandidatePerGroup({ excludedExerciseIds: ['ex-chest'] }));

    const slotExerciseIds = new Set(tree.days.flatMap((day) => day.slots.map((slot) => slot.exerciseId)));
    expect(slotExerciseIds.has('ex-lats')).toBe(true);
    expect(slotExerciseIds.has('ex-quads')).toBe(true);
  });
});
