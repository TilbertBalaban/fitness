import {
  defaultWarmupWorkingWeightKg,
  loadLiveSession,
  loadSessionTree,
  previousSetReference,
  previousSetReferencesForSession,
} from '../session-query';
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
const SESSION_ROW_WITH_CYCLE = { ...SESSION_ROW, cycleId: 'cycle-1' };

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

  // LOG-15: the session's stored cycle id is read back exactly as startSession stamped it, so a
  // restored session resolves write-back against the cycle it actually started in.
  it('returns the stored cycleId on the session row', async () => {
    const { db } = fakeSessionDb({ sessionRows: [SESSION_ROW_WITH_CYCLE] });

    const result = await loadSessionTree('s-1', db);

    expect(result?.session.cycleId).toBe('cycle-1');
  });

  // LOG-16: a set-level note is carried on LoggedSetRow so the row can show its own note dot and
  // NoteSheet can be seeded with the existing text — a set with no note returns null, not undefined.
  it('carries notes on LoggedSetRow — present when set, null when the set has no note', async () => {
    const { db } = fakeSessionDb({
      sessionRows: [SESSION_ROW],
      exerciseRows: [
        { id: 'se-1', sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, supersetGroupId: null, targetSets: null, targetRepMin: null, targetRepMax: null, targetRir: null, targetRestSeconds: null },
      ],
      setRows: [
        { id: 'ls-1', sessionExerciseId: 'se-1', setIndex: 1, setType: 'normal', weightKg: '100.000', reps: 10, rir: 2, completed: true, loggedAt: 't1', notes: 'Felt heavy today' },
        { id: 'ls-2', sessionExerciseId: 'se-1', setIndex: 2, setType: 'normal', weightKg: '100.000', reps: 10, rir: 2, completed: true, loggedAt: 't2', notes: null },
      ],
    });

    const result = await loadSessionTree('s-1', db);
    const sets = result?.setsByExerciseId['se-1'] ?? [];

    expect(sets.find((row) => row.id === 'ls-1')?.notes).toBe('Felt heavy today');
    expect(sets.find((row) => row.id === 'ls-2')?.notes).toBeNull();
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

// previousSetReference/previousSetReferencesForSession build compound and()/inArray()/ne()
// conditions the eq()-only evaluator above can't interpret, so this fake walks the same
// queryChunks shape one level further: a leaf clause is COLUMN OP VALUE(S) (operator one of
// " = " / " <> " / " in ", verified empirically against the exact drizzle-orm build in this
// workspace's lockfile), and and()/or() wrap several leaves with a joining " and "/" or " string
// chunk between them — recursing on nested SQL nodes covers both shapes with one function.
function isSqlNode(node: unknown): node is { queryChunks: unknown[] } {
  return !!node && typeof node === 'object' && Array.isArray((node as { queryChunks?: unknown[] }).queryChunks);
}

function isColumnChunk(node: unknown): node is { name: string } {
  return !!node && typeof node === 'object' && typeof (node as { name?: unknown }).name === 'string' && 'table' in (node as object);
}

// A StringChunk (literal syntax fragment — an operator, "(", ")", " and ") stores its text as an
// ARRAY of strings in `.value`; a Param (an actual bound value, including each element of an
// inArray() list) stores its value as the bare scalar. Verified empirically against this
// workspace's exact drizzle-orm build (`node -e` against `eq()`'s own queryChunks) — this is the
// one distinction the whole evaluator hinges on, and it is easy to get backwards.
function stringChunkText(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const value = (node as { value?: unknown }).value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value.join('');
  return null;
}

function isParamChunk(node: unknown): node is { value: unknown } {
  if (!node || typeof node !== 'object') return false;
  if (!('value' in (node as object))) return false;
  return !Array.isArray((node as { value: unknown }).value);
}

function buildPredicate(table: TableLike, node: unknown): (row: Record<string, unknown>) => boolean {
  if (!isSqlNode(node)) return () => true;
  const chunks = node.queryChunks;

  const subNodes = chunks.filter(isSqlNode);
  const joinsOr = chunks.some((chunk) => stringChunkText(chunk)?.trim() === 'or');
  if (subNodes.length > 1) {
    const predicates = subNodes.map((sub) => buildPredicate(table, sub));
    return (row) => (joinsOr ? predicates.some((p) => p(row)) : predicates.every((p) => p(row)));
  }
  if (subNodes.length === 1) return buildPredicate(table, subNodes[0]);

  let column: string | null = null;
  let operator: string | null = null;
  let values: unknown[] = [];
  for (const chunk of chunks) {
    if (isColumnChunk(chunk)) {
      column = chunk.name;
      continue;
    }
    if (Array.isArray(chunk)) {
      values = chunk.map((entry) => (isParamChunk(entry) ? entry.value : undefined));
      continue;
    }
    const text = stringChunkText(chunk);
    if (text !== null) {
      const trimmed = text.trim();
      if (trimmed === '=' || trimmed === '<>' || trimmed === 'in') operator = trimmed;
      continue;
    }
    if (isParamChunk(chunk) && operator && operator !== 'in') {
      values = [chunk.value];
    }
  }

  if (!column || !operator) return () => true;
  const key = propertyKeyForColumn(table, column);
  if (!key) return () => true;

  return (row) => {
    const rowValue = row[key];
    if (operator === '=') return rowValue === values[0];
    if (operator === '<>') return rowValue !== values[0];
    if (operator === 'in') return values.includes(rowValue);
    return true;
  };
}

interface ReferenceFakeRows {
  sessionExerciseRows?: Record<string, unknown>[];
  workoutSessionRows?: Record<string, unknown>[];
  loggedSetRows?: Record<string, unknown>[];
}

function fakeReferenceDb({ sessionExerciseRows = [], workoutSessionRows = [], loggedSetRows = [] }: ReferenceFakeRows) {
  const tables = new Map<unknown, [TableLike, Record<string, unknown>[]]>([
    [sessionExercise, [sessionExercise as unknown as TableLike, sessionExerciseRows]],
    [workoutSession, [workoutSession as unknown as TableLike, workoutSessionRows]],
    [loggedSet, [loggedSet as unknown as TableLike, loggedSetRows]],
  ]);

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => {
          const [tableDef, tableRows] = tables.get(table) ?? [{}, []];
          const predicate = buildPredicate(tableDef, condition);
          return Promise.resolve(tableRows.filter(predicate));
        },
      }),
    }),
  } as unknown as ReturnType<typeof getPowerSync>;

  return db;
}

