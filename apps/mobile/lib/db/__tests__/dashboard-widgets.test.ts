import { Column, is, Param, SQL } from 'drizzle-orm';
import {
  addWidget,
  DEFAULT_WIDGET_KINDS,
  loadDashboardWidgets,
  loadOrMaterializeDashboardWidgets,
  moveWidget,
  removeWidget,
  resolveAvailableWidgetKinds,
} from '../dashboard-widgets';
import { dashboardWidget } from '../schema';
import type { WriteDb } from '../powersync';

jest.mock('../id', () => {
  let counter = 0;
  return { generateClientId: jest.fn(() => `gen-${++counter}`) };
});

interface FakeRow {
  id: string;
  userId: string;
  widgetKind: string;
  position: number;
  enabled: boolean;
}

// Column name (snake_case, as drizzle stores it) -> row property — exclusions.test.ts's own
// generic-condition-matching pattern, adapted for dashboard_widget's columns.
const COLUMN_TO_FIELD: Partial<Record<string, keyof FakeRow>> = {
  id: 'id',
  user_id: 'userId',
  widget_kind: 'widgetKind',
  position: 'position',
  enabled: 'enabled',
};

function collectEqPairs(node: unknown, pairs: Array<[string, unknown]>): void {
  if (!is(node, SQL)) return;
  const chunks = node.queryChunks;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (is(chunk, Column)) {
      const maybeParam = chunks[i + 2];
      if (is(maybeParam, Param)) pairs.push([chunk.name, maybeParam.value]);
    } else if (is(chunk, SQL)) {
      collectEqPairs(chunk, pairs);
    }
  }
}

function matchesCondition(row: FakeRow, condition: unknown): boolean {
  const pairs: Array<[string, unknown]> = [];
  collectEqPairs(condition, pairs);
  if (pairs.length === 0) return false;
  return pairs.every(([columnName, value]) => {
    const field = COLUMN_TO_FIELD[columnName];
    return field !== undefined && row[field] === value;
  });
}

// A real in-memory implementation of the exact select/insert/delete/update/transaction shapes
// dashboard-widgets.ts uses, with genuine condition matching (exclusions.test.ts's own precedent) —
// so a test asserts real cross-call state and real write counts, not merely that a method was
// called. transaction's handle IS the fake itself (cycles.test.ts's own precedent, WR-10) — the
// shipped helpers call tx.insert/tx.update, and handing them a separate object would hide those
// calls from this same in-memory `rows` array.
class FakeDashboardWidgetDb {
  rows: FakeRow[] = [];
  updateCount = 0;
  insertCount = 0;

  asWriteDb(): WriteDb {
    const self = this;
    const handle = {
      select: (_columns?: unknown) => ({
        from: (table: unknown) => {
          if (table !== dashboardWidget) throw new Error('unexpected table in select');
          return {
            where: (condition: unknown) =>
              Promise.resolve(self.rows.filter((row) => matchesCondition(row, condition)).map((row) => ({ ...row }))),
          };
        },
      }),
      insert: (table: unknown) => ({
        values: (row: FakeRow) => {
          if (table !== dashboardWidget) throw new Error('unexpected table in insert');
          self.insertCount += 1;
          self.rows.push({ ...row });
          return Promise.resolve();
        },
      }),
      delete: (table: unknown) => ({
        where: (condition: unknown) => {
          if (table !== dashboardWidget) throw new Error('unexpected table in delete');
          self.rows = self.rows.filter((row) => !matchesCondition(row, condition));
          return Promise.resolve();
        },
      }),
      update: (table: unknown) => ({
        set: (patch: Partial<FakeRow>) => ({
          where: (condition: unknown) => {
            if (table !== dashboardWidget) throw new Error('unexpected table in update');
            let matched = 0;
            self.rows = self.rows.map((row) => {
              if (!matchesCondition(row, condition)) return row;
              matched += 1;
              return { ...row, ...patch };
            });
            self.updateCount += matched;
            return Promise.resolve();
          },
        }),
      }),
      transaction: async (run: (tx: unknown) => Promise<unknown>) => run(handle),
    };
    return handle as unknown as WriteDb;
  }
}

