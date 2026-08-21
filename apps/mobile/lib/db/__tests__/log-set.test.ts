import { addSessionExercise, logSet, startSession } from '../log-set';
import { getPowerSync } from '../powersync';
import { routineExercise, routineExerciseCycleTarget } from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../id', () => ({ generateClientId: jest.fn(() => 'fixed-id') }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;

function fakeDb(insertedValuesSpy: jest.Mock) {
  return {
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
}

describe('logSet — the unit conversion boundary', () => {
  it('converts a value entered in lb to canonical kilograms before writing', async () => {
    const insertedValuesSpy = jest.fn();
    getPowerSyncMock.mockReturnValue(fakeDb(insertedValuesSpy));

    await logSet({ sessionExerciseId: 'se-1', weight: { value: '225', unit: 'lb' }, reps: 5 });

    expect(insertedValuesSpy).toHaveBeenCalledTimes(1);
    expect(insertedValuesSpy.mock.calls[0][0].weightKg).toBe('102.058');
  });

  it('stores null rather than zero for a null weight', async () => {
    const insertedValuesSpy = jest.fn();
    getPowerSyncMock.mockReturnValue(fakeDb(insertedValuesSpy));

    await logSet({ sessionExerciseId: 'se-1', weight: { value: null, unit: 'kg' }, reps: 5 });

    expect(insertedValuesSpy.mock.calls[0][0].weightKg).toBeNull();
  });

  it('stores the identical canonical decimal across two calls with the same entered value and unit', async () => {
    const insertedValuesSpy = jest.fn();
    getPowerSyncMock.mockReturnValue(fakeDb(insertedValuesSpy));

    await logSet({ sessionExerciseId: 'se-1', weight: { value: '100', unit: 'kg' }, reps: 5 });
    await logSet({ sessionExerciseId: 'se-1', weight: { value: '100', unit: 'kg' }, reps: 5 });

    const [first, second] = insertedValuesSpy.mock.calls.map((call) => call[0].weightKg);
    expect(first).toBe(second);
    expect(first).toBe('100.000');
  });
});

describe('logSet — the database-injection seam (WINDOWS #23)', () => {
  it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
    getPowerSyncMock.mockClear();
    const insertedValuesSpy = jest.fn();
    const explicitDb = fakeDb(insertedValuesSpy);

    await logSet({ sessionExerciseId: 'se-1', weight: { value: '100', unit: 'kg' }, reps: 5 }, explicitDb);

    expect(insertedValuesSpy).toHaveBeenCalledTimes(1);
    expect(getPowerSyncMock).not.toHaveBeenCalled();
  });

  it('falls back to getPowerSync() when no database argument is passed', async () => {
    const insertedValuesSpy = jest.fn();
    getPowerSyncMock.mockReturnValue(fakeDb(insertedValuesSpy));

    await logSet({ sessionExerciseId: 'se-1', weight: { value: '100', unit: 'kg' }, reps: 5 });

    expect(insertedValuesSpy).toHaveBeenCalledTimes(1);
    expect(getPowerSyncMock).toHaveBeenCalled();
  });
});

describe('startSession — the database-injection seam (WINDOWS #23)', () => {
  it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
    getPowerSyncMock.mockClear();
    const insertedValuesSpy = jest.fn();
    const explicitDb = fakeDb(insertedValuesSpy);

    await startSession({}, explicitDb);

    expect(insertedValuesSpy).toHaveBeenCalledTimes(1);
    expect(getPowerSyncMock).not.toHaveBeenCalled();
  });
});

const BASE_TARGETS = {
  targetSets: 3,
  targetRepMin: 8,
  targetRepMax: 12,
  targetRir: 1,
  targetRestSeconds: 120,
};

const NO_TARGETS = {
  targetSets: null,
  targetRepMin: null,
  targetRepMax: null,
  targetRir: null,
  targetRestSeconds: null,
};

interface SnapshotRows {
  baseRow?: Record<string, unknown>;
  overrideRow?: Record<string, unknown>;
}

function fakeSnapshotDb(rows: SnapshotRows) {
  let selectCount = 0;
  const insertedValuesSpy = jest.fn();
  const db = {
    select: () => {
      selectCount++;
      return {
        from: (table: unknown) => ({
          where: () => {
            if (table === routineExercise) return Promise.resolve(rows.baseRow ? [rows.baseRow] : []);
            if (table === routineExerciseCycleTarget) return Promise.resolve(rows.overrideRow ? [rows.overrideRow] : []);
            return Promise.resolve([]);
          },
        }),
      };
    },
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        insertedValuesSpy(values);
        return Promise.resolve();
      },
    }),
  } as unknown as ReturnType<typeof getPowerSync>;

  return { db, insertedValuesSpy, getSelectCount: () => selectCount };
}

function snapshotOf(insertedValuesSpy: jest.Mock) {
  const values = insertedValuesSpy.mock.calls[0][0] as Record<string, unknown>;
  return {
    targetSets: values.targetSets,
    targetRepMin: values.targetRepMin,
    targetRepMax: values.targetRepMax,
    targetRir: values.targetRir,
    targetRestSeconds: values.targetRestSeconds,
  };
}

