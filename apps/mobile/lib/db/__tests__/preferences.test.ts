import { loadWorkoutPreferences, setWorkoutPreference } from '../preferences';
import { getPowerSync } from '../powersync';
import { userPreference } from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;

interface TableRows {
  table: unknown;
  rows: Record<string, unknown>[];
}

interface RecordedCalls {
  selects: unknown[];
  inserts: { table: unknown; values: Record<string, unknown> }[];
  updates: { table: unknown; values: Record<string, unknown> }[];
}

function fakeDb(tableRows: TableRows[] = []) {
  const calls: RecordedCalls = { selects: [], inserts: [], updates: [] };
  const rowsFor = (table: unknown) => tableRows.find((entry) => entry.table === table)?.rows ?? [];

  const db = {
    select: () => ({
      from: (table: unknown) => {
        calls.selects.push(table);
        const resolved = Promise.resolve(rowsFor(table));
        return {
          where: () => resolved,
          then: resolved.then.bind(resolved),
        };
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
        where: () => {
          calls.updates.push({ table, values });
          return Promise.resolve();
        },
      }),
    }),
  } as unknown as ReturnType<typeof getPowerSync>;

  return { db, calls };
}

beforeEach(() => {
  getPowerSyncMock.mockReset();
});

describe('loadWorkoutPreferences', () => {
  it('defaults both flags to true when no row exists', async () => {
    const { db } = fakeDb();

    await expect(loadWorkoutPreferences('u-1', db)).resolves.toEqual({
      autoAdvanceEnabled: true,
      warmupSetsEnabled: true,
    });
  });

  it('reads both stored flags off the row', async () => {
    const { db } = fakeDb([{ table: userPreference, rows: [{ autoAdvanceEnabled: false, warmupSetsEnabled: true }] }]);

    await expect(loadWorkoutPreferences('u-1', db)).resolves.toEqual({
      autoAdvanceEnabled: false,
      warmupSetsEnabled: true,
    });
  });

  it('falls back to getPowerSync when no database is passed', async () => {
    const { db } = fakeDb();
    getPowerSyncMock.mockReturnValue(db);

    await loadWorkoutPreferences('u-1');

    expect(getPowerSyncMock).toHaveBeenCalled();
  });
});

describe('setWorkoutPreference', () => {
  it('inserts a full row with sensible defaults when none exists', async () => {
    const { db, calls } = fakeDb();

    await setWorkoutPreference('u-1', 'autoAdvanceEnabled', false, db);

    expect(calls.updates).toHaveLength(0);
    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0].table).toBe(userPreference);
    expect(calls.inserts[0].values).toEqual({
      id: 'u-1',
      userId: 'u-1',
      weightUnit: 'kg',
      defaultEquipmentProfileId: null,
      activeRoutineId: null,
      autoAdvanceEnabled: false,
      warmupSetsEnabled: true,
    });
  });

  it('writes exactly the named column when a row already exists, leaving the other flag and weightUnit untouched', async () => {
    const { db, calls } = fakeDb([
      { table: userPreference, rows: [{ id: 'u-1', autoAdvanceEnabled: true, warmupSetsEnabled: true, weightUnit: 'lb' }] },
    ]);

    await setWorkoutPreference('u-1', 'warmupSetsEnabled', false, db);

    expect(calls.inserts).toHaveLength(0);
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].table).toBe(userPreference);
    expect(calls.updates[0].values).toEqual({ warmupSetsEnabled: false });
  });

  it('writes the other flag independently, in a separate call, leaving the first untouched', async () => {
    const { db, calls } = fakeDb([{ table: userPreference, rows: [{ id: 'u-1' }] }]);

    await setWorkoutPreference('u-1', 'autoAdvanceEnabled', false, db);
    await setWorkoutPreference('u-1', 'warmupSetsEnabled', false, db);

    expect(calls.updates).toEqual([
      { table: userPreference, values: { autoAdvanceEnabled: false } },
      { table: userPreference, values: { warmupSetsEnabled: false } },
    ]);
  });

  it('falls back to getPowerSync when no database is passed', async () => {
    const { db } = fakeDb();
    getPowerSyncMock.mockReturnValue(db);

    await setWorkoutPreference('u-1', 'autoAdvanceEnabled', true);

    expect(getPowerSyncMock).toHaveBeenCalled();
  });
});
