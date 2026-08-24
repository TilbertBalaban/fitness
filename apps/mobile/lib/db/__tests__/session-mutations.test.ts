import { warmupSets } from '@fitness/pr-rules';
import {
  addExerciseToSession,
  generateWarmupSets,
  removeSessionExercise,
  reorderSessionExercises,
  resolveWriteBackTarget,
  setNote,
  setSessionExerciseTargets,
  swapSessionExercise,
  writeBackTargets,
} from '../session-mutations';
import { getPowerSync, type WriteDb } from '../powersync';
import { loggedSet, routineExercise, routineExerciseCycleTarget, sessionExercise, workoutSession } from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));

let mockIdCounter = 0;
jest.mock('../id', () => ({ generateClientId: jest.fn(() => `id-${mockIdCounter++}`) }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;

type TableLike = Record<string, { name?: string } | undefined>;
type Row = Record<string, unknown>;

function propertyKeyForColumn(table: TableLike, columnName: string): string | undefined {
  return Object.entries(table).find(([, column]) => column?.name === columnName)?.[0];
}

// Mirrors log-set.test.ts's own condition-tree walker (drizzle's eq()/and() chunk shape) — kept as
// a per-file copy per this codebase's established convention rather than a shared test utility.
function collectEqualities(node: unknown, out: { column: string; value: unknown }[]): void {
  const chunks = (node as { queryChunks?: unknown[] })?.queryChunks;
  if (!Array.isArray(chunks)) return;

  let column: string | null = null;
  for (const chunk of chunks) {
    const part = chunk as { queryChunks?: unknown[]; name?: string; value?: unknown };
    if (Array.isArray(part?.queryChunks)) {
      collectEqualities(part, out);
      continue;
    }
    if (typeof part?.name === 'string') {
      column = part.name;
      continue;
    }
    if (part && 'value' in part && !Array.isArray(part.value) && column !== null) {
      out.push({ column, value: part.value });
      column = null;
    }
  }
}

function rowMatches(table: TableLike, row: Row, condition: unknown): boolean {
  const equalities: { column: string; value: unknown }[] = [];
  collectEqualities(condition, equalities);
  if (equalities.length === 0) return true;
  return equalities.every(({ column, value }) => {
    const key = propertyKeyForColumn(table, column);
    return key !== undefined && row[key] === value;
  });
}

function isSqlLike(value: unknown): boolean {
  return !!value && typeof value === 'object' && 'queryChunks' in (value as object);
}

// A tiny in-memory stand-in for the local SQLite database — same shape as log-set.test.ts's own
// inMemoryDb, extended with a max(order_index)-style aggregate special case for
// addExerciseToSession's own select.
function inMemoryDb() {
  const tables = new Map<unknown, Row[]>();

  function rowsFor(table: unknown): Row[] {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table) as Row[];
  }

  const db = {
    select: (projection: Record<string, unknown>) => ({
      from: (table: TableLike) => ({
        where: (condition: unknown) => {
          const matched = rowsFor(table).filter((row) => rowMatches(table, row, condition));
          const aggregateEntry = Object.entries(projection).find(([, col]) => isSqlLike(col));
          if (aggregateEntry) {
            const [alias] = aggregateEntry;
            const values = matched
              .map((row) => row.orderIndex as number | undefined)
              .filter((value): value is number => typeof value === 'number');
            return Promise.resolve([{ [alias]: values.length ? Math.max(...values) : null }]);
          }
          return Promise.resolve(
            matched.map((row) => {
              const projected: Row = {};
              for (const [alias, column] of Object.entries(projection)) {
                const key = propertyKeyForColumn(table, (column as { name?: string })?.name ?? alias) ?? alias;
                projected[alias] = row[key] ?? null;
              }
              return projected;
            }),
          );
        },
      }),
    }),
    insert: (table: TableLike) => ({
      values: (values: Row) => {
        rowsFor(table).push({ ...values });
        return Promise.resolve();
      },
    }),
    update: (table: TableLike) => ({
      set: (patch: Row) => ({
        where: (condition: unknown) => {
          for (const row of rowsFor(table)) {
            if (rowMatches(table, row, condition)) Object.assign(row, patch);
          }
          return Promise.resolve();
        },
      }),
    }),
    delete: (table: TableLike) => ({
      where: (condition: unknown) => {
        tables.set(
          table,
          rowsFor(table).filter((row) => !rowMatches(table, row, condition)),
        );
        return Promise.resolve();
      },
    }),
  } as unknown as WriteDb;

  return {
    db,
    seed(table: unknown, row: Row) {
      rowsFor(table).push({ ...row });
    },
    rowsOf(table: unknown): Row[] {
      return rowsFor(table);
    },
  };
}

beforeEach(() => {
  mockIdCounter = 0;
  getPowerSyncMock.mockReset();
});

describe('setNote — three independent writes (LOG-16)', () => {
  it('writes only logged_set.notes at the set level, leaving session_exercise/workout_session untouched', async () => {
    const store = inMemoryDb();
    store.seed(loggedSet, { id: 'ls-1', notes: null });
    store.seed(sessionExercise, { id: 'se-1', notes: null });
    store.seed(workoutSession, { id: 'ws-1', notes: null });

    await setNote({ level: 'set', id: 'ls-1', text: 'felt heavy' }, store.db);

    expect(store.rowsOf(loggedSet)[0].notes).toBe('felt heavy');
    expect(store.rowsOf(sessionExercise)[0].notes).toBeNull();
    expect(store.rowsOf(workoutSession)[0].notes).toBeNull();
  });

  it('writes only session_exercise.notes at the exercise level', async () => {
    const store = inMemoryDb();
    store.seed(loggedSet, { id: 'ls-1', notes: null });
    store.seed(sessionExercise, { id: 'se-1', notes: null });
    store.seed(workoutSession, { id: 'ws-1', notes: null });

    await setNote({ level: 'exercise', id: 'se-1', text: 'grip felt off' }, store.db);

    expect(store.rowsOf(sessionExercise)[0].notes).toBe('grip felt off');
    expect(store.rowsOf(loggedSet)[0].notes).toBeNull();
    expect(store.rowsOf(workoutSession)[0].notes).toBeNull();
  });

  it('writes only workout_session.notes at the session level', async () => {
    const store = inMemoryDb();
    store.seed(loggedSet, { id: 'ls-1', notes: null });
    store.seed(sessionExercise, { id: 'se-1', notes: null });
    store.seed(workoutSession, { id: 'ws-1', notes: null });

    await setNote({ level: 'session', id: 'ws-1', text: 'great session' }, store.db);

    expect(store.rowsOf(workoutSession)[0].notes).toBe('great session');
    expect(store.rowsOf(loggedSet)[0].notes).toBeNull();
    expect(store.rowsOf(sessionExercise)[0].notes).toBeNull();
  });

  it('normalises an empty or all-whitespace string to null', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', notes: 'old note' });

    await setNote({ level: 'exercise', id: 'se-1', text: '   ' }, store.db);
    expect(store.rowsOf(sessionExercise)[0].notes).toBeNull();

    await setNote({ level: 'exercise', id: 'se-1', text: '' }, store.db);
    expect(store.rowsOf(sessionExercise)[0].notes).toBeNull();
  });

  it('trims surrounding whitespace from a real note before writing', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', notes: null });

    await setNote({ level: 'exercise', id: 'se-1', text: '  heavy day  ' }, store.db);

    expect(store.rowsOf(sessionExercise)[0].notes).toBe('heavy day');
  });
});