describe('loadOrMaterializeDashboardWidgets', () => {
  it('inserts the default widget set exactly once across two calls for the same fresh user (D-26)', async () => {
    const fake = new FakeDashboardWidgetDb();
    const db = fake.asWriteDb();

    const first = await loadOrMaterializeDashboardWidgets('u1', db);
    expect(first.map((row) => row.widgetKind)).toEqual([...DEFAULT_WIDGET_KINDS]);
    expect(fake.rows).toHaveLength(DEFAULT_WIDGET_KINDS.length);

    const second = await loadOrMaterializeDashboardWidgets('u1', db);
    expect(second).toEqual(first);
    expect(fake.rows).toHaveLength(DEFAULT_WIDGET_KINDS.length);
  });

  it('reproduces DEFAULT_WIDGET_KINDS — next_up then weekly_progress — matching today’s Home exactly', async () => {
    const fake = new FakeDashboardWidgetDb();
    const rows = await loadOrMaterializeDashboardWidgets('u1', fake.asWriteDb());
    expect(rows.map((row) => row.widgetKind)).toEqual(['next_up', 'weekly_progress']);
    expect(rows.every((row) => row.enabled)).toBe(true);
  });

  it('a user whose every row is disabled gets those rows back, and nothing is inserted — deliberate emptiness is not first-run (D-24/D-26, RESEARCH Pitfall 3)', async () => {
    const fake = new FakeDashboardWidgetDb();
    fake.rows.push({ id: 'w1', userId: 'u1', widgetKind: 'next_up', position: 1024, enabled: false });
    fake.rows.push({ id: 'w2', userId: 'u1', widgetKind: 'weekly_progress', position: 2048, enabled: false });

    const rows = await loadOrMaterializeDashboardWidgets('u1', fake.asWriteDb());

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.enabled === false)).toBe(true);
    expect(fake.rows).toHaveLength(2);
  });

  it('sorts existing rows by position, ties broken by id (sortByOrderThenId)', async () => {
    const fake = new FakeDashboardWidgetDb();
    fake.rows.push({ id: 'b', userId: 'u1', widgetKind: 'weekly_progress', position: 1024, enabled: true });
    fake.rows.push({ id: 'a', userId: 'u1', widgetKind: 'next_up', position: 1024, enabled: true });

    const rows = await loadOrMaterializeDashboardWidgets('u1', fake.asWriteDb());

    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('does not re-materialize a hard-deleted-to-zero dashboard on a later read for the same (db, userId)', async () => {
    const fake = new FakeDashboardWidgetDb();
    const db = fake.asWriteDb();

    await loadOrMaterializeDashboardWidgets('u1', db);
    expect(fake.rows).toHaveLength(DEFAULT_WIDGET_KINDS.length);

    for (const widgetKind of DEFAULT_WIDGET_KINDS) {
      await removeWidget({ userId: 'u1', widgetKind }, db);
    }
    expect(fake.rows).toHaveLength(0);

    const rows = await loadOrMaterializeDashboardWidgets('u1', db);
    expect(rows).toHaveLength(0);
    expect(fake.rows).toHaveLength(0);
  });
});

describe('removeWidget', () => {
  it('deletes the user’s row for that kind', async () => {
    const fake = new FakeDashboardWidgetDb();
    fake.rows.push({ id: 'w1', userId: 'u1', widgetKind: 'next_up', position: 1024, enabled: true });
    fake.rows.push({ id: 'w2', userId: 'u1', widgetKind: 'weekly_progress', position: 2048, enabled: true });

    await removeWidget({ userId: 'u1', widgetKind: 'next_up' }, fake.asWriteDb());

    expect(fake.rows.map((row) => row.widgetKind)).toEqual(['weekly_progress']);
  });

  it('is a no-op, resolving without throwing, when no row exists for that kind', async () => {
    const fake = new FakeDashboardWidgetDb();
    fake.rows.push({ id: 'w1', userId: 'u1', widgetKind: 'next_up', position: 1024, enabled: true });

    await expect(removeWidget({ userId: 'u1', widgetKind: 'muscle_heatmap' }, fake.asWriteDb())).resolves.toBeUndefined();

    expect(fake.rows).toHaveLength(1);
  });
});

