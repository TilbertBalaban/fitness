import { HISTORY_ROW_ACTIONS } from '../HistoryActionSheet';

describe('HISTORY_ROW_ACTIONS', () => {
  it('has exactly five entries in the order View, Edit, Rename, Duplicate, Delete', () => {
    expect(HISTORY_ROW_ACTIONS.map((action) => action.id)).toEqual(['view', 'edit', 'rename', 'duplicate', 'delete']);
    expect(HISTORY_ROW_ACTIONS.map((action) => action.label)).toEqual(['View', 'Edit', 'Rename', 'Duplicate', 'Delete']);
  });

  it('renders only Delete in the destructive color', () => {
    const destructiveIds = HISTORY_ROW_ACTIONS.filter((action) => action.destructive).map((action) => action.id);
    expect(destructiveIds).toEqual(['delete']);
  });
});