const FULL_TARGETS = { targetSets: 3, targetRepMin: 8, targetRepMax: 12, targetRir: 1, targetRestSeconds: 120 };

describe('setSessionExerciseTargets — session-only snapshot write (D-14/LOG-15)', () => {
  it("changes only the session_exercise row's five target_* columns", async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', targetSets: 1, targetRepMin: 1, targetRepMax: 1, targetRir: 1, targetRestSeconds: 1, notes: 'x' });
    store.seed(routineExercise, { id: 're-1', ...FULL_TARGETS });
    store.seed(routineExerciseCycleTarget, { id: 'cet-1', routineExerciseId: 're-1', cycleId: 'c-1' });

    await setSessionExerciseTargets('se-1', FULL_TARGETS, store.db);

    expect(store.rowsOf(sessionExercise)[0]).toMatchObject(FULL_TARGETS);
    expect(store.rowsOf(sessionExercise)[0].notes).toBe('x');
    expect(store.rowsOf(routineExercise)[0]).toEqual({ id: 're-1', ...FULL_TARGETS });
    expect(store.rowsOf(routineExerciseCycleTarget)[0]).toEqual({ id: 'cet-1', routineExerciseId: 're-1', cycleId: 'c-1' });
  });
});

describe('resolveWriteBackTarget — the write-side mirror of override ?? base (D-15)', () => {
  it('returns the base row when no cycle is selected', async () => {
    const store = inMemoryDb();
    const destination = await resolveWriteBackTarget({ routineExerciseId: 're-1', cycleId: null, field: 'targetSets' }, store.db);
    expect(destination).toEqual({ kind: 'base' });
  });

  it('returns the override row when one exists for this cycle and the field is non-null on it', async () => {
    const store = inMemoryDb();
    store.seed(routineExerciseCycleTarget, { id: 'cet-1', routineExerciseId: 're-1', cycleId: 'c-1', targetSets: 5, targetRepMin: null });

    const destination = await resolveWriteBackTarget({ routineExerciseId: 're-1', cycleId: 'c-1', field: 'targetSets' }, store.db);

    expect(destination).toEqual({ kind: 'override', id: 'cet-1' });
  });

  it('returns the base row when the override row exists but is null on this field', async () => {
    const store = inMemoryDb();
    store.seed(routineExerciseCycleTarget, { id: 'cet-1', routineExerciseId: 're-1', cycleId: 'c-1', targetSets: 5, targetRepMin: null });

    const destination = await resolveWriteBackTarget({ routineExerciseId: 're-1', cycleId: 'c-1', field: 'targetRepMin' }, store.db);

    expect(destination).toEqual({ kind: 'base' });
  });

  it('returns the base row when no override row exists for this cycle at all', async () => {
    const store = inMemoryDb();
    const destination = await resolveWriteBackTarget({ routineExerciseId: 're-1', cycleId: 'c-1', field: 'targetSets' }, store.db);
    expect(destination).toEqual({ kind: 'base' });
  });
});

