import { eq } from 'drizzle-orm';
import {
  addCycle,
  clearCycleTarget,
  cycleErrorMessage,
  moveCycle,
  removeCycle,
  setCycleTarget,
  updateCycle,
  validateCycle,
  type CycleValidationError,
} from '../programs/cycles';
import { ORDER_INDEX_GAP } from '../programs/order-index';
import { getPowerSync } from '../powersync';
import { generateClientId } from '../id';
import { routineCycle, routineExerciseCycleTarget } from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../id', () => ({ generateClientId: jest.fn(() => 'fixed-id') }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;
const generateClientIdMock = generateClientId as jest.MockedFunction<typeof generateClientId>;

interface TableRows {
  table: unknown;
  rows: Record<string, unknown>[];
}

interface RecordedCalls {
  selects: unknown[];
  inserts: { table: unknown; values: Record<string, unknown> }[];
  updates: { table: unknown; values: Record<string, unknown>; condition: unknown }[];
  deletes: { table: unknown; condition: unknown }[];
}

// One recorder for all four verbs, keyed by table identity — every assertion below is a call
// count or a recorded payload, never a round trip through a real database.
function fakeDb(tableRows: TableRows[] = []) {
  const calls: RecordedCalls = { selects: [], inserts: [], updates: [], deletes: [] };
  const rowsFor = (table: unknown) => tableRows.find((entry) => entry.table === table)?.rows ?? [];

  const db = {
    select: () => ({
      from: (table: unknown) => {
        calls.selects.push(table);
        return { where: () => Promise.resolve(rowsFor(table)) };
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        calls.inserts.push({ table, values });
        return Promise.resolve();
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: unknown) => {
          calls.updates.push({ table, values, condition });
          return Promise.resolve();
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: (condition: unknown) => {
        calls.deletes.push({ table, condition });
        return Promise.resolve();
      },
    }),
  } as unknown as ReturnType<typeof getPowerSync>;

  return { db, calls };
}

function cycleRows(rows: Record<string, unknown>[]): TableRows[] {
  return [{ table: routineCycle, rows }];
}

function overrideRows(rows: Record<string, unknown>[]): TableRows[] {
  return [{ table: routineExerciseCycleTarget, rows }];
}

describe('validateCycle', () => {
  it('rejects a blank or whitespace-only name', () => {
    expect(validateCycle({ name: '', kind: 'training' })).toBe('name-required');
    expect(validateCycle({ name: '   ', kind: 'training' })).toBe('name-required');
  });

  it('rejects a kind outside the shared CYCLE_KINDS tuple', () => {
    expect(validateCycle({ name: 'X', kind: 'week' as never })).toBe('unknown-kind');
  });

  it('requires a duration for time off and leaves training/deload durations null', () => {
    expect(validateCycle({ name: 'Off', kind: 'time_off' })).toBe('duration-required');
    expect(validateCycle({ name: 'Off', kind: 'time_off', durationDays: null })).toBe('duration-required');
    expect(validateCycle({ name: 'Week 1', kind: 'training' })).toBeNull();
    expect(validateCycle({ name: 'Deload', kind: 'deload' })).toBeNull();
  });

  it('rejects a duration below one day at the boundary', () => {
    expect(validateCycle({ name: 'Off', kind: 'time_off', durationDays: 0 })).toBe('duration-too-small');
    expect(validateCycle({ name: 'Off', kind: 'time_off', durationDays: 1 })).toBeNull();
  });

  // Number('abc') is NaN and every comparison against NaN is false, so a bare `< 1` guard would
  // have let a mistyped Days off field through to the row.
  it('rejects a non-integer duration rather than letting NaN slip past the comparison', () => {
    expect(validateCycle({ name: 'Off', kind: 'time_off', durationDays: Number('abc') })).toBe('duration-too-small');
    expect(validateCycle({ name: 'Off', kind: 'time_off', durationDays: 1.5 })).toBe('duration-too-small');
    expect(validateCycle({ name: 'Week 1', kind: 'training', durationDays: Number('') })).toBe('duration-too-small');
  });
});

describe('addCycle', () => {
  it('inserts one training cycle with a fresh id, a null duration, and an appended orderIndex', async () => {
    const { db, calls } = fakeDb(cycleRows([{ orderIndex: ORDER_INDEX_GAP }, { orderIndex: ORDER_INDEX_GAP * 2 }]));

    const id = await addCycle({ routineId: 'r1', name: '  Week 1  ', kind: 'training' }, db);

    expect(id).toBe('fixed-id');
    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0].table).toBe(routineCycle);
    expect(calls.inserts[0].values).toEqual({
      id: 'fixed-id',
      routineId: 'r1',
      orderIndex: ORDER_INDEX_GAP * 3,
      name: 'Week 1',
      kind: 'training',
      durationDays: null,
    });
  });

  it('gives the first cycle of an empty routine the lowest index — what "deload at the start" means', async () => {
    const { db, calls } = fakeDb(cycleRows([]));

    await addCycle({ routineId: 'r1', name: 'Deload', kind: 'deload' }, db);

    expect(calls.inserts[0].values.orderIndex).toBe(ORDER_INDEX_GAP);
  });

  it('throws on a blank name and inserts nothing', async () => {
    const { db, calls } = fakeDb(cycleRows([]));

    await expect(addCycle({ routineId: 'r1', name: '', kind: 'training' }, db)).rejects.toThrow('name-required');
    expect(calls.inserts).toHaveLength(0);
  });

  it('refuses a time-off cycle with no duration at the write boundary, not at the server', async () => {
    const { db, calls } = fakeDb(cycleRows([]));

    await expect(addCycle({ routineId: 'r1', name: 'Off', kind: 'time_off' }, db)).rejects.toThrow('duration-required');
    expect(calls.inserts).toHaveLength(0);
  });

  it('inserts a time-off cycle carrying its duration', async () => {
    const { db, calls } = fakeDb(cycleRows([]));

    await addCycle({ routineId: 'r1', name: 'Off', kind: 'time_off', durationDays: 7 }, db);

    expect(calls.inserts[0].values.durationDays).toBe(7);
    expect(calls.inserts[0].values.kind).toBe('time_off');
  });

  it('refuses zero days off and accepts one — the boundary, asserted from both sides', async () => {
    const zero = fakeDb(cycleRows([]));
    await expect(addCycle({ routineId: 'r1', name: 'Off', kind: 'time_off', durationDays: 0 }, zero.db)).rejects.toThrow(
      'duration-too-small',
    );
    expect(zero.calls.inserts).toHaveLength(0);

    const one = fakeDb(cycleRows([]));
    await addCycle({ routineId: 'r1', name: 'Off', kind: 'time_off', durationDays: 1 }, one.db);
    expect(one.calls.inserts[0].values.durationDays).toBe(1);
  });

  it('checks the kind against the imported CYCLE_KINDS tuple rather than a retyped list', async () => {
    const { db, calls } = fakeDb(cycleRows([]));

    await expect(addCycle({ routineId: 'r1', name: 'X', kind: 'week' as never }, db)).rejects.toThrow('unknown-kind');
    expect(calls.inserts).toHaveLength(0);
  });

  describe('the database-injection seam (WINDOWS #23)', () => {
    it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
      getPowerSyncMock.mockClear();
      const { db, calls } = fakeDb(cycleRows([]));

      await addCycle({ routineId: 'r1', name: 'Week 1', kind: 'training' }, db);

      expect(calls.inserts).toHaveLength(1);
      expect(getPowerSyncMock).not.toHaveBeenCalled();
    });

    it('falls back to getPowerSync() when no database argument is passed', async () => {
      const { db, calls } = fakeDb(cycleRows([]));
      getPowerSyncMock.mockReturnValue(db);

      await addCycle({ routineId: 'r1', name: 'Week 1', kind: 'training' });

      expect(calls.inserts).toHaveLength(1);
      expect(getPowerSyncMock).toHaveBeenCalled();
    });
  });
});

