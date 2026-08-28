import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { createRoutine, loadRoutines } from '../programs/create-routine';
import {
  addDay,
  archiveDay,
  addExercisesToDay,
  loadArchivedDays,
  moveDay,
  moveExercise,
  removeDay,
  removeExercise,
  renameDay,
  restoreDay,
} from '../programs/days';
import { loadProgramTree } from '../programs/load-program';
import { getPowerSync } from '../powersync';
import { generateClientId } from '../id';
import { routine, routineCycle, routineDay, routineExercise, routineExerciseCycleTarget } from '../schema';

// WR-10: the multi-row helpers now wrap their writes in db.transaction. The fake's transaction
// handle IS the fake — the shipped helpers call tx.insert/tx.update, and handing them a separate
// object would hide those calls from the recorders below. `this` resolves to the fake because the
// helpers always call it as db.transaction(...).
let transactionCount = 0;

beforeEach(() => {
  transactionCount = 0;
});

async function runInFakeTransaction(this: unknown, run: (tx: unknown) => Promise<unknown>) {
  transactionCount += 1;
  return run(this);
}


jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../id', () => ({ generateClientId: jest.fn(() => 'fixed-id') }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;
const generateClientIdMock = generateClientId as jest.MockedFunction<typeof generateClientId>;

function fakeInsertDb(insertedValuesSpy: jest.Mock) {
  return {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        insertedValuesSpy(values);
        return Promise.resolve();
      },
    }),
    transaction: runInFakeTransaction,
  } as unknown as ReturnType<typeof getPowerSync>;
}

describe('createRoutine', () => {
  it('inserts a draft routine with the trimmed name, a fresh client id, and the fixed defaults', async () => {
    const insertedValuesSpy = jest.fn();
    getPowerSyncMock.mockReturnValue(fakeInsertDb(insertedValuesSpy));

    const id = await createRoutine({ name: 'Push Pull Legs' });

    expect(insertedValuesSpy).toHaveBeenCalledTimes(1);
    expect(insertedValuesSpy.mock.calls[0][0]).toEqual({
      id: 'fixed-id',
      name: 'Push Pull Legs',
      goal: null,
      status: 'draft',
      progressionFrozen: false,
      source: 'user',
      createdFromTemplateId: null,
      archivedAt: null,
    });
    expect(id).toBe('fixed-id');
  });

  it('trims the name once at the write boundary', async () => {
    const insertedValuesSpy = jest.fn();
    getPowerSyncMock.mockReturnValue(fakeInsertDb(insertedValuesSpy));

    await createRoutine({ name: '  Legs  ' });

    expect(insertedValuesSpy.mock.calls[0][0].name).toBe('Legs');
  });

  it('rejects a blank name with a thrown error and writes nothing', async () => {
    const insertedValuesSpy = jest.fn();
    getPowerSyncMock.mockReturnValue(fakeInsertDb(insertedValuesSpy));

    await expect(createRoutine({ name: '' })).rejects.toThrow('Program name is required');
    await expect(createRoutine({ name: '   ' })).rejects.toThrow('Program name is required');
    expect(insertedValuesSpy).not.toHaveBeenCalled();
  });

  describe('the database-injection seam (WINDOWS #23)', () => {
    it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
      getPowerSyncMock.mockClear();
      const insertedValuesSpy = jest.fn();
      const explicitDb = fakeInsertDb(insertedValuesSpy);

      await createRoutine({ name: 'X' }, explicitDb);

      expect(insertedValuesSpy).toHaveBeenCalledTimes(1);
      expect(getPowerSyncMock).not.toHaveBeenCalled();
    });

    it('falls back to getPowerSync() when no database argument is passed', async () => {
      const insertedValuesSpy = jest.fn();
      getPowerSyncMock.mockReturnValue(fakeInsertDb(insertedValuesSpy));

      await createRoutine({ name: 'X' });

      expect(insertedValuesSpy).toHaveBeenCalledTimes(1);
      expect(getPowerSyncMock).toHaveBeenCalled();
    });
  });
});

describe('loadRoutines', () => {
  it('issues exactly one select, filtered to non-archived rows, sorted by name then id', async () => {
    const rows = [
      { id: 'b-id', name: 'Legs', status: 'draft', goal: null },
      { id: 'a-id', name: 'Legs', status: 'ready', goal: null },
      { id: 'z-id', name: 'Arms', status: 'draft', goal: null },
    ];
    const whereSpy = jest.fn();
    const fromSpy = jest.fn(() => ({
      where: (condition: unknown) => {
        whereSpy(condition);
        return Promise.resolve(rows);
      },
    }));
    const selectSpy = jest.fn(() => ({ from: fromSpy }));
    const db = { select: selectSpy, transaction: runInFakeTransaction } as unknown as ReturnType<typeof getPowerSync>;

    const result = await loadRoutines(db);

    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(whereSpy).toHaveBeenCalledWith(isNull(routine.archivedAt));
    expect(result.map((row) => row.id)).toEqual(['z-id', 'a-id', 'b-id']);
  });
});

function fakeSelectDb(rows: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(rows),
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve(),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve(),
    }),
    transaction: runInFakeTransaction,
  } as unknown as ReturnType<typeof getPowerSync>;
}