describe('writeBackTargets — never creates an override row that overrides nothing', () => {
  it('writes every field to the base row when no cycle is selected', async () => {
    const store = inMemoryDb();
    store.seed(routineExercise, { id: 're-1', targetSets: 1, targetRepMin: 1, targetRepMax: 1, targetRir: 1, targetRestSeconds: 1 });

    await writeBackTargets({ routineExerciseId: 're-1', cycleId: null, targets: FULL_TARGETS }, store.db);

    expect(store.rowsOf(routineExercise)[0]).toMatchObject(FULL_TARGETS);
  });

  it('per field, routes to the override row when one exists and to the base row otherwise', async () => {
    const store = inMemoryDb();
    store.seed(routineExercise, { id: 're-1', targetSets: 1, targetRepMin: 1, targetRepMax: 1, targetRir: 1, targetRestSeconds: 1 });
    store.seed(routineExerciseCycleTarget, {
      id: 'cet-1',
      routineExerciseId: 're-1',
      cycleId: 'c-1',
      targetSets: 1,
      targetRepMin: null,
      targetRepMax: null,
      targetRir: null,
      targetRestSeconds: null,
    });

    await writeBackTargets({ routineExerciseId: 're-1', cycleId: 'c-1', targets: FULL_TARGETS }, store.db);

    // targetSets is overridden on the cycle row -> written there, unchanged on base.
    expect(store.rowsOf(routineExerciseCycleTarget)[0].targetSets).toBe(FULL_TARGETS.targetSets);
    expect(store.rowsOf(routineExercise)[0].targetSets).toBe(1);
    // Every other field has no override -> written to base.
    expect(store.rowsOf(routineExercise)[0]).toMatchObject({
      targetRepMin: FULL_TARGETS.targetRepMin,
      targetRepMax: FULL_TARGETS.targetRepMax,
      targetRir: FULL_TARGETS.targetRir,
      targetRestSeconds: FULL_TARGETS.targetRestSeconds,
    });
  });

  it('never inserts a new routine_exercise_cycle_target row', async () => {
    const store = inMemoryDb();
    store.seed(routineExercise, { id: 're-1', targetSets: 1, targetRepMin: 1, targetRepMax: 1, targetRir: 1, targetRestSeconds: 1 });

    await writeBackTargets({ routineExerciseId: 're-1', cycleId: 'c-1', targets: FULL_TARGETS }, store.db);

    expect(store.rowsOf(routineExerciseCycleTarget)).toHaveLength(0);
  });
});

