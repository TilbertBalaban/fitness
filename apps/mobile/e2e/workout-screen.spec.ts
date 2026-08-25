import { expect, test } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

interface SeededProgrammedExercise {
  exerciseId: string;
  routineExerciseId: string;
  orderIndex: number;
}

interface SeededProgrammedSession {
  sessionId: string;
  routineId: string;
  routineDayId: string;
  exercises: SeededProgrammedExercise[];
}

interface WorkoutHarness {
  openWithFilename(dbFilename: string): Promise<void>;
  seedWorkoutSession(): Promise<SeededProgrammedSession>;
  openWorkoutScreen(): Promise<void>;
  useProductionDb(): Promise<void>;
  loadCatalog(): Promise<{ status: string; catalogVersion?: string }>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it does not carry outer closures, which is why every callback below re-declares this cast
// inline rather than calling a shared helper (same constraint durability.spec.ts documents).
type HarnessWindow = Record<string, WorkoutHarness>;

// Real @powersync/web database, real browser, the real WorkoutScreenView rendered by
// __durability.web.tsx's `?screen=workout`-equivalent harness mode — no harness method here calls
// logSet/updateLoggedSet directly; every write below is a DOM click reaching the same
// production write path a real gym session uses (D-01).
test('starting a programmed workout, logging one set on the in-app keypad, and reloading', async ({ page }) => {
  const dbFilename = `fitness-workout-screen-${Date.now()}.db`;

  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');

  await page.evaluate(
    ({ globalKey, dbFilename }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(dbFilename),
    { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
  );

  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(),
    DURABILITY_HARNESS_GLOBAL,
  );

  // The draft row's weight field starts blank (D-16) — its Pressable is present as soon as the
  // real WorkoutScreenView mounts against the seeded session, no loading state to wait past (R6).
  const weightField = page.getByRole('button', { name: 'Weight, set field' });
  await expect(weightField).toBeVisible();
  await weightField.click();

  await page.getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();

  // Walk weight -> reps -> rir (D-18): two submit-arrow presses (weight->reps, reps->rir), then
  // Done on rir. Reps/RIR are already prefilled from the session_exercise snapshot (D-16), so no
  // digits are pressed for them — Next field/Done on an untouched field must not overwrite a real
  // prefilled value with a blank one.
  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  const checkmark = page.getByRole('button', { name: 'Mark set complete' });
  await expect(checkmark).toBeVisible();
  await checkmark.click();

  const completedCheckmark = page.getByRole('button', { name: 'Mark set incomplete' });
  await expect(completedCheckmark).toBeVisible();
  await expect(page.getByRole('button', { name: 'Weight, set field' })).toContainText('100');
  await expect(page.getByRole('button', { name: 'Reps, set field' })).toContainText('12');
  await expect(page.getByRole('button', { name: 'RIR, set field' })).toContainText('2');

  await page.reload();
  await page.waitForSelector('[data-testid="durability-harness-ready"]');

  await page.evaluate(
    ({ globalKey, dbFilename }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(dbFilename),
    { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
  );
  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].openWorkoutScreen(),
    DURABILITY_HARNESS_GLOBAL,
  );

  await expect(page.getByRole('button', { name: 'Mark set incomplete' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Weight, set field' })).toContainText('100');
  await expect(page.getByRole('button', { name: 'Reps, set field' })).toContainText('12');
  await expect(page.getByRole('button', { name: 'RIR, set field' })).toContainText('2');

  // A second checkmark tap undoes the completion in place with all three values intact (D-19) —
  // the round trip LOG-07's edge probe pins, exercised here against the reopened, real database.
  await page.getByRole('button', { name: 'Mark set incomplete' }).click();
  await expect(page.getByRole('button', { name: 'Mark set complete' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Weight, set field' })).toContainText('100');
  await expect(page.getByRole('button', { name: 'Reps, set field' })).toContainText('12');
  await expect(page.getByRole('button', { name: 'RIR, set field' })).toContainText('2');
});

// Swiping the pager / tapping the second strip chip (Task 2's acceptance criteria) is asserted in
// a second case once ExerciseStrip/ExercisePager exist — see 05-01-SUMMARY.md's Known Stubs for
// the exact gap this file carries until then.

// WINDOWS #115 / 05-06-PLAN.md Task 3: adding an exercise mid-session grows the exercise strip by
// one chip. Written per the continuation dispatch that closed WINDOWS #114 (workout.tsx's Add
// Exercise chip is no longer a no-op) but NOT executed in this session per the project's
// browser-testing-only-on-request rule — recorded as an unrun-verify ledger entry instead.
test('adding an exercise mid-session grows the exercise strip by one chip', async ({ page }) => {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');

  // ExercisePickerModal (used for both the strip's "Add Exercise" chip and the one-off start flow)
  // resolves its own catalog rows through getPowerSync() — the production singleton — not through
  // the isolated per-test database openWithFilename() would otherwise give this harness. Routing
  // every call below through useProductionDb() keeps seedWorkoutSession/loadCatalog and the
  // picker's own read on the SAME database, so the picker actually has real rows to search and
  // select (see __durability.web.tsx's useProductionDb comment for the precedent this reuses).
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].useProductionDb(), DURABILITY_HARNESS_GLOBAL);
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].loadCatalog(), DURABILITY_HARNESS_GLOBAL);
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(), DURABILITY_HARNESS_GLOBAL);

  // seedProgrammedSession (test-support.ts) seeds exactly two programmed exercises referenced by
  // bare id, not a seeded catalog row, so both resolve to the "Unknown exercise" fallback name
  // (session-query.ts's loadSessionTree) — two identically-labelled chips is the pre-add baseline.
  await expect(page.getByRole('button', { name: 'Unknown exercise, 0/3' })).toHaveCount(2);
  const newChip = page.getByRole('button', { name: 'Barbell Bench Press - Medium Grip, 0/0' });
  await expect(newChip).toHaveCount(0);

  await page.getByRole('button', { name: 'Add Exercise' }).click();

  const exerciseRow = page.getByRole('button', { name: 'Barbell Bench Press - Medium Grip' });
  await expect(exerciseRow).toBeVisible();
  await exerciseRow.click();
  await page.getByRole('button', { name: 'Add exercises to day' }).click();

  // The strip grows by exactly one chip — a third, distinctly-labelled exercise (EMPTY_PRESCRIPTION
  // renders its target as 0/0, per addExerciseToSession's own no-routine-linkage path) — reached
  // through the same DOM clicks a real gym session would use (D-01), never a harness shortcut.
  await expect(newChip).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Unknown exercise, 0/3' })).toHaveCount(2);
});
