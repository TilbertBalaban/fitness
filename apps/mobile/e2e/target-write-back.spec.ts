import { expect, test } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

interface SeededProgrammedExercise {
  exerciseId: string;
  routineExerciseId: string;
  orderIndex: number;
}

interface SeededProgrammedSessionWithCycle {
  sessionId: string;
  routineId: string;
  routineDayId: string;
  cycleId: string;
  cycleTargetId: string;
  exercises: SeededProgrammedExercise[];
}

interface RoutineExerciseRow {
  id: string;
  target_sets: number | null;
  [key: string]: unknown;
}

interface CycleTargetRow {
  id: string;
  routine_exercise_id: string;
  cycle_id: string;
  target_sets: number | null;
  [key: string]: unknown;
}

interface WorkoutHarness {
  openWithFilename(dbFilename: string): Promise<void>;
  seedWorkoutSessionWithCycle(): Promise<SeededProgrammedSessionWithCycle>;
  openWorkoutScreen(): Promise<void>;
  readRoutineExercise(routineExerciseId: string): Promise<RoutineExerciseRow | null>;
  readCycleTarget(cycleTargetId: string): Promise<CycleTargetRow | null>;
  readCycleTargetsForRoutineExercise(routineExerciseId: string): Promise<CycleTargetRow[]>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it does not carry outer closures, which is why every callback below re-declares this cast
// inline rather than calling a shared helper (same constraint workout-screen.spec.ts documents).
type HarnessWindow = Record<string, WorkoutHarness>;

// Real @powersync/web database, real browser, the real WorkoutScreenView rendered by
// __durability.web.tsx — no case here calls writeBackTargets or setSessionExerciseTargets
// directly; every write is reached by a DOM interaction through the same production path a real
// gym session uses (D-01), proving D-15's override-vs-base write-back resolution end to end.
async function openAndSeed(
  page: import('@playwright/test').Page,
  dbFilename: string,
): Promise<SeededProgrammedSessionWithCycle> {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');

  await page.evaluate(
    ({ globalKey, dbFilename }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(dbFilename),
    { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
  );

  return page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSessionWithCycle(),
    DURABILITY_HARNESS_GLOBAL,
  );
}

test('an override row exists — write-back updates the override, not the base', async ({ page }) => {
  const dbFilename = `fitness-target-write-back-override-${Date.now()}.db`;
  const seeded = await openAndSeed(page, dbFilename);
  const [firstExercise] = seeded.exercises;

  // The first routine exercise's session snapshot resolved through the override (D-15's read
  // side, log-set.ts's resolvePrescriptionForCycle) — 5, not the base row's seeded 3.
  await page.getByRole('button', { name: 'Targets' }).click();
  await expect(page.getByRole('button', { name: 'Increase Sets' })).toBeVisible();
  await page.getByRole('button', { name: 'Increase Sets' }).click();
  await page.getByRole('button', { name: 'Also update my program' }).click();
  // handleWriteBack awaits setSessionExerciseTargets then writeBackTargets before calling onDone,
  // which is what unmounts the sheet — reading the DB before the sheet closes races the write and
  // observes the pre-write value (the Save/write-back buttons are still [disabled] mid-await).
  await expect(page.getByRole('button', { name: 'Increase Sets' })).toBeHidden();

  const overrideAfterFirstWriteBack = await page.evaluate(
    ({ globalKey, cycleTargetId }) => (window as unknown as HarnessWindow)[globalKey].readCycleTarget(cycleTargetId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, cycleTargetId: seeded.cycleTargetId },
  );
  const baseAfterFirstWriteBack = await page.evaluate(
    ({ globalKey, routineExerciseId }) =>
      (window as unknown as HarnessWindow)[globalKey].readRoutineExercise(routineExerciseId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, routineExerciseId: firstExercise.routineExerciseId },
  );

  expect(overrideAfterFirstWriteBack?.target_sets).toBe(6);
  expect(baseAfterFirstWriteBack?.target_sets).toBe(3);

  // SC4: reload the page (wiping every module-level JS variable, including whatever the prior
  // start-workout interaction held in memory), reopen the same underlying database by filename,
  // and repeat the write-back on the same field. The destination must still resolve to the
  // override row — proof the write path re-reads cycle_id from workout_session, not from memory.
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

  await page.getByRole('button', { name: 'Targets' }).click();
  await expect(page.getByRole('button', { name: 'Increase Sets' })).toBeVisible();
  await page.getByRole('button', { name: 'Increase Sets' }).click();
  await page.getByRole('button', { name: 'Also update my program' }).click();
  await expect(page.getByRole('button', { name: 'Increase Sets' })).toBeHidden();

  const overrideAfterSecondWriteBack = await page.evaluate(
    ({ globalKey, cycleTargetId }) => (window as unknown as HarnessWindow)[globalKey].readCycleTarget(cycleTargetId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, cycleTargetId: seeded.cycleTargetId },
  );
  const baseAfterSecondWriteBack = await page.evaluate(
    ({ globalKey, routineExerciseId }) =>
      (window as unknown as HarnessWindow)[globalKey].readRoutineExercise(routineExerciseId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, routineExerciseId: firstExercise.routineExerciseId },
  );

  expect(overrideAfterSecondWriteBack?.target_sets).toBe(7);
  expect(baseAfterSecondWriteBack?.target_sets).toBe(3);
});

test('no override row exists — write-back updates the base row', async ({ page }) => {
  const dbFilename = `fitness-target-write-back-base-${Date.now()}.db`;
  const seeded = await openAndSeed(page, dbFilename);
  const [, secondExercise] = seeded.exercises;

  // The two chips resolve to different fractions once the session snapshot picks up the first
  // exercise's override (5) versus the second exercise's unoverridden base (3) — this is what
  // makes the two identically-named ("Unknown exercise") chips distinguishable.
  const secondChip = page.getByRole('button', { name: 'Unknown exercise, 0/3' });
  await expect(secondChip).toBeVisible();
  await secondChip.click();

  await page.getByRole('button', { name: 'Targets' }).click();
  await expect(page.getByRole('button', { name: 'Increase Sets' })).toBeVisible();
  await page.getByRole('button', { name: 'Increase Sets' }).click();
  await page.getByRole('button', { name: 'Also update my program' }).click();
  await expect(page.getByRole('button', { name: 'Increase Sets' })).toBeHidden();

  const baseAfterWriteBack = await page.evaluate(
    ({ globalKey, routineExerciseId }) =>
      (window as unknown as HarnessWindow)[globalKey].readRoutineExercise(routineExerciseId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, routineExerciseId: secondExercise.routineExerciseId },
  );
  const overrideRowsForSecondExercise = await page.evaluate(
    ({ globalKey, routineExerciseId }) =>
      (window as unknown as HarnessWindow)[globalKey].readCycleTargetsForRoutineExercise(routineExerciseId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, routineExerciseId: secondExercise.routineExerciseId },
  );

  expect(baseAfterWriteBack?.target_sets).toBe(4);
  expect(overrideRowsForSecondExercise).toHaveLength(0);
});

test('a session-only Save leaves both program rows untouched', async ({ page }) => {
  const dbFilename = `fitness-target-write-back-save-only-${Date.now()}.db`;
  const seeded = await openAndSeed(page, dbFilename);
  const [firstExercise] = seeded.exercises;

  await page.getByRole('button', { name: 'Targets' }).click();
  await expect(page.getByRole('button', { name: 'Increase Sets' })).toBeVisible();
  await page.getByRole('button', { name: 'Increase Sets' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Increase Sets' })).toBeHidden();

  const baseAfterSave = await page.evaluate(
    ({ globalKey, routineExerciseId }) =>
      (window as unknown as HarnessWindow)[globalKey].readRoutineExercise(routineExerciseId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, routineExerciseId: firstExercise.routineExerciseId },
  );
  const overrideAfterSave = await page.evaluate(
    ({ globalKey, cycleTargetId }) => (window as unknown as HarnessWindow)[globalKey].readCycleTarget(cycleTargetId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, cycleTargetId: seeded.cycleTargetId },
  );

  expect(baseAfterSave?.target_sets).toBe(3);
  expect(overrideAfterSave?.target_sets).toBe(5);

  // The session's own displayed target reflects the edit (D-14): the exercise chip's fraction
  // denominator is read from the session_exercise snapshot Save just updated (5 -> 6), not from
  // either program row Save deliberately left alone.
  await expect(page.getByRole('button', { name: 'Unknown exercise, 0/6' })).toBeVisible();
});
