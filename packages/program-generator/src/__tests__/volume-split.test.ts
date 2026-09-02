import { distributeSets, exerciseCountForSessionSets, splitSessionSets } from '../volume-split';

describe('distributeSets', () => {
  it('splits as evenly as possible, front-loading the remainder', () => {
    expect(distributeSets(9, 2)).toEqual([5, 4]);
    expect(distributeSets(4, 4)).toEqual([1, 1, 1, 1]);
  });

  it('floors every entry at 1 even when the total is smaller than the exercise count', () => {
    expect(distributeSets(1, 2)).toEqual([1, 1]);
  });
});

describe('exerciseCountForSessionSets', () => {
  it('is the ceiling of sessionSets over the per-exercise cap, floored at 1', () => {
    expect(exerciseCountForSessionSets(10)).toBe(2);
    expect(exerciseCountForSessionSets(1)).toBe(1);
    expect(exerciseCountForSessionSets(0)).toBe(1);
  });
});

describe('splitSessionSets', () => {
  it('matches the worked examples exactly', () => {
    expect(splitSessionSets(10)).toEqual([5, 5]);
    expect(splitSessionSets(8)).toEqual([4, 4]);
    expect(splitSessionSets(7)).toEqual([4, 3]);
    expect(splitSessionSets(18)).toEqual([5, 5, 4, 4]);
    expect(splitSessionSets(3)).toEqual([3]);
  });

  it('caps every entry at 5, keeps entries non-increasing, and sums to n for every n from 1 to 30', () => {
    for (let n = 1; n <= 30; n += 1) {
      const entries = splitSessionSets(n);

      for (const entry of entries) {
        expect(entry).toBeLessThanOrEqual(5);
      }

      for (let i = 1; i < entries.length; i += 1) {
        expect(entries[i]!).toBeLessThanOrEqual(entries[i - 1]!);
      }

      if (n >= exerciseCountForSessionSets(n)) {
        expect(entries.reduce((sum, entry) => sum + entry, 0)).toBe(n);
      }
    }
  });
});
