export type AuthOutcome = 'ok' | 'offline' | 'revoked' | 'rejected';

// The one reason string a completed 401/403 body can carry to mean "the server actually revoked
// this session" (D-01's escape hatch), as opposed to a captive portal's 401 or a stale/malformed
// request. No server route emits this yet in Phase 1 — the threat register's T-01-06 mitigation
// depends on this branch existing before the emitter does, not on the emitter existing first.
export const SESSION_REVOKED_REASON = 'session_revoked';

// Bounds the web cold-start wait (Task 2, UI-SPEC "Session & Loading States" / rule R2).
export const WEB_SESSION_RESOLVE_BUDGET_MS = 3000;

const OFFLINE_STATUSES = new Set([500, 502, 503, 504]);
const AUTH_REJECTION_STATUSES = new Set([401, 403]);

interface ResponseLike {
  status: number;
  json: () => Promise<unknown>;
  clone?: () => ResponseLike;
}

function isResponseLike(value: unknown): value is ResponseLike {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as ResponseLike).status === 'number' &&
    typeof (value as ResponseLike).json === 'function'
  );
}

async function carriesRevocationReason(response: ResponseLike): Promise<boolean> {
  try {
    const readable = response.clone ? response.clone() : response;
    const body: unknown = await readable.json();
    return !!body && typeof body === 'object' && (body as { reason?: unknown }).reason === SESSION_REVOKED_REASON;
  } catch {
    return false;
  }
}

// The two categories below are structurally separate arms, not two conditions inside one arm: a
// thrown error, an aborted request, and a completed 5xx all reach the `offline` arm; a completed
// 401/403 whose body carries SESSION_REVOKED_REASON reaches the `revoked` arm; every other
// completed non-2xx reaches `rejected`. Only the `revoked` arm may ever end a session (D-01/D-03).
export async function classifyAuthOutcome(result: unknown): Promise<AuthOutcome> {
  if (!isResponseLike(result)) {
    return 'offline';
  }

  const { status } = result;
  if (status >= 200 && status < 300) return 'ok';
  if (OFFLINE_STATUSES.has(status)) return 'offline';
  if (AUTH_REJECTION_STATUSES.has(status) && (await carriesRevocationReason(result))) {
    return 'revoked';
  }
  return 'rejected';
}

async function authoritativelyReportsNoSession(response: ResponseLike): Promise<boolean> {
  try {
    const readable = response.clone ? response.clone() : response;
    const body: unknown = await readable.json();
    if (body === null) return true;
    return typeof body === 'object' && !(body as { user?: unknown }).user;
  } catch {
    return false;
  }
}

// Wraps classifyAuthOutcome for the one call site whose entire purpose is asking "is this session
// still valid": the background revocation probe. Better Auth's get-session route answers an unknown
// or deleted session with a 200 and a null body, not a 401 — classifyAuthOutcome alone can never see
// that as anything but `ok`. presentedCredential is load-bearing, not decoration: without it, a
// device whose secure-storage read momentarily failed would send no credential, get the server's
// ordinary "nobody is signed in" answer, and be signed out for a local storage hiccup, which D-01
// forbids. classifyAuthOutcome itself is deliberately left unchanged — "the server says nobody is
// signed in" is only evidence of revocation on this one probe endpoint, not for any other 200 in
// the app.
export async function classifySessionProbe(
  result: unknown,
  presentedCredential: boolean,
): Promise<AuthOutcome> {
  const outcome = await classifyAuthOutcome(result);
  if (outcome !== 'ok' || !presentedCredential || !isResponseLike(result)) {
    return outcome;
  }
  return (await authoritativelyReportsNoSession(result)) ? 'revoked' : outcome;
}

export function isRevocation(outcome: AuthOutcome): boolean {
  return outcome === 'revoked';
}
