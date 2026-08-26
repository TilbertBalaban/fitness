import { expect, test, type Locator, type Page } from '@playwright/test';
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

interface SessionExerciseRawRow {
  id: string;
  exercise_id: string;
  order_index: number;
  removed_at: string | null;
  [key: string]: unknown;
}

interface WorkoutHarness {
  openWithFilename(dbFilename: string): Promise<void>;
  seedWorkoutSession(): Promise<SeededProgrammedSession>;
  readSessionExercisesRaw(sessionId: string): Promise<SessionExerciseRawRow[]>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it does not carry outer closures, which is why every callback below re-declares this cast
// inline rather than calling a shared helper (workout-screen.spec.ts/session-notes.spec.ts's own
// documented constraint).
type HarnessWindow = Record<string, WorkoutHarness>;

// Real @powersync/web database, real browser, the real WorkoutScreenView rendered by
// __durability.web.tsx — no case here calls the reorder mutation directly; every reorder is
// reached by a real DOM pointer drag through DragHandle.web.tsx's own pointer-capture contract,
// proving Amendment A.3's sheet end to end (LOG-14).
async function openAndSeed(page: Page, dbFilename: string): Promise<{ seeded: SeededProgrammedSession }> {
  await page.goto('/__durability');
  await expect(page.getByTestId('durability-harness-ready')).toHaveText('ready');

  await page.evaluate(
    ({ globalKey, dbFilename }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(dbFilename),
    { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
  );

  const seeded = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(),
    DURABILITY_HARNESS_GLOBAL,
  );

  return { seeded };
}

async function readSessionExercises(page: Page, sessionId: string): Promise<SessionExerciseRawRow[]> {
  return page.evaluate(
    ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].readSessionExercisesRaw(sessionId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId },
  );
}

// ExercisePagerView (react-native-tab-view) only keeps the CURRENT page's controls in the
// accessibility tree — the inactive page's buttons are present in the DOM but carry no accessible
// name (aria-hidden), so nth(1)-scoping a role+name locator across both pages never resolves. The
// strip chip is the one control that is visible for BOTH pages regardless of which is active, so
// switching pages goes through it — .nth(1) is safe there specifically because, before any set is
// logged, both chips are still identically labelled ("Unknown exercise, 0/3") and chip order
// mirrors order_index order exactly like the sheet's own rows will.
//
// exercises[1] is the seeded program's own LAST exercise (targetSets: 3, no working sets yet), so
// logging its own draft row's working set never triggers LOG-13's auto-advance (shouldAutoAdvance
// never advances past the last exercise, lib/session/auto-advance.ts) — unlike logging the FIRST
// exercise's set (session-notes.spec.ts's own documented workaround, WINDOWS #136). It also gives
// the two otherwise-identical "Unknown exercise" rows/chips distinct fractions (0/3 vs 1/3), the
// only way to tell them apart in this harness (seedProgrammedSession seeds bare exercise ids with
// no matching catalog row — see test-support.ts's own doc comment).
async function logSecondExerciseWorkingSet(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Unknown exercise, 0/3' }).nth(1).click();

  const weightField = page.getByRole('button', { name: 'Weight, set field' });
  await expect(weightField).toBeVisible();
  await weightField.click();

  await page.getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();

  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Mark set complete' }).click();
}

async function openReorderSheet(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'More' }).first().click();
  await page.getByRole('button', { name: 'Reorder', exact: true }).click();
  await expect(page.getByText('Reorder Exercises', { exact: true })).toBeVisible();
}

// The two rows are otherwise identical ("Unknown exercise"); the fraction logSecondExerciseWorkingSet
// established (0/3 vs 1/3) is what disambiguates which DragHandle belongs to which exercise, and the
// row order itself (order_index order) is what nth() below relies on.
function reorderHandles(page: Page): Locator {
  return page.getByRole('button', { name: 'Reorder Unknown exercise' });
}

// DragHandle.web.tsx captures the pointer on down and requires an actual held-button move sequence
// to accumulate translationY — a single teleport would still commit (pointerup fires with whatever
// translationY was last recorded), but multiple intermediate moves is what a real drag produces and
// is what the dispatch's own read_first calls out as load-bearing for the capture contract.
async function dragHandleTo(page: Page, fromHandle: Locator, targetY: number): Promise<void> {
  const box = await fromHandle.boundingBox();
  if (!box) throw new Error('drag handle has no bounding box — is it visible?');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + (targetY - startY) / 2, { steps: 4 });
  await page.mouse.move(startX, targetY, { steps: 4 });
  await page.mouse.up();
}