describe('addWidget', () => {
  it('inserts one row for a kind with no existing row, positioned past every existing widget', async () => {
    const fake = new FakeDashboardWidgetDb();
    fake.rows.push({ id: 'w1', userId: 'u1', widgetKind: 'next_up', position: 1024, enabled: true });

    await addWidget({ userId: 'u1', widgetKind: 'recent_records' }, fake.asWriteDb());

    expect(fake.rows.map((row) => row.widgetKind)).toEqual(['next_up', 'recent_records']);
    expect(fake.rows[1].position).toBeGreaterThan(fake.rows[0].position);
  });

  it('for a kind that already has a row, inserts nothing — a second call leaves the row count unchanged', async () => {
    const fake = new FakeDashboardWidgetDb();
    const db = fake.asWriteDb();
    fake.rows.push({ id: 'w1', userId: 'u1', widgetKind: 'next_up', position: 1024, enabled: true });

    await addWidget({ userId: 'u1', widgetKind: 'next_up' }, db);
    await addWidget({ userId: 'u1', widgetKind: 'next_up' }, db);

    expect(fake.rows).toHaveLength(1);
  });

  it('inserts nothing for a kind outside WIDGET_KINDS', async () => {
    const fake = new FakeDashboardWidgetDb();

    await addWidget({ userId: 'u1', widgetKind: 'not_a_real_widget' }, fake.asWriteDb());

    expect(fake.rows).toHaveLength(0);
  });
});

describe('resolveAvailableWidgetKinds', () => {
  it('returns the members of WIDGET_KINDS not present in enabledKinds, in catalog order', () => {
    expect(resolveAvailableWidgetKinds(['next_up', 'muscle_heatmap'])).toEqual([
      'weekly_progress',
      'recent_records',
      'bodyweight_trend',
      'history_trend',
    ]);
  });

  it('returns every kind when nothing is enabled', () => {
    expect(resolveAvailableWidgetKinds([])).toEqual([
      'next_up',
      'weekly_progress',
      'recent_records',
      'muscle_heatmap',
      'bodyweight_trend',
      'history_trend',
    ]);
  });

  it('returns an empty array when every kind is already enabled', () => {
    expect(
      resolveAvailableWidgetKinds([
        'next_up',
        'weekly_progress',
        'recent_records',
        'muscle_heatmap',
        'bodyweight_trend',
        'history_trend',
      ]),
    ).toEqual([]);
  });
});

