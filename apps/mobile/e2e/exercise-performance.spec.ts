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
  sets: SeededSet[];
}

interface ExercisePerformanceHarness {
  open(): Promise<void>;
  seedExerciseHistoryAndOpenPerformance(input: {
    exerciseId: string;
    sessions: SeededSession[];
    metric?: string;
  }): Promise<void>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it carries no outer closures, matching every other e2e spec in this directory.
type HarnessWindow = Record<string, ExercisePerformanceHarness>;

// The route bounds its read to PER_SESSION_RANGE_DAYS (90) before today, so every seeded date has
// to be relative to the run's own clock — a hardcoded 2026 date would silently fall out of range.
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

async function bootHarness(page: import('@playwright/test').Page) {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].open(), DURABILITY_HARNESS_GLOBAL);
}

// Real @powersync/web database, real browser, the real /exercise-performance route reached through
// its own {exerciseId, metric, userId, db} override — the whole loadExerciseHistory ->
// exerciseSeries -> buildChartGeometry -> <Path> -> DOM <svg> chain runs unmocked here.
//
// This file also settles 09-RESEARCH §1's one unverified assumption: that react-native-svg under
// react-native-web maps accessibilityRole="image" + accessibilityLabel onto a Playwright-queryable
// role="img" with an accessible name. Every later chart spec in this phase inherits the answer.
test.describe('exercise performance — per-session chart (ANLY-06, ANLY-10)', () => {
  test('seeded history renders the chart, its accessible name and the display-sized latest value', async ({ page }) => {
    await bootHarness(page);

    await page.evaluate(
      ({ globalKey, sessions }) =>
        (window as unknown as HarnessWindow)[globalKey].seedExerciseHistoryAndOpenPerformance({
          exerciseId: 'ex-performance-1',
          sessions,
          metric: 'heaviest',
        }),
      {
        globalKey: DURABILITY_HARNESS_GLOBAL,
        sessions: [
          { localDate: daysAgo(30), sets: [warmup('60.000', 10), working('100.000', 5)] },
          { localDate: daysAgo(20), sets: [working('105.000', 5)] },
          { localDate: daysAgo(10), sets: [working('102.500', 3)] },
        ],
      },
    );

    // THE assumption under test. If this passes, role="img" + accessible name is the phase's
    // selector strategy; if it fails, the fallback is the sibling text nodes below, which R16
    // guarantees exist regardless.
    await expect(page.getByRole('img', { name: /Heaviest weight over Last 3 months/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /3 points/ })).toBeVisible();

    // The Display-sized headline: the most recent point's value, which is the 102.5kg session and
    // NOT the heaviest ever lifted — the chart answers "what am I lifting on this right now."
    await expect(page.getByText('102.50 kg', { exact: true })).toBeVisible();
    // R16: the axis dates are ordinary text siblings of the canvas, not in-SVG text.
    await expect(page.getByText('100.00 kg – 105.00 kg', { exact: true })).toBeVisible();
  });

  test('switching to the estimate redraws and names how many sessions the rep cap dropped', async ({ page }) => {
    await bootHarness(page);

    await page.evaluate(
      ({ globalKey, sessions }) =>
        (window as unknown as HarnessWindow)[globalKey].seedExerciseHistoryAndOpenPerformance({
          exerciseId: 'ex-performance-2',
          sessions,
          metric: 'heaviest',
        }),
      {
        globalKey: DURABILITY_HARNESS_GLOBAL,
        sessions: [
          { localDate: daysAgo(40), sets: [working('100.000', 5)] },
          { localDate: daysAgo(30), sets: [working('80.000', 15)] },
          { localDate: daysAgo(20), sets: [working('80.000', 12)] },
          { localDate: daysAgo(10), sets: [working('105.000', 3)] },
        ],
      },
    );

    await expect(page.getByRole('img', { name: /Heaviest weight over Last 3 months/ })).toBeVisible();

    await page.getByRole('radio', { name: 'Est. 1RM' }).click();

    await expect(page.getByRole('img', { name: /Estimated 1RM over Last 3 months/ })).toBeVisible();
    // The two 12-and-15-rep sessions are omitted rather than plotted at zero, and the omission is
    // explained in place with the real count (ANLY-10).
    await expect(
      page.getByText("2 sessions above 10 reps aren't plotted — estimated 1RM isn't meaningful there.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('img', { name: /2 points/ })).toBeVisible();
  });

  test('a warm-up-only session contributes no point, proving the predicate split reaches the screen', async ({ page }) => {
    await bootHarness(page);

    await page.evaluate(
      ({ globalKey, sessions }) =>
        (window as unknown as HarnessWindow)[globalKey].seedExerciseHistoryAndOpenPerformance({
          exerciseId: 'ex-performance-3',
          sessions,
          metric: 'heaviest',
        }),
      {
        globalKey: DURABILITY_HARNESS_GLOBAL,
        sessions: [
          // Heavier than the working session below: if warm-ups counted, this would both add a
          // second point AND become the headline figure. Neither may happen.
          { localDate: daysAgo(30), sets: [warmup('200.000', 10)] },
          { localDate: daysAgo(10), sets: [working('90.000', 5)] },
        ],
      },
    );

    await expect(page.getByRole('img', { name: /One point: 90.00 kg/ })).toBeVisible();
    await expect(page.getByText('200.00 kg', { exact: true })).toHaveCount(0);
  });

  test('an exercise with no logged history renders the empty state and no chart at all', async ({ page }) => {
    await bootHarness(page);

    await page.evaluate(
      ({ globalKey }) =>
        (window as unknown as HarnessWindow)[globalKey].seedExerciseHistoryAndOpenPerformance({
          exerciseId: 'ex-performance-4',
          sessions: [],
          metric: 'heaviest',
        }),
      { globalKey: DURABILITY_HARNESS_GLOBAL },
    );

    await expect(page.getByText('No history for this exercise', { exact: true })).toBeVisible();
    await expect(page.getByText('Log a set of this exercise and your chart starts here.', { exact: true })).toBeVisible();
    // D-09: never a chart, never a flat line, never a zero point. Both switches are hidden too —
    // there is nothing to switch between.
    await expect(page.getByRole('img')).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(0);
  });
});
