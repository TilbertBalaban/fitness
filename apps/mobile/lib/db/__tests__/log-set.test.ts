import { logSet } from '../log-set';
import { getPowerSync } from '../powersync';

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
