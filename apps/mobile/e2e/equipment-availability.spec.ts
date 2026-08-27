import { expect, test, type Page } from '@playwright/test';
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

type EquipmentType = 'barbell' | 'ez_bar' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell';

interface EquipmentMachineInput {
  id: string;
  name: string;
  equipmentType: EquipmentType;
  available: boolean;
  stackMinKg: string | null;
  stackMaxKg: string | null;
  stackIncrementKg: string | null;
  baseResistanceKg: string | null;
}

interface CreateEquipmentProfileInput {
  name: string;
  nativeUnit: 'kg' | 'lb';
  barbellWeightKg?: string | null;
  plates?: { weightKg: string; pairCount: number }[];
  dumbbells?: { weightKg: string }[];
  machines?: EquipmentMachineInput[];
}

interface SeedEquipmentProfileResult {
  profileId: string;
}

interface SeedSwapCandidateInput {
  targetExerciseId: string;
  candidateId: string;
  candidateName: string;
  candidateEquipmentType: EquipmentType;
}

interface RawWorkoutSession {
  id: string;
  equipment_profile_id: string | null;
  unavailable_equipment: string | null;
  [key: string]: unknown;
}

interface RawEquipmentProfile {
  id: string;
  name: string;
  machine_availability: string | null;
  [key: string]: unknown;
}

interface RawSessionExercise {
  id: string;
  exercise_id: string;
  routine_exercise_id: string | null;
  target_sets: number | null;
  target_rep_min: number | null;
  target_rep_max: number | null;
  target_rir: number | null;
  target_rest_seconds: number | null;
  [key: string]: unknown;
}

interface RawRoutineExercise {
  id: string;
  exercise_id: string;
  [key: string]: unknown;
}

interface WorkoutHarness {
  openWithFilename(dbFilename: string): Promise<void>;
  seedGymProfile(input: CreateEquipmentProfileInput): Promise<SeedEquipmentProfileResult>;
  setActiveGym(profileId: string): Promise<void>;
  seedWorkoutSessionWithEquipment(equipmentTypes: [EquipmentType, EquipmentType]): Promise<SeededProgrammedSession>;
  seedSwapCandidate(input: SeedSwapCandidateInput): Promise<void>;
  readSessionRaw(sessionId: string): Promise<RawWorkoutSession | null>;
  readEquipmentProfileRaw(id: string): Promise<RawEquipmentProfile | null>;
  readSessionExercisesRaw(sessionId: string): Promise<RawSessionExercise[]>;
  readRoutineExercise(routineExerciseId: string): Promise<RawRoutineExercise | null>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — no outer closures, the same constraint every other e2e spec in this suite documents.
type HarnessWindow = Record<string, WorkoutHarness>;

async function openHarness(page: Page, dbFilename: string): Promise<void> {
  await page.goto('/__durability');
  await expect(page.getByTestId('durability-harness-ready')).toHaveText('ready');
  await page.evaluate(
    ({ globalKey, dbFilename: name }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(name),
    { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
  );
}

async function readSessionRaw(page: Page, sessionId: string): Promise<RawWorkoutSession | null> {
  return page.evaluate(
    ({ globalKey, sessionId: id }) => (window as unknown as HarnessWindow)[globalKey].readSessionRaw(id),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId },
  );
}

async function readSessionExercises(page: Page, sessionId: string): Promise<RawSessionExercise[]> {
  return page.evaluate(
    ({ globalKey, sessionId: id }) => (window as unknown as HarnessWindow)[globalKey].readSessionExercisesRaw(id),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId },
  );
}

async function openOverflow(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'More' }).first().click();
}

// The single seeded machine's own name — asserted in the sheet's heading (`${displayName}
// Unavailable?`) and reused as the raw unavailable_equipment marker check below.
const MACHINE_NAME = 'Leg Press Machine';
const MACHINE_ID = 'harness-machine-1';

