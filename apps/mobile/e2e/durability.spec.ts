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

interface RawWorkoutSession {
  id: string;
  started_at: string;
  paused_at: string | null;
  accumulated_paused_seconds: number;
  status: string;
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
    setType?: string;
    weight: { value: string | null; unit: 'kg' | 'lb' };
    reps: number;
    completed?: boolean;
    now?: Date;
  }): Promise<string>;
  readSets(sessionExerciseId: string): Promise<LoggedSetRow[]>;
  previousSetReference(input: {
    exerciseId: string;
    setIndex: number;
    beforeSessionId: string;
    userId: string | null;
  }): Promise<PreviousSetReference | null>;
  crudCount(): Promise<number>;
  pauseSession(input: { sessionId: string; now?: string }): Promise<void>;
  resumeSession(input: { sessionId: string; now?: string }): Promise<void>;
  readSessionRaw(sessionId: string): Promise<RawWorkoutSession | null>;
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

// Success criterion 4, harder than the case above: warm-ups, two completed working sets, and an
// OPEN pause all outstanding at once, proven through a real close/reopen. A crash is not a pause
// (D-29) — the open paused_at must still be open after reopen, never converted or cleared, and the
// restored duration must equal the pre-close duration rather than jumping by the closed interval.
test('force-quitting mid-workout with warm-ups logged and a pause open loses nothing on reopen', async ({ page }) => {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');

  const dbFilename = `durability-pause-recovery-${Date.now()}.db`;

  await page.evaluate(
    ({ globalKey, dbFilename }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(dbFilename),
    { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
  );

  const seeded = await page.evaluate(async (globalKey) => {
    const harness = (window as unknown as HarnessWindow)[globalKey];
    const now = new Date('2026-08-24T10:00:00.000Z');
    const sessionId = await harness.startSession({ now });
    const sessionExerciseId = await harness.addSessionExercise({
      sessionId,
      exerciseId: 'ex-durability-recovery',
      orderIndex: 0,
    });

    await harness.logSet({
      sessionExerciseId,
      setType: 'warmup',
      weight: { value: '40', unit: 'kg' },
      reps: 10,
      completed: true,
      now: new Date('2026-08-24T10:01:00.000Z'),
    });
    await harness.logSet({
      sessionExerciseId,
      weight: { value: '100', unit: 'kg' },
      reps: 8,
      completed: true,
      now: new Date('2026-08-24T10:05:00.000Z'),
    });
    await harness.logSet({
      sessionExerciseId,
      weight: { value: '100', unit: 'kg' },
      reps: 7,
      completed: true,
      now: new Date('2026-08-24T10:09:00.000Z'),
    });

    await harness.pauseSession({ sessionId, now: '2026-08-24T10:12:00.000Z' });

    return { sessionId, sessionExerciseId };
  }, DURABILITY_HARNESS_GLOBAL);

  const beforeClose = await page.evaluate(
    ({ globalKey, sessionExerciseId, sessionId }) =>
      Promise.all([
        (window as unknown as HarnessWindow)[globalKey].readSets(sessionExerciseId),
        (window as unknown as HarnessWindow)[globalKey].readSessionRaw(sessionId),
      ]),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionExerciseId: seeded.sessionExerciseId, sessionId: seeded.sessionId },
  );
  const [setsBeforeClose, sessionBeforeClose] = beforeClose;

  expect(setsBeforeClose).toHaveLength(3);
  expect(sessionBeforeClose?.status).toBe('paused');
  expect(sessionBeforeClose?.paused_at).toBe('2026-08-24T10:12:00.000Z');
  expect(sessionBeforeClose?.accumulated_paused_seconds).toBe(0);

  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].close(), DURABILITY_HARNESS_GLOBAL);
  await page.evaluate(
    ({ globalKey, dbFilename }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(dbFilename),
    { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
  );

  const afterReopen = await page.evaluate(
    ({ globalKey, sessionExerciseId, sessionId }) =>
      Promise.all([
        (window as unknown as HarnessWindow)[globalKey].readSets(sessionExerciseId),
        (window as unknown as HarnessWindow)[globalKey].readSessionRaw(sessionId),
      ]),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionExerciseId: seeded.sessionExerciseId, sessionId: seeded.sessionId },
  );
  const [setsAfterReopen, sessionAfterReopen] = afterReopen;

  // Every logged set survives with its values intact, including the warm-up (never converted to a
  // working set, never dropped from the count).
  expect(setsAfterReopen).toEqual(setsBeforeClose);
  expect(setsAfterReopen.filter((row) => row.setType === 'warmup')).toHaveLength(1);

  // The pause is still OPEN, not converted or cleared by the close/reopen — a crash is not a pause.
  expect(sessionAfterReopen).toEqual(sessionBeforeClose);
  expect(sessionAfterReopen?.paused_at).not.toBeNull();

  // The restored duration equals the pre-close duration rather than jumping by the closed
  // interval — elapsedWorkoutSeconds freezes at the open pause's own moment (D-29), so evaluating
  // it against a `now` far past the reopen must still return the same value it held before close.
  const startedAtMs = new Date(sessionBeforeClose!.started_at).getTime();
  const pausedAtMs = new Date(sessionBeforeClose!.paused_at!).getTime();
  const durationBeforeClose = Math.floor((pausedAtMs - startedAtMs) / 1000 - sessionBeforeClose!.accumulated_paused_seconds);
  const durationLongAfterReopen = Math.floor(
    (pausedAtMs - startedAtMs) / 1000 - sessionAfterReopen!.accumulated_paused_seconds,
  );
  expect(durationLongAfterReopen).toBe(durationBeforeClose);
});