describe('addDay', () => {
  beforeEach(() => generateClientIdMock.mockReturnValue('fixed-id'));

  it('inserts one row with a fresh id, the given routineId, isRestDay false, and orderIndex appended past the existing max', async () => {
    const insertedValuesSpy = jest.fn();
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ orderIndex: 1024 }, { orderIndex: 2048 }]),
        }),
      }),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          insertedValuesSpy(values);
          return Promise.resolve();
        },
      }),
      transaction: runInFakeTransaction,
    } as unknown as ReturnType<typeof getPowerSync>;

    const id = await addDay({ routineId: 'r1', name: 'Push' }, db);

    expect(id).toBe('fixed-id');
    expect(insertedValuesSpy).toHaveBeenCalledWith({
      id: 'fixed-id',
      routineId: 'r1',
      orderIndex: 3072,
      name: 'Push',
      isRestDay: false,
      archivedAt: null,
    });
  });

  it('throws on a blank name and inserts nothing', async () => {
    const insertedValuesSpy = jest.fn();
    const db = {
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          insertedValuesSpy(values);
          return Promise.resolve();
        },
      }),
      transaction: runInFakeTransaction,
    } as unknown as ReturnType<typeof getPowerSync>;

    await expect(addDay({ routineId: 'r1', name: '' }, db)).rejects.toThrow('Day name is required');
    await expect(addDay({ routineId: 'r1', name: '   ' }, db)).rejects.toThrow('Day name is required');
    expect(insertedValuesSpy).not.toHaveBeenCalled();
  });

  describe('the database-injection seam (WINDOWS #23)', () => {
    it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
      getPowerSyncMock.mockClear();
      const db = fakeSelectDb([]);

      await addDay({ routineId: 'r1', name: 'Push' }, db);

      expect(getPowerSyncMock).not.toHaveBeenCalled();
    });

    it('falls back to getPowerSync() when no database argument is passed', async () => {
      getPowerSyncMock.mockReturnValue(fakeSelectDb([]));

      await addDay({ routineId: 'r1', name: 'Push' });

      expect(getPowerSyncMock).toHaveBeenCalled();
    });
  });
});

function fakeArchiveDb() {
  const updateSetSpy = jest.fn();
  const deleteSpy = jest.fn();
  const insertSpy = jest.fn();
  const db = {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updateSetSpy(values);
        return { where: () => Promise.resolve() };
      },
    }),
    delete: () => {
      deleteSpy();
      return { where: () => Promise.resolve() };
    },
    insert: () => {
      insertSpy();
      return { values: () => Promise.resolve() };
    },
    transaction: runInFakeTransaction,
  } as unknown as ReturnType<typeof getPowerSync>;
  return { db, updateSetSpy, deleteSpy, insertSpy };
}

describe('archiveDay', () => {
  it('issues exactly one update writing only archivedAt as an ISO string, and issues zero deletes', async () => {
    const { db, updateSetSpy, deleteSpy } = fakeArchiveDb();

    await archiveDay('d1', db);

    expect(updateSetSpy).toHaveBeenCalledTimes(1);
    const values = updateSetSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(values)).toEqual(['archivedAt']);
    expect(typeof values.archivedAt).toBe('string');
    expect(Number.isNaN(Date.parse(values.archivedAt as string))).toBe(false);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('writes neither name, nor orderIndex, nor isRestDay', async () => {
    const { db, updateSetSpy } = fakeArchiveDb();

    await archiveDay('d1', db);

    const values = updateSetSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(values.name).toBeUndefined();
    expect(values.orderIndex).toBeUndefined();
    expect(values.isRestDay).toBeUndefined();
  });

  describe('the database-injection seam (WINDOWS #23)', () => {
    it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
      getPowerSyncMock.mockClear();
      const { db } = fakeArchiveDb();

      await archiveDay('d1', db);

      expect(getPowerSyncMock).not.toHaveBeenCalled();
    });

    it('falls back to getPowerSync() when no database argument is passed', async () => {
      const { db } = fakeArchiveDb();
      getPowerSyncMock.mockReturnValue(db);

      await archiveDay('d1');

      expect(getPowerSyncMock).toHaveBeenCalled();
    });
  });
});

describe('restoreDay', () => {
  it('issues exactly one update setting archivedAt to null and issues zero deletes and zero inserts', async () => {
    const { db, updateSetSpy, deleteSpy, insertSpy } = fakeArchiveDb();

    await restoreDay('d1', db);

    expect(updateSetSpy).toHaveBeenCalledTimes(1);
    expect(updateSetSpy).toHaveBeenCalledWith({ archivedAt: null });
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  describe('the database-injection seam (WINDOWS #23)', () => {
    it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
      getPowerSyncMock.mockClear();
      const { db } = fakeArchiveDb();

      await restoreDay('d1', db);

      expect(getPowerSyncMock).not.toHaveBeenCalled();
    });

    it('falls back to getPowerSync() when no database argument is passed', async () => {
      const { db } = fakeArchiveDb();
      getPowerSyncMock.mockReturnValue(db);

      await restoreDay('d1');

      expect(getPowerSyncMock).toHaveBeenCalled();
    });
  });
});

describe('loadArchivedDays', () => {
  it('returns only the routine\'s days whose archivedAt is non-null, ordered by order then id, filtering at the SQL level', async () => {
    const whereSpy = jest.fn();
    const rows = [
      { id: 'd2', name: 'Pull', orderIndex: 2048, archivedAt: '2026-01-02T00:00:00.000Z' },
      { id: 'd1', name: 'Push', orderIndex: 1024, archivedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const db = {
      select: () => ({
        from: () => ({
          where: (condition: unknown) => {
            whereSpy(condition);
            return Promise.resolve(rows);
          },
        }),
      }),
      transaction: runInFakeTransaction,
    } as unknown as ReturnType<typeof getPowerSync>;

    const result = await loadArchivedDays('r1', db);

    expect(whereSpy).toHaveBeenCalledWith(and(eq(routineDay.routineId, 'r1'), isNotNull(routineDay.archivedAt)));
    expect(result.map((row) => row.id)).toEqual(['d1', 'd2']);
  });

  it('returns an empty array for a routine with no archived days', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
      transaction: runInFakeTransaction,
    } as unknown as ReturnType<typeof getPowerSync>;

    const result = await loadArchivedDays('r1', db);

    expect(result).toEqual([]);
  });
});

