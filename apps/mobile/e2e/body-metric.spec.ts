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

async function seedAndMount(page: import('@playwright/test').Page, kind: string, entries: SeedBodyMetricEntry[]) {
  await page.evaluate(
    ({ globalKey, entries }) => (window as unknown as HarnessWindow)[globalKey].seedBodyMetrics(entries),
    { globalKey: DURABILITY_HARNESS_GLOBAL, entries },
  );
  await page.evaluate(
    ({ globalKey, kind }) => (window as unknown as HarnessWindow)[globalKey].mountBodyMetricTrend(kind),
    { globalKey: DURABILITY_HARNESS_GLOBAL, kind },
  );
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

    // Default window is 3 months (D-14) — every seeded date here is well inside it.
    await expect(page.getByRole('img', { name: /Weight over 3 months/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /3 points/ })).toBeVisible();
    // The headline is the LATEST entry's value, not the heaviest ever logged. Scoped to the
    // Display-sized headline text specifically — the SAME value is also a row in the entries list
    // beneath the chart (D-09), so a bare getByText would be ambiguous.
    await expect(page.locator('.text-display', { hasText: '80.50 kg' })).toBeVisible();
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
    await expect(page.locator('.text-display', { hasText: '80.20 kg' })).toBeVisible();
    // The dedupe applies to the CHART's headline/series only — the entries list still lists both
    // (D-09), so this only asserts no THIRD, chart-owned 80.00 kg ever appears.
    await expect(page.locator('.text-display', { hasText: '80.00 kg' })).toHaveCount(0);

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
    await expect(page.locator('.text-display', { hasText: '84.00 kg' })).toBeVisible();
  });
});

// The window switch (D-14, UI-SPEC decision 9): default 3m, and every window is one filter over
// the SAME already-loaded series — no re-query per chip press (records-query.ts's no-N+1 posture).
test.describe('body-metric trend — window switch (BODY-03, D-14)', () => {
  test('the 3-month default hides older entries; switching to 1 Year reveals them and renames the chart', async ({ page }) => {
    await bootHarness(page);

    await page.evaluate(
      ({ globalKey, entries }) => (window as unknown as HarnessWindow)[globalKey].seedBodyMetrics(entries),
      {
        globalKey: DURABILITY_HARNESS_GLOBAL,
        entries: [
          // Older than 3 months but inside 1 year — invisible at the default window.
          { kind: 'bodyweight', value: '90.000', localDate: daysAgo(200), recordedAt: `${daysAgo(200)}T07:00:00.000Z` },
          { kind: 'bodyweight', value: '89.000', localDate: daysAgo(150), recordedAt: `${daysAgo(150)}T07:00:00.000Z` },
          // Inside both windows.
          { kind: 'bodyweight', value: '82.000', localDate: daysAgo(30), recordedAt: `${daysAgo(30)}T07:00:00.000Z` },
          { kind: 'bodyweight', value: '81.000', localDate: daysAgo(5), recordedAt: `${daysAgo(5)}T07:00:00.000Z` },
        ] satisfies SeedBodyMetricEntry[],
      },
    );

    await page.evaluate(
      ({ globalKey, kind }) => (window as unknown as HarnessWindow)[globalKey].mountBodyMetricTrend(kind),
      { globalKey: DURABILITY_HARNESS_GLOBAL, kind: 'bodyweight' },
    );

    await expect(page.getByRole('img', { name: /Weight over 3 months\. 2 points/ })).toBeVisible();

    await page.getByRole('radio', { name: '1 Year' }).click();

    await expect(page.getByRole('img', { name: /Weight over 1 year\. 4 points/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /Weight over 3 months/ })).toHaveCount(0);
  });

  test('a kind with entries only outside the default window renders the empty-window copy and keeps the switch reachable', async ({
    page,
  }) => {
    await bootHarness(page);

    await page.evaluate(
      ({ globalKey, entries }) => (window as unknown as HarnessWindow)[globalKey].seedBodyMetrics(entries),
      {
        globalKey: DURABILITY_HARNESS_GLOBAL,
        entries: [
          { kind: 'waist', value: '90.000', localDate: daysAgo(200), recordedAt: `${daysAgo(200)}T07:00:00.000Z` },
        ] satisfies SeedBodyMetricEntry[],
      },
    );

    await page.evaluate(
      ({ globalKey, kind }) => (window as unknown as HarnessWindow)[globalKey].mountBodyMetricTrend(kind),
      { globalKey: DURABILITY_HARNESS_GLOBAL, kind: 'waist' },
    );

    await expect(page.getByText('Nothing logged in the last 3 months', { exact: true })).toBeVisible();
    await expect(page.getByText('Try a longer range.', { exact: true })).toBeVisible();
    // D-09/D-13: never a chart, never a flat line, never a zero point — but the switch stays, since
    // widening the window is the only way out.
    await expect(page.getByRole('img')).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(4);

    await page.getByRole('radio', { name: '1 Year' }).click();

    await expect(page.getByRole('img', { name: /Weight over 1 year/ })).toHaveCount(0);
    // A whole-number centimetre value trims its trailing decimal (fromCanonicalCm's own display
    // rule) — the chart's accessible name and the headline both read "90 cm", never "90.0 cm".
    await expect(page.getByRole('img', { name: /Waist over 1 year\. One point: 90 cm/ })).toBeVisible();
  });
});

