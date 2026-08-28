import { and, eq } from 'drizzle-orm';
import { addSessionExercise, logSet, setSessionDate, startSession, startWorkoutFromProgram } from '../log-set';
import { captureCalendarDay } from '../../calendar-day';
import { getPowerSync } from '../powersync';
import { archiveDay, removeDay, removeExercise, restoreDay } from '../programs/days';
import { setExerciseTargets } from '../programs/targets';
import {
  routine,
  routineDay,
  routineExercise,
  routineExerciseCycleTarget,
  sessionExercise,
  workoutSession,
} from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../id', () => ({ generateClientId: jest.fn(() => 'fixed-id') }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;

// CR-02: logSet wraps its select-max-then-insert in db.transaction. The fake's transaction handle
// IS the fake — logSet calls tx.select/tx.insert, and handing it a separate object would hide
// those calls, so `this` resolves to the fake because logSet always calls it as db.transaction(...).
async function runInFakeTransaction(this: unknown, run: (tx: unknown) => Promise<unknown>) {
  return run(this);
}

function fakeDb(insertedValuesSpy: jest.Mock) {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        insertedValuesSpy(values);
        return Promise.resolve();
      },
    }),
    transaction: runInFakeTransaction,
  } as unknown as ReturnType<typeof getPowerSync>;
}

describe('logSet — the unit conversion boundary', () => {
  it('converts a value entered in lb to canonical kilograms before writing', async () => {
    const insertedValuesSpy = jest.fn();
    getPowerSyncMock.mockReturnValue(fakeDb(insertedValuesSpy));

    await logSet({ sessionExerciseId: 'se-1', weight: { value: '225', unit: 'lb' }, reps: 5 });

    expect(insertedValuesSpy).toHaveBeenCalledTimes(1);
    expect(insertedValuesSpy.mock.calls[0][0].weightKg).toBe('102.058');
  });

  it('stores null rather than zero for a null weight', async () => {
    const insertedValuesSpy = jest.fn();
    getPowerSyncMock.mockReturnValue(fakeDb(insertedValuesSpy));

    await logSet({ sessionExerciseId: 'se-1', weight: { value: null, unit: 'kg' }, reps: 5 });

    expect(insertedValuesSpy.mock.calls[0][0].weightKg).toBeNull();
  });

  it('stores the identical canonical decimal across two calls with the same entered value and unit', async () => {
    const insertedValuesSpy = jest.fn();
    getPowerSyncMock.mockReturnValue(fakeDb(insertedValuesSpy));

    await logSet({ sessionExerciseId: 'se-1', weight: { value: '100', unit: 'kg' }, reps: 5 });
    await logSet({ sessionExerciseId: 'se-1', weight: { value: '100', unit: 'kg' }, reps: 5 });

    const [first, second] = insertedValuesSpy.mock.calls.map((call) => call[0].weightKg);
    expect(first).toBe(second);
    expect(first).toBe('100.000');
  });
});

describe('logSet — the database-injection seam (WINDOWS #23)', () => {
  it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
    getPowerSyncMock.mockClear();
    const insertedValuesSpy = jest.fn();
    const explicitDb = fakeDb(insertedValuesSpy);

    await logSet({ sessionExerciseId: 'se-1', weight: { value: '100', unit: 'kg' }, reps: 5 }, explicitDb);

    expect(insertedValuesSpy).toHaveBeenCalledTimes(1);
    expect(getPowerSyncMock).not.toHaveBeenCalled();
  });

  it('falls back to getPowerSync() when no database argument is passed', async () => {
    const insertedValuesSpy = jest.fn();
    getPowerSyncMock.mockReturnValue(fakeDb(insertedValuesSpy));

    await logSet({ sessionExerciseId: 'se-1', weight: { value: '100', unit: 'kg' }, reps: 5 });

    expect(insertedValuesSpy).toHaveBeenCalledTimes(1);
    expect(getPowerSyncMock).toHaveBeenCalled();
  });
});

