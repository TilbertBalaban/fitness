// getPowerSync's real module chain reaches @powersync/react-native -> @powersync/shared-internals,
// whose ESM dist Jest cannot parse (WINDOWS #22/#33) — mocked before importing the screen module so
// its top-level `import { getPowerSync } from '@/lib/db/powersync'` never reaches that chain.
jest.mock('../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../lib/db/programs/next-up-query', () => ({ loadNextUp: jest.fn() }));
// authClient's better-auth/react ESM dist is one Jest cannot parse, same rationale as the
// powersync mock above.
jest.mock('../../lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

import { readInProgressSession } from '../(tabs)/index';

// D-28's cost constraint (the query itself, not just the render, must be conditional) and the E8
// error backstop (what Home does when this query rejects) both live here.
describe('readInProgressSession', () => {
  const SUMMARY = {
    id: 's-1',
    startedAt: '2026-08-24T10:00:00.000Z',
    status: 'in_progress',
    pausedAt: null,
    accumulatedPausedSeconds: 0,
  };

  it('issues no query at all when userId is absent', async () => {
    const load = jest.fn();

    await expect(readInProgressSession(null, load)).resolves.toEqual({ data: null });

    expect(load).not.toHaveBeenCalled();
  });

  it('returns the resolved session for a signed-in user', async () => {
    const load = jest.fn().mockResolvedValue(SUMMARY);

    await expect(readInProgressSession('u-1', load)).resolves.toEqual({ data: SUMMARY });
    expect(load).toHaveBeenCalledWith('u-1');
  });

  it('returns null data, not a failure, when there is simply no open session', async () => {
    const load = jest.fn().mockResolvedValue(null);

    await expect(readInProgressSession('u-1', load)).resolves.toEqual({ data: null });
  });

  // The E8 backstop: distinguishing a query failure from "no session" is what this case pins —
  // Home's own rendering choice (collapse both to banner-absent) is made at the call site, but the
  // read function itself must still be able to report the failure distinctly.
  it('reports a failure instead of throwing, distinctly from a null-data no-session result', async () => {
    const load = jest.fn().mockRejectedValue(new Error('database locked'));

    await expect(readInProgressSession('u-1', load)).resolves.toEqual({ failed: true });
  });
});