// The entries list (S6 anatomy #6) and its edit/delete affordance (D-10, decision 13): a genuinely
// different list from the chart's own deduped series — every entry is listed, including a same-day
// second entry the chart doesn't plot.
test.describe('body-metric trend — entries list, edit and delete (D-09, D-10)', () => {
  test('every entry is listed, including a same-day second entry the chart dedupes away', async ({ page }) => {
    await bootHarness(page);

    await seedAndMount(page, 'bodyweight', [
      { kind: 'bodyweight', value: '80.000', localDate: daysAgo(5), recordedAt: `${daysAgo(5)}T07:00:00.000Z` },
      { kind: 'bodyweight', value: '80.500', localDate: daysAgo(5), recordedAt: `${daysAgo(5)}T19:00:00.000Z` },
      { kind: 'bodyweight', value: '82.000', localDate: daysAgo(2), recordedAt: `${daysAgo(2)}T07:00:00.000Z` },
    ]);

    // Two chart points (same-day pair deduped to the later value)...
    await expect(page.getByRole('img', { name: /2 points/ })).toBeVisible();
    // ...but three rows in the entries list — the same-day pair is not collapsed here.
    await expect(page.getByRole('button', { name: /80\.00 kg, logged/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /80\.50 kg, logged/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /82\.00 kg, logged/ })).toBeVisible();
  });

  test('editing an entry through its action sheet overwrites in place, pre-filled with its OWN value, not the kind’s latest', async ({
    page,
  }) => {
    await bootHarness(page);

    await seedAndMount(page, 'bodyweight', [
      { kind: 'bodyweight', value: '80.000', localDate: daysAgo(10), recordedAt: `${daysAgo(10)}T07:00:00.000Z` },
      { kind: 'bodyweight', value: '82.000', localDate: daysAgo(2), recordedAt: `${daysAgo(2)}T07:00:00.000Z` },
    ]);

    // Edit the OLDER entry (80.00 kg) — the kind's latest is 82.00 kg, a different value. If the
    // sheet pre-filled the kind's latest instead of this entry's own value, this text would never
    // appear.
    await page.getByRole('button', { name: /80\.00 kg, logged/ }).click();
    await page.getByRole('button', { name: 'Edit' }).click();

    await expect(page.getByText('80.00', { exact: true })).toBeVisible();

    // Clear the pre-filled value and type a new one — proves saving overwrites in place, with no
    // confirmation (D-10).
    for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Backspace' }).click();
    await page.getByRole('button', { name: '7' }).click();
    await page.getByRole('button', { name: '5' }).click();
    // exact: true — "Log" is otherwise a substring of "Log Weight" (the trend link) and of every
    // entry row's own accessible name ("...80.00 kg, LOGged 21 Aug...").
    await page.getByRole('button', { name: 'Log', exact: true }).click();

    await expect(page.getByRole('button', { name: /75\.00 kg, logged/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /80\.00 kg, logged/ })).toHaveCount(0);
    // The kind's other entry is untouched.
    await expect(page.getByRole('button', { name: /82\.00 kg, logged/ })).toBeVisible();
  });

  test('deleting an entry confirms through DeleteMetricEntryDialog, then removes it from both the series and the list', async ({
    page,
  }) => {
    await bootHarness(page);

    await seedAndMount(page, 'bodyweight', [
      { kind: 'bodyweight', value: '80.000', localDate: daysAgo(10), recordedAt: `${daysAgo(10)}T07:00:00.000Z` },
      { kind: 'bodyweight', value: '82.000', localDate: daysAgo(2), recordedAt: `${daysAgo(2)}T07:00:00.000Z` },
    ]);

    await expect(page.getByRole('img', { name: /2 points/ })).toBeVisible();

    await page.getByRole('button', { name: /80\.00 kg, logged/ }).click();
    await page.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText('Delete Entry', { exact: true })).toBeVisible();
    await expect(page.getByText("This entry will be deleted. This can't be undone. Delete anyway?", { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByRole('img', { name: /One point: 82\.00 kg/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /80\.00 kg, logged/ })).toHaveCount(0);

    const rows = await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].readBodyMetrics(),
      DURABILITY_HARNESS_GLOBAL,
    );
    expect(rows).toHaveLength(1);
  });
});
