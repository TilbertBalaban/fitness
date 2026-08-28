import { beatsPriorRepsAtSameLoad, isFailurePerformance, sameLoad } from '../failure-progression';
import type { NormalizedPerformance } from '../result';

function performance(overrides: Partial<NormalizedPerformance> = {}): NormalizedPerformance {
  return {
    sessionId: 'sess-1',
    weightKg: '100.000',
    reps: 8,
    rir: 2,
    setType: 'normal',
    ...overrides,
  };
}

describe('sameLoad', () => {
  it('treats two identical canonical-kg strings as the same load', () => {
    expect(sameLoad('100.000', '100.000')).toBe(true);
  });

  it('treats two spellings of the same stored weight at a different scale as the same load', () => {
    expect(sameLoad('100.000', '100.0')).toBe(true);
  });

  it('treats a one-thousandth-kg difference as a different load', () => {
    expect(sameLoad('100.000', '100.001')).toBe(false);
  });

  it('treats two bodyweight (null) sets as the same load', () => {
    expect(sameLoad(null, null)).toBe(true);
  });

  it('never treats a bodyweight set as the same load as a weighted one', () => {
    expect(sameLoad(null, '100.000')).toBe(false);
  });
});

describe('isFailurePerformance', () => {
  it('is true for a performance logged at zero reps in reserve', () => {
    expect(isFailurePerformance(performance({ rir: 0, setType: 'normal' }))).toBe(true);
  });

  it('is true for a performance typed as a failure set', () => {
    expect(isFailurePerformance(performance({ rir: 2, setType: 'failure' }))).toBe(true);
  });

  it('is true for a performance typed as amrap even with no logged rir', () => {
    expect(isFailurePerformance(performance({ rir: null, setType: 'amrap' }))).toBe(true);
  });

  it('is false for a set logged at one or more reps in reserve and not failure-typed', () => {
    expect(isFailurePerformance(performance({ rir: 1, setType: 'normal' }))).toBe(false);
  });
});

describe('beatsPriorRepsAtSameLoad', () => {
  it('is true when the most recent failure performance beats the prior one at an equal load', () => {
    const history = [
      performance({ sessionId: 'sess-recent', rir: 0, reps: 11, weightKg: '100.000' }),
      performance({ sessionId: 'sess-older', rir: 0, reps: 10, weightKg: '100.000' }),
    ];
    expect(beatsPriorRepsAtSameLoad(history)).toBe(true);
  });

  it('is false when the two failure performances tie on reps', () => {
    const history = [
      performance({ sessionId: 'sess-recent', rir: 0, reps: 10, weightKg: '100.000' }),
      performance({ sessionId: 'sess-older', rir: 0, reps: 10, weightKg: '100.000' }),
    ];
    expect(beatsPriorRepsAtSameLoad(history)).toBe(false);
  });

  it('is false when the two failure performances differ in load, even if reps increased', () => {
    const history = [
      performance({ sessionId: 'sess-recent', rir: 0, reps: 11, weightKg: '105.000' }),
      performance({ sessionId: 'sess-older', rir: 0, reps: 10, weightKg: '100.000' }),
    ];
    expect(beatsPriorRepsAtSameLoad(history)).toBe(false);
  });

  it('is false when there is only one failure performance in history', () => {
    const history = [
      performance({ sessionId: 'sess-recent', rir: 0, reps: 11, weightKg: '100.000' }),
      performance({ sessionId: 'sess-older', rir: 2, reps: 8, weightKg: '95.000' }),
    ];
    expect(beatsPriorRepsAtSameLoad(history)).toBe(false);
  });

  it('skips non-failure performances between the two most recent failure sets', () => {
    const history = [
      performance({ sessionId: 'sess-recent', rir: 0, reps: 11, weightKg: '100.000' }),
      performance({ sessionId: 'sess-middle', rir: 2, reps: 9, weightKg: '100.000' }),
      performance({ sessionId: 'sess-older', rir: 0, reps: 10, weightKg: '100.000' }),
    ];
    expect(beatsPriorRepsAtSameLoad(history)).toBe(true);
  });

  it('compares the weight exactly as logged, regardless of what the current gym could produce', () => {
    // 97.5 kg is deliberately a plate-unfriendly increment — beatsPriorRepsAtSameLoad takes no
    // inventory argument at all (D-14 made structural), so it cannot know or care whether this
    // load is achievable today; it only compares the two stored strings.
    const history = [
      performance({ sessionId: 'sess-recent', rir: 0, reps: 6, weightKg: '97.500' }),
      performance({ sessionId: 'sess-older', rir: 0, reps: 5, weightKg: '97.500' }),
    ];
    expect(beatsPriorRepsAtSameLoad(history)).toBe(true);
  });
});
