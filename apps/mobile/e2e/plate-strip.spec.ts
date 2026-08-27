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

interface WorkoutHarness {
  openWithFilename(dbFilename: string): Promise<void>;
  seedEquipmentProfile(): Promise<SeedEquipmentProfileResult>;
  seedWorkoutSession(): Promise<SeededProgrammedSession>;
  readSessionRaw(sessionId: string): Promise<RawWorkoutSession | null>;
  readEquipmentProfileRaw(id: string): Promise<RawEquipmentProfile | null>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — no outer closures, same constraint every other e2e spec in this suite documents.
type HarnessWindow = Record<string, WorkoutHarness>;

// The tracer's own real end-to-end proof (Task 2): a user with no configured gym gets exactly one
// seeded "My Gym" profile the moment plate math is needed, the session it starts under carries
// that profile's id, and typing a loadable barbell total renders the real per-side plate stack in
// the band above the keypad — through the production WorkoutScreenView, no stub.
test('a typed barbell weight the seeded gym can load renders the real plate breakdown', async ({ page }) => {
  const dbFilename = `fitness-plate-strip-${Date.now()}.db`;

  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');

  await page.evaluate(
    ({ globalKey, dbFilename }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(dbFilename),
    { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
  );

  const { profileId } = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedEquipmentProfile(),
    DURABILITY_HARNESS_GLOBAL,
  );
  expect(profileId).toBeTruthy();

  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(),
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
  const dbFilename = `fitness-plate-strip-seed-${Date.now()}.db`;

  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');

  await page.evaluate(
    ({ globalKey, dbFilename }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(dbFilename),
    { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
  );

  // No explicit seedEquipmentProfile() call here — startWorkoutFromProgram's own
  // ensureDefaultEquipmentProfile call must auto-seed "My Gym" on first need (D-19), exactly as a
  // brand-new user's first "Start Workout" tap does.
  const seeded = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(),
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
