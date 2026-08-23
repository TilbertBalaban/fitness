import { generateClientId } from '../id';
import { ORDER_INDEX_GAP } from '../programs/order-index';
import { duplicateDay, duplicateRoutine } from '../programs/duplicate-routine';
import { getPowerSync } from '../powersync';
import {
  routine,
  routineCycle,
  routineDay,
  routineExercise,
  routineExerciseCycleTarget,
  userPreference,
} from '../schema';

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
jest.mock('../id', () => ({ generateClientId: jest.fn() }));

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

function fakeDb(tableRows: TableRows[] = []) {
  const calls: RecordedCalls = { selects: [], inserts: [], updates: [], deletes: [] };
  const rowsFor = (table: unknown) => tableRows.find((entry) => entry.table === table)?.rows ?? [];

  const db = {
    select: () => ({
      from: (table: unknown) => {
        calls.selects.push(table);
        const resolved = Promise.resolve(rowsFor(table));
        return { where: () => resolved, then: resolved.then.bind(resolved) };
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
    transaction: runInFakeTransaction,
  } as unknown as ReturnType<typeof getPowerSync>;

  return { db, calls };
}

// 2 cycles, 3 days, 6 exercises (2 per day), 4 overrides. Every id in this fixture is prefixed
// `src-` so the "no inserted foreign key points back at the source" assertion below can recognise a
// source id structurally, not by enumerating a hand-written list that could drift from the fixture.
function sourceFixture(exercisesPerDay = 2): TableRows[] {
  const days = ['src-d1', 'src-d2', 'src-d3'];
  const exerciseRows: Record<string, unknown>[] = [];
  const overrideRows: Record<string, unknown>[] = [];

  days.forEach((dayId, dayIndex) => {
    for (let slot = 0; slot < exercisesPerDay; slot += 1) {
      const id = `src-e${dayIndex}-${slot}`;
      exerciseRows.push({
        id,
        routineDayId: dayId,
        orderIndex: (slot + 1) * ORDER_INDEX_GAP,
        exerciseId: `cat-${dayIndex}-${slot}`,
        targetSets: slot === 0 ? 3 : null,
        targetRepMin: slot === 0 ? 8 : null,
        targetRepMax: slot === 0 ? 12 : null,
        targetRir: slot === 0 ? 2 : null,
        targetRestSeconds: slot === 0 ? 120 : null,
      });
    }
  });

  // Four overrides across the first two exercises of the first two days, split over both cycles —
  // enough to prove both parent columns (routine_exercise_id AND cycle_id) get remapped.
  const overrideTargets: [string, string][] = [
    ['src-e0-0', 'src-c1'],
    ['src-e0-0', 'src-c2'],
    ['src-e0-1', 'src-c1'],
    ['src-e1-0', 'src-c2'],
  ];
  for (const [routineExerciseId, cycleId] of overrideTargets) {
    overrideRows.push({
      routineExerciseId,
      cycleId,
      targetSets: 4,
      targetRepMin: 5,
      targetRepMax: 5,
      targetRir: 1,
      targetRestSeconds: 180,
    });
  }

  return [
    { table: routine, rows: [{ id: 'src-r1', name: 'PPL', goal: 'hypertrophy', status: 'ready' }] },
    {
      table: routineDay,
      rows: days.map((id, index) => ({
        id,
        orderIndex: (index + 1) * ORDER_INDEX_GAP,
        name: `Day ${index + 1}`,
        isRestDay: false,
        routineId: 'src-r1',
      })),
    },
    { table: routineExercise, rows: exerciseRows },
    {
      table: routineCycle,
      rows: [
        { id: 'src-c1', name: 'Week 1', kind: 'training', orderIndex: ORDER_INDEX_GAP, durationDays: null },
        { id: 'src-c2', name: 'Deload', kind: 'deload', orderIndex: ORDER_INDEX_GAP * 2, durationDays: null },
      ],
    },
    { table: routineExerciseCycleTarget, rows: overrideRows },
  ];
}

function insertedIds(calls: RecordedCalls): string[] {
  return calls.inserts.map((insert) => insert.values.id as string);
}

function insertsFor(calls: RecordedCalls, table: unknown) {
  return calls.inserts.filter((insert) => insert.table === table);
}

let nextId = 0;

beforeEach(() => {
  nextId = 0;
  getPowerSyncMock.mockReset();
  generateClientIdMock.mockReset();
  generateClientIdMock.mockImplementation(() => {
    nextId += 1;
    return `new-${nextId}`;
  });
});

describe('duplicateRoutine', () => {
  it('inserts exactly one row per source row across all five tables', async () => {
    const { db, calls } = fakeDb(sourceFixture());

    await duplicateRoutine({ sourceRoutineId: 'src-r1', name: 'PPL copy' }, db);

    expect(insertsFor(calls, routine)).toHaveLength(1);
    expect(insertsFor(calls, routineCycle)).toHaveLength(2);
    expect(insertsFor(calls, routineDay)).toHaveLength(3);
    expect(insertsFor(calls, routineExercise)).toHaveLength(6);
    expect(insertsFor(calls, routineExerciseCycleTarget)).toHaveLength(4);
    expect(calls.inserts).toHaveLength(1 + 2 + 3 + 6 + 4);
  });

  it('gives every inserted row an id distinct from every source id and from every other insert', async () => {
    const { db, calls } = fakeDb(sourceFixture());

    await duplicateRoutine({ sourceRoutineId: 'src-r1', name: 'PPL copy' }, db);

    const ids = insertedIds(calls);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith('src-'))).toEqual([]);
  });

  // The one assertion that catches a missed entry in an id map. A foreign key rewritten from the
  // wrong map, or not rewritten at all, produces a copy whose children point back into the source
  // program — invisible until the user edits one copy and both change.
  it('never lets a copied foreign key point at a source row', async () => {
    const { db, calls } = fakeDb(sourceFixture());

    await duplicateRoutine({ sourceRoutineId: 'src-r1', name: 'PPL copy' }, db);

    const foreignKeyFields = ['routineId', 'routineDayId', 'cycleId', 'routineExerciseId'] as const;
    const sourceIds = new Set<string>([
      'src-r1',
      'src-c1',
      'src-c2',
      'src-d1',
      'src-d2',
      'src-d3',
      ...Array.from({ length: 3 }, (_, day) => [`src-e${day}-0`, `src-e${day}-1`]).flat(),
    ]);

    for (const insert of calls.inserts) {
      for (const field of foreignKeyFields) {
        const value = insert.values[field];
        if (typeof value !== 'string') continue;
        expect(sourceIds.has(value)).toBe(false);
      }
    }
  });

  it('rewrites both parents of every override — the exercise and the cycle', async () => {
    const { db, calls } = fakeDb(sourceFixture());

    await duplicateRoutine({ sourceRoutineId: 'src-r1', name: 'PPL copy' }, db);

    const copiedExerciseIds = new Set(insertsFor(calls, routineExercise).map((insert) => insert.values.id));
    const copiedCycleIds = new Set(insertsFor(calls, routineCycle).map((insert) => insert.values.id));

    const overrides = insertsFor(calls, routineExerciseCycleTarget);
    expect(overrides).toHaveLength(4);
    for (const override of overrides) {
      expect(copiedExerciseIds.has(override.values.routineExerciseId)).toBe(true);
      expect(copiedCycleIds.has(override.values.cycleId)).toBe(true);
    }

    // Both cycles are still represented after the remap — a single shared cycle id would satisfy
    // the membership checks above while silently collapsing the two cycles into one.
    expect(new Set(overrides.map((override) => override.values.cycleId)).size).toBe(2);
  });

  it('starts the copy as an unfrozen, unarchived draft that records its source', async () => {
    const { db, calls } = fakeDb(sourceFixture());

    const result = await duplicateRoutine({ sourceRoutineId: 'src-r1', name: '  PPL copy  ' }, db);

    const [copied] = insertsFor(calls, routine);
    expect(copied.values).toEqual({
      id: result.id,
      name: 'PPL copy',
      goal: 'hypertrophy',
      status: 'draft',
      progressionFrozen: false,
      source: 'user',
      createdFromTemplateId: 'src-r1',
      archivedAt: null,
    });
  });

  it('writes nothing to user_preference — duplicating never changes which program is active', async () => {
    const { db, calls } = fakeDb([
      ...sourceFixture(),
      { table: userPreference, rows: [{ id: 'u1', activeRoutineId: 'src-r1' }] },
    ]);

    await duplicateRoutine({ sourceRoutineId: 'src-r1', name: 'PPL copy' }, db);

    expect(calls.inserts.filter((insert) => insert.table === userPreference)).toEqual([]);
    expect(calls.updates.filter((update) => update.table === userPreference)).toEqual([]);
    expect(calls.selects).not.toContain(userPreference);
  });

  it('preserves the source order indexes for days and cycles rather than renumbering', async () => {
    const { db, calls } = fakeDb(sourceFixture());

    await duplicateRoutine({ sourceRoutineId: 'src-r1', name: 'PPL copy' }, db);

    expect(insertsFor(calls, routineDay).map((insert) => insert.values.orderIndex)).toEqual([
      ORDER_INDEX_GAP,
      ORDER_INDEX_GAP * 2,
      ORDER_INDEX_GAP * 3,
    ]);
    expect(insertsFor(calls, routineCycle).map((insert) => insert.values.orderIndex)).toEqual([
      ORDER_INDEX_GAP,
      ORDER_INDEX_GAP * 2,
    ]);
  });

  it('copies every target field unchanged, nulls included', async () => {
    const { db, calls } = fakeDb(sourceFixture());

    await duplicateRoutine({ sourceRoutineId: 'src-r1', name: 'PPL copy' }, db);

    const exercises = insertsFor(calls, routineExercise);
    const prescribed = exercises.filter((insert) => insert.values.targetSets !== null);
    const unprescribed = exercises.filter((insert) => insert.values.targetSets === null);

    expect(prescribed).toHaveLength(3);
    expect(prescribed[0].values).toMatchObject({
      targetSets: 3,
      targetRepMin: 8,
      targetRepMax: 12,
      targetRir: 2,
      targetRestSeconds: 120,
    });
    expect(unprescribed).toHaveLength(3);
    expect(unprescribed[0].values).toMatchObject({
      targetSets: null,
      targetRepMin: null,
      targetRepMax: null,
      targetRir: null,
      targetRestSeconds: null,
    });
  });

  it('copies a source with zero days as a single row without throwing', async () => {
    const { db, calls } = fakeDb([
      { table: routine, rows: [{ id: 'src-r1', name: 'Empty', goal: null, status: 'draft' }] },
      { table: routineDay, rows: [] },
      { table: routineCycle, rows: [] },
    ]);

    await expect(duplicateRoutine({ sourceRoutineId: 'src-r1', name: 'Empty copy' }, db)).resolves.toBeDefined();
    expect(calls.inserts).toHaveLength(1);
  });

  it('issues the same number of selects for a 3-exercise and a 30-exercise source', async () => {
    const small = fakeDb(sourceFixture(1));
    const large = fakeDb(sourceFixture(10));

    await duplicateRoutine({ sourceRoutineId: 'src-r1', name: 'a' }, small.db);
    nextId = 0;
    await duplicateRoutine({ sourceRoutineId: 'src-r1', name: 'b' }, large.db);

    expect(small.calls.inserts.filter((insert) => insert.table === routineExercise)).toHaveLength(3);
    expect(large.calls.inserts.filter((insert) => insert.table === routineExercise)).toHaveLength(30);
    expect(large.calls.selects).toHaveLength(small.calls.selects.length);
  });

  it('rejects a blank name rather than writing an op the server would reject', async () => {
    const { db, calls } = fakeDb(sourceFixture());

    await expect(duplicateRoutine({ sourceRoutineId: 'src-r1', name: '   ' }, db)).rejects.toThrow(
      'Program name is required',
    );
    expect(calls.inserts).toHaveLength(0);
  });

  it('throws when the source program does not exist', async () => {
    const { db } = fakeDb([{ table: routine, rows: [] }]);

    await expect(duplicateRoutine({ sourceRoutineId: 'gone', name: 'copy' }, db)).rejects.toThrow('Program not found');
  });

  it('falls back to getPowerSync when no database is passed', async () => {
    const { db } = fakeDb(sourceFixture());
    getPowerSyncMock.mockReturnValue(db);

    await duplicateRoutine({ sourceRoutineId: 'src-r1', name: 'PPL copy' });

    expect(getPowerSyncMock).toHaveBeenCalledTimes(1);
  });
});

describe('duplicateDay', () => {
  function dayFixture(): TableRows[] {
    return [
      {
        table: routineDay,
        rows: [
          { id: 'src-d1', routineId: 'src-r1', orderIndex: ORDER_INDEX_GAP, name: 'Push', isRestDay: false },
          { id: 'src-d2', routineId: 'src-r1', orderIndex: ORDER_INDEX_GAP * 2, name: 'Pull', isRestDay: false },
        ],
      },
      {
        table: routineExercise,
        rows: [
          {
            id: 'src-e1',
            routineDayId: 'src-d1',
            exerciseId: 'cat-1',
            orderIndex: ORDER_INDEX_GAP,
            supersetGroupId: null,
            targetSets: 3,
            targetRepMin: 8,
            targetRepMax: 12,
            targetRir: 2,
            targetRestSeconds: 120,
            progressionSchemeId: null,
            notes: null,
          },
          {
            id: 'src-e2',
            routineDayId: 'src-d1',
            exerciseId: 'cat-2',
            orderIndex: ORDER_INDEX_GAP * 2,
            supersetGroupId: null,
            targetSets: null,
            targetRepMin: null,
            targetRepMax: null,
            targetRir: null,
            targetRestSeconds: null,
            progressionSchemeId: null,
            notes: 'keep the elbows tucked',
          },
        ],
      },
      {
        table: routineExerciseCycleTarget,
        rows: [
          {
            id: 'src-o1',
            routineExerciseId: 'src-e1',
            cycleId: 'src-c1',
            targetSets: 2,
            targetRepMin: 5,
            targetRepMax: 5,
            targetRir: 3,
            targetRestSeconds: null,
          },
        ],
      },
    ];
  }

  it('inserts the day, its exercises and their overrides with fresh ids', async () => {
    const { db, calls } = fakeDb(dayFixture());

    await duplicateDay({ routineDayId: 'src-d1', name: 'Push (copy)' }, db);

    expect(insertsFor(calls, routineDay)).toHaveLength(1);
    expect(insertsFor(calls, routineExercise)).toHaveLength(2);
    expect(insertsFor(calls, routineExerciseCycleTarget)).toHaveLength(1);
    expect(insertedIds(calls).filter((id) => id.startsWith('src-'))).toEqual([]);
  });

  it('appends the copy after the last existing day', async () => {
    const { db, calls } = fakeDb(dayFixture());

    await duplicateDay({ routineDayId: 'src-d1', name: 'Push (copy)' }, db);

    const [day] = insertsFor(calls, routineDay);
    expect(day.values).toMatchObject({
      routineId: 'src-r1',
      orderIndex: ORDER_INDEX_GAP * 3,
      name: 'Push (copy)',
      isRestDay: false,
    });
  });

  it('rewrites routineDayId and routineExerciseId but leaves cycleId alone — the copy shares the program cycles', async () => {
    const { db, calls } = fakeDb(dayFixture());

    await duplicateDay({ routineDayId: 'src-d1', name: 'Push (copy)' }, db);

    const [newDay] = insertsFor(calls, routineDay);
    const copiedExerciseIds = new Set(insertsFor(calls, routineExercise).map((insert) => insert.values.id));

    for (const insert of insertsFor(calls, routineExercise)) {
      expect(insert.values.routineDayId).toBe(newDay.values.id);
    }

    const [override] = insertsFor(calls, routineExerciseCycleTarget);
    expect(copiedExerciseIds.has(override.values.routineExerciseId)).toBe(true);
    expect(override.values.cycleId).toBe('src-c1');
  });

  it('copies every exercise column the source carried, including notes', async () => {
    const { db, calls } = fakeDb(dayFixture());

    await duplicateDay({ routineDayId: 'src-d1', name: 'Push (copy)' }, db);

    const exercises = insertsFor(calls, routineExercise);
    expect(exercises[0].values).toMatchObject({
      exerciseId: 'cat-1',
      orderIndex: ORDER_INDEX_GAP,
      targetSets: 3,
      targetRir: 2,
    });
    expect(exercises[1].values).toMatchObject({
      exerciseId: 'cat-2',
      notes: 'keep the elbows tucked',
      targetSets: null,
    });
  });

  it('copies a day with zero exercises as a single row', async () => {
    const { db, calls } = fakeDb([
      {
        table: routineDay,
        rows: [{ id: 'src-d1', routineId: 'src-r1', orderIndex: ORDER_INDEX_GAP, name: 'Rest', isRestDay: true }],
      },
      { table: routineExercise, rows: [] },
    ]);

    await duplicateDay({ routineDayId: 'src-d1', name: 'Rest (copy)' }, db);

    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0].values).toMatchObject({ isRestDay: true, name: 'Rest (copy)' });
  });

  it('rejects a blank name', async () => {
    const { db, calls } = fakeDb(dayFixture());

    await expect(duplicateDay({ routineDayId: 'src-d1', name: '  ' }, db)).rejects.toThrow('Day name is required');
    expect(calls.inserts).toHaveLength(0);
  });

  it('throws when the day does not exist', async () => {
    const { db } = fakeDb([{ table: routineDay, rows: [] }]);

    await expect(duplicateDay({ routineDayId: 'gone', name: 'copy' }, db)).rejects.toThrow('Day not found');
  });

  it('falls back to getPowerSync when no database is passed', async () => {
    const { db } = fakeDb(dayFixture());
    getPowerSyncMock.mockReturnValue(db);

    await duplicateDay({ routineDayId: 'src-d1', name: 'Push (copy)' });

    expect(getPowerSyncMock).toHaveBeenCalledTimes(1);
  });
});

