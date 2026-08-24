import { Column, Param, SQL, StringChunk } from 'drizzle-orm';
import { historyRowLabel, loadHistoryPage } from '../history-query';
import { getPowerSync } from '../powersync';
import { sessionExercise, workoutSession } from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;

// A small, generic interpreter for the WHERE conditions loadHistoryPage builds against
// workout_session (eq/lt combined through and/or) — real enough that "a discarded session is
// absent" and "the cursor is the (started_at, id) pair" are asserted against the actual SQL this
// query constructs, not against a hand-simulated stand-in. drizzle's and()/or() wrap their joined
// content in one extra SQL layer inside the outer parens, so flatChunks descends through both a
// leading/trailing paren pair and a lone nested SQL child until it reaches a flat chunk sequence.
function flatChunks(node: SQL): unknown[] {
  let chunks: unknown[] = [...node.queryChunks];
  for (;;) {
    const first = chunks[0];
    const last = chunks[chunks.length - 1];
    if (chunks.length >= 2 && first instanceof StringChunk && first.value.join('') === '(' && last instanceof StringChunk && last.value.join('') === ')') {
      chunks = chunks.slice(1, -1);
      continue;
    }
    if (chunks.length === 1 && chunks[0] instanceof SQL) {
      chunks = [...(chunks[0] as SQL).queryChunks];
      continue;
    }
    break;
  }
  return chunks;
}

const WORKOUT_SESSION_COLUMN_TO_ROW_KEY: Record<string, string> = {
  id: 'id',
  status: 'status',
  started_at: 'startedAt',
};

function evaluateCondition(node: SQL, row: Record<string, unknown>): boolean {
  const chunks = flatChunks(node);

  const combinatorIndex = chunks.findIndex(
    (chunk) => chunk instanceof StringChunk && (chunk.value.join('') === ' and ' || chunk.value.join('') === ' or '),
  );
  if (combinatorIndex !== -1) {
    const left = evaluateCondition(chunks[combinatorIndex - 1] as SQL, row);
    const right = evaluateCondition(chunks[combinatorIndex + 1] as SQL, row);
    const operator = (chunks[combinatorIndex] as StringChunk).value.join('');
    return operator === ' and ' ? left && right : left || right;
  }

  const column = chunks.find((chunk) => chunk instanceof Column) as Column | undefined;
  const param = chunks.find((chunk) => chunk instanceof Param) as Param | undefined;
  const operatorChunk = chunks.find(
    (chunk) => chunk instanceof StringChunk && [' = ', ' < ', ' != ', ' > '].includes(chunk.value.join('')),
  ) as StringChunk | undefined;
  if (!column || !param || !operatorChunk) {
    throw new Error(
      `evaluateCondition: unrecognised WHERE shape (${chunks.map((c) => (c as object).constructor.name).join(', ')})`,
    );
  }

  const rowKey = WORKOUT_SESSION_COLUMN_TO_ROW_KEY[column.name];
  const rowValue = row[rowKey] as string;
  const paramValue = param.value as string;
  const operator = operatorChunk.value.join('');
  if (operator === ' = ') return rowValue === paramValue;
  if (operator === ' != ') return rowValue !== paramValue;
  if (operator === ' < ') return rowValue < paramValue;
  if (operator === ' > ') return rowValue > paramValue;
  throw new Error(`evaluateCondition: unsupported operator "${operator}"`);
}

interface SessionFixtureRow {
  id: string;
  name: string | null;
  localDate: string;
  startedAt: string;
  endedAt: string | null;
  accumulatedPausedSeconds: number;
  status: string;
}

interface SessionExerciseFixtureRow {
  id: string;
  sessionId: string;
}

interface LoggedSetFixtureRow {
  sessionExerciseId: string;
  completed: boolean;
  setType: string;
}

interface HistoryFixture {
  sessions: SessionFixtureRow[];
  sessionExercises?: SessionExerciseFixtureRow[];
  loggedSets?: LoggedSetFixtureRow[];
}