describe('addSessionExercise — the snapshot resolves the cycle, not just the base (PROG-11)', () => {
  it('snapshots five nulls and reads nothing for an exercise added with no routine_exercise_id', async () => {
    const { db, insertedValuesSpy, getSelectCount } = fakeSnapshotDb({});

    await addSessionExercise({ sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0 }, db);

    expect(snapshotOf(insertedValuesSpy)).toEqual(NO_TARGETS);
    expect(insertedValuesSpy.mock.calls[0][0].routineExerciseId).toBeNull();
    expect(getSelectCount()).toBe(0);
  });

  it("snapshots the base row's five values with no cycleId passed, in one select", async () => {
    const { db, insertedValuesSpy, getSelectCount } = fakeSnapshotDb({ baseRow: { ...BASE_TARGETS } });

    await addSessionExercise({ sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1' }, db);

    expect(snapshotOf(insertedValuesSpy)).toEqual(BASE_TARGETS);
    expect(getSelectCount()).toBe(1);
  });

  it("snapshots the base row's five values for a cycle that has no override row", async () => {
    const { db, insertedValuesSpy, getSelectCount } = fakeSnapshotDb({ baseRow: { ...BASE_TARGETS } });

    await addSessionExercise(
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1', cycleId: 'c-1' },
      db,
    );

    expect(snapshotOf(insertedValuesSpy)).toEqual(BASE_TARGETS);
    expect(getSelectCount()).toBe(2);
  });

  it("snapshots an override's targetSets alongside the base's other four values", async () => {
    const { db, insertedValuesSpy } = fakeSnapshotDb({
      baseRow: { ...BASE_TARGETS },
      overrideRow: { ...NO_TARGETS, targetSets: 5 },
    });

    await addSessionExercise(
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1', cycleId: 'c-1' },
      db,
    );

    expect(snapshotOf(insertedValuesSpy)).toEqual({ ...BASE_TARGETS, targetSets: 5 });
  });

  it("snapshots the base's targetRepMin when the override sets it to an explicit null — null means inherit, never clear", async () => {
    const { db, insertedValuesSpy } = fakeSnapshotDb({
      baseRow: { ...BASE_TARGETS },
      overrideRow: { ...NO_TARGETS, targetSets: 5, targetRepMin: null },
    });

    await addSessionExercise(
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1', cycleId: 'c-1' },
      db,
    );

    expect(snapshotOf(insertedValuesSpy).targetRepMin).toBe(8);
  });

  it('snapshots five nulls without throwing when the base row no longer exists', async () => {
    const { db, insertedValuesSpy } = fakeSnapshotDb({});

    await addSessionExercise(
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-gone', cycleId: 'c-1' },
      db,
    );

    expect(snapshotOf(insertedValuesSpy)).toEqual(NO_TARGETS);
  });

  it("snapshots an override's own values over five nulls when the base row no longer exists", async () => {
    const { db, insertedValuesSpy } = fakeSnapshotDb({
      overrideRow: { ...NO_TARGETS, targetSets: 5, targetRir: 0 },
    });

    await addSessionExercise(
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-gone', cycleId: 'c-1' },
      db,
    );

    expect(snapshotOf(insertedValuesSpy)).toEqual({ ...NO_TARGETS, targetSets: 5, targetRir: 0 });
  });

  it('issues at most two selects whatever the input — never one per target field', async () => {
    const inputs = [
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0 },
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1' },
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1', cycleId: 'c-1' },
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1', cycleId: null },
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, cycleId: 'c-1' },
    ];

    for (const input of inputs) {
      const { db, getSelectCount } = fakeSnapshotDb({
        baseRow: { ...BASE_TARGETS },
        overrideRow: { ...NO_TARGETS, targetSets: 5 },
      });
      await addSessionExercise(input, db);
      expect(getSelectCount()).toBeLessThanOrEqual(2);
    }
  });
});

describe('addSessionExercise — the database-injection seam (WINDOWS #23)', () => {
  it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
    getPowerSyncMock.mockClear();
    const { db, insertedValuesSpy } = fakeSnapshotDb({ baseRow: { ...BASE_TARGETS } });

    await addSessionExercise({ sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1' }, db);

    expect(insertedValuesSpy).toHaveBeenCalledTimes(1);
    expect(getPowerSyncMock).not.toHaveBeenCalled();
  });

  it('resolves getPowerSync exactly once when no database argument is passed', async () => {
    getPowerSyncMock.mockClear();
    const { db, insertedValuesSpy } = fakeSnapshotDb({ baseRow: { ...BASE_TARGETS } });
    getPowerSyncMock.mockReturnValue(db);

    await addSessionExercise({ sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1' });

    expect(insertedValuesSpy).toHaveBeenCalledTimes(1);
    expect(getPowerSyncMock).toHaveBeenCalledTimes(1);
  });
});
