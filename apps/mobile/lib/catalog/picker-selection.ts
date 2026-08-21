// Pure selection-state arithmetic for ExercisePickerModal — no React, no database. Selection
// order is preserved (not catalog order) because that order becomes the added exercises' order
// in the day (addExercisesToDay, 04-02).

export function toggleSelection(selectedIds: string[], id: string): string[] {
  if (selectedIds.includes(id)) {
    return selectedIds.filter((selectedId) => selectedId !== id);
  }
  return [...selectedIds, id];
}

interface RowWithId {
  id: string;
}

// Maps ids to their row in selection order, dropping any id with no matching row rather than
// throwing — a row can vanish from the catalog result set (a filter change) while its id is
// still selected.
export function orderedSelection<T extends RowWithId>(selectedIds: string[], rows: T[]): T[] {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const ordered: T[] = [];
  for (const id of selectedIds) {
    const row = rowsById.get(id);
    if (row) ordered.push(row);
  }
  return ordered;
}

export function formatSelectionCount(count: number): string {
  if (count === 1) return 'Add Exercise';
  if (count === 0) return 'Add Exercises';
  return `Add ${count} Exercises`;
}
