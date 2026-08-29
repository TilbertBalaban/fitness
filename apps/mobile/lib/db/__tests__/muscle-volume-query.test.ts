import { loadMuscleDrilldown, loadMuscleMapWindow, muscleMapOverlayFilter } from '../muscle-volume-query';
import { getPowerSync } from '../powersync';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));

type Row = Record<string, unknown>;

// Returns each queued result set in turn and counts the selects issued, so a fixed select count is
// asserted against the real call sequence rather than assumed. The WHERE clauses themselves are
// proven against a real database by the durability spec — this harness never evaluates a predicate,
// it only counts calls and replays queued rows, mirroring exercise-history-query.test.ts's fakeDb.
function fakeDb(results: Row[][]) {
  let selectCount = 0;
  const resultFor = () => results[selectCount - 1] ?? [];

  const db = {
    select: () => {
      selectCount += 1;
      const terminal = () => Object.assign(Promise.resolve(resultFor()), { where: () => Promise.resolve(resultFor()) });
      return { from: () => terminal() };
    },
  } as unknown as ReturnType<typeof getPowerSync>;

  return { db, getSelectCount: () => selectCount };
}

beforeEach(() => {
  (getPowerSync as jest.MockedFunction<typeof getPowerSync>).mockReset();
});

describe('muscleMapOverlayFilter', () => {
  it('yields no condition at all when the watermark is null', () => {
    expect(muscleMapOverlayFilter(null)).toBeUndefined();
  });

  it('yields a condition when a watermark date is supplied', () => {
    expect(muscleMapOverlayFilter('2026-08-01')).toBeDefined();
  });
});

describe('loadMuscleMapWindow', () => {
  it('returns an empty-but-shaped result with nineteen untrained points when nobody is signed in, issuing no select', async () => {
    const { db, getSelectCount } = fakeDb([]);

    const data = await loadMuscleMapWindow({ userId: null, todayLocalDate: '2026-08-29', windowId: '1w' }, db);

    expect(data.points).toHaveLength(19);
    expect(data.points.every((point) => point.setCount === 0 && point.trainingVolumeKg === null)).toBe(true);
    expect(data.muscleNames.size).toBe(0);
    expect(data.overlaySessionCount).toBe(0);
    expect(data.watermarkDate).toBeNull();
    expect(getSelectCount()).toBe(0);
  });

  it('a user with no sessions at all gets nineteen untrained points, not an empty array and not nineteen zeroes', async () => {
    const muscleGroupRows: Row[] = [{ id: 'chest', name: 'Chest' }];
    const { db } = fakeDb([muscleGroupRows, [], [], [], []]);

    const data = await loadMuscleMapWindow({ userId: 'user-1', todayLocalDate: '2026-08-29', windowId: '1w' }, db);

    expect(data.points).toHaveLength(19);
    expect(data.points.every((point) => point.trainingVolumeKg === null)).toBe(true);
  });

  it('the 1-week window issues exactly five selects (muscle_group, sessions, session_exercise, logged_set, mappings) and never touches the rollup or the watermark', async () => {
    const muscleGroupRows: Row[] = [{ id: 'chest', name: 'Chest' }];
    const sessionRows: Row[] = [{ id: 's1', localDate: '2026-08-25' }];
    const sessionExerciseRows: Row[] = [{ id: 'se1', sessionId: 's1', exerciseId: 'ex1' }];
    const setRows: Row[] = [{ id: 'ls1', sessionExerciseId: 'se1', setType: 'normal', completed: true, weightKg: '100.000', reps: 5 }];
    const mappingRows: Row[] = [{ exerciseId: 'ex1', muscleGroupId: 'chest', weightFactor: '1.00' }];
    const { db, getSelectCount } = fakeDb([muscleGroupRows, sessionRows, sessionExerciseRows, setRows, mappingRows]);

    const data = await loadMuscleMapWindow({ userId: 'user-1', todayLocalDate: '2026-08-29', windowId: '1w' }, db);

    expect(getSelectCount()).toBe(5);
    expect(data.overlaySessionCount).toBe(0);
    expect(data.watermarkDate).toBeNull();
    const chest = data.points.find((point) => point.muscleGroupId === 'chest')!;
    expect(chest.setCount).toBe(1);
  });

  it('a rollup window issues the same seven selects (muscle_group, watermark, rollup, then the four local reads) regardless of how much data matches', async () => {
    const muscleGroupRows: Row[] = [{ id: 'chest', name: 'Chest' }];
    const watermarkRows: Row[] = [{ computedThroughDate: '2026-08-20' }];
    const rollupRows: Row[] = [
      { muscleGroupId: 'chest', localDate: '2026-08-10', weightedVolumeKg: '500.000', weightedSets: '5.00', setCount: 5 },
    ];
    const sessionRows: Row[] = Array.from({ length: 50 }, (_, index) => ({ id: `s${index}`, localDate: '2026-08-25' }));
    const sessionExerciseRows: Row[] = sessionRows.map((row, index) => ({ id: `se${index}`, sessionId: row.id, exerciseId: 'ex1' }));
    const setRows: Row[] = sessionExerciseRows.map((row) => ({
      id: `ls-${row.id}`,
      sessionExerciseId: row.id,
      setType: 'normal',
      completed: true,
      weightKg: '100.000',
      reps: 5,
    }));
    const mappingRows: Row[] = [{ exerciseId: 'ex1', muscleGroupId: 'chest', weightFactor: '1.00' }];
    const { db, getSelectCount } = fakeDb([muscleGroupRows, watermarkRows, rollupRows, sessionRows, sessionExerciseRows, setRows, mappingRows]);

    const data = await loadMuscleMapWindow({ userId: 'user-1', todayLocalDate: '2026-08-29', windowId: '1m' }, db);

    expect(getSelectCount()).toBe(7);
    expect(data.watermarkDate).toBe('2026-08-20');
    expect(data.overlaySessionCount).toBe(50);
    const chest = data.points.find((point) => point.muscleGroupId === 'chest')!;
    // rollup contributes 500 kg, overlay contributes 50 sessions x 500 kg each — the two sources sum.
    expect(chest.trainingVolumeKg).toBe(500 + 50 * 500);
  });

  it('with no watermark row at all, every local completed session in the window is overlaid and the rollup contributes nothing', async () => {
    const muscleGroupRows: Row[] = [{ id: 'chest', name: 'Chest' }];
    const watermarkRows: Row[] = [];
    const rollupRows: Row[] = [];
    const sessionRows: Row[] = [{ id: 's1', localDate: '2026-08-25' }];
    const sessionExerciseRows: Row[] = [{ id: 'se1', sessionId: 's1', exerciseId: 'ex1' }];
    const setRows: Row[] = [{ id: 'ls1', sessionExerciseId: 'se1', setType: 'normal', completed: true, weightKg: '100.000', reps: 5 }];
    const mappingRows: Row[] = [{ exerciseId: 'ex1', muscleGroupId: 'chest', weightFactor: '1.00' }];
    const { db } = fakeDb([muscleGroupRows, watermarkRows, rollupRows, sessionRows, sessionExerciseRows, setRows, mappingRows]);

    const data = await loadMuscleMapWindow({ userId: 'user-1', todayLocalDate: '2026-08-29', windowId: '3m' }, db);

    expect(data.watermarkDate).toBeNull();
    expect(data.overlaySessionCount).toBe(1);
    const chest = data.points.find((point) => point.muscleGroupId === 'chest')!;
    expect(chest.trainingVolumeKg).toBe(500);
  });
});

