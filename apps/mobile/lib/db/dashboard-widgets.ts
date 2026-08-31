import { eq } from 'drizzle-orm';
import { generateClientId } from './id';
import { appendOrderIndex, sortByOrderThenId } from './programs/order-index';
import { type WriteDb } from './powersync';
import { dashboardWidget } from './schema';

// Reproduces today's Home screen exactly (D-26, CONTEXT.md "Specific Ideas") — an existing user's
// first launch after this phase looks unchanged until they choose otherwise.
export const DEFAULT_WIDGET_KINDS = ['next_up', 'weekly_progress'] as const;

export interface DashboardWidgetRow {
  id: string;
  widgetKind: string;
  position: number;
  enabled: boolean;
}

function sortRows(rows: DashboardWidgetRow[]): DashboardWidgetRow[] {
  const ordered = sortByOrderThenId(rows.map((row) => ({ ...row, orderIndex: row.position })));
  return ordered.map((row) => ({ id: row.id, widgetKind: row.widgetKind, position: row.position, enabled: row.enabled }));
}

// Deliberately NOT preferences.ts's read-time-default pattern (RESEARCH.md Pitfall 3) — D-26
// requires real materialized `dashboard_widget` rows on first read, so `no rows` never doubles as
// `brand-new user`. This function only materializes when the row COUNT is zero: a user whose every
// row is disabled has rows, so a second call inserts nothing and returns those disabled rows —
// deliberate emptiness (D-24) is never mistaken for first-run.
export async function loadOrMaterializeDashboardWidgets(userId: string, db: WriteDb): Promise<DashboardWidgetRow[]> {
  const existing = await db
    .select({
      id: dashboardWidget.id,
      widgetKind: dashboardWidget.widgetKind,
      position: dashboardWidget.position,
      enabled: dashboardWidget.enabled,
    })
    .from(dashboardWidget)
    .where(eq(dashboardWidget.userId, userId));

  if (existing.length > 0) return sortRows(existing);

  const positions: number[] = [];
  const inserted: DashboardWidgetRow[] = [];
  for (const widgetKind of DEFAULT_WIDGET_KINDS) {
    const position = appendOrderIndex(positions);
    positions.push(position);
    const row = { id: generateClientId(), userId, widgetKind, position, enabled: true };
    await db.insert(dashboardWidget).values(row);
    inserted.push({ id: row.id, widgetKind: row.widgetKind, position: row.position, enabled: row.enabled });
  }
  return sortRows(inserted);
}
