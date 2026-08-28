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

interface SeededSupersetPair {
  sessionId: string;
  sessionExerciseIds: [string, string];
}

interface LoggedSetGroupingRow {
  id: string;
  set_index: number;
  set_type: string;
  parent_set_id: string | null;
  side: string | null;
}

interface RawSessionExercise {
  id: string;
  order_index: number;
}

interface AdvancedSetsHarness {
  open(): Promise<void>;
  openWithFilename(dbFilename: string): Promise<void>;
  seedWorkoutSession(): Promise<SeededProgrammedSession>;
  seedSupersetPair(): Promise<SeededSupersetPair>;
  openWorkoutScreen(): Promise<void>;
  readLoggedSetsWithGrouping(sessionExerciseId: string): Promise<LoggedSetGroupingRow[]>;
  readSessionExercisesRaw(sessionId: string): Promise<RawSessionExercise[]>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it does not carry outer closures, matching durability.spec.ts's documented constraint,
// which is why every callback below re-declares this cast inline rather than calling a shared
// helper.
type HarnessWindow = Record<string, AdvancedSetsHarness>;

// Reused set-completion flow from workout-screen.spec.ts/rest-timer.spec.ts: weight -> reps -> rir
// -> checkmark, reps/rir already prefilled from the session_exercise snapshot so only weight's
// digits are typed. Targets the FIRST (only, at call time) draft row.
async function completeFirstSet(page: import('@playwright/test').Page) {
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
  await expect(page.getByRole('button', { name: 'Mark set incomplete' })).toBeVisible();
}

// rest-timer.spec.ts's identical helper: completes the trailing draft row (buildSetRows always
// appends exactly one behind the last real row), addressed with `.last()` rather than the bare
// (possibly ambiguous, once other rows exist) selector `completeFirstSet` uses.
async function completeNextWorkingSet(page: import('@playwright/test').Page) {
  const weightField = page.getByRole('button', { name: 'Weight, set field' }).last();
  await expect(weightField).toBeVisible();
  await weightField.click();
  await page.getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();
  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Mark set complete' }).last().click();
  await expect(page.getByRole('button', { name: 'Mark set incomplete' }).last()).toBeVisible();
}

// D-14's member-advance can jump the pager to the NEXT superset member the instant a non-final
// member's checkmark is tapped — before the click's own async write settles, this row's own
// "Mark set complete" -> "Mark set incomplete" transition may already be showing on a page this
// helper is no longer looking at. Unlike completeFirstSet/completeNextWorkingSet above (used only
// where no member-advance can fire), this helper does not assert the tapped row's own post-click
// state — the caller asserts session-level effects (the header Rest bar, the strip's fractions)
// instead, which are correct regardless of which exercise page the pager lands on afterward.
async function completeDraftAllowingMemberAdvance(page: import('@playwright/test').Page) {
  const weightField = page.getByRole('button', { name: 'Weight, set field' }).first();
  await expect(weightField).toBeVisible();
  await weightField.click();
  await page.getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();
  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Mark set complete' }).first().click();
  // Gives the write (and any member-advance pager jump chained after it) time to land before the
  // caller's next action — the same real-time settle wait rest-timer.spec.ts documents for an
  // identical race between a click's async chain and the very next assertion.
  await page.waitForTimeout(250);
}

// Success criterion "logging a plain working set is no slower than before this phase" (07-CONTEXT,
// 07-VALIDATION's Manual-Only table) — completeFirstSet/completeNextWorkingSet above are the exact
// same tap sequence workout-screen.spec.ts and rest-timer.spec.ts already prove against the shipped
// Phase 5 flow; every case below reuses them unchanged rather than inventing a slower path.

test('a drop-set group survives a real browser reload, with the child naming its parent in parent_set_id', async ({
  page,
}) => {
  const dbFilename = `advanced-sets-drop-${Date.now()}.db`;

  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');

  await page.evaluate(
    ({ globalKey, dbFilename }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(dbFilename),
    { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
  );

  const seeded = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(),
    DURABILITY_HARNESS_GLOBAL,
  );

  // seedWorkoutSession's own return shape (SeededProgrammedExercise[]) never carries the
  // client-generated session_exercise id addSessionExercise assigns internally — read it back the
  // same way seedSupersetPair (test-support.ts) does, ordered by order_index, so this case can
  // address the FIRST exercise's real row for the parent_set_id assertion below.
  const sessionExercises = await page.evaluate(
    ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].readSessionExercisesRaw(sessionId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId: seeded.sessionId },
  );
  const sessionExerciseId = [...sessionExercises].sort((a, b) => a.order_index - b.order_index)[0]!.id;

  await completeFirstSet(page);

  // Tap the completed parent's own set-number ("Set 1 type", D-23 display numbering) to open the
  // D-01 picker, then choose Drop Set — resolveSetTypeSelection's insert-child branch (childCount
  // 0) writes a real, blank child row beneath the still-`normal` parent (D-07: the parent is never
  // retyped by a drop selection).
  await page.getByRole('button', { name: 'Set 1 type' }).click();
  await page.getByRole('button', { name: 'Drop Set' }).click();

  // Row order after insertion is parent-then-children (07-01's tree-flatten): [parent(completed),
  // child(blank), the exercise's own next trailing draft]. The child is the SECOND "Weight, set
  // field" — the first is the now-completed parent's own field, still rendered and still editable.
  const childWeightField = page.getByRole('button', { name: 'Weight, set field' }).nth(1);
  await expect(childWeightField).toBeVisible();
  await childWeightField.click();
  await page.getByRole('button', { name: '6', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();
  await page.getByRole('button', { name: 'Next field' }).click();
  const childRepsField = page.getByRole('button', { name: 'Reps, set field' }).nth(1);
  await childRepsField.click();
  await page.getByRole('button', { name: '8', exact: true }).click();
  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  // The child is the first (only) INCOMPLETE row at this point that is not the exercise's own
  // trailing draft, in DOM order — completing it does not touch the still-blank draft behind it.
  await page.getByRole('button', { name: 'Mark set complete' }).first().click();

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

  // Both rows are still present, still completed, and still rendered — the child's blank
  // set-number column (its own set-number Pressable carries no digit, per D-06/CF-04) proves it
  // still renders as a child, not a promoted standalone set.
  await expect(page.getByRole('button', { name: 'Mark set incomplete' })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Sub-entry type' })).toBeVisible();

  // The database-level proof, not rendered text alone: the child's own parent_set_id names the
  // parent's real id, and both rows survived the close/reopen with their set_type intact.
  const rows = await page.evaluate(
    ({ globalKey, sessionExerciseId }) =>
      (window as unknown as HarnessWindow)[globalKey].readLoggedSetsWithGrouping(sessionExerciseId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionExerciseId },
  );

  expect(rows).toHaveLength(2);
  const parent = rows.find((row) => row.parent_set_id === null);
  const child = rows.find((row) => row.parent_set_id !== null);
  expect(parent).toBeDefined();
  expect(child).toBeDefined();
  expect(parent!.set_type).toBe('normal');
  expect(child!.set_type).toBe('drop');
  expect(child!.parent_set_id).toBe(parent!.id);
});

test('a per-side pair counts as one set toward the exercise\'s own prescription', async ({ page }) => {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');

  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].open(), DURABILITY_HARNESS_GLOBAL);
  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(),
    DURABILITY_HARNESS_GLOBAL,
  );

  // Both seeded exercises start at 0/3 — the pre-toggle baseline this case's own fraction
  // assertion compares against.
  await expect(page.getByRole('button', { name: 'Unknown exercise, 0/3' })).toHaveCount(2);

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Log Left/Right Separately' }).click();

  await completeFirstSet(page);

  // D-20: the automatic right-side child appears with no second tap — a plain checkmark press is
  // the entire interaction; the badge glyph for `side: 'right'` (badgeGlyphFor's side-wins rule)
  // is the accessible signal a real user (and this spec) sees.
  await expect(page.locator('[aria-label="Right side"]')).toBeVisible();
  await expect(page.locator('[aria-label="Left side"]')).toBeVisible();

  // D-10's counting rule: the child never increments the set count — exactly one of the two
  // seeded exercises advances from 0/3 to 1/3, and the other exercise's chip is untouched.
  await expect(page.getByRole('button', { name: 'Unknown exercise, 1/3' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Unknown exercise, 0/3' })).toHaveCount(1);
});

test('a superset suppresses rest until the final member, and resumes it on the survivor after detach', async ({
  page,
}) => {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');

  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].open(), DURABILITY_HARNESS_GLOBAL);
  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedSupersetPair(),
    DURABILITY_HARNESS_GLOBAL,
  );

  // D-11: pairs the currently-shown (lower orderIndex) exercise with the next live adjacent one.
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Superset with Unknown exercise' }).click();

  // The D-12 partner pill confirms the pairing landed before this case relies on D-13's suppression.
  await expect(page.getByRole('button', { name: 'Superset with Unknown exercise' })).toBeVisible();

  // D-13: completing a set on the NON-FINAL (lower orderIndex) member schedules no rest. D-14's
  // member-advance may already have jumped the pager to the final member by the time this
  // resolves (completeDraftAllowingMemberAdvance does not assert this row's own post-click state
  // for exactly that reason) — the Rest bar is session-level, so this assertion is correct
  // regardless of which exercise page is now showing.
  await completeDraftAllowingMemberAdvance(page);
  await expect(page.getByRole('button', { name: /^Rest, /, exact: false })).not.toBeVisible();

  // Land on the FINAL (higher orderIndex) member — D-14 auto-advance already put the pager there;
  // this chip click is an idempotent safety net matching SupersetPartnerChip's own jump target,
  // not a load-bearing navigation this case depends on.
  await page.getByRole('button', { name: 'Unknown exercise, 0/3' }).click();
  await completeDraftAllowingMemberAdvance(page);

  // D-13: the FINAL member's completion is exactly like an ungrouped exercise's own — rest starts.
  await expect(page.getByRole('button', { name: /^Rest, /, exact: false })).toBeVisible();

  // Clear the outstanding rest through the real Skip Rest write (rest-timer.spec.ts's own
  // precedent) so the detach case below starts from a clean, unambiguous "no rest" baseline rather
  // than relying on a UI state this test did not itself just produce.
  await page.getByRole('button', { name: /^Rest, /, exact: false }).click();
  await page.getByRole('button', { name: 'Skip Rest' }).click();
  await expect(page.getByRole('button', { name: 'Back to Workout' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Workout' }).click();

  // Detach from the final member's own action sheet — D-24: the survivor's own supersetGroupId is
  // untouched by clearing the OTHER row's column, so isFinalGroupMember resolves the survivor
  // (still carrying the original groupId, now alone in it) as an ungrouped exercise again.
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Detach from Unknown exercise' }).click();

  // Back to the first member and its own next set — rest starts again exactly as an ungrouped
  // exercise's own completion would, proving detach is not merely cosmetic. Both exercises now
  // read "1/3" (each completed exactly one working set above), so `.first()` — the strip's own
  // stable order_index ordering, the same ordering formSuperset itself paired by — is what
  // disambiguates the lower-orderIndex (first) member from the final one.
  await page.getByRole('button', { name: 'Unknown exercise, 1/3' }).first().click();
  await completeNextWorkingSet(page);
  await expect(page.getByRole('button', { name: /^Rest, /, exact: false })).toBeVisible();
});
