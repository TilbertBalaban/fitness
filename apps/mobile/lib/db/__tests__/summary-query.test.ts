import { E1RM_MAX_VALID_REPS } from '@fitness/pr-rules';
import { loadSessionSummary } from '../summary-query';
import { getPowerSync } from '../powersync';
import { loadExerciseNameMap } from '../programs/load-program';
import { computeSessionPrTypesBySetId } from '../personal-record';
import { exerciseMuscleMapping, loggedSet, muscleGroup, sessionExercise, workoutSession } from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../programs/load-program', () => ({ loadExerciseNameMap: jest.fn() }));
jest.mock('../personal-record', () => ({ computeSessionPrTypesBySetId: jest.fn() }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;
const loadExerciseNameMapMock = loadExerciseNameMap as jest.MockedFunction<typeof loadExerciseNameMap>;
const computeSessionPrTypesBySetIdMock = computeSessionPrTypesBySetId as jest.MockedFunction<typeof computeSessionPrTypesBySetId>;

type Row = Record<string, unknown>;
type TableLike = Record<string, { name?: string } | undefined>;

// Same eq()/and()-only condition matcher lib/db/__tests__/session-query.test.ts and
// lib/db/__tests__/personal-record.test.ts each carry their own copy of — inArray()'s multi-value
// membership stays out of scope, so every fixture below is seeded narrowly enough that "return
// every row of this table" is still the correct behaviour for the select that consumes it.
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
  muscleMappingRows?: Row[];
  muscleGroupRows?: Row[];
}

function fakeDb(rows: FakeRows = {}) {
  let selectCount = 0;

  const tables = new Map<unknown, [TableLike, Row[]]>([
    [workoutSession, [workoutSession as unknown as TableLike, rows.workoutSessionRows ?? []]],
    [sessionExercise, [sessionExercise as unknown as TableLike, rows.sessionExerciseRows ?? []]],
    [loggedSet, [loggedSet as unknown as TableLike, rows.loggedSetRows ?? []]],
    [exerciseMuscleMapping, [exerciseMuscleMapping as unknown as TableLike, rows.muscleMappingRows ?? []]],
    [muscleGroup, [muscleGroup as unknown as TableLike, rows.muscleGroupRows ?? []]],
  ]);

  const db = {
    select: () => {
      selectCount++;
      return {
        // .from(table) is itself awaitable (exerciseMuscleMapping/muscleGroup are selected with
        // no .where() at all, mirroring next-up-query.ts's own unconditional-select precedent),
        // and also carries .where()/.orderBy() for the selects that chain them.
        from: (table: unknown) => {
          const [tableDef, tableRows] = tables.get(table) ?? [{}, []];
          const pending = Promise.resolve(tableRows);
          return Object.assign(pending, {
            where: (condition: unknown) => {
              const matched = tableRows.filter((row) => rowMatches(tableDef, row, condition));
              return Object.assign(Promise.resolve(matched), { orderBy: () => Promise.resolve(matched) });
            },
            orderBy: () => Promise.resolve(tableRows),
          });
        },
      };
    },
  } as unknown as ReturnType<typeof getPowerSync>;

  return { db, getSelectCount: () => selectCount };
}

const SESSION_ROW = {
  id: 's-1',
  startedAt: '2026-08-24T09:00:00.000Z',
  endedAt: '2026-08-24T10:00:00.000Z',
  pausedAt: null,
  accumulatedPausedSeconds: 0,
};

beforeEach(() => {
  getPowerSyncMock.mockReset();
  loadExerciseNameMapMock.mockResolvedValue(new Map([['ex-1', 'Bench Press'], ['ex-2', 'Squat']]));
  computeSessionPrTypesBySetIdMock.mockResolvedValue(new Map());
});

describe('loadSessionSummary — missing session', () => {
  it('returns null when the session id names no row', async () => {
    const { db } = fakeDb({});

    const result = await loadSessionSummary('missing', 'user-1', db);

    expect(result).toBeNull();
  });
});

describe('loadSessionSummary — breakdown inclusion (must_haves)', () => {
  it('omits an exercise with zero completed sets and includes a removed exercise that has completed sets', async () => {
    const { db } = fakeDb({
      workoutSessionRows: [SESSION_ROW],
      sessionExerciseRows: [
        { id: 'se-empty', sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, removedAt: null },
        { id: 'se-removed', sessionId: 's-1', exerciseId: 'ex-2', orderIndex: 1, removedAt: '2026-08-24T09:30:00.000Z' },
      ],
      loggedSetRows: [
        { id: 'ls-uncompleted', sessionExerciseId: 'se-empty', setIndex: 1, setType: 'normal', weightKg: '100.000', reps: 5, rir: 2, completed: false, loggedAt: '2026-08-24T09:05:00.000Z' },
        { id: 'ls-removed-completed', sessionExerciseId: 'se-removed', setIndex: 1, setType: 'normal', weightKg: '80.000', reps: 8, rir: 1, completed: true, loggedAt: '2026-08-24T09:20:00.000Z' },
      ],
    });

    const result = await loadSessionSummary('s-1', 'user-1', db);

    expect(result?.breakdown).toHaveLength(1);
    expect(result?.breakdown[0].sessionExerciseId).toBe('se-removed');
    expect(result?.breakdown[0].removedAt).toBe('2026-08-24T09:30:00.000Z');
  });
});

describe('loadSessionSummary — bestE1rmKg validity cutoff (D-31)', () => {
  it('is null when every completed set is past the E1RM validity cutoff', async () => {
    const overCutoffReps = E1RM_MAX_VALID_REPS + 5;
    const { db } = fakeDb({
      workoutSessionRows: [SESSION_ROW],
      sessionExerciseRows: [{ id: 'se-1', sessionId: 's-1', exerciseId: 'ex-1', orderIndex: 0, removedAt: null }],
      loggedSetRows: [
        { id: 'ls-1', sessionExerciseId: 'se-1', setIndex: 1, setType: 'normal', weightKg: '50.000', reps: overCutoffReps, rir: 0, completed: true, loggedAt: '2026-08-24T09:05:00.000Z' },
      ],
    });

    const result = await loadSessionSummary('s-1', 'user-1', db);

    expect(result?.breakdown[0].bestE1rmKg).toBeNull();
  });
});

describe('loadSessionSummary — constant query cost (PITFALLS §13)', () => {
  it('issues the identical number of selects for a 2-exercise session and a 12-exercise session', async () => {
    function buildFixture(exerciseCount: number): FakeRows {
      const sessionExerciseRows: Row[] = [];
      const loggedSetRows: Row[] = [];
      for (let i = 0; i < exerciseCount; i++) {
        const sessionExerciseId = `se-${i}`;
        sessionExerciseRows.push({ id: sessionExerciseId, sessionId: 's-1', exerciseId: `ex-${i}`, orderIndex: i, removedAt: null });
        loggedSetRows.push({
          id: `ls-${i}`,
          sessionExerciseId,
          setIndex: 1,
          setType: 'normal',
          weightKg: '50.000',
          reps: 5,
          rir: 1,
          completed: true,
          loggedAt: '2026-08-24T09:05:00.000Z',
        });
      }
      return { workoutSessionRows: [SESSION_ROW], sessionExerciseRows, loggedSetRows };
    }

    const small = fakeDb(buildFixture(2));
    await loadSessionSummary('s-1', 'user-1', small.db);

    const large = fakeDb(buildFixture(12));
    await loadSessionSummary('s-1', 'user-1', large.db);

    expect(small.getSelectCount()).toBe(large.getSelectCount());
  });
});

describe('loadSessionSummary — duration (D-29 pause accounting)', () => {
  it('computes duration from started_at/ended_at, accounting for accumulated pause time', async () => {
    const { db } = fakeDb({
      workoutSessionRows: [
        {
          id: 's-1',
          startedAt: '2026-08-24T09:00:00.000Z',
          endedAt: '2026-08-24T10:00:00.000Z',
          pausedAt: null,
          accumulatedPausedSeconds: 600,
        },
      ],
      sessionExerciseRows: [],
    });

    const result = await loadSessionSummary('s-1', 'user-1', db);

    // One hour elapsed minus 10 minutes of accumulated pause = 3000 seconds.
    expect(result?.durationSeconds).toBe(3000);
  });
});
