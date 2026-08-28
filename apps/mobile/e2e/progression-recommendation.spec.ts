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

interface ProgressionHistoryPerformance {
  weightKg: string | null;
  reps: number;
  rir: number | null;
}

interface SeedProgressionHistoryInput {
  exerciseId: string;
  prescription: { targetRepMin: number; targetRepMax: number; targetRir: number };
  performances: ProgressionHistoryPerformance[];
}

type EquipmentType = 'barbell' | 'ez_bar' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell';

interface CreateEquipmentProfileInput {
  name: string;
  nativeUnit: 'kg' | 'lb';
  barbellWeightKg?: string | null;
  plates?: { weightKg: string; pairCount: number }[];
  dumbbells?: { weightKg: string }[];
}

interface SeedEquipmentProfileResult {
  profileId: string;
}

interface WorkoutHarness {
  open(): Promise<void>;
  seedWorkoutSession(): Promise<SeededProgrammedSession>;
  seedWorkoutSessionWithEquipment(equipmentTypes: [EquipmentType, EquipmentType]): Promise<SeededProgrammedSession>;
  seedProgressionHistory(input: SeedProgressionHistoryInput): Promise<void>;
  seedGymProfile(input: CreateEquipmentProfileInput): Promise<SeedEquipmentProfileResult>;
  setActiveGym(profileId: string): Promise<void>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it does not carry outer closures, the constraint every other e2e spec in this suite
// documents, which is why every callback below re-declares this cast inline.
type HarnessWindow = Record<string, WorkoutHarness>;

async function openHarness(page: Page): Promise<void> {
  await page.goto('/__durability');
  await expect(page.getByTestId('durability-harness-ready')).toHaveText('ready');
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].open(), DURABILITY_HARNESS_GLOBAL);
}

// The same prescription seedProgrammedSession (test-support.ts) gives 'ex-workout-harness-1' via
// SEEDED_TARGETS[0] — reusing it here means the prior sessions' snapshot matches the CURRENT
// session's own session_exercise row the recommendation is computed against.
const PRESCRIPTION = { targetRepMin: 8, targetRepMax: 12, targetRir: 2 };

const NEXT_LINE = /^Next: /;

test.describe('progression recommendation (PRGR-06/07/11)', () => {
  // Real @powersync/web database, real browser, the real WorkoutScreenView __durability.web.tsx
  // mounts — no harness method here calls recommendNextPrescription directly; every recommendation
  // asserted below is the one the real workout screen itself computed and rendered.
  test('renders a recommendation computed from real offline logged history, heavier than what was logged', async ({
    page,
    context,
  }) => {
    await openHarness(page);

    await page.evaluate(
      ({ globalKey, input }) => (window as unknown as HarnessWindow)[globalKey].seedProgressionHistory(input),
      {
        globalKey: DURABILITY_HARNESS_GLOBAL,
        input: {
          exerciseId: 'ex-workout-harness-1',
          prescription: PRESCRIPTION,
          // achieved (reps+rir) = 17, well past expected performance (midpoint 10 + RIR 2 = 12) and
          // past the range ceiling (12) — a clean surplus under the default widen_rep_range_first
          // preference, which raises the load once the ceiling is reached.
          performances: [{ weightKg: '100.000', reps: 14, rir: 3 }],
        } satisfies SeedProgressionHistoryInput,
      },
    );

    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(),
      DURABILITY_HARNESS_GLOBAL,
    );

    // The draft row's weight field is present as soon as WorkoutScreenView mounts against the
    // seeded session — the same "no loading state to wait past" precedent workout-screen.spec.ts
    // documents.
    await expect(page.getByRole('button', { name: 'Weight, set field' })).toBeVisible();

    // The page is fully loaded before this call — every remaining step below is an in-page
    // interaction (no goto/reload), which is what makes offline safe here rather than flaky.
    await context.setOffline(true);

    const recommendation = page.getByText(NEXT_LINE);
    await expect(recommendation).toBeVisible();
    const recommendationText = await recommendation.textContent();
    const weightMatch = recommendationText?.match(/Next:\s*([\d.]+)\s*kg/);
    expect(weightMatch).not.toBeNull();
    expect(Number(weightMatch?.[1])).toBeGreaterThan(100);

    await context.setOffline(false);
  });

  test('no logged history prompts the lifter to pick their own starting weight, with no weight figure rendered (PRGR-07)', async ({
    page,
  }) => {
    await openHarness(page);

    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(),
      DURABILITY_HARNESS_GLOBAL,
    );

    // ExercisePager keeps the neighbouring page mounted for swipe — both of seedWorkoutSession's
    // two exercises have no history, so the banner legitimately renders twice; .first() scopes the
    // assertion to the currently visible page, matching this suite's existing convention for
    // pager-adjacent ambiguity.
    await expect(page.getByText('No history yet — pick your own starting weight.').first()).toBeVisible();
    await expect(page.getByText(NEXT_LINE)).toHaveCount(0);
  });

  test('a surplus the gym cannot load renders the explicit unavailable state, with no weight figure rendered (PRGR-06)', async ({
    page,
  }) => {
    await openHarness(page);

    // A barbell-only gym with no plates: the only achievable load is the bare bar (60kg), which is
    // heavier than any ideal load this scenario's surplus computes — roundToAchievable('down')
    // finds no achievable weight at or below the target and returns null.
    const { profileId } = await page.evaluate(
      (globalKey) =>
        (window as unknown as HarnessWindow)[globalKey].seedGymProfile({
          name: 'No Plates Gym',
          nativeUnit: 'kg',
          barbellWeightKg: '60.000',
        }),
      DURABILITY_HARNESS_GLOBAL,
    );
    await page.evaluate(
      ({ globalKey, profileId: id }) => (window as unknown as HarnessWindow)[globalKey].setActiveGym(id),
      { globalKey: DURABILITY_HARNESS_GLOBAL, profileId },
    );

    await page.evaluate(
      ({ globalKey, input }) => (window as unknown as HarnessWindow)[globalKey].seedProgressionHistory(input),
      {
        globalKey: DURABILITY_HARNESS_GLOBAL,
        input: {
          exerciseId: 'ex-workout-harness-equip-1',
          prescription: PRESCRIPTION,
          performances: [{ weightKg: '20.000', reps: 14, rir: 3 }],
        } satisfies SeedProgressionHistoryInput,
      },
    );

    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSessionWithEquipment(['barbell', 'barbell']),
      DURABILITY_HARNESS_GLOBAL,
    );

    await expect(page.getByText('No loadable weight matches the next target at this gym.')).toBeVisible();
    await expect(page.getByText(NEXT_LINE)).toHaveCount(0);
  });
});
