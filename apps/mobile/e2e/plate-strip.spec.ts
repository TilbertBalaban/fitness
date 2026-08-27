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

interface SeedEquipmentProfileResult {
  profileId: string;
}

interface RawWorkoutSession {
  id: string;
  equipment_profile_id: string | null;
  [key: string]: unknown;
}

interface RawEquipmentProfile {
  id: string;
  name: string;
  [key: string]: unknown;
}

type EquipmentType = 'barbell' | 'dumbbell' | 'bodyweight';

interface CreateEquipmentProfileInput {
  name: string;
  nativeUnit: 'kg' | 'lb';
  barbellWeightKg?: string | null;
  plates?: { weightKg: string; pairCount: number }[];
  dumbbells?: { weightKg: string }[];
  machines?: unknown[];
}

interface SeedPriorHeaviestSetInput {
  exerciseId: string;
  weightKg: string;
  reps: number;
}

interface WorkoutHarness {
  openWithFilename(dbFilename: string): Promise<void>;
  seedEquipmentProfile(): Promise<SeedEquipmentProfileResult>;
  seedGymProfile(input: CreateEquipmentProfileInput): Promise<SeedEquipmentProfileResult>;
  setActiveGym(profileId: string): Promise<void>;
  seedWorkoutSession(): Promise<SeededProgrammedSession>;
  seedWorkoutSessionWithEquipment(equipmentTypes: [EquipmentType, EquipmentType]): Promise<SeededProgrammedSession>;
  seedPriorHeaviestSet(input: SeedPriorHeaviestSetInput): Promise<void>;
  readSessionRaw(sessionId: string): Promise<RawWorkoutSession | null>;
  readEquipmentProfileRaw(id: string): Promise<RawEquipmentProfile | null>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — no outer closures, same constraint every other e2e spec in this suite documents.
type HarnessWindow = Record<string, WorkoutHarness>;

async function openHarness(page: import('@playwright/test').Page, dbFilename: string) {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');
  await page.evaluate(
    ({ globalKey, dbFilename: name }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(name),
    { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
  );
}

// The tracer's own real end-to-end proof (Task 2): a user with no configured gym gets exactly one
// seeded "My Gym" profile the moment plate math is needed, the session it starts under carries
// that profile's id, and typing a loadable barbell total renders the real per-side plate stack in
// the band above the keypad — through the production WorkoutScreenView, no stub. Now seeded through
// seedWorkoutSessionWithEquipment so the first exercise resolves a real 'barbell' equipment_type —
// 06-05's band gates on it, and seedWorkoutSession's own bare exercise ids (relied on by every other
// e2e spec's "Unknown exercise" assertion) can never carry one.
test('a typed barbell weight the seeded gym can load renders the real plate breakdown', async ({ page }) => {
  await openHarness(page, `fitness-plate-strip-${Date.now()}.db`);

  const { profileId } = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedEquipmentProfile(),
    DURABILITY_HARNESS_GLOBAL,
  );
  expect(profileId).toBeTruthy();

  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSessionWithEquipment(['barbell', 'barbell']),
    DURABILITY_HARNESS_GLOBAL,
  );

  const weightField = page.getByRole('button', { name: 'Weight, set field' }).first();
  await expect(weightField).toBeVisible();
  await weightField.click();

  // 20kg bar + 2 x (25 + 10) = 90kg — a loadable target against the seeded commercial-gym
  // inventory (25kg pairCount 3, 10kg pairCount 2), giving a real two-denomination stack.
  await page.getByRole('button', { name: '9', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();

  await expect(page.getByText('20.00kg bar')).toBeVisible();
  await expect(page.getByText('25.00 · 10.00')).toBeVisible();

  // The digit grid itself has not moved — the band grows the layout above it, never displaces it.
  await expect(page.getByRole('button', { name: '5', exact: true })).toBeVisible();
});

test('a user with no configured gym gets exactly one seeded profile, and the session points at it', async ({ page }) => {
  await openHarness(page, `fitness-plate-strip-seed-${Date.now()}.db`);

  // No explicit seedEquipmentProfile() call here — startWorkoutFromProgram's own
  // ensureDefaultEquipmentProfile call must auto-seed "My Gym" on first need (D-19), exactly as a
  // brand-new user's first "Start Workout" tap does.
  const seeded = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSessionWithEquipment(['barbell', 'barbell']),
    DURABILITY_HARNESS_GLOBAL,
  );

  const weightField = page.getByRole('button', { name: 'Weight, set field' }).first();
  await expect(weightField).toBeVisible();
  await weightField.click();
  await page.getByRole('button', { name: '6', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();

  // A single 20kg-plate pair loads 60kg against the seeded default — proving the auto-seeded
  // profile (not just its id) actually reached the running session.
  await expect(page.getByText('20.00kg bar')).toBeVisible();
  await expect(page.getByText('20.00', { exact: true })).toBeVisible();

  const rawSession = await page.evaluate(
    ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].readSessionRaw(sessionId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId: seeded.sessionId },
  );
  expect(rawSession?.equipment_profile_id).toBeTruthy();

  const rawProfile = await page.evaluate(
    ({ globalKey, profileId }) => (window as unknown as HarnessWindow)[globalKey].readEquipmentProfileRaw(profileId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, profileId: rawSession!.equipment_profile_id! },
  );
  expect(rawProfile?.name).toBe('My Gym');
});

test('a not-loadable weight shows both neighbours, and tapping one writes it into the field (D-09/D-13)', async ({ page }) => {
  await openHarness(page, `fitness-plate-strip-not-loadable-${Date.now()}.db`);

  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].seedEquipmentProfile(), DURABILITY_HARNESS_GLOBAL);
  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSessionWithEquipment(['barbell', 'barbell']),
    DURABILITY_HARNESS_GLOBAL,
  );

  const weightField = page.getByRole('button', { name: 'Weight, set field' }).first();
  await weightField.click();

  // 21kg: not achievable against the seeded gym (bar alone = 20, next achievable = 20 + 2x1.25 =
  // 22.5) — the band must offer exactly the two real neighbours, never rewrite the field itself.
  await page.getByRole('button', { name: '2', exact: true }).click();
  await page.getByRole('button', { name: '1', exact: true }).click();

  await expect(page.getByText('Not loadable')).toBeVisible();
  const lower = page.getByRole('button', { name: 'Use 20.00kg' });
  const higher = page.getByRole('button', { name: 'Use 22.50kg' });
  await expect(lower).toBeVisible();
  await expect(higher).toBeVisible();

  await lower.click();

  // The field took the tapped neighbour exactly as if typed, and no set was completed — the band
  // now reads loadable again (bar alone, 0 plates per side).
  await expect(page.getByText('20.00kg bar')).toBeVisible();
});

