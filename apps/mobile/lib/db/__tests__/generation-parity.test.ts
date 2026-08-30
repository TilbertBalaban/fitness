// Mobile half of GEN-07's parity proof — see apps/api/src/generation/__tests__/parity.spec.ts for
// this spec's api-side twin and packages/program-generator/src/__tests__/parity.test.ts for the
// package-side runner. All three import GENERATION_PARITY_FIXTURES from the package barrel and
// route both prescriptions through the same recommendNextPrescription entry point; only the
// filename convention differs (this app's every existing test is `.test.ts`; apps/api's
// jest.config.js testRegex matches `.spec.ts$` instead).
import { GENERATION_PARITY_FIXTURES } from '@fitness/program-generator';
import { recommendNextPrescription, type RecommendInput } from '@fitness/progression-engine';

function recommendFor(
  fixtureCase: (typeof GENERATION_PARITY_FIXTURES)[number],
  prescription: RecommendInput['prescription'],
) {
  return recommendNextPrescription({
    sessions: fixtureCase.sessions,
    prescription,
    equipmentType: fixtureCase.equipmentType,
    inventory: fixtureCase.inventory,
    preference: fixtureCase.preference,
  });
}

describe('GENERATION_PARITY_FIXTURES (GEN-07 parity proof — mobile side)', () => {
  it.each(GENERATION_PARITY_FIXTURES)('$name', (fixtureCase) => {
    expect(recommendFor(fixtureCase, fixtureCase.generatedPrescription)).toEqual(
      recommendFor(fixtureCase, fixtureCase.handBuiltPrescription),
    );
  });
});
