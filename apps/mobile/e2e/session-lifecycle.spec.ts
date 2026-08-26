import { expect, test } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

interface RawWorkoutSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  paused_at: string | null;
  accumulated_paused_seconds: number;
  status: string;
}

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

interface SessionLifecycleHarness {
  openWithFilename(dbFilename: string): Promise<void>;
  seedWorkoutSession(): Promise<SeededProgrammedSession>;
  readSessionRaw(sessionId: string): Promise<RawWorkoutSession | null>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it does not carry outer closures (same constraint every other e2e spec in this directory
// documents), so every callback below re-declares this cast inline.
type HarnessWindow = Record<string, SessionLifecycleHarness>;

// Real @powersync/web database, real browser, the real WorkoutScreenView driven through pause,
// resume, finish and discard — every write below is a DOM click reaching the same production
// session-lifecycle.ts helpers a real gym session uses (D-01, D-29).
test.describe('session lifecycle — pause, resume, finish, discard', () => {
  test('pausing freezes the header duration readout and resuming restarts it without losing time', async ({ page }) => {
    const dbFilename = `fitness-session-lifecycle-${Date.now()}.db`;

    await page.goto('/__durability');
    await page.waitForSelector('[data-testid="durability-harness-ready"]');
    await page.evaluate(
      ({ globalKey, dbFilename: name }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(name),
      { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
    );
    const seeded = await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(),
      DURABILITY_HARNESS_GLOBAL,
    );

    await page.getByRole('button', { name: 'Session menu' }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();

    // The header's left column reads "Paused" with a frozen, muted readout (05-UI-SPEC Header
    // Timer Bar's paused state) — driven purely by workout_session.paused_at, no separate flag.
    await expect(page.getByText('Paused', { exact: true })).toBeVisible();

    const paused = await page.evaluate(
      ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].readSessionRaw(sessionId),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId: seeded.sessionId },
    );
    expect(paused?.status).toBe('paused');
    expect(paused?.paused_at).not.toBeNull();

    // resumeSession rounds the closed pause's duration to the nearest whole second
    // (Math.round, session-lifecycle.ts) against real Date.now() — this file installs no fake
    // clock, so without a genuine real-time gap here the pause-to-resume interval can round down
    // to 0 and the accumulated_paused_seconds > 0 assertion below would fail on a fast run.
    await page.waitForTimeout(1100);

    await page.getByRole('button', { name: 'Session menu' }).click();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();

    await expect(page.getByText('Workout', { exact: true })).toBeVisible();

    const resumed = await page.evaluate(
      ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].readSessionRaw(sessionId),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId: seeded.sessionId },
    );
    expect(resumed?.status).toBe('in_progress');
    expect(resumed?.paused_at).toBeNull();
    // resumeSession folds the closed pause's own duration into accumulated_paused_seconds — it
    // must have grown from the pre-pause value of 0.
    expect(resumed?.accumulated_paused_seconds).toBeGreaterThan(0);
  });

  test('finishing the workout stamps ended_at and the completed status', async ({ page }) => {
    const dbFilename = `fitness-session-lifecycle-finish-${Date.now()}.db`;

    await page.goto('/__durability');
    await page.waitForSelector('[data-testid="durability-harness-ready"]');
    await page.evaluate(
      ({ globalKey, dbFilename: name }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(name),
      { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
    );
    const seeded = await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(),
      DURABILITY_HARNESS_GLOBAL,
    );

    await page.getByRole('button', { name: 'Finish Workout' }).click();

    // finishSession (lib/session/finish-session.ts) awaits completeSession's write BEFORE
    // router.push — but click() itself resolves once the event dispatches, not once that async
    // chain settles. Waiting for the resulting navigation is what proves the write actually landed
    // before reading it back; without this, readSessionRaw can race the still-in-flight write and
    // observe the pre-completion row.
    await expect(page).toHaveURL(new RegExp(`/workout-summary\\?sessionId=${seeded.sessionId}`));

    const finished = await page.evaluate(
      ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].readSessionRaw(sessionId),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId: seeded.sessionId },
    );
    expect(finished?.status).toBe('completed');
    expect(finished?.ended_at).not.toBeNull();
  });

  test('discard requires the confirmation before writing — cancelling leaves the session untouched', async ({ page }) => {
    const dbFilename = `fitness-session-lifecycle-discard-cancel-${Date.now()}.db`;

    await page.goto('/__durability');
    await page.waitForSelector('[data-testid="durability-harness-ready"]');
    await page.evaluate(
      ({ globalKey, dbFilename: name }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(name),
      { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
    );
    const seeded = await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(),
      DURABILITY_HARNESS_GLOBAL,
    );

    await page.getByRole('button', { name: 'Session menu' }).click();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();

    await expect(page.getByText('Discard Workout', { exact: true })).toBeVisible();
    await expect(
      page.getByText("This workout and everything logged in it will be deleted. This can't be undone. Discard anyway?"),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();

    const untouched = await page.evaluate(
      ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].readSessionRaw(sessionId),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId: seeded.sessionId },
    );
    expect(untouched?.status).toBe('in_progress');
  });

  test('confirming discard writes the discarded status', async ({ page }) => {
    const dbFilename = `fitness-session-lifecycle-discard-confirm-${Date.now()}.db`;

    await page.goto('/__durability');
    await page.waitForSelector('[data-testid="durability-harness-ready"]');
    await page.evaluate(
      ({ globalKey, dbFilename: name }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(name),
      { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
    );
    const seeded = await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(),
      DURABILITY_HARNESS_GLOBAL,
    );

    await page.getByRole('button', { name: 'Session menu' }).click();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();

    const discarded = await page.evaluate(
      ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].readSessionRaw(sessionId),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId: seeded.sessionId },
    );
    expect(discarded?.status).toBe('discarded');
  });
});