describe('addExercisesToDay', () => {
  it('inserts exactly two rows, GAP apart, in the given order, each with all five target_* fields null', async () => {
    generateClientIdMock.mockReturnValueOnce('ex-1').mockReturnValueOnce('ex-2');
    const insertedValuesSpy = jest.fn();
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          insertedValuesSpy(values);
          return Promise.resolve();
        },
      }),
      transaction: runInFakeTransaction,
    } as unknown as ReturnType<typeof getPowerSync>;

    const ids = await addExercisesToDay({ routineDayId: 'd1', exerciseIds: ['e1', 'e2'] }, db);

    expect(ids).toEqual(['ex-1', 'ex-2']);
    expect(insertedValuesSpy).toHaveBeenCalledTimes(2);
    expect(insertedValuesSpy.mock.calls[0][0]).toEqual({
      id: 'ex-1',
      routineDayId: 'd1',
      exerciseId: 'e1',
      orderIndex: 1024,
      supersetGroupId: null,
      targetSets: null,
      targetRepMin: null,
      targetRepMax: null,
      targetRir: null,
      targetRestSeconds: null,
      progressionSchemeId: null,
      notes: null,
    });
    expect(insertedValuesSpy.mock.calls[1][0]).toMatchObject({
      id: 'ex-2',
      exerciseId: 'e2',
      orderIndex: 2048,
    });
  });

  it('inserts two rows with distinct ids and distinct orderIndex values for the same exercise twice — never deduplicated', async () => {
    generateClientIdMock.mockReturnValueOnce('dup-1').mockReturnValueOnce('dup-2');
    const insertedValuesSpy = jest.fn();
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          insertedValuesSpy(values);
          return Promise.resolve();
        },
      }),
      transaction: runInFakeTransaction,
    } as unknown as ReturnType<typeof getPowerSync>;

    await addExercisesToDay({ routineDayId: 'd1', exerciseIds: ['e1', 'e1'] }, db);

    expect(insertedValuesSpy).toHaveBeenCalledTimes(2);
    const [first, second] = insertedValuesSpy.mock.calls.map((call) => call[0] as Record<string, unknown>);
    expect(first.id).not.toBe(second.id);
    expect(first.orderIndex).not.toBe(second.orderIndex);
  });

  it('inserts nothing and resolves without throwing for an empty id list', async () => {
    const insertedValuesSpy = jest.fn();
    const db = {
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          insertedValuesSpy(values);
          return Promise.resolve();
        },
      }),
      transaction: runInFakeTransaction,
    } as unknown as ReturnType<typeof getPowerSync>;

    const ids = await addExercisesToDay({ routineDayId: 'd1', exerciseIds: [] }, db);

    expect(ids).toEqual([]);
    expect(insertedValuesSpy).not.toHaveBeenCalled();
  });

  describe('the database-injection seam (WINDOWS #23)', () => {
    it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
      getPowerSyncMock.mockClear();
      generateClientIdMock.mockReturnValue('fixed-id');
      const db = fakeSelectDb([]);

      await addExercisesToDay({ routineDayId: 'd1', exerciseIds: ['e1'] }, db);

      expect(getPowerSyncMock).not.toHaveBeenCalled();
    });

    it('falls back to getPowerSync() when no database argument is passed', async () => {
      generateClientIdMock.mockReturnValue('fixed-id');
      getPowerSyncMock.mockReturnValue(fakeSelectDb([]));

      await addExercisesToDay({ routineDayId: 'd1', exerciseIds: ['e1'] });

      expect(getPowerSyncMock).toHaveBeenCalled();
    });
  });
});

function fakeReorderDb(siblingRows: { id: string; orderIndex: number }[]) {
  const updateCalls: { values: Record<string, unknown>; condition: unknown }[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(siblingRows),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: unknown) => {
          updateCalls.push({ values, condition });
          return Promise.resolve();
        },
      }),
    }),
    transaction: runInFakeTransaction,
  } as unknown as ReturnType<typeof getPowerSync>;
  return { db, updateCalls };
}

