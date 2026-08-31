import { expect, test } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

interface SeedBodyMetricEntry {
  kind: string;
  value: string;
  recordedAt?: string;
  timezone?: string;
  localDate?: string;
}

interface BodyMetricHarness {
  open(): Promise<void>;
  seedBodyMetrics(entries: SeedBodyMetricEntry[]): Promise<string[]>;
  readBodyMetrics(): Promise<Record<string, unknown>[]>;
  logMetricThroughSheet(input: { kind: string; value: string }): Promise<string>;
  mountBodyMetricTrend(kind: string): Promise<void>;
  navigateAwayAndBack(): Promise<void>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it carries no outer closures, matching every other e2e spec in this directory.
type HarnessWindow = Record<string, BodyMetricHarness>;

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function bootHarness(page: import('@playwright/test').Page) {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].open(), DURABILITY_HARNESS_GLOBAL);
}

// Real @powersync/web database, real browser, the real /body-metric-trend route reached through
// its own {kind, userId, db} override — the whole loadBodyMetricTrend -> TrendChart -> DOM <svg>
// chain runs unmocked here (BODY-03, D-11/D-12).
test.describe('body-metric trend — one kind, one window, in a real browser (BODY-03)', () => {
  test('seeded bodyweight entries render a chart with the expected accessible name and headline', async ({ page }) => {
    await bootHarness(page);

    await page.evaluate(
      ({ globalKey, entries }) => (window as unknown as HarnessWindow)[globalKey].seedBodyMetrics(entries),
      {
        globalKey: DURABILITY_HARNESS_GLOBAL,
        entries: [
          { kind: 'bodyweight', value: '82.500', localDate: daysAgo(20), recordedAt: `${daysAgo(20)}T07:00:00.000Z` },
          { kind: 'bodyweight', value: '81.000', localDate: daysAgo(10), recordedAt: `${daysAgo(10)}T07:00:00.000Z` },
          { kind: 'bodyweight', value: '80.500', localDate: daysAgo(1), recordedAt: `${daysAgo(1)}T07:00:00.000Z` },
        ] satisfies SeedBodyMetricEntry[],
      },
    );

    await page.evaluate(
      ({ globalKey, kind }) => (window as unknown as HarnessWindow)[globalKey].mountBodyMetricTrend(kind),
      { globalKey: DURABILITY_HARNESS_GLOBAL, kind: 'bodyweight' },
    );

    await expect(page.getByRole('img', { name: /Weight over all time/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /3 points/ })).toBeVisible();
    // The headline is the LATEST entry's value, not the heaviest ever logged.
    await expect(page.getByText('80.50 kg', { exact: true })).toBeVisible();
  });

  test('two entries on the same local_date dedupe to one point carrying the later recorded_at value', async ({ page }) => {
    await bootHarness(page);

    const today = daysAgo(0);
    await page.evaluate(
      ({ globalKey, entries }) => (window as unknown as HarnessWindow)[globalKey].seedBodyMetrics(entries),
      {
        globalKey: DURABILITY_HARNESS_GLOBAL,
        entries: [
          { kind: 'bodyweight', value: '80.000', localDate: today, recordedAt: `${today}T07:00:00.000Z` },
          { kind: 'bodyweight', value: '80.200', localDate: today, recordedAt: `${today}T19:00:00.000Z` },
        ] satisfies SeedBodyMetricEntry[],
      },
    );

    await page.evaluate(
      ({ globalKey, kind }) => (window as unknown as HarnessWindow)[globalKey].mountBodyMetricTrend(kind),
      { globalKey: DURABILITY_HARNESS_GLOBAL, kind: 'bodyweight' },
    );

    await expect(page.getByRole('img', { name: /One point: 80\.20 kg/ })).toBeVisible();
    await expect(page.getByText('80.20 kg', { exact: true })).toBeVisible();
    await expect(page.getByText('80.00 kg', { exact: true })).toHaveCount(0);

    // Both entries are still real, separate rows in local SQLite — the chart's dedup does not
    // touch the underlying table (D-09).
    const rows = await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].readBodyMetrics(),
      DURABILITY_HARNESS_GLOBAL,
    );
    expect(rows).toHaveLength(2);
  });

  test('a value logged through logMetric while the screen is mounted appears in the series after a refresh', async ({ page }) => {
    await bootHarness(page);

    await page.evaluate(
      ({ globalKey, entries }) => (window as unknown as HarnessWindow)[globalKey].seedBodyMetrics(entries),
      {
        globalKey: DURABILITY_HARNESS_GLOBAL,
        entries: [
          { kind: 'bodyweight', value: '85.000', localDate: daysAgo(5), recordedAt: `${daysAgo(5)}T07:00:00.000Z` },
        ] satisfies SeedBodyMetricEntry[],
      },
    );

    await page.evaluate(
      ({ globalKey, kind }) => (window as unknown as HarnessWindow)[globalKey].mountBodyMetricTrend(kind),
      { globalKey: DURABILITY_HARNESS_GLOBAL, kind: 'bodyweight' },
    );

    await expect(page.getByRole('img', { name: /One point: 85\.00 kg/ })).toBeVisible();

    await page.evaluate(
      ({ globalKey, kind }) => (window as unknown as HarnessWindow)[globalKey].logMetricThroughSheet({ kind, value: '84.000' }),
      { globalKey: DURABILITY_HARNESS_GLOBAL, kind: 'bodyweight' },
    );

    // A real focus-loss-and-regain (Expo Router push/pop), not a remount — proves the screen's own
    // read re-runs on refocus, the same mechanism exercise-performance.tsx relies on.
    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].navigateAwayAndBack(),
      DURABILITY_HARNESS_GLOBAL,
    );

    await expect(page.getByRole('img', { name: /2 points/ })).toBeVisible();
    await expect(page.getByText('84.00 kg', { exact: true })).toBeVisible();
  });
});