test('marking the only machine unavailable offers a real substitute and swaps the session exercise only', async ({ page }) => {
  const dbFilename = `fitness-equipment-availability-machine-${Date.now()}.db`;
  await openHarness(page, dbFilename);

  // Deliberately no barbell, no dumbbells: after the machine is marked unavailable, every
  // model-tracked equipment type (barbell/ez_bar/dumbbell/machine/cable) becomes unequippable,
  // so equipmentSwapConstraints excludes all of them and only a non-model candidate (kettlebell)
  // can score — proving the constraint actually reached scoreAlternatives, not merely computed.
  const { profileId } = await page.evaluate(
    ({ globalKey, machine }) =>
      (window as unknown as HarnessWindow)[globalKey].seedGymProfile({
        name: 'Machine Only Gym',
        nativeUnit: 'kg',
        machines: [machine],
      }),
    {
      globalKey: DURABILITY_HARNESS_GLOBAL,
      machine: {
        id: MACHINE_ID,
        name: MACHINE_NAME,
        equipmentType: 'machine',
        available: true,
        stackMinKg: null,
        stackMaxKg: null,
        stackIncrementKg: null,
        baseResistanceKg: null,
      } satisfies EquipmentMachineInput,
    },
  );
  await page.evaluate(
    ({ globalKey, profileId: id }) => (window as unknown as HarnessWindow)[globalKey].setActiveGym(id),
    { globalKey: DURABILITY_HARNESS_GLOBAL, profileId },
  );

  const seeded = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSessionWithEquipment(['machine', 'bodyweight']),
    DURABILITY_HARNESS_GLOBAL,
  );
  const targetExerciseId = seeded.exercises[0].exerciseId;
  const originalRoutineExerciseId = seeded.exercises[0].routineExerciseId;

  await page.evaluate(
    ({ globalKey, input }) => (window as unknown as HarnessWindow)[globalKey].seedSwapCandidate(input),
    {
      globalKey: DURABILITY_HARNESS_GLOBAL,
      input: {
        targetExerciseId,
        candidateId: 'harness-swap-candidate-kettlebell',
        candidateName: 'Kettlebell Goblet Squat',
        candidateEquipmentType: 'kettlebell',
      } satisfies SeedSwapCandidateInput,
    },
  );

  const beforeRows = await readSessionExercises(page, seeded.sessionId);
  const beforeTarget = beforeRows.find((row) => row.exercise_id === targetExerciseId);
  expect(beforeTarget).toBeDefined();
  const originalTargets = {
    targetSets: beforeTarget!.target_sets,
    targetRepMin: beforeTarget!.target_rep_min,
    targetRepMax: beforeTarget!.target_rep_max,
    targetRir: beforeTarget!.target_rir,
    targetRestSeconds: beforeTarget!.target_rest_seconds,
  };

  await openOverflow(page);
  await expect(page.getByRole('button', { name: 'Equipment' })).toBeVisible();
  await page.getByRole('button', { name: 'Equipment' }).click();

  await expect(page.getByText(`${MACHINE_NAME} Unavailable?`)).toBeVisible();
  await page.getByRole('button', { name: 'Mark Unavailable' }).click();

  await expect
    .poll(async () => {
      const raw = await readSessionRaw(page, seeded.sessionId);
      return raw?.unavailable_equipment ?? null;
    })
    .not.toBeNull();

  const markedSession = await readSessionRaw(page, seeded.sessionId);
  expect(markedSession?.unavailable_equipment).toContain(MACHINE_ID);

  await expect(page.getByText(`${MACHINE_NAME} Unavailable?`)).toBeVisible();
  await expect(page.getByText('This exercise is unavailable right now')).toBeVisible();
  // The sheet wires SwapSuggestionList's selection callback (not navigation), so a matched
  // candidate renders as a plain accessible button, never a Link.
  const candidateRow = page.getByRole('button', { name: 'Kettlebell Goblet Squat' });
  await expect(candidateRow).toBeVisible();
  await candidateRow.click();

  await expect
    .poll(async () => {
      const rows = await readSessionExercises(page, seeded.sessionId);
      const row = rows.find((candidate) => candidate.id === beforeTarget!.id);
      return row?.exercise_id;
    })
    .toBe('harness-swap-candidate-kettlebell');

  const afterRows = await readSessionExercises(page, seeded.sessionId);
  const afterTarget = afterRows.find((row) => row.id === beforeTarget!.id);
  expect(afterTarget?.exercise_id).toBe('harness-swap-candidate-kettlebell');
  expect(afterTarget?.target_sets).toBe(originalTargets.targetSets);
  expect(afterTarget?.target_rep_min).toBe(originalTargets.targetRepMin);
  expect(afterTarget?.target_rep_max).toBe(originalTargets.targetRepMax);
  expect(afterTarget?.target_rir).toBe(originalTargets.targetRir);
  expect(afterTarget?.target_rest_seconds).toBe(originalTargets.targetRestSeconds);

  // The program row itself is untouched by a session-only swap (D-23) — still points at the
  // original machine exercise, not the substitute.
  const routineExercise = await page.evaluate(
    ({ globalKey, id }) => (window as unknown as HarnessWindow)[globalKey].readRoutineExercise(id),
    { globalKey: DURABILITY_HARNESS_GLOBAL, id: originalRoutineExerciseId },
  );
  expect(routineExercise?.exercise_id).toBe(targetExerciseId);
});

