import { resolveInventory, type EquipmentProfileLike } from '@fitness/plate-math';
import type { ExpectedPerformancePrescription } from '../expected-performance';
import type { NormalizedPerformance } from '../result';
import { countConsecutiveShortfalls, offeredReductionFor, SHORTFALL_STREAK_FOR_REDUCTION_OFFER } from '../shortfall';

const PRESCRIPTION: ExpectedPerformancePrescription = { targetRepMin: 7, targetRepMax: 9, targetRir: 2 };

function performance(overrides: Partial<NormalizedPerformance> = {}): NormalizedPerformance {
  return {
    sessionId: 's',
    weightKg: '100.000',
    reps: 8,
    rir: 2,
    setType: 'normal',
    ...overrides,
  };
}

// achieved 7, expected 10 (midpoint 8 + targetRir 2): well outside RIR_TOLERANCE_BAND, a shortfall.
const SHORTFALL_PERFORMANCE = performance({ reps: 6, rir: 1 });
// achieved 15, expected 10: well outside the band on the other side, a surplus.
const SURPLUS_PERFORMANCE = performance({ reps: 12, rir: 3 });

describe('countConsecutiveShortfalls', () => {
  it('counts the unbroken run of shortfalls at the head of the history', () => {
    const history = [SHORTFALL_PERFORMANCE, SHORTFALL_PERFORMANCE, SURPLUS_PERFORMANCE];
    expect(countConsecutiveShortfalls(history, PRESCRIPTION)).toBe(2);
  });

  it('resets the streak to zero when a non-shortfall performance sits anywhere in the recent run', () => {
    const history = [SURPLUS_PERFORMANCE, SHORTFALL_PERFORMANCE, SHORTFALL_PERFORMANCE, SHORTFALL_PERFORMANCE];
    expect(countConsecutiveShortfalls(history, PRESCRIPTION)).toBe(0);
  });

  it('produces identical output for histories that differ only in how much real time separated the logged sessions (PRGR-08: recency is sessions, never elapsed time)', () => {
    const sixWeekGapHistory: NormalizedPerformance[] = [SHORTFALL_PERFORMANCE, SHORTFALL_PERFORMANCE, SHORTFALL_PERFORMANCE];
    const noGapHistory: NormalizedPerformance[] = [SHORTFALL_PERFORMANCE, SHORTFALL_PERFORMANCE, SHORTFALL_PERFORMANCE];

    expect(countConsecutiveShortfalls(sixWeekGapHistory, PRESCRIPTION)).toBe(
      countConsecutiveShortfalls(noGapHistory, PRESCRIPTION),
    );
    expect(countConsecutiveShortfalls(sixWeekGapHistory, PRESCRIPTION)).toBe(3);
  });

  it('returns zero when the prescription itself has no expected performance', () => {
    const history = [SHORTFALL_PERFORMANCE, SHORTFALL_PERFORMANCE, SHORTFALL_PERFORMANCE];
    expect(countConsecutiveShortfalls(history, { targetRepMin: null, targetRepMax: 9, targetRir: 2 })).toBe(0);
  });
});

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

describe('offeredReductionFor', () => {
  it('returns null below the threshold', () => {
    const result = offeredReductionFor({
      streak: SHORTFALL_STREAK_FOR_REDUCTION_OFFER - 1,
      weightKg: '100.000',
      reps: 7,
      equipmentType: 'barbell',
      inventory: inventoryFrom({ plates: [{ weightKg: '10.000', pairCount: 5 }] }),
    });
    expect(result).toBeNull();
  });

  it('returns an offer at the threshold, snapped to the next achievable weight below the held weight', () => {
    const result = offeredReductionFor({
      streak: SHORTFALL_STREAK_FOR_REDUCTION_OFFER,
      weightKg: '100.000',
      reps: 7,
      equipmentType: 'barbell',
      inventory: inventoryFrom({ plates: [{ weightKg: '10.000', pairCount: 5 }] }),
    });
    expect(result).toEqual({ weightKg: '80.000', reps: 7 });
  });

  it('returns an offer above the threshold too', () => {
    const result = offeredReductionFor({
      streak: SHORTFALL_STREAK_FOR_REDUCTION_OFFER + 2,
      weightKg: '100.000',
      reps: 7,
      equipmentType: 'barbell',
      inventory: inventoryFrom({ plates: [{ weightKg: '10.000', pairCount: 5 }] }),
    });
    expect(result).toEqual({ weightKg: '80.000', reps: 7 });
  });

  it('returns null for a bodyweight movement with no load axis to reduce', () => {
    const result = offeredReductionFor({
      streak: SHORTFALL_STREAK_FOR_REDUCTION_OFFER,
      weightKg: null,
      reps: 7,
      equipmentType: 'bodyweight',
      inventory: null,
    });
    expect(result).toBeNull();
  });

  it('returns null when no achievable weight exists below the held weight', () => {
    const result = offeredReductionFor({
      streak: SHORTFALL_STREAK_FOR_REDUCTION_OFFER,
      weightKg: '20.000',
      reps: 7,
      equipmentType: 'barbell',
      inventory: inventoryFrom({ plates: [{ weightKg: '10.000', pairCount: 5 }] }),
    });
    expect(result).toBeNull();
  });
});
