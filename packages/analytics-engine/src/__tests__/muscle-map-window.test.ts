import { MUSCLE_GROUPS } from '@fitness/api-contracts';
import type { MuscleVolumeCell } from '../muscle-volume';
import { MUSCLE_MAP_ROW_ORDER } from '../muscle-map';
import {
  mergeMuscleVolumeCells,
  muscleMapPoints,
  rankMuscleContributions,
  topTrainedPoint,
  type MuscleContribution,
  type MuscleVolumeTotal,
} from '../muscle-map-window';

function cell(overrides: Partial<MuscleVolumeCell>): MuscleVolumeCell {
  return {
    muscleGroupId: 'chest',
    localDate: '2026-08-25',
    weightedVolumeKg: 0,
    weightedSets: 0,
    setCount: 0,
    ...overrides,
  };
}

describe('mergeMuscleVolumeCells', () => {
  it('sums a rollup cell and an overlay cell for the same muscle group across all three figures', () => {
    const rollup = [cell({ muscleGroupId: 'chest', weightedVolumeKg: 500, weightedSets: 5, setCount: 5 })];
    const overlay = [cell({ muscleGroupId: 'chest', weightedVolumeKg: 100, weightedSets: 1, setCount: 1 })];

    expect(mergeMuscleVolumeCells(rollup, overlay)).toEqual([
      { muscleGroupId: 'chest', weightedVolumeKg: 600, weightedSets: 6, setCount: 6 },
    ]);
  });

  it('passes a muscle group present in only one source straight through', () => {
    const rollup = [cell({ muscleGroupId: 'chest', weightedVolumeKg: 500, weightedSets: 5, setCount: 5 })];
    const overlay = [cell({ muscleGroupId: 'lats', weightedVolumeKg: 200, weightedSets: 2, setCount: 2 })];

    const totals = mergeMuscleVolumeCells(rollup, overlay);
    expect(totals).toContainEqual({ muscleGroupId: 'chest', weightedVolumeKg: 500, weightedSets: 5, setCount: 5 });
    expect(totals).toContainEqual({ muscleGroupId: 'lats', weightedVolumeKg: 200, weightedSets: 2, setCount: 2 });
  });

  it('merging two empty sources returns an empty total list, not nineteen zero totals', () => {
    expect(mergeMuscleVolumeCells([], [])).toEqual([]);
  });
});

describe('muscleMapPoints', () => {
  it('always returns exactly nineteen points, one per member of MUSCLE_GROUPS', () => {
    expect(muscleMapPoints([])).toHaveLength(MUSCLE_GROUPS.length);
    expect(
      muscleMapPoints([{ muscleGroupId: 'chest', weightedVolumeKg: 100, weightedSets: 1, setCount: 1 }]),
    ).toHaveLength(MUSCLE_GROUPS.length);
  });

  it('a muscle group absent from the totals is untrained: zero set count, null volume, null intensity', () => {
    const points = muscleMapPoints([]);
    const chest = points.find((point) => point.muscleGroupId === 'chest')!;
    expect(chest.setCount).toBe(0);
    expect(chest.trainingVolumeKg).toBeNull();
    expect(chest.relativeIntensity).toBeNull();
  });

  it('a muscle group with sets above zero and zero weighted volume comes back trained, never null', () => {
    const totals: MuscleVolumeTotal[] = [{ muscleGroupId: 'lats', weightedVolumeKg: 0, weightedSets: 3, setCount: 3 }];
    const points = muscleMapPoints(totals);
    const lats = points.find((point) => point.muscleGroupId === 'lats')!;
    expect(lats.setCount).toBe(3);
    expect(lats.trainingVolumeKg).toBe(0);
    expect(lats.relativeIntensity).toBe(0);
  });

  it('the highest-volume muscle comes back at relative intensity 1, half that volume at exactly 0.5', () => {
    const totals: MuscleVolumeTotal[] = [
      { muscleGroupId: 'chest', weightedVolumeKg: 1000, weightedSets: 10, setCount: 10 },
      { muscleGroupId: 'lats', weightedVolumeKg: 500, weightedSets: 5, setCount: 5 },
    ];
    const points = muscleMapPoints(totals);
    expect(points.find((point) => point.muscleGroupId === 'chest')!.relativeIntensity).toBe(1);
    expect(points.find((point) => point.muscleGroupId === 'lats')!.relativeIntensity).toBe(0.5);
  });

  it('when every trained muscle has zero weighted volume, every one comes back at relative intensity zero', () => {
    const totals: MuscleVolumeTotal[] = [
      { muscleGroupId: 'chest', weightedVolumeKg: 0, weightedSets: 2, setCount: 2 },
      { muscleGroupId: 'lats', weightedVolumeKg: 0, weightedSets: 3, setCount: 3 },
    ];
    const points = muscleMapPoints(totals);
    expect(points.find((point) => point.muscleGroupId === 'chest')!.relativeIntensity).toBe(0);
    expect(points.find((point) => point.muscleGroupId === 'lats')!.relativeIntensity).toBe(0);
  });

  it('comes back in front-figure MUSCLE_MAP_ROW_ORDER order followed by back-figure order, each carrying its side', () => {
    const points = muscleMapPoints([]);
    const expectedOrder = [...MUSCLE_MAP_ROW_ORDER.front, ...MUSCLE_MAP_ROW_ORDER.back];
    expect(points.map((point) => point.muscleGroupId)).toEqual(expectedOrder);
    for (const point of points.slice(0, MUSCLE_MAP_ROW_ORDER.front.length)) {
      expect(point.side).toBe('front');
    }
    for (const point of points.slice(MUSCLE_MAP_ROW_ORDER.front.length)) {
      expect(point.side).toBe('back');
    }
  });
});

