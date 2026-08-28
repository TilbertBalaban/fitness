import { PROGRESSION_PARITY_FIXTURES } from '../__fixtures__/parity';
import { recommendNextPrescription } from '../recommend';
import type { ProgressionResult, RecommendationBasis } from '../result';

// D-08: the package-side runner. See apps/api/src/progression/__tests__/parity.spec.ts and
// apps/mobile/lib/db/__tests__/progression-parity.test.ts for the two other processes that import
// this exact same PROGRESSION_PARITY_FIXTURES table and run it against the same public entry
// point — a divergence between any of the three fails here or in one of them, never silently.
const ALL_RECOMMENDATION_BASES: RecommendationBasis[] = [
  'load_increase',
  'rep_increase',
  'hold',
  'failure_rep_increase',
  'shortfall_hold',
  'range_widened',
];
const ALL_RESULT_KINDS: Array<ProgressionResult['kind']> = ['recommendation', 'no_history', 'unavailable'];
const REQUIRED_REQUIREMENT_IDS = ['PRGR-02', 'PRGR-03', 'PRGR-06', 'PRGR-07', 'PRGR-08', 'PRGR-09', 'PRGR-10'];

describe('PROGRESSION_PARITY_FIXTURES', () => {
  it.each(PROGRESSION_PARITY_FIXTURES)('$name', (fixtureCase) => {
    expect(recommendNextPrescription(fixtureCase.input)).toEqual(fixtureCase.expected);
  });

  // A branch added to the engine later without a matching fixture fails here, not silently — this
  // is the coverage gate Task 1's own acceptance criteria requires.
  it('covers every ProgressionResult kind and every RecommendationBasis member', () => {
    const seenKinds = new Set(PROGRESSION_PARITY_FIXTURES.map((fixtureCase) => fixtureCase.expected.kind));
    for (const kind of ALL_RESULT_KINDS) {
      expect(seenKinds.has(kind)).toBe(true);
    }

    const seenBases = new Set(
      PROGRESSION_PARITY_FIXTURES
        .map((fixtureCase) => (fixtureCase.expected.kind === 'recommendation' ? fixtureCase.expected.basis : null))
        .filter((basis): basis is RecommendationBasis => basis !== null),
    );
    for (const basis of ALL_RECOMMENDATION_BASES) {
      expect(seenBases.has(basis)).toBe(true);
    }
  });

  it('names every phase requirement this parity proof is required to pin', () => {
    const seenRequirements = new Set(PROGRESSION_PARITY_FIXTURES.map((fixtureCase) => fixtureCase.requirement));
    for (const id of REQUIRED_REQUIREMENT_IDS) {
      expect(seenRequirements.has(id)).toBe(true);
    }
  });
});
