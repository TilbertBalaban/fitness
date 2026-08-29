import type { GeneratedProgramTree } from '@fitness/program-generator';
import { generateClientId } from '../id';
import { getPowerSync } from '../powersync';
import { materializeGeneratedProgram } from '../programs/materialize-generated-program';
import { routine, routineCycle, routineDay, routineExercise, routineExerciseCycleTarget } from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../id', () => ({ generateClientId: jest.fn() }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;
const generateClientIdMock = generateClientId as jest.MockedFunction<typeof generateClientId>;

let transactionCount = 0;

async function runInFakeTransaction(this: unknown, run: (tx: unknown) => Promise<unknown>) {
  transactionCount += 1;
  return run(this);
}

interface RecordedInsert {
  table: unknown;
  values: Record<string, unknown>;
}

function fakeDb() {
  const inserts: RecordedInsert[] = [];
  const db = {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        return Promise.resolve();
      },
    }),
    transaction: runInFakeTransaction,
  } as unknown as ReturnType<typeof getPowerSync>;

  return { db, inserts };
}

function insertsFor(inserts: RecordedInsert[], table: unknown) {
  return inserts.filter((insert) => insert.table === table);
}

function fixtureTree(overrides: Partial<GeneratedProgramTree> = {}): GeneratedProgramTree {
  return {
    name: 'Generated Program',
    goal: 'Hypertrophy',
    cycles: [
      { key: 'cycle-0', name: 'Cycle 1', kind: 'training', orderIndex: 1024, durationDays: null },
      { key: 'cycle-1', name: 'Cycle 2', kind: 'training', orderIndex: 2048, durationDays: null },
    ],
    days: [
      {
        key: 'day-0',
        name: 'Full Body A',
        orderIndex: 1024,
        isRestDay: false,
        slots: [
          {
            key: 'day-0-slot-1024',
            exerciseId: 'ex-chest',
            orderIndex: 1024,
            base: { targetSets: 3, targetRepMin: 8, targetRepMax: 12, targetRir: 3, targetRestSeconds: 120 },
            overridesByCycleKey: {
              'cycle-1': { targetSets: 4, targetRir: 1 },
            },
          },
          {
            key: 'day-0-slot-2048',
            exerciseId: 'ex-lats',
            orderIndex: 2048,
            base: { targetSets: 3, targetRepMin: 8, targetRepMax: 12, targetRir: 3, targetRestSeconds: 120 },
            // Cycle-1's override equals the base — must produce no row for this pair.
            overridesByCycleKey: {},
          },
        ],
      },
    ],
    degradations: [],
    ...overrides,
  };
}

let nextId = 0;

beforeEach(() => {
  nextId = 0;
  transactionCount = 0;
  getPowerSyncMock.mockReset();
  generateClientIdMock.mockReset();
  generateClientIdMock.mockImplementation(() => {
    nextId += 1;
    return `new-${nextId}`;
  });
});

describe('materializeGeneratedProgram', () => {
  it('inserts exactly one routine row, one row per cycle, one per day, one per slot, and one per non-empty override, in a single transaction', async () => {
    const { db, inserts } = fakeDb();

    await materializeGeneratedProgram({ tree: fixtureTree(), name: 'My Program' }, db);

    expect(insertsFor(inserts, routine)).toHaveLength(1);
    expect(insertsFor(inserts, routineCycle)).toHaveLength(2);
    expect(insertsFor(inserts, routineDay)).toHaveLength(1);
    expect(insertsFor(inserts, routineExercise)).toHaveLength(2);
    expect(insertsFor(inserts, routineExerciseCycleTarget)).toHaveLength(1);
    expect(transactionCount).toBe(1);
  });

  it('writes status draft and source user, and no new column or vocabulary value', async () => {
    const { db, inserts } = fakeDb();

    await materializeGeneratedProgram({ tree: fixtureTree(), name: 'My Program' }, db);

    const routineInsert = insertsFor(inserts, routine)[0]!;
    expect(routineInsert.values.status).toBe('draft');
    expect(routineInsert.values.source).toBe('user');
  });

  it('rewrites every foreign key through the id map that owns it', async () => {
    const { db, inserts } = fakeDb();

    await materializeGeneratedProgram({ tree: fixtureTree(), name: 'My Program' }, db);

    const routineInsert = insertsFor(inserts, routine)[0]!;
    const cycleInserts = insertsFor(inserts, routineCycle);
    const dayInsert = insertsFor(inserts, routineDay)[0]!;
    const exerciseInserts = insertsFor(inserts, routineExercise);
    const overrideInsert = insertsFor(inserts, routineExerciseCycleTarget)[0]!;

    for (const cycleInsert of cycleInserts) {
      expect(cycleInsert.values.routineId).toBe(routineInsert.values.id);
    }
    expect(dayInsert.values.routineId).toBe(routineInsert.values.id);
    for (const exerciseInsert of exerciseInserts) {
      expect(exerciseInsert.values.routineDayId).toBe(dayInsert.values.id);
    }
    expect(overrideInsert.values.routineExerciseId).toBe(exerciseInserts[0]!.values.id);
    expect(overrideInsert.values.cycleId).toBe(cycleInserts[1]!.values.id);
  });

  it('emits no override row for a cycle whose override equals the base', async () => {
    const { db, inserts } = fakeDb();

    await materializeGeneratedProgram({ tree: fixtureTree(), name: 'My Program' }, db);

    const overrideInserts = insertsFor(inserts, routineExerciseCycleTarget);
    expect(overrideInserts.every((insert) => insert.values.routineExerciseId !== 'ex-lats')).toBe(true);
    expect(overrideInserts).toHaveLength(1);
  });

  it('throws on a whitespace-only name before opening the transaction and writes nothing', async () => {
    const { db, inserts } = fakeDb();

    await expect(materializeGeneratedProgram({ tree: fixtureTree(), name: '   ' }, db)).rejects.toThrow(
      'Program name is required',
    );

    expect(inserts).toHaveLength(0);
    expect(transactionCount).toBe(0);
  });
});
