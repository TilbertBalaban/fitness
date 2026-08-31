import { DEFAULT_WIDGET_KINDS, loadOrMaterializeDashboardWidgets } from '../dashboard-widgets';
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

// A real in-memory implementation of the exact select/insert/delete/update shapes
// dashboard-widgets.ts uses — this table's query has no condition worth matching generically (it
// always reads every row of the one user under test), so this is deliberately simpler than
// exclusions.test.ts's FakeExclusionDb. transaction's handle IS the fake itself (cycles.test.ts's
// own precedent, WR-10) — the shipped helpers call tx.insert/tx.update, and handing them a separate
// object would hide those calls from this same in-memory `rows` array.
class FakeDashboardWidgetDb {
  rows: FakeRow[] = [];

  asWriteDb(): WriteDb {
    const self = this;
    const handle = {
      select: () => ({
        from: (table: unknown) => {
          if (table !== dashboardWidget) throw new Error('unexpected table in select');
          return { where: () => Promise.resolve(self.rows.map((row) => ({ ...row }))) };
        },
      }),
      insert: (table: unknown) => ({
        values: (row: FakeRow) => {
          if (table !== dashboardWidget) throw new Error('unexpected table in insert');
          self.rows.push(row);
          return Promise.resolve();
        },
      }),
      delete: (table: unknown) => ({
        where: () => {
          if (table !== dashboardWidget) throw new Error('unexpected table in delete');
          return Promise.resolve();
        },
      }),
      update: (table: unknown) => ({
        set: () => ({
          where: () => {
            if (table !== dashboardWidget) throw new Error('unexpected table in update');
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
});
