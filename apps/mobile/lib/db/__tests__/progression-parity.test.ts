// Mobile half of D-08's parity proof — see apps/api/src/progression/__tests__/parity.spec.ts for
// this spec's api-side twin. Both import PROGRESSION_PARITY_FIXTURES and recommendNextPrescription
// directly from @fitness/progression-engine and assert every case identically; only the filename
// convention differs (this app's every existing test is `.test.ts`; apps/api's jest.config.js
// testRegex matches `.spec.ts$` instead).
import { PROGRESSION_PARITY_FIXTURES, recommendNextPrescription } from '@fitness/progression-engine';

describe('PROGRESSION_PARITY_FIXTURES (D-08 parity proof — mobile side)', () => {
  it.each(PROGRESSION_PARITY_FIXTURES)('$name', (fixtureCase) => {
    expect(recommendNextPrescription(fixtureCase.input)).toEqual(fixtureCase.expected);
  });
});
