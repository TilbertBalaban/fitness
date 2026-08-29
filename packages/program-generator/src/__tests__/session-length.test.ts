import type { GeneratedSlot } from '../result';
import { estimateSlotMinutes, trimToSessionLength } from '../session-length';

function slot(key: string, targetSets: number, targetRestSeconds: number): GeneratedSlot {
  return {
    key,
    exerciseId: key,
    orderIndex: 0,
    base: { targetSets, targetRepMin: 8, targetRepMax: 12, targetRir: 2, targetRestSeconds },
    overridesByCycleKey: {},
  };
}

describe('estimateSlotMinutes', () => {
  it('computes (sets * (workSeconds + restSeconds)) / 60', () => {
    expect(estimateSlotMinutes(4, 120)).toBe((4 * (45 + 120)) / 60);
  });
});

describe('trimToSessionLength', () => {
  it('returns the same slot list and reports nothing trimmed when the day already fits', () => {
    const slots = [slot('a', 3, 90)];
    const result = trimToSessionLength(slots, 60);

    expect(result.slots).toHaveLength(1);
    expect(result.removedCount).toBe(0);
    expect(result.overBudgetMinutes).toBe(0);
  });

  it('removes whole slots from the end until the day fits, never lowering a surviving slot targetSets', () => {
    const slots = [slot('a', 4, 120), slot('b', 4, 120), slot('c', 4, 120), slot('d', 4, 120)];
    const originalSets = slots.map((s) => s.base.targetSets);

    const result = trimToSessionLength(slots, 20);

    expect(result.slots.length).toBeLessThan(slots.length);
    expect(result.removedCount).toBeGreaterThan(0);
    result.slots.forEach((survivor, index) => {
      expect(survivor.base.targetSets).toBe(originalSets[index]);
    });
  });

  it('never returns an empty list for a non-empty input, reporting the shortfall instead', () => {
    const slots = [slot('only', 10, 300)];

    const result = trimToSessionLength(slots, 1);

    expect(result.slots).toHaveLength(1);
    expect(result.overBudgetMinutes).toBeGreaterThan(0);
  });

  it('does not mutate or reorder its input array', () => {
    const slots = [slot('a', 4, 120), slot('b', 4, 120), slot('c', 4, 120)];
    const snapshot = [...slots];

    trimToSessionLength(slots, 5);

    expect(slots).toEqual(snapshot);
  });
});
