import { formatSelectionCount, orderedSelection, toggleSelection } from '../picker-selection';

describe('toggleSelection', () => {
  it('appends an id to an empty selection', () => {
    expect(toggleSelection([], 'e1')).toEqual(['e1']);
  });

  it('appends a second id, preserving order', () => {
    expect(toggleSelection(['e1'], 'e2')).toEqual(['e1', 'e2']);
  });

  it('removes an id already selected, preserving the remaining order', () => {
    expect(toggleSelection(['e1', 'e2'], 'e1')).toEqual(['e2']);
  });

  it('empties the selection when toggling the only selected id', () => {
    expect(toggleSelection(['e1'], 'e1')).toEqual([]);
  });
});

describe('formatSelectionCount', () => {
  it('is "Add" at zero', () => {
    expect(formatSelectionCount(0)).toBe('Add');
  });

  it('is "Add 1 exercise" at one — the singular boundary', () => {
    expect(formatSelectionCount(1)).toBe('Add 1 exercise');
  });

  it('is "Add 4 exercises" at four — one step past the boundary', () => {
    expect(formatSelectionCount(4)).toBe('Add 4 exercises');
  });
});

describe('orderedSelection', () => {
  const catalogRows = [
    { id: 'e1', name: 'Bench Press' },
    { id: 'e2', name: 'Squat' },
  ];

  it('returns rows in selection order, not catalog order', () => {
    expect(orderedSelection(['e2', 'e1'], catalogRows)).toEqual([
      { id: 'e2', name: 'Squat' },
      { id: 'e1', name: 'Bench Press' },
    ]);
  });

  it('drops an id with no matching row rather than throwing', () => {
    expect(orderedSelection(['missing'], catalogRows)).toEqual([]);
  });
});
