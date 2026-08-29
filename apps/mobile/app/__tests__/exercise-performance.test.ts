// The shipped exercise-detail-screen.test.ts convention: both module chains reach ESM dists Jest
// cannot parse (@powersync/shared-internals, better-auth/react), so both are mocked before the
// screen module is imported. WINDOWS #22/#33.
jest.mock('../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../lib/auth-client', () => ({ authClient: { useSession: jest.fn(() => ({ data: null })) } }));

import { deriveExercisePerformanceState } from '../exercise-performance';

describe('deriveExercisePerformanceState', () => {
  it('returns error when the read failed, whatever else landed', () => {
    expect(
      deriveExercisePerformanceState({ failed: true, sessions: null, metric: 'heaviest', pointCount: 0, droppedAboveCapCount: 0 }),
    ).toBe('error');
    expect(
      deriveExercisePerformanceState({ failed: true, sessions: [], metric: 'e1rm', pointCount: 5, droppedAboveCapCount: 3 }),
    ).toBe('error');
  });

  it('returns loading while the read has not landed', () => {
    expect(
      deriveExercisePerformanceState({ failed: false, sessions: null, metric: 'heaviest', pointCount: 0, droppedAboveCapCount: 0 }),
    ).toBe('loading');
  });

  it('returns no-history when the read landed with no sessions at all', () => {
    expect(
      deriveExercisePerformanceState({ failed: false, sessions: [], metric: 'heaviest', pointCount: 0, droppedAboveCapCount: 0 }),
    ).toBe('no-history');
  });

  it('returns e1rm-above-cap when the estimate metric kept no point and dropped every session', () => {
    expect(
      deriveExercisePerformanceState({ failed: false, sessions: ['sess-1'], metric: 'e1rm', pointCount: 0, droppedAboveCapCount: 2 }),
    ).toBe('e1rm-above-cap');
  });

  it('does not claim the rep cap for another metric that simply has no points', () => {
    expect(
      deriveExercisePerformanceState({ failed: false, sessions: ['sess-1'], metric: 'heaviest', pointCount: 0, droppedAboveCapCount: 0 }),
    ).toBe('no-history');
  });

  it('returns ready when the estimate metric kept at least one point despite dropping others', () => {
    expect(
      deriveExercisePerformanceState({ failed: false, sessions: ['sess-1'], metric: 'e1rm', pointCount: 1, droppedAboveCapCount: 2 }),
    ).toBe('ready');
  });

  it('returns ready for a populated series', () => {
    expect(
      deriveExercisePerformanceState({ failed: false, sessions: ['sess-1'], metric: 'volume', pointCount: 3, droppedAboveCapCount: 0 }),
    ).toBe('ready');
  });
});
