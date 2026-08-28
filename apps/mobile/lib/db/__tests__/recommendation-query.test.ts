import { recommendationHistoryForSession, RECENT_SESSION_WINDOW } from '../programs/recommendation-query';
import { getPowerSync } from '../powersync';
import { loggedSet, sessionExercise, workoutSession } from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));

// drizzle's eq()/and()/inArray() build a SQL tree of query chunks: a column carries `name`, a
// bound parameter carries a scalar `value`, and a literal fragment carries a string `value` too.
// Mirrors session-query.test.ts's own evaluator (that file's own comment explains why real
// filtering, not "return every row of this table", matters here) — this query issues two
// different selects against the SAME sessionExercise table with two different where clauses (the
// current session's own exercises, then every session_exercise sharing an exercise_id), so a
// table-keyed-only fake cannot distinguish them.
type TableLike = Record<string, { name?: string } | undefined>;

function isSqlNode(node: unknown): node is { queryChunks: unknown[] } {
  return !!node && typeof node === 'object' && Array.isArray((node as { queryChunks?: unknown[] }).queryChunks);
}

function isColumnChunk(node: unknown): node is { name: string } {
  return !!node && typeof node === 'object' && typeof (node as { name?: unknown }).name === 'string' && 'table' in (node as object);
}

function stringChunkText(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const value = (node as { value?: unknown }).value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value.join('');
  return null;
}

function isParamChunk(node: unknown): node is { value: unknown } {
  if (!node || typeof node !== 'object') return false;
  if (!('value' in (node as object))) return false;
  return !Array.isArray((node as { value: unknown }).value);
}

function propertyKeyForColumn(table: TableLike, columnName: string): string | undefined {
  return Object.entries(table).find(([, column]) => column?.name === columnName)?.[0];
}

function buildPredicate(table: TableLike, node: unknown): (row: Record<string, unknown>) => boolean {
  if (!isSqlNode(node)) return () => true;
  const chunks = node.queryChunks;

  const subNodes = chunks.filter(isSqlNode);
  const joinsOr = chunks.some((chunk) => stringChunkText(chunk)?.trim() === 'or');
  if (subNodes.length > 1) {
    const predicates = subNodes.map((sub) => buildPredicate(table, sub));
    return (row) => (joinsOr ? predicates.some((p) => p(row)) : predicates.every((p) => p(row)));
  }
  if (subNodes.length === 1) return buildPredicate(table, subNodes[0]);

  let column: string | null = null;
  let operator: string | null = null;
  let values: unknown[] = [];
  for (const chunk of chunks) {
    if (isColumnChunk(chunk)) {
      column = chunk.name;
      continue;
    }
    if (Array.isArray(chunk)) {
      values = chunk.map((entry) => (isParamChunk(entry) ? entry.value : undefined));
      continue;
    }
    const text = stringChunkText(chunk);
    if (text !== null) {
      const trimmed = text.trim();
      if (trimmed === '=' || trimmed === '<>' || trimmed === 'in' || trimmed === 'not in') operator = trimmed;
      continue;
    }
    if (isParamChunk(chunk) && operator && operator !== 'in') {
      values = [chunk.value];
    }
  }

  if (!column || !operator) return () => true;
  const key = propertyKeyForColumn(table, column);
  if (!key) return () => true;

  return (row) => {
    const rowValue = row[key];
    if (operator === '=') return rowValue === values[0];
    if (operator === '<>') return rowValue !== values[0];
    if (operator === 'in') return values.includes(rowValue);
    if (operator === 'not in') return !values.includes(rowValue);
    return true;
  };
}

interface FakeRows {
  sessionExerciseRows?: Record<string, unknown>[];
  workoutSessionRows?: Record<string, unknown>[];
  loggedSetRows?: Record<string, unknown>[];
}

function fakeRecommendationDb({ sessionExerciseRows = [], workoutSessionRows = [], loggedSetRows = [] }: FakeRows) {
  const tables = new Map<unknown, [TableLike, Record<string, unknown>[]]>([
    [sessionExercise, [sessionExercise as unknown as TableLike, sessionExerciseRows]],
    [workoutSession, [workoutSession as unknown as TableLike, workoutSessionRows]],
    [loggedSet, [loggedSet as unknown as TableLike, loggedSetRows]],
  ]);

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => {
          const [tableDef, tableRows] = tables.get(table) ?? [{}, []];
          const predicate = buildPredicate(tableDef, condition);
          return Promise.resolve(tableRows.filter(predicate));
        },
      }),
    }),
  } as unknown as ReturnType<typeof getPowerSync>;

  return db;
}

