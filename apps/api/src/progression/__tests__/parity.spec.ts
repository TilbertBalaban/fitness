// Phase 8 adds NO NestJS module, service, controller or endpoint (D-16) — this file is a plain
// spec test importing @fitness/progression-engine directly, boots no Nest application, injects no
// provider and touches no database. A reader arriving from the architecture diagram will
// reasonably assume this file is a stub awaiting wiring; it is not — server-side reconciliation is
// Phase 10's subject, and this file, together with its api/package.json devDependency, is the
// whole of the api side of D-08's parity proof for this phase.
//
// This is the first file in this repository to import a @fitness/* PURE RULES package from
// apps/api — @fitness/api-contracts is the only prior @fitness/* entry this package.json has ever
// carried. See apps/mobile/lib/db/__tests__/progression-parity.test.ts for this spec's mobile-side
// twin: same table, same entry point, same assertions, differing only in filename convention
// (apps/api's jest.config.js testRegex matches `.spec.ts$`; apps/mobile's every existing test is
// `.test.ts`).
import { PROGRESSION_PARITY_FIXTURES, recommendNextPrescription } from '@fitness/progression-engine';

describe('PROGRESSION_PARITY_FIXTURES (D-08 parity proof — api side)', () => {
  it.each(PROGRESSION_PARITY_FIXTURES)('$name', (fixtureCase) => {
    expect(recommendNextPrescription(fixtureCase.input)).toEqual(fixtureCase.expected);
  });
});