describe('addExerciseToSession — LOG-14, no deduplication', () => {
  it('appends one session_exercise per selected id at consecutive order_index values, starting after the existing max', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-existing', sessionId: 's-1', exerciseId: 'ex-0', orderIndex: 2, removedAt: null });

    const ids = await addExerciseToSession({ sessionId: 's-1', exerciseIds: ['ex-1', 'ex-2'] }, store.db);

    expect(ids).toHaveLength(2);
    const added = store.rowsOf(sessionExercise).filter((row) => row.id !== 'se-existing');
    expect(added.map((row) => row.orderIndex)).toEqual([3, 4]);
  });

  it('adding the same exercise id twice produces two distinct rows with distinct ids', async () => {
    const store = inMemoryDb();

    const ids = await addExerciseToSession({ sessionId: 's-1', exerciseIds: ['ex-1', 'ex-1'] }, store.db);

    expect(new Set(ids).size).toBe(2);
    const rows = store.rowsOf(sessionExercise).filter((row) => row.exerciseId === 'ex-1');
    expect(rows).toHaveLength(2);
    expect(rows[0].id).not.toBe(rows[1].id);
    expect(rows.map((row) => row.orderIndex)).toEqual([0, 1]);
  });

  it('every added row carries no routineExerciseId and every target renders null (EMPTY_PRESCRIPTION)', async () => {
    const store = inMemoryDb();

    await addExerciseToSession({ sessionId: 's-1', exerciseIds: ['ex-1'] }, store.db);

    const row = store.rowsOf(sessionExercise)[0];
    expect(row.routineExerciseId).toBeNull();
    expect(row.targetSets).toBeNull();
    expect(row.targetRepMin).toBeNull();
  });
});

describe('swapSessionExercise — preserves order and logged sets (LOG-14)', () => {
  it('updates exercise_id in place, preserving order_index and every attached logged_set id', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', sessionId: 's-1', exerciseId: 'ex-old', orderIndex: 2 });
    store.seed(loggedSet, { id: 'ls-1', sessionExerciseId: 'se-1', setIndex: 1 });
    store.seed(loggedSet, { id: 'ls-2', sessionExerciseId: 'se-1', setIndex: 2 });

    await swapSessionExercise({ sessionExerciseId: 'se-1', newExerciseId: 'ex-new' }, store.db);

    expect(store.rowsOf(sessionExercise)[0].exerciseId).toBe('ex-new');
    expect(store.rowsOf(sessionExercise)[0].orderIndex).toBe(2);
    expect(store.rowsOf(loggedSet).map((row) => row.id)).toEqual(['ls-1', 'ls-2']);
    expect(store.rowsOf(loggedSet).every((row) => row.sessionExerciseId === 'se-1')).toBe(true);
  });
});

describe('removeSessionExercise — a stamp, never a delete (LOG-14/T-05-06-03)', () => {
  it('stamps removed_at and leaves every logged_set row intact — a before/after row-count assertion', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', removedAt: null });
    store.seed(loggedSet, { id: 'ls-1', sessionExerciseId: 'se-1' });
    store.seed(loggedSet, { id: 'ls-2', sessionExerciseId: 'se-1' });
    const before = store.rowsOf(loggedSet).length;

    await removeSessionExercise('se-1', store.db);

    expect(store.rowsOf(sessionExercise)[0].removedAt).not.toBeNull();
    expect(store.rowsOf(sessionExercise)).toHaveLength(1);
    expect(store.rowsOf(loggedSet)).toHaveLength(before);
  });

  it('does not race a keypad entry: only the removed row is touched', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', removedAt: null });
    store.seed(sessionExercise, { id: 'se-2', removedAt: null });

    await removeSessionExercise('se-1', store.db);

    expect(store.rowsOf(sessionExercise).find((row) => row.id === 'se-2')?.removedAt).toBeNull();
  });
});