describe('cycleErrorMessage', () => {
  it('maps every validation code to a sentence a user can act on', () => {
    expect(cycleErrorMessage('name-required')).toBe('Cycle name is required.');
    expect(cycleErrorMessage('unknown-kind')).toBe('Choose Training, Deload or Time off.');
    expect(cycleErrorMessage('duration-required')).toBe('Time off needs a length in days.');
    expect(cycleErrorMessage('duration-too-small')).toBe('Days off must be a whole number of at least 1.');
  });

  it('never returns the raw code', () => {
    const codes: CycleValidationError[] = ['name-required', 'unknown-kind', 'duration-required', 'duration-too-small'];
    for (const code of codes) expect(cycleErrorMessage(code)).not.toBe(code);
  });
});

describe('updateCycle', () => {
  it('writes name, kind and duration in exactly one update', async () => {
    const { db, calls } = fakeDb();

    await updateCycle('c1', { name: '  Accumulation  ', kind: 'deload', durationDays: null }, db);

    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].table).toBe(routineCycle);
    expect(calls.updates[0].values).toEqual({ name: 'Accumulation', kind: 'deload', durationDays: null });
    expect(calls.updates[0].condition).toEqual(eq(routineCycle.id, 'c1'));
  });

  it('trims the name and requires it non-empty, matching addCycle', async () => {
    const { db, calls } = fakeDb();

    await expect(updateCycle('c1', { name: '   ', kind: 'training' }, db)).rejects.toThrow('name-required');
    expect(calls.updates).toHaveLength(0);
  });

  // The Job-1 defect: the shipped Edit Cycle form wrote kind alone, so "Make Time off" produced a
  // cycle resolveNextUp could only step over.
  it('refuses to make a cycle time off without a duration, and writes nothing when it refuses', async () => {
    const { db, calls } = fakeDb();

    await expect(updateCycle('c1', { name: 'Off', kind: 'time_off', durationDays: null }, db)).rejects.toThrow(
      'duration-required',
    );
    await expect(updateCycle('c1', { name: 'Off', kind: 'time_off' }, db)).rejects.toThrow('duration-required');
    expect(calls.updates).toHaveLength(0);
  });

  it('writes the kind and the duration together, so no durationless time-off row ever exists', async () => {
    const { db, calls } = fakeDb();

    await updateCycle('c1', { name: 'Off', kind: 'time_off', durationDays: 7 }, db);

    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].values).toEqual({ name: 'Off', kind: 'time_off', durationDays: 7 });
  });

  it('rejects a duration below one day at the boundary', async () => {
    const { db, calls } = fakeDb();

    await expect(updateCycle('c1', { name: 'Off', kind: 'time_off', durationDays: 0 }, db)).rejects.toThrow(
      'duration-too-small',
    );
    expect(calls.updates).toHaveLength(0);
  });

  it('rejects a non-numeric duration rather than writing NaN into the row', async () => {
    const { db, calls } = fakeDb();

    await expect(updateCycle('c1', { name: 'Off', kind: 'time_off', durationDays: Number('abc') }, db)).rejects.toThrow(
      'duration-too-small',
    );
    await expect(updateCycle('c1', { name: 'Off', kind: 'time_off', durationDays: 1.5 }, db)).rejects.toThrow(
      'duration-too-small',
    );
    expect(calls.updates).toHaveLength(0);
  });

  it('rejects a kind outside the shared tuple', async () => {
    const { db, calls } = fakeDb();

    await expect(updateCycle('c1', { name: 'X', kind: 'week' as never }, db)).rejects.toThrow('unknown-kind');
    expect(calls.updates).toHaveLength(0);
  });

  it('clears a training cycle back to a null duration — its length is the rotation, not a number', async () => {
    const { db, calls } = fakeDb();

    await updateCycle('c1', { name: 'Week 1', kind: 'training', durationDays: null }, db);

    expect(calls.updates[0].values).toEqual({ name: 'Week 1', kind: 'training', durationDays: null });
  });

  it('reads nothing before writing — the draft carries every column it needs', async () => {
    const { db, calls } = fakeDb();

    await updateCycle('c1', { name: 'Off', kind: 'time_off', durationDays: 7 }, db);

    expect(calls.selects).toHaveLength(0);
  });

  describe('the database-injection seam (WINDOWS #23)', () => {
    it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
      getPowerSyncMock.mockClear();
      const { db } = fakeDb();

      await updateCycle('c1', { name: 'Accumulation', kind: 'training' }, db);

      expect(getPowerSyncMock).not.toHaveBeenCalled();
    });

    it('falls back to getPowerSync() when no database argument is passed', async () => {
      const { db, calls } = fakeDb();
      getPowerSyncMock.mockReturnValue(db);

      await updateCycle('c1', { name: 'Accumulation', kind: 'training' });

      expect(calls.updates).toHaveLength(1);
      expect(getPowerSyncMock).toHaveBeenCalled();
    });
  });
});

