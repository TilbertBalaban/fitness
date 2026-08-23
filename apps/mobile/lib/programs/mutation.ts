// Every program mutation goes through runMutation. Two distinct problems it closes, both from
// WR-11: the handlers that did catch terminated at console.error, so a failed write showed the user
// nothing and the next tree reload silently reverted their edit; the handlers that did not catch
// were async functions handed straight to onPress, so a rejection was an unhandled promise
// rejection. runMutation never rejects, which makes the second class unrepresentable at the source.

export interface MutationOutcome {
  ok: boolean;
  message: string | null;
}

// The write layer throws internal codes (`targetRepMax: cycle-conflict`), not sentences — deliberately,
// since validateTargets is shared and has no view. This is the one place those become something a
// user can read. An unrecognised failure falls back to the caller's description of what did not
// happen, which is more useful than a stack trace and more honest than pretending it succeeded.
const TARGET_CODE_MESSAGES: Record<string, string> = {
  'below-minimum': 'That value is below the minimum for this field.',
  'min-above-max': 'Rep max cannot be below rep min.',
  negative: 'That value cannot be negative.',
  'whole-number': 'That value has to be a whole number.',
  'not-a-number': 'That value has to be a number.',
  'cycle-conflict':
    'This change would leave a cycle with a rep max below its rep min. Change that cycle first.',
};

export function describeMutationError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : '';
  const code = raw.includes(': ') ? raw.slice(raw.lastIndexOf(': ') + 2) : raw;
  return TARGET_CODE_MESSAGES[code] ?? fallback;
}

export async function runMutation(action: () => Promise<unknown>, fallback: string): Promise<MutationOutcome> {
  try {
    await action();
    return { ok: true, message: null };
  } catch (error) {
    // Kept alongside the surfaced message rather than replacing it: the banner is for the user, the
    // log is for whoever has to reproduce it.
    console.error(fallback, error);
    return { ok: false, message: describeMutationError(error, fallback) };
  }
}
