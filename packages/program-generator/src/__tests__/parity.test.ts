import { TRAINING_GOALS } from '@fitness/api-contracts';
import { recommendNextPrescription, type ProgressionResult, type RecommendInput } from '@fitness/progression-engine';
import { GENERATION_PARITY_FIXTURES, type GenerationParityCase } from '../__fixtures__/parity';

// GEN-07: the package-side runner. See apps/api/src/generation/__tests__/parity.spec.ts and
// apps/mobile/lib/db/__tests__/generation-parity.test.ts for the two other processes that import
// this exact same GENERATION_PARITY_FIXTURES table and run it against the same public entry
// point — a divergence between any of the three fails here or in one of them, never silently.
const REQUIRED_REQUIREMENT_IDS = ['GEN-07'];

function recommendFor(
  fixtureCase: GenerationParityCase,
  prescription: RecommendInput['prescription'],
): ProgressionResult {
  return recommendNextPrescription({
    sessions: fixtureCase.sessions,
    prescription,
    equipmentType: fixtureCase.equipmentType,
    inventory: fixtureCase.inventory,
    preference: fixtureCase.preference,
  });
}

describe('GENERATION_PARITY_FIXTURES', () => {
  it.each(GENERATION_PARITY_FIXTURES)('$name', (fixtureCase) => {
    const handBuilt = recommendFor(fixtureCase, fixtureCase.handBuiltPrescription);
    const generated = recommendFor(fixtureCase, fixtureCase.generatedPrescription);

    expect(generated).toEqual(handBuilt);
  });

  // Two equally-incomplete prescriptions would satisfy the equality above while proving nothing
  // about progression, so the runner refuses that result outright.
  it('never passes on two prescriptions the engine could not read', () => {
    for (const fixtureCase of GENERATION_PARITY_FIXTURES) {
      for (const prescription of [fixtureCase.handBuiltPrescription, fixtureCase.generatedPrescription]) {
        expect(recommendFor(fixtureCase, prescription)).not.toEqual({
          kind: 'unavailable',
          reason: 'incomplete_prescription',
        });
      }
    }
  });

  // A goal added to the vocabulary later without a matching fixture fails here, not silently.
  it('covers every training goal, so the rep band is not pinned to one of them', () => {
    const seenGoals = new Set(GENERATION_PARITY_FIXTURES.map((fixtureCase) => fixtureCase.trainingGoal));
    for (const goal of TRAINING_GOALS) {
      expect(seenGoals.has(goal)).toBe(true);
    }
  });

  it('names every phase requirement this parity proof is required to pin', () => {
    const seenRequirements = new Set(GENERATION_PARITY_FIXTURES.map((fixtureCase) => fixtureCase.requirement));
    for (const id of REQUIRED_REQUIREMENT_IDS) {
      expect(seenRequirements.has(id)).toBe(true);
    }
  });

  // The generated halves must have been resolved per cycle, not copied from one base row. A deload
  // cycle's RIR is the base RIR plus the deload increment, so a table whose generated side ignored
  // overridesByCycleKey would show the same RIR everywhere and fail here — which is what stops the
  // equality assertions above from degenerating into `x === x` against a single constant.
  it('resolves the generated side per cycle rather than reusing one base row', () => {
    const rirValues = new Set(GENERATION_PARITY_FIXTURES.map((fixtureCase) => fixtureCase.generatedPrescription.targetRir));
    expect(rirValues.size).toBeGreaterThan(1);

    const repBands = new Set(
      GENERATION_PARITY_FIXTURES.map(
        (fixtureCase) => `${fixtureCase.generatedPrescription.targetRepMin}-${fixtureCase.generatedPrescription.targetRepMax}`,
      ),
    );
    expect(repBands.size).toBe(TRAINING_GOALS.length);
  });
});
