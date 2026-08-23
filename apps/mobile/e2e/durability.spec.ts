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

interface PreviousSetReference {
  weightKg: string | null;
  reps: number;
  sessionId: string;
  loggedAt: string;
}

interface DurabilityHarness {
  open(): Promise<void>;
  openWithFilename(dbFilename: string): Promise<void>;
  close(): Promise<void>;
  reopen(): Promise<boolean>;
  startSession(input: { now?: Date }): Promise<string>;
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
  previousSetReference(input: {
    exerciseId: string;
    setIndex: number;
    beforeSessionId: string;
    userId: string | null;
  }): Promise<PreviousSetReference | null>;
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

// D-16's tie-break through the real browser database: two completed PRIOR sessions log the same
// exercise at set_index 1 with different started_at, then a third (still-open) session opens —
// previousSetReference must resolve the LATER prior session's numbers, not the older one's, and
// that resolution must survive a real page reload (openWithFilename's fixed-filename requirement,
// same as workout-screen.spec.ts's reload case — the default open()'s random filename would not
// still exist after a real reload wipes every module-level JS variable).
test('previousSetReference resolves the later of two prior sessions and survives a reload', async ({
  page,
}) => {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');

  const dbFilename = `durability-reference-${Date.now()}.db`;

  await page.evaluate(
    ({ globalKey, dbFilename }) =>
      (window as unknown as HarnessWindow)[globalKey].openWithFilename(dbFilename),
    { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
  );

  const currentSessionId = await page.evaluate(async (globalKey) => {
    const harness = (window as unknown as HarnessWindow)[globalKey];

    const olderSessionId = await harness.startSession({ now: new Date('2026-08-01T10:00:00.000Z') });
    const olderExerciseId = await harness.addSessionExercise({
      sessionId: olderSessionId,
      exerciseId: 'ex-durability-1',
      orderIndex: 0,
    });
    await harness.logSet({ sessionExerciseId: olderExerciseId, weight: { value: '90', unit: 'kg' }, reps: 8 });

    const newerSessionId = await harness.startSession({ now: new Date('2026-08-10T10:00:00.000Z') });
    const newerExerciseId = await harness.addSessionExercise({
      sessionId: newerSessionId,
      exerciseId: 'ex-durability-1',
      orderIndex: 0,
    });
    await harness.logSet({ sessionExerciseId: newerExerciseId, weight: { value: '95', unit: 'kg' }, reps: 6 });

    return harness.startSession({});
  }, DURABILITY_HARNESS_GLOBAL);

  const beforeReload = await page.evaluate(
    ({ globalKey, currentSessionId }) =>
      (window as unknown as HarnessWindow)[globalKey].previousSetReference({
        exerciseId: 'ex-durability-1',
        setIndex: 1,
        beforeSessionId: currentSessionId,
        userId: 'harness-user',
      }),
    { globalKey: DURABILITY_HARNESS_GLOBAL, currentSessionId },
  );

  expect(beforeReload).toMatchObject({ weightKg: '95.000', reps: 6 });

  await page.reload();
  await page.waitForSelector('[data-testid="durability-harness-ready"]');

  await page.evaluate(
    ({ globalKey, dbFilename }) =>
      (window as unknown as HarnessWindow)[globalKey].openWithFilename(dbFilename),
    { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
  );

  const afterReload = await page.evaluate(
    ({ globalKey, currentSessionId }) =>
      (window as unknown as HarnessWindow)[globalKey].previousSetReference({
        exerciseId: 'ex-durability-1',
        setIndex: 1,
        beforeSessionId: currentSessionId,
        userId: 'harness-user',
      }),
    { globalKey: DURABILITY_HARNESS_GLOBAL, currentSessionId },
  );

  expect(afterReload).toEqual(beforeReload);
});
