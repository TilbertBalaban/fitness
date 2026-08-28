import { expect, test, type Page } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

interface SeededRoutineTree {
  routineId: string;
  dayIds: string[];
  exerciseSlotIds: string[];
  cycleId: string;
}

interface RawRoutineDay {
  id: string;
  routine_id: string;
  order_index: number;
  name: string;
  is_rest_day: number;
  archived_at: string | null;
  [key: string]: unknown;
}

interface RawRoutineExercise {
  id: string;
  routine_day_id: string;
  exercise_id: string;
  [key: string]: unknown;
}

interface RawRoutineCycle {
  id: string;
  routine_id: string;
  order_index: number;
  name: string;
  kind: string;
  duration_days: number | null;
  [key: string]: unknown;
}

interface ProgramsHarness {
  openWithFilename(dbFilename: string): Promise<void>;
  seedRoutineTree(): Promise<SeededRoutineTree>;
  openProgramsScreen(): Promise<void>;
  readRoutineDayRaw(dayId: string): Promise<RawRoutineDay | null>;
  readRoutineDaysRaw(routineId: string): Promise<RawRoutineDay[]>;
  readRoutineCycleRaw(cycleId: string): Promise<RawRoutineCycle | null>;
  readRoutineExercise(routineExerciseId: string): Promise<RawRoutineExercise | null>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it carries no outer closure, the same constraint every other e2e spec in this suite
// documents, which is why every callback below re-declares this cast inline.
type HarnessWindow = Record<string, ProgramsHarness>;

async function openHarness(page: Page, dbFilename: string): Promise<void> {
  await page.goto('/__durability');
  await expect(page.getByTestId('durability-harness-ready')).toHaveText('ready');

  await page.evaluate(
    ({ globalKey, dbFilename }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(dbFilename),
    { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
  );
}

async function seedAndOpen(page: Page): Promise<SeededRoutineTree> {
  const seeded = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedRoutineTree(),
    DURABILITY_HARNESS_GLOBAL,
  );
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].openProgramsScreen(), DURABILITY_HARNESS_GLOBAL);
  await expect(page.getByRole('button', { name: 'Rename Push', exact: true })).toBeVisible();
  return seeded;
}

async function readDay(page: Page, dayId: string): Promise<RawRoutineDay | null> {
  return page.evaluate(
    ({ globalKey, dayId }) => (window as unknown as HarnessWindow)[globalKey].readRoutineDayRaw(dayId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, dayId },
  );
}

async function readDays(page: Page, routineId: string): Promise<RawRoutineDay[]> {
  return page.evaluate(
    ({ globalKey, routineId }) => (window as unknown as HarnessWindow)[globalKey].readRoutineDaysRaw(routineId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, routineId },
  );
}

async function readExercise(page: Page, routineExerciseId: string): Promise<RawRoutineExercise | null> {
  return page.evaluate(
    ({ globalKey, routineExerciseId }) =>
      (window as unknown as HarnessWindow)[globalKey].readRoutineExercise(routineExerciseId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, routineExerciseId },
  );
}

async function readCycle(page: Page, cycleId: string): Promise<RawRoutineCycle | null> {
  return page.evaluate(
    ({ globalKey, cycleId }) => (window as unknown as HarnessWindow)[globalKey].readRoutineCycleRaw(cycleId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, cycleId },
  );
}

