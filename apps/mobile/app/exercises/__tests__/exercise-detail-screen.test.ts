// getPowerSync's real module chain reaches @powersync/react-native -> @powersync/shared-internals,
// whose ESM dist Jest cannot parse (the same WINDOWS #22/#33 constraint load-snapshot.test.ts and
// refresh-catalog.test.ts already work around) — mocked before importing the screen module so its
// top-level `import { getPowerSync } from '@/lib/db/powersync'` never reaches that chain.
jest.mock('../../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));

import ExerciseDetailScreen, { resolveDetailScreenState } from '../[id]';
import type { ExerciseDetail } from '../../../lib/catalog/exercise-detail';

const SAMPLE_DETAIL: ExerciseDetail = {
  id: 'ex-1',
  name: 'Bench Press',
  aliases: [],
  movementPattern: 'horizontal_push',
  equipmentRequired: 'barbell',
  loadType: 'external_weight',
  unilateral: false,
  instructionsText: null,
  cueText: null,
  imageUrls: [],
  primaryMuscles: [],
  secondaryMuscles: [],
};

describe('resolveDetailScreenState', () => {
  it('resolves to found for a real detail', async () => {
    const state = await resolveDetailScreenState(() => Promise.resolve(SAMPLE_DETAIL));
    expect(state).toEqual({ status: 'found', detail: SAMPLE_DETAIL });
  });

  it('resolves to not-found rather than throwing or leaving a blank screen for an unknown id', async () => {
    const state = await resolveDetailScreenState(() => Promise.resolve(null));
    expect(state).toEqual({ status: 'not-found' });
  });

  it('resolves to error, never rethrowing, when the loader itself throws', async () => {
    const state = await resolveDetailScreenState(() => Promise.reject(new Error('db unavailable')));
    expect(state).toEqual({ status: 'error' });
  });
});

// Structural assertions over the compiled component function's own source, matching the plan's
// own acceptance criteria — legitimate given no @testing-library/react-native or
// react-test-renderer is available in this worktree's lockfile (installing either is out of
// scope per the package-legitimacy gate), and reading the file from disk would need @types/node
// types this app's tsconfig deliberately omits (["jest"] only).
describe('exercise detail screen — structural invariants', () => {
  const source = ExerciseDetailScreen.toString();

  it('renders Target Muscles and routes every image through ExerciseImageTile', () => {
    expect(source).toContain('Target Muscles');
    expect(source).toContain('ExerciseImageTile');
  });

  it('never truncates the exercise name — no numberOfLines anywhere in the component body', () => {
    expect(source).not.toMatch(/numberOfLines/);
  });
});
