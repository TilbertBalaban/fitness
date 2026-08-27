import { resolveInventory, type EquipmentProfileLike } from '../inventory';

function baseProfile(overrides: Partial<EquipmentProfileLike> = {}): EquipmentProfileLike {
  return {
    nativeUnit: 'kg',
    barbellWeightKg: '20.000',
    plates: [
      { weightKg: '5.000', pairCount: 2 },
      { weightKg: '20.000', pairCount: 3 },
      { weightKg: '10.000', pairCount: 2 },
    ],
    dumbbells: [{ weightKg: '10.000' }, { weightKg: '2.500' }],
    machines: [
      {
        id: 'm-1',
        name: 'Leg Press',
        equipmentType: 'machine',
        available: true,
        stackMinKg: '10.000',
        stackMaxKg: '100.000',
        stackIncrementKg: '5.000',
        baseResistanceKg: null,
      },
      {
        id: 'm-2',
        name: 'Broken Cable',
        equipmentType: 'cable',
        available: false,
        stackMinKg: null,
        stackMaxKg: null,
        stackIncrementKg: null,
        baseResistanceKg: null,
      },
    ],
    ...overrides,
  };
}

describe('resolveInventory', () => {
  it('returns plates sorted descending', () => {
    const resolved = resolveInventory(baseProfile());
    expect(resolved.plates.map((p) => p.weightKg)).toEqual(['20.000', '10.000', '5.000']);
  });

  it('returns dumbbells sorted ascending', () => {
    const resolved = resolveInventory(baseProfile());
    expect(resolved.dumbbells.map((d) => d.weightKg)).toEqual(['2.500', '10.000']);
  });

  it('drops machine entries whose available is false', () => {
    const resolved = resolveInventory(baseProfile());
    expect(resolved.machines).toHaveLength(1);
    expect(resolved.machines[0].id).toBe('m-1');
  });

  it('does not mutate or reorder the input profile arrays', () => {
    const profile = baseProfile();
    const originalPlateOrder = profile.plates.map((p) => p.weightKg);
    const originalDumbbellOrder = profile.dumbbells.map((d) => d.weightKg);

    resolveInventory(profile);

    expect(profile.plates.map((p) => p.weightKg)).toEqual(originalPlateOrder);
    expect(profile.dumbbells.map((d) => d.weightKg)).toEqual(originalDumbbellOrder);
  });

  it('subtracts a machine unavailable ref', () => {
    const resolved = resolveInventory(baseProfile(), [{ kind: 'machine', machineId: 'm-1' }]);
    expect(resolved.machines).toHaveLength(0);
  });

  it('subtracts a dumbbell unavailable ref by weight', () => {
    const resolved = resolveInventory(baseProfile(), [{ kind: 'dumbbell', weightKg: '2.500' }]);
    expect(resolved.dumbbells.map((d) => d.weightKg)).toEqual(['10.000']);
  });

  it('collects equipment_type unavailable refs into unavailableEquipmentTypes', () => {
    const resolved = resolveInventory(baseProfile(), [{ kind: 'equipment_type', equipmentType: 'cable' }]);
    expect(resolved.unavailableEquipmentTypes).toEqual(['cable']);
  });

  it('two runs over the same inputs return equal results', () => {
    const profile = baseProfile();
    const first = resolveInventory(profile);
    const second = resolveInventory(profile);
    expect(first).toEqual(second);
  });
});
