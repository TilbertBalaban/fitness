// Same mock-before-import discipline as app/programs/__tests__/library-screen.test.ts: both screen
// modules' top-level imports reach @powersync's ESM dist and better-auth/react, neither of which
// Jest's transform can parse.
jest.mock('../../../lib/auth-client', () => ({ authClient: { useSession: jest.fn(() => ({ data: null })) } }));
jest.mock('../../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../../lib/db/exclusions', () => ({
  addExclusion: jest.fn(() => Promise.resolve()),
  removeExclusion: jest.fn(() => Promise.resolve()),
  isExcluded: jest.fn(() => Promise.resolve(false)),
  loadExcludedExercises: jest.fn(() => Promise.resolve([])),
  loadExcludedExerciseIds: jest.fn(() => Promise.resolve([])),
}));

import { addExclusion, removeExclusion } from '../../../lib/db/exclusions';
import { resolveExclusionAction } from '../[id]';
import { deriveExclusionsScreenState, EMPTY_EXCLUSIONS_COPY } from '../exclusions';

describe('deriveExclusionsScreenState', () => {
  it('reports error when the read failed, even if rows are present', () => {
    expect(deriveExclusionsScreenState({ failed: true, rows: null })).toBe('error');
    expect(deriveExclusionsScreenState({ failed: true, rows: [{ exerciseId: 'ex-1', name: 'Bench' }] })).toBe('error');
  });

  it('reports loading before the first read resolves', () => {
    expect(deriveExclusionsScreenState({ failed: false, rows: null })).toBe('loading');
  });

  it('distinguishes an empty successful read from a failed one', () => {
    expect(deriveExclusionsScreenState({ failed: false, rows: [] })).toBe('empty');
    expect(deriveExclusionsScreenState({ failed: true, rows: [] })).toBe('error');
  });

  it('reports populated when the user has exclusions', () => {
    expect(deriveExclusionsScreenState({ failed: false, rows: [{ exerciseId: 'ex-1', name: 'Bench' }] })).toBe(
      'populated',
    );
  });

  it('keeps a row whose name is unresolvable in the populated state', () => {
    expect(
      deriveExclusionsScreenState({ failed: false, rows: [{ exerciseId: 'ex-gone', name: 'Unavailable exercise' }] }),
    ).toBe('populated');
  });

  it('explains the empty state rather than leaving it bare', () => {
    expect(EMPTY_EXCLUSIONS_COPY.length).toBeGreaterThan(0);
    expect(EMPTY_EXCLUSIONS_COPY).toContain('detail screen');
  });
});

describe('resolveExclusionAction', () => {
  it('names what the app will do, in both directions', () => {
    expect(resolveExclusionAction(false).label).toBe('Exclude from generated programs');
    expect(resolveExclusionAction(true).label).toBe('Allow in generated programs');
  });

  // The control records a choice, not a judgement about what the user is capable of.
  it('never phrases the label as a limitation on the user', () => {
    for (const excluded of [true, false]) {
      const { label } = resolveExclusionAction(excluded);
      expect(label.toLowerCase()).not.toMatch(/can't|cannot|unable|too weak|injur/);
    }
  });
});

describe('the detail screen exclusion toggle', () => {
  // Mirrors handleToggleExcluded's body: flip local state, then write the matching direction.
  async function toggle(excluded: boolean): Promise<void> {
    const next = !excluded;
    await (next ? addExclusion({} as never, 'user-a', 'ex-1') : removeExclusion({} as never, 'user-a', 'ex-1'));
  }

  it('calls addExclusion once then removeExclusion once across two invocations', async () => {
    jest.clearAllMocks();

    await toggle(false);
    await toggle(true);

    expect(addExclusion).toHaveBeenCalledTimes(1);
    expect(removeExclusion).toHaveBeenCalledTimes(1);
    expect(addExclusion).toHaveBeenCalledWith(expect.anything(), 'user-a', 'ex-1');
    expect(removeExclusion).toHaveBeenCalledWith(expect.anything(), 'user-a', 'ex-1');
  });
});
