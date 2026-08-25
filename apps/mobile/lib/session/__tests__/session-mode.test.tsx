import { resolveSessionScreenMode } from '../session-mode';

// Pure, no I/O — direct-invocation, no renderer needed (matches auto-advance.test.ts's own
// technique for the sibling pure function shouldAutoAdvance).
describe('resolveSessionScreenMode — the ONE place SessionScreenMode is decided (D-32, UI-SPEC R10)', () => {
  it('is live for an in-progress session with no route param', () => {
    expect(
      resolveSessionScreenMode({ routeSessionId: null, session: { id: 's-1', status: 'in_progress' } }),
    ).toBe('live');
  });

  it('is live for an in-progress session even when a route param names it', () => {
    expect(
      resolveSessionScreenMode({ routeSessionId: 's-1', session: { id: 's-1', status: 'in_progress' } }),
    ).toBe('live');
  });

  it('is live for a paused session with no route param', () => {
    expect(resolveSessionScreenMode({ routeSessionId: null, session: { id: 's-1', status: 'paused' } })).toBe('live');
  });

  it('is editing for a completed session named by a route param', () => {
    expect(
      resolveSessionScreenMode({ routeSessionId: 's-1', session: { id: 's-1', status: 'completed' } }),
    ).toBe('editing');
  });

  it('is editing for a discarded session named by a route param', () => {
    expect(
      resolveSessionScreenMode({ routeSessionId: 's-1', session: { id: 's-1', status: 'discarded' } }),
    ).toBe('editing');
  });
});
