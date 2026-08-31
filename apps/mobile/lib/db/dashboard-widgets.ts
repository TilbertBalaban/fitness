import { and, eq } from 'drizzle-orm';
import { WIDGET_KINDS, WIDGET_KIND_SET, type WidgetKind } from '@fitness/api-contracts';
import { generateClientId } from './id';
import { appendOrderIndex, sortByOrderThenId } from './programs/order-index';
import { type WriteDb, type WriteTx } from './powersync';
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

// A plain, never-materializing read — the one read path `DashboardWidgetPicker` uses for its own
// post-write reloads (12-07). Deliberately distinct from loadOrMaterializeDashboardWidgets below:
// Home is the sole materialization point (D-26's "the materialization point is load-bearing"), so a
// SECOND caller that also materializes-on-empty races Home's own first-mount call — both see zero
// existing rows and each inserts its own full default set, producing duplicate rows. A plain SELECT
// has no such race, and a genuinely empty result here is exactly D-24's deliberate-emptiness state.
export async function loadDashboardWidgets(userId: string, db: WriteDb): Promise<DashboardWidgetRow[]> {
  const existing = await db
    .select({
      id: dashboardWidget.id,
      widgetKind: dashboardWidget.widgetKind,
      position: dashboardWidget.position,
      enabled: dashboardWidget.enabled,
    })
    .from(dashboardWidget)
    .where(eq(dashboardWidget.userId, userId));
  return sortRows(existing);
}

// Marks a (db instance, userId) pair as "materialization already attempted this session" — checked
// and set SYNCHRONOUSLY at the top of loadOrMaterializeDashboardWidgets, before its first await, so
// two overlapping calls for the same user against the same database (Home's own useFocusEffect
// firing again before a prior call resolved) can never both race the zero-row check and both insert
// a default set. Once a (db, userId) pair is materialized this session, EVERY later read against
// that same db — including one that finds the row count back at zero because removeWidget (12-07)
// hard-deleted the user's last remaining widget — goes through the plain loadDashboardWidgets
// instead: a hard-deleted-to-zero result is D-24's deliberate emptiness, not a signal to re-run the
// "brand new user" branch a second time. Keyed by the db instance (a WeakMap, not a bare userId Set)
// so independent test databases sharing a literal userId string never leak state into each other —
// dashboard-widgets.test.ts opens a fresh fake db per case and expects each to materialize on its
// own first call.
const materializedThisSession = new WeakMap<WriteDb, Set<string>>();

function markMaterialized(db: WriteDb, userId: string): boolean {
  const seen = materializedThisSession.get(db) ?? new Set<string>();
  const alreadyMaterialized = seen.has(userId);
  seen.add(userId);
  materializedThisSession.set(db, seen);
  return alreadyMaterialized;
}

// Deliberately NOT preferences.ts's read-time-default pattern (RESEARCH.md Pitfall 3) — D-26
// requires real materialized `dashboard_widget` rows on first read, so `no rows` never doubles as
// `brand-new user`. This function only materializes when the row COUNT is zero AND this (db, userId)
// pair has never been materialized this session (see materializedThisSession above) — deliberate
// emptiness (D-24) is never mistaken for first-run, whether that emptiness is a hard-deleted row set
// or (as 12-05 originally anticipated) a disabled one. Home is this function's ONLY caller (12-07's
// own DashboardWidgetPicker deliberately calls loadDashboardWidgets above instead) — see that
// function's own doc comment for why a second materializing caller would race this one.
export async function loadOrMaterializeDashboardWidgets(userId: string, db: WriteDb): Promise<DashboardWidgetRow[]> {
  if (markMaterialized(db, userId)) {
    return loadDashboardWidgets(userId, db);
  }

  const existing = await loadDashboardWidgets(userId, db);

  if (existing.length > 0) return existing;

  const positions: number[] = [];
  const inserted: DashboardWidgetRow[] = [];
  // One transaction for the whole default set (matching addExercisesToDay's own precedent) — a
  // partial apply would leave a user with just one default widget, and a concurrent reader (the
  // picker's own plain loadDashboardWidgets) that lands between two un-batched inserts would see
  // that same partial, mid-materialization state instead of either "nothing yet" or "the full set".
  await db.transaction(async (tx: WriteTx) => {
    for (const widgetKind of DEFAULT_WIDGET_KINDS) {
      const position = appendOrderIndex(positions);
      positions.push(position);
      const row = { id: generateClientId(), userId, widgetKind, position, enabled: true };
      await tx.insert(dashboardWidget).values(row);
      inserted.push({ id: row.id, widgetKind: row.widgetKind, position: row.position, enabled: row.enabled });
    }
  });
  return sortRows(inserted);
}

export interface RemoveWidgetInput {
  userId: string;
  widgetKind: string;
}

// A hard delete, mirroring exclusions.ts's removeExclusion — a no-op when no row exists for this
// (user, kind), the idempotency half of the probe's DASH-02 edge. Removing the last remaining
// widget is allowed and writes no replacement (D-24); there is no separate "disable" write path.
export async function removeWidget({ userId, widgetKind }: RemoveWidgetInput, db: WriteDb): Promise<void> {
  await db
    .delete(dashboardWidget)
    .where(and(eq(dashboardWidget.userId, userId), eq(dashboardWidget.widgetKind, widgetKind)));
}

export interface AddWidgetInput {
  userId: string;
  widgetKind: string;
}

// Read-then-insert guard, mirroring exclusions.ts's addExclusion precedent — an existing row for
// this (user, kind) is a no-op, both the idempotency half of the probe's DASH-02 edge and what keeps
// the server's own uniqueness expectations from rejecting a second local row for the same kind
// (T-12-30 backstop). A kind outside WIDGET_KINDS is rejected by writing nothing. Position is
// appendOrderIndex over the user's existing positions, imported from order-index.ts and never
// reimplemented (D-25).
export async function addWidget({ userId, widgetKind }: AddWidgetInput, db: WriteDb): Promise<void> {
  if (!WIDGET_KIND_SET.has(widgetKind)) return;

  const existing = await db
    .select({ id: dashboardWidget.id })
    .from(dashboardWidget)
    .where(and(eq(dashboardWidget.userId, userId), eq(dashboardWidget.widgetKind, widgetKind)));
  if (existing.length > 0) return;

  const positionRows = await db
    .select({ position: dashboardWidget.position })
    .from(dashboardWidget)
    .where(eq(dashboardWidget.userId, userId));

  const position = appendOrderIndex(positionRows.map((row) => row.position));
  await db.insert(dashboardWidget).values({ id: generateClientId(), userId, widgetKind, position, enabled: true });
}

// Pure, no database import (order-index.ts's own leaf-module shape) — the members of WIDGET_KINDS
// not present in enabledKinds, in catalog order. Used by DashboardWidgetPickerView to render the
// "Add a Widget" section, and rendering nothing at all when the result is empty mirrors
// FilterChipRow's own shipped "nothing to show" absence rule.
export function resolveAvailableWidgetKinds(enabledKinds: string[]): WidgetKind[] {
  const enabled = new Set(enabledKinds);
  return WIDGET_KINDS.filter((kind) => !enabled.has(kind));
}