describe('moveWidget', () => {
  it('writes exactly one row — the moved widget´s new midpoint position — when neighbours are more than one apart', async () => {
    const fake = new FakeDashboardWidgetDb();
    fake.rows.push({ id: 'w1', userId: 'u1', widgetKind: 'next_up', position: 1024, enabled: true });
    fake.rows.push({ id: 'w2', userId: 'u1', widgetKind: 'weekly_progress', position: 2048, enabled: true });
    fake.rows.push({ id: 'w3', userId: 'u1', widgetKind: 'recent_records', position: 5000, enabled: true });

    await moveWidget({ userId: 'u1', widgetId: 'w3', beforeId: 'w1', afterId: 'w2' }, fake.asWriteDb());

    expect(fake.updateCount).toBe(1);
    expect(fake.rows.find((row) => row.id === 'w3')?.position).toBe(1536);
    expect(fake.rows.find((row) => row.id === 'w1')?.position).toBe(1024);
    expect(fake.rows.find((row) => row.id === 'w2')?.position).toBe(2048);
  });

  it('triggers a renumber and writes only the rows whose position actually changed when neighbours are adjacent integers', async () => {
    const fake = new FakeDashboardWidgetDb();
    fake.rows.push({ id: 'a', userId: 'u1', widgetKind: 'next_up', position: 1024, enabled: true });
    fake.rows.push({ id: 'b', userId: 'u1', widgetKind: 'weekly_progress', position: 2048, enabled: true });
    fake.rows.push({ id: 'c', userId: 'u1', widgetKind: 'recent_records', position: 2049, enabled: true });
    fake.rows.push({ id: 'x', userId: 'u1', widgetKind: 'muscle_heatmap', position: 4096, enabled: true });

    await moveWidget({ userId: 'u1', widgetId: 'x', beforeId: 'b', afterId: 'c' }, fake.asWriteDb());

    // Renumbered order is [a, b, x, c] -> a:1024 (unchanged), b:2048 (unchanged), x:3072, c:4096 —
    // only x and c actually moved, mirroring days.test.ts's own moveExercise fixture (WR-10).
    expect(fake.updateCount).toBe(2);
    expect(fake.rows.find((row) => row.id === 'a')?.position).toBe(1024);
    expect(fake.rows.find((row) => row.id === 'b')?.position).toBe(2048);
    expect(fake.rows.find((row) => row.id === 'x')?.position).toBe(3072);
    expect(fake.rows.find((row) => row.id === 'c')?.position).toBe(4096);
  });

  it('moving to the head of the list produces a position strictly greater than zero', async () => {
    const fake = new FakeDashboardWidgetDb();
    fake.rows.push({ id: 'a', userId: 'u1', widgetKind: 'next_up', position: 1024, enabled: true });
    fake.rows.push({ id: 'b', userId: 'u1', widgetKind: 'weekly_progress', position: 2048, enabled: true });

    await moveWidget({ userId: 'u1', widgetId: 'b', beforeId: null, afterId: 'a' }, fake.asWriteDb());

    const moved = fake.rows.find((row) => row.id === 'b');
    expect(moved?.position).toBeGreaterThan(0);
  });

  it('reads back through sortByOrderThenId in the order the user dragged to', async () => {
    const fake = new FakeDashboardWidgetDb();
    fake.rows.push({ id: 'w1', userId: 'u1', widgetKind: 'next_up', position: 1024, enabled: true });
    fake.rows.push({ id: 'w2', userId: 'u1', widgetKind: 'weekly_progress', position: 2048, enabled: true });
    fake.rows.push({ id: 'w3', userId: 'u1', widgetKind: 'recent_records', position: 3072, enabled: true });
    const db = fake.asWriteDb();

    await moveWidget({ userId: 'u1', widgetId: 'w3', beforeId: null, afterId: 'w1' }, db);

    const rows = await loadDashboardWidgets('u1', db);
    expect(rows.map((row) => row.widgetKind)).toEqual(['recent_records', 'next_up', 'weekly_progress']);
  });

  it('two rows sharing a position (an LWW artifact) still render in a stable, total order broken by id', async () => {
    const fake = new FakeDashboardWidgetDb();
    fake.rows.push({ id: 'b', userId: 'u1', widgetKind: 'weekly_progress', position: 1024, enabled: true });
    fake.rows.push({ id: 'a', userId: 'u1', widgetKind: 'next_up', position: 1024, enabled: true });

    const rows = await loadDashboardWidgets('u1', fake.asWriteDb());

    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('writes nothing for a widget id the user does not own (T-12-29)', async () => {
    const fake = new FakeDashboardWidgetDb();
    fake.rows.push({ id: 'w1', userId: 'u1', widgetKind: 'next_up', position: 1024, enabled: true });
    fake.rows.push({ id: 'w2', userId: 'u2', widgetKind: 'weekly_progress', position: 2048, enabled: true });

    await moveWidget({ userId: 'u1', widgetId: 'w2', beforeId: null, afterId: 'w1' }, fake.asWriteDb());

    expect(fake.updateCount).toBe(0);
    expect(fake.rows.find((row) => row.id === 'w2')?.position).toBe(2048);
  });
});
