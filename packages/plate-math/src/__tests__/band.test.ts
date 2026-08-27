import { resolveInventory, type EquipmentProfileLike } from '../inventory';
import { hasResolvableEquipment, resolveEquipmentBand } from '../band';
import type { UnavailableEquipmentRef } from '@fitness/api-contracts';

function inventoryFrom(overrides: Partial<EquipmentProfileLike> = {}, unavailable: UnavailableEquipmentRef[] = []) {
  return resolveInventory(
    {
      nativeUnit: 'kg',
      barbellWeightKg: '20.000',
      plates: [
        { weightKg: '20.000', pairCount: 3 },
        { weightKg: '10.000', pairCount: 3 },
        { weightKg: '5.000', pairCount: 2 },
        { weightKg: '2.500', pairCount: 2 },
      ],
      dumbbells: [{ weightKg: '10.000' }, { weightKg: '15.000' }],
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
          name: 'Cable Row',
          equipmentType: 'cable',
          available: true,
          stackMinKg: '5.000',
          stackMaxKg: '50.000',
          stackIncrementKg: '2.500',
          baseResistanceKg: '1.000',
        },
      ],
      ...overrides,
    },
    unavailable,
  );
}

describe('resolveEquipmentBand — barbell and ez_bar', () => {
  it('barbell with a loadable target resolves to a plates state carrying the bar and per-side stack', () => {
    const state = resolveEquipmentBand({ equipmentType: 'barbell', targetKg: '80.000', inventory: inventoryFrom() });
    expect(state).toEqual({ kind: 'plates', barKg: '20.000', perSidePlatesKg: ['20.000', '10.000'] });
  });

  it('ez_bar shares the same barbellWeightKg/plates resolution as barbell', () => {
    const state = resolveEquipmentBand({ equipmentType: 'ez_bar', targetKg: '80.000', inventory: inventoryFrom() });
    expect(state).toEqual({ kind: 'plates', barKg: '20.000', perSidePlatesKg: ['20.000', '10.000'] });
  });

  it('a barbell target against a zero-plate inventory above the bar weight resolves to no_plates', () => {
    const state = resolveEquipmentBand({
      equipmentType: 'barbell',
      targetKg: '60.000',
      inventory: inventoryFrom({ plates: [] }),
    });
    expect(state).toEqual({ kind: 'no_plates' });
  });

  it('with no target yet entered, barbell resolves to the bar alone rather than flickering to collapsed', () => {
    const state = resolveEquipmentBand({ equipmentType: 'barbell', targetKg: null, inventory: inventoryFrom() });
    expect(state).toEqual({ kind: 'plates', barKg: '20.000', perSidePlatesKg: [] });
  });

  it('an empty-string target is treated the same as no target yet', () => {
    const state = resolveEquipmentBand({ equipmentType: 'barbell', targetKg: '', inventory: inventoryFrom() });
    expect(state).toEqual({ kind: 'plates', barKg: '20.000', perSidePlatesKg: [] });
  });
});

describe('resolveEquipmentBand — dumbbell', () => {
  it('a target matching an available dumbbell weight resolves to a pair state', () => {
    const state = resolveEquipmentBand({ equipmentType: 'dumbbell', targetKg: '10.000', inventory: inventoryFrom() });
    expect(state).toEqual({ kind: 'pair', weightKg: '10.000' });
  });

  it('a target matching no available dumbbell weight resolves to not_loadable with neighbours', () => {
    const state = resolveEquipmentBand({ equipmentType: 'dumbbell', targetKg: '12.000', inventory: inventoryFrom() });
    expect(state).toEqual({ kind: 'not_loadable', lowerKg: '10.000', higherKg: '15.000' });
  });

  it('with no target yet entered, dumbbell resolves to not_loadable rather than a fabricated pair', () => {
    const state = resolveEquipmentBand({ equipmentType: 'dumbbell', targetKg: null, inventory: inventoryFrom() });
    expect(state).toEqual({ kind: 'not_loadable', lowerKg: null, higherKg: '10.000' });
  });

  it('an empty dumbbell list resolves to a defined not_loadable state rather than throwing', () => {
    const state = resolveEquipmentBand({
      equipmentType: 'dumbbell',
      targetKg: '10.000',
      inventory: inventoryFrom({ dumbbells: [] }),
    });
    expect(state).toEqual({ kind: 'not_loadable', lowerKg: null, higherKg: null });
  });
});

