import { resolveInventory, type EquipmentProfileLike } from '@fitness/plate-math';
import { EPLEY_REPS_PER_LOAD_UNIT, UNACHIEVABLE_ROUNDING_DIRECTION, idealNextLoadKg, snapToAchievable } from '../snap';

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

describe('UNACHIEVABLE_ROUNDING_DIRECTION', () => {
  it('is down', () => {
    expect(UNACHIEVABLE_ROUNDING_DIRECTION).toBe('down');
  });
});

describe('EPLEY_REPS_PER_LOAD_UNIT', () => {
  it('is 30', () => {
    expect(EPLEY_REPS_PER_LOAD_UNIT).toBe(30);
  });
});

describe('idealNextLoadKg', () => {
  it('raises the load proportionally to surplus reps at the Epley slope', () => {
    expect(idealNextLoadKg('100.000', 30)).toBe('200.000');
  });

  it('returns the same load unchanged for zero surplus', () => {
    expect(idealNextLoadKg('100.000', 0)).toBe('100.000');
  });
});

describe('snapToAchievable', () => {
  it('with a barbell inventory and an ideal weight between two loadable totals, returns the lower', () => {
    const inventory = inventoryFrom({ plates: [{ weightKg: '10.000', pairCount: 1 }] });
    expect(snapToAchievable({ targetKg: '38.000', equipmentType: 'barbell', inventory })).toBe('20.000');
  });

  it('returns null when nothing loadable exists at or below the ideal weight', () => {
    const inventory = inventoryFrom({ plates: [{ weightKg: '10.000', pairCount: 1 }] });
    expect(snapToAchievable({ targetKg: '5.000', equipmentType: 'barbell', inventory })).toBeNull();
  });

  it('returns the ideal weight unchanged when the equipment type has no achievable set', () => {
    const inventory = inventoryFrom({ plates: [{ weightKg: '10.000', pairCount: 1 }] });
    expect(snapToAchievable({ targetKg: '55.000', equipmentType: 'machine', inventory })).toBe('55.000');
  });

  it('returns the ideal weight unchanged when the inventory is null', () => {
    expect(snapToAchievable({ targetKg: '55.000', equipmentType: 'barbell', inventory: null })).toBe('55.000');
  });
});
