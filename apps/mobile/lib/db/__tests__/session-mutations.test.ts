import { serializeEquipmentJson } from '@fitness/api-contracts';
import { warmupSets } from '@fitness/pr-rules';
import {
  addExerciseToSession,
  detachSuperset,
  formSuperset,
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
import { equipmentProfile, loggedSet, routineExercise, routineExerciseCycleTarget, sessionExercise, workoutSession } from '../schema';

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
  let transactionCount = 0;

  function rowsFor(table: unknown): Row[] {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table) as Row[];
  }

  const db = {
    // Bare select() (no projection object) returns whole rows as-is — loadEquipmentProfile
    // (equipment-profiles.ts) reads this way, matching session-equipment.test.ts's own fake.
    select: (projection?: Record<string, unknown>) => ({
      from: (table: TableLike) => ({
        where: (condition: unknown) => {
          const matched = rowsFor(table).filter((row) => rowMatches(table, row, condition));
          if (!projection) {
            return Promise.resolve(matched.map((row) => ({ ...row })));
          }
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
    // CR-02: logSet (called by generateWarmupSets) wraps its select-max-then-insert in
    // db.transaction. `this` resolves to the fake because logSet always calls it as
    // db.transaction(...), so tx.select/tx.insert land on this same in-memory store.
    transaction(this: unknown, run: (tx: unknown) => Promise<unknown>) {
      transactionCount += 1;
      return run(this);
    },
  } as unknown as WriteDb;

  return {
    db,
    getTransactionCount: () => transactionCount,
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

  it('runs all of its order_index updates inside exactly one transaction call', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', sessionId: 's-1', orderIndex: 5 });
    store.seed(sessionExercise, { id: 'se-2', sessionId: 's-1', orderIndex: 1 });
    store.seed(sessionExercise, { id: 'se-3', sessionId: 's-1', orderIndex: 3 });

    await reorderSessionExercises('s-1', ['se-3', 'se-1', 'se-2'], store.db);

    expect(store.getTransactionCount()).toBe(1);
  });

  it('is idempotent — calling it twice with the same ordered ids writes the same order_index values both times', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', sessionId: 's-1', orderIndex: 5 });
    store.seed(sessionExercise, { id: 'se-2', sessionId: 's-1', orderIndex: 1 });
    store.seed(sessionExercise, { id: 'se-3', sessionId: 's-1', orderIndex: 3 });

    const orderedIds = ['se-3', 'se-1', 'se-2'];
    await reorderSessionExercises('s-1', orderedIds, store.db);
    const firstPass = new Map(store.rowsOf(sessionExercise).map((row) => [row.id, row.orderIndex]));

    await reorderSessionExercises('s-1', orderedIds, store.db);
    const secondPass = new Map(store.rowsOf(sessionExercise).map((row) => [row.id, row.orderIndex]));

    expect(secondPass).toEqual(firstPass);
  });

  it('only updates rows matching both the id and the sessionId, leaving other sessions untouched', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', sessionId: 's-1', orderIndex: 0 });
    store.seed(sessionExercise, { id: 'se-2', sessionId: 's-1', orderIndex: 1 });
    store.seed(sessionExercise, { id: 'se-9', sessionId: 's-other', orderIndex: 0 });

    await reorderSessionExercises('s-1', ['se-2', 'se-1'], store.db);

    const byId = new Map(store.rowsOf(sessionExercise).map((row) => [row.id, row.orderIndex]));
    expect(byId.get('se-9')).toBe(0);
  });
});

describe('generateWarmupSets — deterministic, durable, idempotent (LOG-17)', () => {
  it('a first call inserts exactly the rows warmupSets() returns, each warm-up-typed and incomplete', async () => {
    const store = inMemoryDb();

    const ids = await generateWarmupSets({ sessionExerciseId: 'se-1', workingWeightKg: 100, equipmentType: null }, store.db);

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

    await generateWarmupSets({ sessionExerciseId: 'se-1', workingWeightKg: 100, equipmentType: null }, store.db);
    // Mark one generated row as completed, as if the user actually did it.
    const [firstGenerated] = store.rowsOf(loggedSet);
    firstGenerated.completed = true;

    await generateWarmupSets({ sessionExerciseId: 'se-1', workingWeightKg: 120, equipmentType: null }, store.db);

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

    await generateWarmupSets({ sessionExerciseId: 'se-1', workingWeightKg: 100, equipmentType: null }, store.db);

    const expected = warmupSets(100);
    const rows = store.rowsOf(loggedSet).filter((row) => row.setType === 'warmup');
    expect(rows).toHaveLength(expected.length);
  });

  it('writes no rows for a null or zero working weight', async () => {
    const store = inMemoryDb();

    const idsForNull = await generateWarmupSets({ sessionExerciseId: 'se-1', workingWeightKg: null, equipmentType: null }, store.db);
    const idsForZero = await generateWarmupSets({ sessionExerciseId: 'se-1', workingWeightKg: 0, equipmentType: null }, store.db);

    expect(idsForNull).toHaveLength(0);
    expect(idsForZero).toHaveLength(0);
    expect(store.rowsOf(loggedSet)).toHaveLength(0);
  });

  it('rounds each step down to the nearest achievable barbell load when the session resolves a gym inventory (D-10)', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', sessionId: 'sess-1' });
    store.seed(workoutSession, { id: 'sess-1', equipmentProfileId: 'gym-1' });
    store.seed(equipmentProfile, {
      id: 'gym-1',
      userId: null,
      name: 'Test Gym',
      isDefault: false,
      barbellWeightKg: '20.000',
      availablePlates: serializeEquipmentJson([{ weightKg: '20.000', pairCount: 1 }]),
      dumbbellIncrementsKg: serializeEquipmentJson([]),
      machineAvailability: serializeEquipmentJson([]),
      nativeUnit: 'kg',
      archivedAt: null,
      serverSeq: null,
    });

    // Achievable barbell loads: bar alone (20) and bar + one 20kg pair (60). 40% of 100 = 40 rounds
    // down to 20 (the bar); 60% = 60 is exactly achievable; 80% = 80 rounds down to 60 — never the
    // plain-increment values warmupSets() would otherwise produce.
    await generateWarmupSets({ sessionExerciseId: 'se-1', workingWeightKg: 100, equipmentType: 'barbell' }, store.db);

    const rows = store.rowsOf(loggedSet);
    expect(rows.map((row) => Number(row.weightKg))).toEqual([20, 60, 60]);
  });

  it('rounds each step down to the nearest achievable dumbbell load for a dumbbell exercise, not the barbell loads (CR-01)', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', sessionId: 'sess-1' });
    store.seed(workoutSession, { id: 'sess-1', equipmentProfileId: 'gym-1' });
    store.seed(equipmentProfile, {
      id: 'gym-1',
      userId: null,
      name: 'Test Gym',
      isDefault: false,
      barbellWeightKg: '20.000',
      availablePlates: serializeEquipmentJson([{ weightKg: '20.000', pairCount: 1 }]),
      dumbbellIncrementsKg: serializeEquipmentJson([
        { weightKg: '12' },
        { weightKg: '22' },
        { weightKg: '45' },
        { weightKg: '70' },
      ]),
      machineAvailability: serializeEquipmentJson([]),
      nativeUnit: 'kg',
      archivedAt: null,
      serverSeq: null,
    });

    // Achievable barbell loads for this gym are [20, 60] — if the rounder used those (the CR-01
    // bug), 40/60/80 would round down to 20/60/60. Rounded against the gym's dumbbells instead,
    // they round down to 22/45/70.
    await generateWarmupSets(
      { sessionExerciseId: 'se-1', workingWeightKg: 100, equipmentType: 'dumbbell' },
      store.db,
    );

    const rows = store.rowsOf(loggedSet);
    expect(rows.map((row) => Number(row.weightKg))).toEqual([22, 45, 70]);
  });

  it('falls back to the plain increment path, never a silent zero, for a machine exercise at a barbell-less gym (CR-01)', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', sessionId: 'sess-1' });
    store.seed(workoutSession, { id: 'sess-1', equipmentProfileId: 'gym-1' });
    store.seed(equipmentProfile, {
      id: 'gym-1',
      userId: null,
      name: 'Test Gym',
      isDefault: false,
      barbellWeightKg: null,
      availablePlates: serializeEquipmentJson([]),
      dumbbellIncrementsKg: serializeEquipmentJson([{ weightKg: '20' }]),
      machineAvailability: serializeEquipmentJson([]),
      nativeUnit: 'kg',
      archivedAt: null,
      serverSeq: null,
    });

    await generateWarmupSets(
      { sessionExerciseId: 'se-1', workingWeightKg: 100, equipmentType: 'machine' },
      store.db,
    );

    const expected = warmupSets(100);
    const rows = store.rowsOf(loggedSet);
    expect(rows).toHaveLength(expected.length);
    rows.forEach((row, index) => {
      expect(Number(row.weightKg)).toBeCloseTo(expected[index].weightKg);
    });
  });

  it('falls back to the plain increment path when the session resolves no gym inventory', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', sessionId: 'sess-1' });
    store.seed(workoutSession, { id: 'sess-1', equipmentProfileId: null });

    await generateWarmupSets({ sessionExerciseId: 'se-1', workingWeightKg: 100, equipmentType: null }, store.db);

    const expected = warmupSets(100);
    const rows = store.rowsOf(loggedSet);
    rows.forEach((row, index) => {
      expect(Number(row.weightKg)).toBeCloseTo(expected[index].weightKg);
    });
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

describe('formSuperset — session-scoped superset formation (D-11, D-15, D-16, T-7-02)', () => {
  it('pairs an exercise with its live next-adjacent exercise, writing one fresh group id onto both rows and no others', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', sessionId: 's-1', orderIndex: 0, supersetGroupId: null, removedAt: null });
    store.seed(sessionExercise, { id: 'se-2', sessionId: 's-1', orderIndex: 1, supersetGroupId: null, removedAt: null });
    store.seed(sessionExercise, { id: 'se-3', sessionId: 's-1', orderIndex: 2, supersetGroupId: null, removedAt: null });

    const result = await formSuperset({ sessionExerciseId: 'se-1', sessionId: 's-1' }, store.db);

    expect(result.paired).toBe(true);
    expect(result.partnerId).toBe('se-2');
    const byId = new Map(store.rowsOf(sessionExercise).map((row) => [row.id, row.supersetGroupId]));
    expect(byId.get('se-1')).toBe(result.groupId);
    expect(byId.get('se-2')).toBe(result.groupId);
    expect(byId.get('se-3')).toBeNull();
  });

  it('reports no pairing and writes nothing for the last live exercise in the session', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', sessionId: 's-1', orderIndex: 0, supersetGroupId: null, removedAt: null });
    store.seed(sessionExercise, { id: 'se-2', sessionId: 's-1', orderIndex: 1, supersetGroupId: null, removedAt: null });

    const result = await formSuperset({ sessionExerciseId: 'se-2', sessionId: 's-1' }, store.db);

    expect(result).toEqual({ paired: false, groupId: null, partnerId: null });
    expect(store.rowsOf(sessionExercise).every((row) => row.supersetGroupId === null)).toBe(true);
  });

  it("reuses the next-adjacent exercise's existing group id rather than minting a new one", async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', sessionId: 's-1', orderIndex: 0, supersetGroupId: null, removedAt: null });
    store.seed(sessionExercise, { id: 'se-2', sessionId: 's-1', orderIndex: 1, supersetGroupId: 'g-existing', removedAt: null });

    const result = await formSuperset({ sessionExerciseId: 'se-1', sessionId: 's-1' }, store.db);

    expect(result.groupId).toBe('g-existing');
    const byId = new Map(store.rowsOf(sessionExercise).map((row) => [row.id, row.supersetGroupId]));
    expect(byId.get('se-1')).toBe('g-existing');
    expect(byId.get('se-2')).toBe('g-existing');
  });

  it('a chain of pairwise taps produces one three-member group sharing the same id, not two overlapping pairs (D-15)', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', sessionId: 's-1', orderIndex: 0, supersetGroupId: null, removedAt: null });
    store.seed(sessionExercise, { id: 'se-2', sessionId: 's-1', orderIndex: 1, supersetGroupId: null, removedAt: null });
    store.seed(sessionExercise, { id: 'se-3', sessionId: 's-1', orderIndex: 2, supersetGroupId: null, removedAt: null });

    await formSuperset({ sessionExerciseId: 'se-1', sessionId: 's-1' }, store.db);
    await formSuperset({ sessionExerciseId: 'se-2', sessionId: 's-1' }, store.db);

    const groupIds = new Set(store.rowsOf(sessionExercise).map((row) => row.supersetGroupId));
    expect(groupIds.size).toBe(1);
    expect(groupIds.has(null)).toBe(false);
  });

  it('skips a removed exercise when resolving the next adjacent one', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', sessionId: 's-1', orderIndex: 0, supersetGroupId: null, removedAt: null });
    store.seed(sessionExercise, {
      id: 'se-2',
      sessionId: 's-1',
      orderIndex: 1,
      supersetGroupId: null,
      removedAt: '2026-08-28T00:00:00.000Z',
    });
    store.seed(sessionExercise, { id: 'se-3', sessionId: 's-1', orderIndex: 2, supersetGroupId: null, removedAt: null });

    const result = await formSuperset({ sessionExerciseId: 'se-1', sessionId: 's-1' }, store.db);

    expect(result.partnerId).toBe('se-3');
    const byId = new Map(store.rowsOf(sessionExercise).map((row) => [row.id, row.supersetGroupId]));
    expect(byId.get('se-2')).toBeNull();
  });

  it('only pairs within the given sessionId, ignoring a same-order-index row from another session', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', sessionId: 's-1', orderIndex: 0, supersetGroupId: null, removedAt: null });
    store.seed(sessionExercise, { id: 'se-x', sessionId: 's-other', orderIndex: 1, supersetGroupId: null, removedAt: null });

    const result = await formSuperset({ sessionExerciseId: 'se-1', sessionId: 's-1' }, store.db);

    expect(result).toEqual({ paired: false, groupId: null, partnerId: null });
  });

  it('never writes to routine_exercise (D-16) — days.ts:148 and duplicate-routine.ts:99 stay true', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', sessionId: 's-1', orderIndex: 0, supersetGroupId: null, removedAt: null });
    store.seed(sessionExercise, { id: 'se-2', sessionId: 's-1', orderIndex: 1, supersetGroupId: null, removedAt: null });
    store.seed(routineExercise, { id: 're-1', supersetGroupId: null });

    await formSuperset({ sessionExerciseId: 'se-1', sessionId: 's-1' }, store.db);

    expect(store.rowsOf(routineExercise)[0].supersetGroupId).toBeNull();
  });
});

describe('detachSuperset — clears exactly the named row, leaves the partner intact (D-24, T-7-16)', () => {
  it('clears superset_group_id on exactly the named row and leaves the other member unchanged', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', supersetGroupId: 'g1' });
    store.seed(sessionExercise, { id: 'se-2', supersetGroupId: 'g1' });

    await detachSuperset('se-1', store.db);

    const byId = new Map(store.rowsOf(sessionExercise).map((row) => [row.id, row.supersetGroupId]));
    expect(byId.get('se-1')).toBeNull();
    expect(byId.get('se-2')).toBe('g1');
  });

  it('never writes to routine_exercise (D-16)', async () => {
    const store = inMemoryDb();
    store.seed(sessionExercise, { id: 'se-1', supersetGroupId: 'g1' });
    store.seed(routineExercise, { id: 're-1', supersetGroupId: 'unchanged' });

    await detachSuperset('se-1', store.db);

    expect(store.rowsOf(routineExercise)[0].supersetGroupId).toBe('unchanged');
  });
});
