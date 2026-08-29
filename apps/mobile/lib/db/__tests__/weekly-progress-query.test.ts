// getPowerSync's real module chain reaches @powersync/react-native -> @powersync/shared-internals,
// whose ESM dist Jest cannot parse (WINDOWS #22/#33) — mocked before the reader is imported.
jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));
// loadNextUp is the shipped program read this module deliberately reuses rather than re-deriving.
// Mocking it here keeps this suite measuring THIS reader's own query count: the program side's
// bounded-ness is already asserted by next-up-query's own tests.
jest.mock('../programs/next-up-query', () => ({ loadNextUp: jest.fn() }));

import type { TargetOverride } from '@fitness/api-contracts';
import { loadWeeklyProgress } from '../weekly-progress-query';
import { loadNextUp, type NextUpData } from '../programs/next-up-query';
import { getPowerSync } from '../powersync';

type Row = Record<string, unknown>;

const loadNextUpMock = loadNextUp as jest.MockedFunction<typeof loadNextUp>;

// Returns each queued result set in turn and counts the selects issued, plus every WHERE condition
// it was handed — so "a bounded number of queries however many rows match" is asserted against the
// real call sequence rather than assumed. Copied from exercise-history-query.test.ts's own fakeDb.
function fakeDb(results: Row[][]) {
  let selectCount = 0;
  const conditions: unknown[] = [];

  const resultFor = () => results[selectCount - 1] ?? [];

  const db = {
    select: () => {
      selectCount++;
      const terminal = () => {
        const pending = Promise.resolve(resultFor());
        return Object.assign(pending, {
          where: (condition: unknown) => {
            conditions.push(condition);
            return Object.assign(Promise.resolve(resultFor()), { orderBy: () => Promise.resolve(resultFor()) });
          },
          orderBy: () => Promise.resolve(resultFor()),
          innerJoin: () => terminal(),
        });
      };
      return { from: () => terminal() };
    },
  } as unknown as ReturnType<typeof getPowerSync>;

  return { db, getSelectCount: () => selectCount, conditions };
}

// Drizzle builds a WHERE clause as a tree of SQL chunks holding Param nodes; the bound values are
// what this suite needs to see, and reaching them is the only way to prove the boundary WITHOUT a
// real database. The browser spec proves the same boundary end to end from the DOM.
function boundValues(condition: unknown): string[] {
  const seen = new WeakSet<object>();
  const values: string[] = [];

  function walk(node: unknown): void {
    if (node === null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }

    const record = node as Record<string, unknown>;
    if (typeof record.value === 'string') values.push(record.value);
    for (const child of Object.values(record)) walk(child);
  }

  walk(condition);
  return values;
}

const TODAY = '2026-08-29';
// rollingWindowStart(TODAY, PROGRESS_WINDOW_DAYS) — the inclusive first day of the rolling window.
// 2026-08-29 is a Saturday, so a calendar-week derivation would land on 2026-08-24 instead.
const WINDOW_START = '2026-08-23';

const CYCLE_ID = 'cyc-1';

function slot(id: string, exerciseId: string, targetSets: number | null, overrides: Record<string, TargetOverride> = {}) {
  return {
    id,
    orderIndex: 1024,
    exerciseId,
    exerciseName: exerciseId,
    targetSets,
    targetRepMin: null,
    targetRepMax: null,
    targetRir: null,
    targetRestSeconds: null,
    overridesByCycleId: overrides,
  };
}

function nextUpData(overrides: Partial<NextUpData> = {}): NextUpData {
  return {
    routine: { id: 'r-1', name: 'Push Pull' },
    days: [
      {
        id: 'day-1',
        orderIndex: 1024,
        name: 'Push',
        isRestDay: false,
        slots: [slot('rx-1', 'ex-1', 4), slot('rx-2', 'ex-2', 3)],
      },
      {
        id: 'day-2',
        orderIndex: 2048,
        name: 'Pull',
        isRestDay: false,
        slots: [slot('rx-3', 'ex-3', 5, { [CYCLE_ID]: { targetSets: 6 } })],
      },
    ],
    cycles: [{ id: CYCLE_ID, name: 'Week 1', kind: 'training' as const, orderIndex: 1024, durationDays: null }],
    history: [],
    musclesByExerciseId: {},
    today: TODAY,
    ...overrides,
  };
}

const SESSION_ROWS: Row[] = [{ id: 'sess-1', localDate: '2026-08-27' }];

const SESSION_EXERCISE_ROWS: Row[] = [
  { id: 'se-1', sessionId: 'sess-1', exerciseId: 'ex-1' },
  { id: 'se-2', sessionId: 'sess-1', exerciseId: 'ex-9' },
];

const SET_ROWS: Row[] = [
  { id: 'ls-1', sessionExerciseId: 'se-1', setType: 'normal', completed: true, parentSetId: null },
  { id: 'ls-2', sessionExerciseId: 'se-1', setType: 'warmup', completed: true, parentSetId: null },
  { id: 'ls-3', sessionExerciseId: 'se-2', setType: 'normal', completed: true, parentSetId: null },
];