describe('reorderSessionExercises', () => {
  it('produces a contiguous order_index sequence over the non-removed rows in the given order', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', sessionId: 's-1', orderIndex: 5 });
    store.seed(sessionExercise, { id: 'se-2', sessionId: 's-1', orderIndex: 1 });
    store.seed(sessionExercise, { id: 'se-3', sessionId: 's-1', orderIndex: 3 });

    await reorderSessionExercises('s-1', ['se-3', 'se-1', 'se-2'], store.db);

    const byId = new Map(store.rowsOf(sessionExercise).map((row) => [row.id, row.orderIndex]));
    expect(byId.get('se-3')).toBe(0);
    expect(byId.get('se-1')).toBe(1);
    expect(byId.get('se-2')).toBe(2);
  });
});

describe('generateWarmupSets — deterministic, durable, idempotent (LOG-17)', () => {
  it('a first call inserts exactly the rows warmupSets() returns, each warm-up-typed and incomplete', async () => {
    const store = inMemoryDb();

    const ids = await generateWarmupSets({ sessionExerciseId: 'se-1', workingWeightKg: 100 }, store.db);

    const expected = warmupSets(100);
    expect(ids).toHaveLength(expected.length);
    const rows = store.rowsOf(loggedSet);
    expect(rows).toHaveLength(expected.length);
    rows.forEach((row, index) => {
      expect(row.setType).toBe('warmup');
      expect(row.completed).toBe(false);
      expect(Number(row.weightKg)).toBeCloseTo(expected[index].weightKg);
      expect(row.reps).toBe(expected[index].reps);
    });
  });

  it('a second call for the same exercise regenerates rather than appends, and a completed warm-up row survives', async () => {
    const store = inMemoryDb();

    await generateWarmupSets({ sessionExerciseId: 'se-1', workingWeightKg: 100 }, store.db);
    // Mark one generated row as completed, as if the user actually did it.
    const [firstGenerated] = store.rowsOf(loggedSet);
    firstGenerated.completed = true;

    await generateWarmupSets({ sessionExerciseId: 'se-1', workingWeightKg: 120 }, store.db);

    const expected = warmupSets(120);
    const rows = store.rowsOf(loggedSet);
    // The completed row from the first generation survives untouched, plus the new ladder.
    expect(rows.filter((row) => row.completed === true)).toHaveLength(1);
    expect(rows.filter((row) => row.completed === false)).toHaveLength(expected.length);
  });

  it('a partially-written generation converges to the full ladder on re-run', async () => {
    const store = inMemoryDb();
    // Simulate an interrupted first generation: only one row of the ladder made it in.
    store.seed(loggedSet, {
      id: 'ls-partial',
      sessionExerciseId: 'se-1',
      setIndex: 1,
      setType: 'warmup',
      completed: false,
      weightKg: '40',
      reps: 10,
    });

    await generateWarmupSets({ sessionExerciseId: 'se-1', workingWeightKg: 100 }, store.db);

    const expected = warmupSets(100);
    const rows = store.rowsOf(loggedSet).filter((row) => row.setType === 'warmup');
    expect(rows).toHaveLength(expected.length);
  });

  it('writes no rows for a null or zero working weight', async () => {
    const store = inMemoryDb();

    const idsForNull = await generateWarmupSets({ sessionExerciseId: 'se-1', workingWeightKg: null }, store.db);
    const idsForZero = await generateWarmupSets({ sessionExerciseId: 'se-1', workingWeightKg: 0 }, store.db);

    expect(idsForNull).toHaveLength(0);
    expect(idsForZero).toHaveLength(0);
    expect(store.rowsOf(loggedSet)).toHaveLength(0);
  });
});

describe('session-mutations — the database-injection seam (WINDOWS #23)', () => {
  it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', notes: null });

    await setNote({ level: 'exercise', id: 'se-1', text: 'x' }, store.db);

    expect(getPowerSyncMock).not.toHaveBeenCalled();
  });

  it('resolves getPowerSync when no database argument is passed', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', notes: null });
    getPowerSyncMock.mockReturnValue(store.db);

    await setNote({ level: 'exercise', id: 'se-1', text: 'x' });

    expect(getPowerSyncMock).toHaveBeenCalled();
  });
});
