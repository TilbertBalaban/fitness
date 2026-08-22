import { ROUTINE_STATUSES } from '@fitness/api-contracts';
import {
  activateRoutine,
  archiveRoutine,
  clearActiveRoutine,
  loadActiveRoutineId,
  loadLibraryRoutines,
  loadProgressionFrozen,
  markRoutineReady,
  renameRoutine,
  restoreRoutine,
  setProgressionFrozen,
} from '../programs/lifecycle';
import { getPowerSync } from '../powersync';
import { routine, userPreference } from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;

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

// The repository's established recorder (lib/db/__tests__/cycles.test.ts), extended in one way:
// `from()` is itself awaitable, so a select with no `where` — which loadLibraryRoutines needs, since
// the library reads archived rows too — resolves instead of handing back a builder object.
function fakeDb(tableRows: TableRows[] = []) {
  const calls: RecordedCalls = { selects: [], inserts: [], updates: [], deletes: [] };
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

function preferenceRows(rows: Record<string, unknown>[]): TableRows[] {
  return [{ table: userPreference, rows }];
}

beforeEach(() => {
  getPowerSyncMock.mockReset();
});

describe('loadActiveRoutineId', () => {
  it('returns the stored pointer', async () => {
    const { db } = fakeDb(preferenceRows([{ activeRoutineId: 'r1' }]));
    await expect(loadActiveRoutineId('u1', db)).resolves.toBe('r1');
  });

  it('returns null when the user has no preference row at all', async () => {
    const { db } = fakeDb();
    await expect(loadActiveRoutineId('u1', db)).resolves.toBeNull();
  });

  it('falls back to getPowerSync when no database is passed', async () => {
    const { db } = fakeDb(preferenceRows([{ activeRoutineId: 'r9' }]));
    getPowerSyncMock.mockReturnValue(db);

    await expect(loadActiveRoutineId('u1')).resolves.toBe('r9');
    expect(getPowerSyncMock).toHaveBeenCalledTimes(1);
  });
});

describe('activateRoutine', () => {
  it('inserts one preference row keyed on the user id when none exists', async () => {
    const { db, calls } = fakeDb();

    await activateRoutine({ userId: 'u1', routineId: 'r1' }, db);

    expect(calls.updates).toHaveLength(0);
    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0].table).toBe(userPreference);
    expect(calls.inserts[0].values).toEqual({
      id: 'u1',
      userId: 'u1',
      weightUnit: 'kg',
      defaultEquipmentProfileId: null,
      activeRoutineId: 'r1',
    });
  });

  it('updates only the pointer when a row already exists, leaving weightUnit untouched', async () => {
    const { db, calls } = fakeDb(preferenceRows([{ id: 'u1', activeRoutineId: null, weightUnit: 'lb' }]));

    await activateRoutine({ userId: 'u1', routineId: 'r1' }, db);

    expect(calls.inserts).toHaveLength(0);
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].table).toBe(userPreference);
    expect(calls.updates[0].values).toEqual({ activeRoutineId: 'r1' });
  });

  it('overwrites one column when a second routine is activated — two actives are unrepresentable', async () => {
    const { db, calls } = fakeDb(preferenceRows([{ id: 'u1', activeRoutineId: 'r1', weightUnit: 'kg' }]));

    await activateRoutine({ userId: 'u1', routineId: 'r2' }, db);

    expect(calls.inserts).toHaveLength(0);
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].values).toEqual({ activeRoutineId: 'r2' });
  });

  it('is idempotent — activating the same routine twice writes the same single column twice', async () => {
    const { db, calls } = fakeDb(preferenceRows([{ id: 'u1', activeRoutineId: 'r1', weightUnit: 'kg' }]));

    await activateRoutine({ userId: 'u1', routineId: 'r1' }, db);
    await activateRoutine({ userId: 'u1', routineId: 'r1' }, db);

    expect(calls.inserts).toHaveLength(0);
    expect(calls.updates.map((update) => update.values)).toEqual([
      { activeRoutineId: 'r1' },
      { activeRoutineId: 'r1' },
    ]);
  });

  it('falls back to getPowerSync when no database is passed', async () => {
    const { db } = fakeDb(preferenceRows([{ id: 'u1', activeRoutineId: null }]));
    getPowerSyncMock.mockReturnValue(db);

    await activateRoutine({ userId: 'u1', routineId: 'r1' });

    expect(getPowerSyncMock).toHaveBeenCalledTimes(1);
  });
});

