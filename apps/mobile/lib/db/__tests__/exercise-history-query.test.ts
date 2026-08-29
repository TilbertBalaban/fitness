import { exerciseHistoryFilters, loadExerciseHistory } from '../exercise-history-query';
import { getPowerSync } from '../powersync';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));

type Row = Record<string, unknown>;

// Returns each queued result set in turn and counts the selects issued, so "two queries regardless
// of how many sessions match" is asserted against the real call sequence rather than assumed. The
// WHERE clauses themselves are proven against a real database by the durability spec.
function fakeDb(results: Row[][]) {
  let selectCount = 0;
  const conditions: unknown[] = [];

  const resultFor = () => results[selectCount - 1] ?? [];

  const db = {
    select: () => {
      selectCount++;
      const terminal = () => {
        const pending = Promise.resolve(resultFor());
        return Object.assign(pending, {
          where: (condition: unknown) => {
            conditions.push(condition);
            return Object.assign(Promise.resolve(resultFor()), { orderBy: () => Promise.resolve(resultFor()) });
          },
          orderBy: () => Promise.resolve(resultFor()),
          innerJoin: () => terminal(),
        });
      };
      return { from: () => terminal() };
    },
  } as unknown as ReturnType<typeof getPowerSync>;

  return { db, getSelectCount: () => selectCount, conditions };
}

const SESSION_ROWS: Row[] = [
  { sessionExerciseId: 'se-2', sessionId: 'sess-2', localDate: '2026-08-20' },
  { sessionExerciseId: 'se-1', sessionId: 'sess-1', localDate: '2026-08-10' },
];

const SET_ROWS: Row[] = [
  { id: 'ls-1', sessionExerciseId: 'se-1', setType: 'normal', weightKg: '100.000', reps: 5, completed: true, parentSetId: null },
  { id: 'ls-2', sessionExerciseId: 'se-1', setType: 'warmup', weightKg: '60.000', reps: 10, completed: true, parentSetId: null },
  { id: 'ls-3', sessionExerciseId: 'se-2', setType: 'normal', weightKg: '105.000', reps: 5, completed: true, parentSetId: null },
];

beforeEach(() => {
  (getPowerSync as jest.MockedFunction<typeof getPowerSync>).mockReset();
});

describe('loadExerciseHistory', () => {
  it('returns an empty array when nobody is signed in, without reading anything', async () => {
    const { db, getSelectCount } = fakeDb([SESSION_ROWS, SET_ROWS]);

    await expect(loadExerciseHistory({ exerciseId: 'ex-1', userId: null }, db)).resolves.toEqual([]);
    expect(getSelectCount()).toBe(0);
  });

  it('returns sessions oldest first with their sets attached', async () => {
    const { db } = fakeDb([SESSION_ROWS, SET_ROWS]);

    const sessions = await loadExerciseHistory({ exerciseId: 'ex-1', userId: 'user-1' }, db);

    expect(sessions.map((session) => session.localDate)).toEqual(['2026-08-10', '2026-08-20']);
    expect(sessions[0].sets.map((set) => set.id)).toEqual(['ls-1', 'ls-2']);
    expect(sessions[1].sets.map((set) => set.id)).toEqual(['ls-3']);
    expect(sessions[0].sets[0]).toEqual({
      id: 'ls-1',
      setType: 'normal',
      weightKg: '100.000',
      reps: 5,
      completed: true,
      parentSetId: null,
    });
  });

  it('uses exactly two queries however many sessions match', async () => {
    const manySessions = Array.from({ length: 40 }, (_, index) => ({
      sessionExerciseId: `se-${index}`,
      sessionId: `sess-${index}`,
      localDate: `2026-07-${String((index % 28) + 1).padStart(2, '0')}`,
    }));
    const { db, getSelectCount } = fakeDb([manySessions, []]);

    const sessions = await loadExerciseHistory({ exerciseId: 'ex-1', userId: 'user-1' }, db);

    expect(sessions).toHaveLength(40);
    expect(getSelectCount()).toBe(2);
  });

  it('issues no second query when no session matched', async () => {
    const { db, getSelectCount } = fakeDb([[], SET_ROWS]);

    await expect(loadExerciseHistory({ exerciseId: 'ex-1', userId: 'user-1' }, db)).resolves.toEqual([]);
    expect(getSelectCount()).toBe(1);
  });

  it('merges two session_exercise rows for the same exercise in one session into a single entry', async () => {
    const duplicated: Row[] = [
      { sessionExerciseId: 'se-a', sessionId: 'sess-1', localDate: '2026-08-10' },
      { sessionExerciseId: 'se-b', sessionId: 'sess-1', localDate: '2026-08-10' },
    ];
    const sets: Row[] = [
      { id: 'ls-a', sessionExerciseId: 'se-a', setType: 'normal', weightKg: '100.000', reps: 5, completed: true, parentSetId: null },
      { id: 'ls-b', sessionExerciseId: 'se-b', setType: 'normal', weightKg: '90.000', reps: 8, completed: true, parentSetId: null },
    ];
    const { db } = fakeDb([duplicated, sets]);

    const sessions = await loadExerciseHistory({ exerciseId: 'ex-1', userId: 'user-1' }, db);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].sets.map((set) => set.id)).toEqual(['ls-a', 'ls-b']);
  });

  it('still reads in two queries when the range is unbounded', async () => {
    const { db, getSelectCount } = fakeDb([SESSION_ROWS, SET_ROWS]);

    const sessions = await loadExerciseHistory({ exerciseId: 'ex-1', userId: 'user-1', sinceLocalDate: null }, db);

    expect(sessions).toHaveLength(2);
    expect(getSelectCount()).toBe(2);
  });
});

describe('exerciseHistoryFilters', () => {
  it('emits no date predicate at all for the unbounded all-time range', () => {
    // Two predicates, not three: the all-time case must not fall back to a very large sentinel
    // date, which would be a silently wrong answer on an account older than the sentinel (T-9-31).
    expect(exerciseHistoryFilters('ex-1', null)).toHaveLength(2);
    expect(exerciseHistoryFilters('ex-1', undefined)).toHaveLength(2);
  });

  it('adds exactly one date predicate for a bounded range', () => {
    expect(exerciseHistoryFilters('ex-1', '2026-06-01')).toHaveLength(3);
  });
});
