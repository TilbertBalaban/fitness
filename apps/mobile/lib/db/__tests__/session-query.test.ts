import { loadLiveSession, loadSessionTree } from '../session-query';
import { getPowerSync } from '../powersync';
import { loadExerciseNameMap } from '../programs/load-program';
import { loggedSet, sessionExercise, workoutSession } from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../programs/load-program', () => ({ loadExerciseNameMap: jest.fn() }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;
const loadExerciseNameMapMock = loadExerciseNameMap as jest.MockedFunction<typeof loadExerciseNameMap>;

interface FakeRows {
  sessionRows?: Record<string, unknown>[];
  exerciseRows?: Record<string, unknown>[];
  setRows?: Record<string, unknown>[];
}

// drizzle's eq()/and() build a SQL tree of query chunks: a column carries `name`, a bound
// parameter carries a scalar `value`, and a literal fragment carries a string `value` too — the
// same technique lib/db/__tests__/log-set.test.ts's inMemoryDb established, reused here because
// loadSessionTree/loadLiveSession's by-id lookups need real filtering, not "return every row of
// this table" — the exact gap that let a wrong-session fixture pass silently.
type TableLike = Record<string, { name?: string } | undefined>;

function collectEqualities(node: unknown, out: { column: string; value: unknown }[]): void {
  const chunks = (node as { queryChunks?: unknown[] })?.queryChunks;
  if (!Array.isArray(chunks)) return;

  let column: string | null = null;
  for (const chunk of chunks) {
    const part = chunk as { queryChunks?: unknown[]; name?: string; value?: unknown };
    if (Array.isArray(part?.queryChunks)) {
      collectEqualities(part, out);
      continue;
    }
    if (typeof part?.name === 'string') {
      column = part.name;
      continue;
    }
    if (part && 'value' in part && !Array.isArray(part.value) && column !== null) {
      out.push({ column, value: part.value });
      column = null;
    }
  }
}

function propertyKeyForColumn(table: TableLike, columnName: string): string | undefined {
  return Object.entries(table).find(([, column]) => column?.name === columnName)?.[0];
}

function rowMatches(table: TableLike, row: Record<string, unknown>, condition: unknown): boolean {
  const equalities: { column: string; value: unknown }[] = [];
  collectEqualities(condition, equalities);
  if (equalities.length === 0) return true;
  return equalities.every(({ column, value }) => {
    const key = propertyKeyForColumn(table, column);
    return key !== undefined && row[key] === value;
  });
}

// Keyed by table identity, following lib/db/__tests__/next-up-query.test.ts's established
// fakeNextUpDb shape — a select's row set is resolved from which drizzle table object it named,
// not from call order, so reordering the real selects inside session-query.ts cannot silently
// desync a fixture from the query that consumes it. Every where() clause is evaluated for real
// (eq()/and() only — inArray()'s multi-value membership is out of scope for this file's own
// selects), rather than matching every row unconditionally.
function fakeSessionDb(rows: FakeRows) {
  let selectCount = 0;

  const tables = new Map<unknown, [TableLike, Record<string, unknown>[]]>([
    [workoutSession, [workoutSession as unknown as TableLike, rows.sessionRows ?? []]],
    [sessionExercise, [sessionExercise as unknown as TableLike, rows.exerciseRows ?? []]],
    [loggedSet, [loggedSet as unknown as TableLike, rows.setRows ?? []]],
  ]);

  const db = {
    select: () => {
      selectCount++;
      return {
        from: (table: unknown) => ({
          where: (condition: unknown) => {
            const [tableDef, tableRows] = tables.get(table) ?? [{}, []];
            const matched = tableRows.filter((row) => rowMatches(tableDef, row, condition));
            return Object.assign(Promise.resolve(matched), { orderBy: () => Promise.resolve(matched) });
          },
        }),
      };
    },
  } as unknown as ReturnType<typeof getPowerSync>;

  return { db, getSelectCount: () => selectCount };
}

const SESSION_ROW = { id: 's-1', routineDayId: 'd-1', status: 'in_progress', startedAt: '2026-08-20T10:00:00.000Z' };

beforeEach(() => {
  loadExerciseNameMapMock.mockResolvedValue(new Map());
});