describe('clearActiveRoutine', () => {
  it('nulls the pointer and touches nothing else', async () => {
    const { db, calls } = fakeDb();

    await clearActiveRoutine('u1', db);

    expect(calls.inserts).toHaveLength(0);
    expect(calls.deletes).toHaveLength(0);
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].table).toBe(userPreference);
    expect(calls.updates[0].values).toEqual({ activeRoutineId: null });
  });

  it('falls back to getPowerSync when no database is passed', async () => {
    const { db } = fakeDb();
    getPowerSyncMock.mockReturnValue(db);

    await clearActiveRoutine('u1');

    expect(getPowerSyncMock).toHaveBeenCalledTimes(1);
  });
});

describe('setProgressionFrozen', () => {
  it('writes exactly one column — never status, never archivedAt', async () => {
    const { db, calls } = fakeDb();

    await setProgressionFrozen('r1', true, db);

    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].table).toBe(routine);
    expect(Object.keys(calls.updates[0].values)).toEqual(['progressionFrozen']);
    expect(calls.updates[0].values).toEqual({ progressionFrozen: true });
    expect(calls.updates[0].values).not.toHaveProperty('status');
    expect(calls.updates[0].values).not.toHaveProperty('archivedAt');
  });

  it('unfreezes through the same single-column write', async () => {
    const { db, calls } = fakeDb();

    await setProgressionFrozen('r1', false, db);

    expect(calls.updates[0].values).toEqual({ progressionFrozen: false });
  });

  it('never touches user_preference — active AND frozen is representable and both facts survive', async () => {
    const { db, calls } = fakeDb(preferenceRows([{ id: 'u1', activeRoutineId: 'r1' }]));

    await setProgressionFrozen('r1', true, db);

    expect(calls.updates.map((update) => update.table)).toEqual([routine]);
    expect(calls.inserts).toHaveLength(0);
  });

  it('falls back to getPowerSync when no database is passed', async () => {
    const { db } = fakeDb();
    getPowerSyncMock.mockReturnValue(db);

    await setProgressionFrozen('r1', true);

    expect(getPowerSyncMock).toHaveBeenCalledTimes(1);
  });
});

describe('loadProgressionFrozen', () => {
  it('reads the flag off the routine row', async () => {
    const { db } = fakeDb([{ table: routine, rows: [{ progressionFrozen: true }] }]);
    await expect(loadProgressionFrozen('r1', db)).resolves.toBe(true);
  });

  it('is false for a routine that does not exist', async () => {
    const { db } = fakeDb();
    await expect(loadProgressionFrozen('gone', db)).resolves.toBe(false);
  });

  it('falls back to getPowerSync when no database is passed', async () => {
    const { db } = fakeDb([{ table: routine, rows: [{ progressionFrozen: false }] }]);
    getPowerSyncMock.mockReturnValue(db);

    await expect(loadProgressionFrozen('r1')).resolves.toBe(false);
    expect(getPowerSyncMock).toHaveBeenCalledTimes(1);
  });
});

describe('archiveRoutine', () => {
  it('writes an ISO timestamp and issues zero deletes', async () => {
    const { db, calls } = fakeDb(preferenceRows([{ id: 'u1', activeRoutineId: 'other' }]));

    await archiveRoutine({ userId: 'u1', routineId: 'r1' }, db);

    expect(calls.deletes).toHaveLength(0);
    const routineUpdates = calls.updates.filter((update) => update.table === routine);
    expect(routineUpdates).toHaveLength(1);
    expect(Object.keys(routineUpdates[0].values)).toEqual(['archivedAt']);
    expect(typeof routineUpdates[0].values.archivedAt).toBe('string');
    expect(new Date(routineUpdates[0].values.archivedAt as string).toISOString()).toBe(
      routineUpdates[0].values.archivedAt,
    );
  });

  it('clears the pointer in the same call when it named the archived routine', async () => {
    const { db, calls } = fakeDb(preferenceRows([{ id: 'u1', activeRoutineId: 'r1' }]));

    await archiveRoutine({ userId: 'u1', routineId: 'r1' }, db);

    const preferenceUpdates = calls.updates.filter((update) => update.table === userPreference);
    expect(preferenceUpdates).toHaveLength(1);
    expect(preferenceUpdates[0].values).toEqual({ activeRoutineId: null });
  });

  it('leaves the pointer untouched when archiving a routine that is not active', async () => {
    const { db, calls } = fakeDb(preferenceRows([{ id: 'u1', activeRoutineId: 'r2' }]));

    await archiveRoutine({ userId: 'u1', routineId: 'r1' }, db);

    expect(calls.updates.filter((update) => update.table === userPreference)).toHaveLength(0);
  });

  it('leaves the pointer untouched when the user has no preference row', async () => {
    const { db, calls } = fakeDb();

    await archiveRoutine({ userId: 'u1', routineId: 'r1' }, db);

    expect(calls.updates.filter((update) => update.table === userPreference)).toHaveLength(0);
  });

  it('falls back to getPowerSync when no database is passed', async () => {
    const { db } = fakeDb();
    getPowerSyncMock.mockReturnValue(db);

    await archiveRoutine({ userId: 'u1', routineId: 'r1' });

    expect(getPowerSyncMock).toHaveBeenCalledTimes(1);
  });
});