// CR-02: a double-tap fires two logSet calls before either's select(max) resolves. `where()`
// snapshots max(set_index) synchronously AT ISSUE TIME (as a real concurrent SELECT against the
// database would), then defers resolution until the test explicitly flushes it — this is what
// lets the test reproduce "both reads see the same pre-insert state" without relying on any
// incidental event-loop/timer ordering. db.transaction() queues callbacks (mirroring PowerSync's
// real single-writer guarantee, documented on WriteTx in powersync.ts): the second call's `run`
// is not invoked — so its select is not even issued — until the first call's whole transaction
// (select AND insert) has settled. Without CR-02's transaction wrap, logSet calls db.select/
// db.insert directly, so both selects are issued back-to-back before either insert lands, and
// both snapshot the same pre-insert max.
function queueingTransactionalDb() {
  const rows: Record<string, unknown>[] = [];
  let queue: Promise<unknown> = Promise.resolve();
  const pendingResolvers: (() => void)[] = [];

  const db = {
    select: () => ({
      from: () => ({
        where: () => {
          const maxIndex = rows.length === 0 ? null : Math.max(...rows.map((row) => row.setIndex as number));
          return new Promise((resolve) => {
            pendingResolvers.push(() => resolve([{ maxIndex }]));
          });
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        rows.push(values);
        return Promise.resolve();
      },
    }),
    transaction(this: unknown, run: (tx: unknown) => Promise<unknown>) {
      const result = queue.then(() => run(this));
      queue = result.catch(() => undefined);
      return result;
    },
  } as unknown as ReturnType<typeof getPowerSync>;

  return {
    db,
    rows,
    async flushUntilSettled<T>(promise: Promise<T>): Promise<T> {
      let settled = false;
      promise.then(
        () => (settled = true),
        () => (settled = true),
      );
      for (let guard = 0; !settled && guard < 100; guard++) {
        await Promise.resolve();
        pendingResolvers.shift()?.();
      }
      return promise;
    },
  };
}

describe('logSet — concurrent double-tap does not collide on set_index (CR-02)', () => {
  it('assigns distinct, sequential set_index values to two calls fired before either resolves', async () => {
    const { db, rows, flushUntilSettled } = queueingTransactionalDb();

    const both = Promise.all([
      logSet({ sessionExerciseId: 'se-1', weight: { value: '100', unit: 'kg' }, reps: 5 }, db),
      logSet({ sessionExerciseId: 'se-1', weight: { value: '105', unit: 'kg' }, reps: 5 }, db),
    ]);
    await flushUntilSettled(both);

    expect(rows).toHaveLength(2);
    const indexes = rows.map((row) => row.setIndex).sort();
    expect(indexes).toEqual([1, 2]);
  });
});

describe('startSession — the database-injection seam (WINDOWS #23)', () => {
  it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
    getPowerSyncMock.mockClear();
    const insertedValuesSpy = jest.fn();
    const explicitDb = fakeDb(insertedValuesSpy);

    await startSession({}, explicitDb);

    expect(insertedValuesSpy).toHaveBeenCalledTimes(1);
    expect(getPowerSyncMock).not.toHaveBeenCalled();
  });

  it('takes no date-override parameter and stamps started_at/timezone/local_date from the clock it was given', async () => {
    const insertedValuesSpy = jest.fn();
    const explicitDb = fakeDb(insertedValuesSpy);
    const now = new Date('2026-08-20T10:00:00.000Z');

    await startSession({ now }, explicitDb);

    const [values] = insertedValuesSpy.mock.calls[0];
    expect(values.startedAt).toBe(now.toISOString());
    expect(values.localDate).toBe(captureCalendarDay(now).localDate);
    expect(values.timezone).toBe(captureCalendarDay(now).timezone);
  });
});