describe('moveExercise', () => {
  it('issues exactly one update, for the moved row only, when a gap slot is available between the anchors', async () => {
    const siblings = [
      { id: 'b', orderIndex: 1024 },
      { id: 'c', orderIndex: 2048 },
      { id: 'x', orderIndex: 5000 },
    ];
    const { db, updateCalls } = fakeReorderDb(siblings);

    await moveExercise({ routineDayId: 'd1', exerciseId: 'x', beforeId: 'b', afterId: 'c' }, db);

    expect(updateCalls).toEqual([{ values: { orderIndex: 1536 }, condition: eq(routineExercise.id, 'x') }]);
  });

  it('renumbers only the siblings whose index actually changed when the anchors are adjacent integers, and x ends up between b and c', async () => {
    const siblings = [
      { id: 'a', orderIndex: 1024 },
      { id: 'b', orderIndex: 2048 },
      { id: 'c', orderIndex: 2049 },
      { id: 'x', orderIndex: 4096 },
    ];
    const { db, updateCalls } = fakeReorderDb(siblings);

    await moveExercise({ routineDayId: 'd1', exerciseId: 'x', beforeId: 'b', afterId: 'c' }, db);

    // Renumbered order is [a, b, x, c] -> a:1024 (unchanged), b:2048 (unchanged), x:3072, c:4096 —
    // only x and c actually moved, and x (3072) now sits between b (2048) and c (4096).
    expect(updateCalls).toEqual([
      { values: { orderIndex: 3072 }, condition: eq(routineExercise.id, 'x') },
      { values: { orderIndex: 4096 }, condition: eq(routineExercise.id, 'c') },
    ]);
  });

  describe('the database-injection seam (WINDOWS #23)', () => {
    it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
      getPowerSyncMock.mockClear();
      const { db } = fakeReorderDb([
        { id: 'b', orderIndex: 1024 },
        { id: 'c', orderIndex: 2048 },
        { id: 'x', orderIndex: 5000 },
      ]);

      await moveExercise({ routineDayId: 'd1', exerciseId: 'x', beforeId: 'b', afterId: 'c' }, db);

      expect(getPowerSyncMock).not.toHaveBeenCalled();
    });

    it('falls back to getPowerSync() when no database argument is passed', async () => {
      const { db } = fakeReorderDb([
        { id: 'b', orderIndex: 1024 },
        { id: 'c', orderIndex: 2048 },
        { id: 'x', orderIndex: 5000 },
      ]);
      getPowerSyncMock.mockReturnValue(db);

      await moveExercise({ routineDayId: 'd1', exerciseId: 'x', beforeId: 'b', afterId: 'c' });

      expect(getPowerSyncMock).toHaveBeenCalled();
    });
  });
});

describe('moveDay', () => {
  it('issues exactly one update, for the moved day only, when a gap slot is available', async () => {
    const siblings = [
      { id: 'd2', orderIndex: 1024 },
      { id: 'd3', orderIndex: 2048 },
      { id: 'd1', orderIndex: 5000 },
    ];
    const { db, updateCalls } = fakeReorderDb(siblings);

    await moveDay({ routineId: 'r1', dayId: 'd1', beforeId: 'd2', afterId: 'd3' }, db);

    expect(updateCalls).toEqual([{ values: { orderIndex: 1536 }, condition: eq(routineDay.id, 'd1') }]);
  });

  it('over a routine containing an archived day still computes a single midpoint for a move between two live neighbours — the archived row keeps its order_index and does not force a renumber', async () => {
    const siblings = [
      { id: 'd2', orderIndex: 1024 },
      { id: 'archived-d', orderIndex: 9999 },
      { id: 'd3', orderIndex: 2048 },
      { id: 'd1', orderIndex: 5000 },
    ];
    const { db, updateCalls } = fakeReorderDb(siblings);

    await moveDay({ routineId: 'r1', dayId: 'd1', beforeId: 'd2', afterId: 'd3' }, db);

    expect(updateCalls).toEqual([{ values: { orderIndex: 1536 }, condition: eq(routineDay.id, 'd1') }]);
  });
});

describe('removeExercise', () => {
  it('issues exactly one delete for the given routine_exercise id', async () => {
    const deleteWhereSpy = jest.fn();
    const db = {
      delete: () => ({
        where: (condition: unknown) => {
          deleteWhereSpy(condition);
          return Promise.resolve();
        },
      }),
      transaction: runInFakeTransaction,
    } as unknown as ReturnType<typeof getPowerSync>;

    await removeExercise('x', db);

    expect(deleteWhereSpy).toHaveBeenCalledTimes(1);
    expect(deleteWhereSpy).toHaveBeenCalledWith(eq(routineExercise.id, 'x'));
  });
});

describe('removeDay', () => {
  it('issues exactly one delete for the day and never also deletes its exercises row by row', async () => {
    const deleteSpy = jest.fn();
    const deleteWhereSpy = jest.fn();
    const db = {
      delete: (table: unknown) => {
        deleteSpy(table);
        return {
          where: (condition: unknown) => {
            deleteWhereSpy(condition);
            return Promise.resolve();
          },
        };
      },
      transaction: runInFakeTransaction,
    } as unknown as ReturnType<typeof getPowerSync>;

    await removeDay('d1', db);

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith(routineDay);
    expect(deleteWhereSpy).toHaveBeenCalledWith(eq(routineDay.id, 'd1'));
  });

  describe('the database-injection seam (WINDOWS #23)', () => {
    it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
      getPowerSyncMock.mockClear();
      const db = {
        delete: () => ({ where: () => Promise.resolve() }),
        transaction: runInFakeTransaction,
      } as unknown as ReturnType<typeof getPowerSync>;

      await removeDay('d1', db);

      expect(getPowerSyncMock).not.toHaveBeenCalled();
    });

    it('falls back to getPowerSync() when no database argument is passed', async () => {
      const db = {
        delete: () => ({ where: () => Promise.resolve() }),
        transaction: runInFakeTransaction,
      } as unknown as ReturnType<typeof getPowerSync>;
      getPowerSyncMock.mockReturnValue(db);

      await removeDay('d1');

      expect(getPowerSyncMock).toHaveBeenCalled();
    });
  });
});

describe('renameDay', () => {
  it('trims the name, requires it non-empty, and issues one update', async () => {
    const updateSetSpy = jest.fn();
    const db = {
      update: () => ({
        set: (values: Record<string, unknown>) => {
          updateSetSpy(values);
          return { where: () => Promise.resolve() };
        },
      }),
      transaction: runInFakeTransaction,
    } as unknown as ReturnType<typeof getPowerSync>;

    await renameDay('d1', '  Pull  ', db);

    expect(updateSetSpy).toHaveBeenCalledWith({ name: 'Pull' });
    await expect(renameDay('d1', '   ', db)).rejects.toThrow('Day name is required');
  });
});

