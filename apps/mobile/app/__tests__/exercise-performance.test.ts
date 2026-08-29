// The shipped exercise-detail-screen.test.ts convention: both module chains reach ESM dists Jest
// cannot parse (@powersync/shared-internals, better-auth/react), so both are mocked before the
// screen module is imported. WINDOWS #22/#33.
jest.mock('../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../lib/auth-client', () => ({ authClient: { useSession: jest.fn(() => ({ data: null })) } }));

import type { SeriesPoint } from '@fitness/analytics-engine';
import { bucketWeeklyBests, deriveExercisePerformanceState, resolveSeriesPoints } from '../exercise-performance';

const TODAY = '2026-08-29';

// trailingBuckets walks back in whole weeks from today, so with TODAY the last bucket is
// 2026-08-23..2026-08-29 and the one before it 2026-08-16..2026-08-22.
function point(localDate: string, value: number): SeriesPoint {
  return { key: `sess-${localDate}-${value}`, sessionId: `sess-${localDate}-${value}`, localDate, value };
}

describe('deriveExercisePerformanceState', () => {
  it('returns error when the read failed, whatever else landed', () => {
    expect(
      deriveExercisePerformanceState({ failed: true, sessions: null, metric: 'heaviest', pointCount: 0, droppedAboveCapCount: 0, hasHistoryOutsideRange: false }),
    ).toBe('error');
    expect(
      deriveExercisePerformanceState({ failed: true, sessions: [], metric: 'e1rm', pointCount: 5, droppedAboveCapCount: 3, hasHistoryOutsideRange: false }),
    ).toBe('error');
  });

  it('returns loading while the read has not landed', () => {
    expect(
      deriveExercisePerformanceState({ failed: false, sessions: null, metric: 'heaviest', pointCount: 0, droppedAboveCapCount: 0, hasHistoryOutsideRange: false }),
    ).toBe('loading');
  });

  it('returns no-history when the read landed with no sessions at all', () => {
    expect(
      deriveExercisePerformanceState({ failed: false, sessions: [], metric: 'heaviest', pointCount: 0, droppedAboveCapCount: 0, hasHistoryOutsideRange: false }),
    ).toBe('no-history');
  });

  it('returns e1rm-above-cap when the estimate metric kept no point and dropped every session', () => {
    expect(
      deriveExercisePerformanceState({ failed: false, sessions: ['sess-1'], metric: 'e1rm', pointCount: 0, droppedAboveCapCount: 2, hasHistoryOutsideRange: false }),
    ).toBe('e1rm-above-cap');
  });

  it('does not claim the rep cap for another metric that simply has no points', () => {
    expect(
      deriveExercisePerformanceState({ failed: false, sessions: ['sess-1'], metric: 'heaviest', pointCount: 0, droppedAboveCapCount: 0, hasHistoryOutsideRange: false }),
    ).toBe('no-history');
  });

  it('returns ready when the estimate metric kept at least one point despite dropping others', () => {
    expect(
      deriveExercisePerformanceState({ failed: false, sessions: ['sess-1'], metric: 'e1rm', pointCount: 1, droppedAboveCapCount: 2, hasHistoryOutsideRange: false }),
    ).toBe('ready');
  });

  it('returns ready for a populated series', () => {
    expect(
      deriveExercisePerformanceState({ failed: false, sessions: ['sess-1'], metric: 'volume', pointCount: 3, droppedAboveCapCount: 0, hasHistoryOutsideRange: false }),
    ).toBe('ready');
  });

  it('returns nothing-in-range when the range is empty but history exists outside it', () => {
    // The two empty states call for opposite actions — "log a set" versus "widen the range" — so
    // they may never collapse into one branch.
    expect(
      deriveExercisePerformanceState({ failed: false, sessions: [], metric: 'heaviest', pointCount: 0, droppedAboveCapCount: 0, hasHistoryOutsideRange: true }),
    ).toBe('nothing-in-range');
  });

  it('never claims a range is too narrow when there is no history anywhere', () => {
    expect(
      deriveExercisePerformanceState({ failed: false, sessions: [], metric: 'volume', pointCount: 0, droppedAboveCapCount: 0, hasHistoryOutsideRange: false }),
    ).toBe('no-history');
  });

  it('reports a failed read as an error even when history exists outside the range', () => {
    expect(
      deriveExercisePerformanceState({ failed: true, sessions: [], metric: 'heaviest', pointCount: 0, droppedAboveCapCount: 0, hasHistoryOutsideRange: true }),
    ).toBe('error');
  });
});

describe('bucketWeeklyBests', () => {
  it('keeps the BEST value in a bucket, never the mean of the sessions in it', () => {
    // The single most plausible wrong implementation. Every metric on this screen is a best-metric,
    // so 110 — the mean of a good session and a bad one — is a performance that never happened.
    const bucketed = bucketWeeklyBests([point('2026-08-24', 100), point('2026-08-27', 120)], TODAY, null);

    expect(bucketed).toHaveLength(1);
    expect(bucketed[0].value).toBe(120);
    expect(bucketed[0].value).not.toBe(110);
  });

  it('labels a bucketed point by its bucket start rather than the winning session date', () => {
    const bucketed = bucketWeeklyBests([point('2026-08-27', 120)], TODAY, null);

    expect(bucketed[0].localDate).toBe('2026-08-23');
    expect(bucketed[0].key).toBe('2026-08-23');
  });

  it('omits an untrained week entirely rather than plotting it at zero (D-09)', () => {
    const bucketed = bucketWeeklyBests([point('2026-08-10', 80), point('2026-08-24', 100)], TODAY, null);

    expect(bucketed.map((entry) => entry.value)).toEqual([80, 100]);
    expect(bucketed.map((entry) => entry.localDate)).toEqual(['2026-08-09', '2026-08-23']);
  });

  it('returns points oldest first however the input happened to be ordered', () => {
    const bucketed = bucketWeeklyBests([point('2026-08-24', 100), point('2026-08-10', 80)], TODAY, null);

    expect(bucketed.map((entry) => entry.localDate)).toEqual(['2026-08-09', '2026-08-23']);
  });

  it('reaches a point years back when the range is unbounded', () => {
    const bucketed = bucketWeeklyBests([point('2020-01-01', 60), point('2026-08-24', 100)], TODAY, null);

    expect(bucketed.map((entry) => entry.value)).toEqual([60, 100]);
  });

  it('drops a point older than a bounded range instead of folding it into the oldest bucket', () => {
    const bucketed = bucketWeeklyBests([point('2020-01-01', 60), point('2026-08-24', 100)], TODAY, 365);

    expect(bucketed.map((entry) => entry.value)).toEqual([100]);
  });

  it('returns nothing for an empty series rather than a fabricated bucket', () => {
    expect(bucketWeeklyBests([], TODAY, null)).toEqual([]);
  });
});

describe('resolveSeriesPoints', () => {
  const perSession = [point('2026-08-24', 100), point('2026-08-27', 120)];

  it('keeps one point per session on the shortest range', () => {
    expect(resolveSeriesPoints(perSession, '3m', TODAY)).toEqual(perSession);
  });

  it('collapses the same sessions into one weekly best on the year range', () => {
    const resolved = resolveSeriesPoints(perSession, '1y', TODAY);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].value).toBe(120);
  });

  it('collapses the same sessions into one weekly best on the all-time range', () => {
    const resolved = resolveSeriesPoints(perSession, 'all', TODAY);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].value).toBe(120);
  });
});
