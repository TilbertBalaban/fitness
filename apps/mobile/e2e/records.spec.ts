import { expect, test } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

interface SeededRecord {
  prType: string;
  value: number;
  achievedAt: string;
  set: { weightKg: string | null; reps: number };
}

interface RecordsHarness {
  open(): Promise<void>;
  seedRecordsAndOpenRecords(input: { exerciseId: string; records: SeededRecord[] }): Promise<void>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it carries no outer closures, matching every other e2e spec in this directory.
type HarnessWindow = Record<string, RecordsHarness>;

const EXERCISE_ID = 'ex-records-harness-1';

// The route applies no date window to personal_record, so fixed past dates are deterministic here
// (unlike the performance spec, whose read is bounded by PER_SESSION_RANGE_DAYS).
const HEAVIEST_OLDER: SeededRecord = {
  prType: 'heaviest_weight',
  value: 102.5,
  achievedAt: '2026-03-05T09:00:00.000Z',
  set: { weightKg: '102.500', reps: 3 },
};

const HEAVIEST_NEWER: SeededRecord = {
  prType: 'heaviest_weight',
  value: 110,
  achievedAt: '2026-04-20T09:00:00.000Z',
  set: { weightKg: '110.000', reps: 2 },
};

// value is a REP COUNT, not a weight — the weight the row must show lives only on the originating
// logged_set, which is exactly the third batched read loadRecordsPage exists to make.
const MOST_REPS: SeededRecord = {
  prType: 'most_reps_at_weight',
  value: 12,
  achievedAt: '2026-04-01T09:00:00.000Z',
  set: { weightKg: '100.000', reps: 12 },
};

async function bootWithRecords(page: import('@playwright/test').Page, records: SeededRecord[]) {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].open(), DURABILITY_HARNESS_GLOBAL);
  await page.evaluate(
    ({ globalKey, exerciseId, seeded }) =>
      (window as unknown as HarnessWindow)[globalKey].seedRecordsAndOpenRecords({ exerciseId, records: seeded }),
    { globalKey: DURABILITY_HARNESS_GLOBAL, exerciseId: EXERCISE_ID, seeded: records },
  );
}

// Real @powersync/web database, real browser, the real /records route reached through its own
// {userId, db} override — the whole logPersonalRecord -> loadRecordsPage -> formatRecordValue ->
// RecordRow chain runs unmocked here. Selectors are role plus accessible name, per 09-01's settled
// finding; no testID is added to any surface.
test.describe('records — browse and switch between the four PR metrics (ANLY-03, ANLY-01)', () => {
  test('seeded records render most recent first, formatted in the selected metric’s own units', async ({ page }) => {
    await bootWithRecords(page, [HEAVIEST_OLDER, HEAVIEST_NEWER, MOST_REPS]);

    await expect(page.getByRole('radio', { name: 'Heaviest Weight' })).toBeVisible();

    // The announced name carries exercise, metric and value — a lifter reading the list by ear
    // must be able to tell which metric a row belongs to.
    const rows = page.getByRole('button', { name: /Heaviest Weight/ });
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAccessibleName(/110\.00 kg/);
    await expect(rows.nth(1)).toHaveAccessibleName(/102\.50 kg/);

    // The most-reps record exists in the table but belongs to another metric — selecting
    // heaviest_weight must not spill it into this list.
    await expect(page.getByText('12 reps @ 100.00 kg', { exact: false })).toHaveCount(0);
  });

  test('a most-reps record renders a whole rep count joined with its set’s weight, never a three-decimal number', async ({ page }) => {
    await bootWithRecords(page, [HEAVIEST_OLDER, HEAVIEST_NEWER, MOST_REPS]);

    await page.getByRole('radio', { name: 'Most Reps' }).click();

    await expect(page.getByRole('button', { name: /Most Reps 12 reps @ 100\.00 kg/ })).toBeVisible();
    // personal_record.value is stored as "12.000" (numeric(10,3)); reading it as kilograms would
    // produce a plausible, silently wrong number here.
    await expect(page.getByText('12.000', { exact: false })).toHaveCount(0);
    await expect(page.getByText('12.00 kg', { exact: false })).toHaveCount(0);
  });

  test('switching to a metric with no records shows that metric’s empty copy with the switch still visible', async ({ page }) => {
    await bootWithRecords(page, [HEAVIEST_NEWER, MOST_REPS]);

    await page.getByRole('radio', { name: 'Best Set Volume' }).click();

    await expect(page.getByText('No Best Set Volume records yet', { exact: true })).toBeVisible();
    await expect(page.getByText('Log a set on any exercise and your first record lands here.', { exact: true })).toBeVisible();

    // The screen's single most important detail: all four chips stay reachable, so a lifter whose
    // selected metric has no records is never stranded with no way back to one that does.
    await expect(page.getByRole('radio', { name: 'Heaviest Weight' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Best Set Volume' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Heaviest Weight/ })).toHaveCount(0);
  });

  test('the estimate metric’s empty state names the rep cap rather than the generic copy', async ({ page }) => {
    await bootWithRecords(page, [HEAVIEST_NEWER]);

    await page.getByRole('radio', { name: 'Est. 1RM' }).click();

    await expect(page.getByText('No Est. 1RM records yet', { exact: true })).toBeVisible();
    await expect(page.getByText('Estimated 1RM is only shown for sets of 10 reps or fewer.', { exact: true })).toBeVisible();
  });

  test('switching back restores the rows the previous metric had', async ({ page }) => {
    await bootWithRecords(page, [HEAVIEST_OLDER, HEAVIEST_NEWER, MOST_REPS]);

    await page.getByRole('radio', { name: 'Best Set Volume' }).click();
    await expect(page.getByText('No Best Set Volume records yet', { exact: true })).toBeVisible();

    await page.getByRole('radio', { name: 'Heaviest Weight' }).click();

    await expect(page.getByRole('button', { name: /Heaviest Weight/ })).toHaveCount(2);
    await expect(page.getByText('No Best Set Volume records yet', { exact: true })).toHaveCount(0);
  });
});
