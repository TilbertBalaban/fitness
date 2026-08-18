import {
  applyCatalogFilters,
  deriveFacets,
  sortCatalogResults,
  type CatalogExercise,
  type CatalogMuscleMapping,
  type CatalogPreference,
} from '../catalog-filter';

const EXERCISES: CatalogExercise[] = [
  {
    id: 'ex-bench',
    name: 'Bench Press',
    aliases: null,
    movementPattern: 'horizontal_push',
    equipmentRequired: 'barbell',
  },
  {
    id: 'ex-squat',
    name: 'Back Squat',
    aliases: null,
    movementPattern: 'squat',
    equipmentRequired: 'barbell',
  },
  {
    id: 'ex-row',
    name: 'Cable Row',
    aliases: null,
    movementPattern: 'horizontal_pull',
    equipmentRequired: 'cable',
  },
  {
    id: 'ex-crunch',
    name: 'Crunch',
    aliases: null,
    movementPattern: null,
    equipmentRequired: null,
  },
];

const MAPPINGS: CatalogMuscleMapping[] = [
  { exerciseId: 'ex-bench', muscleGroupId: 'chest' },
  { exerciseId: 'ex-bench', muscleGroupId: 'triceps' },
  { exerciseId: 'ex-squat', muscleGroupId: 'quads' },
  { exerciseId: 'ex-row', muscleGroupId: 'lats' },
];

