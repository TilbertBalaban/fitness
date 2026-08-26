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

interface PersonalRecordRow {
  id: string;
  exerciseId: string;
  prType: string;
  value: string;
  loggedSetId: string | null;
  achievedAt: string;
}

interface WorkoutSummaryHarness {
  useProductionDb(): Promise<void>;
  seedWorkoutSession(): Promise<SeededProgrammedSession>;
  seedPriorHeaviestSet(input: { exerciseId: string; weightKg: string; reps: number }): Promise<void>;
  readSessionPersonalRecords(sessionId: string): Promise<PersonalRecordRow[]>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it does not carry outer closures (same constraint every other e2e spec in this directory
// documents), so every callback below re-declares this cast inline.
type HarnessWindow = Record<string, WorkoutSummaryHarness>;

// Real @powersync/web database, real browser, the real WorkoutScreenView -> finishSession ->
// WorkoutSummaryScreen route chain (D-32, LOG-19) — useProductionDb() is required, not
// openWithFilename(), because /workout-summary's own route (app/workout-summary.tsx) calls
// getPowerSync() directly with no injectable db param (unlike useWorkoutScreen's {userId, db}):
// only routing every harness write AND the real route's own reads onto the SAME production
// singleton makes the summary see what this test seeded and logged.
//
// WRITTEN BUT NOT EXECUTED per this project's browser-testing-only-on-request rule (CLAUDE.md) —
// recorded in .planning/WINDOWS.md as an unrun-verify ledger entry.
test('finishing a workout with a new PR shows the badge, and correcting the set below the prior best removes it', async ({ page }) => {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');

  // Routes seedWorkoutSession/seedPriorHeaviestSet and the real /workout-summary route's own
  // getPowerSync() reads onto the same production database (see e2e/workout-screen.spec.ts's own
  // "adding an exercise" case for the precedent this reuses).
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].useProductionDb(), DURABILITY_HARNESS_GLOBAL);

  // A real prior PR to beat: without this, the session's own first-ever set at ex-workout-harness-1
  // would itself be a (vacuous) "first ever" PR, and this test would prove nothing about beating
  // real history (personal-record.ts's own "prior best" semantics).
  await page.evaluate(
    ({ globalKey, exerciseId, weightKg, reps }) =>
      (window as unknown as HarnessWindow)[globalKey].seedPriorHeaviestSet({ exerciseId, weightKg, reps }),
    { globalKey: DURABILITY_HARNESS_GLOBAL, exerciseId: 'ex-workout-harness-1', weightKg: '90.000', reps: 5 },
  );

  const seeded = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(),
    DURABILITY_HARNESS_GLOBAL,
  );

  // Logs one 100kg set on the first exercise only (ex-workout-harness-1) — the same DOM-driven
  // keypad walk e2e/workout-screen.spec.ts already proves against the real write path (D-01), kept
  // to one exercise so the summary's single breakdown row and its "Edit Unknown exercise" button
  // stay unambiguous (both seeded exercises resolve to the same "Unknown exercise" fallback name,
  // session-query.ts's loadSessionTree).
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

  await page.getByRole('button', { name: 'Finish Workout' }).click();

  // Real expo-router navigation (finishSession pushes /workout-summary?sessionId=..., D-32) — no
  // harness shortcut mounts this screen; WorkoutSummaryScreen's own useEffect runs
  // detectPrsForSession then loadSessionSummary against the SAME production database.
  await expect(page.getByText('Workout Complete', { exact: true })).toBeVisible();
  // WorkoutSummary.tsx renders one "New PR" badge PER detected PR type (renderPrBadges,
  // WorkoutSummary.test.tsx's own "renders two New PR badges for two detected types" case) — a
  // 100kg x 12 set beating a 90kg x 5 prior best genuinely trips two of the four PR_TYPES at once:
  // heaviest_weight (100 > 90) and best_set_volume (1200 > 450). best_e1rm is null for both sets
  // (reps=12 exceeds E1RM_MAX_VALID_REPS=10) and most_reps_at_weight never fires for an untested
  // weight bucket (detectPrs only counts an exact-weight rebeat) — but two real badges is still
  // more than one, so more than one match here is real, expected UI, not a duplicate render.
  // .first() still proves a PR badge appears.
  await expect(page.getByText('New PR', { exact: true }).first()).toBeVisible();

  // Proves the DURABLE ledger (personal-record.ts's own written rows) actually gained a row — not
  // just that the summary's pure recompute says so (LOG-19's own display/ledger split).
  const recordsAfterFinish = await page.evaluate(
    ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].readSessionPersonalRecords(sessionId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId: seeded.sessionId },
  );
  expect(recordsAfterFinish.filter((record) => record.prType === 'heaviest_weight')).toHaveLength(1);

  // Corrects the set down to 30kg (reps stay at 12, untouched by this walk) — every PR_TYPES
  // dimension must drop below the seeded 90kg x 5 prior best for every badge to genuinely
  // disappear, not just heaviest_weight: 30kg < 90kg (no weight PR); reps=12 exceeds
  // E1RM_MAX_VALID_REPS=10 so best_e1rm is null for both the original 100kg x 12 and this
  // correction (out of play either way); 30kg is an untested weight bucket so most_reps_at_weight
  // never fires (detectPrs only counts an exact-weight rebeat, never an untested weight); and
  // set volume 30 * 12 = 360 is below the prior 90 * 5 = 450 (80kg x 12 = 960 was NOT — that value
  // left a genuine, correctly-surviving best_set_volume badge, which is what this case must not
  // have). The badge must disappear on the very next render, without the row asserted above ever
  // being deleted (D-30/LOG-19's computeSessionPrTypesBySetId doc comment).
  await page.getByRole('button', { name: 'Edit Unknown exercise' }).click();

  const editedWeightField = page.getByRole('button', { name: 'Weight, set field' }).first();
  await expect(editedWeightField).toContainText('100.00');
  await editedWeightField.click();

  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: 'Backspace' }).click();
  }
  await page.getByRole('button', { name: '3', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();

  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByText('New PR', { exact: true })).toHaveCount(0);

  // The original write from before the correction is still there, untouched — this phase never
  // deletes or supersedes a row a prior detection already wrote (Phase 10's own territory).
  const recordsAfterCorrection = await page.evaluate(
    ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].readSessionPersonalRecords(sessionId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId: seeded.sessionId },
  );
  expect(recordsAfterCorrection.filter((record) => record.prType === 'heaviest_weight')).toHaveLength(1);
});