describe('restoreRoutine', () => {
  it('nulls archivedAt and does not activate — restoring is not activating', async () => {
    const { db, calls } = fakeDb();

    await restoreRoutine('r1', db);

    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].table).toBe(routine);
    expect(calls.updates[0].values).toEqual({ archivedAt: null });
    expect(calls.inserts).toHaveLength(0);
    expect(calls.deletes).toHaveLength(0);
  });

  it('falls back to getPowerSync when no database is passed', async () => {
    const { db } = fakeDb();
    getPowerSyncMock.mockReturnValue(db);

    await restoreRoutine('r1');

    expect(getPowerSyncMock).toHaveBeenCalledTimes(1);
  });
});

describe('markRoutineReady', () => {
  it('writes status and nothing else, with a value drawn from the shared vocabulary', async () => {
    const { db, calls } = fakeDb();

    await markRoutineReady('r1', db);

    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].table).toBe(routine);
    expect(Object.keys(calls.updates[0].values)).toEqual(['status']);
    expect(ROUTINE_STATUSES).toContain(calls.updates[0].values.status);
    expect(calls.updates[0].values.status).toBe('ready');
  });

  it('falls back to getPowerSync when no database is passed', async () => {
    const { db } = fakeDb();
    getPowerSyncMock.mockReturnValue(db);

    await markRoutineReady('r1');

    expect(getPowerSyncMock).toHaveBeenCalledTimes(1);
  });
});

describe('renameRoutine', () => {
  it('trims and writes only the name', async () => {
    const { db, calls } = fakeDb();

    await renameRoutine('r1', '  Upper Lower  ', db);

    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].table).toBe(routine);
    expect(calls.updates[0].values).toEqual({ name: 'Upper Lower' });
  });

  it('throws on a blank name rather than writing an op the server would reject', async () => {
    const { db, calls } = fakeDb();

    await expect(renameRoutine('r1', '   ', db)).rejects.toThrow('Program name is required');
    expect(calls.updates).toHaveLength(0);
  });

  it('falls back to getPowerSync when no database is passed', async () => {
    const { db } = fakeDb();
    getPowerSyncMock.mockReturnValue(db);

    await renameRoutine('r1', 'Upper Lower');

    expect(getPowerSyncMock).toHaveBeenCalledTimes(1);
  });
});

describe('loadLibraryRoutines', () => {
  it('returns archived rows too — the library is the only surface that can restore them', async () => {
    const { db } = fakeDb([
      {
        table: routine,
        rows: [
          { id: 'r2', name: 'Bravo', status: 'ready', goal: null, archivedAt: '2026-01-01T00:00:00Z', progressionFrozen: false },
          { id: 'r1', name: 'Alpha', status: 'draft', goal: null, archivedAt: null, progressionFrozen: true },
        ],
      },
    ]);

    const rows = await loadLibraryRoutines(db);

    expect(rows.map((row) => row.id)).toEqual(['r1', 'r2']);
    expect(rows[1].archivedAt).toBe('2026-01-01T00:00:00Z');
    expect(rows[0].progressionFrozen).toBe(true);
  });

  it('sorts by name then id so two programs sharing a name have a stable order', async () => {
    const { db } = fakeDb([
      {
        table: routine,
        rows: [
          { id: 'b', name: 'Same', status: 'draft', goal: null, archivedAt: null, progressionFrozen: false },
          { id: 'a', name: 'Same', status: 'draft', goal: null, archivedAt: null, progressionFrozen: false },
          { id: 'c', name: 'Aardvark', status: 'draft', goal: null, archivedAt: null, progressionFrozen: false },
        ],
      },
    ]);

    const rows = await loadLibraryRoutines(db);

    expect(rows.map((row) => row.id)).toEqual(['c', 'a', 'b']);
  });

  it('issues exactly one select', async () => {
    const { db, calls } = fakeDb([{ table: routine, rows: [] }]);

    await loadLibraryRoutines(db);

    expect(calls.selects).toEqual([routine]);
  });

  it('falls back to getPowerSync when no database is passed', async () => {
    const { db } = fakeDb([{ table: routine, rows: [] }]);
    getPowerSyncMock.mockReturnValue(db);

    await expect(loadLibraryRoutines()).resolves.toEqual([]);
    expect(getPowerSyncMock).toHaveBeenCalledTimes(1);
  });
});
