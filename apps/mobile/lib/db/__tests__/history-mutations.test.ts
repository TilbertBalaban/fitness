import { deleteSession, duplicateSession, renameSession } from '../history-mutations';
import { getPowerSync, type WriteDb } from '../powersync';
import { loggedSet, sessionExercise, workoutSession } from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));

let mockIdCounter = 0;
jest.mock('../id', () => ({ generateClientId: jest.fn(() => `new-${mockIdCounter++}`) }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;

type TableLike = Record<string, { name?: string } | undefined>;
type Row = Record<string, unknown>;

function propertyKeyForColumn(table: TableLike, columnName: string): string | undefined {
  return Object.entries(table).find(([, column]) => column?.name === columnName)?.[0];
}

interface Predicate {
  column: string;
  op: 'eq' | 'in';
  values: unknown[];
}

// Mirrors session-mutations.test.ts's own collectEqualities/rowMatches convention (kept as a
// per-file copy, matching this codebase's established pattern), extended with an `in` case for
// deleteSession's inArray(...) predicate — drizzle represents inArray's operand as a bare JS array
// of Param objects rather than a single Param, so it needs its own branch rather than falling into
// the scalar-Param branch eq() conditions use.
function collectPredicates(node: unknown, out: Predicate[]): void {
  const chunks = (node as { queryChunks?: unknown[] })?.queryChunks;
  if (!Array.isArray(chunks)) return;

  let column: string | null = null;
  for (const chunk of chunks) {
    const part = chunk as { queryChunks?: unknown[]; name?: string; value?: unknown };
    if (Array.isArray(part?.queryChunks)) {
      collectPredicates(part, out);
      continue;
    }
    if (typeof part?.name === 'string') {
      column = part.name;
      continue;
    }
    if (Array.isArray(chunk) && column !== null) {
      out.push({ column, op: 'in', values: (chunk as { value: unknown }[]).map((item) => item.value) });
      column = null;
      continue;
    }
    if (part && 'value' in part && !Array.isArray(part.value) && column !== null) {
      out.push({ column, op: 'eq', values: [part.value] });
      column = null;
    }
  }
}

function rowMatches(table: TableLike, row: Row, condition: unknown): boolean {
  const predicates: Predicate[] = [];
  collectPredicates(condition, predicates);
  if (predicates.length === 0) return true;
  return predicates.every(({ column, op, values }) => {
    const key = propertyKeyForColumn(table, column);
    if (key === undefined) return false;
    return op === 'eq' ? row[key] === values[0] : values.includes(row[key]);
  });
}

// A small in-memory stand-in for the local database, in the same shape as
// session-mutations.test.ts's own inMemoryDb — extended with `transaction()`, which
// duplicate-routine.test.ts's fake proves the right shape for (`this` bound to the fake itself, so
// tx.insert/tx.delete calls made inside the callback are visible to the SAME tables Map).
function inMemoryDb() {
  const tables = new Map<unknown, Row[]>();
  let transactionCount = 0;

  function rowsFor(table: unknown): Row[] {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table) as Row[];
  }

  const db = {
    select: (projection: Record<string, unknown>) => ({
      from: (table: TableLike) => ({
        where: (condition: unknown) => {
          const matched = rowsFor(table).filter((row) => rowMatches(table, row, condition));
          return Promise.resolve(
            matched.map((row) => {
              const projected: Row = {};
              for (const [alias, column] of Object.entries(projection)) {
                const key = propertyKeyForColumn(table, (column as { name?: string })?.name ?? alias) ?? alias;
                projected[alias] = row[key] ?? null;
              }
              return projected;
            }),
          );
        },
      }),
    }),
    insert: (table: TableLike) => ({
      values: (values: Row) => {
        rowsFor(table).push({ ...values });
        return Promise.resolve();
      },
    }),
    update: (table: TableLike) => ({
      set: (patch: Row) => ({
        where: (condition: unknown) => {
          for (const row of rowsFor(table)) {
            if (rowMatches(table, row, condition)) Object.assign(row, patch);
          }
          return Promise.resolve();
        },
      }),
    }),
    delete: (table: TableLike) => ({
      where: (condition: unknown) => {
        tables.set(
          table,
          rowsFor(table).filter((row) => !rowMatches(table, row, condition)),
        );
        return Promise.resolve();
      },
    }),
    transaction: async function transaction(run: (tx: unknown) => Promise<unknown>) {
      transactionCount += 1;
      return run(this);
    },
  } as unknown as WriteDb;

  return {
    db,
    getTransactionCount: () => transactionCount,
    seed(table: unknown, row: Row) {
      rowsFor(table).push({ ...row });
    },
    rowsOf(table: unknown): Row[] {
      return rowsFor(table);
    },
  };
}

beforeEach(() => {
  mockIdCounter = 0;
  getPowerSyncMock.mockReset();
});

describe('renameSession', () => {
  it('writes only workout_session.name', async () => {
    const store = inMemoryDb();
    store.seed(workoutSession, { id: 'ws-1', name: null, status: 'completed' });

    await renameSession('ws-1', 'Leg Day', store.db);

    expect(store.rowsOf(workoutSession)[0].name).toBe('Leg Day');
    expect(store.rowsOf(workoutSession)[0].status).toBe('completed');
  });

  it('normalises an empty or all-whitespace string to null, falling back to the date label', async () => {
    const store = inMemoryDb();
    store.seed(workoutSession, { id: 'ws-1', name: 'Old Name' });

    await renameSession('ws-1', '   ', store.db);
    expect(store.rowsOf(workoutSession)[0].name).toBeNull();

    store.rowsOf(workoutSession)[0].name = 'Old Name';
    await renameSession('ws-1', '', store.db);
    expect(store.rowsOf(workoutSession)[0].name).toBeNull();
  });
});

function seedSourceSession(store: ReturnType<typeof inMemoryDb>, sessionId: string, cycleId: string | null = null) {
  store.seed(workoutSession, {
    id: sessionId,
    routineDayId: null,
    cycleId,
    equipmentProfileId: null,
    deviceId: null,
    status: 'completed',
    startedAt: '2026-01-01T10:00:00.000Z',
    endedAt: '2026-01-01T11:00:00.000Z',
    timezone: 'UTC',
    localDate: '2026-01-01',
  });
  store.seed(sessionExercise, {
    id: `${sessionId}-se-1`,
    sessionId,
    exerciseId: 'ex-bench',
    orderIndex: 0,
    supersetGroupId: null,
    routineExerciseId: null,
    targetSets: 3,
    targetRepMin: 8,
    targetRepMax: 12,
    targetRir: 2,
    targetRestSeconds: 120,
    removedAt: null,
  });
  store.seed(sessionExercise, {
    id: `${sessionId}-se-removed`,
    sessionId,
    exerciseId: 'ex-removed',
    orderIndex: 1,
    supersetGroupId: null,
    routineExerciseId: null,
    targetSets: 5,
    targetRepMin: 5,
    targetRepMax: 5,
    targetRir: 0,
    targetRestSeconds: 90,
    removedAt: '2026-01-01T10:30:00.000Z',
  });
  store.seed(loggedSet, { id: `${sessionId}-ls-1`, sessionExerciseId: `${sessionId}-se-1`, completed: true, setType: 'normal' });
}

describe('duplicateSession — copies the prescription, not the performance (LOG-20)', () => {
  it('creates a new session via startSession and copies each non-removed exercise’s frozen targets, with zero logged sets', async () => {
    const store = inMemoryDb();
    seedSourceSession(store, 'src-ws');

    const newSessionId = await duplicateSession({ sourceSessionId: 'src-ws' }, store.db);

    expect(newSessionId).not.toBe('src-ws');
    const newSessionRow = store.rowsOf(workoutSession).find((row) => row.id === newSessionId);
    expect(newSessionRow).toMatchObject({ status: 'in_progress' });

    const copiedExercises = store.rowsOf(sessionExercise).filter((row) => row.sessionId === newSessionId);
    expect(copiedExercises).toHaveLength(1);
    expect(copiedExercises[0]).toMatchObject({
      exerciseId: 'ex-bench',
      targetSets: 3,
      targetRepMin: 8,
      targetRepMax: 12,
      targetRir: 2,
      targetRestSeconds: 120,
    });
    expect(copiedExercises[0].id).not.toBe('src-ws-se-1');

    const copiedSets = store.rowsOf(loggedSet).filter((row) =>
      copiedExercises.some((exercise) => exercise.id === row.sessionExerciseId),
    );
    expect(copiedSets).toHaveLength(0);
  });

  it('skips source exercises whose removed_at is stamped', async () => {
    const store = inMemoryDb();
    seedSourceSession(store, 'src-ws');

    const newSessionId = await duplicateSession({ sourceSessionId: 'src-ws' }, store.db);

    const copiedExerciseIds = store
      .rowsOf(sessionExercise)
      .filter((row) => row.sessionId === newSessionId)
      .map((row) => row.exerciseId);
    expect(copiedExerciseIds).not.toContain('ex-removed');
  });

  it('produces two independent copies with pairwise-disjoint ids from each other and the source', async () => {
    const store = inMemoryDb();
    seedSourceSession(store, 'src-ws');

    const first = await duplicateSession({ sourceSessionId: 'src-ws' }, store.db);
    const second = await duplicateSession({ sourceSessionId: 'src-ws' }, store.db);

    expect(first).not.toBe(second);

    const firstExerciseIds = store.rowsOf(sessionExercise).filter((row) => row.sessionId === first).map((row) => row.id);
    const secondExerciseIds = store.rowsOf(sessionExercise).filter((row) => row.sessionId === second).map((row) => row.id);

    const allIds = [first, second, 'src-ws', ...firstExerciseIds, ...secondExerciseIds, 'src-ws-se-1'];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('falls back to getPowerSync() when no database argument is passed', async () => {
    const store = inMemoryDb();
    seedSourceSession(store, 'src-ws');
    getPowerSyncMock.mockReturnValue(store.db);

    await duplicateSession({ sourceSessionId: 'src-ws' });

    expect(getPowerSyncMock).toHaveBeenCalled();
  });

  // WR-02: startSession and the addSessionExercise/setSessionExerciseTargets loop must all run
  // inside one transaction, mirroring deleteSession's own all-or-nothing guarantee below — an
  // interruption partway through must never leave a new session with some but not all of the
  // source's exercises/targets.
  it('runs startSession and the whole exercise-copy loop inside exactly one transaction call', async () => {
    const store = inMemoryDb();
    seedSourceSession(store, 'src-ws');

    await duplicateSession({ sourceSessionId: 'src-ws' }, store.db);

    expect(store.getTransactionCount()).toBe(1);
  });

  // LOG-15: the new session must resolve write-back against the same cycle the original did — a
  // duplicated programmed workout carries its source's cycle id forward, never drops it.
  it('carries the source session’s cycleId onto the new session', async () => {
    const store = inMemoryDb();
    seedSourceSession(store, 'src-ws', 'cycle-1');

    const newSessionId = await duplicateSession({ sourceSessionId: 'src-ws' }, store.db);

    const newSessionRow = store.rowsOf(workoutSession).find((row) => row.id === newSessionId);
    expect(newSessionRow?.cycleId).toBe('cycle-1');
  });

  it('carries a null cycleId onto the new session when the source has none', async () => {
    const store = inMemoryDb();
    seedSourceSession(store, 'src-ws', null);

    const newSessionId = await duplicateSession({ sourceSessionId: 'src-ws' }, store.db);

    const newSessionRow = store.rowsOf(workoutSession).find((row) => row.id === newSessionId);
    expect(newSessionRow?.cycleId).toBeNull();
  });
});

describe('deleteSession — all-or-nothing across three tables (T-05-09-02)', () => {
  it('leaves no session_exercise or logged_set row referencing the deleted session', async () => {
    const store = inMemoryDb();
    seedSourceSession(store, 'ws-1');

    await deleteSession('ws-1', store.db);

    expect(store.rowsOf(workoutSession).find((row) => row.id === 'ws-1')).toBeUndefined();
    expect(store.rowsOf(sessionExercise).filter((row) => row.sessionId === 'ws-1')).toHaveLength(0);
    expect(store.rowsOf(loggedSet)).toHaveLength(0);
  });

  it('runs its deletes inside exactly one transaction call', async () => {
    const store = inMemoryDb();
    seedSourceSession(store, 'ws-1');

    await deleteSession('ws-1', store.db);

    expect(store.getTransactionCount()).toBe(1);
  });

  it('leaves other sessions and their children untouched', async () => {
    const store = inMemoryDb();
    seedSourceSession(store, 'ws-1');
    seedSourceSession(store, 'ws-2');

    await deleteSession('ws-1', store.db);

    expect(store.rowsOf(workoutSession).find((row) => row.id === 'ws-2')).toBeDefined();
    expect(store.rowsOf(sessionExercise).filter((row) => row.sessionId === 'ws-2')).toHaveLength(2);
  });
});