// D-15/LOG-15: cycle_id is stamped exactly once, here, and never rewritten on a read path —
// the single-writer property resolveWriteBackTarget's override branch depends on.
describe('startSession — stamps cycle_id (LOG-15)', () => {
  it('writes the given cycleId to the inserted row', async () => {
    const insertedValuesSpy = jest.fn();
    const explicitDb = fakeDb(insertedValuesSpy);

    await startSession({ cycleId: 'cycle-1' }, explicitDb);

    expect(insertedValuesSpy.mock.calls[0][0].cycleId).toBe('cycle-1');
  });

  it('writes a null cycleId for a one-off session with no cycle', async () => {
    const insertedValuesSpy = jest.fn();
    const explicitDb = fakeDb(insertedValuesSpy);

    await startSession({}, explicitDb);

    expect(insertedValuesSpy.mock.calls[0][0].cycleId).toBeNull();
  });
});

// The single funnel over startSession + addSessionExercise (D-33) must hand the same cycle id to
// both, so the stored identity on workout_session and the prescription snapshot on every
// session_exercise row can never disagree (LOG-15).
function fakeProgramDb() {
  const insertedByTable = new Map<unknown, Record<string, unknown>[]>();
  const cycleTargetSelectConditions: unknown[] = [];

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => {
          if (table === routineExerciseCycleTarget) cycleTargetSelectConditions.push(condition);
          return Promise.resolve([]);
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const rows = insertedByTable.get(table) ?? [];
        rows.push(values);
        insertedByTable.set(table, rows);
        return Promise.resolve();
      },
    }),
  } as unknown as ReturnType<typeof getPowerSync>;

  return { db, insertedByTable, cycleTargetSelectConditions };
}

function cycleIdOfCondition(condition: unknown): unknown {
  const equalities: { column: string; value: unknown }[] = [];
  collectEqualities(condition, equalities);
  return equalities.find((entry) => entry.column === 'cycle_id')?.value;
}

describe('startWorkoutFromProgram — threads cycleId to the session and every exercise (LOG-15)', () => {
  it('passes the same cycleId to the session insert and to the prescription lookup for every slot', async () => {
    const { db, insertedByTable, cycleTargetSelectConditions } = fakeProgramDb();

    await startWorkoutFromProgram(
      {
        routineDayId: 'rd-1',
        cycleId: 'cycle-1',
        slots: [
          { routineExerciseId: 're-1', exerciseId: 'ex-1', orderIndex: 0 },
          { routineExerciseId: 're-2', exerciseId: 'ex-2', orderIndex: 1 },
        ],
      },
      db,
    );

    const sessionRows = insertedByTable.get(workoutSession) ?? [];
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0].cycleId).toBe('cycle-1');

    const exerciseRows = insertedByTable.get(sessionExercise) ?? [];
    expect(exerciseRows).toHaveLength(2);

    expect(cycleTargetSelectConditions).toHaveLength(2);
    for (const condition of cycleTargetSelectConditions) {
      expect(cycleIdOfCondition(condition)).toBe('cycle-1');
    }
  });
});

function fakeUpdateDb(setSpy: jest.Mock) {
  return {
    update: () => ({
      set: (patch: Record<string, unknown>) => {
        setSpy(patch);
        return { where: () => Promise.resolve() };
      },
    }),
  } as unknown as ReturnType<typeof getPowerSync>;
}

describe('setSessionDate — the single deliberate exception to D-06 (D-33, PITFALLS §12)', () => {
  it('rewrites started_at, timezone and local_date together, matching captureCalendarDay for the supplied date and zone', async () => {
    const setSpy = jest.fn();
    const db = fakeUpdateDb(setSpy);
    const date = new Date('2026-08-10T15:00:00.000Z');

    await setSessionDate('s-1', date, 'America/New_York', db);

    expect(setSpy).toHaveBeenCalledTimes(1);
    const [patch] = setSpy.mock.calls[0];
    const expected = captureCalendarDay(date, 'America/New_York');
    expect(patch.startedAt).toBe(date.toISOString());
    expect(patch.timezone).toBe(expected.timezone);
    expect(patch.localDate).toBe(expected.localDate);
  });

  it('produces the local_date of the supplied IANA zone, not the device’s current one', async () => {
    const setSpy = jest.fn();
    const db = fakeUpdateDb(setSpy);
    // Near midnight UTC: Auckland (UTC+12/+13) is already the next calendar day while Los Angeles
    // (UTC-7/-8) is still the previous one — the same instant must resolve to two different
    // local_date values depending on which zone is passed, proving no device-zone fallback leaks in.
    const date = new Date('2026-08-10T23:30:00.000Z');

    await setSessionDate('s-1', date, 'Pacific/Auckland', db);
    const aucklandLocalDate = setSpy.mock.calls[0][0].localDate;

    setSpy.mockClear();
    await setSessionDate('s-1', date, 'America/Los_Angeles', db);
    const laLocalDate = setSpy.mock.calls[0][0].localDate;

    expect(aucklandLocalDate).not.toBe(laLocalDate);
    expect(aucklandLocalDate).toBe(captureCalendarDay(date, 'Pacific/Auckland').localDate);
    expect(laLocalDate).toBe(captureCalendarDay(date, 'America/Los_Angeles').localDate);
  });
});