test('a zero-plate barbell profile shows the no-plates recovery link (E3 zero/one/many)', async ({ page }) => {
  await openHarness(page, `fitness-plate-strip-zero-plates-${Date.now()}.db`);

  const { profileId } = await page.evaluate(
    (globalKey) =>
      (window as unknown as HarnessWindow)[globalKey].seedGymProfile({
        name: 'Empty Gym',
        nativeUnit: 'kg',
        barbellWeightKg: '20',
        plates: [],
      }),
    DURABILITY_HARNESS_GLOBAL,
  );
  await page.evaluate(
    ({ globalKey, profileId: id }) => (window as unknown as HarnessWindow)[globalKey].setActiveGym(id),
    { globalKey: DURABILITY_HARNESS_GLOBAL, profileId },
  );
  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSessionWithEquipment(['barbell', 'barbell']),
    DURABILITY_HARNESS_GLOBAL,
  );

  const weightField = page.getByRole('button', { name: 'Weight, set field' }).first();
  await weightField.click();
  await page.getByRole('button', { name: '6', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();

  await expect(page.getByText('No plates configured')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add plates' })).toBeVisible();
});

test('a dumbbell exercise shows the loadable pair figure', async ({ page }) => {
  await openHarness(page, `fitness-plate-strip-dumbbell-${Date.now()}.db`);

  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].seedEquipmentProfile(), DURABILITY_HARNESS_GLOBAL);
  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSessionWithEquipment(['dumbbell', 'barbell']),
    DURABILITY_HARNESS_GLOBAL,
  );

  const weightField = page.getByRole('button', { name: 'Weight, set field' }).first();
  await weightField.click();
  await page.getByRole('button', { name: '2', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();

  // 20kg lands exactly on the seeded 2.5kg-step dumbbell range — the loadable pair figure, not the
  // not-loadable neighbour pattern.
  await expect(page.getByText('20.00kg pair')).toBeVisible();
});

test('a bodyweight exercise shows no band at all, and the keypad grid is unmoved', async ({ page }) => {
  await openHarness(page, `fitness-plate-strip-bodyweight-${Date.now()}.db`);

  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSessionWithEquipment(['bodyweight', 'barbell']),
    DURABILITY_HARNESS_GLOBAL,
  );

  const weightField = page.getByRole('button', { name: 'Weight, set field' }).first();
  await weightField.click();
  await page.getByRole('button', { name: '5', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();

  await expect(page.getByText('kg bar')).toHaveCount(0);
  await expect(page.getByText('Not loadable')).toHaveCount(0);
  await expect(page.getByText('No plates configured')).toHaveCount(0);
  // The digit grid itself has not moved — the collapsed band reserves zero height, not a gap.
  await expect(page.getByRole('button', { name: '9', exact: true })).toBeVisible();
});

test('tap-to-autofill lands on an achievable load against a coarse home-gym inventory, and the reference figure stays unchanged', async ({
  page,
}) => {
  await openHarness(page, `fitness-plate-strip-autofill-${Date.now()}.db`);

  const { profileId } = await page.evaluate(
    (globalKey) =>
      (window as unknown as HarnessWindow)[globalKey].seedGymProfile({
        name: 'Coarse Home Gym',
        nativeUnit: 'kg',
        barbellWeightKg: '20',
        plates: [{ weightKg: '20', pairCount: 2 }],
      }),
    DURABILITY_HARNESS_GLOBAL,
  );
  await page.evaluate(
    ({ globalKey, profileId: id }) => (window as unknown as HarnessWindow)[globalKey].setActiveGym(id),
    { globalKey: DURABILITY_HARNESS_GLOBAL, profileId },
  );

  // Achievable loads against this inventory: 20 (bar alone), 60 (bar + one 20kg pair each side),
  // 100 (bar + two). A prior logged 61kg is closest to 60 — the deliberately coarse-vs-fine
  // rounding case this test exists to prove.
  await page.evaluate(
    (globalKey) =>
      (window as unknown as HarnessWindow)[globalKey].seedPriorHeaviestSet({
        exerciseId: 'ex-workout-harness-equip-1',
        weightKg: '61.000',
        reps: 5,
      }),
    DURABILITY_HARNESS_GLOBAL,
  );
  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSessionWithEquipment(['barbell', 'barbell']),
    DURABILITY_HARNESS_GLOBAL,
  );

  const reference = page.getByRole('button', { name: 'Weight, use previous 61.00' });
  await expect(reference).toBeVisible();
  await reference.click();

  // The achievable load landed in the field...
  await expect(page.getByText('60.00', { exact: true })).toBeVisible();
  // ...while the reference row's own figure is completely unchanged (D-11) — the same 61.00 it
  // showed before the tap, never snapped to what was just written into the field.
  await expect(page.getByRole('button', { name: 'Weight, use previous 61.00' })).toBeVisible();
});
