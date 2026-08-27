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

type EquipmentType = 'barbell' | 'dumbbell' | 'bodyweight';

interface CreateEquipmentProfileInput {
  name: string;
  nativeUnit: 'kg' | 'lb';
  barbellWeightKg?: string | null;
  plates?: { weightKg: string; pairCount: number }[];
  dumbbells?: { weightKg: string }[];
  machines?: unknown[];
}

interface WorkoutHarness {
  openWithFilename(dbFilename: string): Promise<void>;
  seedGymProfile(input: CreateEquipmentProfileInput): Promise<SeedEquipmentProfileResult>;
  setActiveGym(profileId: string): Promise<void>;
  seedWorkoutSessionWithEquipment(equipmentTypes: [EquipmentType, EquipmentType]): Promise<SeededProgrammedSession>;
  readSessionRaw(sessionId: string): Promise<RawWorkoutSession | null>;
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

// A gym switch mid-workout is proven end-to-end (T-06-16): with two gyms whose plate inventories
// deliberately diverge, the same typed weight resolves differently once the session's stamped gym
// changes, the raw session row itself carries the new gym's id, and a set logged BEFORE the switch
// keeps displaying exactly the weight it was logged with — nothing about the past is re-derived.
test('a gym switch mid-workout moves forward-looking resolution and leaves a logged set untouched', async ({ page }) => {
  await openHarness(page, `fitness-switch-gym-${Date.now()}.db`);

  // Gym A: bar 20kg + a fine 10kg pair — 40kg lands exactly on bar + one 10kg pair per side.
  const gymA = await page.evaluate(
    (globalKey) =>
      (window as unknown as HarnessWindow)[globalKey].seedGymProfile({
        name: 'Commercial Gym',
        nativeUnit: 'kg',
        barbellWeightKg: '20',
        plates: [{ weightKg: '10', pairCount: 2 }],
      }),
    DURABILITY_HARNESS_GLOBAL,
  );
  await page.evaluate(
    ({ globalKey, profileId }) => (window as unknown as HarnessWindow)[globalKey].setActiveGym(profileId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, profileId: gymA.profileId },
  );

  // Gym B: same bar, but only a coarse 20kg pair — the achievable loads are 20 and 60, so 40kg
  // (loadable at Gym A) falls strictly between Gym B's two neighbours and is not loadable there.
  const gymB = await page.evaluate(
    (globalKey) =>
      (window as unknown as HarnessWindow)[globalKey].seedGymProfile({
        name: 'Coarse Home Gym',
        nativeUnit: 'kg',
        barbellWeightKg: '20',
        plates: [{ weightKg: '20', pairCount: 2 }],
      }),
    DURABILITY_HARNESS_GLOBAL,
  );

  const seeded = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSessionWithEquipment(['barbell', 'barbell']),
    DURABILITY_HARNESS_GLOBAL,
  );

  // Log one set on the first exercise's draft row at 40kg — the fact the switch must leave alone.
  const draftWeightField = page.getByRole('button', { name: 'Weight, set field' }).first();
  await draftWeightField.click();
  await page.getByRole('button', { name: '4', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();
  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Mark set complete' }).first().click();
  await expect(page.getByRole('button', { name: 'Mark set incomplete' }).first()).toBeVisible();

  // Completing the exercise's only existing set auto-advances the pager (WINDOWS #136) — reselect
  // the first exercise's own chip (now 1/3) before touching its fields again.
  await page.getByRole('button', { name: 'Harness barbell exercise, 1/3' }).click();

  // Type the SAME weight into the new trailing draft row — proving Gym A's breakdown before the
  // switch, and reused verbatim after it.
  const secondDraftWeightField = page.getByRole('button', { name: 'Weight, set field' }).nth(1);
  await secondDraftWeightField.click();
  await page.getByRole('button', { name: '4', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();

  await expect(page.getByText('20.00kg bar')).toBeVisible();
  await expect(page.getByText('10.00', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Session menu' }).click();
  await page.getByRole('button', { name: 'Switch Gym', exact: true }).click();

  // The sheet lists both gyms and marks the currently stamped one (Gym A).
  await expect(page.getByRole('button', { name: 'Commercial Gym' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Coarse Home Gym' })).toBeVisible();
  await expect(page.getByText('Active now')).toBeVisible();

  await page.getByRole('button', { name: 'Coarse Home Gym' }).click();

  const rawSession = await page.evaluate(
    ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].readSessionRaw(sessionId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId: seeded.sessionId },
  );
  expect(rawSession?.equipment_profile_id).toBe(gymB.profileId);

  // The same typed weight, still in the field, now resolves against Gym B's inventory instead —
  // not loadable, with the real 20/60 neighbours from Gym B's own plates.
  await expect(page.getByText('Not loadable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use 20.00kg' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use 60.00kg' })).toBeVisible();

  // The set logged before the switch still shows exactly 40 — nothing about the past was re-derived.
  await expect(page.getByRole('button', { name: 'Weight, set field' }).first()).toContainText('40');
});
