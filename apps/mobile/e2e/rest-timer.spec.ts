import { expect, test } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

// Written against the durability Playwright project's real browser + real @powersync/web
// database, following workout-screen.spec.ts's harness-driving shape. NOT executed this
// session — CLAUDE.md forbids launching a browser unless explicitly requested; see the
// `.planning/WINDOWS.md` unrun-verify entry filed alongside this file for the exact gap.

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
  seedWorkoutSession(): Promise<SeededProgrammedSession>;
  openWorkoutScreen(): Promise<void>;
  useProductionDb(): Promise<void>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it does not carry outer closures, matching durability.spec.ts's documented constraint.
type HarnessWindow = Record<string, WorkoutHarness>;

interface StubbedNotificationCall {
  title: string;
  body: string | undefined;
  atMs: number;
}

declare global {
  interface Window {
    __restTimerNotificationCalls?: StubbedNotificationCall[];
  }
}

// Stubs the global Notification constructor before any app code loads, so rest-alert.web.ts's
// `new Notification(...)` call is observable without a real OS notification permission surface —
// matches the plan's "stub the global Notification constructor in an init script" instruction.
// Runs as a Playwright init script, so it never closes over anything outside its own body — the
// permission value arrives as the one plain-string argument addInitScript serializes across.
function installNotificationStub(initialPermission: string) {
  window.__restTimerNotificationCalls = [];
  class StubNotification {
    static permission = initialPermission as NotificationPermission;
    static requestPermission(): Promise<NotificationPermission> {
      return Promise.resolve(StubNotification.permission);
    }
    constructor(title: string, options?: NotificationOptions) {
      window.__restTimerNotificationCalls!.push({ title, body: options?.body, atMs: Date.now() });
    }
  }
  // @ts-expect-error -- test-only global stub, not the real lib.dom Notification constructor
  window.Notification = StubNotification;
}

// Reused set-completion flow from workout-screen.spec.ts: weight -> reps -> rir -> checkmark,
// reps/rir already prefilled from the session_exercise snapshot so only weight's digits are typed.
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

test.describe('rest timer — permission granted', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.grantPermissions(['notifications'], { origin: 'http://localhost:8081' });
    await page.addInitScript(installNotificationStub, 'granted');
    await page.clock.install();
  });

  test('completing a set schedules a browser notification at the stored wall-clock target', async ({ page }) => {
    await page.goto('/__durability');
    await page.waitForSelector('[data-testid="durability-harness-ready"]');

    await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].useProductionDb(), DURABILITY_HARNESS_GLOBAL);
    await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(), DURABILITY_HARNESS_GLOBAL);

    await completeFirstSet(page);

    // First exercise's seeded target_rest_seconds is 120 (test-support.ts's SEEDED_TARGETS[0]).
    const restTargetMs = 120_000;
    await page.clock.fastForward(restTargetMs + 1_000);

    const calls = await page.evaluate(() => window.__restTimerNotificationCalls ?? []);
    expect(calls).toHaveLength(1);
    expect(calls[0].title).toBe('Rest complete');
    expect(calls[0].body).toBe('Time for your next set.');
  });

  test('the countdown recomputes correctly after the page is hidden and shown again', async ({ page }) => {
    await page.goto('/__durability');
    await page.waitForSelector('[data-testid="durability-harness-ready"]');
    await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].useProductionDb(), DURABILITY_HARNESS_GLOBAL);
    await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(), DURABILITY_HARNESS_GLOBAL);

    await completeFirstSet(page);

    // Simulate a throttled/hidden tab: rest-alert.web.ts's visibilitychange listener re-arms its
    // setTimeout against the stored wall-clock target rather than trusting a running timer.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(90_000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await expect(page.getByRole('button', { name: /^Rest, /, exact: false })).toContainText(/0:2\d|0:3\d/);
  });

  test('+30s moves the stored target and Skip Rest clears it', async ({ page }) => {
    await page.goto('/__durability');
    await page.waitForSelector('[data-testid="durability-harness-ready"]');
    await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].useProductionDb(), DURABILITY_HARNESS_GLOBAL);
    const seeded = await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(),
      DURABILITY_HARNESS_GLOBAL,
    );

    await completeFirstSet(page);

    await page.getByRole('button', { name: /^Rest, /, exact: false }).click();
    await expect(page).toHaveURL(new RegExp(`/rest-timer\\?sessionId=${seeded.sessionId}`));

    await page.getByRole('button', { name: 'Add 30 seconds to the rest timer' }).click();

    // +30s reschedules the alert against the new target — the stub records a second constructed
    // Notification at the extended time, not a duplicate of the original one.
    await page.clock.fastForward(150_000 + 1_000);
    const afterExtend = await page.evaluate(() => window.__restTimerNotificationCalls ?? []);
    expect(afterExtend).toHaveLength(1);

    await page.getByRole('button', { name: 'Dismiss' }).click();
    await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].openWorkoutScreen(), DURABILITY_HARNESS_GLOBAL);
    await page.getByRole('button', { name: /^Rest, /, exact: false }).click();
    await page.getByRole('button', { name: 'Skip Rest' }).click();
    await expect(page.getByRole('button', { name: 'Back to Workout' })).toBeVisible();
  });

  test('undoing the completed set cancels the pending alert', async ({ page }) => {
    await page.goto('/__durability');
    await page.waitForSelector('[data-testid="durability-harness-ready"]');
    await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].useProductionDb(), DURABILITY_HARNESS_GLOBAL);
    await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(), DURABILITY_HARNESS_GLOBAL);

    await completeFirstSet(page);
    await page.getByRole('button', { name: 'Mark set incomplete' }).click();

    await page.clock.fastForward(150_000);
    const calls = await page.evaluate(() => window.__restTimerNotificationCalls ?? []);
    expect(calls).toHaveLength(0);
    await expect(page.getByRole('button', { name: /^Rest, /, exact: false })).not.toBeVisible();
  });
});

test.describe('rest timer — permission denied', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(installNotificationStub, 'denied');
    await page.clock.install();
  });

  test('the degraded-state note renders and the countdown still runs while the app is open', async ({ page }) => {
    await page.goto('/__durability');
    await page.waitForSelector('[data-testid="durability-harness-ready"]');
    await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].useProductionDb(), DURABILITY_HARNESS_GLOBAL);
    await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(), DURABILITY_HARNESS_GLOBAL);

    await expect(
      page.getByText('Background alerts are off — your rest timer will still count down and sound/vibrate while the app is open.'),
    ).toBeVisible();

    await completeFirstSet(page);

    await page.clock.fastForward(30_000);
    const restReadout = page.getByRole('button', { name: /^Rest, /, exact: false });
    await expect(restReadout).toContainText(/1:2\d|1:3\d/);

    const calls = await page.evaluate(() => window.__restTimerNotificationCalls ?? []);
    expect(calls).toHaveLength(0);
  });
});
