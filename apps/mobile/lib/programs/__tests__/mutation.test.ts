import { describeMutationError, runMutation } from '../mutation';

// WR-11: the handlers that caught terminated at console.error, so a failed write showed the user
// nothing and the next reload silently reverted their edit; the handlers that did not catch were
// async functions handed straight to onPress, so a rejection was an unhandled promise rejection.

describe('runMutation', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports success with no message when the write lands', async () => {
    expect(await runMutation(async () => undefined, 'Fallback.')).toEqual({ ok: true, message: null });
  });

  it('never rejects, so a handler passed to onPress cannot become an unhandled rejection', async () => {
    await expect(
      runMutation(() => Promise.reject(new Error('database locked')), "Couldn't save that."),
    ).resolves.toEqual({ ok: false, message: "Couldn't save that." });
  });

  it('reports a failure with the caller’s description of what did not happen', async () => {
    const outcome = await runMutation(async () => {
      throw new Error('database locked');
    }, "Couldn't remove that day.");

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toBe("Couldn't remove that day.");
  });

  it('still logs the underlying error alongside the surfaced message', async () => {
    const failure = new Error('database locked');
    await runMutation(async () => {
      throw failure;
    }, "Couldn't save that.");

    expect(console.error).toHaveBeenCalledWith("Couldn't save that.", failure);
  });

  it('survives a non-Error rejection without inventing a message', async () => {
    const outcome = await runMutation(() => Promise.reject('nope'), 'Fallback.');

    expect(outcome).toEqual({ ok: false, message: 'Fallback.' });
  });

  it('runs the action exactly once', async () => {
    const action = jest.fn().mockResolvedValue(undefined);

    await runMutation(action, 'Fallback.');

    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe('describeMutationError', () => {
  it('turns the write layer’s internal target codes into sentences', () => {
    expect(describeMutationError(new Error('targetRepMax: min-above-max'), 'Fallback.')).toBe(
      'Rep max cannot be below rep min.',
    );
    expect(describeMutationError(new Error('targetSets: below-minimum'), 'Fallback.')).toBe(
      'That value is below the minimum for this field.',
    );
    expect(describeMutationError(new Error('targetRestSeconds: negative'), 'Fallback.')).toBe(
      'That value cannot be negative.',
    );
  });

  // WR-06's code: the value the user typed is valid, the conflict is with a cycle they are not
  // looking at, so the message has to say where to go.
  it('explains a cycle conflict rather than blaming the field being edited', () => {
    const message = describeMutationError(new Error('targetRepMin: cycle-conflict'), 'Fallback.');

    expect(message).toContain('cycle');
    expect(message).not.toContain('cycle-conflict');
  });

  it('never leaks a raw code or a field name to the user', () => {
    const codes = ['min-above-max', 'below-minimum', 'negative', 'cycle-conflict', 'whole-number', 'not-a-number'];
    for (const code of codes) {
      const raw = `targetSets: ${code}`;
      const message = describeMutationError(new Error(raw), 'Fallback.');

      expect(message).not.toBe(raw);
      expect(message).not.toContain('targetSets');
      // A hyphenated identifier surviving into the sentence is the tell that the code was passed
      // through verbatim — the word "negative" on its own is legitimate prose.
      expect(message).not.toMatch(/[a-z]+-[a-z]+/);
      expect(message).not.toBe('Fallback.');
    }
  });

  it('falls back for an error it does not recognise, rather than showing a stack trace', () => {
    expect(describeMutationError(new Error('SQLITE_BUSY: database is locked'), 'Fallback.')).toBe('Fallback.');
    expect(describeMutationError(new Error(''), 'Fallback.')).toBe('Fallback.');
    expect(describeMutationError(undefined, 'Fallback.')).toBe('Fallback.');
    expect(describeMutationError('a string', 'Fallback.')).toBe('Fallback.');
  });

  it('reads the code from the last separator, so a message containing a colon still resolves', () => {
    expect(describeMutationError(new Error('slot rex-1: targetRepMax: min-above-max'), 'Fallback.')).toBe(
      'Rep max cannot be below rep min.',
    );
  });
});
