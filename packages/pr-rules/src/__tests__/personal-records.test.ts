import { WARMUP_SET_TYPE, WORKING_SET_TYPE } from '@fitness/api-contracts';
import { detectPrs, emptyPriorBest, foldPriorBest, CandidateSet, PriorBest } from '../personal-records';

function candidate(overrides: Partial<CandidateSet> = {}): CandidateSet {
  return {
    weightKg: 100,
    reps: 5,
    setType: WORKING_SET_TYPE,
    completed: true,
    ...overrides,
  };
}

describe('detectPrs', () => {
  it('produces three PRs (not best_e1rm) for a first-ever set past the e1RM cutoff', () => {
    const prior = emptyPriorBest();
    const result = detectPrs(candidate({ weightKg: 100, reps: 20 }), prior);

    expect(result.map((pr) => pr.prType).sort()).toEqual(
      ['best_set_volume', 'heaviest_weight', 'most_reps_at_weight'].sort()
    );
  });

  it('produces all four PRs for a first-ever set inside the e1RM cutoff', () => {
    const prior = emptyPriorBest();
    const result = detectPrs(candidate({ weightKg: 100, reps: 5 }), prior);

    expect(result.map((pr) => pr.prType)).toEqual([
      'heaviest_weight',
      'best_e1rm',
      'most_reps_at_weight',
      'best_set_volume',
    ]);
  });

  it('produces no PRs when the candidate exactly ties every prior best', () => {
    const prior: PriorBest = {
      heaviestWeight: 100,
      bestE1rm: 100 * (1 + 5 / 30),
      mostRepsAtWeight: new Map([[100, 5]]),
      bestSetVolume: 500,
    };
    const result = detectPrs(candidate({ weightKg: 100, reps: 5 }), prior);

    expect(result).toEqual([]);
  });

  it('produces exactly one PR for a strict improvement on heaviest_weight only', () => {
    const prior: PriorBest = {
      heaviestWeight: 90,
      bestE1rm: 100 * (1 + 5 / 30),
      mostRepsAtWeight: new Map([[100, 5]]),
      bestSetVolume: 500,
    };
    const result = detectPrs(candidate({ weightKg: 100, reps: 5 }), prior);

    expect(result).toEqual([{ prType: 'heaviest_weight', value: 100 }]);
  });

  it('produces exactly one PR for a strict improvement on best_e1rm only', () => {
    const prior: PriorBest = {
      heaviestWeight: 100,
      bestE1rm: 0,
      mostRepsAtWeight: new Map([[100, 5]]),
      bestSetVolume: 500,
    };
    const result = detectPrs(candidate({ weightKg: 100, reps: 5 }), prior);

    expect(result).toEqual([{ prType: 'best_e1rm', value: 100 * (1 + 5 / 30) }]);
  });

  it('produces exactly one PR for a strict improvement on most_reps_at_weight only', () => {
    const prior: PriorBest = {
      heaviestWeight: 100,
      bestE1rm: 100 * (1 + 5 / 30),
      mostRepsAtWeight: new Map([[100, 3]]),
      bestSetVolume: 500,
    };
    const result = detectPrs(candidate({ weightKg: 100, reps: 5 }), prior);

    expect(result).toEqual([{ prType: 'most_reps_at_weight', value: 5 }]);
  });

  it('produces exactly one PR for a strict improvement on best_set_volume only', () => {
    const prior: PriorBest = {
      heaviestWeight: 100,
      bestE1rm: 100 * (1 + 5 / 30),
      mostRepsAtWeight: new Map([[100, 5]]),
      bestSetVolume: 100,
    };
    const result = detectPrs(candidate({ weightKg: 100, reps: 5 }), prior);

    expect(result).toEqual([{ prType: 'best_set_volume', value: 500 }]);
  });

  it('produces no PRs for a warm-up-typed candidate regardless of weight', () => {
    const prior = emptyPriorBest();
    const result = detectPrs(candidate({ weightKg: 500, reps: 1, setType: WARMUP_SET_TYPE }), prior);

    expect(result).toEqual([]);
  });

  it('produces no PRs for a completed partial candidate, even one heavier than every prior set (D-18)', () => {
    const prior: PriorBest = {
      heaviestWeight: 100,
      bestE1rm: 100 * (1 + 5 / 30),
      mostRepsAtWeight: new Map([[100, 5]]),
      bestSetVolume: 500,
    };
    const result = detectPrs(candidate({ weightKg: 500, reps: 1, setType: 'partial' }), prior);

    expect(result).toEqual([]);
  });

  it.each(['drop', 'myorep', 'failure', 'amrap'])(
    'remains fully PR-eligible for a completed %s-typed first-ever set (D-18)',
    (setType) => {
      const prior = emptyPriorBest();
      const result = detectPrs(candidate({ weightKg: 100, reps: 5, setType }), prior);

      expect(result.map((pr) => pr.prType)).toEqual([
        'heaviest_weight',
        'best_e1rm',
        'most_reps_at_weight',
        'best_set_volume',
      ]);
    },
  );

  it('a heavier partial does not consume the heaviest-weight record — a subsequent full set at that weight still yields heaviest_weight (D-18)', () => {
    const prior: PriorBest = {
      heaviestWeight: 90,
      bestE1rm: null,
      mostRepsAtWeight: new Map([[90, 5]]),
      bestSetVolume: null,
    };

    const partialResult = detectPrs(candidate({ weightKg: 500, reps: 1, setType: 'partial' }), prior);
    expect(partialResult).toEqual([]);

    const foldedAfterPartial = foldPriorBest([
      candidate({ weightKg: 90, reps: 5, completed: true }),
      candidate({ weightKg: 500, reps: 1, completed: true, setType: 'partial' }),
    ]);
    expect(foldedAfterPartial.heaviestWeight).toBe(90);

    const fullSetResult = detectPrs(candidate({ weightKg: 100, reps: 5 }), foldedAfterPartial);
    expect(fullSetResult.find((pr) => pr.prType === 'heaviest_weight')).toEqual({ prType: 'heaviest_weight', value: 100 });
  });

  it('produces no PRs for an uncompleted candidate', () => {
    const prior = emptyPriorBest();
    const result = detectPrs(candidate({ completed: false }), prior);

    expect(result).toEqual([]);
  });

  it('produces no PRs for a null-weight candidate', () => {
    const prior = emptyPriorBest();
    const result = detectPrs(candidate({ weightKg: null }), prior);

    expect(result).toEqual([]);
  });

  it('does not count 100kg x 8 as a rep PR against a prior 90kg x 12', () => {
    const prior: PriorBest = {
      heaviestWeight: 90,
      bestE1rm: null,
      mostRepsAtWeight: new Map([[90, 12]]),
      bestSetVolume: null,
    };
    const result = detectPrs(candidate({ weightKg: 100, reps: 8 }), prior);

    expect(result.find((pr) => pr.prType === 'most_reps_at_weight')).toBeUndefined();
  });

  it('counts 100kg x 8 as a rep PR when the prior best at exactly 100kg is 7', () => {
    const prior: PriorBest = {
      heaviestWeight: 100,
      bestE1rm: null,
      mostRepsAtWeight: new Map([[100, 7]]),
      bestSetVolume: null,
    };
    const result = detectPrs(candidate({ weightKg: 100, reps: 8 }), prior);

    expect(result.find((pr) => pr.prType === 'most_reps_at_weight')).toEqual({
      prType: 'most_reps_at_weight',
      value: 8,
    });
  });

  it('produces PR output in declaration order when all four fire', () => {
    const prior = emptyPriorBest();
    const result = detectPrs(candidate({ weightKg: 100, reps: 5 }), prior);

    expect(result.map((pr) => pr.prType)).toEqual([
      'heaviest_weight',
      'best_e1rm',
      'most_reps_at_weight',
      'best_set_volume',
    ]);
  });
});

