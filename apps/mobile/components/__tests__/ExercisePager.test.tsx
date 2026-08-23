import { clampPagerIndex, exercisePagerRoutes, ExercisePagerView } from '../ExercisePager';

describe('clampPagerIndex', () => {
  it('clamps a past-the-end index down to the last exercise', () => {
    expect(clampPagerIndex(5, 2)).toBe(1);
  });

  it('clamps a zero-exercise session to index 0', () => {
    expect(clampPagerIndex(0, 0)).toBe(0);
  });

  it('clamps a negative index up to 0', () => {
    expect(clampPagerIndex(-1, 3)).toBe(0);
  });

  it('leaves an in-range index untouched', () => {
    expect(clampPagerIndex(1, 3)).toBe(1);
  });
});

describe('exercisePagerRoutes', () => {
  it('derives one route per exercise, keyed by id', () => {
    expect(exercisePagerRoutes([{ id: 'e1' }, { id: 'e2' }])).toEqual([
      { key: 'e1', title: 'e1' },
      { key: 'e2', title: 'e2' },
    ]);
  });
});

describe('ExercisePagerView', () => {
  it('renders nothing for a zero-exercise session', () => {
    const result = ExercisePagerView({ exercises: [], index: 0, onIndexChange: jest.fn(), renderExercise: () => null, width: 320 });
    expect(result).toBeNull();
  });
});
