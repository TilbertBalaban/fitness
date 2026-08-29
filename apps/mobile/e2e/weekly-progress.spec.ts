import { expect, test } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

interface SeededSet {
  setType: string;
  completed: boolean;
  parentSetIndex?: number;
  weightKg: string | null;
  reps: number;
}

interface SeededExercise {
  exerciseId: string;
  primaryMuscleGroupIds: string[];
  secondaryMuscleGroupIds?: string[];
  sets: SeededSet[];
}

interface SeededInput {
  sessions: { localDate: string; exercises: SeededExercise[] }[];
  program?: { days: { slots: { exerciseId: string; targetSets: number | null }[] }[] };
}

interface WeeklyProgressHarness {
  open(): Promise<void>;
  seedTrainedWeekAndOpenHome(input: SeededInput): Promise<void>;
  seedTrainedWeek(input: SeededInput): Promise<void>;
  navigateAwayAndBack(): Promise<void>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it carries no outer closures, matching every other e2e spec in this directory.
type HarnessWindow = Record<string, WeeklyProgressHarness>;

const BENCH = 'ex-weekly-1';
const ROW = 'ex-weekly-2';
const SQUAT = 'ex-weekly-3';

const CHEST = 'mg-weekly-chest';
const TRICEPS = 'mg-weekly-triceps';
const BACK = 'mg-weekly-back';
const QUADS = 'mg-weekly-quads';

// The card measures a rolling window ending TODAY, so every seeded date has to be relative to the
// browser's own day rather than a fixture constant — a hardcoded date would fall out of the window
// the day after it was written and the spec would start failing for no reason at all.
function localDateDaysAgo(days: number): string {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

// One completed working set, one warm-up, and two drop-set children hanging off the working set.
// Four logged_set rows; ONE set on the exercise strip, so ONE set on this card too (R18).
const BENCH_EXERCISE: SeededExercise = {
  exerciseId: BENCH,
  primaryMuscleGroupIds: [CHEST],
  secondaryMuscleGroupIds: [TRICEPS],
  sets: [
    { setType: 'normal', completed: true, weightKg: '100.000', reps: 5 },
    { setType: 'warmup', completed: true, weightKg: '60.000', reps: 10 },
    { setType: 'normal', completed: true, weightKg: '80.000', reps: 8, parentSetIndex: 0 },
    { setType: 'normal', completed: true, weightKg: '60.000', reps: 8, parentSetIndex: 0 },
  ],
};

const ROW_EXERCISE: SeededExercise = {
  exerciseId: ROW,
  primaryMuscleGroupIds: [BACK],
  sets: [
    { setType: 'normal', completed: true, weightKg: '80.000', reps: 8 },
    { setType: 'normal', completed: true, weightKg: '80.000', reps: 8 },
  ],
};

// 4 + 3 sets on the first day, 5 on the second: twelve sets, two distinct exercises, two distinct
// primary muscle groups across one full pass of the cycle.
const PROGRAM = {
  days: [
    { slots: [{ exerciseId: BENCH, targetSets: 4 }, { exerciseId: ROW, targetSets: 3 }] },
    { slots: [{ exerciseId: BENCH, targetSets: 5 }] },
  ],
};

const TRAINED_SESSION = { localDate: localDateDaysAgo(1), exercises: [BENCH_EXERCISE, ROW_EXERCISE] };

async function bootWithHome(page: import('@playwright/test').Page, input: SeededInput) {
  await page.goto('/__durability');
  // The sentinel exists before the harness effect has installed the global, so waiting for the
  // element alone races it — the text is the only signal that the methods are actually there.
  await expect(page.getByTestId('durability-harness-ready')).toHaveText('ready');
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].open(), DURABILITY_HARNESS_GLOBAL);
  await page.evaluate(
    ({ globalKey, seeded }) => (window as unknown as HarnessWindow)[globalKey].seedTrainedWeekAndOpenHome(seeded),
    { globalKey: DURABILITY_HARNESS_GLOBAL, seeded: input },
  );
}

