import { isNull } from 'drizzle-orm';
import { createRoutine, loadRoutines } from '../programs/create-routine';
import { getPowerSync } from '../powersync';
import { routine } from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../id', () => ({ generateClientId: jest.fn(() => 'fixed-id') }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;

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