describe('moveCycle', () => {
  it('issues exactly one update when a gap slot is available between the anchors', async () => {
    const { db, calls } = fakeDb(
      cycleRows([
        { id: 'a', orderIndex: ORDER_INDEX_GAP },
        { id: 'b', orderIndex: ORDER_INDEX_GAP * 2 },
        { id: 'x', orderIndex: ORDER_INDEX_GAP * 5 },
      ]),
    );

    await moveCycle({ routineId: 'r1', cycleId: 'x', beforeId: 'a', afterId: 'b' }, db);

    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].table).toBe(routineCycle);
    expect(calls.updates[0].values).toEqual({ orderIndex: Math.floor((ORDER_INDEX_GAP + ORDER_INDEX_GAP * 2) / 2) });
  });

  it('renumbers the whole sibling order in one pass when the anchors are adjacent', async () => {
    const { db, calls } = fakeDb(
      cycleRows([
        { id: 'a', orderIndex: 1 },
        { id: 'b', orderIndex: 2 },
        { id: 'x', orderIndex: 9 },
      ]),
    );

    await moveCycle({ routineId: 'r1', cycleId: 'x', beforeId: 'a', afterId: 'b' }, db);

    expect(calls.updates.length).toBeGreaterThan(1);
    const written = new Map(calls.updates.map((call, index) => [index, call.values.orderIndex]));
    expect([...written.values()].every((value) => typeof value === 'number')).toBe(true);
  });

  describe('the database-injection seam (WINDOWS #23)', () => {
    it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
      getPowerSyncMock.mockClear();
      const { db } = fakeDb(cycleRows([{ id: 'x', orderIndex: ORDER_INDEX_GAP }]));

      await moveCycle({ routineId: 'r1', cycleId: 'x', beforeId: null, afterId: null }, db);

      expect(getPowerSyncMock).not.toHaveBeenCalled();
    });

    it('falls back to getPowerSync() when no database argument is passed', async () => {
      const { db } = fakeDb(cycleRows([{ id: 'x', orderIndex: ORDER_INDEX_GAP }]));
      getPowerSyncMock.mockReturnValue(db);

      await moveCycle({ routineId: 'r1', cycleId: 'x', beforeId: null, afterId: null });

      expect(getPowerSyncMock).toHaveBeenCalled();
    });
  });
});