const CURRENT_SESSION = 's-current';
const CURRENT_SE = { id: 'se-current', sessionId: CURRENT_SESSION, exerciseId: 'ex-bench' };
const PRIOR_SE_1 = { id: 'se-prior-1', sessionId: 's-prior-1', exerciseId: 'ex-bench' };
const PRIOR_SE_2 = { id: 'se-prior-2', sessionId: 's-prior-2', exerciseId: 'ex-bench' };
const PRIOR_SESSION_1 = { id: 's-prior-1', startedAt: '2026-08-01T10:00:00.000Z' };
const PRIOR_SESSION_2 = { id: 's-prior-2', startedAt: '2026-08-10T10:00:00.000Z' };

function loggedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ls-1',
    sessionExerciseId: 'se-prior-1',
    setType: 'normal',
    weightKg: '100.000',
    reps: 8,
    rir: 2,
    side: null,
    completed: true,
    parentSetId: null,
    ...overrides,
  };
}

describe('recommendationHistoryForSession', () => {
  it('returns, for each session_exercise, the prior sessions for the same exercise_id, most-recent-first, excluding the current session', async () => {
    const db = fakeRecommendationDb({
      sessionExerciseRows: [CURRENT_SE, PRIOR_SE_1, PRIOR_SE_2],
      workoutSessionRows: [PRIOR_SESSION_1, PRIOR_SESSION_2],
      loggedSetRows: [
        loggedRow({ id: 'ls-1', sessionExerciseId: 'se-prior-1' }),
        loggedRow({ id: 'ls-2', sessionExerciseId: 'se-prior-2', weightKg: '105.000' }),
      ],
    });

    const result = await recommendationHistoryForSession(CURRENT_SESSION, db);

    expect(result['se-current'].map((entry) => entry.sessionId)).toEqual(['s-prior-2', 's-prior-1']);
    expect(result['se-current'].every((entry) => entry.sessionId !== CURRENT_SESSION)).toBe(true);
  });

  it('yields an entry with an empty session list, not a missing key, when an exercise has no prior history', async () => {
    const db = fakeRecommendationDb({ sessionExerciseRows: [CURRENT_SE] });

    const result = await recommendationHistoryForSession(CURRENT_SESSION, db);

    expect(result['se-current']).toEqual([]);
  });

  it('never includes the current session own rows', async () => {
    const db = fakeRecommendationDb({
      sessionExerciseRows: [CURRENT_SE, PRIOR_SE_1],
      workoutSessionRows: [PRIOR_SESSION_1],
      loggedSetRows: [
        loggedRow({ id: 'ls-current', sessionExerciseId: 'se-current' }),
        loggedRow({ id: 'ls-prior', sessionExerciseId: 'se-prior-1' }),
      ],
    });

    const result = await recommendationHistoryForSession(CURRENT_SESSION, db);

    // A row scoped to se-current is never a prior candidate — the returned bucket has exactly one
    // session and that session's one set is the prior row, never the current session's own.
    expect(result['se-current']).toHaveLength(1);
    expect(result['se-current'][0].sets.map((set) => set.id)).toEqual(['ls-prior']);
  });

  it('caps the returned sessions at RECENT_SESSION_WINDOW', async () => {
    const priorSe = Array.from({ length: RECENT_SESSION_WINDOW + 5 }, (_, i) => ({
      id: `se-prior-${i}`,
      sessionId: `s-prior-${i}`,
      exerciseId: 'ex-bench',
    }));
    const priorSessions = priorSe.map((row, i) => ({
      id: row.sessionId,
      startedAt: `2026-08-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
    }));
    const db = fakeRecommendationDb({
      sessionExerciseRows: [CURRENT_SE, ...priorSe],
      workoutSessionRows: priorSessions,
    });

    const result = await recommendationHistoryForSession(CURRENT_SESSION, db);

    expect(result['se-current']).toHaveLength(RECENT_SESSION_WINDOW);
  });

  it('returns an empty result keyed by nothing when the session has no exercises', async () => {
    const db = fakeRecommendationDb({});

    const result = await recommendationHistoryForSession(CURRENT_SESSION, db);

    expect(result).toEqual({});
  });
});