const EXERCISE_A_SE_CURRENT = { id: 'se-current', sessionId: 's-current', exerciseId: 'ex-a' };
const EXERCISE_A_SE_PRIOR_1 = { id: 'se-prior-1', sessionId: 's-prior-1', exerciseId: 'ex-a' };
const EXERCISE_A_SE_PRIOR_2 = { id: 'se-prior-2', sessionId: 's-prior-2', exerciseId: 'ex-a' };

const SESSION_PRIOR_1 = { id: 's-prior-1', startedAt: '2026-08-01T10:00:00.000Z' };
const SESSION_PRIOR_2 = { id: 's-prior-2', startedAt: '2026-08-10T10:00:00.000Z' };

describe('previousSetReference', () => {
  it('resolves the prior session’s same-set_index row, not its most recently logged row (Pitfall 1)', async () => {
    const db = fakeReferenceDb({
      sessionExerciseRows: [EXERCISE_A_SE_CURRENT, EXERCISE_A_SE_PRIOR_1],
      workoutSessionRows: [SESSION_PRIOR_1],
      loggedSetRows: [
        { id: 'ls-1', sessionExerciseId: 'se-prior-1', setIndex: 1, setType: 'normal', weightKg: '90.000', reps: 8, loggedAt: 't1' },
        { id: 'ls-2', sessionExerciseId: 'se-prior-1', setIndex: 2, setType: 'normal', weightKg: '92.500', reps: 8, loggedAt: 't2' },
        { id: 'ls-3', sessionExerciseId: 'se-prior-1', setIndex: 3, setType: 'normal', weightKg: '95.000', reps: 6, loggedAt: 't3' },
      ],
    });

    const result = await previousSetReference({ exerciseId: 'ex-a', setIndex: 2, beforeSessionId: 's-current', userId: 'user-1' }, db);

    expect(result).toEqual({ weightKg: '92.500', reps: 8, sessionId: 's-prior-1', loggedAt: 't2' });
  });

  it('picks the reference from the prior session with the greater started_at when two prior sessions share a set_index', async () => {
    const db = fakeReferenceDb({
      sessionExerciseRows: [EXERCISE_A_SE_CURRENT, EXERCISE_A_SE_PRIOR_1, EXERCISE_A_SE_PRIOR_2],
      workoutSessionRows: [SESSION_PRIOR_1, SESSION_PRIOR_2],
      loggedSetRows: [
        { id: 'ls-older', sessionExerciseId: 'se-prior-1', setIndex: 1, setType: 'normal', weightKg: '90.000', reps: 8, loggedAt: 't1' },
        { id: 'ls-newer', sessionExerciseId: 'se-prior-2', setIndex: 1, setType: 'normal', weightKg: '100.000', reps: 5, loggedAt: 't2' },
      ],
    });

    const result = await previousSetReference({ exerciseId: 'ex-a', setIndex: 1, beforeSessionId: 's-current', userId: 'user-1' }, db);

    expect(result).toMatchObject({ weightKg: '100.000', sessionId: 's-prior-2' });
  });

  it('breaks a started_at tie by the greater logged_at', async () => {
    const db = fakeReferenceDb({
      sessionExerciseRows: [EXERCISE_A_SE_CURRENT, EXERCISE_A_SE_PRIOR_1],
      workoutSessionRows: [SESSION_PRIOR_1],
      loggedSetRows: [
        { id: 'ls-a', sessionExerciseId: 'se-prior-1', setIndex: 1, setType: 'normal', weightKg: '90.000', reps: 8, loggedAt: 't1' },
        { id: 'ls-b', sessionExerciseId: 'se-prior-1', setIndex: 1, setType: 'normal', weightKg: '91.000', reps: 8, loggedAt: 't2' },
      ],
    });

    const result = await previousSetReference({ exerciseId: 'ex-a', setIndex: 1, beforeSessionId: 's-current', userId: 'user-1' }, db);

    expect(result).toMatchObject({ weightKg: '91.000', loggedAt: 't2' });
  });

  it('resolves null for a first-ever exercise with no prior session', async () => {
    const db = fakeReferenceDb({ sessionExerciseRows: [EXERCISE_A_SE_CURRENT] });

    const result = await previousSetReference({ exerciseId: 'ex-a', setIndex: 1, beforeSessionId: 's-current', userId: 'user-1' }, db);

    expect(result).toBeNull();
  });

  it('excludes a warm-up row from its own source set, even at the exact matching set_index', async () => {
    const db = fakeReferenceDb({
      sessionExerciseRows: [EXERCISE_A_SE_CURRENT, EXERCISE_A_SE_PRIOR_1],
      workoutSessionRows: [SESSION_PRIOR_1],
      loggedSetRows: [
        { id: 'ls-warmup', sessionExerciseId: 'se-prior-1', setIndex: 1, setType: 'warmup', weightKg: '40.000', reps: 10, loggedAt: 't1' },
      ],
    });

    const result = await previousSetReference({ exerciseId: 'ex-a', setIndex: 1, beforeSessionId: 's-current', userId: 'user-1' }, db);

    expect(result).toBeNull();
  });

  it('resolves null for a signed-out read without querying', async () => {
    const db = fakeReferenceDb({ sessionExerciseRows: [EXERCISE_A_SE_CURRENT] });

    const result = await previousSetReference({ exerciseId: 'ex-a', setIndex: 1, beforeSessionId: 's-current', userId: null }, db);

    expect(result).toBeNull();
  });
});