describe('loadSessionTree', () => {
  it('returns null in exactly one select when the session id names no row', async () => {
    const { db, getSelectCount } = fakeSessionDb({});

    const result = await loadSessionTree('missing', db);

    expect(result).toBeNull();
    expect(getSelectCount()).toBe(1);
  });

  it('assembles the session, its exercises and their sets in three selects', async () => {
    const { db, getSelectCount } = fakeSessionDb({
      sessionRows: [SESSION_ROW],
      exerciseRows: [
        { id: 'se-1', sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, supersetGroupId: null, targetSets: 3, targetRepMin: 8, targetRepMax: 12, targetRir: 2, targetRestSeconds: 90 },
      ],
      setRows: [
        { id: 'ls-1', sessionExerciseId: 'se-1', setIndex: 1, setType: 'normal', weightKg: '100.000', reps: 10, rir: 2, completed: true, loggedAt: '2026-08-20T10:05:00.000Z' },
      ],
    });
    loadExerciseNameMapMock.mockResolvedValue(new Map([['ex-1', 'Bench Press']]));

    const result = await loadSessionTree('s-1', db);

    expect(result?.session).toEqual(SESSION_ROW);
    expect(result?.exercises).toHaveLength(1);
    expect(result?.exercises[0].exerciseName).toBe('Bench Press');
    expect(result?.setsByExerciseId['se-1']).toHaveLength(1);
    expect(getSelectCount()).toBe(3);
  });

  it('falls back to Unknown exercise when the name map has no entry', async () => {
    const { db } = fakeSessionDb({
      sessionRows: [SESSION_ROW],
      exerciseRows: [
        { id: 'se-1', sessionId: 's-1', exerciseId: 'ex-gone', orderIndex: 0, supersetGroupId: null, targetSets: null, targetRepMin: null, targetRepMax: null, targetRir: null, targetRestSeconds: null },
      ],
      setRows: [],
    });

    const result = await loadSessionTree('s-1', db);

    expect(result?.exercises[0].exerciseName).toBe('Unknown exercise');
  });

  it('never selects logged_set when the session has no exercises yet', async () => {
    const { db, getSelectCount } = fakeSessionDb({ sessionRows: [SESSION_ROW], exerciseRows: [] });

    const result = await loadSessionTree('s-1', db);

    expect(result?.exercises).toEqual([]);
    expect(getSelectCount()).toBe(2);
  });

  it('sorts each exercise’s sets by set_index regardless of row-arrival order', async () => {
    const { db } = fakeSessionDb({
      sessionRows: [SESSION_ROW],
      exerciseRows: [
        { id: 'se-1', sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, supersetGroupId: null, targetSets: null, targetRepMin: null, targetRepMax: null, targetRir: null, targetRestSeconds: null },
      ],
      setRows: [
        { id: 'ls-2', sessionExerciseId: 'se-1', setIndex: 2, setType: 'normal', weightKg: '100.000', reps: 10, rir: 2, completed: true, loggedAt: 't2' },
        { id: 'ls-1', sessionExerciseId: 'se-1', setIndex: 1, setType: 'normal', weightKg: '95.000', reps: 10, rir: 2, completed: true, loggedAt: 't1' },
      ],
    });

    const result = await loadSessionTree('s-1', db);

    expect(result?.setsByExerciseId['se-1'].map((row) => row.setIndex)).toEqual([1, 2]);
  });

  it('reads from an explicitly passed database and never resolves getPowerSync', async () => {
    getPowerSyncMock.mockClear();
    const { db } = fakeSessionDb({ sessionRows: [SESSION_ROW] });

    await loadSessionTree('s-1', db);

    expect(getPowerSyncMock).not.toHaveBeenCalled();
  });
});

describe('loadLiveSession', () => {
  it('reads nothing at all when there is no signed-in user', async () => {
    const { db, getSelectCount } = fakeSessionDb({ sessionRows: [SESSION_ROW] });

    const result = await loadLiveSession(null, db);

    expect(result).toBeNull();
    expect(getSelectCount()).toBe(0);
  });

  it('returns null when no in_progress session exists on this device', async () => {
    const { db } = fakeSessionDb({ sessionRows: [] });

    const result = await loadLiveSession('user-1', db);

    expect(result).toBeNull();
  });

  it('resolves the open session and assembles its tree', async () => {
    const { db } = fakeSessionDb({
      sessionRows: [SESSION_ROW],
      exerciseRows: [],
      setRows: [],
    });

    const result = await loadLiveSession('user-1', db);

    expect(result?.session.id).toBe('s-1');
  });

  // A session started this instant, still offline, carries a null workout_session.user_id
  // locally (that column is stamped server-side on sync push only) — loadLiveSession must find it
  // by status alone, never by matching user_id, or D-01's "durable and resumable with no signal"
  // is false the moment it matters most.
  it('finds a session whose user_id is still null (not yet synced)', async () => {
    const { db } = fakeSessionDb({
      sessionRows: [{ id: 's-unsynced', routineDayId: null, status: 'in_progress', startedAt: '2026-08-20T09:00:00.000Z' }],
      exerciseRows: [],
      setRows: [],
    });

    const result = await loadLiveSession('user-1', db);

    expect(result?.session.id).toBe('s-unsynced');
  });

  it('picks the most recently started row when more than one in_progress session exists on this device', async () => {
    const { db } = fakeSessionDb({
      sessionRows: [
        { id: 's-older', routineDayId: null, status: 'in_progress', startedAt: '2026-08-20T08:00:00.000Z' },
        { id: 's-newer', routineDayId: null, status: 'in_progress', startedAt: '2026-08-20T09:00:00.000Z' },
      ],
      exerciseRows: [],
      setRows: [],
    });

    const result = await loadLiveSession('user-1', db);

    expect(result?.session.id).toBe('s-newer');
  });

  it('reads from an explicitly passed database and never resolves getPowerSync', async () => {
    getPowerSyncMock.mockClear();
    const { db } = fakeSessionDb({ sessionRows: [SESSION_ROW] });

    await loadLiveSession('user-1', db);

    expect(getPowerSyncMock).not.toHaveBeenCalled();
  });

  it('falls back to getPowerSync() when no database argument is passed', async () => {
    const { db } = fakeSessionDb({ sessionRows: [] });
    getPowerSyncMock.mockReturnValue(db);

    await loadLiveSession('user-1');

    expect(getPowerSyncMock).toHaveBeenCalled();
  });
});
