import { RIR_TOLERANCE_BAND, achievedPerformanceFor, classifyPerformance } from '../rir-band';

describe('classifyPerformance', () => {
  it('classifies an exact match as within the band', () => {
    expect(classifyPerformance(10, 10)).toBe('within_band');
  });

  it('classifies a performance one above expected as within the band', () => {
    expect(classifyPerformance(10 + RIR_TOLERANCE_BAND, 10)).toBe('within_band');
  });

  it('classifies a performance two above expected as a surplus', () => {
    expect(classifyPerformance(10 + RIR_TOLERANCE_BAND + 1, 10)).toBe('surplus');
  });

  it('classifies a performance one below expected as within the band', () => {
    expect(classifyPerformance(10 - RIR_TOLERANCE_BAND, 10)).toBe('within_band');
  });

  it('classifies a performance two below expected as a shortfall', () => {
    expect(classifyPerformance(10 - RIR_TOLERANCE_BAND - 1, 10)).toBe('shortfall');
  });
});

describe('achievedPerformanceFor', () => {
  it('adds reps and reps-in-reserve together', () => {
    expect(achievedPerformanceFor({ reps: 8, rir: 2 })).toBe(10);
  });

  it('treats a null reps-in-reserve as zero rather than discarding the set', () => {
    expect(achievedPerformanceFor({ reps: 8, rir: null })).toBe(8);
  });
});