// Real @powersync/web database, real browser, the real Home tab reached through its own
// {userId, db} override — the whole logged_set -> loadWeeklyProgress -> weeklyProgress ->
// WeeklyProgressCard chain runs unmocked here. Selectors are role plus accessible name, per 09-01's
// settled finding; no testID is added to any surface.
test.describe('weekly progress — the Last 7 Days card on the Home tab (ANLY-08)', () => {
  test('a trained window renders three tracks whose numerals read achieved over the program target', async ({ page }) => {
    await bootWithHome(page, { sessions: [TRAINED_SESSION], program: PROGRAM });

    await expect(page.getByText('Last 7 Days')).toBeVisible();
    await expect(page.getByText('Rolling window ending today.')).toBeVisible();

    // Three qualifying sets: one on bench (the warm-up and both drop-set children count for
    // nothing) and two on the row. Six logged_set rows produced them.
    await expect(page.getByRole('progressbar', { name: 'Sets: 3 of 12' })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Exercises: 2 of 2' })).toBeVisible();
    // Triceps is a SECONDARY mapping on bench; counting it would read 3 here.
    await expect(page.getByRole('progressbar', { name: 'Muscles trained: 2 of 2' })).toBeVisible();

    await expect(page.getByText('3 / 12', { exact: false })).toBeVisible();
    // The raw row count. A predicate leak in the reader would silently render this instead.
    await expect(page.getByText('6 / 12', { exact: false })).toHaveCount(0);
  });

  test('no copy on the card implies a calendar week', async ({ page }) => {
    await bootWithHome(page, { sessions: [TRAINED_SESSION], program: PROGRAM });

    await expect(page.getByRole('progressbar', { name: 'Sets: 3 of 12' })).toBeVisible();
    await expect(page.getByText(/this week|monday|week starts/i)).toHaveCount(0);
  });

  test('a session dated just outside the window contributes nothing to any track', async ({ page }) => {
    await bootWithHome(page, {
      sessions: [
        TRAINED_SESSION,
        {
          // One day past the inclusive first day of the seven-day window.
          localDate: localDateDaysAgo(7),
          exercises: [
            {
              exerciseId: SQUAT,
              primaryMuscleGroupIds: [QUADS],
              sets: [
                { setType: 'normal', completed: true, weightKg: '140.000', reps: 5 },
                { setType: 'normal', completed: true, weightKg: '140.000', reps: 5 },
                { setType: 'normal', completed: true, weightKg: '140.000', reps: 5 },
              ],
            },
          ],
        },
      ],
      program: PROGRAM,
    });

    // Unchanged by the older session on every track: not 6 sets, not 3 exercises, not 3 muscles.
    await expect(page.getByRole('progressbar', { name: 'Sets: 3 of 12' })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Exercises: 2 of 2' })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Muscles trained: 2 of 2' })).toBeVisible();
  });

  test('every track announces its bounds and its current value, so none is a silent rectangle', async ({ page }) => {
    await bootWithHome(page, { sessions: [TRAINED_SESSION], program: PROGRAM });

    const setsTrack = page.getByRole('progressbar', { name: 'Sets: 3 of 12' });
    await expect(setsTrack).toHaveAttribute('aria-valuemin', '0');
    await expect(setsTrack).toHaveAttribute('aria-valuemax', '12');
    await expect(setsTrack).toHaveAttribute('aria-valuenow', '3');
    await expect(page.getByRole('progressbar')).toHaveCount(3);
  });

  test('with no active program the tracks show what was achieved and no denominator at all', async ({ page }) => {
    await bootWithHome(page, { sessions: [TRAINED_SESSION] });

    await expect(page.getByLabel('Sets: 3, no target set')).toBeVisible();
    await expect(page.getByLabel('Exercises: 2, no target set')).toBeVisible();
    await expect(page.getByLabel('Muscles trained: 2, no target set')).toBeVisible();
    await expect(page.getByText('No target set.')).toHaveCount(3);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.getByText('/', { exact: false })).toHaveCount(0);
  });

  test('nothing logged in the window renders one honest empty card and no tracks at all', async ({ page }) => {
    await bootWithHome(page, { sessions: [], program: PROGRAM });

    await expect(page.getByText('Nothing logged in the last 7 days')).toBeVisible();
    await expect(page.getByText('Log a workout and your progress appears here.')).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.getByText('Sets', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel(/no target set/)).toHaveCount(0);
  });

  // Success criterion 4's causal half. Every case above seeds and THEN mounts, which proves the
  // figure is derived correctly but never that it is derived AGAIN after logging. This one logs
  // into an already-mounted screen and drives a real navigation away and back, so a focus effect
  // wired with a stale dependency array — or a result memoised on mount — fails here and only here.
  test('a set logged after the card is on screen raises the figure once Home is focused again', async ({ page }) => {
    await bootWithHome(page, { sessions: [TRAINED_SESSION], program: PROGRAM });

    await expect(page.getByRole('progressbar', { name: 'Sets: 3 of 12' })).toBeVisible();

    await page.evaluate(
      ({ globalKey, localDate, exerciseId, muscleGroupId }) =>
        (window as unknown as HarnessWindow)[globalKey].seedTrainedWeek({
          sessions: [
            {
              localDate,
              exercises: [
                {
                  exerciseId,
                  primaryMuscleGroupIds: [muscleGroupId],
                  sets: [{ setType: 'normal', completed: true, weightKg: '100.000', reps: 5 }],
                },
              ],
            },
          ],
        }),
      { globalKey: DURABILITY_HARNESS_GLOBAL, localDate: localDateDaysAgo(0), exerciseId: BENCH, muscleGroupId: CHEST },
    );

    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].navigateAwayAndBack(),
      DURABILITY_HARNESS_GLOBAL,
    );

    await expect(page.getByRole('progressbar', { name: 'Sets: 4 of 12' })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Sets: 3 of 12' })).toHaveCount(0);
  });
});
