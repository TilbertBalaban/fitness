import { expect, test } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

interface SeededSet {
  weightKg: string | null;
  reps: number;
  setType: string;
  completed: boolean;
}

interface SeededMapping {
  muscleGroupId: string;
  weightFactor: number;
}

interface SeededExercise {
  exerciseId: string;
  mappings: SeededMapping[];
  sets: SeededSet[];
}

interface SeededSession {
  localDate: string;
  syncedToServer: boolean;
  exercises: SeededExercise[];
}

interface SeededRollupRow {
  muscleGroupId: string;
  localDate: string;
  weightedVolumeKg: number;
  weightedSets: number;
  setCount: number;
}

interface SeedMuscleMapInput {
  sessions: SeededSession[];
  rollup?: SeededRollupRow[];
  watermark?: { computedThroughDate: string };
}

interface MuscleMapHarness {
  open(): Promise<void>;
  seedMuscleMapAndOpenMuscleMap(input: SeedMuscleMapInput): Promise<void>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it carries no outer closures, matching every other e2e spec in this directory.
type HarnessWindow = Record<string, MuscleMapHarness>;

// loadMuscleMapWindow/loadMuscleDrilldown bound every read by [windowStart, todayLocalDate], where
// todayLocalDate comes from the real captureCalendarDay(new Date()) inside the app — so every
// seeded date has to be relative to the run's own clock, matching exercise-performance.spec.ts's
// own daysAgo helper.
function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function normalSet(weightKg: string, reps: number): SeededSet {
  return { weightKg, reps, setType: 'normal', completed: true };
}

async function bootAndSeed(page: import('@playwright/test').Page, input: SeedMuscleMapInput) {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].open(), DURABILITY_HARNESS_GLOBAL);
  await page.evaluate(
    ({ globalKey, seeded }) => (window as unknown as HarnessWindow)[globalKey].seedMuscleMapAndOpenMuscleMap(seeded),
    { globalKey: DURABILITY_HARNESS_GLOBAL, seeded: input },
  );
}

