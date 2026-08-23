import { loadNextUp } from '../programs/next-up-query';
import { getPowerSync } from '../powersync';
import {
  exercise,
  exerciseMuscleMapping,
  muscleGroup,
  routine,
  routineCycle,
  routineDay,
  routineExercise,
  routineExerciseCycleTarget,
  seededExercise,
  userPreference,
  workoutSession,
} from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;

interface FakeRows {
  preferenceRows?: Record<string, unknown>[];
  routineRows?: Record<string, unknown>[];
  dayRows?: Record<string, unknown>[];
  exerciseRows?: Record<string, unknown>[];
  cycleRows?: Record<string, unknown>[];
  overrideRows?: Record<string, unknown>[];
  sessionRows?: Record<string, unknown>[];
  mappingRows?: Record<string, unknown>[];
  muscleGroupRows?: Record<string, unknown>[];
  seededExerciseRows?: Record<string, unknown>[];
  customExerciseRows?: Record<string, unknown>[];
}

// Counts every select and records which selects carried a where clause, so "the completed filter
// runs in SQL" is asserted structurally rather than by reading the source.
function fakeNextUpDb(rows: FakeRows) {
  let selectCount = 0;
  const whereTables: unknown[] = [];

  function rowsFor(table: unknown): Record<string, unknown>[] {
    if (table === userPreference) return rows.preferenceRows ?? [];
    if (table === routine) return rows.routineRows ?? [];
    if (table === routineDay) return rows.dayRows ?? [];
    if (table === routineExercise) return rows.exerciseRows ?? [];
    if (table === routineCycle) return rows.cycleRows ?? [];
    if (table === routineExerciseCycleTarget) return rows.overrideRows ?? [];
    if (table === workoutSession) return rows.sessionRows ?? [];
    if (table === exerciseMuscleMapping) return rows.mappingRows ?? [];
    if (table === muscleGroup) return rows.muscleGroupRows ?? [];
    if (table === seededExercise) return rows.seededExerciseRows ?? [];
    if (table === exercise) return rows.customExerciseRows ?? [];
    return [];
  }

  const db = {
    select: () => {
      selectCount++;
      return {
        from: (table: unknown) => {
          const pending = Promise.resolve(rowsFor(table));
          return Object.assign(pending, {
            where: () => {
              whereTables.push(table);
              return Promise.resolve(rowsFor(table));
            },
          });
        },
      };
    },
  } as unknown as ReturnType<typeof getPowerSync>;

  return { db, getSelectCount: () => selectCount, getWhereTables: () => whereTables };
}

const USER_ID = 'user-1';
const ACTIVE_PREFERENCE = [{ activeRoutineId: 'r1' }];
const ACTIVE_ROUTINE = [{ id: 'r1', name: 'Push Pull Legs', goal: null, status: 'ready', archivedAt: null }];

function programFixture(exerciseCount: number, sessionCount: number): FakeRows {
  return {
    preferenceRows: ACTIVE_PREFERENCE,
    routineRows: ACTIVE_ROUTINE,
    dayRows: [{ id: 'd1', orderIndex: 1024, name: 'Push', isRestDay: false }],
    exerciseRows: Array.from({ length: exerciseCount }, (_, i) => ({
      id: `re-${i}`,
      routineDayId: 'd1',
      orderIndex: (i + 1) * 1024,
      exerciseId: `ex-${i}`,
      targetSets: null,
      targetRepMin: null,
      targetRepMax: null,
      targetRir: null,
      targetRestSeconds: null,
    })),
    cycleRows: [{ id: 'c1', name: 'Week 1', kind: 'training', orderIndex: 1024, durationDays: null }],
    overrideRows: [],
    sessionRows: Array.from({ length: sessionCount }, (_, i) => ({
      id: `s-${i}`,
      routineDayId: 'd1',
      startedAt: `2026-01-01T0${i % 10}:00:00.000Z`,
      localDate: '2026-01-01',
      status: 'completed',
    })),
    mappingRows: Array.from({ length: exerciseCount }, (_, i) => ({
      exerciseId: `ex-${i}`,
      muscleGroupId: 'mg-chest',
    })),
    muscleGroupRows: [{ id: 'mg-chest', name: 'Chest' }],
    seededExerciseRows: Array.from({ length: exerciseCount }, (_, i) => ({
      id: `ex-${i}`,
      name: `Exercise ${i}`,
    })),
    customExerciseRows: [],
  };
}

describe('loadNextUp — stopping at the pointer', () => {
  it('issues exactly one select and returns a null routine when no user_preference row exists', async () => {
    const { db, getSelectCount } = fakeNextUpDb({ preferenceRows: [] });

    const data = await loadNextUp(USER_ID, db);

    expect(data.routine).toBeNull();
    expect(getSelectCount()).toBe(1);
  });

  it('issues exactly one select when the preference row has a null activeRoutineId', async () => {
    const { db, getSelectCount } = fakeNextUpDb({ preferenceRows: [{ activeRoutineId: null }] });

    const data = await loadNextUp(USER_ID, db);

    expect(data.routine).toBeNull();
    expect(getSelectCount()).toBe(1);
  });

  it('returns a null routine without throwing when the pointer names a routine that has not synced yet', async () => {
    const { db } = fakeNextUpDb({ preferenceRows: ACTIVE_PREFERENCE, routineRows: [] });

    await expect(loadNextUp(USER_ID, db)).resolves.toMatchObject({ routine: null });
  });

  it('returns a null routine when the active pointer names an archived routine', async () => {
    const { db } = fakeNextUpDb({
      preferenceRows: ACTIVE_PREFERENCE,
      routineRows: [{ id: 'r1', name: 'Push Pull Legs', goal: null, status: 'ready', archivedAt: '2026-01-01T00:00:00.000Z' }],
    });

    await expect(loadNextUp(USER_ID, db)).resolves.toMatchObject({ routine: null });
  });

  it('never loads the program tree when the pointer resolves to nothing', async () => {
    const { db, getSelectCount } = fakeNextUpDb({ preferenceRows: ACTIVE_PREFERENCE, routineRows: [] });

    await loadNextUp(USER_ID, db);

    expect(getSelectCount()).toBe(2);
  });
});