describe('removeCycle', () => {
  it('issues exactly one delete and never deletes its override rows row by row — the cascade is the database\'s', async () => {
    const { db, calls } = fakeDb();

    await removeCycle('c1', db);

    expect(calls.deletes).toHaveLength(1);
    expect(calls.deletes[0].table).toBe(routineCycle);
    expect(calls.deletes[0].condition).toEqual(eq(routineCycle.id, 'c1'));
  });

  describe('the database-injection seam (WINDOWS #23)', () => {
    it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
      getPowerSyncMock.mockClear();
      const { db } = fakeDb();

      await removeCycle('c1', db);

      expect(getPowerSyncMock).not.toHaveBeenCalled();
    });

    it('falls back to getPowerSync() when no database argument is passed', async () => {
      const { db, calls } = fakeDb();
      getPowerSyncMock.mockReturnValue(db);

      await removeCycle('c1');

      expect(calls.deletes).toHaveLength(1);
      expect(getPowerSyncMock).toHaveBeenCalled();
    });
  });
});

describe('setCycleTarget', () => {
  beforeEach(() => {
    generateClientIdMock.mockReturnValue('fixed-id');
  });

  it('inserts one row with a fresh id, the overridden field, and four nulls when no row exists for the pair', async () => {
    const { db, calls } = fakeDb(overrideRows([]));

    await setCycleTarget({ routineExerciseId: 'rex1', cycleId: 'c1', override: { targetSets: 5 } }, db);

    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0].table).toBe(routineExerciseCycleTarget);
    expect(calls.inserts[0].values).toEqual({
      id: 'fixed-id',
      routineExerciseId: 'rex1',
      cycleId: 'c1',
      targetSets: 5,
      targetRepMin: null,
      targetRepMax: null,
      targetRir: null,
      targetRestSeconds: null,
    });
    expect(calls.updates).toHaveLength(0);
  });

  it('updates the existing row for the pair and inserts nothing — a second row would break the unique constraint', async () => {
    const { db, calls } = fakeDb(overrideRows([{ id: 'ovr-1' }]));

    await setCycleTarget({ routineExerciseId: 'rex1', cycleId: 'c1', override: { targetRir: 1 } }, db);

    expect(calls.inserts).toHaveLength(0);
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].table).toBe(routineExerciseCycleTarget);
    expect(calls.updates[0].condition).toEqual(eq(routineExerciseCycleTarget.id, 'ovr-1'));
    expect(calls.updates[0].values).toEqual({
      targetSets: null,
      targetRepMin: null,
      targetRepMax: null,
      targetRir: 1,
      targetRestSeconds: null,
    });
  });

  it('deletes the existing row when the override overrides nothing', async () => {
    const { db, calls } = fakeDb(overrideRows([{ id: 'ovr-1' }]));

    await setCycleTarget({ routineExerciseId: 'rex1', cycleId: 'c1', override: {} }, db);

    expect(calls.deletes).toHaveLength(1);
    expect(calls.deletes[0].table).toBe(routineExerciseCycleTarget);
    expect(calls.deletes[0].condition).toEqual(eq(routineExerciseCycleTarget.id, 'ovr-1'));
    expect(calls.inserts).toHaveLength(0);
    expect(calls.updates).toHaveLength(0);
  });

  it('treats an all-null override exactly like an absent one — still a delete, never an all-null row', async () => {
    const { db, calls } = fakeDb(overrideRows([{ id: 'ovr-1' }]));

    await setCycleTarget(
      {
        routineExerciseId: 'rex1',
        cycleId: 'c1',
        override: { targetSets: null, targetRepMin: null, targetRepMax: null, targetRir: null, targetRestSeconds: null },
      },
      db,
    );

    expect(calls.deletes).toHaveLength(1);
    expect(calls.inserts).toHaveLength(0);
  });

  it('writes nothing at all for an empty override with no existing row', async () => {
    const { db, calls } = fakeDb(overrideRows([]));

    await setCycleTarget({ routineExerciseId: 'rex1', cycleId: 'c1', override: {} }, db);

    expect(calls.inserts).toHaveLength(0);
    expect(calls.updates).toHaveLength(0);
    expect(calls.deletes).toHaveLength(0);
  });

  it('writes a zero — zero is a value, not an absence, and this is the boundary against the empty case', async () => {
    const { db, calls } = fakeDb(overrideRows([]));

    await setCycleTarget({ routineExerciseId: 'rex1', cycleId: 'c1', override: { targetRir: 0 } }, db);

    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0].values.targetRir).toBe(0);
    expect(calls.deletes).toHaveLength(0);
  });

  it('throws and writes nothing for an override failing validateTargets', async () => {
    const { db, calls } = fakeDb(overrideRows([]));

    await expect(
      setCycleTarget({ routineExerciseId: 'rex1', cycleId: 'c1', override: { targetRepMin: 10, targetRepMax: 5 } }, db),
    ).rejects.toThrow('targetRepMax');
    expect(calls.inserts).toHaveLength(0);
    expect(calls.updates).toHaveLength(0);
    expect(calls.deletes).toHaveLength(0);
  });

  describe('the database-injection seam (WINDOWS #23)', () => {
    it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
      getPowerSyncMock.mockClear();
      const { db, calls } = fakeDb(overrideRows([]));

      await setCycleTarget({ routineExerciseId: 'rex1', cycleId: 'c1', override: { targetSets: 5 } }, db);

      expect(calls.inserts).toHaveLength(1);
      expect(getPowerSyncMock).not.toHaveBeenCalled();
    });

    it('falls back to getPowerSync() when no database argument is passed', async () => {
      const { db, calls } = fakeDb(overrideRows([]));
      getPowerSyncMock.mockReturnValue(db);

      await setCycleTarget({ routineExerciseId: 'rex1', cycleId: 'c1', override: { targetSets: 5 } });

      expect(calls.inserts).toHaveLength(1);
      expect(getPowerSyncMock).toHaveBeenCalled();
    });
  });
});

describe('clearCycleTarget', () => {
  it('issues exactly one delete — the explicit reset-to-base write', async () => {
    const { db, calls } = fakeDb();

    await clearCycleTarget({ routineExerciseId: 'rex1', cycleId: 'c1' }, db);

    expect(calls.deletes).toHaveLength(1);
    expect(calls.deletes[0].table).toBe(routineExerciseCycleTarget);
    expect(calls.inserts).toHaveLength(0);
    expect(calls.updates).toHaveLength(0);
  });

  describe('the database-injection seam (WINDOWS #23)', () => {
    it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
      getPowerSyncMock.mockClear();
      const { db } = fakeDb();

      await clearCycleTarget({ routineExerciseId: 'rex1', cycleId: 'c1' }, db);

      expect(getPowerSyncMock).not.toHaveBeenCalled();
    });

    it('falls back to getPowerSync() when no database argument is passed', async () => {
      const { db, calls } = fakeDb();
      getPowerSyncMock.mockReturnValue(db);

      await clearCycleTarget({ routineExerciseId: 'rex1', cycleId: 'c1' });

      expect(calls.deletes).toHaveLength(1);
      expect(getPowerSyncMock).toHaveBeenCalled();
    });
  });
});
