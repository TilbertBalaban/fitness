import { expect, test } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/test-support';

interface LoggedSetRow {
  id: string;
  sessionExerciseId: string;
  setIndex: number;
  setType: string;
  weightKg: string | null;
  reps: number;
  rir: number | null;
  side: string | null;
  completed: boolean;
  parentSetId: string | null;
  restTakenSeconds: number | null;
  loggedAt: string;
}

interface DurabilityHarness {
  open(): Promise<void>;
  close(): Promise<void>;
  reopen(): Promise<boolean>;
  startSession(input: Record<string, never>): Promise<string>;
  addSessionExercise(input: {
    sessionId: string;
    exerciseId: string;
    orderIndex: number;
  }): Promise<string>;
  logSet(input: {
    sessionExerciseId: string;
    weight: { value: string | null; unit: 'kg' | 'lb' };
    reps: number;
  }): Promise<string>;
  readSets(sessionExerciseId: string): Promise<LoggedSetRow[]>;
  crudCount(): Promise<number>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it does not carry outer closures. Every callback below re-declares this lookup inline
// rather than calling a shared helper, which is why the same three-line cast is repeated.
type HarnessWindow = Record<string, DurabilityHarness>;

// Real @powersync/web database, real browser, real write helpers — see WINDOWS.md #22 for why
// this cannot run under Jest/Node instead. No finish, flush, disconnect, waitForFirstSync or
// connect call appears anywhere between the logSet call below and the close call: the claim under
// test is that the write is durable the instant it is logged.
test('a set logged through logSet survives a close and reopen with no finish or sync step', async ({
  page,
}) => {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');

  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].open(),
    DURABILITY_HARNESS_GLOBAL,
  );

  const sessionExerciseId = await page.evaluate(async (globalKey) => {
    const harness = (window as unknown as HarnessWindow)[globalKey];
    const sessionId = await harness.startSession({});
    return harness.addSessionExercise({
      sessionId,
      exerciseId: 'ex-durability-1',
      orderIndex: 0,
    });
  }, DURABILITY_HARNESS_GLOBAL);

  await page.evaluate(
    ({ globalKey, sessionExerciseId }) =>
      (window as unknown as HarnessWindow)[globalKey].logSet({
        sessionExerciseId,
        weight: { value: '102.5', unit: 'kg' },
        reps: 5,
      }),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionExerciseId },
  );

  const beforeClose = await page.evaluate(
    ({ globalKey, sessionExerciseId }) =>
      (window as unknown as HarnessWindow)[globalKey].readSets(sessionExerciseId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionExerciseId },
  );

  expect(beforeClose).toHaveLength(1);
  expect(beforeClose[0].weightKg).toBe('102.500');
  expect(beforeClose[0].reps).toBe(5);
  expect(beforeClose[0].setIndex).toBe(1);

  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].close(),
    DURABILITY_HARNESS_GLOBAL,
  );

  const reopenedIsDistinctInstance = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].reopen(),
    DURABILITY_HARNESS_GLOBAL,
  );
  expect(reopenedIsDistinctInstance).toBe(true);

  const afterReopen = await page.evaluate(
    ({ globalKey, sessionExerciseId }) =>
      (window as unknown as HarnessWindow)[globalKey].readSets(sessionExerciseId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionExerciseId },
  );

  expect(afterReopen).toEqual(beforeClose);
});
