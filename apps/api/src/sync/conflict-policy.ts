// Pure, Nest-free merge rule (D-03 / Decision 2). Reads no clock from either side: ordering is
// already decided by the moment this function runs — the stored row is whatever the last
// successfully applied push left behind, and the incoming op is what this push is applying now.
// A wall-clock comparison here would let a device with a wrong clock destroy a set
// (ARCHITECTURE.md Anti-Pattern 2, PITFALLS.md §1's first warning sign).

export const CONFLICT_LOGGED_TABLES: ReadonlySet<string> = new Set(['logged_set']);

export interface ConflictDecision {
  action: 'insert' | 'overwrite';
  logConflict: boolean;
  changedFields: string[];
}

interface MinimalOp {
  data?: Record<string, unknown> | null;
}

interface LoggedSetStoredRow {
  weightKg: string | null;
  reps: number;
  rir: number | null;
  setIndex: number;
  completed: boolean;
}

interface LoggedSetIncomingData {
  weight_kg?: string | number | null;
  reps?: number;
  rir?: number | null;
  set_index?: number;
  completed?: boolean;
}

// String(null) stringifies to the four-character text "null", which would false-positive a
// change against a stored NULL weight (or false-negative a real change into a decimal that
// happens to render the same). Absent and null stay distinct: absent skips the comparison
// entirely (handled by the `!== undefined` guard below), null normalizes to null.
function normalizedWeightKg(value: string | number | null): string | null {
  return value === null ? null : String(value);
}

function loggedSetChangedFields(stored: LoggedSetStoredRow, incoming: LoggedSetIncomingData): string[] {
  const changed: string[] = [];

  // Compared as its exact decimal string — parsing to a float here would reintroduce the
  // representation D-04 chose numeric to avoid.
  if (incoming.weight_kg !== undefined && normalizedWeightKg(incoming.weight_kg) !== stored.weightKg) {
    changed.push('weight_kg');
  }
  if (incoming.reps !== undefined && incoming.reps !== stored.reps) {
    changed.push('reps');
  }
  if (incoming.rir !== undefined && incoming.rir !== stored.rir) {
    changed.push('rir');
  }
  if (incoming.set_index !== undefined && incoming.set_index !== stored.setIndex) {
    changed.push('set_index');
  }
  if (incoming.completed !== undefined && incoming.completed !== stored.completed) {
    changed.push('completed');
  }

  return changed;
}

export function resolveConflict(
  table: string,
  storedRow: Record<string, unknown> | null | undefined,
  incomingOp: MinimalOp,
): ConflictDecision {
  if (!storedRow) {
    return { action: 'insert', logConflict: false, changedFields: [] };
  }

  if (!CONFLICT_LOGGED_TABLES.has(table)) {
    return { action: 'overwrite', logConflict: false, changedFields: [] };
  }

  // table === 'logged_set' from here on — the only entry in CONFLICT_LOGGED_TABLES today.
  const stored = storedRow as unknown as LoggedSetStoredRow;

  // An in-progress set is still being edited by definition — no conflict to log yet.
  if (stored.completed !== true) {
    return { action: 'overwrite', logConflict: false, changedFields: [] };
  }

  const incoming = (incomingOp.data ?? {}) as LoggedSetIncomingData;
  const changedFields = loggedSetChangedFields(stored, incoming);

  return { action: 'overwrite', logConflict: changedFields.length > 0, changedFields };
}