// onDone's onExerciseChanged() reload is a separate async operation from closeSheet()'s own
// synchronous state update — the sheet disappearing proves nothing about whether the strip/pager's
// own re-fetched exercises array has re-rendered yet. Interacting with the page again before that
// settles is what produced an intermittent "element is not stable"/"outside of viewport" click
// failure on the very next action-bar button. Waiting for the strip's own first chip to reflect the
// expected post-reorder order is a real DOM signal that reload() has actually finished, not a fixed
// sleep — every caller that expects the order to have changed passes its own expectation here.
async function closeReorderSheet(page: Page, expectedFirstChipName?: string): Promise<void> {
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Reorder Exercises', { exact: true })).toBeHidden();
  if (expectedFirstChipName) {
    await expect(page.getByRole('button', { name: /^Unknown exercise, / }).first()).toHaveAccessibleName(expectedFirstChipName);
  }
}

test('dragging the second exercise above the first commits the new order', async ({ page }) => {
  const dbFilename = `fitness-reorder-exercises-commit-${Date.now()}.db`;
  const { seeded } = await openAndSeed(page, dbFilename);
  await logSecondExerciseWorkingSet(page);

  await openReorderSheet(page);

  const handles = reorderHandles(page);
  const firstRowHandle = handles.nth(0);
  const secondRowHandle = handles.nth(1);
  const firstRowBox = await firstRowHandle.boundingBox();
  if (!firstRowBox) throw new Error('first row handle has no bounding box');

  await dragHandleTo(page, secondRowHandle, firstRowBox.y + firstRowBox.height / 2);
  await closeReorderSheet(page, 'Unknown exercise, 1/3');

  const exerciseIdA = seeded.exercises[0].exerciseId;
  const exerciseIdB = seeded.exercises[1].exerciseId;

  await expect
    .poll(async () => {
      const rows = await readSessionExercises(page, seeded.sessionId);
      const rowB = rows.find((row) => row.exercise_id === exerciseIdB);
      return rowB?.order_index;
    })
    .toBe(0);

  const rows = await readSessionExercises(page, seeded.sessionId);
  const rowA = rows.find((row) => row.exercise_id === exerciseIdA);
  expect(rowA?.order_index).toBe(1);
});

test('reordering is idempotent', async ({ page }) => {
  const dbFilename = `fitness-reorder-exercises-idempotent-${Date.now()}.db`;
  const { seeded } = await openAndSeed(page, dbFilename);
  await logSecondExerciseWorkingSet(page);

  await openReorderSheet(page);
  const handlesBeforeDrop = reorderHandles(page);
  const firstRowBoxBeforeDrop = await handlesBeforeDrop.nth(0).boundingBox();
  if (!firstRowBoxBeforeDrop) throw new Error('first row handle has no bounding box');
  await dragHandleTo(page, handlesBeforeDrop.nth(1), firstRowBoxBeforeDrop.y + firstRowBoxBeforeDrop.height / 2);
  await closeReorderSheet(page, 'Unknown exercise, 1/3');

  const exerciseIdB = seeded.exercises[1].exerciseId;
  await expect
    .poll(async () => {
      const rows = await readSessionExercises(page, seeded.sessionId);
      return rows.find((row) => row.exercise_id === exerciseIdB)?.order_index;
    })
    .toBe(0);

  const committed = await readSessionExercises(page, seeded.sessionId);
  const committedById = new Map(committed.map((row) => [row.id, row.order_index]));

  await openReorderSheet(page);
  const handleToDropInPlace = reorderHandles(page).nth(0);
  const box = await handleToDropInPlace.boundingBox();
  if (!box) throw new Error('drag handle has no bounding box');
  await dragHandleTo(page, handleToDropInPlace, box.y + box.height / 2 + 2);
  await closeReorderSheet(page, 'Unknown exercise, 1/3');

  await expect
    .poll(async () => {
      const rows = await readSessionExercises(page, seeded.sessionId);
      return rows.every((row) => row.order_index === committedById.get(row.id));
    })
    .toBe(true);
});

test('a removed exercise is neither listed nor renumbered', async ({ page }) => {
  const dbFilename = `fitness-reorder-exercises-removed-${Date.now()}.db`;
  const { seeded } = await openAndSeed(page, dbFilename);

  const beforeRemove = await readSessionExercises(page, seeded.sessionId);
  const firstExerciseId = seeded.exercises[0].exerciseId;
  const originalOrderIndex = beforeRemove.find((row) => row.exercise_id === firstExerciseId)?.order_index;
  expect(originalOrderIndex).toBeDefined();

  await page.getByRole('button', { name: 'More' }).first().click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('Remove Exercise', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();

  await expect
    .poll(async () => {
      const rows = await readSessionExercises(page, seeded.sessionId);
      return rows.find((row) => row.exercise_id === firstExerciseId)?.removed_at ?? null;
    })
    .not.toBeNull();

  await openReorderSheet(page);

  await expect(reorderHandles(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reorder Unknown exercise' })).toHaveCount(0);

  const afterRows = await readSessionExercises(page, seeded.sessionId);
  const removedRow = afterRows.find((row) => row.exercise_id === firstExerciseId);
  expect(removedRow).toBeDefined();
  expect(removedRow?.order_index).toBe(originalOrderIndex);
  expect(removedRow?.removed_at).not.toBeNull();
});