const BASE_TARGETS = {
  targetSets: 3,
  targetRepMin: 8,
  targetRepMax: 12,
  targetRir: 1,
  targetRestSeconds: 120,
};

const NO_TARGETS = {
  targetSets: null,
  targetRepMin: null,
  targetRepMax: null,
  targetRir: null,
  targetRestSeconds: null,
};

interface SnapshotRows {
  baseRow?: Record<string, unknown>;
  overrideRow?: Record<string, unknown>;
}

function fakeSnapshotDb(rows: SnapshotRows) {
  let selectCount = 0;
  const insertedValuesSpy = jest.fn();
  const db = {
    select: () => {
      selectCount++;
      return {
        from: (table: unknown) => ({
          where: () => {
            if (table === routineExercise) return Promise.resolve(rows.baseRow ? [rows.baseRow] : []);
            if (table === routineExerciseCycleTarget) return Promise.resolve(rows.overrideRow ? [rows.overrideRow] : []);
            return Promise.resolve([]);
          },
        }),
      };
    },
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        insertedValuesSpy(values);
        return Promise.resolve();
      },
    }),
  } as unknown as ReturnType<typeof getPowerSync>;

  return { db, insertedValuesSpy, getSelectCount: () => selectCount };
}

function snapshotOf(insertedValuesSpy: jest.Mock) {
  const values = insertedValuesSpy.mock.calls[0][0] as Record<string, unknown>;
  return {
    targetSets: values.targetSets,
    targetRepMin: values.targetRepMin,
    targetRepMax: values.targetRepMax,
    targetRir: values.targetRir,
    targetRestSeconds: values.targetRestSeconds,
  };
}