describe('resolveEquipmentBand — machine and cable', () => {
  it('machine target inside the stack range and on the increment resolves to a stack state', () => {
    const state = resolveEquipmentBand({ equipmentType: 'machine', targetKg: '55.000', inventory: inventoryFrom() });
    expect(state).toEqual({ kind: 'stack', minKg: '10.000', maxKg: '100.000', incrementKg: '5.000', baseResistanceKg: null });
  });

  it('machine target off the increment resolves to not_loadable with the nearest achievable neighbours', () => {
    const state = resolveEquipmentBand({ equipmentType: 'machine', targetKg: '52.000', inventory: inventoryFrom() });
    expect(state).toEqual({ kind: 'not_loadable', lowerKg: '50.000', higherKg: '55.000' });
  });

  it('cable target inside range, on increment and offset by base resistance resolves to a stack state', () => {
    const state = resolveEquipmentBand({ equipmentType: 'cable', targetKg: '11.000', inventory: inventoryFrom() });
    expect(state).toEqual({ kind: 'stack', minKg: '5.000', maxKg: '50.000', incrementKg: '2.500', baseResistanceKg: '1.000' });
  });

  it('cable target off the increment resolves to not_loadable with base-resistance-offset neighbours', () => {
    const state = resolveEquipmentBand({ equipmentType: 'cable', targetKg: '11.500', inventory: inventoryFrom() });
    expect(state).toEqual({ kind: 'not_loadable', lowerKg: '11.000', higherKg: '13.500' });
  });

  it('with no target yet entered, the stack range still shows rather than withholding until a number is typed', () => {
    const state = resolveEquipmentBand({ equipmentType: 'machine', targetKg: null, inventory: inventoryFrom() });
    expect(state).toEqual({ kind: 'stack', minKg: '10.000', maxKg: '100.000', incrementKg: '5.000', baseResistanceKg: null });
  });

  it('no matching machine for the equipment type resolves to a defined not_loadable state', () => {
    const state = resolveEquipmentBand({
      equipmentType: 'machine',
      targetKg: '50.000',
      inventory: inventoryFrom({ machines: [] }),
    });
    expect(state).toEqual({ kind: 'not_loadable', lowerKg: null, higherKg: null });
  });

  it('a machine whose stack fields are all null resolves to a defined not_loadable state', () => {
    const state = resolveEquipmentBand({
      equipmentType: 'machine',
      targetKg: '50.000',
      inventory: inventoryFrom({
        machines: [
          {
            id: 'm-3',
            name: 'Unset Machine',
            equipmentType: 'machine',
            available: true,
            stackMinKg: null,
            stackMaxKg: null,
            stackIncrementKg: null,
            baseResistanceKg: null,
          },
        ],
      }),
    });
    expect(state).toEqual({ kind: 'not_loadable', lowerKg: null, higherKg: null });
  });

  it('when several machines match the equipment type, the first in name-then-id order is selected (GYM-03 ordering)', () => {
    const inventory = inventoryFrom({
      machines: [
        {
          id: 'z-1',
          name: 'Zeta Press',
          equipmentType: 'machine',
          available: true,
          stackMinKg: '20.000',
          stackMaxKg: '200.000',
          stackIncrementKg: '10.000',
          baseResistanceKg: null,
        },
        {
          id: 'a-1',
          name: 'Alpha Press',
          equipmentType: 'machine',
          available: true,
          stackMinKg: '5.000',
          stackMaxKg: '50.000',
          stackIncrementKg: '2.500',
          baseResistanceKg: null,
        },
      ],
    });

    const first = resolveEquipmentBand({ equipmentType: 'machine', targetKg: null, inventory });
    const second = resolveEquipmentBand({ equipmentType: 'machine', targetKg: null, inventory });

    expect(first).toEqual({ kind: 'stack', minKg: '5.000', maxKg: '50.000', incrementKg: '2.500', baseResistanceKg: null });
    expect(second).toEqual(first);
  });
});

describe('resolveEquipmentBand — collapsed equipment types', () => {
  const collapsedTypes = [
    'kettlebell',
    'bodyweight',
    'band',
    'medicine_ball',
    'exercise_ball',
    'foam_roller',
    'other',
  ] as const;

  it.each(collapsedTypes)('%s collapses the band', (equipmentType) => {
    const state = resolveEquipmentBand({ equipmentType, targetKg: '50.000', inventory: inventoryFrom() });
    expect(state).toEqual({ kind: 'collapsed' });
  });

  it('a null equipment type collapses the band', () => {
    const state = resolveEquipmentBand({ equipmentType: null, targetKg: '50.000', inventory: inventoryFrom() });
    expect(state).toEqual({ kind: 'collapsed' });
  });

  it('a null inventory collapses the band', () => {
    const state = resolveEquipmentBand({ equipmentType: 'barbell', targetKg: '50.000', inventory: null });
    expect(state).toEqual({ kind: 'collapsed' });
  });

  it('an equipment type in unavailableEquipmentTypes collapses the band even when otherwise supported', () => {
    const inventory = inventoryFrom({}, [{ kind: 'equipment_type', equipmentType: 'barbell' }]);
    const state = resolveEquipmentBand({ equipmentType: 'barbell', targetKg: '80.000', inventory });
    expect(state).toEqual({ kind: 'collapsed' });
  });
});

describe('hasResolvableEquipment', () => {
  it('is false for exactly the collapsed state', () => {
    expect(hasResolvableEquipment({ kind: 'collapsed' })).toBe(false);
  });

  it('is true for every other kind', () => {
    expect(hasResolvableEquipment({ kind: 'plates', barKg: '20.000', perSidePlatesKg: [] })).toBe(true);
    expect(hasResolvableEquipment({ kind: 'pair', weightKg: '10.000' })).toBe(true);
    expect(
      hasResolvableEquipment({ kind: 'stack', minKg: '10.000', maxKg: '100.000', incrementKg: '5.000', baseResistanceKg: null }),
    ).toBe(true);
    expect(hasResolvableEquipment({ kind: 'not_loadable', lowerKg: null, higherKg: null })).toBe(true);
    expect(hasResolvableEquipment({ kind: 'no_plates' })).toBe(true);
  });
});
