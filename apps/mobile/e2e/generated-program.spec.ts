import { expect, test } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

interface GenerateResult {
  routineId: string;
  degradationCount: number;
  degradationKinds: string[];
  cycleCount: number;
  slotCount: number;
}

interface ProgramSlotRow {
  id: string;
  orderIndex: number;
  exerciseId: string;
  exerciseName: string;
  targetSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRir: number | null;
  targetRestSeconds: number | null;
  overridesByCycleId: Record<string, Record<string, number | null>>;
}

interface ProgramDayRow {
  id: string;
  orderIndex: number;
  name: string;
  isRestDay: boolean;
  slots: ProgramSlotRow[];
}

interface ProgramTreeRow {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  days: ProgramDayRow[];
  cycles: { id: string; name: string; kind: string }[];
}

interface GenerationHarness {
  open(): Promise<void>;
  close(): Promise<void>;
  reopen(): Promise<boolean>;
  crudCount(): Promise<number>;
  seedAndGenerateProgram(answers?: Record<string, unknown>): Promise<GenerateResult>;
  readGeneratedProgramTree(routineId: string): Promise<ProgramTreeRow | null>;
  readCycleTargetCount(routineId: string): Promise<number>;
  readGeneratedRoutineRaw(routineId: string): Promise<Record<string, unknown> | null>;
  renameProgramDay(dayId: string, name: string): Promise<void>;
  setProgramExerciseTargets(
    routineExerciseId: string,
    draft: {
      targetSets: number | null;
      targetRepMin: number | null;
      targetRepMax: number | null;
      targetRir: number | null;
      targetRestSeconds: number | null;
    },
  ): Promise<void>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it does not carry outer closures. Every callback below re-declares this lookup inline
// rather than calling a shared helper, which is why the same three-line cast is repeated.
type HarnessWindow = Record<string, GenerationHarness>;

async function openHarness(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].open(), DURABILITY_HARNESS_GLOBAL);
}

async function generate(page: import('@playwright/test').Page): Promise<GenerateResult> {
  return page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedAndGenerateProgram(),
    DURABILITY_HARNESS_GLOBAL,
  );
}

async function readTree(
  page: import('@playwright/test').Page,
  routineId: string,
): Promise<ProgramTreeRow | null> {
  return page.evaluate(
    ({ globalKey, routineId }) => (window as unknown as HarnessWindow)[globalKey].readGeneratedProgramTree(routineId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, routineId },
  );
}

// Real @powersync/web database, real browser, real write path — the generator, the wizard assembly
// and materializeGeneratedProgram are the shipped ones, not test doubles.
test('a generated program is written as an ordinary draft routine and read back by the shipped loader', async ({
  page,
}) => {
  await openHarness(page);
  const result = await generate(page);

  // The seeded catalog is wide enough that every slot fills; a 60-minute session still trims some
  // days for time, which is honest generator output rather than a gap in the fixture.
  expect(result.degradationKinds).not.toContain('slot_unfillable');
  expect(result.slotCount).toBeGreaterThan(0);

  const raw = await page.evaluate(
    ({ globalKey, routineId }) => (window as unknown as HarnessWindow)[globalKey].readGeneratedRoutineRaw(routineId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, routineId: result.routineId },
  );

  // Read from the database, never from the writer's arguments — D-05's claim is about the stored
  // row, not about what the caller intended to store.
  expect(raw).not.toBeNull();
  expect(raw!.status).toBe('draft');
  expect(raw!.source).toBe('user');

  const tree = await readTree(page, result.routineId);
  expect(tree).not.toBeNull();
  expect(tree!.days).toHaveLength(3);
  for (const day of tree!.days) {
    expect(day.slots.length).toBeGreaterThan(0);
  }
});

test('the per-cycle overrides are sparse in the real database, not a per-cycle copy', async ({ page }) => {
  await openHarness(page);
  const result = await generate(page);

  const overrideCount = await page.evaluate(
    ({ globalKey, routineId }) => (window as unknown as HarnessWindow)[globalKey].readCycleTargetCount(routineId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, routineId: result.routineId },
  );

  expect(overrideCount).toBeLessThan(result.cycleCount * result.slotCount);
});

test('the generated program entered the ordinary sync queue like any other write', async ({ page }) => {
  await openHarness(page);
  await generate(page);

  const pending = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].crudCount(),
    DURABILITY_HARNESS_GLOBAL,
  );

  expect(pending).toBeGreaterThan(0);
});

test('the generated tree survives a close and reopen unchanged', async ({ page }) => {
  await openHarness(page);
  const result = await generate(page);

  const beforeClose = await readTree(page, result.routineId);

  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].close(), DURABILITY_HARNESS_GLOBAL);
  const reopened = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].reopen(),
    DURABILITY_HARNESS_GLOBAL,
  );
  expect(reopened).toBe(true);

  const afterReopen = await readTree(page, result.routineId);
  expect(afterReopen).toEqual(beforeClose);
});

test('a generated program is renamed and retargeted by the ordinary builder mutations, and the edits survive a reopen', async ({
  page,
}) => {
  await openHarness(page);
  const result = await generate(page);

  const tree = await readTree(page, result.routineId);
  const dayId = tree!.days[0].id;
  const slotId = tree!.days[0].slots[0].id;

  await page.evaluate(
    ({ globalKey, dayId, slotId }) => {
      const harness = (window as unknown as HarnessWindow)[globalKey];
      return harness.renameProgramDay(dayId, 'Renamed By Hand').then(() =>
        harness.setProgramExerciseTargets(slotId, {
          targetSets: 7,
          targetRepMin: 5,
          targetRepMax: 9,
          targetRir: 1,
          targetRestSeconds: 90,
        }),
      );
    },
    { globalKey: DURABILITY_HARNESS_GLOBAL, dayId, slotId },
  );

  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].close(), DURABILITY_HARNESS_GLOBAL);
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].reopen(), DURABILITY_HARNESS_GLOBAL);

  const afterReopen = await readTree(page, result.routineId);
  const renamedDay = afterReopen!.days.find((day) => day.id === dayId);
  expect(renamedDay!.name).toBe('Renamed By Hand');

  const retargetedSlot = renamedDay!.slots.find((slot) => slot.id === slotId);
  expect(retargetedSlot!.targetSets).toBe(7);
  expect(retargetedSlot!.targetRepMin).toBe(5);
  expect(retargetedSlot!.targetRepMax).toBe(9);
  expect(retargetedSlot!.targetRir).toBe(1);
});

test('generating twice from the same answers and seed produces two identical programs', async ({ page }) => {
  await openHarness(page);

  const first = await generate(page);
  const second = await generate(page);

  const firstTree = await readTree(page, first.routineId);
  const secondTree = await readTree(page, second.routineId);

  const shapeOf = (tree: ProgramTreeRow | null) =>
    tree!.days.map((day) => ({
      name: day.name,
      slots: day.slots.map((slot) => ({
        exerciseId: slot.exerciseId,
        targetSets: slot.targetSets,
        targetRepMin: slot.targetRepMin,
        targetRepMax: slot.targetRepMax,
        targetRir: slot.targetRir,
      })),
    }));

  expect(shapeOf(secondTree)).toEqual(shapeOf(firstTree));
});
