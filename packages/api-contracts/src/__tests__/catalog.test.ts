import {
  isCatalogSnapshot,
  LOAD_TYPES,
  MOVEMENT_PATTERNS,
  MUSCLE_GROUP_BODY_REGION,
  MUSCLE_GROUPS,
} from '../catalog';

describe('LOAD_TYPES', () => {
  it('contains exactly the six EXER-08 values in the documented order', () => {
    expect(LOAD_TYPES).toEqual([
      'external_weight',
      'bodyweight',
      'bodyweight_plus_added',
      'assisted',
      'time_based',
      'distance_based',
    ]);
  });
});

describe('MUSCLE_GROUPS / MUSCLE_GROUP_BODY_REGION', () => {
  it('MUSCLE_GROUPS contains exactly 19 ids', () => {
    expect(MUSCLE_GROUPS.length).toBe(19);
  });

  it('every MUSCLE_GROUPS id has an entry in MUSCLE_GROUP_BODY_REGION and no extras exist', () => {
    const bodyRegionKeys = Object.keys(MUSCLE_GROUP_BODY_REGION).sort();
    const muscleGroupIds = [...MUSCLE_GROUPS].sort();
    expect(bodyRegionKeys).toEqual(muscleGroupIds);
  });
});

describe('MOVEMENT_PATTERNS', () => {
  it('contains exactly the nine ARCHITECTURE.md §1 values', () => {
    expect(MOVEMENT_PATTERNS.length).toBe(9);
  });
});

describe('isCatalogSnapshot', () => {
  const validSnapshot = {
    catalog_version: 'v1',
    generated_at: '2026-01-01T00:00:00.000Z',
    muscle_groups: [],
    exercises: [],
    mappings: [],
  };

  it('accepts a well-formed empty snapshot', () => {
    expect(isCatalogSnapshot(validSnapshot)).toBe(true);
  });

  it('rejects null', () => {
    expect(isCatalogSnapshot(null)).toBe(false);
  });

  it('rejects an empty object', () => {
    expect(isCatalogSnapshot({})).toBe(false);
  });

  it('rejects a snapshot missing the mappings array', () => {
    const { mappings: _mappings, ...withoutMappings } = validSnapshot;
    expect(isCatalogSnapshot(withoutMappings)).toBe(false);
  });

  it('rejects an empty catalog_version', () => {
    expect(isCatalogSnapshot({ ...validSnapshot, catalog_version: '' })).toBe(false);
  });

  it('rejects an exercise whose load_type is not a member of LOAD_TYPES', () => {
    const snapshot = {
      ...validSnapshot,
      exercises: [{ id: 'ex-1', load_type: 'bogus' }],
    };
    expect(isCatalogSnapshot(snapshot)).toBe(false);
  });

  it('accepts every exercise whose load_type is a member of LOAD_TYPES', () => {
    const snapshot = {
      ...validSnapshot,
      exercises: LOAD_TYPES.map((loadType, index) => ({ id: `ex-${index}`, load_type: loadType })),
    };
    expect(isCatalogSnapshot(snapshot)).toBe(true);
  });
});