describe('addSessionExercise — the snapshot resolves the cycle, not just the base (PROG-11)', () => {
  it('snapshots five nulls and reads nothing for an exercise added with no routine_exercise_id', async () => {
    const { db, insertedValuesSpy, getSelectCount } = fakeSnapshotDb({});

    await addSessionExercise({ sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0 }, db);

    expect(snapshotOf(insertedValuesSpy)).toEqual(NO_TARGETS);
    expect(insertedValuesSpy.mock.calls[0][0].routineExerciseId).toBeNull();
    expect(getSelectCount()).toBe(0);
  });

  it("snapshots the base row's five values with no cycleId passed, in one select", async () => {
    const { db, insertedValuesSpy, getSelectCount } = fakeSnapshotDb({ baseRow: { ...BASE_TARGETS } });

    await addSessionExercise({ sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1' }, db);

    expect(snapshotOf(insertedValuesSpy)).toEqual(BASE_TARGETS);
    expect(getSelectCount()).toBe(1);
  });

  it("snapshots the base row's five values for a cycle that has no override row", async () => {
    const { db, insertedValuesSpy, getSelectCount } = fakeSnapshotDb({ baseRow: { ...BASE_TARGETS } });

    await addSessionExercise(
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1', cycleId: 'c-1' },
      db,
    );

    expect(snapshotOf(insertedValuesSpy)).toEqual(BASE_TARGETS);
    expect(getSelectCount()).toBe(2);
  });

  it("snapshots an override's targetSets alongside the base's other four values", async () => {
    const { db, insertedValuesSpy } = fakeSnapshotDb({
      baseRow: { ...BASE_TARGETS },
      overrideRow: { ...NO_TARGETS, targetSets: 5 },
    });

    await addSessionExercise(
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1', cycleId: 'c-1' },
      db,
    );

    expect(snapshotOf(insertedValuesSpy)).toEqual({ ...BASE_TARGETS, targetSets: 5 });
  });

  it("snapshots the base's targetRepMin when the override sets it to an explicit null — null means inherit, never clear", async () => {
    const { db, insertedValuesSpy } = fakeSnapshotDb({
      baseRow: { ...BASE_TARGETS },
      overrideRow: { ...NO_TARGETS, targetSets: 5, targetRepMin: null },
    });

    await addSessionExercise(
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1', cycleId: 'c-1' },
      db,
    );

    expect(snapshotOf(insertedValuesSpy).targetRepMin).toBe(8);
  });

  it('snapshots five nulls without throwing when the base row no longer exists', async () => {
    const { db, insertedValuesSpy } = fakeSnapshotDb({});

    await addSessionExercise(
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-gone', cycleId: 'c-1' },
      db,
    );

    expect(snapshotOf(insertedValuesSpy)).toEqual(NO_TARGETS);
  });

  it("snapshots an override's own values over five nulls when the base row no longer exists", async () => {
    const { db, insertedValuesSpy } = fakeSnapshotDb({
      overrideRow: { ...NO_TARGETS, targetSets: 5, targetRir: 0 },
    });

    await addSessionExercise(
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-gone', cycleId: 'c-1' },
      db,
    );

    expect(snapshotOf(insertedValuesSpy)).toEqual({ ...NO_TARGETS, targetSets: 5, targetRir: 0 });
  });

  it('issues at most two selects whatever the input — never one per target field', async () => {
    const inputs = [
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0 },
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1' },
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1', cycleId: 'c-1' },
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1', cycleId: null },
      { sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, cycleId: 'c-1' },
    ];

    for (const input of inputs) {
      const { db, getSelectCount } = fakeSnapshotDb({
        baseRow: { ...BASE_TARGETS },
        overrideRow: { ...NO_TARGETS, targetSets: 5 },
      });
      await addSessionExercise(input, db);
      expect(getSelectCount()).toBeLessThanOrEqual(2);
    }
  });
});

describe('addSessionExercise — the database-injection seam (WINDOWS #23)', () => {
  it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
    getPowerSyncMock.mockClear();
    const { db, insertedValuesSpy } = fakeSnapshotDb({ baseRow: { ...BASE_TARGETS } });

    await addSessionExercise({ sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1' }, db);

    expect(insertedValuesSpy).toHaveBeenCalledTimes(1);
    expect(getPowerSyncMock).not.toHaveBeenCalled();
  });

  it('resolves getPowerSync exactly once when no database argument is passed', async () => {
    getPowerSyncMock.mockClear();
    const { db, insertedValuesSpy } = fakeSnapshotDb({ baseRow: { ...BASE_TARGETS } });
    getPowerSyncMock.mockReturnValue(db);

    await addSessionExercise({ sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, routineExerciseId: 're-1' });

    expect(insertedValuesSpy).toHaveBeenCalledTimes(1);
    expect(getPowerSyncMock).toHaveBeenCalledTimes(1);
  });
});

type TableLike = Record<string, { name?: string } | undefined>;
type Row = Record<string, unknown>;

function propertyKeyForColumn(table: TableLike, columnName: string): string | undefined {
  return Object.entries(table).find(([, column]) => column?.name === columnName)?.[0];
}

// drizzle's eq()/and() build a SQL tree of query chunks: a column carries `name`, a bound
// parameter carries a scalar `value`, and a literal fragment carries an array `value`. Walking
// that tree is what lets the store below filter on the real conditions the shipped helpers pass,
// rather than on a hand-written predicate that could drift from them.
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

// A tiny in-memory stand-in for the local SQLite database, so the shipped write helpers
// (addSessionExercise, setExerciseTargets, removeExercise, removeDay) all run against one shared
// store in a single test. Mirrors the local schema's routine_day -> routine_exercise ->
// routine_exercise_cycle_target delete cascade, which is real on both PowerSync's local schema
// and Postgres, and which no helper issues explicitly.
function inMemoryDb() {
  const tables = new Map<unknown, Row[]>();
  const selectCounts = new Map<unknown, number>();

  function rowsFor(table: unknown): Row[] {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table) as Row[];
  }

  function cascadeDelete(table: unknown, removed: Row[]): void {
    if (table === routineDay) {
      const dayIds = removed.map((row) => row.id);
      const orphanedExercises = rowsFor(routineExercise).filter((row) => dayIds.includes(row.routineDayId));
      tables.set(
        routineExercise,
        rowsFor(routineExercise).filter((row) => !dayIds.includes(row.routineDayId)),
      );
      cascadeDelete(routineExercise, orphanedExercises);
      return;
    }
    if (table === routineExercise) {
      const exerciseIds = removed.map((row) => row.id);
      tables.set(
        routineExerciseCycleTarget,
        rowsFor(routineExerciseCycleTarget).filter((row) => !exerciseIds.includes(row.routineExerciseId)),
      );
    }
  }

  const db = {
    select: (projection: Record<string, { name?: string }>) => ({
      from: (table: TableLike) => ({
        where: (condition: unknown) => {
          selectCounts.set(table, (selectCounts.get(table) ?? 0) + 1);
          const matched = rowsFor(table).filter((row) => rowMatches(table, row, condition));
          return Promise.resolve(
            matched.map((row) => {
              const projected: Row = {};
              for (const [alias, column] of Object.entries(projection)) {
                const key = propertyKeyForColumn(table, column?.name ?? alias) ?? alias;
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
        const removed = rowsFor(table).filter((row) => rowMatches(table, row, condition));
        tables.set(
          table,
          rowsFor(table).filter((row) => !rowMatches(table, row, condition)),
        );
        cascadeDelete(table, removed);
        return Promise.resolve();
      },
    }),
  } as unknown as ReturnType<typeof getPowerSync>;

  return {
    db,
    seed(table: unknown, row: Row) {
      rowsFor(table).push({ ...row });
    },
    rowsOf(table: unknown): Row[] {
      return rowsFor(table);
    },
    selectCountFor(table: unknown): number {
      return selectCounts.get(table) ?? 0;
    },
    resetSelectCounts() {
      selectCounts.clear();
    },
  };
}

interface SeededProgram {
  store: ReturnType<typeof inMemoryDb>;
  snapshot(): Row;
}

async function seedProgramAndSnapshot(options: { override?: Row } = {}): Promise<SeededProgram> {
  const store = inMemoryDb();
  store.seed(routine, { id: 'r-1', name: 'Push Pull Legs', status: 'draft', archivedAt: null });
  store.seed(routineDay, { id: 'd-1', routineId: 'r-1', orderIndex: 1024, name: 'Push', isRestDay: false });
  store.seed(routineExercise, {
    id: 're-1',
    routineDayId: 'd-1',
    exerciseId: 'ex-1',
    orderIndex: 1024,
    ...BASE_TARGETS,
  });
  if (options.override) {
    store.seed(routineExerciseCycleTarget, {
      id: 'cet-1',
      routineExerciseId: 're-1',
      cycleId: 'c-1',
      ...NO_TARGETS,
      ...options.override,
    });
  }

  await addSessionExercise(
    {
      sessionId: 's-1',
      exerciseId: 'ex-1',
      orderIndex: 0,
      routineExerciseId: 're-1',
      cycleId: options.override ? 'c-1' : null,
    },
    store.db,
  );

  store.resetSelectCounts();

  return { store, snapshot: () => store.rowsOf(sessionExercise)[0] };
}

function targetsOf(row: Row) {
  return {
    targetSets: row.targetSets,
    targetRepMin: row.targetRepMin,
    targetRepMax: row.targetRepMax,
    targetRir: row.targetRir,
    targetRestSeconds: row.targetRestSeconds,
  };
}

// The snapshot is written once, at addSessionExercise, and no program edit may re-derive it. Every
// select the program write path makes is a read of the program, never of session_exercise — so the
// guard is on session_exercise, plus routine_exercise, which no editing helper has any reason to
// read back.
//
// routine_exercise_cycle_target is deliberately NOT in this list: setExerciseTargets reads this
// slot's overrides so it can reject a base edit that would leave a cycle resolving to repMin above
// repMax (WR-06). That read informs the write; it never reaches the session.
function expectNoRoutineReadsSince(store: ReturnType<typeof inMemoryDb>) {
  expect(store.selectCountFor(routineExercise)).toBe(0);
  expect(store.selectCountFor(sessionExercise)).toBe(0);
}

describe('PROG-11 — editing a program never changes a logged session', () => {
  // The suite below is only meaningful if the shared store resolves the eq()/and() conditions the
  // shipped helpers pass rather than matching every row — this asserts that first.
  it('resolves each helper against the row it names, never a sibling', async () => {
    const { store, snapshot } = await seedProgramAndSnapshot();
    store.seed(routineExercise, {
      id: 're-2',
      routineDayId: 'd-1',
      exerciseId: 'ex-2',
      orderIndex: 2048,
      ...NO_TARGETS,
      targetSets: 99,
    });

    expect(targetsOf(snapshot()).targetSets).toBe(3);

    await setExerciseTargets(
      're-2',
      { targetSets: 1, targetRepMin: null, targetRepMax: null, targetRir: null, targetRestSeconds: null },
      store.db,
    );
    expect(targetsOf(store.rowsOf(routineExercise).find((row) => row.id === 're-1') as Row)).toEqual(BASE_TARGETS);

    await removeExercise('re-2', store.db);
    expect(store.rowsOf(routineExercise).map((row) => row.id)).toEqual(['re-1']);
  });

  it('leaves the snapshot untouched when the base targets are rewritten', async () => {
    const { store, snapshot } = await seedProgramAndSnapshot();
    expect(targetsOf(snapshot())).toEqual(BASE_TARGETS);

    await setExerciseTargets(
      're-1',
      { targetSets: 5, targetRepMin: 3, targetRepMax: 5, targetRir: 0, targetRestSeconds: 240 },
      store.db,
    );

    expect(targetsOf(store.rowsOf(routineExercise)[0])).toEqual({
      targetSets: 5,
      targetRepMin: 3,
      targetRepMax: 5,
      targetRir: 0,
      targetRestSeconds: 240,
    });
    expect(targetsOf(snapshot())).toEqual(BASE_TARGETS);
    expectNoRoutineReadsSince(store);
  });

  it("leaves the snapshot's overridden targetSets at 5 when the cycle override is edited to 8", async () => {
    const { store, snapshot } = await seedProgramAndSnapshot({ override: { targetSets: 5 } });
    expect(targetsOf(snapshot())).toEqual({ ...BASE_TARGETS, targetSets: 5 });

    await store.db
      .update(routineExerciseCycleTarget)
      .set({ targetSets: 8 })
      .where(
        and(
          eq(routineExerciseCycleTarget.routineExerciseId, 're-1'),
          eq(routineExerciseCycleTarget.cycleId, 'c-1'),
        ),
      );

    expect(targetsOf(snapshot())).toEqual({ ...BASE_TARGETS, targetSets: 5 });
    expectNoRoutineReadsSince(store);
  });

  it("leaves the snapshot at the override's 5 — not the base's 3 — when the override is cleared away", async () => {
    const { store, snapshot } = await seedProgramAndSnapshot({ override: { targetSets: 5 } });

    await store.db
      .delete(routineExerciseCycleTarget)
      .where(
        and(
          eq(routineExerciseCycleTarget.routineExerciseId, 're-1'),
          eq(routineExerciseCycleTarget.cycleId, 'c-1'),
        ),
      );

    expect(store.rowsOf(routineExerciseCycleTarget)).toHaveLength(0);
    expect(targetsOf(snapshot()).targetSets).toBe(5);
    expectNoRoutineReadsSince(store);
  });

  it('keeps the snapshot and its now-dangling routine_exercise_id when the routine exercise is deleted', async () => {
    const { store, snapshot } = await seedProgramAndSnapshot();

    await removeExercise('re-1', store.db);

    expect(store.rowsOf(routineExercise)).toHaveLength(0);
    expect(targetsOf(snapshot())).toEqual(BASE_TARGETS);
    expect(snapshot().routineExerciseId).toBe('re-1');
    expectNoRoutineReadsSince(store);
  });

  it('keeps the snapshot when the whole day is deleted and its exercises cascade away', async () => {
    const { store, snapshot } = await seedProgramAndSnapshot({ override: { targetSets: 5 } });

    await removeDay('d-1', store.db);

    expect(store.rowsOf(routineDay)).toHaveLength(0);
    expect(store.rowsOf(routineExercise)).toHaveLength(0);
    expect(store.rowsOf(routineExerciseCycleTarget)).toHaveLength(0);
    expect(targetsOf(snapshot())).toEqual({ ...BASE_TARGETS, targetSets: 5 });
    expect(snapshot().routineExerciseId).toBe('re-1');
    expectNoRoutineReadsSince(store);
  });

  it('keeps the snapshot when the routine is renamed and archived', async () => {
    const { store, snapshot } = await seedProgramAndSnapshot();

    await store.db
      .update(routine)
      .set({ name: 'Old Program', archivedAt: '2026-08-21T00:00:00.000Z' })
      .where(eq(routine.id, 'r-1'));

    expect(store.rowsOf(routine)[0].archivedAt).toBe('2026-08-21T00:00:00.000Z');
    expect(targetsOf(snapshot())).toEqual(BASE_TARGETS);
    expectNoRoutineReadsSince(store);
  });

  // D-01/D-29: archiving a day is not a delete, so success criterion 4 has to hold against it just
  // as it holds against every editing helper above. The server-side proof that archiving emits no
  // tombstones and leaves children present is 04-12's program-sync e2e; these are the client half.
  it('leaves the snapshot untouched when the day it was logged against is archived', async () => {
    const { store, snapshot } = await seedProgramAndSnapshot({ override: { targetSets: 5 } });

    await archiveDay('d-1', store.db);

    expect(targetsOf(snapshot())).toEqual({ ...BASE_TARGETS, targetSets: 5 });
    expectNoRoutineReadsSince(store);
  });

  it('leaves the logged session pointing at the same routine_day_id, and the row itself still present, after an archive', async () => {
    const { store } = await seedProgramAndSnapshot();
    store.seed(workoutSession, { id: 's-1', routineDayId: 'd-1', status: 'completed' });

    await archiveDay('d-1', store.db);

    expect(store.rowsOf(workoutSession)[0].routineDayId).toBe('d-1');
    expect(store.rowsOf(routineDay).map((row) => row.id)).toEqual(['d-1']);
  });

  it('does not cascade: an archived day keeps its routine_exercise and routine_exercise_cycle_target children', async () => {
    const { store } = await seedProgramAndSnapshot({ override: { targetSets: 5 } });

    await archiveDay('d-1', store.db);

    expect(store.rowsOf(routineExercise).map((row) => row.id)).toEqual(['re-1']);
    expect(store.rowsOf(routineExerciseCycleTarget).map((row) => row.id)).toEqual(['cet-1']);
  });

  it('leaves the snapshot untouched by an archive-then-restore round trip', async () => {
    const { store, snapshot } = await seedProgramAndSnapshot({ override: { targetSets: 5 } });
    store.seed(workoutSession, { id: 's-1', routineDayId: 'd-1', status: 'completed' });

    await archiveDay('d-1', store.db);
    await restoreDay('d-1', store.db);

    expect(store.rowsOf(routineDay)[0].archivedAt).toBeNull();
    expect(targetsOf(snapshot())).toEqual({ ...BASE_TARGETS, targetSets: 5 });
    expect(store.rowsOf(workoutSession)[0].routineDayId).toBe('d-1');
    expectNoRoutineReadsSince(store);
  });
});
