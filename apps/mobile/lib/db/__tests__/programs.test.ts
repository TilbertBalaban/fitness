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
import { loadProgramTree } from '../programs/load-program';
import { getPowerSync } from '../powersync';
import { generateClientId } from '../id';
import { routine, routineCycle, routineDay, routineExercise, routineExerciseCycleTarget } from '../schema';

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
  } as unknown as ReturnType<typeof getPowerSync>;
  return { db, getSelectCount: () => selectCount };
}

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
});