// Table-routed, like next-up-query.test.ts's fake — but the workout_session branch actually
// evaluates the WHERE condition (via evaluateCondition above) rather than ignoring it, because
// this plan's acceptance criteria require proving the discarded/in-progress exclusion and the
// keyset cursor semantics, not just that a `.where()` call happened. The session_exercise branch
// reimplements the join+group+count independently in JS (never filtering on removed_at, matching
// the SUT) so a bug in one is unlikely to be masked by an identical bug in the other.
function fakeHistoryDb(fixture: HistoryFixture) {
  let selectCount = 0;
  const sessionExercises = fixture.sessionExercises ?? [];
  const loggedSets = fixture.loggedSets ?? [];

  const db = {
    select: () => {
      selectCount += 1;
      return {
        from: (table: unknown) => {
          if (table === workoutSession) {
            return {
              where: (condition: SQL) => ({
                orderBy: () => ({
                  limit: (n: number) => {
                    const matched = fixture.sessions.filter((row) => evaluateCondition(condition, row as unknown as Record<string, unknown>));
                    const sorted = matched
                      .slice()
                      .sort((a, b) => (a.startedAt !== b.startedAt ? (a.startedAt < b.startedAt ? 1 : -1) : a.id < b.id ? 1 : -1));
                    return Promise.resolve(
                      sorted.slice(0, n).map(({ status: _status, ...rest }) => rest),
                    );
                  },
                }),
              }),
            };
          }
          if (table === sessionExercise) {
            return {
              leftJoin: () => ({
                where: () => ({
                  groupBy: () => {
                    const groups = new Map<string, { exerciseIds: Set<string>; completedSetCount: number }>();
                    for (const row of sessionExercises) {
                      const group = groups.get(row.sessionId) ?? { exerciseIds: new Set<string>(), completedSetCount: 0 };
                      group.exerciseIds.add(row.id);
                      groups.set(row.sessionId, group);
                    }
                    for (const set of loggedSets) {
                      const owner = sessionExercises.find((row) => row.id === set.sessionExerciseId);
                      if (!owner || !set.completed || set.setType === 'warmup') continue;
                      const group = groups.get(owner.sessionId);
                      if (group) group.completedSetCount += 1;
                    }
                    return Promise.resolve(
                      Array.from(groups.entries()).map(([sessionId, group]) => ({
                        sessionId,
                        exerciseCount: group.exerciseIds.size,
                        completedSetCount: group.completedSetCount,
                      })),
                    );
                  },
                }),
              }),
            };
          }
          throw new Error(`fakeHistoryDb: unexpected table ${String(table)}`);
        },
      };
    },
  } as unknown as ReturnType<typeof getPowerSync>;

  return { db, getSelectCount: () => selectCount };
}

const USER_ID = 'user-1';

function session(overrides: Partial<SessionFixtureRow> & { id: string }): SessionFixtureRow {
  return {
    name: null,
    localDate: '2026-01-01',
    startedAt: '2026-01-01T10:00:00.000Z',
    endedAt: '2026-01-01T11:00:00.000Z',
    accumulatedPausedSeconds: 0,
    status: 'completed',
    ...overrides,
  };
}

describe('loadHistoryPage — query cost (PITFALLS §13)', () => {
  it('issues exactly two queries for a page of 1 session and for a page of 25', async () => {
    const one = fakeHistoryDb({ sessions: [session({ id: 's1' })] });
    const many = fakeHistoryDb({
      sessions: Array.from({ length: 25 }, (_, i) => session({ id: `s${i}`, startedAt: `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00.000Z` })),
    });

    await loadHistoryPage({ userId: USER_ID, limit: 1 }, one.db);
    await loadHistoryPage({ userId: USER_ID, limit: 25 }, many.db);

    expect(one.getSelectCount()).toBe(2);
    expect(many.getSelectCount()).toBe(2);
  });

  it('reads nothing at all when there is no signed-in user', async () => {
    const { db, getSelectCount } = fakeHistoryDb({ sessions: [session({ id: 's1' })] });

    const page = await loadHistoryPage({ userId: null, limit: 25 }, db);

    expect(page).toEqual({ rows: [], nextCursor: null });
    expect(getSelectCount()).toBe(0);
  });
});

