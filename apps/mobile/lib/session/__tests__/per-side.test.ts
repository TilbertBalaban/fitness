import { isPerSideMode, parentsAwaitingRightSide, SIDE_LEFT, SIDE_RIGHT, sideForNewSet, type PerSideRowInput } from '../per-side';

function row(overrides: Partial<PerSideRowInput> & Pick<PerSideRowInput, 'id'>): PerSideRowInput {
  return {
    parentSetId: null,
    side: null,
    setType: 'normal',
    completed: true,
    ...overrides,
  };
}

describe('isPerSideMode', () => {
  it('returns true when any row carries a non-null side and no override is given (D-21)', () => {
    const rows = [row({ id: 'a', side: SIDE_LEFT }), row({ id: 'b' })];
    expect(isPerSideMode(rows, undefined)).toBe(true);
  });

  it('returns false when no row carries a side and no override is given', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })];
    expect(isPerSideMode(rows, undefined)).toBe(false);
  });

  it('turning the mode off while paired sets already exist — an override of false wins over the derived value (D-22)', () => {
    const rows = [row({ id: 'a', side: SIDE_LEFT }), row({ id: 'b', parentSetId: 'a', side: SIDE_RIGHT })];
    expect(isPerSideMode(rows, false)).toBe(false);
  });

  it('returns true for an exercise with no rows at all when the override is true, so the mode can be turned on before the first set', () => {
    expect(isPerSideMode([], true)).toBe(true);
  });
});

describe('sideForNewSet', () => {
  it('returns SIDE_LEFT when the mode is on', () => {
    const rows = [row({ id: 'a', side: SIDE_LEFT })];
    expect(sideForNewSet(rows, undefined)).toBe(SIDE_LEFT);
  });

  it('returns null when the mode is off — a new set is never stamped right (D-20)', () => {
    const rows = [row({ id: 'a' })];
    expect(sideForNewSet(rows, undefined)).toBeNull();
  });
});

describe('parentsAwaitingRightSide', () => {
  it('returns the id of a completed left parent with no right child', () => {
    const rows = [row({ id: 'p1', side: SIDE_LEFT, completed: true })];
    expect(parentsAwaitingRightSide(rows)).toEqual(['p1']);
  });

  it('returns nothing once the right child exists', () => {
    const rows = [
      row({ id: 'p1', side: SIDE_LEFT, completed: true }),
      row({ id: 'c1', parentSetId: 'p1', side: SIDE_RIGHT, completed: false }),
    ];
    expect(parentsAwaitingRightSide(rows)).toEqual([]);
  });

  it('returns nothing for an INCOMPLETE left parent — the child appears on completion, not on creation', () => {
    const rows = [row({ id: 'p1', side: SIDE_LEFT, completed: false })];
    expect(parentsAwaitingRightSide(rows)).toEqual([]);
  });

  it('returns nothing for a parent with a null side, so a plain or drop-set parent never gains a phantom right row', () => {
    const rows = [row({ id: 'p1', side: null, completed: true })];
    expect(parentsAwaitingRightSide(rows)).toEqual([]);
  });

  it('returns nothing for a drop-set group (a parent with drop children and a null side) — the two grouping mechanisms share parent_set_id but never each other\'s triggers', () => {
    const rows = [
      row({ id: 'p1', side: null, setType: 'normal', completed: true }),
      row({ id: 'c1', parentSetId: 'p1', side: null, setType: 'drop', completed: true }),
    ];
    expect(parentsAwaitingRightSide(rows)).toEqual([]);
  });
});