// Real @powersync/web database, real browser, the real /muscle-map route reached through its own
// {userId, db} override — the whole seedMuscleMapHistory -> loadMuscleMapWindow -> muscleMapPoints
// -> MuscleHeatmap's <Svg> chain runs unmocked here. Selectors are role plus accessible name, per
// 09-01's settled finding (WINDOWS.md's exercise-performance.spec.ts precedent); no per-node test
// attribute is added to any surface under test.
test.describe('muscle map — both figures render and announce themselves (ANLY-04)', () => {
  test('a front-side and a back-side muscle each render as one image-role figure with the right announced sentence', async ({
    page,
  }) => {
    await bootAndSeed(page, {
      sessions: [
        {
          localDate: daysAgo(1),
          syncedToServer: false,
          exercises: [
            {
              exerciseId: 'ex-mm-chest',
              mappings: [{ muscleGroupId: 'chest', weightFactor: 1 }],
              // Two sets at 100kg x 5 reps: 100 * 5 * 1 (factor) per set, twice over.
              sets: [normalSet('100.000', 5), normalSet('100.000', 5)],
            },
            {
              exerciseId: 'ex-mm-lats',
              mappings: [{ muscleGroupId: 'lats', weightFactor: 1 }],
              // One set at 80kg x 8 reps: a smaller weighted volume than chest's, so chest is the
              // window's own highest-trained muscle and lats is not.
              sets: [normalSet('80.000', 8)],
            },
          ],
        },
      ],
    });

    // The default window is 1 Week (design decision 8) — no chip click needed to reach it.
    await expect(
      page.getByRole('img', {
        name: /Front view, the last 7 days\. 1 of 10 muscles trained\. Highest: chest, 1000\.00 kg Training Volume\./,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('img', {
        name: /Back view, the last 7 days\. 1 of 9 muscles trained\. Highest: lats, 640\.00 kg Training Volume\./,
      }),
    ).toBeVisible();

    // The row list beneath the figures carries the same numbers, composed by muscleVolumeRowLabel.
    await expect(
      page.getByRole('button', { name: /chest, 1000\.00 kg Training Volume, 100% of your hardest-trained muscle/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /lats, 640\.00 kg Training Volume, 64% of your hardest-trained muscle/ }),
    ).toBeVisible();
  });
});

test.describe('muscle map — the 1-week window (ANLY-04, D-01)', () => {
  test('renders correctly from local sessions alone, with no rollup row and no stale-rollup caption', async ({ page }) => {
    await bootAndSeed(page, {
      sessions: [
        {
          localDate: daysAgo(2),
          syncedToServer: false,
          exercises: [
            {
              exerciseId: 'ex-mm-quads',
              mappings: [{ muscleGroupId: 'quads', weightFactor: 1 }],
              // One set at 150kg x 5 reps: 150 * 5 * 1 = 750.
              sets: [normalSet('150.000', 5)],
            },
          ],
        },
      ],
      // Deliberately no rollup rows and no watermark — the 1-week window must still render
      // correctly with nothing to overlay onto (D-01: it never reads the rollup at all).
    });

    // 1 Week is already selected by default; selecting it explicitly proves the chip itself works
    // and leaves the window unchanged.
    await page.getByRole('radio', { name: '1 Week' }).click();

    await expect(
      page.getByRole('button', { name: /quads, 750\.00 kg Training Volume, 100% of your hardest-trained muscle/ }),
    ).toBeVisible();

    // Never shown for the 1-week window (D-01) — and here there is nothing to disclose regardless.
    await expect(page.getByText(/not yet reflected on the server/)).toHaveCount(0);
  });
});

test.describe('muscle map — the D-01 overlay, including its backfill case (ANLY-04)', () => {
  test('a rollup row, a post-watermark session and a pre-watermark backfilled session all contribute to the same muscle', async ({
    page,
  }) => {
    const watermark = daysAgo(15);

    await bootAndSeed(page, {
      sessions: [
        {
          // Dated AFTER the watermark, and already synced — qualifies via the overlay predicate's
          // gt(local_date, computed_through_date) clause regardless of its owner column.
          localDate: daysAgo(5),
          syncedToServer: true,
          exercises: [
            {
              exerciseId: 'ex-mm-overlay-a',
              mappings: [{ muscleGroupId: 'chest', weightFactor: 1 }],
              // Two sets at 50kg x 5 reps: 50 * 5 * 1 = 250, twice over = 500.
              sets: [normalSet('50.000', 5), normalSet('50.000', 5)],
            },
          ],
        },
        {
          // Dated BEFORE the watermark, with no server owner — the backfill case: a session
          // logged offline whose date falls inside what the rollup already claims to cover.
          // Qualifies only via the overlay predicate's isNull(user_id) clause.
          localDate: daysAgo(20),
          syncedToServer: false,
          exercises: [
            {
              exerciseId: 'ex-mm-overlay-b',
              mappings: [{ muscleGroupId: 'chest', weightFactor: 1 }],
              // One set at 60kg x 5 reps: 60 * 5 * 1 = 300.
              sets: [normalSet('60.000', 5)],
            },
          ],
        },
      ],
      rollup: [{ muscleGroupId: 'chest', localDate: daysAgo(25), weightedVolumeKg: 1000, weightedSets: 5, setCount: 5 }],
      watermark: { computedThroughDate: watermark },
    });

    await page.getByRole('radio', { name: '1 Month' }).click();

    // 1000 (rollup) + 500 (post-watermark session) + 300 (pre-watermark backfilled session) =
    // 1800. If either overlay session were dropped, this total would not match — so a match here
    // is proof both the post-watermark half AND the backfill half of the predicate are wired.
    await expect(page.getByRole('button', { name: /chest, 1800\.00 kg Training Volume/ })).toBeVisible();

    // Both overlay sessions are disclosed by count, not just by their effect on the total.
    await expect(page.getByText('Includes 2 sessions not yet reflected on the server.', { exact: true })).toBeVisible();
  });
});

test.describe('muscle map — untrained is categorically distinct (ANLY-04, D-10)', () => {
  test('an untrained muscle row reads the word itself, never a fabricated zero', async ({ page }) => {
    await bootAndSeed(page, {
      sessions: [
        {
          localDate: daysAgo(1),
          syncedToServer: false,
          exercises: [
            {
              exerciseId: 'ex-mm-trained',
              mappings: [{ muscleGroupId: 'chest', weightFactor: 1 }],
              sets: [normalSet('100.000', 5)],
            },
            {
              // Included in the session (so its muscle_group + mapping rows exist and its name
              // resolves) but with zero sets, so muscleVolumeCells skips it entirely — the muscle
              // it maps to renders untrained, not at a fabricated zero volume.
              exerciseId: 'ex-mm-untrained',
              mappings: [{ muscleGroupId: 'hamstrings', weightFactor: 1 }],
              sets: [],
            },
          ],
        },
      ],
    });

    await expect(page.getByRole('button', { name: 'hamstrings, untrained' })).toBeVisible();
  });
});

test.describe('muscle map — the drill-down (ANLY-05)', () => {
  test('tapping a trained row opens the drill-down, lists contributors in rank order, and Close leaves the window unchanged', async ({
    page,
  }) => {
    await bootAndSeed(page, {
      sessions: [
        {
          localDate: daysAgo(1),
          syncedToServer: false,
          exercises: [
            {
              exerciseId: 'ex-mm-drill-big',
              mappings: [{ muscleGroupId: 'chest', weightFactor: 1 }],
              // Two sets at 100kg x 5 reps: 1000 weighted volume, 2 contributing sets.
              sets: [normalSet('100.000', 5), normalSet('100.000', 5)],
            },
            {
              exerciseId: 'ex-mm-drill-small',
              mappings: [{ muscleGroupId: 'chest', weightFactor: 1 }],
              // One set at 50kg x 5 reps: 250 weighted volume, 1 contributing set — strictly less
              // than the exercise above, so rankMuscleContributions must list it second.
              sets: [normalSet('50.000', 5)],
            },
          ],
        },
      ],
    });

    // chest is the only trained muscle in this window, so it renders at 100% of the
    // hardest-trained muscle (itself) — the combined total this test's own arithmetic checks.
    const chestRow = page.getByRole('button', {
      name: /chest, 1250\.00 kg Training Volume, 100% of your hardest-trained muscle/,
    });
    await expect(chestRow).toBeVisible();
    await chestRow.click();

    // Neither seeded exercise has a catalog row, so both resolve to the shared unknown-exercise
    // fallback name; the contributed-volume half of each row's own accessible name is what proves
    // the fixed contribution order instead.
    const contributorRows = page.getByRole('button', { name: /Unknown exercise/ });
    await expect(contributorRows).toHaveCount(2);
    await expect(contributorRows.nth(0)).toHaveAccessibleName(/Unknown exercise, 2 sets, 1000\.00 kg contributed to chest/);
    await expect(contributorRows.nth(1)).toHaveAccessibleName(/Unknown exercise, 1 set, 250\.00 kg contributed to chest/);

    await page.getByRole('button', { name: 'Close' }).click();

    await expect(contributorRows).toHaveCount(0);
    // The window selection itself is untouched by opening and closing the sheet — the same
    // combined chest total from before the tap is still what renders.
    await expect(chestRow).toBeVisible();
  });

  test('an untrained row opens the sheet too, showing the no-sets copy rather than being unreachable', async ({ page }) => {
    await bootAndSeed(page, {
      sessions: [
        {
          localDate: daysAgo(1),
          syncedToServer: false,
          exercises: [
            {
              exerciseId: 'ex-mm-drill-trained',
              mappings: [{ muscleGroupId: 'chest', weightFactor: 1 }],
              sets: [normalSet('100.000', 5)],
            },
            {
              exerciseId: 'ex-mm-drill-untrained',
              mappings: [{ muscleGroupId: 'hamstrings', weightFactor: 1 }],
              sets: [],
            },
          ],
        },
      ],
    });

    await page.getByRole('button', { name: 'hamstrings, untrained' }).click();

    await expect(page.getByText('No sets for hamstrings in the last 7 days', { exact: true })).toBeVisible();
    await expect(page.getByText('Widen the time range or log an exercise that trains this muscle.', { exact: true })).toBeVisible();
  });
});