interface FakeLoadProgramRows {
  routineRow?: Record<string, unknown>;
  dayRows: Record<string, unknown>[];
  exerciseRows: Record<string, unknown>[];
  cycleRows?: Record<string, unknown>[];
  overrideRows?: Record<string, unknown>[];
}

function fakeLoadProgramDb(rows: FakeLoadProgramRows) {
  let selectCount = 0;
  const db = {
    select: () => {
      selectCount++;
      return {
        from: (table: unknown) => ({
          where: () => {
            if (table === routine) return Promise.resolve(rows.routineRow ? [rows.routineRow] : []);
            if (table === routineDay) return Promise.resolve(rows.dayRows);
            if (table === routineExercise) return Promise.resolve(rows.exerciseRows);
            if (table === routineCycle) return Promise.resolve(rows.cycleRows ?? []);
            if (table === routineExerciseCycleTarget) return Promise.resolve(rows.overrideRows ?? []);
            return Promise.resolve([]);
          },
        }),
      };
    },
    transaction: runInFakeTransaction,
  } as unknown as ReturnType<typeof getPowerSync>;
  return { db, getSelectCount: () => selectCount };
}

// Copied from log-set.test.ts, per that file's own duplication convention (set-groups.test.ts
// line 51) — each suite keeps its own copy rather than sharing a module. fakeLoadProgramDb's
// `where` takes no argument and returns its rows unconditionally, so it cannot prove a filter;
// this store walks drizzle's real query chunks and resolves rows against the actual conditions
// the shipped helpers pass.
type TableLike = Record<string, { name?: string } | undefined>;
type Row = Record<string, unknown>;

function propertyKeyForColumn(table: TableLike, columnName: string): string | undefined {
  return Object.entries(table).find(([, column]) => column?.name === columnName)?.[0];
}