test('a bodyweight exercise never shows the Equipment row', async ({ page }) => {
  const dbFilename = `fitness-equipment-availability-bodyweight-${Date.now()}.db`;
  await openHarness(page, dbFilename);

  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSessionWithEquipment(['bodyweight', 'barbell']),
    DURABILITY_HARNESS_GLOBAL,
  );

  await openOverflow(page);
  await expect(page.getByRole('button', { name: 'Swap' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Equipment' })).toHaveCount(0);
});

test('the profile write-through marks the profile machine unavailable while the session marks stay unchanged', async ({ page }) => {
  const dbFilename = `fitness-equipment-availability-write-through-${Date.now()}.db`;
  await openHarness(page, dbFilename);

  const { profileId } = await page.evaluate(
    ({ globalKey, machine }) =>
      (window as unknown as HarnessWindow)[globalKey].seedGymProfile({
        name: 'Write Through Gym',
        nativeUnit: 'kg',
        machines: [machine],
      }),
    {
      globalKey: DURABILITY_HARNESS_GLOBAL,
      machine: {
        id: MACHINE_ID,
        name: MACHINE_NAME,
        equipmentType: 'machine',
        available: true,
        stackMinKg: null,
        stackMaxKg: null,
        stackIncrementKg: null,
        baseResistanceKg: null,
      } satisfies EquipmentMachineInput,
    },
  );
  await page.evaluate(
    ({ globalKey, profileId: id }) => (window as unknown as HarnessWindow)[globalKey].setActiveGym(id),
    { globalKey: DURABILITY_HARNESS_GLOBAL, profileId },
  );

  const seeded = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSessionWithEquipment(['machine', 'bodyweight']),
    DURABILITY_HARNESS_GLOBAL,
  );
  const targetExerciseId = seeded.exercises[0].exerciseId;

  await page.evaluate(
    ({ globalKey, input }) => (window as unknown as HarnessWindow)[globalKey].seedSwapCandidate(input),
    {
      globalKey: DURABILITY_HARNESS_GLOBAL,
      input: {
        targetExerciseId,
        candidateId: 'harness-swap-candidate-kettlebell-2',
        candidateName: 'Kettlebell Swing',
        candidateEquipmentType: 'kettlebell',
      } satisfies SeedSwapCandidateInput,
    },
  );

  await openOverflow(page);
  await page.getByRole('button', { name: 'Equipment' }).click();
  await expect(page.getByText(`${MACHINE_NAME} Unavailable?`)).toBeVisible();

  await page.getByRole('button', { name: "My gym doesn't have this" }).click();
  await expect(page.getByText(`Remove from Write Through Gym?`)).toBeVisible();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();

  await expect
    .poll(async () => {
      const raw = await page.evaluate(
        ({ globalKey, id }) => (window as unknown as HarnessWindow)[globalKey].readEquipmentProfileRaw(id),
        { globalKey: DURABILITY_HARNESS_GLOBAL, id: profileId },
      );
      const machines = raw?.machine_availability ? (JSON.parse(raw.machine_availability) as EquipmentMachineInput[]) : [];
      return machines.find((machine) => machine.id === MACHINE_ID)?.available;
    })
    .toBe(false);

  // The session's own unavailable marks are unaffected by the write-through — D-20's two-tier
  // separation holds: the profile write is a distinct action from the session-scoped mark, and
  // this flow never took the session-scoped path.
  const rawSession = await readSessionRaw(page, seeded.sessionId);
  expect(rawSession?.unavailable_equipment ?? null).toBeNull();
});
