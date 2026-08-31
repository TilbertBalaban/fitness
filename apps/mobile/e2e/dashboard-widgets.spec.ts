import { expect, test, type Locator, type Page } from '@playwright/test';
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

// DragHandle.web.tsx captures the pointer on down and requires an actual held-button move
// sequence to accumulate translationY — mirrors reorder-exercises.spec.ts's own dragHandleTo,
// duplicated locally per this directory's own per-spec-file convention for DOM-interaction
// helpers (page.evaluate callbacks carry no outer closures, and non-evaluate helpers follow the
// same one-file-owns-its-own-helpers shape for consistency).
async function dragHandleTo(page: Page, fromHandle: Locator, targetY: number): Promise<void> {
  await fromHandle.hover();
  const box = await fromHandle.boundingBox();
  if (!box) throw new Error('drag handle has no bounding box — is it visible?');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + (targetY - startY) / 2, { steps: 4 });
  await page.mouse.move(startX, targetY, { steps: 4 });
  await page.mouse.up();
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

  test('dragging Weekly Progress above Next Up commits the new order, and Home re-renders in the dragged-to order', async ({
    page,
  }) => {
    await bootAndMount(page);

    await page.getByRole('button', { name: 'Edit Dashboard', exact: true }).click();
    // Default materialization order is next_up then weekly_progress (DEFAULT_WIDGET_KINDS), so
    // Next Up's row renders first — waiting for it proves the defaults have landed before the
    // drag geometry below is measured against settled row positions.
    await expect(page.getByRole('button', { name: 'Remove Next Up from dashboard' })).toBeVisible();

    const nextUpHandle = page.getByRole('button', { name: 'Reorder Next Up' });
    const weeklyProgressHandle = page.getByRole('button', { name: 'Reorder Weekly Progress' });

    await nextUpHandle.hover();
    const nextUpBoxBeforeDrag = await nextUpHandle.boundingBox();
    if (!nextUpBoxBeforeDrag) throw new Error('Next Up drag handle has no bounding box');

    await dragHandleTo(page, weeklyProgressHandle, nextUpBoxBeforeDrag.y + nextUpBoxBeforeDrag.height / 2);

    await expect
      .poll(async () => {
        const rows = await readDashboardWidgets(page);
        const weeklyProgress = rows.find((row) => row.widget_kind === 'weekly_progress');
        const nextUp = rows.find((row) => row.widget_kind === 'next_up');
        return weeklyProgress && nextUp ? weeklyProgress.position < nextUp.position : false;
      })
      .toBe(true);

    await page.getByRole('button', { name: 'Done', exact: true }).click();

    // onClosePicker's own reload (loadOrMaterializeDashboardWidgets -> setWidgets) is a separate
    // async operation from the modal's own synchronous dismissal — reading the two cards'
    // positions immediately after the click races that reload (reorder-exercises.spec.ts's own
    // documented closeReorderSheet pattern). Polling the comparison itself, rather than a single
    // read, waits out that gap instead of asserting against a still-stale render.
    //
    // Home renders next_up via NextUpWidget ("No active program" for a fresh, program-less user)
    // and weekly_progress via WeeklyProgressCard ("Last 7 Days") — comparing their rendered Y
    // positions proves the real Home dashboard, not just the stored rows, reflects the drag.
    await expect
      .poll(async () => {
        const weeklyProgressCardBox = await page.getByText('Last 7 Days', { exact: true }).boundingBox();
        const nextUpCardBox = await page.getByText('No active program').boundingBox();
        if (!weeklyProgressCardBox || !nextUpCardBox) return null;
        return weeklyProgressCardBox.y < nextUpCardBox.y;
      })
      .toBe(true);
  });
});
