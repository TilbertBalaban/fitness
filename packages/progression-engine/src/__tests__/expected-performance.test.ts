import { expectedPerformance, repRangeMidpoint } from '../expected-performance';

describe('repRangeMidpoint', () => {
  it('returns 8 for an odd-width range (7-9)', () => {
    expect(repRangeMidpoint(7, 9)).toBe(8);
  });

  it('returns 8 for an even-width range (6-9), the tie-break case', () => {
    expect(repRangeMidpoint(6, 9)).toBe(8);
  });

  it('returns the single value for a zero-width range', () => {
    expect(repRangeMidpoint(5, 5)).toBe(5);
  });
});

describe('expectedPerformance', () => {
  it('matches the one publicly documented worked example', () => {
    expect(expectedPerformance({ targetRepMin: 7, targetRepMax: 9, targetRir: 2 })).toBe(10);
  });

  it('returns null when targetRepMin is missing', () => {
    expect(expectedPerformance({ targetRepMin: null, targetRepMax: 9, targetRir: 2 })).toBeNull();
  });

  it('returns null when targetRepMax is missing', () => {
    expect(expectedPerformance({ targetRepMin: 7, targetRepMax: null, targetRir: 2 })).toBeNull();
  });

  it('returns null when targetRir is missing', () => {
    expect(expectedPerformance({ targetRepMin: 7, targetRepMax: 9, targetRir: null })).toBeNull();
  });

  it('returns null when targetRepMin exceeds targetRepMax', () => {
    expect(expectedPerformance({ targetRepMin: 10, targetRepMax: 9, targetRir: 2 })).toBeNull();
  });

  it('returns null for a negative field', () => {
    expect(expectedPerformance({ targetRepMin: 7, targetRepMax: 9, targetRir: -1 })).toBeNull();
  });

  it('returns null for a non-finite field', () => {
    expect(expectedPerformance({ targetRepMin: 7, targetRepMax: Infinity, targetRir: 2 })).toBeNull();
  });
});
