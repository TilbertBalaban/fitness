// Phase 11 adds NO NestJS module, service, controller or endpoint for program generation (D-01,
// D-02) — this file is a plain spec test importing @fitness/program-generator directly, boots no
// Nest application, injects no provider and touches no database. A reader arriving from the
// architecture diagram will reasonably assume this file is a stub awaiting wiring; it is not.
// Generation runs entirely on device and is one-way, so there is nothing on the server to wire —
// this file, together with the apps/api dependency on the package, is the whole of the api side of
// D-01's both-apps-import claim.
//
// See apps/mobile/lib/db/__tests__/generation-parity.test.ts for this spec's mobile-side twin, and
// packages/program-generator/src/__tests__/parity.test.ts for the package-side runner: same table,
// same entry point, same assertions, differing only in filename convention (apps/api's
// jest.config.js testRegex matches `.spec.ts$`; apps/mobile's every existing test is `.test.ts`).
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

describe('GENERATION_PARITY_FIXTURES (GEN-07 parity proof — api side)', () => {
  it.each(GENERATION_PARITY_FIXTURES)('$name', (fixtureCase) => {
    expect(recommendFor(fixtureCase, fixtureCase.generatedPrescription)).toEqual(
      recommendFor(fixtureCase, fixtureCase.handBuiltPrescription),
    );
  });
});
