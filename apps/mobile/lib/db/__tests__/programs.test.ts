import { eq, isNull } from 'drizzle-orm';
import { createRoutine, loadRoutines } from '../programs/create-routine';
import {
  addDay,
  addExercisesToDay,
  moveDay,
  moveExercise,
  removeDay,
  removeExercise,
  renameDay,
} from '../programs/days';
import { getPowerSync } from '../powersync';
import { generateClientId } from '../id';
import { routine, routineDay, routineExercise } from '../schema';

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
    const db = { select: selectSpy } as unknown as ReturnType<typeof getPowerSync>;

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
    } as unknown as ReturnType<typeof getPowerSync>;

    const id = await addDay({ routineId: 'r1', name: 'Push' }, db);

    expect(id).toBe('fixed-id');
    expect(insertedValuesSpy).toHaveBeenCalledWith({
      id: 'fixed-id',
      routineId: 'r1',
      orderIndex: 3072,
      name: 'Push',
      isRestDay: false,
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
      } as unknown as ReturnType<typeof getPowerSync>;

      await removeDay('d1', db);

      expect(getPowerSyncMock).not.toHaveBeenCalled();
    });

    it('falls back to getPowerSync() when no database argument is passed', async () => {
      const db = {
        delete: () => ({ where: () => Promise.resolve() }),
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
    } as unknown as ReturnType<typeof getPowerSync>;

    await renameDay('d1', '  Pull  ', db);

    expect(updateSetSpy).toHaveBeenCalledWith({ name: 'Pull' });
    await expect(renameDay('d1', '   ', db)).rejects.toThrow('Day name is required');
  });
});
