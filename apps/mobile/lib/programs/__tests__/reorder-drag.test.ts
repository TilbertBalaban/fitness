import { computeDropTarget, neighboursForIndex, SLOT_ROW_HEIGHT } from '../reorder-drag';

describe('SLOT_ROW_HEIGHT', () => {
  it('is a positive finite number', () => {
    expect(Number.isFinite(SLOT_ROW_HEIGHT)).toBe(true);
    expect(SLOT_ROW_HEIGHT).toBeGreaterThan(0);
  });
});

describe('computeDropTarget', () => {
  it('no movement means no move', () => {
    expect(computeDropTarget({ fromIndex: 0, translationY: 0, count: 4 })).toEqual({ toIndex: 0 });
  });

  it('one full row of downward movement moves down one position', () => {
    expect(computeDropTarget({ fromIndex: 0, translationY: SLOT_ROW_HEIGHT, count: 4 })).toEqual({ toIndex: 1 });
  });

  it('just under half a row stays in place', () => {
    expect(computeDropTarget({ fromIndex: 0, translationY: SLOT_ROW_HEIGHT / 2 - 1, count: 4 })).toEqual({ toIndex: 0 });
  });

  it('just over half a row moves one position', () => {
    expect(computeDropTarget({ fromIndex: 0, translationY: SLOT_ROW_HEIGHT / 2 + 1, count: 4 })).toEqual({ toIndex: 1 });
  });

  it('dragging far past the end clamps to the last index', () => {
    expect(computeDropTarget({ fromIndex: 3, translationY: 10 * SLOT_ROW_HEIGHT, count: 4 })).toEqual({ toIndex: 3 });
  });

  it('dragging far past the start clamps to 0', () => {
    expect(computeDropTarget({ fromIndex: 0, translationY: -10 * SLOT_ROW_HEIGHT, count: 4 })).toEqual({ toIndex: 0 });
  });

  it('a single-element list is always in place', () => {
    expect(computeDropTarget({ fromIndex: 1, translationY: 0, count: 1 })).toEqual({ toIndex: 0 });
  });
});

describe('neighboursForIndex', () => {
  it('moving the middle row to the front', () => {
    expect(neighboursForIndex(['a', 'b', 'c'], 'b', 0)).toEqual({ beforeId: null, afterId: 'a' });
  });

  it('moving the first row to the end excludes it from its own neighbour computation', () => {
    expect(neighboursForIndex(['a', 'b', 'c'], 'a', 2)).toEqual({ beforeId: 'c', afterId: null });
  });

  it('moving the first row to the middle', () => {
    expect(neighboursForIndex(['a', 'b', 'c'], 'a', 1)).toEqual({ beforeId: 'b', afterId: 'c' });
  });
});
