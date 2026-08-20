// getPowerSync's real module chain reaches @powersync/react-native -> @powersync/shared-internals,
// whose ESM dist Jest cannot parse (WINDOWS #22/#33) — mocked before importing the screen module
// so its top-level `import { getPowerSync } from '@/lib/db/powersync'` never reaches that chain.
jest.mock('../../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../../lib/db/id', () => ({ generateClientId: jest.fn(() => 'fixed-id') }));
jest.mock('../../../lib/db/programs/create-routine', () => ({
  createRoutine: jest.fn(),
  loadRoutines: jest.fn(),
}));

import { deriveProgramsScreenState } from '../programs';
import type { RoutineSummary } from '../../../lib/db/programs/create-routine';

const oneRoutine: RoutineSummary = { id: 'r-1', name: 'Push Pull Legs', status: 'draft', goal: null };

describe('deriveProgramsScreenState', () => {
  it('is error when the load failed, regardless of routines', () => {
    expect(deriveProgramsScreenState({ failed: true, routines: null })).toBe('error');
    expect(deriveProgramsScreenState({ failed: true, routines: [oneRoutine] })).toBe('error');
  });

  it('is loading when routines have not been read yet', () => {
    expect(deriveProgramsScreenState({ failed: false, routines: null })).toBe('loading');
  });

  it('is empty when the load succeeded with zero routines', () => {
    expect(deriveProgramsScreenState({ failed: false, routines: [] })).toBe('empty');
  });

  it('is populated when at least one routine loaded', () => {
    expect(deriveProgramsScreenState({ failed: false, routines: [oneRoutine] })).toBe('populated');
  });
});
