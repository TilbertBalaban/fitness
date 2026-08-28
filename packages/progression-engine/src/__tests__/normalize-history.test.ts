import { normalizeHistory } from '../normalize-history';
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
});
