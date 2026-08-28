import { foldPerSidePair, normalizeHistory, PER_SIDE_STRATEGY } from '../normalize-history';
import type { ExerciseSessionSets, LoggedSetInput } from '../result';

function set(overrides: Partial<LoggedSetInput> = {}): LoggedSetInput {
  return {
    id: 's1',
    parentSetId: null,
    setType: 'normal',
    weightKg: '100.000',
    reps: 8,
    rir: 2,
    side: null,
    completed: true,
    ...overrides,
  };
}

function session(sessionId: string, sets: LoggedSetInput[]): ExerciseSessionSets {
  return { sessionId, sets };
}

describe('normalizeHistory', () => {
  it('returns only the working row when a session has a warm-up row and one working row', () => {
    const result = normalizeHistory([
      session('sess-1', [
        set({ id: 'a', setType: 'warmup', weightKg: '40.000', reps: 10 }),
        set({ id: 'b', setType: 'normal', weightKg: '100.000', reps: 8 }),
      ]),
    ]);
    expect(result).toEqual([{ sessionId: 'sess-1', weightKg: '100.000', reps: 8, rir: 2, setType: 'normal' }]);
  });

  it('returns only the parent row for a drop-set group', () => {
    const result = normalizeHistory([
      session('sess-1', [
        set({ id: 'parent', parentSetId: null, weightKg: '100.000', reps: 8 }),
        set({ id: 'child-1', parentSetId: 'parent', setType: 'drop', weightKg: '80.000', reps: 6 }),
        set({ id: 'child-2', parentSetId: 'parent', setType: 'drop', weightKg: '60.000', reps: 6 }),
      ]),
    ]);
    expect(result).toEqual([{ sessionId: 'sess-1', weightKg: '100.000', reps: 8, rir: 2, setType: 'normal' }]);
  });

  it('skips incomplete rows and returns nothing for a session with no completed working row', () => {
    const result = normalizeHistory([
      session('sess-1', [
        set({ id: 'a', completed: false }),
        set({ id: 'b', setType: 'warmup' }),
      ]),
    ]);
    expect(result).toEqual([]);
  });

  it('preserves input session order across multiple sessions', () => {
    const result = normalizeHistory([
      session('sess-recent', [set({ id: 'a', weightKg: '105.000' })]),
      session('sess-older', [set({ id: 'b', weightKg: '100.000' })]),
    ]);
    expect(result.map((r) => r.sessionId)).toEqual(['sess-recent', 'sess-older']);
  });

  it('breaks a weight tie on the higher rep count', () => {
    const result = normalizeHistory([
      session('sess-1', [
        set({ id: 'a', weightKg: '100.000', reps: 6 }),
        set({ id: 'b', weightKg: '100.000', reps: 8 }),
      ]),
    ]);
    expect(result[0]).toMatchObject({ reps: 8 });
  });

  it('breaks a remaining weight-and-rep tie on the lower id', () => {
    const result = normalizeHistory([
      session('sess-1', [
        set({ id: 'z', weightKg: '100.000', reps: 8 }),
        set({ id: 'a', weightKg: '100.000', reps: 8 }),
      ]),
    ]);
    expect(result[0]).toMatchObject({ reps: 8, weightKg: '100.000' });
  });

  it('picks the heaviest working row over a lighter one', () => {
    const result = normalizeHistory([
      session('sess-1', [
        set({ id: 'a', weightKg: '90.000', reps: 10 }),
        set({ id: 'b', weightKg: '100.000', reps: 6 }),
      ]),
    ]);
    expect(result[0]).toMatchObject({ weightKg: '100.000' });
  });

  it('folds a completed left-right per-side pair to one performance from the lower rep count when weights are equal', () => {
    const result = normalizeHistory([
      session('sess-1', [
        set({ id: 'left', side: 'left', weightKg: '100.000', reps: 8, rir: 2 }),
        set({ id: 'right', parentSetId: 'left', side: 'right', weightKg: '100.000', reps: 6, rir: 2 }),
      ]),
    ]);
    expect(result).toEqual([{ sessionId: 'sess-1', weightKg: '100.000', reps: 6, rir: 2, setType: 'normal' }]);
  });

  it('returns the lighter side and that side own reps when a per-side pair logged different weights', () => {
    const result = normalizeHistory([
      session('sess-1', [
        set({ id: 'left', side: 'left', weightKg: '100.000', reps: 8, rir: 2 }),
        set({ id: 'right', parentSetId: 'left', side: 'right', weightKg: '90.000', reps: 10, rir: 1 }),
      ]),
    ]);
    expect(result).toEqual([{ sessionId: 'sess-1', weightKg: '90.000', reps: 10, rir: 1, setType: 'normal' }]);
  });

  it('yields the left parent alone when its right-side child has not been logged yet', () => {
    const result = normalizeHistory([
      session('sess-1', [set({ id: 'left', side: 'left', weightKg: '100.000', reps: 8, rir: 2 })]),
    ]);
    expect(result).toEqual([{ sessionId: 'sess-1', weightKg: '100.000', reps: 8, rir: 2, setType: 'normal' }]);
  });

  it('does not apply the per-side fold to a drop group whose parent has no side', () => {
    const result = normalizeHistory([
      session('sess-1', [
        set({ id: 'parent', parentSetId: null, side: null, weightKg: '100.000', reps: 8 }),
        set({ id: 'child-1', parentSetId: 'parent', side: null, setType: 'drop', weightKg: '80.000', reps: 6 }),
      ]),
    ]);
    expect(result).toEqual([{ sessionId: 'sess-1', weightKg: '100.000', reps: 8, rir: 2, setType: 'normal' }]);
  });

  it('produces identical output whether or not a superset grouping is present on the session, since supersets are invisible to a per-exercise fold', () => {
    const rows = [set({ id: 'a', weightKg: '100.000', reps: 8 })];
    const withoutSuperset = normalizeHistory([session('sess-1', rows)]);
    const withSuperset = normalizeHistory([
      { ...session('sess-1', rows), supersetGroupId: 'grp-1' } as ExerciseSessionSets,
    ]);
    expect(withSuperset).toEqual(withoutSuperset);
  });

  describe('foldPerSidePair', () => {
    it('returns the lower rep count when both sides logged the same weight', () => {
      const left = set({ id: 'left', side: 'left', weightKg: '100.000', reps: 9 });
      const right = set({ id: 'right', side: 'right', parentSetId: 'left', weightKg: '100.000', reps: 7 });
      expect(foldPerSidePair(left, right)).toBe(right);
    });

    it('PER_SIDE_STRATEGY selects the weaker side by default, and the fold flips coherently under the other value', () => {
      const left = set({ id: 'left', side: 'left', weightKg: '100.000', reps: 8 });
      const right = set({ id: 'right', side: 'right', parentSetId: 'left', weightKg: '90.000', reps: 8 });

      expect(PER_SIDE_STRATEGY).toBe('weaker');
      expect(foldPerSidePair(left, right)).toBe(right);
      expect(foldPerSidePair(left, right, 'stronger')).toBe(left);
    });
  });
});
