import { historyTrendWindowStart, loadHistoryTrend } from '../history-trend-query';
import { getPowerSync } from '../powersync';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));

type Row = Record<string, unknown>;

// Returns each queued result set in turn and counts the selects issued, so "three queries however
// many sessions fall in the window" is asserted against the real call sequence rather than assumed.
// The WHERE clauses themselves are proven against a real database by the durability spec.
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

// Drizzle bakes a bound value into a Param chunk rather than into the SQL text, so the only way to
// prove the window boundary actually reached the query is to walk the condition tree for it.
function collectParamValues(node: unknown, out: unknown[] = []): unknown[] {
  if (node === null || typeof node !== 'object') return out;
  const record = node as Record<string, unknown>;
  if ('value' in record && 'encoder' in record) out.push(record.value);
  if (Array.isArray(node)) for (const item of node) collectParamValues(item, out);
  const chunks = record.queryChunks;
  if (Array.isArray(chunks)) for (const chunk of chunks) collectParamValues(chunk, out);
  return out;
}

const TODAY = '2026-08-29';
const WINDOW_START = '2026-06-07';

const SESSION_ROWS: Row[] = [
  { sessionId: 'sess-1', localDate: '2026-06-10' },
  { sessionId: 'sess-2', localDate: '2026-08-25' },
];

const SESSION_EXERCISE_ROWS: Row[] = [
  { id: 'se-1', sessionId: 'sess-1' },
  { id: 'se-2', sessionId: 'sess-2' },
  { id: 'se-3', sessionId: 'sess-2' },
];

const SET_ROWS: Row[] = [
  { id: 'ls-1', sessionExerciseId: 'se-1', setType: 'normal', weightKg: '100.000', reps: 5, completed: true, parentSetId: null },
  { id: 'ls-2', sessionExerciseId: 'se-1', setType: 'warmup', weightKg: '60.000', reps: 10, completed: true, parentSetId: null },
  { id: 'ls-3', sessionExerciseId: 'se-2', setType: 'normal', weightKg: '80.000', reps: 8, completed: true, parentSetId: 'ls-1' },
  { id: 'ls-4', sessionExerciseId: 'se-3', setType: 'normal', weightKg: '50.000', reps: 10, completed: false, parentSetId: null },
];

beforeEach(() => {
  (getPowerSync as jest.MockedFunction<typeof getPowerSync>).mockReset();
});

describe('historyTrendWindowStart', () => {
  it('spans the bucket count times the bucket size, inclusive of the supplied day', () => {
    expect(historyTrendWindowStart(TODAY)).toBe(WINDOW_START);
  });

  it('moves with the supplied day rather than snapping to a calendar boundary', () => {
    expect(historyTrendWindowStart('2026-08-30')).toBe('2026-06-08');
  });
});

describe('loadHistoryTrend', () => {
  it('returns an empty list when nobody is signed in, without reading anything', async () => {
    const { db, getSelectCount } = fakeDb([SESSION_ROWS, SESSION_EXERCISE_ROWS, SET_ROWS]);

    await expect(loadHistoryTrend({ userId: null, todayLocalDate: TODAY }, db)).resolves.toEqual([]);
    expect(getSelectCount()).toBe(0);
  });

  it('bounds the session read by the window start derived from the supplied day', async () => {
    const { db, conditions } = fakeDb([SESSION_ROWS, SESSION_EXERCISE_ROWS, SET_ROWS]);

    await loadHistoryTrend({ userId: 'user-1', todayLocalDate: TODAY }, db);

    expect(collectParamValues(conditions[0])).toContain(WINDOW_START);
  });

  it('returns sessions oldest first with every set row attached', async () => {
    const { db } = fakeDb([SESSION_ROWS, SESSION_EXERCISE_ROWS, SET_ROWS]);

    const sessions = await loadHistoryTrend({ userId: 'user-1', todayLocalDate: TODAY }, db);

    expect(sessions.map((session) => session.localDate)).toEqual(['2026-06-10', '2026-08-25']);
    expect(sessions[0].sets.map((set) => set.id)).toEqual(['ls-1', 'ls-2']);
    expect(sessions[1].sets.map((set) => set.id)).toEqual(['ls-3', 'ls-4']);
  });

  it('returns warm-ups, drop-set children and incomplete rows unfiltered, so the pure layer picks the population', async () => {
    const { db } = fakeDb([SESSION_ROWS, SESSION_EXERCISE_ROWS, SET_ROWS]);

    const sessions = await loadHistoryTrend({ userId: 'user-1', todayLocalDate: TODAY }, db);
    const allSets = sessions.flatMap((session) => session.sets);

    expect(allSets).toHaveLength(SET_ROWS.length);
    expect(allSets.find((set) => set.id === 'ls-2')).toEqual({
      id: 'ls-2',
      setType: 'warmup',
      weightKg: '60.000',
      reps: 10,
      completed: true,
      parentSetId: null,
    });
    expect(allSets.find((set) => set.id === 'ls-3')?.parentSetId).toBe('ls-1');
    expect(allSets.find((set) => set.id === 'ls-4')?.completed).toBe(false);
  });

  it('uses exactly three queries however many sessions fall in the window', async () => {
    const manySessions = Array.from({ length: 60 }, (_, index) => ({
      sessionId: `sess-${index}`,
      localDate: `2026-07-${String((index % 28) + 1).padStart(2, '0')}`,
    }));
    const manyExercises = manySessions.map((row, index) => ({ id: `se-${index}`, sessionId: row.sessionId }));
    const { db, getSelectCount } = fakeDb([manySessions, manyExercises, []]);

    const sessions = await loadHistoryTrend({ userId: 'user-1', todayLocalDate: TODAY }, db);

    expect(sessions).toHaveLength(60);
    expect(getSelectCount()).toBe(3);
  });

  it('issues no further query when no session falls in the window', async () => {
    const { db, getSelectCount } = fakeDb([[], SESSION_EXERCISE_ROWS, SET_ROWS]);

    await expect(loadHistoryTrend({ userId: 'user-1', todayLocalDate: TODAY }, db)).resolves.toEqual([]);
    expect(getSelectCount()).toBe(1);
  });

  it('stops after two queries when the window holds sessions but no exercises', async () => {
    const { db, getSelectCount } = fakeDb([SESSION_ROWS, [], SET_ROWS]);

    const sessions = await loadHistoryTrend({ userId: 'user-1', todayLocalDate: TODAY }, db);

    expect(getSelectCount()).toBe(2);
    expect(sessions.map((session) => session.sets)).toEqual([[], []]);
  });
});