describe('applyCatalogFilters', () => {
  it('returns every non-archived exercise when no dimension is selected', () => {
    const result = applyCatalogFilters(EXERCISES, MAPPINGS, [], { muscleGroupIds: [], equipment: [], movementPatterns: [] }, 'user-1');
    expect(result.map((r) => r.id).sort()).toEqual(['ex-bench', 'ex-crunch', 'ex-row', 'ex-squat']);
  });

  it('selecting every value of a dimension returns the same set as selecting none of it', () => {
    // Deliberately excludes ex-crunch (null equipmentRequired) from this fixture — the
    // select-all/select-none equivalence only holds when every row actually carries a value for
    // the dimension; the "missing field" case is its own separate, dedicated test below.
    const withValues = EXERCISES.filter((exercise) => exercise.equipmentRequired !== null);
    const filtersNone = { muscleGroupIds: [], equipment: [], movementPatterns: [] };
    const filtersAll = { muscleGroupIds: [], equipment: ['barbell', 'cable'], movementPatterns: [] };

    const resultNone = applyCatalogFilters(withValues, MAPPINGS, [], filtersNone, 'user-1').map((r) => r.id).sort();
    const resultAll = applyCatalogFilters(withValues, MAPPINGS, [], filtersAll, 'user-1').map((r) => r.id).sort();

    expect(resultAll).toEqual(['ex-bench', 'ex-row', 'ex-squat']);
    expect(resultAll).toEqual(resultNone);
  });

  it('excludes an exercise missing a facet value from that facet, without making it unreachable in general', () => {
    const result = applyCatalogFilters(
      EXERCISES,
      MAPPINGS,
      [],
      { muscleGroupIds: [], equipment: ['barbell', 'cable'], movementPatterns: [] },
      'user-1',
    );
    // ex-crunch has no equipmentRequired at all — excluded from this facet's filtered result —
    // but with the filter inactive (empty array) it is still present, i.e. still reachable.
    expect(result.map((r) => r.id)).not.toContain('ex-crunch');
    const unfiltered = applyCatalogFilters(
      EXERCISES,
      MAPPINGS,
      [],
      { muscleGroupIds: [], equipment: [], movementPatterns: [] },
      'user-1',
    );
    expect(unfiltered.map((r) => r.id)).toContain('ex-crunch');
  });

  it('selecting two values within one dimension returns their union with no duplicates', () => {
    const result = applyCatalogFilters(
      EXERCISES,
      MAPPINGS,
      [],
      { muscleGroupIds: [], equipment: ['barbell', 'cable'], movementPatterns: [] },
      'user-1',
    );
    const ids = result.map((r) => r.id);
    expect(ids.sort()).toEqual(['ex-bench', 'ex-row', 'ex-squat']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('combines two dimensions as an intersection (AND across dimensions, OR within one)', () => {
    const result = applyCatalogFilters(
      EXERCISES,
      MAPPINGS,
      [],
      { muscleGroupIds: ['chest', 'quads'], equipment: ['barbell'], movementPatterns: [] },
      'user-1',
    );
    // Both ex-bench (chest, barbell) and ex-squat (quads, barbell) satisfy both dimensions;
    // ex-row has neither a matching muscle group nor barbell equipment.
    expect(result.map((r) => r.id).sort()).toEqual(['ex-bench', 'ex-squat']);
  });

  it('excludes an exercise with a null movement_pattern when a movement-pattern chip is active', () => {
    const result = applyCatalogFilters(
      EXERCISES,
      MAPPINGS,
      [],
      { muscleGroupIds: [], equipment: [], movementPatterns: ['squat'] },
      'user-1',
    );
    expect(result.map((r) => r.id)).not.toContain('ex-crunch');
    expect(result.map((r) => r.id)).toEqual(['ex-squat']);
  });

  it('excludes an exercise archived for the current user, but includes it for a different user', () => {
    const preferences: CatalogPreference[] = [
      { userId: 'user-1', exerciseId: 'ex-bench', archivedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const filters = { muscleGroupIds: [], equipment: [], movementPatterns: [] };

    const forUser1 = applyCatalogFilters(EXERCISES, MAPPINGS, preferences, filters, 'user-1');
    const forUser2 = applyCatalogFilters(EXERCISES, MAPPINGS, preferences, filters, 'user-2');

    expect(forUser1.map((r) => r.id)).not.toContain('ex-bench');
    expect(forUser2.map((r) => r.id)).toContain('ex-bench');
  });
});

describe('sortCatalogResults', () => {
  it('orders by score descending, then name ascending, then id ascending — invariant to input shuffling', () => {
    const scored = [
      { id: 'b', name: 'Same Name', score: 1 },
      { id: 'a', name: 'Same Name', score: 1 },
      { id: 'z', name: 'Zebra Curl', score: 1 },
      { id: 'x', name: 'Ape Row', score: 5 },
    ];

    const shuffled = [scored[2], scored[0], scored[3], scored[1]];
    const result = sortCatalogResults(shuffled);

    expect(result.map((r) => r.id)).toEqual(['x', 'a', 'b', 'z']);
  });

  it('is red if the id tie-break in sortCatalogResults is removed', () => {
    const scored = [
      { id: 'b', name: 'Same Name', score: 1 },
      { id: 'a', name: 'Same Name', score: 1 },
    ];

    // Simulates the id-tie-break being a no-op: sorting by score+name alone leaves equal-score,
    // equal-name entries in their original relative order (Array.prototype.sort is stable), so
    // feeding the same two shuffled input orders through a no-tie-break sort would produce two
    // different outputs — this is exactly the case sortCatalogResults's id tie-break prevents.
    const first = sortCatalogResults(scored);
    const second = sortCatalogResults([scored[1], scored[0]]);

    expect(first.map((r) => r.id)).toEqual(second.map((r) => r.id));
    expect(first.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('deriveFacets', () => {
  it('omits a dimension entirely when no exercise in the catalog carries a value for it', () => {
    const noMovementPatterns = EXERCISES.map((exercise) => ({ ...exercise, movementPattern: null }));
    const facets = deriveFacets(noMovementPatterns, MAPPINGS);
    expect(facets.movementPatterns).toEqual([]);
    expect(facets.muscleGroupIds.length).toBeGreaterThan(0);
    expect(facets.equipment.length).toBeGreaterThan(0);
  });

  it('returns only the distinct values actually present in the catalog', () => {
    const facets = deriveFacets(EXERCISES, MAPPINGS);
    expect(facets.muscleGroupIds.sort()).toEqual(['chest', 'lats', 'quads', 'triceps'].sort());
    expect(facets.equipment.sort()).toEqual(['barbell', 'cable'].sort());
    expect(facets.movementPatterns.sort()).toEqual(['horizontal_pull', 'horizontal_push', 'squat'].sort());
  });
});