// WR-10: every insert ran as an independent await, so an app backgrounded and killed mid-loop left
// a routine row with some days, one partially-populated day and no cycles — a half-copy that looks
// like a real program in the library and can be activated.
describe('duplication is one unit (WR-10)', () => {
  it('writes the whole routine copy inside exactly one transaction', async () => {
    const { db, calls } = fakeDb(sourceFixture());

    await duplicateRoutine({ sourceRoutineId: 'src-r1', name: 'PPL copy' }, db);

    expect(transactionCount).toBe(1);
    expect(calls.inserts.length).toBeGreaterThan(1);
  });

  it('opens no transaction when the source does not exist — nothing is written to roll back', async () => {
    const { db, calls } = fakeDb([]);

    await expect(duplicateRoutine({ sourceRoutineId: 'missing', name: 'Copy' }, db)).rejects.toThrow(
      'Program not found',
    );
    expect(transactionCount).toBe(0);
    expect(calls.inserts).toHaveLength(0);
  });

  it('opens no transaction for a blank name — validation precedes the write', async () => {
    const { db } = fakeDb(sourceFixture());

    await expect(duplicateRoutine({ sourceRoutineId: 'src-r1', name: '  ' }, db)).rejects.toThrow();
    expect(transactionCount).toBe(0);
  });
});