describe('loadNextUp — a bounded number of queries', () => {
  it('issues exactly twelve selects for a full load', async () => {
    const { db, getSelectCount } = fakeNextUpDb(programFixture(3, 1));

    await loadNextUp(USER_ID, db);

    expect(getSelectCount()).toBe(12);
  });

  it('issues the same number of selects for 3 exercises and for 30', async () => {
    const small = fakeNextUpDb(programFixture(3, 1));
    const large = fakeNextUpDb(programFixture(30, 1));

    await loadNextUp(USER_ID, small.db);
    await loadNextUp(USER_ID, large.db);

    expect(large.getSelectCount()).toBe(small.getSelectCount());
  });

  it('issues the same number of selects for 1 logged session and for 200', async () => {
    const short = fakeNextUpDb(programFixture(3, 1));
    const long = fakeNextUpDb(programFixture(3, 200));

    await loadNextUp(USER_ID, short.db);
    await loadNextUp(USER_ID, long.db);

    expect(long.getSelectCount()).toBe(short.getSelectCount());
  });

  it('filters the session history in SQL rather than in JavaScript', async () => {
    const { db, getWhereTables } = fakeNextUpDb(programFixture(3, 1));

    await loadNextUp(USER_ID, db);

    expect(getWhereTables()).toContain(workoutSession);
  });
});

describe('loadNextUp — what it returns', () => {
  it('returns the program tree, its history and the device calendar day', async () => {
    const { db } = fakeNextUpDb(programFixture(2, 3));

    const data = await loadNextUp(USER_ID, db);

    expect(data.routine).toEqual({ id: 'r1', name: 'Push Pull Legs' });
    expect(data.days.map((day) => day.id)).toEqual(['d1']);
    expect(data.cycles.map((cycle) => cycle.id)).toEqual(['c1']);
    expect(data.days[0].slots.map((slot) => slot.exerciseName)).toEqual(['Exercise 0', 'Exercise 1']);
    expect(data.history).toHaveLength(3);
    expect(data.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('maps each exercise id to its muscle-group names', async () => {
    const rows = programFixture(2, 0);
    rows.mappingRows = [
      { exerciseId: 'ex-0', muscleGroupId: 'mg-chest' },
      { exerciseId: 'ex-0', muscleGroupId: 'mg-tri' },
    ];
    rows.muscleGroupRows = [
      { id: 'mg-chest', name: 'Chest' },
      { id: 'mg-tri', name: 'Triceps' },
    ];
    const { db } = fakeNextUpDb(rows);

    const data = await loadNextUp(USER_ID, db);

    expect(data.musclesByExerciseId['ex-0']).toEqual(['Chest', 'Triceps']);
  });

  it('maps an exercise with no muscle mapping to an empty array rather than omitting it', async () => {
    const rows = programFixture(2, 0);
    rows.mappingRows = [{ exerciseId: 'ex-0', muscleGroupId: 'mg-chest' }];
    const { db } = fakeNextUpDb(rows);

    const data = await loadNextUp(USER_ID, db);

    expect(data.musclesByExerciseId['ex-1']).toEqual([]);
  });

  it('falls back to a muscle group id when the group row is missing', async () => {
    const rows = programFixture(1, 0);
    rows.muscleGroupRows = [];
    const { db } = fakeNextUpDb(rows);

    const data = await loadNextUp(USER_ID, db);

    expect(data.musclesByExerciseId['ex-0']).toEqual(['mg-chest']);
  });
});

describe('loadNextUp — the database-injection seam', () => {
  it('reads from an explicitly passed database and never resolves getPowerSync', async () => {
    getPowerSyncMock.mockClear();
    const { db } = fakeNextUpDb({ preferenceRows: [] });

    await loadNextUp(USER_ID, db);

    expect(getPowerSyncMock).not.toHaveBeenCalled();
  });

  it('falls back to getPowerSync() when no database argument is passed', async () => {
    const { db } = fakeNextUpDb({ preferenceRows: [] });
    getPowerSyncMock.mockReturnValue(db);

    await loadNextUp(USER_ID);

    expect(getPowerSyncMock).toHaveBeenCalled();
  });
});

// WR-02: the pointer read used to be `select(...).from(userPreference)` with no filter, so it
// returned whichever row SQLite ordered first. The user_preference row's id IS the user id, so an
// unfiltered read is another account's active program the moment a local database outlives a user
// switch.
describe('loadNextUp — the pointer belongs to a user (WR-02)', () => {
  it('filters the user_preference read by user id rather than taking the first row', async () => {
    const { db, getWhereTables } = fakeNextUpDb({ preferenceRows: ACTIVE_PREFERENCE, routineRows: [] });

    await loadNextUp(USER_ID, db);

    expect(getWhereTables()).toContain(userPreference);
  });

  it('reads nothing at all when there is no signed-in user', async () => {
    const { db, getSelectCount } = fakeNextUpDb(programFixture(3, 1));

    const data = await loadNextUp(null, db);

    expect(data.routine).toBeNull();
    expect(getSelectCount()).toBe(0);
  });

  it('still stamps today when it short-circuits on a missing user', async () => {
    const { db } = fakeNextUpDb(programFixture(3, 1));

    const data = await loadNextUp(null, db);

    expect(data.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
