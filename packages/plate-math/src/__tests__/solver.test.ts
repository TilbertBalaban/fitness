import { resolveInventory, type EquipmentProfileLike } from '../inventory';
import { solvePlateBreakdown } from '../solver';

function inventoryFrom(overrides: Partial<EquipmentProfileLike> = {}) {
  return resolveInventory({
    nativeUnit: 'kg',
    barbellWeightKg: '20.000',
    plates: [
      { weightKg: '20.000', pairCount: 3 },
      { weightKg: '10.000', pairCount: 3 },
      { weightKg: '5.000', pairCount: 2 },
      { weightKg: '2.500', pairCount: 2 },
    ],
    dumbbells: [],
    machines: [],
    ...overrides,
  });
}

describe('solvePlateBreakdown', () => {
  it('returns an exact multi-denomination breakdown, largest first', () => {
    // 40kg per side with only one 20kg pair and one 10kg pair available forces the 4-plate
    // [20, 10, 5, 5] stack — every shorter combination (2x20, 20+10+10) is count-bound out.
    const limitedInventory = inventoryFrom({ plates: [
      { weightKg: '20.000', pairCount: 1 },
      { weightKg: '10.000', pairCount: 1 },
      { weightKg: '5.000', pairCount: 2 },
      { weightKg: '2.500', pairCount: 2 },
    ] });
    const result = solvePlateBreakdown('100.000', limitedInventory);
    expect(result).toEqual({
      kind: 'loadable',
      barKg: '20.000',
      perSidePlatesKg: ['20.000', '10.000', '5.000', '5.000'],
    });
  });

  it('respects the recorded pairCount — a count-bound target is not loadable even though the denomination set could otherwise reach it', () => {
    const onePair = inventoryFrom({ plates: [{ weightKg: '20.000', pairCount: 1 }] });
    expect(solvePlateBreakdown('60.000', onePair)).toEqual({
      kind: 'loadable',
      barKg: '20.000',
      perSidePlatesKg: ['20.000'],
    });
    expect(solvePlateBreakdown('100.000', onePair)).toEqual({
      kind: 'not_loadable',
      lowerKg: '60.000',
      higherKg: null,
    });
  });

  it('a zero-plate inventory reports the bar weight itself as loadable with an empty stack', () => {
    const noPlates = inventoryFrom({ plates: [] });
    expect(solvePlateBreakdown('20.000', noPlates)).toEqual({
      kind: 'loadable',
      barKg: '20.000',
      perSidePlatesKg: [],
    });
  });

  it('a zero-plate inventory reports no_plates for anything heavier than the bar', () => {
    const noPlates = inventoryFrom({ plates: [] });
    expect(solvePlateBreakdown('60.000', noPlates)).toEqual({ kind: 'no_plates' });
  });

  it('a target below the bar weight is unsupported, never a negative per-side load', () => {
    expect(solvePlateBreakdown('10.000', inventoryFrom())).toEqual({ kind: 'unsupported' });
  });

  it('a profile with no barbellWeightKg is unsupported', () => {
    const noBar = inventoryFrom({ barbellWeightKg: null });
    expect(solvePlateBreakdown('100.000', noBar)).toEqual({ kind: 'unsupported' });
  });

  it('an ungapped target (odd milli-kg split) is not loadable, and names its nearest neighbours', () => {
    const oddGap = inventoryFrom({ barbellWeightKg: '20.001' });
    expect(solvePlateBreakdown('100.000', oddGap)).toEqual({
      kind: 'not_loadable',
      lowerKg: '95.001',
      higherKg: '100.001',
    });
  });

  it('returns the per-side stack in strictly descending order, stable across repeated calls', () => {
    const inventory = inventoryFrom();
    const first = solvePlateBreakdown('75.000', inventory);
    const second = solvePlateBreakdown('75.000', inventory);
    expect(first).toEqual(second);
    if (first.kind === 'loadable') {
      const values = first.perSidePlatesKg.map(Number);
      const sorted = [...values].sort((a, b) => b - a);
      expect(values).toEqual(sorted);
    } else {
      throw new Error('expected loadable result');
    }
  });

  it('minimizes plate count and, among ties, prefers the heavier leading plate', () => {
    // 30kg per side is achievable as [20, 10] (2 plates) or [10, 10, 5, 5] (4 plates) — the
    // 2-plate solution must win, and among equal-count alternatives the heavier plate leads.
    const result = solvePlateBreakdown('80.000', inventoryFrom());
    expect(result).toEqual({
      kind: 'loadable',
      barKg: '20.000',
      perSidePlatesKg: ['20.000', '10.000'],
    });
  });
});
