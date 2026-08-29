import type { ResolvedInventory } from '../inventory';
import { canEquip } from '../equippable';

function inventory(overrides: Partial<ResolvedInventory> = {}): ResolvedInventory {
  return {
    nativeUnit: 'kg',
    barbellWeightKg: null,
    plates: [],
    dumbbells: [],
    machines: [],
    unavailableEquipmentTypes: [],
    ...overrides,
  };
}

describe('canEquip', () => {
  it('rejects a type the session or profile has marked unavailable, regardless of what else is present', () => {
    const inv = inventory({ barbellWeightKg: '20', unavailableEquipmentTypes: ['barbell'] });
    expect(canEquip('barbell', inv)).toBe(false);
  });

  it('rejects barbell when no barbell weight is set', () => {
    expect(canEquip('barbell', inventory({ barbellWeightKg: null }))).toBe(false);
  });

  it('accepts barbell when a barbell weight is set', () => {
    expect(canEquip('barbell', inventory({ barbellWeightKg: '20' }))).toBe(true);
  });

  it('rejects ez_bar when no barbell weight is set', () => {
    expect(canEquip('ez_bar', inventory({ barbellWeightKg: null }))).toBe(false);
  });

  it('accepts ez_bar when a barbell weight is set', () => {
    expect(canEquip('ez_bar', inventory({ barbellWeightKg: '10' }))).toBe(true);
  });

  it('rejects dumbbell against an empty rack', () => {
    expect(canEquip('dumbbell', inventory({ dumbbells: [] }))).toBe(false);
  });

  it('accepts dumbbell against a non-empty rack', () => {
    expect(canEquip('dumbbell', inventory({ dumbbells: [{ weightKg: '10' }] }))).toBe(true);
  });

  it('rejects machine when no machine of that equipment type is present', () => {
    const inv = inventory({
      machines: [
        { id: 'm1', name: 'Cable Row', equipmentType: 'cable', available: true, stackMinKg: null, stackMaxKg: null, stackIncrementKg: null, baseResistanceKg: null },
      ],
    });
    expect(canEquip('machine', inv)).toBe(false);
  });

  it('accepts machine when a machine of that equipment type is present', () => {
    const inv = inventory({
      machines: [
        { id: 'm1', name: 'Leg Press', equipmentType: 'machine', available: true, stackMinKg: null, stackMaxKg: null, stackIncrementKg: null, baseResistanceKg: null },
      ],
    });
    expect(canEquip('machine', inv)).toBe(true);
  });

  it('accepts cable when a cable machine is present', () => {
    const inv = inventory({
      machines: [
        { id: 'm1', name: 'Cable Row', equipmentType: 'cable', available: true, stackMinKg: null, stackMaxKg: null, stackIncrementKg: null, baseResistanceKg: null },
      ],
    });
    expect(canEquip('cable', inv)).toBe(true);
  });

  // canEquip itself has no special case for a non-modelled type — it falls through to the
  // machine-list check like any other non-barbell/dumbbell type. The "always equippable" rule for
  // NON_MODEL_EQUIPMENT_TYPES (Pattern 2) lives in the CALLER (candidate-pool.ts's exclusion of
  // these types from ever reaching canEquip), not in this function.
  it('falls through to the machine-list check for a non-modelled type, which an empty inventory fails', () => {
    expect(canEquip('bodyweight', inventory())).toBe(false);
  });
});
