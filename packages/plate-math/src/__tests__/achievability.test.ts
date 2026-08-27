import { resolveInventory, type EquipmentProfileLike } from '../inventory';
import {
  achievableBarbellLoads,
  achievableDumbbellLoads,
  achievableMachineLoads,
  isAchievable,
  nearestLoadable,
  roundToAchievable,
} from '../achievability';

function inventoryFrom(overrides: Partial<EquipmentProfileLike> = {}) {
  return resolveInventory({
    nativeUnit: 'kg',
    barbellWeightKg: '20.000',
    plates: [],
    dumbbells: [],
    machines: [],
    ...overrides,
  });
}

describe('achievableBarbellLoads', () => {
  it('returns every distinct total reachable by any subset of one pair each of 20/10/2.5, ascending', () => {
    const inventory = inventoryFrom({
      plates: [
        { weightKg: '20.000', pairCount: 1 },
        { weightKg: '10.000', pairCount: 1 },
        { weightKg: '2.500', pairCount: 1 },
      ],
    });

    expect(achievableBarbellLoads(inventory)).toEqual([
      '20.000',
      '25.000',
      '40.000',
      '45.000',
      '60.000',
      '65.000',
      '80.000',
      '85.000',
    ]);
  });

  it('a one-pair inventory yields exactly the bar weight and the bar plus one pair', () => {
    const inventory = inventoryFrom({ plates: [{ weightKg: '20.000', pairCount: 1 }] });
    expect(achievableBarbellLoads(inventory)).toEqual(['20.000', '60.000']);
  });

  it('a no-pairs inventory yields exactly the bar weight alone', () => {
    const inventory = inventoryFrom({ plates: [] });
    expect(achievableBarbellLoads(inventory)).toEqual(['20.000']);
  });

  it('a profile with no barbellWeightKg has no achievable barbell loads', () => {
    const inventory = inventoryFrom({ barbellWeightKg: null, plates: [{ weightKg: '20.000', pairCount: 1 }] });
    expect(achievableBarbellLoads(inventory)).toEqual([]);
  });
});

describe('achievableDumbbellLoads', () => {
  it('returns the recorded dumbbell weights, ascending and deduplicated', () => {
    const inventory = inventoryFrom({
      dumbbells: [{ weightKg: '10.000' }, { weightKg: '2.500' }, { weightKg: '10.000' }],
    });
    expect(achievableDumbbellLoads(inventory)).toEqual(['2.500', '10.000']);
  });

  it('an empty dumbbell list yields an empty set rather than throwing', () => {
    expect(achievableDumbbellLoads(inventoryFrom({ dumbbells: [] }))).toEqual([]);
  });
});

describe('achievableMachineLoads', () => {
  const baseMachine = {
    id: 'm-1',
    name: 'Leg Press',
    equipmentType: 'machine' as const,
    available: true,
    baseResistanceKg: null,
  };

  it('steps inclusively from stackMinKg to stackMaxKg by stackIncrementKg', () => {
    const machine = { ...baseMachine, stackMinKg: '10.000', stackMaxKg: '50.000', stackIncrementKg: '5.000' };
    expect(achievableMachineLoads(machine)).toEqual([
      '10.000',
      '15.000',
      '20.000',
      '25.000',
      '30.000',
      '35.000',
      '40.000',
      '45.000',
      '50.000',
    ]);
  });

  it('offsets every step by baseResistanceKg when configured', () => {
    const machine = {
      ...baseMachine,
      stackMinKg: '10.000',
      stackMaxKg: '20.000',
      stackIncrementKg: '5.000',
      baseResistanceKg: '2.000',
    };
    expect(achievableMachineLoads(machine)).toEqual(['12.000', '17.000', '22.000']);
  });

  it('a machine with no increment yields just its endpoints', () => {
    const machine = { ...baseMachine, stackMinKg: '10.000', stackMaxKg: '50.000', stackIncrementKg: null };
    expect(achievableMachineLoads(machine)).toEqual(['10.000', '50.000']);
  });

  it('a machine whose minimum equals its maximum accepts exactly that one value', () => {
    const machine = { ...baseMachine, stackMinKg: '25.000', stackMaxKg: '25.000', stackIncrementKg: '5.000' };
    expect(achievableMachineLoads(machine)).toEqual(['25.000']);
  });

  it('a machine with no range at all yields an empty set', () => {
    const machine = { ...baseMachine, stackMinKg: null, stackMaxKg: null, stackIncrementKg: null };
    expect(achievableMachineLoads(machine)).toEqual([]);
  });

  it('a zero or negative increment yields the endpoints only, never an unbounded loop', () => {
    const machine = { ...baseMachine, stackMinKg: '10.000', stackMaxKg: '50.000', stackIncrementKg: '0.000' };
    expect(achievableMachineLoads(machine)).toEqual(['10.000', '50.000']);
  });
});

describe('roundToAchievable', () => {
  const loads = ['100.000', '105.000'];

  it('resolves a halfway target DOWN to the lower achievable load', () => {
    expect(roundToAchievable('102.500', loads, 'nearest')).toBe('100.000');
  });

  it('down never returns a value above the target', () => {
    expect(roundToAchievable('103.000', loads, 'down')).toBe('100.000');
  });

  it('up never returns a value below the target', () => {
    expect(roundToAchievable('103.000', loads, 'up')).toBe('105.000');
  });

  it('a target below the lowest achievable load returns the lowest for up and nearest', () => {
    expect(roundToAchievable('50.000', loads, 'up')).toBe('100.000');
    expect(roundToAchievable('50.000', loads, 'nearest')).toBe('100.000');
  });

  it('a target below the lowest achievable load returns null for down', () => {
    expect(roundToAchievable('50.000', loads, 'down')).toBeNull();
  });

  it('an inventory with no achievable loads returns null for every direction, never the raw target', () => {
    expect(roundToAchievable('50.000', [], 'nearest')).toBeNull();
    expect(roundToAchievable('50.000', [], 'down')).toBeNull();
    expect(roundToAchievable('50.000', [], 'up')).toBeNull();
  });

  it('has no default direction — omitting it is a type error, not a silent nearest', () => {
    // @ts-expect-error direction is required, never defaulted (D-10)
    roundToAchievable('100.000', loads);
  });
});

describe('nearestLoadable', () => {
  const loads = ['100.000', '105.000'];

  it('names both neighbours for a target between two achievable loads', () => {
    expect(nearestLoadable('102.500', loads)).toEqual({ lower: '100.000', higher: '105.000' });
  });

  it('has a null lower side when no achievable load exists below the target', () => {
    expect(nearestLoadable('50.000', loads)).toEqual({ lower: null, higher: '100.000' });
  });

  it('has a null higher side when no achievable load exists above the target', () => {
    expect(nearestLoadable('110.000', loads)).toEqual({ lower: '105.000', higher: null });
  });

  it('both sides are null against an empty achievable set', () => {
    expect(nearestLoadable('50.000', [])).toEqual({ lower: null, higher: null });
  });
});

describe('isAchievable', () => {
  it('is true for a load present in the set and false otherwise', () => {
    expect(isAchievable('100.000', ['100.000', '105.000'])).toBe(true);
    expect(isAchievable('102.500', ['100.000', '105.000'])).toBe(false);
  });
});
