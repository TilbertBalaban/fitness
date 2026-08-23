import { expect, test } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/test-support';

interface DurabilityHarness {
  close(): Promise<void>;
  openVariant(variant: 'v1' | 'v2'): Promise<void>;
  reopenVariant(variant: 'v1' | 'v2'): Promise<boolean>;
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
  readRawColumns(table: string): Promise<string[]>;
  readSetsRaw(sessionExerciseId: string): Promise<Record<string, unknown>[]>;
  readAllSetsRaw(): Promise<Record<string, unknown>[]>;
  crudCount(): Promise<number>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it does not carry outer closures, which is why every callback below re-declares this cast
// inline rather than calling a shared helper (same constraint durability.spec.ts documents).
type HarnessWindow = Record<string, DurabilityHarness>;

async function startExercise(page: import('@playwright/test').Page, exerciseId: string): Promise<string> {
  return page.evaluate(
    async ({ globalKey, exerciseId }) => {
      const harness = (window as unknown as HarnessWindow)[globalKey];
      const sessionId = await harness.startSession({});
      return harness.addSessionExercise({ sessionId, exerciseId, orderIndex: 0 });
    },
    { globalKey: DURABILITY_HARNESS_GLOBAL, exerciseId },
  );
}

// Roadmap criterion 4: a client schema redefinition (one column added, one removed) applied while
// unsynced writes are queued must not eat them. Every case here opens a real @powersync/web
// database in a real browser (WINDOWS.md #22) and never calls connect/finish/flush/waitForFirstSync
// — the crud queue this suite inspects is proven never to have touched a network.
test.describe('client schema redefinition preserves unsynced data', () => {
  test('populated, then redefined: every logged set survives, crud queue depth is unchanged, harness_probe reads null, side disappears', async ({
    page,
  }) => {
    await page.goto('/__durability');
    await page.waitForSelector('[data-testid="durability-harness-ready"]');

    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].openVariant('v1'),
      DURABILITY_HARNESS_GLOBAL,
    );

    const sessionExerciseId = await startExercise(page, 'ex-schema-redef-1');

    const setsToLog = [
      { weight: { value: '100', unit: 'kg' as const }, reps: 8 },
      { weight: { value: '105', unit: 'kg' as const }, reps: 6 },
      { weight: { value: null, unit: 'kg' as const }, reps: 12 },
    ];

    // Logged sequentially, not via Promise.all — logSet's set_index is a read-then-write
    // (max(set_index)+1) with no transaction wrapping the pair, so concurrent calls could race to
    // the same index. Sequential awaits are what guarantee strictly incrementing indices here.
    await page.evaluate(
      async ({ globalKey, sessionExerciseId, setsToLog }) => {
        const harness = (window as unknown as HarnessWindow)[globalKey];
        for (const set of setsToLog) {
          await harness.logSet({ sessionExerciseId, weight: set.weight, reps: set.reps });
        }
      },
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionExerciseId, setsToLog },
    );

    const depthBefore = await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].crudCount(),
      DURABILITY_HARNESS_GLOBAL,
    );
    expect(depthBefore).toBeGreaterThan(0);

    // Never connect, never finish, never flush — the crud queue above must never have touched a
    // network. Close the way a process death would, then reopen against the SAME dbFilename under
    // the redefined (v2) schema.
    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].close(),
      DURABILITY_HARNESS_GLOBAL,
    );

    const reopenedIsDistinctInstance = await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].reopenVariant('v2'),
      DURABILITY_HARNESS_GLOBAL,
    );
    expect(reopenedIsDistinctInstance).toBe(true);

    const columns = await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].readRawColumns('logged_set'),
      DURABILITY_HARNESS_GLOBAL,
    );
    expect(columns).toContain('harness_probe');
    expect(columns).not.toContain('side');

    const rowsAfter = await page.evaluate(
      ({ globalKey, sessionExerciseId }) =>
        (window as unknown as HarnessWindow)[globalKey].readSetsRaw(sessionExerciseId),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionExerciseId },
    );

    expect(rowsAfter).toHaveLength(3);
    expect(rowsAfter[0].weight_kg).toBe('100.000');
    expect(rowsAfter[0].reps).toBe(8);
    expect(rowsAfter[1].weight_kg).toBe('105.000');
    expect(rowsAfter[1].reps).toBe(6);
    expect(rowsAfter[2].weight_kg).toBeNull();
    expect(rowsAfter[2].reps).toBe(12);
    expect(rowsAfter.every((row) => row.harness_probe === null)).toBe(true);
    expect(rowsAfter.every((row) => !('side' in row))).toBe(true);

    const depthAfter = await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].crudCount(),
      DURABILITY_HARNESS_GLOBAL,
    );
    expect(depthAfter).toBe(depthBefore);
  });

  test('ordering survives redefinition: set_index stays sequential with no gap or repeat', async ({ page }) => {
    await page.goto('/__durability');
    await page.waitForSelector('[data-testid="durability-harness-ready"]');

    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].openVariant('v1'),
      DURABILITY_HARNESS_GLOBAL,
    );

    const sessionExerciseId = await startExercise(page, 'ex-ordering-1');
    const repsPerSet = [5, 5, 5, 5, 5];

    await page.evaluate(
      async ({ globalKey, sessionExerciseId, repsPerSet }) => {
        const harness = (window as unknown as HarnessWindow)[globalKey];
        for (const reps of repsPerSet) {
          await harness.logSet({ sessionExerciseId, weight: { value: '50', unit: 'kg' }, reps });
        }
      },
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionExerciseId, repsPerSet },
    );

    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].close(),
      DURABILITY_HARNESS_GLOBAL,
    );
    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].reopenVariant('v2'),
      DURABILITY_HARNESS_GLOBAL,
    );

    const rows = await page.evaluate(
      ({ globalKey, sessionExerciseId }) =>
        (window as unknown as HarnessWindow)[globalKey].readSetsRaw(sessionExerciseId),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionExerciseId },
    );

    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.set_index)).toEqual([1, 2, 3, 4, 5]);
  });

  test('empty database: reopening as v2 with nothing ever logged returns zero rows, zero crud depth, no error', async ({
    page,
  }) => {
    await page.goto('/__durability');
    await page.waitForSelector('[data-testid="durability-harness-ready"]');

    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].openVariant('v1'),
      DURABILITY_HARNESS_GLOBAL,
    );
    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].close(),
      DURABILITY_HARNESS_GLOBAL,
    );

    const reopenedIsDistinctInstance = await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].reopenVariant('v2'),
      DURABILITY_HARNESS_GLOBAL,
    );
    expect(reopenedIsDistinctInstance).toBe(true);

    const rows = await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].readAllSetsRaw(),
      DURABILITY_HARNESS_GLOBAL,
    );
    expect(rows).toEqual([]);

    const depth = await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].crudCount(),
      DURABILITY_HARNESS_GLOBAL,
    );
    expect(depth).toBe(0);
  });

  test('round trip back: v1 -> v2 -> v1 leaves logged sets readable in both directions', async ({ page }) => {
    await page.goto('/__durability');
    await page.waitForSelector('[data-testid="durability-harness-ready"]');

    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].openVariant('v1'),
      DURABILITY_HARNESS_GLOBAL,
    );

    const sessionExerciseId = await startExercise(page, 'ex-roundtrip-1');

    await page.evaluate(
      ({ globalKey, sessionExerciseId }) =>
        (window as unknown as HarnessWindow)[globalKey].logSet({
          sessionExerciseId,
          weight: { value: '60', unit: 'kg' },
          reps: 10,
        }),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionExerciseId },
    );

    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].close(),
      DURABILITY_HARNESS_GLOBAL,
    );
    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].reopenVariant('v2'),
      DURABILITY_HARNESS_GLOBAL,
    );

    const afterV2 = await page.evaluate(
      ({ globalKey, sessionExerciseId }) =>
        (window as unknown as HarnessWindow)[globalKey].readSetsRaw(sessionExerciseId),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionExerciseId },
    );
    expect(afterV2).toHaveLength(1);
    expect(afterV2[0].weight_kg).toBe('60.000');
    expect(afterV2[0].reps).toBe(10);

    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].close(),
      DURABILITY_HARNESS_GLOBAL,
    );
    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].reopenVariant('v1'),
      DURABILITY_HARNESS_GLOBAL,
    );

    const afterV1Again = await page.evaluate(
      ({ globalKey, sessionExerciseId }) =>
        (window as unknown as HarnessWindow)[globalKey].readSetsRaw(sessionExerciseId),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionExerciseId },
    );
    expect(afterV1Again).toHaveLength(1);
    expect(afterV1Again[0].weight_kg).toBe('60.000');
    expect(afterV1Again[0].reps).toBe(10);
    expect(afterV1Again[0].side).toBeNull();
  });
});
