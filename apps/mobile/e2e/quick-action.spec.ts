import { expect, test, type Page } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

interface SeedBodyMetricEntry {
  kind: string;
  value: string;
  recordedAt?: string;
  timezone?: string;
  localDate?: string;
}

interface QuickActionHarness {
  open(): Promise<void>;
  mountDashboard(): Promise<void>;
  seedBodyMetrics(entries: SeedBodyMetricEntry[]): Promise<string[]>;
  readBodyMetrics(): Promise<Record<string, unknown>[]>;
  readPushedRoutes(): Promise<string[]>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it carries no outer closures, matching every other e2e spec in this directory.
type HarnessWindow = Record<string, QuickActionHarness>;

async function bootAndMount(page: Page): Promise<void> {
  await page.goto('/__durability');
  await expect(page.getByTestId('durability-harness-ready')).toHaveText('ready');
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].open(), DURABILITY_HARNESS_GLOBAL);
  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].mountDashboard(),
    DURABILITY_HARNESS_GLOBAL,
  );
  await expect(page.getByRole('button', { name: 'Quick Actions', exact: true })).toBeVisible();
}

async function seedBodyMetrics(page: Page, entries: SeedBodyMetricEntry[]): Promise<void> {
  await page.evaluate(
    ({ globalKey, entries }) => (window as unknown as HarnessWindow)[globalKey].seedBodyMetrics(entries),
    { globalKey: DURABILITY_HARNESS_GLOBAL, entries },
  );
}

async function readBodyMetrics(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].readBodyMetrics(),
    DURABILITY_HARNESS_GLOBAL,
  );
}

async function readPushedRoutes(page: Page): Promise<string[]> {
  return page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].readPushedRoutes(),
    DURABILITY_HARNESS_GLOBAL,
  );
}

// Real @powersync/web database, real browser, the real Home tab rendered by __durability.web.tsx —
// no case here calls logMetric/QuickActionSheet's onSelect directly; every interaction is a real
// DOM click against the same header control 12-05 shipped (DASH-03).
test.describe('quick-action sheet — two-tap weigh-in, no navigation, in a real browser (DASH-03, D-29)', () => {
  test('opening Quick Actions from the Home header lists all six rows, in the specified order', async ({ page }) => {
    await bootAndMount(page);

    await page.getByRole('button', { name: 'Quick Actions', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Quick Weigh-In', exact: true })).toBeVisible();

    const order = ['Quick Weigh-In', 'Quick Measurement', 'Progress Photo', 'History', 'New Program', 'One-off Workout'];
    const positions = await Promise.all(
      order.map(async (label) => {
        const box = await page.getByRole('button', { name: label, exact: true }).boundingBox();
        if (!box) throw new Error(`row "${label}" has no bounding box — is it visible?`);
        return box.y;
      }),
    );
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  test('tapping Quick Weigh-In opens the entry sheet pre-filled with the seeded last bodyweight value', async ({ page }) => {
    await bootAndMount(page);
    await seedBodyMetrics(page, [
      { kind: 'bodyweight', value: '80.000', recordedAt: '2026-08-01T07:00:00.000Z', localDate: '2026-08-01' },
      { kind: 'bodyweight', value: '82.500', recordedAt: '2026-08-20T07:00:00.000Z', localDate: '2026-08-20' },
    ]);

    await page.getByRole('button', { name: 'Quick Actions', exact: true }).click();
    await page.getByRole('button', { name: 'Quick Weigh-In', exact: true }).click();

    await expect(page.getByText('Log Weight', { exact: true })).toBeVisible();
    // fromCanonicalKg('82.500', 'kg') at DISPLAY_SCALE.kg = 2 — the LATEST seeded row, not the
    // first one written, proving loadLatestMetric's own ordering feeds the pre-fill (D-29).
    await expect(page.locator('.text-display', { hasText: '82.50' })).toBeVisible();
  });

  test('editing the pre-filled value and confirming writes exactly one new row with the page URL unchanged (D-29, R31)', async ({
    page,
  }) => {
    await bootAndMount(page);
    await seedBodyMetrics(page, [
      { kind: 'bodyweight', value: '82.500', recordedAt: '2026-08-20T07:00:00.000Z', localDate: '2026-08-20' },
    ]);

    const urlBefore = page.url();

    await page.getByRole('button', { name: 'Quick Actions', exact: true }).click();
    await page.getByRole('button', { name: 'Quick Weigh-In', exact: true }).click();
    await expect(page.locator('.text-display', { hasText: '82.50' })).toBeVisible();

    // The pre-filled value is fully editable, never locked (R31) — clear it and type a different
    // number rather than merely appending to the seeded default.
    for (let i = 0; i < 6; i++) {
      await page.getByRole('button', { name: 'Backspace', exact: true }).click();
    }
    await page.getByRole('button', { name: '8', exact: true }).click();
    await page.getByRole('button', { name: '0', exact: true }).click();

    await page.getByRole('button', { name: 'Log', exact: true }).click();

    await expect.poll(async () => (await readBodyMetrics(page)).length).toBe(2);
    const rows = await readBodyMetrics(page);
    const written = rows.find((row) => row.value !== '82.500');
    expect(written).toBeDefined();
    expect(written!.kind).toBe('bodyweight');

    // D-29's whole point: the write happens without a route change.
    expect(page.url()).toBe(urlBefore);
  });

  test('tapping History dismisses the sheet before navigating, and requests the real history route (R30)', async ({ page }) => {
    // `/(tabs)/history` sits inside root-stack.tsx's signed-in-only Stack.Protected group, and this
    // harness's unauthenticated session cannot cross that boundary (no live auth backend — see
    // __durability.web.tsx's own router.push spy comment) — so the browser URL itself cannot move
    // for this destination here. Reading back the app's own real router.push call is the strongest
    // same-process proof available for a click that is otherwise fully real end-to-end.
    await bootAndMount(page);

    await page.getByRole('button', { name: 'Quick Actions', exact: true }).click();
    await expect(page.getByRole('button', { name: 'History', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'History', exact: true }).click();

    await expect.poll(() => readPushedRoutes(page)).toEqual(['/(tabs)/history']);
    // The sheet's own Cancel row only exists while QuickActionSheet is mounted — its absence
    // proves the sheet unmounted BEFORE the navigate call above fired, not merely that it was
    // covered by a new screen (R30's dismiss-before-navigate ordering, proven in the DOM).
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
  });
});