describe('topTrainedPoint', () => {
  it('returns the trained point with the highest relative intensity on the requested side', () => {
    const totals: MuscleVolumeTotal[] = [
      { muscleGroupId: 'chest', weightedVolumeKg: 1000, weightedSets: 10, setCount: 10 },
      { muscleGroupId: 'biceps', weightedVolumeKg: 200, weightedSets: 2, setCount: 2 },
    ];
    const points = muscleMapPoints(totals);
    expect(topTrainedPoint(points, 'front')!.muscleGroupId).toBe('chest');
  });

  it('breaks an exact tie by the earlier MUSCLE_MAP_ROW_ORDER position', () => {
    // neck precedes front_delts in MUSCLE_MAP_ROW_ORDER.front
    const totals: MuscleVolumeTotal[] = [
      { muscleGroupId: 'neck', weightedVolumeKg: 100, weightedSets: 1, setCount: 1 },
      { muscleGroupId: 'front_delts', weightedVolumeKg: 100, weightedSets: 1, setCount: 1 },
    ];
    const points = muscleMapPoints(totals);
    expect(topTrainedPoint(points, 'front')!.muscleGroupId).toBe('neck');
  });

  it('returns null when nothing on that side is trained', () => {
    const points = muscleMapPoints([]);
    expect(topTrainedPoint(points, 'front')).toBeNull();
  });
});

describe('rankMuscleContributions', () => {
  function contribution(overrides: Partial<MuscleContribution>): MuscleContribution {
    return { exerciseId: 'ex-1', exerciseName: 'Bench Press', setCount: 1, weightedVolumeKg: 100, ...overrides };
  }

  it('sorts by weighted volume descending', () => {
    const rows = [contribution({ exerciseId: 'a', weightedVolumeKg: 100 }), contribution({ exerciseId: 'b', weightedVolumeKg: 500 })];
    expect(rankMuscleContributions(rows).map((row) => row.exerciseId)).toEqual(['b', 'a']);
  });

  it('breaks a volume tie by set count descending', () => {
    const rows = [
      contribution({ exerciseId: 'a', weightedVolumeKg: 500, setCount: 3 }),
      contribution({ exerciseId: 'b', weightedVolumeKg: 500, setCount: 8 }),
    ];
    expect(rankMuscleContributions(rows).map((row) => row.exerciseId)).toEqual(['b', 'a']);
  });

  it('breaks a volume-and-set-count tie by exercise name ascending, plain string comparison', () => {
    const rows = [
      contribution({ exerciseId: 'a', exerciseName: 'Zercher Squat', weightedVolumeKg: 500, setCount: 3 }),
      contribution({ exerciseId: 'b', exerciseName: 'Bench Press', weightedVolumeKg: 500, setCount: 3 }),
    ];
    expect(rankMuscleContributions(rows).map((row) => row.exerciseId)).toEqual(['b', 'a']);
  });

  it('breaks a tie on volume, set count and name by exercise id ascending', () => {
    const rows = [
      contribution({ exerciseId: 'ex-b', exerciseName: 'Bench Press', weightedVolumeKg: 500, setCount: 3 }),
      contribution({ exerciseId: 'ex-a', exerciseName: 'Bench Press', weightedVolumeKg: 500, setCount: 3 }),
    ];
    expect(rankMuscleContributions(rows).map((row) => row.exerciseId)).toEqual(['ex-a', 'ex-b']);
  });

  it('on an empty list returns an empty list, never a placeholder row', () => {
    expect(rankMuscleContributions([])).toEqual([]);
  });
});