test('duplicating, archiving and restoring a training day, driven end to end', async ({ page }) => {
  const dbFilename = `fitness-program-day-lifecycle-${Date.now()}.db`;
  await openHarness(page, dbFilename);
  const seeded = await seedAndOpen(page);
  const [pushDayId, pullDayId] = seeded.dayIds;
  const [pushExerciseId1, pushExerciseId2] = seeded.exerciseSlotIds;

  // --- Duplicate ---
  // The deck opens on the Push page (day order index 0) by default — no navigation needed. Each
  // exercise name is seeded onto both Push and Pull, so the baseline count of two proves nothing is
  // double-counted before the duplicate happens.
  await expect(page.getByText('Routine Tree Exercise 1')).toHaveCount(2);
  await expect(page.getByText('Routine Tree Exercise 2')).toHaveCount(2);

  await page.getByRole('button', { name: 'Duplicate Push', exact: true }).click();

  // The write is not confirmed (04-UI-SPEC.md's Confirmations table): the underlying day page is
  // still there right after the tap, not replaced by ArchiveDialog.
  await expect(page.getByRole('button', { name: 'Rename Push', exact: true })).toBeVisible();

  await expect.poll(() => readDays(page, seeded.routineId).then((rows) => rows.length)).toBe(3);
  const daysAfterDuplicate = await readDays(page, seeded.routineId);
  const copies = daysAfterDuplicate.filter((day) => day.name === 'Push copy');
  expect(copies).toHaveLength(1);
  const copyDay = copies[0]!;
  const otherOrderIndexes = daysAfterDuplicate.filter((day) => day.id !== copyDay.id).map((day) => day.order_index);
  expect(otherOrderIndexes.every((orderIndex) => copyDay.order_index > orderIndex)).toBe(true);

  // The copy's own exercises render on its own (inactive) page, invisible to a role-based query but
  // not to a text query (DayDeck's read_first) — each exercise name's occurrence count rising from
  // two to three proves the copy carries both of the source day's exercises, not an empty shell.
  await expect(page.getByText('Routine Tree Exercise 1')).toHaveCount(3);
  await expect(page.getByText('Routine Tree Exercise 2')).toHaveCount(3);

  // --- Archive ---
  await page.getByRole('button', { name: 'Archive Push', exact: true }).click();
  await expect(page.getByText('Archive Day', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();

  // The load-bearing half: the row survives with a timestamp, not a delete — the rendered deck
  // looks identical either way, so only the raw row tells them apart.
  await expect.poll(() => readDay(page, pushDayId).then((row) => row?.archived_at ?? null)).not.toBeNull();
  const archivedPushRow = await readDay(page, pushDayId);
  expect(archivedPushRow).not.toBeNull();
  expect(typeof archivedPushRow!.archived_at).toBe('string');

  const archivedExercise1 = await readExercise(page, pushExerciseId1);
  const archivedExercise2 = await readExercise(page, pushExerciseId2);
  expect(archivedExercise1).not.toBeNull();
  expect(archivedExercise1!.routine_day_id).toBe(pushDayId);
  expect(archivedExercise2).not.toBeNull();
  expect(archivedExercise2!.routine_day_id).toBe(pushDayId);

  await expect(page.getByRole('button', { name: 'Rename Push', exact: true })).not.toBeVisible();
  await expect(page.getByText('Archived days', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore Push', exact: true })).toBeVisible();

  // --- Restore ---
  await page.getByRole('button', { name: 'Restore Push', exact: true }).click();
  await expect(page.getByText('Restore Day', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();

  await expect.poll(() => readDay(page, pushDayId).then((row) => row?.archived_at ?? null)).toBeNull();

  await expect(page.getByRole('button', { name: 'Rename Push', exact: true })).toBeVisible();
  // Absent, not empty (D-29's own-empty-omits-header rule) — the section itself must disappear.
  await expect(page.getByText('Archived days', { exact: true })).toHaveCount(0);

  // Pull was never touched by any of the three operations above.
  const finalPullRow = await readDay(page, pullDayId);
  expect(finalPullRow?.archived_at ?? null).toBeNull();
});

test('converting a cycle to time off with a duration writes kind and duration_days together', async ({ page }) => {
  const dbFilename = `fitness-program-day-lifecycle-cycle-ok-${Date.now()}.db`;
  await openHarness(page, dbFilename);
  const seeded = await seedAndOpen(page);

  await page.getByRole('button', { name: 'Week 1, training cycle' }).click();
  await page.getByRole('button', { name: 'Edit Cycle', exact: true }).click();

  // Absent for a non-time-off kind — the conditional render is the form's whole shape.
  await expect(page.getByLabel('Days off', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Make Time off', exact: true }).click();
  await expect(page.getByLabel('Days off', { exact: true })).toBeVisible();

  await page.getByLabel('Days off', { exact: true }).fill('7');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect
    .poll(() => readCycle(page, seeded.cycleId).then((row) => row?.kind ?? null))
    .toBe('time_off');
  const savedCycle = await readCycle(page, seeded.cycleId);
  expect(savedCycle?.duration_days).toBe(7);

  // The form closed on a successful save — the field it staged its edit through is gone.
  await expect(page.getByLabel('Days off', { exact: true })).toHaveCount(0);
});

test('converting a cycle to time off with no duration writes nothing', async ({ page }) => {
  const dbFilename = `fitness-program-day-lifecycle-cycle-fail-${Date.now()}.db`;
  await openHarness(page, dbFilename);
  const seeded = await seedAndOpen(page);

  await page.getByRole('button', { name: 'Week 1, training cycle' }).click();
  await page.getByRole('button', { name: 'Edit Cycle', exact: true }).click();
  await page.getByRole('button', { name: 'Make Time off', exact: true }).click();

  const durationField = page.getByLabel('Days off', { exact: true });
  await expect(durationField).toBeVisible();
  await expect(durationField).toHaveValue('');

  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // The form stays open and the validation message is what the user sees...
  await expect(durationField).toBeVisible();
  await expect(page.getByText('Time off needs a length in days.', { exact: true })).toBeVisible();

  // ...but the load-bearing half is the stored row: a form that showed the error after already
  // writing the kind would be the same trap wearing a warning label.
  const unchangedCycle = await readCycle(page, seeded.cycleId);
  expect(unchangedCycle?.kind).toBe('training');
  expect(unchangedCycle?.duration_days ?? null).toBeNull();
});