// collectEqualities handles eq() only in log-set.test.ts's original form: an isNull() chunk
// carries an array `value` that the scalar branch skips, so an unextended walker matches every
// row. Extended here to recognise an is-null fragment: when a chunk carries an array `value`
// whose joined text is an is-null fragment and a column name is currently held, push
// { column, value: null } and clear the held column, exactly as the scalar branch does.
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
    if (part && 'value' in part && column !== null) {
      if (Array.isArray(part.value)) {
        const joined = part.value.join('');
        if (/is\s+null/i.test(joined)) {
          out.push({ column, value: null });
        }
        column = null;
        continue;
      }
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

interface FakeConditionRow {
  table: unknown;
  row: Row;
}

// A tiny in-memory table set that resolves every select's `where` against the row data, rather
// than returning a fixed fixture regardless of the condition passed. Used only for the
// archived-day filter assertions below, which need to prove deleting the filter turns the case
// red.
function conditionResolvingDb(seedRows: FakeConditionRow[]) {
  const db = {
    select: (projection: Record<string, { name?: string }>) => ({
      from: (table: TableLike) => ({
        where: (condition: unknown) => {
          const matched = seedRows.filter((seed) => seed.table === table && rowMatches(table, seed.row, condition));
          return Promise.resolve(
            matched.map(({ row }) => {
              const projected: Row = {};
              for (const [alias, column] of Object.entries(projection)) {
                const key = propertyKeyForColumn(table, column?.name ?? alias) ?? alias;
                projected[alias] = row[key] ?? null;
              }
              return projected;
            }),
          );
        },
      }),
    }),
    transaction: runInFakeTransaction,
  } as unknown as ReturnType<typeof getPowerSync>;
  return db;
}

describe('collectEqualities (isNull extension)', () => {
  it('collects { column: "archived_at", value: null } from an isNull(routineDay.archivedAt) condition', () => {
    const equalities: { column: string; value: unknown }[] = [];

    collectEqualities(isNull(routineDay.archivedAt), equalities);

    expect(equalities).toEqual([{ column: 'archived_at', value: null }]);
  });
});

describe('loadProgramTree', () => {
  it('issues exactly five selects — one per table — for a 3-day, 12-exercise, 4-cycle, 7-override routine', async () => {
    const routineRow = { id: 'r1', name: 'Push Pull Legs', goal: null, status: 'draft' };
    const dayRows = [
      { id: 'd1', orderIndex: 1024, name: 'Push', isRestDay: false },
      { id: 'd2', orderIndex: 2048, name: 'Pull', isRestDay: false },
      { id: 'd3', orderIndex: 3072, name: 'Legs', isRestDay: false },
    ];
    const exerciseRows = Array.from({ length: 12 }, (_, i) => ({
      id: `re-${i}`,
      routineDayId: dayRows[i % 3].id,
      orderIndex: (Math.floor(i / 3) + 1) * 1024,
      exerciseId: `ex-${i}`,
      targetSets: null,
      targetRepMin: null,
      targetRepMax: null,
      targetRir: null,
      targetRestSeconds: null,
    }));
    const nameMap = new Map(exerciseRows.map((row) => [row.exerciseId, `Exercise ${row.exerciseId}`]));

    const cycleRows = Array.from({ length: 4 }, (_, i) => ({
      id: `c-${i}`,
      name: `Week ${i + 1}`,
      kind: 'training',
      orderIndex: (i + 1) * 1024,
      durationDays: null,
    }));
    const overrideRows = Array.from({ length: 7 }, (_, i) => ({
      id: `ovr-${i}`,
      routineExerciseId: exerciseRows[i].id,
      cycleId: cycleRows[i % 4].id,
      targetSets: 5,
      targetRepMin: null,
      targetRepMax: null,
      targetRir: null,
      targetRestSeconds: null,
    }));

    const { db, getSelectCount } = fakeLoadProgramDb({ routineRow, dayRows, exerciseRows, cycleRows, overrideRows });

    const tree = await loadProgramTree('r1', db, nameMap);

    expect(getSelectCount()).toBe(5);
    expect(tree?.days).toHaveLength(3);
    expect(tree?.days.reduce((sum, day) => sum + day.slots.length, 0)).toBe(12);
    expect(tree?.cycles).toHaveLength(4);
  });

  it('sorts days and each day\'s slots with sortByOrderThenId', async () => {
    const routineRow = { id: 'r1', name: 'Program', goal: null, status: 'draft' };
    const dayRows = [
      { id: 'd2', orderIndex: 2048, name: 'Second', isRestDay: false },
      { id: 'd1', orderIndex: 1024, name: 'First', isRestDay: false },
    ];
    const exerciseRows = [
      { id: 're-b', routineDayId: 'd1', orderIndex: 2048, exerciseId: 'ex-b', targetSets: null, targetRepMin: null, targetRepMax: null, targetRir: null, targetRestSeconds: null },
      { id: 're-a', routineDayId: 'd1', orderIndex: 1024, exerciseId: 'ex-a', targetSets: null, targetRepMin: null, targetRepMax: null, targetRir: null, targetRestSeconds: null },
    ];
    const { db } = fakeLoadProgramDb({ routineRow, dayRows, exerciseRows });

    const tree = await loadProgramTree('r1', db, new Map());

    expect(tree?.days.map((day) => day.id)).toEqual(['d1', 'd2']);
    expect(tree?.days[0].slots.map((slot) => slot.id)).toEqual(['re-a', 're-b']);
  });

  it('breaks a tied day orderIndex to ascending id', async () => {
    const routineRow = { id: 'r1', name: 'Program', goal: null, status: 'draft' };
    const dayRows = [
      { id: 'd-z', orderIndex: 1024, name: 'Z', isRestDay: false },
      { id: 'd-a', orderIndex: 1024, name: 'A', isRestDay: false },
    ];
    const { db } = fakeLoadProgramDb({ routineRow, dayRows, exerciseRows: [] });

    const tree = await loadProgramTree('r1', db, new Map());

    expect(tree?.days.map((day) => day.id)).toEqual(['d-a', 'd-z']);
  });

  it('returns { ...routine, days: [] } for a routine with zero days, rather than throwing', async () => {
    const routineRow = { id: 'r1', name: 'Empty Program', goal: null, status: 'draft' };
    const { db } = fakeLoadProgramDb({ routineRow, dayRows: [], exerciseRows: [] });

    const tree = await loadProgramTree('r1', db, new Map());

    expect(tree).toEqual({ id: 'r1', name: 'Empty Program', goal: null, status: 'draft', days: [], cycles: [] });
  });

  it('returns null when no routine row matches', async () => {
    const { db } = fakeLoadProgramDb({ routineRow: undefined, dayRows: [], exerciseRows: [] });

    const tree = await loadProgramTree('missing', db, new Map());

    expect(tree).toBeNull();
  });

  it('each slot carries exerciseId, the resolved exerciseName, and the five raw target* values unchanged', async () => {
    const routineRow = { id: 'r1', name: 'Program', goal: null, status: 'draft' };
    const dayRows = [{ id: 'd1', orderIndex: 1024, name: 'Day 1', isRestDay: false }];
    const exerciseRows = [
      {
        id: 're-1',
        routineDayId: 'd1',
        orderIndex: 1024,
        exerciseId: 'ex-1',
        targetSets: 3,
        targetRepMin: 8,
        targetRepMax: 12,
        targetRir: 1,
        targetRestSeconds: 120,
      },
    ];
    const { db } = fakeLoadProgramDb({ routineRow, dayRows, exerciseRows });

    const tree = await loadProgramTree('r1', db, new Map([['ex-1', 'Barbell Squat']]));

    expect(tree?.days[0].slots[0]).toEqual({
      id: 're-1',
      orderIndex: 1024,
      exerciseId: 'ex-1',
      exerciseName: 'Barbell Squat',
      targetSets: 3,
      targetRepMin: 8,
      targetRepMax: 12,
      targetRir: 1,
      targetRestSeconds: 120,
      overridesByCycleId: {},
    });
  });

  it('sorts cycles with sortByOrderThenId, breaking a tied orderIndex to ascending id', async () => {
    const routineRow = { id: 'r1', name: 'Program', goal: null, status: 'draft' };
    const cycleRows = [
      { id: 'c-z', name: 'Z', kind: 'training', orderIndex: 1024, durationDays: null },
      { id: 'c-a', name: 'A', kind: 'training', orderIndex: 1024, durationDays: null },
      { id: 'c-first', name: 'Deload', kind: 'deload', orderIndex: 512, durationDays: null },
    ];
    const { db } = fakeLoadProgramDb({ routineRow, dayRows: [], exerciseRows: [], cycleRows });

    const tree = await loadProgramTree('r1', db, new Map());

    expect(tree?.cycles.map((cycle) => cycle.id)).toEqual(['c-first', 'c-a', 'c-z']);
    expect(tree?.cycles[0].kind).toBe('deload');
  });

  it("carries each slot's overrides as a map keyed by cycle id, holding only the cycles that actually override it", async () => {
    const routineRow = { id: 'r1', name: 'Program', goal: null, status: 'draft' };
    const dayRows = [{ id: 'd1', orderIndex: 1024, name: 'Day 1', isRestDay: false }];
    const exerciseRows = [
      { id: 're-1', routineDayId: 'd1', orderIndex: 1024, exerciseId: 'ex-1', targetSets: 3, targetRepMin: 8, targetRepMax: 10, targetRir: 2, targetRestSeconds: 90 },
      { id: 're-2', routineDayId: 'd1', orderIndex: 2048, exerciseId: 'ex-2', targetSets: 3, targetRepMin: 8, targetRepMax: 10, targetRir: 2, targetRestSeconds: 90 },
    ];
    const cycleRows = [
      { id: 'c1', name: 'Week 1', kind: 'training', orderIndex: 1024, durationDays: null },
      { id: 'c2', name: 'Week 2', kind: 'training', orderIndex: 2048, durationDays: null },
    ];
    const overrideRows = [
      { id: 'ovr-1', routineExerciseId: 're-1', cycleId: 'c2', targetSets: 5, targetRepMin: null, targetRepMax: null, targetRir: null, targetRestSeconds: null },
    ];
    const { db } = fakeLoadProgramDb({ routineRow, dayRows, exerciseRows, cycleRows, overrideRows });

    const tree = await loadProgramTree('r1', db, new Map());

    expect(tree?.days[0].slots[0].overridesByCycleId).toEqual({
      c2: { targetSets: 5, targetRepMin: null, targetRepMax: null, targetRir: null, targetRestSeconds: null },
    });
    expect(tree?.days[0].slots[1].overridesByCycleId).toEqual({});
  });

  it('drops an override naming a cycle that no longer exists rather than producing an unreachable entry', async () => {
    const routineRow = { id: 'r1', name: 'Program', goal: null, status: 'draft' };
    const dayRows = [{ id: 'd1', orderIndex: 1024, name: 'Day 1', isRestDay: false }];
    const exerciseRows = [
      { id: 're-1', routineDayId: 'd1', orderIndex: 1024, exerciseId: 'ex-1', targetSets: 3, targetRepMin: null, targetRepMax: null, targetRir: null, targetRestSeconds: null },
    ];
    const cycleRows = [{ id: 'c1', name: 'Week 1', kind: 'training', orderIndex: 1024, durationDays: null }];
    const overrideRows = [
      { id: 'ovr-1', routineExerciseId: 're-1', cycleId: 'deleted-cycle', targetSets: 5, targetRepMin: null, targetRepMax: null, targetRir: null, targetRestSeconds: null },
    ];
    const { db } = fakeLoadProgramDb({ routineRow, dayRows, exerciseRows, cycleRows, overrideRows });

    const tree = await loadProgramTree('r1', db, new Map());

    expect(tree?.days[0].slots[0].overridesByCycleId).toEqual({});
  });

  it('returns cycles: [] and an empty override map per slot for a routine with zero cycles', async () => {
    const routineRow = { id: 'r1', name: 'Program', goal: null, status: 'draft' };
    const dayRows = [{ id: 'd1', orderIndex: 1024, name: 'Day 1', isRestDay: false }];
    const exerciseRows = [
      { id: 're-1', routineDayId: 'd1', orderIndex: 1024, exerciseId: 'ex-1', targetSets: null, targetRepMin: null, targetRepMax: null, targetRir: null, targetRestSeconds: null },
    ];
    const { db } = fakeLoadProgramDb({ routineRow, dayRows, exerciseRows, cycleRows: [], overrideRows: [] });

    const tree = await loadProgramTree('r1', db, new Map());

    expect(tree?.cycles).toEqual([]);
    expect(tree?.days[0].slots[0].overridesByCycleId).toEqual({});
  });

  it("falls back to 'Unknown exercise' when a slot's exerciseId matches no local exercise row", async () => {
    const routineRow = { id: 'r1', name: 'Program', goal: null, status: 'draft' };
    const dayRows = [{ id: 'd1', orderIndex: 1024, name: 'Day 1', isRestDay: false }];
    const exerciseRows = [
      {
        id: 're-1',
        routineDayId: 'd1',
        orderIndex: 1024,
        exerciseId: 'gone',
        targetSets: null,
        targetRepMin: null,
        targetRepMax: null,
        targetRir: null,
        targetRestSeconds: null,
      },
    ];
    const { db } = fakeLoadProgramDb({ routineRow, dayRows, exerciseRows });

    const tree = await loadProgramTree('r1', db, new Map());

    expect(tree?.days[0].slots[0].exerciseName).toBe('Unknown exercise');
  });

  // Runs against conditionResolvingDb, not fakeLoadProgramDb — deleting isNull(routineDay.archivedAt)
  // from load-program.ts must turn these red, which fakeLoadProgramDb's unconditional `where` cannot
  // prove (D-29/D-33).
  describe('filters archived days at the SQL level', () => {
    it('returns two days and the archived one is absent from tree.days, given three days one of which carries archivedAt', async () => {
      const db = conditionResolvingDb([
        { table: routine, row: { id: 'r1', name: 'Program', goal: null, status: 'draft' } },
        { table: routineDay, row: { id: 'd1', routineId: 'r1', orderIndex: 1024, name: 'Day 1', isRestDay: false, archivedAt: null } },
        { table: routineDay, row: { id: 'd-archived', routineId: 'r1', orderIndex: 1536, name: 'Retired Day', isRestDay: false, archivedAt: '2026-01-01T00:00:00.000Z' } },
        { table: routineDay, row: { id: 'd2', routineId: 'r1', orderIndex: 2048, name: 'Day 2', isRestDay: false, archivedAt: null } },
      ]);

      const tree = await loadProgramTree('r1', db, new Map());

      expect(tree?.days.map((day) => day.id)).toEqual(['d1', 'd2']);
    });

    it("still returns the archived day's live siblings in their original relative order — filtering a day does not renumber or reorder the rest", async () => {
      const db = conditionResolvingDb([
        { table: routine, row: { id: 'r1', name: 'Program', goal: null, status: 'draft' } },
        { table: routineDay, row: { id: 'd1', routineId: 'r1', orderIndex: 1024, name: 'Day 1', isRestDay: false, archivedAt: null } },
        { table: routineDay, row: { id: 'd-archived', routineId: 'r1', orderIndex: 1536, name: 'Retired Day', isRestDay: false, archivedAt: '2026-01-01T00:00:00.000Z' } },
        { table: routineDay, row: { id: 'd2', routineId: 'r1', orderIndex: 2048, name: 'Day 2', isRestDay: false, archivedAt: null } },
      ]);

      const tree = await loadProgramTree('r1', db, new Map());

      expect(tree?.days.map((day) => day.orderIndex)).toEqual([1024, 2048]);
    });

    it('does not surface a routine_exercise belonging to an archived day anywhere in the returned tree, because its parent day is gone from the day list', async () => {
      const db = conditionResolvingDb([
        { table: routine, row: { id: 'r1', name: 'Program', goal: null, status: 'draft' } },
        { table: routineDay, row: { id: 'd1', routineId: 'r1', orderIndex: 1024, name: 'Day 1', isRestDay: false, archivedAt: null } },
        { table: routineDay, row: { id: 'd-archived', routineId: 'r1', orderIndex: 2048, name: 'Retired Day', isRestDay: false, archivedAt: '2026-01-01T00:00:00.000Z' } },
        {
          table: routineExercise,
          row: {
            id: 're-orphaned',
            routineDayId: 'd-archived',
            orderIndex: 1024,
            exerciseId: 'ex-1',
            targetSets: null,
            targetRepMin: null,
            targetRepMax: null,
            targetRir: null,
            targetRestSeconds: null,
          },
        },
      ]);

      const tree = await loadProgramTree('r1', db, new Map());

      const allSlotIds = tree?.days.flatMap((day) => day.slots.map((slot) => slot.id)) ?? [];
      expect(allSlotIds).not.toContain('re-orphaned');
      expect(tree?.days.map((day) => day.id)).toEqual(['d1']);
    });

    it('returns a tree with zero days, not null, for a routine whose days are all archived', async () => {
      const db = conditionResolvingDb([
        { table: routine, row: { id: 'r1', name: 'All Archived', goal: null, status: 'draft' } },
        { table: routineDay, row: { id: 'd1', routineId: 'r1', orderIndex: 1024, name: 'Day 1', isRestDay: false, archivedAt: '2026-01-01T00:00:00.000Z' } },
        { table: routineDay, row: { id: 'd2', routineId: 'r1', orderIndex: 2048, name: 'Day 2', isRestDay: false, archivedAt: '2026-01-02T00:00:00.000Z' } },
      ]);

      const tree = await loadProgramTree('r1', db, new Map());

      expect(tree).not.toBeNull();
      expect(tree?.days).toEqual([]);
    });
  });
});

// WR-10: the renumber branch emits one update per sibling and the multi-select emits one insert per
// exercise, each as an independent await. Interrupted, a renumber leaves duplicate order_index
// values that sortByOrderThenId still renders stably — so the list is not the one the user dragged
// to and nothing looks wrong.
describe('multi-row writes are one unit (WR-10)', () => {
  it('renumbers inside exactly one transaction', async () => {
    const { db, updateCalls } = fakeReorderDb([
      { id: 'a', orderIndex: 1 },
      { id: 'b', orderIndex: 2 },
      { id: 'c', orderIndex: 3 },
      { id: 'x', orderIndex: 4 },
    ]);

    await moveExercise({ routineDayId: 'd1', exerciseId: 'x', beforeId: 'a', afterId: 'b' }, db);

    expect(transactionCount).toBe(1);
    expect(updateCalls.length).toBeGreaterThan(1);
  });

  it('still opens one transaction for the single-update gap case', async () => {
    const { db, updateCalls } = fakeReorderDb([
      { id: 'a', orderIndex: 1024 },
      { id: 'b', orderIndex: 2048 },
      { id: 'x', orderIndex: 3072 },
    ]);

    await moveExercise({ routineDayId: 'd1', exerciseId: 'x', beforeId: 'a', afterId: 'b' }, db);

    expect(transactionCount).toBe(1);
    expect(updateCalls).toHaveLength(1);
  });

  it('adds a multi-exercise selection inside exactly one transaction', async () => {
    generateClientIdMock.mockReturnValueOnce('ex-1').mockReturnValueOnce('ex-2').mockReturnValueOnce('ex-3');
    const db = fakeSelectDb([]);

    await addExercisesToDay({ routineDayId: 'd1', exerciseIds: ['e1', 'e2', 'e3'] }, db);

    expect(transactionCount).toBe(1);
  });

  it('opens no transaction for an empty selection', async () => {
    const db = fakeSelectDb([]);

    await addExercisesToDay({ routineDayId: 'd1', exerciseIds: [] }, db);

    expect(transactionCount).toBe(0);
  });
});