const MAPPING_ROWS: Row[] = [
  { exerciseId: 'ex-1', muscleGroupId: 'mg-chest' },
  { exerciseId: 'ex-2', muscleGroupId: 'mg-back' },
  { exerciseId: 'ex-3', muscleGroupId: 'mg-quads' },
  { exerciseId: 'ex-9', muscleGroupId: 'mg-calves' },
];

const FULL_RESULTS = [SESSION_ROWS, SESSION_EXERCISE_ROWS, SET_ROWS, MAPPING_ROWS];

beforeEach(() => {
  (getPowerSync as jest.MockedFunction<typeof getPowerSync>).mockReset();
  loadNextUpMock.mockReset();
  loadNextUpMock.mockResolvedValue(nextUpData());
});

describe('loadWeeklyProgress', () => {
  it('returns a neutral empty result when nobody is signed in, without reading anything', async () => {
    const { db, getSelectCount } = fakeDb(FULL_RESULTS);

    await expect(loadWeeklyProgress({ userId: null, todayLocalDate: TODAY }, db)).resolves.toEqual({
      sessions: [],
      programTarget: null,
    });
    expect(getSelectCount()).toBe(0);
    expect(loadNextUpMock).not.toHaveBeenCalled();
  });

  it('nests each session, its exercises and their sets in the shape the pure aggregation reads', async () => {
    const { db } = fakeDb(FULL_RESULTS);

    const { sessions } = await loadWeeklyProgress({ userId: 'u-1', todayLocalDate: TODAY }, db);

    expect(sessions).toEqual([
      {
        sessionId: 'sess-1',
        localDate: '2026-08-27',
        exercises: [
          {
            exerciseId: 'ex-1',
            primaryMuscleGroupIds: ['mg-chest'],
            sets: [
              { id: 'ls-1', setType: 'normal', completed: true, parentSetId: null },
              { id: 'ls-2', setType: 'warmup', completed: true, parentSetId: null },
            ],
          },
          {
            exerciseId: 'ex-9',
            primaryMuscleGroupIds: ['mg-calves'],
            sets: [{ id: 'ls-3', setType: 'normal', completed: true, parentSetId: null }],
          },
        ],
      },
    ]);
  });

  it('bounds the session read at the rolling window start, never at a calendar week boundary', async () => {
    const { db, conditions } = fakeDb(FULL_RESULTS);

    await loadWeeklyProgress({ userId: 'u-1', todayLocalDate: TODAY }, db);

    expect(boundValues(conditions[0])).toContain(WINDOW_START);
  });

  it('reads only completed sessions — an in-progress or discarded one contributes nothing', async () => {
    const { db, conditions } = fakeDb(FULL_RESULTS);

    await loadWeeklyProgress({ userId: 'u-1', todayLocalDate: TODAY }, db);

    expect(boundValues(conditions[0])).toContain('completed');
  });

  it('restricts the muscle read to primary mappings, so a secondary can never inflate the count', async () => {
    const { db, conditions } = fakeDb(FULL_RESULTS);

    await loadWeeklyProgress({ userId: 'u-1', todayLocalDate: TODAY }, db);

    const mappingBounds = boundValues(conditions[conditions.length - 1]);
    expect(mappingBounds).toContain('primary');
    expect(mappingBounds).not.toContain('secondary');
  });

  it('covers both the trained and the programmed exercises in one batched muscle read', async () => {
    const { db, conditions } = fakeDb(FULL_RESULTS);

    const { programTarget } = await loadWeeklyProgress({ userId: 'u-1', todayLocalDate: TODAY }, db);

    const mappingBounds = boundValues(conditions[conditions.length - 1]);
    // ex-9 was trained but is not programmed; ex-2 and ex-3 are programmed but were not trained.
    for (const exerciseId of ['ex-1', 'ex-2', 'ex-3', 'ex-9']) expect(mappingBounds).toContain(exerciseId);
    expect(programTarget?.days[0].slots[1].primaryMuscleGroupIds).toEqual(['mg-back']);
  });

  it('issues the same four queries however many sessions, exercises and sets fall in the window', async () => {
    const manySessions = Array.from({ length: 40 }, (_, index) => ({
      id: `sess-${index}`,
      localDate: `2026-08-2${index % 7}`,
    }));
    const manyExercises = manySessions.map((session, index) => ({
      id: `se-${index}`,
      sessionId: session.id,
      exerciseId: `ex-${index}`,
    }));
    const manySets = manyExercises.map((row, index) => ({
      id: `ls-${index}`,
      sessionExerciseId: row.id,
      setType: 'normal',
      completed: true,
      parentSetId: null,
    }));
    const { db, getSelectCount } = fakeDb([manySessions, manyExercises, manySets, MAPPING_ROWS]);

    const { sessions } = await loadWeeklyProgress({ userId: 'u-1', todayLocalDate: TODAY }, db);

    expect(sessions).toHaveLength(40);
    expect(getSelectCount()).toBe(4);
  });

  it('skips the exercise and set reads when no session falls in the window', async () => {
    const { db, getSelectCount } = fakeDb([[], SESSION_EXERCISE_ROWS, SET_ROWS, MAPPING_ROWS]);

    const { sessions, programTarget } = await loadWeeklyProgress({ userId: 'u-1', todayLocalDate: TODAY }, db);

    expect(sessions).toEqual([]);
    // The program side is still read in full, so the card can still show what was prescribed.
    expect(programTarget).not.toBeNull();
    expect(getSelectCount()).toBe(2);
  });

  it('resolves each slot against the current cycle, so an override beats the base prescription', async () => {
    const { db } = fakeDb(FULL_RESULTS);

    const { programTarget } = await loadWeeklyProgress({ userId: 'u-1', todayLocalDate: TODAY }, db);

    expect(programTarget).toEqual({
      days: [
        {
          slots: [
            { exerciseId: 'ex-1', targetSets: 4, primaryMuscleGroupIds: ['mg-chest'] },
            { exerciseId: 'ex-2', targetSets: 3, primaryMuscleGroupIds: ['mg-back'] },
          ],
        },
        { slots: [{ exerciseId: 'ex-3', targetSets: 6, primaryMuscleGroupIds: ['mg-quads'] }] },
      ],
    });
  });

  it('uses the base target where the current cycle expresses no override for that slot', async () => {
    loadNextUpMock.mockResolvedValue(
      nextUpData({
        days: [{ id: 'day-1', orderIndex: 1024, name: 'Push', isRestDay: false, slots: [slot('rx-3', 'ex-3', 5, { 'cyc-other': { targetSets: 9 } })] }],
      }),
    );
    const { db } = fakeDb(FULL_RESULTS);

    const { programTarget } = await loadWeeklyProgress({ userId: 'u-1', todayLocalDate: TODAY }, db);

    expect(programTarget?.days[0].slots[0].targetSets).toBe(5);
  });

  it('carries an untargeted slot through as a null target rather than inventing one', async () => {
    loadNextUpMock.mockResolvedValue(
      nextUpData({
        days: [{ id: 'day-1', orderIndex: 1024, name: 'Push', isRestDay: false, slots: [slot('rx-1', 'ex-1', null)] }],
      }),
    );
    const { db } = fakeDb(FULL_RESULTS);

    const { programTarget } = await loadWeeklyProgress({ userId: 'u-1', todayLocalDate: TODAY }, db);

    expect(programTarget?.days[0].slots[0].targetSets).toBeNull();
  });

  it('carries a rest day through as a day with no slots, contributing nothing to the target', async () => {
    loadNextUpMock.mockResolvedValue(
      nextUpData({
        days: [
          { id: 'day-1', orderIndex: 1024, name: 'Push', isRestDay: false, slots: [slot('rx-1', 'ex-1', 4)] },
          { id: 'day-2', orderIndex: 2048, name: 'Rest', isRestDay: true, slots: [] },
        ],
      }),
    );
    const { db } = fakeDb(FULL_RESULTS);

    const { programTarget } = await loadWeeklyProgress({ userId: 'u-1', todayLocalDate: TODAY }, db);

    expect(programTarget?.days[1]).toEqual({ slots: [] });
  });

  it('returns a null target with the session side still fully populated when no program is active', async () => {
    loadNextUpMock.mockResolvedValue(nextUpData({ routine: null, days: [], cycles: [] }));
    const { db } = fakeDb(FULL_RESULTS);

    const { sessions, programTarget } = await loadWeeklyProgress({ userId: 'u-1', todayLocalDate: TODAY }, db);

    expect(programTarget).toBeNull();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].exercises).toHaveLength(2);
  });

  it('returns a null target when the program has finished its last cycle', async () => {
    loadNextUpMock.mockResolvedValue(
      nextUpData({
        history: [
          { id: 'h-1', routineDayId: 'day-1', status: 'completed', startedAt: '2026-08-01T09:00:00.000Z', localDate: '2026-08-01' },
          { id: 'h-2', routineDayId: 'day-2', status: 'completed', startedAt: '2026-08-02T09:00:00.000Z', localDate: '2026-08-02' },
        ],
      }),
    );
    const { db } = fakeDb(FULL_RESULTS);

    const { sessions, programTarget } = await loadWeeklyProgress({ userId: 'u-1', todayLocalDate: TODAY }, db);

    expect(programTarget).toBeNull();
    expect(sessions).toHaveLength(1);
  });

  it('passes the signed-in user through to the shipped program read', async () => {
    const { db } = fakeDb(FULL_RESULTS);

    await loadWeeklyProgress({ userId: 'u-1', todayLocalDate: TODAY }, db);

    expect(loadNextUpMock).toHaveBeenCalledWith('u-1', db);
  });
});
