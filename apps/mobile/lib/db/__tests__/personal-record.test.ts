import {
  computeSessionPrTypesBySetId,
  detectPrsForSession,
  loadPriorBestByExercise,
  loadSessionPersonalRecords,
  logPersonalRecord,
} from '../personal-record';
import { getPowerSync } from '../powersync';
import { loadExerciseNameMap } from '../programs/load-program';
import { loggedSet, personalRecord, sessionExercise, workoutSession } from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../programs/load-program', () => ({ loadExerciseNameMap: jest.fn() }));
jest.mock('../id', () => {
  let counter = 0;
  return { generateClientId: jest.fn(() => `pr-id-${counter++}`) };
});

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;
const loadExerciseNameMapMock = loadExerciseNameMap as jest.MockedFunction<typeof loadExerciseNameMap>;

type Row = Record<string, unknown>;

// Mirrors lib/db/__tests__/session-query.test.ts's own fakeSessionDb convention: eq()/and()
// conditions are evaluated for real; inArray()'s multi-value membership is out of scope for this
// fake (same documented limitation as log-set.test.ts's inMemoryDb) — every fixture below is
// therefore seeded narrowly enough that "return every row of this table" is still correct.
type TableLike = Record<string, { name?: string } | undefined>;

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

function propertyKeyForColumn(table: TableLike, columnName: string): string | undefined {
  return Object.entries(table).find(([, column]) => column?.name === columnName)?.[0];
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

interface FakeRows {
  workoutSessionRows?: Row[];
  sessionExerciseRows?: Row[];
  loggedSetRows?: Row[];
  personalRecordRows?: Row[];
}

function fakeDb(rows: FakeRows = {}) {
  const inserted: { table: unknown; values: Row }[] = [];
  const selectCounts = new Map<unknown, number>();

  const tables = new Map<unknown, [TableLike, Row[]]>([
    [workoutSession, [workoutSession as unknown as TableLike, rows.workoutSessionRows ?? []]],
    [sessionExercise, [sessionExercise as unknown as TableLike, rows.sessionExerciseRows ?? []]],
    [loggedSet, [loggedSet as unknown as TableLike, rows.loggedSetRows ?? []]],
    [personalRecord, [personalRecord as unknown as TableLike, rows.personalRecordRows ?? []]],
  ]);

  const db = {
    select: () => ({
      from: (table: unknown) => {
        selectCounts.set(table, (selectCounts.get(table) ?? 0) + 1);
        return {
          where: (condition: unknown) => {
            const [tableDef, tableRows] = tables.get(table) ?? [{}, []];
            const matched = tableRows.filter((row) => rowMatches(tableDef, row, condition));
            return Object.assign(Promise.resolve(matched), { orderBy: () => Promise.resolve(matched) });
          },
        };
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Row) => {
        inserted.push({ table, values });
        // Round-trips into the backing table so a second detectPrsForSession run (the correction
        // affordance's re-run, LOG-19) sees what the first run wrote — required for the
        // idempotency guard's own test below.
        tables.get(table)?.[1].push(values);
        return Promise.resolve();
      },
    }),
  } as unknown as ReturnType<typeof getPowerSync>;

  return {
    db,
    inserted,
    getSelectCount: (table: unknown) => selectCounts.get(table) ?? 0,
    // Direct row mutation, bypassing db.insert/update entirely — used by the correction-affordance
    // test below to simulate "a correction already landed" without needing an updateLoggedSet fake
    // of its own; personal-record.ts never calls this, only the test does.
    mutateRow: (table: unknown, id: string, patch: Row) => {
      const [, tableRows] = tables.get(table) ?? [{}, []];
      const row = tableRows.find((candidate) => candidate.id === id);
      if (row) Object.assign(row, patch);
    },
  };
}

beforeEach(() => {
  getPowerSyncMock.mockReset();
  loadExerciseNameMapMock.mockResolvedValue(new Map());
});

describe('logPersonalRecord (D-01, D-04)', () => {
  it('inserts one row with a generated id, a decimal-string value, and a null reconciled_at', async () => {
    const { db, inserted } = fakeDb();

    const id = await logPersonalRecord(
      {
        userId: 'user-1',
        exerciseId: 'ex-1',
        prType: 'heaviest_weight',
        value: 102.5,
        loggedSetId: 'ls-1',
        achievedAt: new Date('2026-08-24T10:00:00.000Z'),
      },
      db,
    );

    expect(inserted).toHaveLength(1);
    expect(inserted[0].table).toBe(personalRecord);
    expect(inserted[0].values).toMatchObject({
      id,
      userId: 'user-1',
      exerciseId: 'ex-1',
      prType: 'heaviest_weight',
      value: '102.500',
      loggedSetId: 'ls-1',
      achievedAt: '2026-08-24T10:00:00.000Z',
      reconciledAt: null,
    });
  });
});

describe('loadPriorBestByExercise', () => {
  it('folds only the sets from OTHER sessions, excluding the session being summarised', async () => {
    const { db } = fakeDb({
      sessionExerciseRows: [
        { id: 'se-prior', exerciseId: 'ex-1', sessionId: 's-prior' },
        { id: 'se-current', exerciseId: 'ex-1', sessionId: 's-current' },
      ],
      loggedSetRows: [
        { sessionExerciseId: 'se-prior', weightKg: '90.000', reps: 10, setType: 'normal', completed: true },
        { sessionExerciseId: 'se-current', weightKg: '999.000', reps: 1, setType: 'normal', completed: true },
      ],
    });

    const result = await loadPriorBestByExercise(['ex-1'], 's-current', db);

    expect(result.get('ex-1')?.heaviestWeight).toBe(90);
  });

  it('returns an empty PriorBest for an exercise with no history at all', async () => {
    const { db } = fakeDb({ sessionExerciseRows: [], loggedSetRows: [] });

    const result = await loadPriorBestByExercise(['ex-new'], 's-current', db);

    expect(result.get('ex-new')).toEqual({
      heaviestWeight: null,
      bestE1rm: null,
      bestSetVolume: null,
      mostRepsAtWeight: new Map(),
    });
  });

  it('returns an empty map and issues no select for an empty exercise id list', async () => {
    const { db, getSelectCount } = fakeDb();

    const result = await loadPriorBestByExercise([], 's-current', db);

    expect(result.size).toBe(0);
    expect(getSelectCount(sessionExercise)).toBe(0);
  });
});

const SESSION_ROW = { id: 's-1', routineDayId: null, status: 'in_progress', startedAt: '2026-08-24T09:00:00.000Z', pausedAt: null, accumulatedPausedSeconds: 0, restTargetAt: null };

describe('detectPrsForSession (D-30)', () => {
  it('writes exactly one heaviest_weight row across two progressively heavier completed sets, pointing at the heavier set', async () => {
    // Prior history at 95kg means the session's own first set (90kg) is NOT itself a first-ever
    // PR — only the second, 100kg set both beats prior history AND beats the session's own first
    // set, isolating the "advances within the session" behavior this test targets.
    const { db, inserted } = fakeDb({
      workoutSessionRows: [SESSION_ROW],
      sessionExerciseRows: [
        { id: 'se-1', sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, removedAt: null },
        { id: 'se-prior', sessionId: 's-prior', exerciseId: 'ex-1', orderIndex: 0, removedAt: null },
      ],
      loggedSetRows: [
        { id: 'ls-prior', sessionExerciseId: 'se-prior', setIndex: 1, setType: 'normal', weightKg: '95.000', reps: 5, completed: true, loggedAt: '2026-08-20T09:00:00.000Z' },
        { id: 'ls-1', sessionExerciseId: 'se-1', setIndex: 1, setType: 'normal', weightKg: '90.000', reps: 5, completed: true, loggedAt: '2026-08-24T09:05:00.000Z' },
        { id: 'ls-2', sessionExerciseId: 'se-1', setIndex: 2, setType: 'normal', weightKg: '100.000', reps: 5, completed: true, loggedAt: '2026-08-24T09:10:00.000Z' },
      ],
    });

    await detectPrsForSession('s-1', 'user-1', db);

    const heaviestWeightWrites = inserted.filter((call) => call.values.prType === 'heaviest_weight');
    expect(heaviestWeightWrites).toHaveLength(1);
    expect(heaviestWeightWrites[0].values.loggedSetId).toBe('ls-2');
    expect(heaviestWeightWrites[0].values.value).toBe('100.000');
  });

  it('writes no personal_record row for a warm-up set or an uncompleted set', async () => {
    const { db, inserted } = fakeDb({
      workoutSessionRows: [SESSION_ROW],
      sessionExerciseRows: [{ id: 'se-1', sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, removedAt: null }],
      loggedSetRows: [
        { id: 'ls-warmup', sessionExerciseId: 'se-1', setIndex: 1, setType: 'warmup', weightKg: '60.000', reps: 10, completed: true, loggedAt: '2026-08-24T09:00:00.000Z' },
        { id: 'ls-uncompleted', sessionExerciseId: 'se-1', setIndex: 2, setType: 'normal', weightKg: '100.000', reps: 5, completed: false, loggedAt: '2026-08-24T09:05:00.000Z' },
      ],
    });

    await detectPrsForSession('s-1', 'user-1', db);

    expect(inserted).toHaveLength(0);
  });

  it('stamps every written row with the exact logged_set_id of the set that achieved it', async () => {
    const { db, inserted } = fakeDb({
      workoutSessionRows: [SESSION_ROW],
      sessionExerciseRows: [{ id: 'se-1', sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, removedAt: null }],
      loggedSetRows: [
        { id: 'ls-only', sessionExerciseId: 'se-1', setIndex: 1, setType: 'normal', weightKg: '80.000', reps: 5, completed: true, loggedAt: '2026-08-24T09:00:00.000Z' },
      ],
    });

    await detectPrsForSession('s-1', 'user-1', db);

    expect(inserted.length).toBeGreaterThan(0);
    for (const call of inserted) {
      expect(call.values.loggedSetId).toBe('ls-only');
    }
  });

  it('does not double-record an already-written PR when re-run (LOG-19 correction re-detection)', async () => {
    const { db, inserted } = fakeDb({
      workoutSessionRows: [SESSION_ROW],
      sessionExerciseRows: [{ id: 'se-1', sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, removedAt: null }],
      loggedSetRows: [
        { id: 'ls-only', sessionExerciseId: 'se-1', setIndex: 1, setType: 'normal', weightKg: '80.000', reps: 5, completed: true, loggedAt: '2026-08-24T09:00:00.000Z' },
      ],
    });

    await detectPrsForSession('s-1', 'user-1', db);
    const firstRunCount = inserted.length;
    expect(firstRunCount).toBeGreaterThan(0);

    await detectPrsForSession('s-1', 'user-1', db);

    expect(inserted).toHaveLength(firstRunCount);
  });

  it('does nothing when the session id names no row', async () => {
    const { db, inserted } = fakeDb({ workoutSessionRows: [] });

    await detectPrsForSession('missing', 'user-1', db);

    expect(inserted).toHaveLength(0);
  });
});

describe('computeSessionPrTypesBySetId (LOG-19 — the summary display never trusts stale rows)', () => {
  it('stops reporting a PR type once a correction lowers the set below the prior best, without touching the durable row already written for the original value', async () => {
    const { db, inserted, mutateRow } = fakeDb({
      workoutSessionRows: [SESSION_ROW],
      sessionExerciseRows: [
        { id: 'se-1', sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, removedAt: null },
        { id: 'se-prior', sessionId: 's-prior', exerciseId: 'ex-1', orderIndex: 0, removedAt: null },
      ],
      loggedSetRows: [
        { id: 'ls-prior', sessionExerciseId: 'se-prior', setIndex: 1, setType: 'normal', weightKg: '90.000', reps: 5, completed: true, loggedAt: '2026-08-20T09:00:00.000Z' },
        { id: 'ls-1', sessionExerciseId: 'se-1', setIndex: 1, setType: 'normal', weightKg: '100.000', reps: 5, completed: true, loggedAt: '2026-08-24T09:05:00.000Z' },
      ],
    });

    await detectPrsForSession('s-1', 'user-1', db);
    const writtenForOriginalValue = inserted.filter((call) => call.values.loggedSetId === 'ls-1' && call.values.prType === 'heaviest_weight');
    expect(writtenForOriginalValue).toHaveLength(1);

    const beforeCorrection = await computeSessionPrTypesBySetId('s-1', db);
    expect(beforeCorrection.get('ls-1')).toContain('heaviest_weight');

    // Simulate the correction affordance's write: lower ls-1's weight below the prior best.
    mutateRow(loggedSet, 'ls-1', { weightKg: '80.000' });

    const afterCorrection = await computeSessionPrTypesBySetId('s-1', db);
    expect(afterCorrection.get('ls-1') ?? []).not.toContain('heaviest_weight');

    // The original write is untouched — detectPrsForSession never deletes or supersedes a row.
    expect(writtenForOriginalValue).toHaveLength(1);
  });
});

describe('loadSessionPersonalRecords (T-05-08-03)', () => {
  it('returns an empty array when the session has no session_exercise rows', async () => {
    const { db } = fakeDb({ sessionExerciseRows: [] });

    const result = await loadSessionPersonalRecords('s-1', db);

    expect(result).toEqual([]);
  });

  it('returns the personal_record rows joined through the session’s own set ids', async () => {
    const { db } = fakeDb({
      sessionExerciseRows: [{ id: 'se-1', sessionId: 's-1' }],
      loggedSetRows: [{ id: 'ls-1', sessionExerciseId: 'se-1' }],
      personalRecordRows: [
        { id: 'pr-1', exerciseId: 'ex-1', prType: 'heaviest_weight', value: '100.000', loggedSetId: 'ls-1', achievedAt: '2026-08-24T09:10:00.000Z' },
      ],
    });

    const result = await loadSessionPersonalRecords('s-1', db);

    expect(result).toHaveLength(1);
    expect(result[0].loggedSetId).toBe('ls-1');
  });
});