describe('loadHistoryPage — what is shown versus hidden', () => {
  it('excludes a discarded session and an in-progress session, and shows a zero-set completed session honestly', async () => {
    const { db } = fakeHistoryDb({
      sessions: [
        session({ id: 'completed-1', status: 'completed' }),
        session({ id: 'discarded-1', status: 'discarded' }),
        session({ id: 'in-progress-1', status: 'in_progress', endedAt: null }),
        session({ id: 'paused-1', status: 'paused', endedAt: null }),
        session({ id: 'completed-zero', status: 'completed' }),
      ],
      sessionExercises: [{ id: 'se-1', sessionId: 'completed-zero' }],
      loggedSets: [],
    });

    const page = await loadHistoryPage({ userId: USER_ID, limit: 25 }, db);

    const ids = page.rows.map((row) => row.id);
    expect(ids).toContain('completed-1');
    expect(ids).toContain('completed-zero');
    expect(ids).not.toContain('discarded-1');
    expect(ids).not.toContain('in-progress-1');
    expect(ids).not.toContain('paused-1');

    const zeroRow = page.rows.find((row) => row.id === 'completed-zero');
    expect(zeroRow).toMatchObject({ exerciseCount: 1, completedSetCount: 0 });
  });

  it('counts a removed exercise’s completed sets — removal never destroyed them', async () => {
    const { db } = fakeHistoryDb({
      sessions: [session({ id: 's1' })],
      sessionExercises: [
        { id: 'se-live', sessionId: 's1' },
        { id: 'se-removed', sessionId: 's1' },
      ],
      loggedSets: [
        { sessionExerciseId: 'se-live', completed: true, setType: 'normal' },
        { sessionExerciseId: 'se-removed', completed: true, setType: 'normal' },
        { sessionExerciseId: 'se-removed', completed: false, setType: 'normal' },
      ],
    });

    const page = await loadHistoryPage({ userId: USER_ID, limit: 25 }, db);

    expect(page.rows[0]).toMatchObject({ exerciseCount: 2, completedSetCount: 2 });
  });

  it('excludes warm-up sets from the completed count', async () => {
    const { db } = fakeHistoryDb({
      sessions: [session({ id: 's1' })],
      sessionExercises: [{ id: 'se-1', sessionId: 's1' }],
      loggedSets: [
        { sessionExerciseId: 'se-1', completed: true, setType: 'warmup' },
        { sessionExerciseId: 'se-1', completed: true, setType: 'normal' },
      ],
    });

    const page = await loadHistoryPage({ userId: USER_ID, limit: 25 }, db);

    expect(page.rows[0]).toMatchObject({ completedSetCount: 1 });
  });
});

describe('loadHistoryPage — the (started_at, id) keyset cursor', () => {
  it('does not duplicate or skip a row when an older session is inserted between two page fetches', async () => {
    const sessions: SessionFixtureRow[] = [
      session({ id: 's1', startedAt: '2026-01-05T10:00:00.000Z' }),
      session({ id: 's2', startedAt: '2026-01-04T10:00:00.000Z' }),
      session({ id: 's3', startedAt: '2026-01-01T10:00:00.000Z' }),
    ];
    const { db, getSelectCount } = fakeHistoryDb({ sessions });

    const page1 = await loadHistoryPage({ userId: USER_ID, limit: 2 }, db);
    expect(page1.rows.map((row) => row.id)).toEqual(['s1', 's2']);
    expect(page1.nextCursor).toEqual({ startedAt: '2026-01-04T10:00:00.000Z', id: 's2' });

    // Simulates a session logged between the two fetches, landing strictly before the cursor.
    sessions.push(session({ id: 's-mid', startedAt: '2026-01-03T10:00:00.000Z' }));

    const page2 = await loadHistoryPage({ userId: USER_ID, limit: 2, cursor: page1.nextCursor }, db);

    expect(page2.rows.map((row) => row.id)).toEqual(['s-mid', 's3']);
    expect(getSelectCount()).toBe(4);

    const allIds = [...page1.rows, ...page2.rows].map((row) => row.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('returns a null nextCursor once the page is shorter than the limit', async () => {
    const { db } = fakeHistoryDb({ sessions: [session({ id: 's1' })] });

    const page = await loadHistoryPage({ userId: USER_ID, limit: 25 }, db);

    expect(page.nextCursor).toBeNull();
  });
});

describe('historyRowLabel', () => {
  it('returns the session name when present', () => {
    expect(historyRowLabel({ name: 'Leg Day', localDate: '2026-01-05' })).toBe('Leg Day');
  });

  it('falls back to the formatted local_date when the name is null or blank', () => {
    expect(historyRowLabel({ name: null, localDate: '2026-01-05' })).toBe('Monday, Jan 5');
    expect(historyRowLabel({ name: '   ', localDate: '2026-01-05' })).toBe('Monday, Jan 5');
  });

  it('renders the same label regardless of the reading device’s ambient timezone (D-06)', () => {
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Kiritimati'; // UTC+14
      const east = historyRowLabel({ name: null, localDate: '2026-01-05' });
      process.env.TZ = 'Etc/GMT+12'; // UTC-12
      const west = historyRowLabel({ name: null, localDate: '2026-01-05' });
      expect(east).toBe(west);
    } finally {
      process.env.TZ = originalTz;
    }
  });
});

describe('loadHistoryPage — the database-injection seam', () => {
  it('falls back to getPowerSync() when no database argument is passed', async () => {
    const { db } = fakeHistoryDb({ sessions: [] });
    getPowerSyncMock.mockReturnValue(db);

    await loadHistoryPage({ userId: USER_ID, limit: 25 });

    expect(getPowerSyncMock).toHaveBeenCalled();
  });
});