describe('previousSetReferencesForSession', () => {
  it('resolves a key per (session_exercise, set_index) for every existing row plus its next draft index', async () => {
    const db = fakeReferenceDb({
      sessionExerciseRows: [EXERCISE_A_SE_CURRENT, EXERCISE_A_SE_PRIOR_1],
      workoutSessionRows: [SESSION_PRIOR_1],
      loggedSetRows: [
        { id: 'ls-cur-1', sessionExerciseId: 'se-current', setIndex: 1, setType: 'normal', weightKg: '80.000', reps: 10, loggedAt: 'now' },
        { id: 'ls-prior-1', sessionExerciseId: 'se-prior-1', setIndex: 1, setType: 'normal', weightKg: '90.000', reps: 8, loggedAt: 't1' },
        { id: 'ls-prior-2', sessionExerciseId: 'se-prior-1', setIndex: 2, setType: 'normal', weightKg: '92.500', reps: 8, loggedAt: 't2' },
      ],
    });

    const result = await previousSetReferencesForSession('s-current', db);

    expect(result['se-current:1']).toMatchObject({ weightKg: '90.000' });
    expect(result['se-current:2']).toMatchObject({ weightKg: '92.500' });
  });

  it('resolves an empty map for a session with no exercises', async () => {
    const db = fakeReferenceDb({});

    const result = await previousSetReferencesForSession('s-current', db);

    expect(result).toEqual({});
  });

  it('never includes a key for a set_index with no prior data', async () => {
    const db = fakeReferenceDb({ sessionExerciseRows: [EXERCISE_A_SE_CURRENT] });

    const result = await previousSetReferencesForSession('s-current', db);

    expect(result['se-current:1']).toBeUndefined();
  });
});