describe('loadMuscleDrilldown', () => {
  it('returns an empty-but-shaped result when nobody is signed in, issuing no select', async () => {
    const { db, getSelectCount } = fakeDb([]);

    const data = await loadMuscleDrilldown({ userId: null, todayLocalDate: '2026-08-29', windowId: '1w', muscleGroupId: 'chest' }, db);

    expect(data).toEqual({ contributions: [], totals: { weightedVolumeKg: 0, setCount: 0 } });
    expect(getSelectCount()).toBe(0);
  });

  it('returns an empty list for a muscle group with no contributing exercises in the window', async () => {
    const sessionRows: Row[] = [{ id: 's1' }];
    const sessionExerciseRows: Row[] = [{ id: 'se1', exerciseId: 'ex1' }];
    const setRows: Row[] = [];
    const mappingRows: Row[] = [];
    const { db } = fakeDb([sessionRows, sessionExerciseRows, setRows, mappingRows]);

    const data = await loadMuscleDrilldown({ userId: 'user-1', todayLocalDate: '2026-08-29', windowId: '1w', muscleGroupId: 'chest' }, db);

    expect(data.contributions).toEqual([]);
  });

  it('resolves a seeded-catalog exercise name, not the unknown-exercise fallback, and ranks contributions', async () => {
    const sessionRows: Row[] = [{ id: 's1' }];
    const sessionExerciseRows: Row[] = [
      { id: 'se1', exerciseId: 'seed-bench' },
      { id: 'se2', exerciseId: 'seed-fly' },
    ];
    const setRows: Row[] = [
      { sessionExerciseId: 'se1', setType: 'normal', completed: true, weightKg: '100.000', reps: 5 },
      { sessionExerciseId: 'se2', setType: 'normal', completed: true, weightKg: '20.000', reps: 10 },
    ];
    const mappingRows: Row[] = [
      { exerciseId: 'seed-bench', weightFactor: '1.00' },
      { exerciseId: 'seed-fly', weightFactor: '1.00' },
    ];
    const seededRows: Row[] = [
      { id: 'seed-bench', name: 'Barbell Bench Press' },
      { id: 'seed-fly', name: 'Cable Fly' },
    ];
    const customRows: Row[] = [];
    const { db } = fakeDb([sessionRows, sessionExerciseRows, setRows, mappingRows, seededRows, customRows]);

    const data = await loadMuscleDrilldown({ userId: 'user-1', todayLocalDate: '2026-08-29', windowId: '1w', muscleGroupId: 'chest' }, db);

    expect(data.contributions.map((row) => row.exerciseName)).toEqual(['Barbell Bench Press', 'Cable Fly']);
    expect(data.contributions.every((row) => row.exerciseName !== 'Unknown exercise')).toBe(true);
  });
});
