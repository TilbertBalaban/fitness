import {
  ORDER_INDEX_GAP,
  appendOrderIndex,
  midpointOrderIndex,
  needsRenumber,
  renumberOrderIndexes,
  sortByOrderThenId,
} from '../programs/order-index';

describe('ORDER_INDEX_GAP', () => {
  it('is 1024', () => {
    expect(ORDER_INDEX_GAP).toBe(1024);
  });
});

describe('appendOrderIndex', () => {
  it('is GAP for an empty list', () => {
    expect(appendOrderIndex([])).toBe(1024);
  });

  it('is max + GAP for a populated list', () => {
    expect(appendOrderIndex([1024, 2048])).toBe(3072);
  });

  it('append is always max + GAP, never a renumber', () => {
    expect(appendOrderIndex([5])).toBe(1029);
  });
});

describe('midpointOrderIndex', () => {
  it('returns the floored midpoint when the gap is at least 2', () => {
    expect(midpointOrderIndex(1024, 2048)).toBe(1536);
  });

  it('returns null when the gap is exactly exhausted (gap of 1)', () => {
    expect(midpointOrderIndex(1024, 1025)).toBeNull();
  });

  it('returns a slot when the gap is exactly 2 — the boundary one step from exhausted', () => {
    expect(midpointOrderIndex(1024, 1026)).toBe(1025);
  });

  it('inserting before the first row: only after is present', () => {
    expect(midpointOrderIndex(null, 2048)).toBe(1024);
  });

  it('inserting after the last row: only before is present', () => {
    expect(midpointOrderIndex(1024, null)).toBe(2048);
  });

  it('inserting into an empty list: neither is present', () => {
    expect(midpointOrderIndex(null, null)).toBe(1024);
  });
});

describe('needsRenumber', () => {
  it('is true exactly when the gap is exhausted', () => {
    expect(needsRenumber(1024, 1025)).toBe(true);
  });

  it('is false when a slot is still available', () => {
    expect(needsRenumber(1024, 1026)).toBe(false);
  });
});

describe('renumberOrderIndexes', () => {
  it('assigns (i + 1) * GAP in order', () => {
    expect(renumberOrderIndexes(['a', 'b', 'c'])).toEqual([
      { id: 'a', orderIndex: 1024 },
      { id: 'b', orderIndex: 2048 },
      { id: 'c', orderIndex: 3072 },
    ]);
  });

  it('is empty for an empty list', () => {
    expect(renumberOrderIndexes([])).toEqual([]);
  });
});

describe('sortByOrderThenId', () => {
  it('breaks a tied orderIndex to ascending id — the order is total and stable', () => {
    const result = sortByOrderThenId([
      { id: 'b', orderIndex: 5 },
      { id: 'a', orderIndex: 5 },
    ]);
    expect(result.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('sorts ascending by orderIndex', () => {
    const result = sortByOrderThenId([
      { id: 'a', orderIndex: 2048 },
      { id: 'b', orderIndex: 1024 },
    ]);
    expect(result.map((row) => row.id)).toEqual(['b', 'a']);
  });
});
