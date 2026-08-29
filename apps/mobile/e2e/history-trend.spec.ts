import { expect, test } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

interface SeededSet {
  weightKg: string | null;
  reps: number;
  setType: string;
  completed: boolean;
}

interface SeededSession {
  localDate: string;
  exerciseId: string;
  sets: SeededSet[];
}

interface HistoryTrendHarness {
  open(): Promise<void>;
  seedTrendAndOpenHistory(input: { sessions: SeededSession[] }): Promise<void>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it carries no outer closures, matching every other e2e spec in this directory.
type HarnessWindow = Record<string, HistoryTrendHarness>;

// The card's window is twelve trailing seven-day buckets ending today, so every seeded date has to
// be relative to the run's own clock. Each date below sits at least three days inside its bucket,
// so the one-day drift between this UTC slice and the browser's own local date cannot move a
// session into a neighbouring bucket and change a point count.
function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function working(weightKg: string, reps: number): SeededSet {
  return { weightKg, reps, setType: 'normal', completed: true };
}

function warmup(weightKg: string, reps: number): SeededSet {
  return { weightKg, reps, setType: 'warmup', completed: true };
}

function session(localDate: string, sets: SeededSet[], exerciseId = 'ex-trend-1'): SeededSession {
  return { localDate, exerciseId, sets };
}

async function bootHarness(page: import('@playwright/test').Page) {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].open(), DURABILITY_HARNESS_GLOBAL);
}

async function seed(page: import('@playwright/test').Page, sessions: SeededSession[]) {
  await page.evaluate(
    ({ globalKey, sessions: seededSessions }) =>
      (window as unknown as HarnessWindow)[globalKey].seedTrendAndOpenHistory({ sessions: seededSessions }),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessions },
  );
}

// Real @powersync/web database, real browser, the real History tab reached through its own
// {userId, db} override — the whole loadHistoryTrend -> historyTrendSeries -> TrendChart -> DOM
// <svg> chain runs unmocked here. Three plans' outputs meet at this one call site, and a break
// anywhere in it is invisible until the tab is opened, which is why the evidence is a browser spec.
test.describe('history trend card — twelve weekly buckets above the session list (ANLY-07)', () => {
  test('seeded history renders the card above the session list, with its headline and chart', async ({ page }) => {
    await bootHarness(page);
    await seed(page, [
      session(daysAgo(17), [working('100.000', 5)]),
      session(daysAgo(10), [working('100.000', 8)]),
      session(daysAgo(3), [working('100.000', 4), working('100.000', 3), working('100.000', 3)]),
    ]);

    await expect(page.getByRole('img', { name: /Volume over Last 84 days/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /3 points/ })).toBeVisible();

    // The Display-sized headline is the CURRENT bucket's total, not the window's total.
    await expect(page.getByText('1000.00 kg', { exact: true })).toBeVisible();
    await expect(page.getByText('25% vs previous 7 days', { exact: true })).toBeVisible();

    // Above the list, not below it: the card exists to give the individual days a shape, so it has
    // to be read before them.
    const chartBox = await page.getByRole('img', { name: /Volume over Last 84 days/ }).boundingBox();
    const firstRowBox = await page.getByRole('button', { name: 'More actions' }).first().boundingBox();
    expect(chartBox).not.toBeNull();
    expect(firstRowBox).not.toBeNull();
    expect(chartBox!.y).toBeLessThan(firstRowBox!.y);
  });

  test('switching the metric chip redraws the same buckets in the new metric', async ({ page }) => {
    await bootHarness(page);
    await seed(page, [
      session(daysAgo(17), [working('100.000', 5)]),
      session(daysAgo(10), [working('100.000', 8)]),
      session(daysAgo(3), [working('100.000', 4), working('100.000', 3), working('100.000', 3)]),
    ]);

    await expect(page.getByText('1000.00 kg', { exact: true })).toBeVisible();

    await page.getByRole('radio', { name: 'Sets' }).click();

    // A different number in a different unit from the same rows — proof the switch reaches the
    // aggregation rather than only the local selection state.
    await expect(page.getByRole('img', { name: /Sets over Last 84 days/ })).toBeVisible();
    await expect(page.getByText('3 sets', { exact: true })).toBeVisible();
    await expect(page.getByText('1000.00 kg', { exact: true })).toHaveCount(0);

    await page.getByRole('radio', { name: 'Workouts' }).click();

    await expect(page.getByRole('img', { name: /Workouts over Last 84 days/ })).toBeVisible();
    await expect(page.getByText('1 workout', { exact: true })).toBeVisible();
  });

  test('an untrained week and a warm-up-only week are both absent from the line, never plotted at zero', async ({
    page,
  }) => {
    await bootHarness(page);
    await seed(page, [
      // Deliberately nothing in the 7-13-days-ago bucket, and nothing but a warm-up in the
      // 21-27-days-ago one. Neither may become a point.
      session(daysAgo(24), [warmup('200.000', 10)]),
      session(daysAgo(17), [working('100.000', 10)]),
      session(daysAgo(3), [working('100.000', 5)]),
    ]);

    // The announced sentence names the number of points actually logged: a fabricated zero for
    // either omitted week would make this read 3 or 4 and fail here.
    await expect(page.getByRole('img', { name: /2 points/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /3 points/ })).toHaveCount(0);
    await expect(page.getByRole('img', { name: /4 points/ })).toHaveCount(0);

    // The warm-up's own volume never reaches the screen.
    await expect(page.getByText('2000.00 kg', { exact: true })).toHaveCount(0);

    // The bucket before the last one holds nothing, so the comparison cannot honestly be made —
    // and an absent chip is the only correct rendering of that, never a dash and never "0%".
    await expect(page.getByText(/vs previous 7 days/)).toHaveCount(0);
  });

  test('with no completed sessions the card is absent and the tab’s own empty state stands alone', async ({ page }) => {
    await bootHarness(page);
    await seed(page, []);

    await expect(page.getByText('No workouts yet', { exact: true })).toBeVisible();
    await expect(page.getByText('Log your first workout to see it here.', { exact: true })).toBeVisible();

    // "Card absent" and "empty state present" are two different failures, so both are asserted.
    await expect(page.getByRole('img')).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(0);
  });
});