describe('defaultWarmupWorkingWeightKg — the Warm-up sheet’s default resolution order (LOG-17)', () => {
  it('prefers the exercise’s own first logged working set in this session, by set_index, over a heavier later one', async () => {
    const db = fakeReferenceDb({
      sessionExerciseRows: [EXERCISE_A_SE_CURRENT],
      loggedSetRows: [
        { id: 'ls-cur-2', sessionExerciseId: 'se-current', setIndex: 2, setType: 'normal', weightKg: '105.000', reps: 8, loggedAt: 't2' },
        { id: 'ls-cur-1', sessionExerciseId: 'se-current', setIndex: 1, setType: 'normal', weightKg: '100.000', reps: 8, loggedAt: 't1' },
      ],
    });

    const result = await defaultWarmupWorkingWeightKg(
      { sessionExerciseId: 'se-current', exerciseId: 'ex-a', beforeSessionId: 's-current', userId: 'user-1' },
      db,
    );

    expect(result).toBe('100.000');
  });

  it('falls back to the D-16 cross-session history prefill when no working set has been logged yet', async () => {
    const db = fakeReferenceDb({
      sessionExerciseRows: [EXERCISE_A_SE_CURRENT, EXERCISE_A_SE_PRIOR_1],
      workoutSessionRows: [SESSION_PRIOR_1],
      loggedSetRows: [
        { id: 'ls-prior-1', sessionExerciseId: 'se-prior-1', setIndex: 1, setType: 'normal', weightKg: '90.000', reps: 8, loggedAt: 't1' },
      ],
    });

    const result = await defaultWarmupWorkingWeightKg(
      { sessionExerciseId: 'se-current', exerciseId: 'ex-a', beforeSessionId: 's-current', userId: 'user-1' },
      db,
    );

    expect(result).toBe('90.000');
  });

  it('resolves null (the sheet’s own required-field case) with neither a current working set nor prior history', async () => {
    const db = fakeReferenceDb({ sessionExerciseRows: [EXERCISE_A_SE_CURRENT] });

    const result = await defaultWarmupWorkingWeightKg(
      { sessionExerciseId: 'se-current', exerciseId: 'ex-a', beforeSessionId: 's-current', userId: 'user-1' },
      db,
    );

    expect(result).toBeNull();
  });

  it('ignores a warm-up row already logged this session when looking for a working-set default', async () => {
    const db = fakeReferenceDb({
      sessionExerciseRows: [EXERCISE_A_SE_CURRENT],
      loggedSetRows: [
        { id: 'ls-warmup', sessionExerciseId: 'se-current', setIndex: 1, setType: 'warmup', weightKg: '40.000', reps: 10, loggedAt: 't1' },
      ],
    });

    const result = await defaultWarmupWorkingWeightKg(
      { sessionExerciseId: 'se-current', exerciseId: 'ex-a', beforeSessionId: 's-current', userId: 'user-1' },
      db,
    );

    expect(result).toBeNull();
  });
});
