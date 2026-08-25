import { expect, test } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/test-support';

interface RawWorkoutSession {
  id: string;
  name: string | null;
  started_at: string;
  paused_at: string | null;
  accumulated_paused_seconds: number;
  status: string;
  timezone: string;
  local_date: string;
}

interface HistorySessionRow {
  id: string;
  startedAt: string;
  localDate: string;
}

interface HistoryPage {
  rows: HistorySessionRow[];
  nextCursor: { startedAt: string; id: string } | null;
}

interface SessionEditHarness {
  openWithFilename(dbFilename: string): Promise<void>;
  startSession(input: { now?: Date }): Promise<string>;
  addSessionExercise(input: { sessionId: string; exerciseId: string; orderIndex: number }): Promise<string>;
  logSet(input: {
    sessionExerciseId: string;
    weight: { value: string | null; unit: 'kg' | 'lb' };
    reps: number;
    completed?: boolean;
  }): Promise<string>;
  completeSession(input: { sessionId: string; now?: string }): Promise<void>;
  openEditWorkoutScreen(sessionId: string): Promise<void>;
  setSessionDate(input: { sessionId: string; date: string; timezone: string }): Promise<void>;
  startBackfilledSession(input: { date: string; timezone: string; exerciseIds: string[] }): Promise<string>;
  readSessionRaw(sessionId: string): Promise<RawWorkoutSession | null>;
  loadHistoryPage(input: { userId: string | null; limit: number }): Promise<HistoryPage>;
  resolveNextUpKind(userId: string): Promise<string>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it carries no outer closures, matching every other e2e spec in this directory.
type HarnessWindow = Record<string, SessionEditHarness>;

const HARNESS_USER_ID = 'session-edit-harness-user';

// Real @powersync/web database, real browser, the real EditingWorkoutScreenView mounted through
// openEditWorkoutScreen — the exact component workout.tsx renders when a sessionId route param
// resolves to `editing` (05-10). Every write below reaches the same production
// logSet/updateLoggedSet/setSessionDate paths a real correction session uses (D-01).
test.describe('session-edit — a past workout opens, corrects, and backdates through the editing screen (LOG-20/LOG-21)', () => {
  test('editing a completed session shows no live-session chrome, persists a keypad edit, and moves the History row on a date change', async ({ page }) => {
    const dbFilename = `fitness-session-edit-${Date.now()}.db`;

    await page.goto('/__durability');
    await page.waitForSelector('[data-testid="durability-harness-ready"]');
    await page.evaluate(
      ({ globalKey, dbFilename: name }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(name),
      { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
    );

    const { sessionId } = await page.evaluate(async (globalKey) => {
      const harness = (window as unknown as HarnessWindow)[globalKey];
      const sessionId = await harness.startSession({ now: new Date('2026-08-01T10:00:00.000Z') });
      const sessionExerciseId = await harness.addSessionExercise({ sessionId, exerciseId: 'ex-edit-1', orderIndex: 0 });
      await harness.logSet({ sessionExerciseId, weight: { value: '100', unit: 'kg' }, reps: 5, completed: true });
      await harness.completeSession({ sessionId, now: '2026-08-01T11:00:00.000Z' });
      return { sessionId };
    }, DURABILITY_HARNESS_GLOBAL);

    // Case 1: opening a completed session through the same route History's Edit action navigates
    // to (05-10 Task 3) shows the editing header and NO rest-timer readout anywhere in the DOM.
    await page.evaluate(
      ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].openEditWorkoutScreen(sessionId),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId },
    );

    await expect(page.getByText(/^Editing /)).toBeVisible();
    await expect(page.getByText('Workout', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Rest', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Finish Workout' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Change session date' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();

    // Case 2: change the logged set's weight through the in-app keypad, then reload and re-open
    // the same session through the harness — the new value is durable (D-01), not merely in-memory.
    // The existing row's weight field opens pre-populated with its current value (applyKeypadPress
    // appends, per NumericKeypad.tsx — it does not clear on focus), so backspace it away first.
    const weightField = page.getByRole('button', { name: 'Weight, set field' }).first();
    await weightField.click();
    for (let i = 0; i < 10; i += 1) {
      await page.getByRole('button', { name: 'Backspace' }).click();
    }
    await page.getByRole('button', { name: '9', exact: true }).click();
    await page.getByRole('button', { name: '9', exact: true }).click();
    // Weight submits to the reps field next (D-18) — reps/rir are already populated on this
    // existing row, so a bare "Next field" tap (untouched) must not overwrite them with blanks.
    await page.getByRole('button', { name: 'Next field' }).click();
    await page.getByRole('button', { name: 'Next field' }).click();
    await page.getByRole('button', { name: 'Done' }).click();

    await page.reload();
    await page.waitForSelector('[data-testid="durability-harness-ready"]');
    await page.evaluate(
      ({ globalKey, dbFilename: name }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(name),
      { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
    );
    await page.evaluate(
      ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].openEditWorkoutScreen(sessionId),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId },
    );
    await expect(page.getByRole('button', { name: 'Weight, set field' })).toContainText('99');

    // Case 3: change the session's date through SessionDateField — started_at, timezone and
    // local_date all move together (Task 1's single-write invariant), and the row's position in
    // History changes accordingly.
    const beforeChange = await page.evaluate(
      ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].readSessionRaw(sessionId),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId },
    );
    expect(beforeChange?.local_date).toBe('2026-08-01');

    await page.evaluate(
      ({ globalKey, sessionId }) =>
        (window as unknown as HarnessWindow)[globalKey].setSessionDate({ sessionId, date: '2026-08-20T10:00:00.000Z', timezone: 'UTC' }),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId },
    );

    const afterChange = await page.evaluate(
      ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].readSessionRaw(sessionId),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId },
    );
    expect(afterChange?.local_date).toBe('2026-08-20');
    expect(afterChange?.timezone).toBe('UTC');
    expect(afterChange?.started_at).toBe(new Date('2026-08-20T10:00:00.000Z').toISOString());
    expect(afterChange?.started_at).not.toBe(beforeChange?.started_at);

    const historyAfterChange = await page.evaluate(
      ({ globalKey, userId }) => (window as unknown as HarnessWindow)[globalKey].loadHistoryPage({ userId, limit: 25 }),
      { globalKey: DURABILITY_HARNESS_GLOBAL, userId: HARNESS_USER_ID },
    );
    expect(historyAfterChange.rows[0]?.id).toBe(sessionId);
    expect(historyAfterChange.rows[0]?.localDate).toBe('2026-08-20');
  });

  test('adding a past workout lands the session on the chosen day, and rotation self-heals with no cursor to repair', async ({ page }) => {
    const dbFilename = `fitness-session-edit-backfill-${Date.now()}.db`;

    await page.goto('/__durability');
    await page.waitForSelector('[data-testid="durability-harness-ready"]');
    await page.evaluate(
      ({ globalKey, dbFilename: name }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(name),
      { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
    );

    // Case 4: the add-a-past-workout entry point (history.tsx's startBackfilledSession, D-33's
    // third funnel entry) with a date two weeks ago — the resulting session's local_date is the
    // chosen day, never today's device-local day.
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const sessionId = await page.evaluate(
      ({ globalKey, date }) =>
        (window as unknown as HarnessWindow)[globalKey].startBackfilledSession({
          date,
          timezone: 'UTC',
          exerciseIds: ['ex-backfill-1'],
        }),
      { globalKey: DURABILITY_HARNESS_GLOBAL, date: twoWeeksAgo },
    );

    const backfilled = await page.evaluate(
      ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].readSessionRaw(sessionId),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId },
    );
    const todayLocalDate = new Date().toISOString().slice(0, 10);
    expect(backfilled?.local_date).toBe(twoWeeksAgo.slice(0, 10));
    expect(backfilled?.local_date).not.toBe(todayLocalDate);
    expect(backfilled?.status).toBe('completed');

    // Log a set on the backfilled session through the real editing screen — the exercise added by
    // startBackfilledSession is reachable and writable exactly like any other editing-mode row. This
    // is the trailing DRAFT row (a fresh, one-off exercise carries no target and no prior sets), so
    // both weight and reps start blank — reps must hold a real value before the checkmark commits
    // the draft (LOG-07), matching the same weight -> reps -> rir walk workout-screen.spec.ts uses.
    await page.evaluate(
      ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].openEditWorkoutScreen(sessionId),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId },
    );
    const weightField = page.getByRole('button', { name: 'Weight, set field' });
    await weightField.click();
    await page.getByRole('button', { name: '6', exact: true }).click();
    await page.getByRole('button', { name: '0', exact: true }).click();
    await page.getByRole('button', { name: 'Next field' }).click();
    await page.getByRole('button', { name: '5', exact: true }).click();
    await page.getByRole('button', { name: 'Next field' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    const checkmark = page.getByRole('button', { name: 'Mark set complete' });
    await checkmark.click();
    await expect(page.getByRole('button', { name: 'Mark set incomplete' })).toBeVisible();

    // Case 5: rotation self-heals from local_date with no cursor to repair (Phase 4 D-20) — the
    // same resolveNextUp call the Workout tab's own read path makes still returns a coherent kind
    // after this out-of-order backfill, rather than throwing or returning a stale/duplicated slot.
    const nextUpKind = await page.evaluate(
      ({ globalKey, userId }) => (window as unknown as HarnessWindow)[globalKey].resolveNextUpKind(userId),
      { globalKey: DURABILITY_HARNESS_GLOBAL, userId: HARNESS_USER_ID },
    );
    expect(['no-active-program', 'no-days', 'workout', 'time-off', 'program-complete']).toContain(nextUpKind);
  });
});
