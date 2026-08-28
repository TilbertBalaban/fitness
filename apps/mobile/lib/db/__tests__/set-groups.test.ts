import { addSubEntry, clearSubEntries, removeSubEntry } from '../set-groups';
import { logSet } from '../log-set';
import { getPowerSync, type WriteDb } from '../powersync';
import { loggedSet } from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));
// addSubEntry's own contract is what it delegates and what it refuses — logSet's own insert
// mechanics (the select-max-then-insert transaction, CR-02) are already covered by
// log-set.test.ts and are not re-verified here.
jest.mock('../log-set', () => ({ logSet: jest.fn() }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;
const logSetMock = logSet as jest.MockedFunction<typeof logSet>;

type TableLike = Record<string, { name?: string } | undefined>;
type Row = Record<string, unknown>;

function propertyKeyForColumn(table: TableLike, columnName: string): string | undefined {
  return Object.entries(table).find(([, column]) => column?.name === columnName)?.[0];
}

// Mirrors session-mutations.test.ts's own condition-tree walker (drizzle's eq()/and() chunk
// shape) — kept as a per-file copy per this codebase's established convention.
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

function rowMatches(table: TableLike, row: Row, condition: unknown): boolean {
  const equalities: { column: string; value: unknown }[] = [];
  collectEqualities(condition, equalities);
  if (equalities.length === 0) return true;
  return equalities.every(({ column, value }) => {
    const key = propertyKeyForColumn(table, column);
    return key !== undefined && row[key] === value;
  });
}

// A tiny in-memory stand-in for the local SQLite database — same shape as session-mutations.test.ts's
// own inMemoryDb, with CR-02's transaction-reuses-this-store discipline preserved.
function inMemoryDb() {
  const tables = new Map<unknown, Row[]>();
  let transactionCount = 0;

  function rowsFor(table: unknown): Row[] {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table) as Row[];
  }

  const db = {
    select: (projection?: Record<string, unknown>) => ({
      from: (table: TableLike) => ({
        where: (condition: unknown) => {
          const matched = rowsFor(table).filter((row) => rowMatches(table, row, condition));
          if (!projection) {
            return Promise.resolve(matched.map((row) => ({ ...row })));
          }
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
    delete: (table: TableLike) => ({
      where: (condition: unknown) => {
        tables.set(
          table,
          rowsFor(table).filter((row) => !rowMatches(table, row, condition)),
        );
        return Promise.resolve();
      },
    }),
    transaction(this: unknown, run: (tx: unknown) => Promise<unknown>) {
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
  getPowerSyncMock.mockReset();
  logSetMock.mockReset();
});

describe('clearSubEntries — the group-level delete D-09 gates behind a confirm', () => {
  it('deletes every logged_set row whose parent_set_id is the argument, leaving the parent and unrelated rows untouched', async () => {
    const store = inMemoryDb();
    store.seed(loggedSet, { id: 'parent-1', parentSetId: null });
    store.seed(loggedSet, { id: 'child-1', parentSetId: 'parent-1' });
    store.seed(loggedSet, { id: 'child-2', parentSetId: 'parent-1' });
    store.seed(loggedSet, { id: 'unrelated-1', parentSetId: null });
    store.seed(loggedSet, { id: 'other-group-child', parentSetId: 'parent-2' });

    const deletedCount = await clearSubEntries('parent-1', store.db);

    expect(deletedCount).toBe(2);
    const remainingIds = store.rowsOf(loggedSet).map((row) => row.id);
    expect(remainingIds).toEqual(expect.arrayContaining(['parent-1', 'unrelated-1', 'other-group-child']));
    expect(remainingIds).not.toContain('child-1');
    expect(remainingIds).not.toContain('child-2');
  });

  it('is a no-op that resolves without error on a parent with no children', async () => {
    const store = inMemoryDb();
    store.seed(loggedSet, { id: 'parent-1', parentSetId: null });

    const deletedCount = await clearSubEntries('parent-1', store.db);

    expect(deletedCount).toBe(0);
    expect(store.rowsOf(loggedSet)).toHaveLength(1);
  });

  it('runs as one transaction, so an interruption cannot leave a group half-deleted', async () => {
    const store = inMemoryDb();
    store.seed(loggedSet, { id: 'parent-1', parentSetId: null });
    store.seed(loggedSet, { id: 'child-1', parentSetId: 'parent-1' });

    await clearSubEntries('parent-1', store.db);

    expect(store.getTransactionCount()).toBe(1);
  });
});

describe('removeSubEntry — the per-child remove, deliberately un-confirmed', () => {
  it('deletes exactly the one row with that id', async () => {
    const store = inMemoryDb();
    store.seed(loggedSet, { id: 'parent-1', parentSetId: null });
    store.seed(loggedSet, { id: 'child-1', parentSetId: 'parent-1' });
    store.seed(loggedSet, { id: 'child-2', parentSetId: 'parent-1' });

    const deleted = await removeSubEntry('child-1', store.db);

    expect(deleted).toBe(true);
    const remainingIds = store.rowsOf(loggedSet).map((row) => row.id);
    expect(remainingIds).toEqual(['parent-1', 'child-2']);
  });

  it('called with a parent row id deletes zero rows and returns a falsy result', async () => {
    const store = inMemoryDb();
    store.seed(loggedSet, { id: 'parent-1', parentSetId: null });
    store.seed(loggedSet, { id: 'child-1', parentSetId: 'parent-1' });

    const deleted = await removeSubEntry('parent-1', store.db);

    expect(deleted).toBeFalsy();
    expect(store.rowsOf(loggedSet)).toHaveLength(2);
  });

  it('called with an id that does not exist returns a falsy result and deletes nothing', async () => {
    const store = inMemoryDb();
    store.seed(loggedSet, { id: 'parent-1', parentSetId: null });

    const deleted = await removeSubEntry('missing-id', store.db);

    expect(deleted).toBeFalsy();
    expect(store.rowsOf(loggedSet)).toHaveLength(1);
  });
});

describe("addSubEntry — the D-08 '+ Add {type}' control's write", () => {
  it('delegates to logSet with the blank-slot shape isBlankSubEntry recognises, and returns its id', async () => {
    const store = inMemoryDb();
    store.seed(loggedSet, { id: 'parent-1', sessionExerciseId: 'se-1', parentSetId: null });
    logSetMock.mockResolvedValue('new-child-id');

    const id = await addSubEntry({ sessionExerciseId: 'se-1', parentSetId: 'parent-1', setType: 'drop' }, store.db);

    expect(id).toBe('new-child-id');
    expect(logSetMock).toHaveBeenCalledTimes(1);
    expect(logSetMock).toHaveBeenCalledWith(
      {
        sessionExerciseId: 'se-1',
        setType: 'drop',
        parentSetId: 'parent-1',
        side: null,
        weight: { value: null, unit: 'kg' },
        reps: 0,
        completed: false,
      },
      store.db,
    );
  });

  it('threads an optional side through to logSet unchanged', async () => {
    const store = inMemoryDb();
    store.seed(loggedSet, { id: 'parent-1', sessionExerciseId: 'se-1', parentSetId: null });
    logSetMock.mockResolvedValue('new-child-id');

    await addSubEntry({ sessionExerciseId: 'se-1', parentSetId: 'parent-1', setType: 'myorep', side: 'left' }, store.db);

    expect(logSetMock.mock.calls[0][0].side).toBe('left');
  });

  it('rejects a parentSetId whose row belongs to a different session_exercise, and never calls logSet', async () => {
    const store = inMemoryDb();
    store.seed(loggedSet, { id: 'parent-1', sessionExerciseId: 'se-other', parentSetId: null });

    await expect(
      addSubEntry({ sessionExerciseId: 'se-1', parentSetId: 'parent-1', setType: 'drop' }, store.db),
    ).rejects.toThrow();
    expect(logSetMock).not.toHaveBeenCalled();
  });

  it('rejects a parentSetId that does not exist at all, and never calls logSet', async () => {
    const store = inMemoryDb();

    await expect(
      addSubEntry({ sessionExerciseId: 'se-1', parentSetId: 'missing-id', setType: 'drop' }, store.db),
    ).rejects.toThrow();
    expect(logSetMock).not.toHaveBeenCalled();
  });
});
