// getPowerSync's real module chain reaches @powersync/react-native -> @powersync/shared-internals,
// whose ESM dist Jest cannot parse (WINDOWS #22/#33) — mocked before importing the screen module
// so its top-level `import { getPowerSync } from '@/lib/db/powersync'` never reaches that chain.
jest.mock('../../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../../lib/db/id', () => ({ generateClientId: jest.fn(() => 'fixed-id') }));
jest.mock('../../../lib/db/programs/create-routine', () => ({
  createRoutine: jest.fn(),
  loadRoutines: jest.fn(),
}));
jest.mock('../../../lib/db/programs/days', () => ({
  addDay: jest.fn(),
  addExercisesToDay: jest.fn(),
  renameDay: jest.fn(),
  removeDay: jest.fn(),
  removeExercise: jest.fn(),
}));
jest.mock('../../../lib/db/programs/load-program', () => ({
  loadExerciseNameMap: jest.fn(),
  loadProgramTree: jest.fn(),
}));
// programs.tsx now imports ExercisePickerModal, whose top-level imports reach the exercises
// screen (drizzle-orm/expo-router) and authClient (better-auth/react's ESM dist, which Jest's
// transform cannot parse) — mocked before importing the screen module, same rationale as the
// powersync mock above.
jest.mock('../../exercises', () => ({ loadCatalogRows: jest.fn() }));
jest.mock('../../../lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

import { deriveProgramsScreenState, nextExpandedSlotId } from '../programs';
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

describe('nextExpandedSlotId', () => {
  it('closes the open row when tapping the same id', () => {
    expect(nextExpandedSlotId('a', 'a')).toBeNull();
  });

  it('switches to the tapped row — only one row expanded at a time', () => {
    expect(nextExpandedSlotId('a', 'b')).toBe('b');
  });

  it('opens the tapped row when nothing was expanded', () => {
    expect(nextExpandedSlotId(null, 'b')).toBe('b');
  });
});
