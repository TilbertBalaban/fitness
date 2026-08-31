import { expect, test, type Page } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

interface SeedDashboardWidgetEntry {
  widgetKind: string;
  position: number;
  enabled?: boolean;
}

interface DashboardWidgetRawRow {
  id: string;
  user_id: string;
  widget_kind: string;
  position: number;
  enabled: number;
  server_seq: number | null;
}

interface DashboardWidgetsHarness {
  open(): Promise<void>;
  mountDashboard(): Promise<void>;
  seedDashboardWidgets(entries: SeedDashboardWidgetEntry[]): Promise<string[]>;
  readDashboardWidgets(): Promise<DashboardWidgetRawRow[]>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it carries no outer closures, matching every other e2e spec in this directory.
type HarnessWindow = Record<string, DashboardWidgetsHarness>;

async function bootAndMount(page: Page): Promise<void> {
  await page.goto('/__durability');
  // The testID renders on first paint regardless of readiness ('loading' vs 'ready' is only the
  // text content) — waitForSelector alone can resolve before DurabilityHarnessScreen's effect has
  // actually assigned window[DURABILITY_HARNESS_GLOBAL] (session-notes.spec.ts's own documented
  // race). Waiting for the 'ready' text specifically closes that gap.
  await expect(page.getByTestId('durability-harness-ready')).toHaveText('ready');
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].open(), DURABILITY_HARNESS_GLOBAL);
  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].mountDashboard(),
    DURABILITY_HARNESS_GLOBAL,
  );
  await expect(page.getByRole('button', { name: 'Edit Dashboard', exact: true })).toBeVisible();
}

async function readDashboardWidgets(page: Page): Promise<DashboardWidgetRawRow[]> {
  return page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].readDashboardWidgets(),
    DURABILITY_HARNESS_GLOBAL,
  );
}

// Real @powersync/web database, real browser, the real Home tab rendered by __durability.web.tsx —
// no case here calls addWidget/removeWidget/moveWidget directly; every write is reached through the
// real DashboardWidgetPicker sheet, mounted on Home's own "Edit" control (DASH-02).
test.describe('dashboard widget picker — add, remove, reorder, in a real browser (DASH-02)', () => {
  test("a fresh user's first dashboard read materializes exactly the DEFAULT_WIDGET_KINDS rows", async ({ page }) => {
    await bootAndMount(page);

    await expect(page.getByText('No active program')).toBeVisible();

    const rows = await readDashboardWidgets(page);
    expect(rows.map((row) => row.widget_kind).sort()).toEqual(['next_up', 'weekly_progress']);
    expect(rows.every((row) => row.enabled === 1)).toBe(true);
  });

  test('opening the picker from Edit lists each enabled default widget, each independently removable', async ({ page }) => {
    await bootAndMount(page);

    await page.getByRole('button', { name: 'Edit Dashboard', exact: true }).click();

    await expect(page.getByText('Edit Dashboard', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Next Up from dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Weekly Progress from dashboard' })).toBeVisible();
  });

  test('removing Next Up deletes exactly one row, the dashboard re-renders without it, and the removal survives Done', async ({
    page,
  }) => {
    await bootAndMount(page);

    await page.getByRole('button', { name: 'Edit Dashboard', exact: true }).click();
    await page.getByRole('button', { name: 'Remove Next Up from dashboard' }).click();

    await expect.poll(async () => (await readDashboardWidgets(page)).length).toBe(1);
    const remaining = await readDashboardWidgets(page);
    expect(remaining[0].widget_kind).toBe('weekly_progress');

    // Dismissal (Done) is not a discard point — the removal already committed on tap and must
    // still be in place once the sheet closes and the dashboard re-renders behind it.
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByText('No active program')).toHaveCount(0);

    const afterDone = await readDashboardWidgets(page);
    expect(afterDone).toHaveLength(1);
    expect(afterDone[0].widget_kind).toBe('weekly_progress');
  });

  test('removing every widget leaves zero rows, renders the empty state, and a fresh mount never re-materializes the defaults', async ({
    page,
  }) => {
    await bootAndMount(page);

    await page.getByRole('button', { name: 'Edit Dashboard', exact: true }).click();
    await page.getByRole('button', { name: 'Remove Next Up from dashboard' }).click();
    await page.getByRole('button', { name: 'Remove Weekly Progress from dashboard' }).click();

    await expect.poll(async () => (await readDashboardWidgets(page)).length).toBe(0);
    await expect(page.getByText('No widgets added yet.')).toBeVisible();

    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByText('No widgets on your dashboard')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Widgets' })).toBeVisible();

    // A fresh mount over the SAME open() database — deliberate emptiness (D-24) is never mistaken
    // for a brand-new user and never re-populated (D-26), the RESEARCH Pitfall 3 distinction.
    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].mountDashboard(),
      DURABILITY_HARNESS_GLOBAL,
    );
    await expect(page.getByText('No widgets on your dashboard')).toBeVisible();
    const rows = await readDashboardWidgets(page);
    expect(rows).toHaveLength(0);
  });

  test('adding Recent Records inserts exactly one row past every existing widget, and a second tap is a no-op', async ({
    page,
  }) => {
    await bootAndMount(page);

    await page.getByRole('button', { name: 'Edit Dashboard', exact: true }).click();
    // Materialization of the default widget set is async relative to the header rendering the
    // "Edit Dashboard" control — waiting for a "Remove ... from dashboard" row (this file's own
    // precedent, see the tests above) proves the defaults have landed before "before" is read,
    // so the row-count assertion below isn't racing a concurrent default-set insert.
    await expect(page.getByRole('button', { name: 'Remove Next Up from dashboard' })).toBeVisible();

    const before = await readDashboardWidgets(page);
    const maxPositionBefore = Math.max(...before.map((row) => row.position));

    await page.getByRole('button', { name: 'Add Recent Records to dashboard' }).click();

    await expect.poll(async () => (await readDashboardWidgets(page)).length).toBe(before.length + 1);
    const afterAdd = await readDashboardWidgets(page);
    const added = afterAdd.find((row) => row.widget_kind === 'recent_records');
    expect(added).toBeDefined();
    expect(added!.position).toBeGreaterThan(maxPositionBefore);
    await expect(page.getByRole('button', { name: 'Remove Recent Records from dashboard' })).toBeVisible();

    // "Add Recent Records..." only exists in the DOM while recent_records is unenabled — once
    // added it moves to "Your Widgets" and the add row for that kind is gone, so a genuine
    // idempotent-second-tap check re-derives availability rather than clicking a now-absent control.
    await expect(page.getByRole('button', { name: 'Add Recent Records to dashboard' })).toHaveCount(0);
    const afterSecondCheck = await readDashboardWidgets(page);
    expect(afterSecondCheck.filter((row) => row.widget_kind === 'recent_records')).toHaveLength(1);
  });
});