describe('foldPriorBest', () => {
  it('ignores warm-up and uncompleted rows', () => {
    const result = foldPriorBest([
      candidate({ weightKg: 200, reps: 1, setType: WARMUP_SET_TYPE }),
      candidate({ weightKg: 150, reps: 1, completed: false }),
      candidate({ weightKg: 100, reps: 5, completed: true, setType: WORKING_SET_TYPE }),
    ]);

    expect(result.heaviestWeight).toBe(100);
    expect(result.mostRepsAtWeight.get(100)).toBe(5);
  });

  it('returns the empty prior best for an empty history', () => {
    const result = foldPriorBest([]);

    expect(result).toEqual(emptyPriorBest());
  });

  it('skips a completed partial set with a real weight — it contributes to no prior-best field (D-18)', () => {
    const result = foldPriorBest([candidate({ weightKg: 500, reps: 1, completed: true, setType: 'partial' })]);

    expect(result).toEqual(emptyPriorBest());
  });

  it.each(['drop', 'myorep', 'failure', 'amrap'])('folds a completed %s-typed set into prior best (D-18)', (setType) => {
    const result = foldPriorBest([candidate({ weightKg: 100, reps: 5, completed: true, setType })]);

    expect(result.heaviestWeight).toBe(100);
    expect(result.mostRepsAtWeight.get(100)).toBe(5);
  });
});
